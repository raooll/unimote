package com.unimote.app

import com.unimote.app.hid.HidReports
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class HidReportsTest {
  @Test fun `consumer usage is 16-bit little endian`() {
    val (id, bytes) = HidReports.press(12, 0x223)!! // Home
    assertEquals(HidReports.ID_CONSUMER, id)
    assertArrayEquals(byteArrayOf(0x23, 0x02), bytes)
  }

  @Test fun `keyboard usage goes in the first key slot of an 8-byte report`() {
    val (id, bytes) = HidReports.press(7, 0x28)!! // Enter
    assertEquals(HidReports.ID_KEYBOARD, id)
    assertEquals(8, bytes.size)
    assertEquals(0x28.toByte(), bytes[2])
    assertEquals(0, bytes.count { it != 0.toByte() } - 1)
  }

  @Test fun `release reports are all zero`() {
    assertArrayEquals(ByteArray(2), HidReports.release(12)!!.second)
    assertArrayEquals(ByteArray(8), HidReports.release(7)!!.second)
  }

  @Test fun `unknown usage pages are rejected`() {
    assertNull(HidReports.press(1, 5))
    assertNull(HidReports.release(1))
  }

  @Test fun `descriptor declares both report ids and closes its collections`() {
    val d = HidReports.DESCRIPTOR
    assertEquals(2, d.count { it == 0xC0.toByte() })
    assertEquals(2, d.count { it == 0xA1.toByte() })
  }
}
