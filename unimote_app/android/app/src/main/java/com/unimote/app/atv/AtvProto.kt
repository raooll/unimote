package com.unimote.app.atv

import java.io.ByteArrayOutputStream
import java.io.InputStream

/**
 * Android TV / Google TV "Remote v2" wire format (polo pairing + remote messages), hand-rolled because the messages
 * are tiny. Field numbers come from the protobuf definitions used by Google's own remote and verified byte for byte
 * against the open-source androidtvremote2 client (see AtvProtoTest).
 */
object AtvProto {
  const val PROTOCOL_VERSION = 2L
  const val STATUS_OK = 200L
  const val DIRECTION_SHORT = 3
  const val DIRECTION_START_LONG = 1
  const val DIRECTION_END_LONG = 2

  /** PING | KEY | POWER | VOLUME | APP_LINK, what a plain remote asks for. */
  const val FEATURES = 611L

  private const val MAX_FRAME = 1 shl 20

  // ---- writer ----------------------------------------------------------------------------------------------

  class Writer {
    private val out = ByteArrayOutputStream()
    private fun rawVarint(value: Long) {
      var v = value
      while (v and 0x7F.inv().toLong() != 0L) {
        out.write(((v and 0x7F) or 0x80).toInt())
        v = v ushr 7
      }
      out.write(v.toInt())
    }
    fun uint(field: Int, value: Long): Writer = apply { rawVarint((field shl 3).toLong()); rawVarint(value) }
    fun bytes(field: Int, value: ByteArray): Writer = apply { rawVarint(((field shl 3) or 2).toLong()); rawVarint(value.size.toLong()); out.write(value) }
    fun str(field: Int, value: String): Writer = bytes(field, value.toByteArray(Charsets.UTF_8))
    fun msg(field: Int, build: Writer.() -> Unit): Writer = bytes(field, Writer().apply(build).toBytes())
    fun toBytes(): ByteArray = out.toByteArray()
  }

  /** Length-delimited framing used on both sockets. */
  fun frame(body: ByteArray): ByteArray = Writer().let {
    val out = ByteArrayOutputStream()
    var v = body.size.toLong()
    while (v and 0x7F.inv().toLong() != 0L) { out.write(((v and 0x7F) or 0x80).toInt()); v = v ushr 7 }
    out.write(v.toInt())
    out.write(body)
    out.toByteArray()
  }

  // ---- pairing (port 6467) -------------------------------------------------------------------------------------

  private fun outer(build: Writer.() -> Unit): ByteArray =
      Writer().uint(1, PROTOCOL_VERSION).uint(2, STATUS_OK).apply(build).toBytes()

  private fun Writer.hexEncoding(field: Int) = msg(field) { uint(1, 3); uint(2, 6) } // HEXADECIMAL, 6 symbols

  fun pairingRequest(clientName: String) = outer { msg(10) { str(1, "atvremote"); str(2, clientName) } }
  fun pairingOptions() = outer { msg(20) { hexEncoding(1); uint(3, 1) } } // preferred role: INPUT
  fun pairingConfiguration() = outer { msg(30) { hexEncoding(1); uint(2, 1) } }
  fun pairingSecret(secret: ByteArray) = outer { msg(40) { bytes(1, secret) } }

  enum class PairingReply { REQUEST_ACK, OPTIONS, CONFIGURATION_ACK, SECRET_ACK, OTHER }
  data class Pairing(val status: Long, val kind: PairingReply)

  fun parsePairing(body: ByteArray): Pairing {
    val f = fields(body)
    val kind = when {
      f.containsKey(11) -> PairingReply.REQUEST_ACK
      f.containsKey(20) -> PairingReply.OPTIONS
      f.containsKey(31) -> PairingReply.CONFIGURATION_ACK
      f.containsKey(41) -> PairingReply.SECRET_ACK
      else -> PairingReply.OTHER
    }
    return Pairing(f[2]?.varint ?: 0, kind)
  }

  // ---- remote (port 6466) --------------------------------------------------------------------------------------

  fun remoteConfigureReply(features: Long = FEATURES) = Writer().msg(1) {
    uint(1, features)
    msg(2) { uint(3, 1); str(4, "1"); str(5, "atvremote"); str(6, "1.0.0") }
  }.toBytes()

  fun remoteSetActive(features: Long = FEATURES) = Writer().msg(2) { uint(1, features) }.toBytes()
  fun pingResponse(value: Long) = Writer().msg(9) { uint(1, value) }.toBytes()
  fun keyInject(keyCode: Int, direction: Int = DIRECTION_SHORT) = Writer().msg(10) { uint(1, keyCode.toLong()); uint(2, direction.toLong()) }.toBytes()

  sealed class Remote {
    data class Configure(val features: Long) : Remote()
    object SetActive : Remote()
    data class Ping(val value: Long) : Remote()
    data class Start(val started: Boolean) : Remote()
    object Error : Remote()
    object Other : Remote()
  }

  fun parseRemote(body: ByteArray): Remote {
    val f = fields(body)
    return when {
      f.containsKey(1) -> Remote.Configure(fields(f[1]!!.bytes)[1]?.varint ?: 0)
      f.containsKey(2) -> Remote.SetActive
      f.containsKey(3) -> Remote.Error
      f.containsKey(8) -> Remote.Ping(fields(f[8]!!.bytes)[1]?.varint ?: 0)
      f.containsKey(40) -> Remote.Start(fields(f[40]!!.bytes)[1]?.varint == 1L)
      else -> Remote.Other
    }
  }

  // ---- reading ----------------------------------------------------------------------------------------------

  class Value(val varint: Long, val bytes: ByteArray)

  /** Top-level fields of a message (the last occurrence wins; none of ours repeat). Malformed input yields what parsed so far. */
  fun fields(body: ByteArray): Map<Int, Value> {
    val out = HashMap<Int, Value>()
    var i = 0
    fun varint(): Long? {
      var shift = 0
      var result = 0L
      while (i < body.size && shift < 64) {
        val b = body[i++].toInt() and 0xFF
        result = result or ((b and 0x7F).toLong() shl shift)
        if (b and 0x80 == 0) return result
        shift += 7
      }
      return null
    }
    while (i < body.size) {
      val key = varint() ?: break
      val field = (key ushr 3).toInt()
      when ((key and 7).toInt()) {
        0 -> out[field] = Value(varint() ?: break, ByteArray(0))
        2 -> {
          val len = (varint() ?: break).toInt()
          if (len < 0 || i + len > body.size) break
          out[field] = Value(0, body.copyOfRange(i, i + len))
          i += len
        }
        1 -> i += 8
        5 -> i += 4
        else -> break
      }
    }
    return out
  }

  /** Reads one length-prefixed frame; null at end of stream. */
  fun readFrame(input: InputStream): ByteArray? {
    var shift = 0
    var length = 0L
    while (true) {
      val b = input.read()
      if (b < 0) return null
      length = length or ((b and 0x7F).toLong() shl shift)
      if (b and 0x80 == 0) break
      shift += 7
      if (shift > 28) throw IllegalStateException("bad frame length")
    }
    if (length < 0 || length > MAX_FRAME) throw IllegalStateException("frame too large")
    val buf = ByteArray(length.toInt())
    var read = 0
    while (read < buf.size) {
      val n = input.read(buf, read, buf.size - read)
      if (n < 0) return null
      read += n
    }
    return buf
  }
}
