package com.unimote.app.atv

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Assume.assumeTrue
import org.junit.Test

/**
 * End-to-end against tools/fake_android_tv.py, which speaks the real protocol. Skipped unless it is running:
 *   python3 tools/fake_android_tv.py --pair-port 16467 --api-port 16466 --code-file $F/code --keys-file $F/keys
 *   ATV_FAKE_DIR=$F ./gradlew :app:testDebugUnitTest --tests '*AtvLiveTest'
 */
class AtvLiveTest {
  private val dir = System.getenv("ATV_FAKE_DIR")?.let { File(it) }

  private fun waitFor(file: File, ms: Long = 3000): String {
    val end = System.currentTimeMillis() + ms
    while (System.currentTimeMillis() < end) {
      if (file.exists() && file.readText().isNotBlank()) return file.readText().trim()
      Thread.sleep(50)
    }
    fail("timed out waiting for ${file.name}"); return ""
  }

  @Test fun pairsThenSendsKeys() {
    assumeTrue("set ATV_FAKE_DIR and start the fake TV", dir != null)
    val d = dir!!
    File(d, "code").delete(); File(d, "keys").delete()
    val identity = AtvIdentity.create()

    // Not paired yet: the TV must refuse the remote connection.
    try {
      AtvRemote(identity, "127.0.0.1", 16466).connect(1500)
      fail("an unpaired phone must be refused")
    } catch (e: AtvException) {
      assertEquals("not_paired", e.code)
    }

    val pairing = AtvPairing(identity, "127.0.0.1", 16467)
    pairing.start("Unimote test")
    val code = waitFor(File(d, "code"))

    // A wrong code is rejected without ever reaching the TV.
    try {
      pairing.finish(if (code.startsWith("00")) "FF0000" else "000000")
      fail("a wrong code must fail")
    } catch (e: AtvException) {
      assertEquals("bad_code", e.code)
    }

    File(d, "code").delete()
    pairing.start("Unimote test")
    pairing.finish(waitFor(File(d, "code")))

    val remote = AtvRemote(identity, "127.0.0.1", 16466)
    remote.connect()
    remote.sendKey(26)
    remote.sendKey(24)
    remote.sendKey(164, AtvProto.DIRECTION_START_LONG)
    val keys = waitFor(File(d, "keys"))
    Thread.sleep(300)
    assertEquals(listOf("KEYCODE_POWER SHORT", "KEYCODE_VOLUME_UP SHORT", "KEYCODE_VOLUME_MUTE START_LONG"), File(d, "keys").readLines())
    assertTrue(keys.isNotEmpty())
    remote.close()
    try { remote.sendKey(26); fail("sending on a closed remote must fail") } catch (e: AtvException) { assertEquals("unreachable", e.code) }
  }
}
