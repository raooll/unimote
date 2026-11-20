package com.unimote.app.hub

import javax.crypto.Cipher
import javax.crypto.spec.IvParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * Packet building for Broadlink RM-series IR hubs (local UDP protocol, port 80).
 * Pure functions so they can be unit-tested on the JVM. NOT yet verified against real hardware.
 */
object Broadlink {
  val DEFAULT_KEY = intArrayOf(0x09, 0x76, 0x28, 0x34, 0x3f, 0xe9, 0x9e, 0x23, 0x76, 0x5c, 0x15, 0x13, 0xac, 0xcf, 0x8b, 0x02).map { it.toByte() }.toByteArray()
  val IV = intArrayOf(0x56, 0x2e, 0x17, 0x99, 0x6d, 0x09, 0x3d, 0x28, 0xdd, 0xb3, 0xba, 0x69, 0x5a, 0x2e, 0x6f, 0x58).map { it.toByte() }.toByteArray()
  private val MAGIC = intArrayOf(0x5a, 0xa5, 0xaa, 0x55, 0x5a, 0xa5, 0xaa, 0x55).map { it.toByte() }.toByteArray()

  const val CMD_AUTH = 0x65
  const val CMD_SEND = 0x6a
  const val TICK_US = 8192.0 / 269.0

  fun checksum(bytes: ByteArray): Int = (0xbeaf + bytes.sumOf { it.toInt() and 0xff }) and 0xffff

  fun aes(data: ByteArray, key: ByteArray, encrypt: Boolean): ByteArray {
    val c = Cipher.getInstance("AES/CBC/NoPadding")
    c.init(if (encrypt) Cipher.ENCRYPT_MODE else Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), IvParameterSpec(IV))
    return c.doFinal(data)
  }

  fun pad16(data: ByteArray): ByteArray = if (data.size % 16 == 0) data else data.copyOf(data.size + 16 - data.size % 16)

  /** UDP discovery probe broadcast to 255.255.255.255:80. */
  fun hello(localPort: Int): ByteArray {
    val p = ByteArray(0x30)
    p[0x1c] = (localPort and 0xff).toByte(); p[0x1d] = (localPort shr 8).toByte()
    p[0x26] = 6
    val sum = checksum(p)
    p[0x20] = (sum and 0xff).toByte(); p[0x21] = (sum shr 8).toByte()
    return p
  }

  class Device(val host: String, val mac: ByteArray, val devType: Int)

  /** Parses a discovery reply; returns null if it is too short. `mac` is stored in the order used in packets. */
  fun parseHelloReply(host: String, reply: ByteArray): Device? {
    if (reply.size < 0x40) return null
    val devType = (reply[0x34].toInt() and 0xff) or ((reply[0x35].toInt() and 0xff) shl 8)
    val mac = ByteArray(6) { reply[0x3a + it] }
    return Device(host, mac, devType)
  }

  fun macToString(mac: ByteArray) = mac.reversed().joinToString(":") { "%02x".format(it) }

  fun macFromString(s: String): ByteArray = s.split(":").map { it.toInt(16).toByte() }.reversed().toByteArray()

  /** Builds a full command packet (0x38 byte header + encrypted payload). */
  fun packet(command: Int, payload: ByteArray, devType: Int, mac: ByteArray, count: Int, id: ByteArray, key: ByteArray): ByteArray {
    val header = ByteArray(0x38)
    MAGIC.copyInto(header)
    header[0x24] = (devType and 0xff).toByte(); header[0x25] = (devType shr 8).toByte()
    header[0x26] = command.toByte()
    header[0x28] = (count and 0xff).toByte(); header[0x29] = (count shr 8).toByte()
    mac.copyInto(header, 0x2a)
    id.copyInto(header, 0x30)
    val padded = pad16(payload)
    val pc = checksum(padded)
    header[0x34] = (pc and 0xff).toByte(); header[0x35] = (pc shr 8).toByte()
    val full = header + aes(padded, key, true)
    val fc = checksum(full)
    full[0x20] = (fc and 0xff).toByte(); full[0x21] = (fc shr 8).toByte()
    return full
  }

  fun authPayload(): ByteArray {
    val p = ByteArray(0x50)
    for (i in 0x04..0x12) p[i] = 0x31
    p[0x1e] = 1; p[0x2d] = 1
    "Test 1".toByteArray().copyInto(p, 0x30)
    return p
  }

  /** Decrypts the payload of a reply (bytes from 0x38). */
  fun replyPayload(reply: ByteArray, key: ByteArray): ByteArray? {
    if (reply.size < 0x38 + 16) return null
    val err = (reply[0x22].toInt() and 0xff) or ((reply[0x23].toInt() and 0xff) shl 8)
    if (err != 0) return null
    val enc = reply.copyOfRange(0x38, 0x38 + ((reply.size - 0x38) / 16) * 16)
    return aes(enc, key, false)
  }

  /** Converts mark/space microsecond durations to Broadlink's IR payload (0x26 ... 0x0d05). */
  fun irData(patternUs: List<Int>, repeat: Int = 0): ByteArray {
    val body = ArrayList<Byte>()
    for (us in patternUs) {
      val ticks = Math.round(us * 269.0 / 8192.0).toInt().coerceAtLeast(1)
      if (ticks > 255) { body.add(0); body.add((ticks shr 8).toByte()); body.add((ticks and 0xff).toByte()) } else body.add(ticks.toByte())
    }
    body.add(0x0d); body.add(0x05) // end-of-signal marker
    val len = body.size
    return byteArrayOf(0x26, repeat.toByte(), (len and 0xff).toByte(), (len shr 8).toByte()) + body.toByteArray()
  }

  /** `send` command payload: 4 byte header + IR data. */
  fun sendPayload(patternUs: List<Int>): ByteArray = byteArrayOf(2, 0, 0, 0) + irData(patternUs)

  /** Payload that puts the hub into IR learning mode. */
  fun enterLearningPayload(): ByteArray = ByteArray(16).also { it[0] = 3 }

  /** Payload that asks the hub whether it has captured a signal yet. */
  fun checkDataPayload(): ByteArray = ByteArray(16).also { it[0] = 4 }

  /**
   * Decodes a Broadlink IR blob (0x26, repeat, len LE, pulses..., 0x0d 0x05) into microsecond durations.
   * Returns null when the blob is not an IR capture. The trailing 0x0d05 end marker is dropped.
   */
  fun decodeIr(data: ByteArray): List<Int>? {
    if (data.size < 6 || data[0] != 0x26.toByte()) return null
    val declared = (data[2].toInt() and 0xff) or ((data[3].toInt() and 0xff) shl 8)
    val end = minOf(data.size, 4 + declared)
    val out = ArrayList<Int>()
    var i = 4
    while (i < end) {
      val b = data[i].toInt() and 0xff
      val ticks = if (b == 0) {
        if (i + 2 >= data.size) return null // truncated 3-byte duration
        val t = ((data[i + 1].toInt() and 0xff) shl 8) or (data[i + 2].toInt() and 0xff)
        i += 3
        t
      } else { i += 1; b }
      out.add(Math.round(ticks * TICK_US).toInt())
    }
    // The 0x0d 0x05 end marker decodes as two tiny durations (13 and 5 ticks); drop them.
    if (out.size >= 2 && out[out.size - 2] == Math.round(0x0d * TICK_US).toInt() && out.last() == Math.round(0x05 * TICK_US).toInt()) {
      out.removeAt(out.size - 1); out.removeAt(out.size - 1)
    }
    return if (out.size >= 2) out else null
  }
}
