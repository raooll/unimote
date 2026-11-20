package com.unimote.app.atv

import java.math.BigInteger
import java.security.MessageDigest

/** The pairing proof: SHA-256 over both certificates' RSA public numbers and the last 4 hex digits of the TV's code. */
object AtvSecret {
  /** Big-endian magnitude without a sign byte (what a TV hashes). */
  fun magnitude(v: BigInteger): ByteArray = v.toByteArray().let { if (it.size > 1 && it[0] == 0.toByte()) it.copyOfRange(1, it.size) else it }

  /** Null when the code is not 6 hex digits or its first byte does not match the hash (a mistyped code). */
  fun compute(clientN: BigInteger, clientE: BigInteger, serverN: BigInteger, serverE: BigInteger, code: String): ByteArray? {
    val clean = code.trim()
    if (clean.length != 6 || !clean.all { it.isDigit() || it.lowercaseChar() in 'a'..'f' }) return null
    val digest = MessageDigest.getInstance("SHA-256").apply {
      update(magnitude(clientN)); update(magnitude(clientE)); update(magnitude(serverN)); update(magnitude(serverE))
      update(clean.substring(2).chunked(2).map { it.toInt(16).toByte() }.toByteArray())
    }.digest()
    return if ((digest[0].toInt() and 0xFF) == clean.substring(0, 2).toInt(16)) digest else null
  }
}
