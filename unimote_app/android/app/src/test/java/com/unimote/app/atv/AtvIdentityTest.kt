package com.unimote.app.atv

import java.io.File
import java.security.interfaces.RSAPublicKey
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AtvIdentityTest {
  @Test fun createsAValidSelfSignedRsa2048Certificate() {
    val id = AtvIdentity.create()
    val cert = id.certificate
    cert.verify(cert.publicKey) // signature is valid and made by its own key
    cert.checkValidity()
    assertEquals(2048, (cert.publicKey as RSAPublicKey).modulus.bitLength())
    assertEquals("CN=unimote", cert.subjectX500Principal.name)
    assertEquals(cert.subjectX500Principal, cert.issuerX500Principal)
    assertEquals("SHA256withRSA", cert.sigAlgName)
  }

  @Test fun keepsTheSameIdentityAcrossRestarts() {
    val file = File.createTempFile("atv", ".p12").apply { delete() }
    try {
      val first = AtvIdentity.loadOrCreate(file)
      val second = AtvIdentity.loadOrCreate(file)
      assertEquals(first.certificate, second.certificate)
      assertTrue(file.length() > 0)
    } finally {
      file.delete()
    }
  }

  @Test fun replacesAnUnreadableFile() {
    val file = File.createTempFile("atv", ".p12").apply { writeBytes(byteArrayOf(1, 2, 3)) }
    try {
      AtvIdentity.loadOrCreate(file).certificate.checkValidity()
    } finally {
      file.delete()
    }
  }
}
