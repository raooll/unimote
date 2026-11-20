package com.unimote.app.atv

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.math.BigInteger
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.Signature
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.security.interfaces.RSAPrivateKey
import java.text.SimpleDateFormat
import java.util.Date
import java.util.TimeZone

/**
 * This phone's identity towards Android TVs: one RSA key + self-signed certificate, created on first use and kept
 * in the app's private storage. A TV remembers the certificate it paired with, so it must survive restarts.
 */
class AtvIdentity(val key: RSAPrivateKey, val certificate: X509Certificate) {

  fun keyStore(): KeyStore = KeyStore.getInstance("PKCS12").apply {
    load(null, null)
    setKeyEntry("atv", key, PASSWORD, arrayOf(certificate))
  }

  companion object {
    val PASSWORD = "unimote".toCharArray()

    fun loadOrCreate(file: File): AtvIdentity {
      if (file.exists()) {
        try {
          val ks = KeyStore.getInstance("PKCS12").apply { file.inputStream().use { load(it, PASSWORD) } }
          return AtvIdentity(ks.getKey("atv", PASSWORD) as RSAPrivateKey, ks.getCertificate("atv") as X509Certificate)
        } catch (_: Exception) {
          file.delete() // unreadable: make a new one (the TVs will ask to pair again)
        }
      }
      return create().also { id -> file.outputStream().use { id.keyStore().store(it, PASSWORD) } }
    }

    fun create(): AtvIdentity {
      val pair = KeyPairGenerator.getInstance("RSA").apply { initialize(2048) }.generateKeyPair()
      return AtvIdentity(pair.private as RSAPrivateKey, selfSigned("unimote", pair))
    }

    // ---- minimal DER writer for a self-signed X.509 certificate (no extensions) ----------------------------------

    private fun tlv(tag: Int, content: ByteArray): ByteArray {
      val out = ByteArrayOutputStream()
      out.write(tag)
      val n = content.size
      when {
        n < 0x80 -> out.write(n)
        n < 0x100 -> { out.write(0x81); out.write(n) }
        n < 0x10000 -> { out.write(0x82); out.write(n shr 8); out.write(n and 0xFF) }
        else -> { out.write(0x83); out.write(n shr 16); out.write((n shr 8) and 0xFF); out.write(n and 0xFF) }
      }
      out.write(content)
      return out.toByteArray()
    }
    private fun seq(vararg parts: ByteArray) = tlv(0x30, parts.fold(ByteArray(0)) { a, b -> a + b })

    private fun utcTime(d: Date): ByteArray =
        tlv(0x17, SimpleDateFormat("yyMMddHHmmss'Z'").apply { timeZone = TimeZone.getTimeZone("UTC") }.format(d).toByteArray())

    fun selfSigned(commonName: String, pair: KeyPair, now: Date = Date()): X509Certificate {
      val sha256WithRsa = seq(tlv(0x06, byteArrayOf(0x2A, 0x86.toByte(), 0x48, 0x86.toByte(), 0xF7.toByte(), 0x0D, 0x01, 0x01, 0x0B)), tlv(0x05, ByteArray(0)))
      val name = seq(tlv(0x31, seq(tlv(0x06, byteArrayOf(0x55, 0x04, 0x03)), tlv(0x0C, commonName.toByteArray()))))
      val tenYears = Date(now.time + 10L * 365 * 24 * 3600 * 1000)
      val tbs = seq(
          tlv(0xA0, tlv(0x02, byteArrayOf(2))), // version 3
          tlv(0x02, BigInteger.valueOf(1000).toByteArray()),
          sha256WithRsa,
          name,
          seq(utcTime(Date(now.time - 24 * 3600 * 1000)), utcTime(tenYears)),
          name,
          pair.public.encoded, // SubjectPublicKeyInfo
      )
      val signature = Signature.getInstance("SHA256withRSA").apply { initSign(pair.private); update(tbs) }.sign()
      val der = seq(tbs, sha256WithRsa, tlv(0x03, byteArrayOf(0) + signature))
      return CertificateFactory.getInstance("X.509").generateCertificate(ByteArrayInputStream(der)) as X509Certificate
    }
  }
}
