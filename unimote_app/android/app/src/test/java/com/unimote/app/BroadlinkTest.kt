package com.unimote.app

import com.unimote.app.hub.Broadlink
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class BroadlinkTest {
  @Test fun `short durations become one tick byte, long ones three bytes`() {
    val d = Broadlink.irData(listOf(9000, 4500, 560, 40000))
    assertEquals(0x26.toByte(), d[0])
    // 9000us -> 296 ticks (>255): 00 01 28 ; 4500us -> 148 ; 560us -> 18 ; 40000us -> 1313 ticks: 00 05 21
    val body = d.copyOfRange(4, d.size)
    assertArrayEquals(byteArrayOf(0, 0x01, 0x28, 148.toByte(), 18, 0, 0x05, 0x21, 0x0d, 0x05), body)
    assertEquals(body.size, (d[2].toInt() and 0xff) or ((d[3].toInt() and 0xff) shl 8))
  }

  @Test fun `checksum is 0xbeaf plus byte sum`() =
      assertEquals(0xbeaf + 6, Broadlink.checksum(byteArrayOf(1, 2, 3)))

  @Test fun `aes round trips and padding is a multiple of 16`() {
    val data = Broadlink.pad16(ByteArray(21) { it.toByte() })
    assertEquals(32, data.size)
    val enc = Broadlink.aes(data, Broadlink.DEFAULT_KEY, true)
    assertEquals(32, enc.size)
    assertArrayEquals(data, Broadlink.aes(enc, Broadlink.DEFAULT_KEY, false))
  }

  @Test fun `command packet header carries magic, command, mac, id and valid checksums`() {
    val mac = byteArrayOf(1, 2, 3, 4, 5, 6)
    val id = byteArrayOf(9, 8, 7, 6)
    val pkt = Broadlink.packet(Broadlink.CMD_SEND, Broadlink.sendPayload(listOf(500, 500)), 0x2712, mac, 0x8002, id, Broadlink.DEFAULT_KEY)
    assertEquals(0x5a.toByte(), pkt[0]); assertEquals(0x55.toByte(), pkt[7])
    assertEquals(0x6a.toByte(), pkt[0x26])
    assertArrayEquals(mac, pkt.copyOfRange(0x2a, 0x30))
    assertArrayEquals(id, pkt.copyOfRange(0x30, 0x34))
    assertEquals(0, (pkt.size - 0x38) % 16)
    // whole-packet checksum must verify with its own field zeroed
    val stored = (pkt[0x20].toInt() and 0xff) or ((pkt[0x21].toInt() and 0xff) shl 8)
    val zeroed = pkt.copyOf().also { it[0x20] = 0; it[0x21] = 0 }
    assertEquals(Broadlink.checksum(zeroed), stored)
  }

  @Test fun `mac string conversion round trips`() {
    val mac = Broadlink.macFromString("a1:b2:c3:d4:e5:f6")
    assertEquals(0xf6.toByte(), mac[0])
    assertEquals("a1:b2:c3:d4:e5:f6", Broadlink.macToString(mac))
  }

  @Test fun `hello probe and reply parsing`() {
    val hello = Broadlink.hello(5000)
    assertEquals(0x30, hello.size); assertEquals(6.toByte(), hello[0x26])
    assertNull(Broadlink.parseHelloReply("1.2.3.4", ByteArray(10)))
    val reply = ByteArray(0x40).also { it[0x34] = 0x2a; it[0x35] = 0x27; for (i in 0..5) it[0x3a + i] = (i + 1).toByte() }
    val d = Broadlink.parseHelloReply("1.2.3.4", reply)
    assertNotNull(d); assertEquals(0x272a, d!!.devType); assertEquals("06:05:04:03:02:01", Broadlink.macToString(d.mac))
  }

  @Test fun `reply payload is rejected on an error code`() {
    val reply = ByteArray(0x38 + 16).also { it[0x22] = 0xfb.toByte() }
    assertNull(Broadlink.replyPayload(reply, Broadlink.DEFAULT_KEY))
  }
}

class BroadlinkLearnTest {
  @Test fun `decode reverses encode within one tick of rounding`() {
    val original = listOf(9000, 4500, 560, 560, 560, 1690, 40000)
    val decoded = Broadlink.decodeIr(Broadlink.irData(original))!!
    assertEquals(original.size, decoded.size)
    original.zip(decoded).forEach { (a, b) -> assertTrue("$a vs $b", Math.abs(a - b) <= 31) }
  }

  @Test fun `decode rejects blobs that are not IR captures`() {
    assertNull(Broadlink.decodeIr(byteArrayOf(0x24, 0, 2, 0, 1, 2)))
    assertNull(Broadlink.decodeIr(ByteArray(3)))
  }

  @Test fun `learning payloads select the right sub-command`() {
    assertEquals(3, Broadlink.enterLearningPayload()[0].toInt())
    assertEquals(4, Broadlink.checkDataPayload()[0].toInt())
    assertEquals(16, Broadlink.checkDataPayload().size)
  }
}
