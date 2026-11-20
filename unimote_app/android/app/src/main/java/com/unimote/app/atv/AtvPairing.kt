package com.unimote.app.atv

import java.io.Closeable
import java.security.cert.X509Certificate
import java.security.interfaces.RSAPublicKey
import javax.net.ssl.SSLSocket

/**
 * One pairing attempt with a TV (port 6467). `start` makes the TV show a 6-digit code; `finish` proves we typed it.
 * The TV then remembers our certificate, and the remote connection (port 6466) is allowed in.
 */
class AtvPairing(private val identity: AtvIdentity, private val host: String, private val port: Int = 6467) : Closeable {
  private var socket: SSLSocket? = null

  fun start(clientName: String) {
    close()
    val s = AtvTls.connect(identity, host, port)
    socket = s
    try {
      send(AtvProto.pairingRequest(clientName)); expect(AtvProto.PairingReply.REQUEST_ACK)
      send(AtvProto.pairingOptions()); expect(AtvProto.PairingReply.OPTIONS)
      send(AtvProto.pairingConfiguration()); expect(AtvProto.PairingReply.CONFIGURATION_ACK)
    } catch (e: Exception) {
      close()
      throw if (e is AtvException) e else AtvException("unreachable", "The TV stopped answering while pairing.", e)
    }
  }

  fun finish(code: String) {
    val s = socket ?: throw AtvException("error", "Start pairing first.")
    val server = s.session.peerCertificates.firstOrNull() as? X509Certificate ?: throw AtvException("error", "The TV did not present a certificate.")
    val client = identity.certificate.publicKey as RSAPublicKey
    val serverKey = server.publicKey as? RSAPublicKey ?: throw AtvException("error", "Unsupported TV certificate.")
    val secret = AtvSecret.compute(client.modulus, client.publicExponent, serverKey.modulus, serverKey.publicExponent, code)
        ?: throw AtvException("bad_code", "That code isn't right. Check the code on the TV and try again.")
    try {
      send(AtvProto.pairingSecret(secret))
      expect(AtvProto.PairingReply.SECRET_ACK)
    } catch (e: AtvException) {
      throw if (e.code == "pairing_rejected") AtvException("bad_code", "The TV rejected that code.", e) else e
    } catch (e: Exception) {
      throw AtvException("unreachable", "The TV stopped answering while pairing.", e)
    } finally {
      close()
    }
  }

  private fun send(body: ByteArray) {
    val out = socket!!.outputStream
    out.write(AtvProto.frame(body))
    out.flush()
  }

  private fun expect(kind: AtvProto.PairingReply) {
    val body = AtvProto.readFrame(socket!!.inputStream) ?: throw AtvException("unreachable", "The TV closed the connection.")
    val reply = AtvProto.parsePairing(body)
    if (reply.status != AtvProto.STATUS_OK) throw AtvException("pairing_rejected", "The TV refused pairing (status ${reply.status}).")
    if (reply.kind != kind) throw AtvException("error", "Unexpected answer from the TV while pairing.")
  }

  override fun close() {
    try { socket?.close() } catch (_: Exception) {}
    socket = null
  }
}
