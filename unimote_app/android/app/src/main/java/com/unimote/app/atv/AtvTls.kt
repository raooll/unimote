package com.unimote.app.atv

import java.net.InetSocketAddress
import java.security.KeyStore
import java.security.cert.X509Certificate
import javax.net.ssl.KeyManagerFactory
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocket
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager

/** Raised for anything a user could act on; `code` is passed to JS (unreachable, not_paired, bad_code, ...). */
class AtvException(val code: String, message: String, cause: Throwable? = null) : Exception(message, cause)

object AtvTls {
  /**
   * TVs present a self-signed certificate, so the server cannot be verified by a trust chain. Pairing is what
   * authenticates it: the 6-digit code is derived from both certificates, so a wrong TV cannot produce it.
   */
  private val trustAll = object : X509TrustManager {
    override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) {}
    override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {}
    override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
  }

  fun context(identity: AtvIdentity): SSLContext {
    val kmf = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm())
    kmf.init(identity.keyStore() as KeyStore, AtvIdentity.PASSWORD)
    return SSLContext.getInstance("TLS").apply { init(kmf.keyManagers, arrayOf<TrustManager>(trustAll), null) }
  }

  fun connect(identity: AtvIdentity, host: String, port: Int, connectTimeoutMs: Int = 5000, readTimeoutMs: Int = 15000): SSLSocket {
    try {
      val socket = context(identity).socketFactory.createSocket() as SSLSocket
      try {
        socket.connect(InetSocketAddress(host, port), connectTimeoutMs)
        socket.soTimeout = readTimeoutMs
        socket.startHandshake()
        return socket
      } catch (e: Exception) {
        socket.close()
        throw e
      }
    } catch (e: AtvException) {
      throw e
    } catch (e: Exception) {
      throw AtvException("unreachable", "Can't reach the TV. Is it on, and on the same Wi-Fi?", e)
    }
  }
}
