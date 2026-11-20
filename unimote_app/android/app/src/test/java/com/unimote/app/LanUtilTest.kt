package com.unimote.app

import com.unimote.app.lan.LanUtil
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LanUtilTest {
  @Test fun `private ranges are recognised`() {
    listOf("192.168.1.20", "10.0.0.5", "172.16.4.1", "172.31.255.1", "169.254.1.1", "127.0.0.1", "localhost")
        .forEach { assertTrue(it, LanUtil.isPrivateHost(it)) }
  }

  @Test fun `public and malformed hosts are not private`() {
    listOf("8.8.8.8", "172.32.0.1", "172.15.0.1", "192.169.1.1", "api.unimote.app", "300.1.1.1", "1.2.3", "")
        .forEach { assertFalse(it, LanUtil.isPrivateHost(it)) }
  }

  @Test fun `parses an SSDP search response`() {
    val raw = "HTTP/1.1 200 OK\r\nCACHE-CONTROL: max-age=3600\r\nST: roku:ecp\r\nUSN: uuid:roku:ecp:ABC\r\n" +
        "LOCATION: http://192.168.1.50:8060/\r\nServer: Roku/9.4 UPnP/1.0\r\n\r\n"
    val h = LanUtil.parseSsdp(raw)!!
    assertEquals("roku:ecp", h["st"])
    assertEquals("http://192.168.1.50:8060/", h["location"])
    assertEquals("Roku/9.4 UPnP/1.0", h["server"])
  }

  @Test fun `ignores packets that are not SSDP responses`() {
    assertNull(LanUtil.parseSsdp("M-SEARCH * HTTP/1.1\r\n\r\n"))
    assertNull(LanUtil.parseSsdp("garbage"))
    assertNotNull(LanUtil.parseSsdp("NOTIFY * HTTP/1.1\r\nNT: upnp:rootdevice\r\n\r\n"))
  }

  @Test fun `M-SEARCH contains the search target`() {
    val m = LanUtil.mSearch("roku:ecp")
    assertTrue(m.startsWith("M-SEARCH * HTTP/1.1\r\n"))
    assertTrue(m.contains("ST: roku:ecp\r\n"))
    assertTrue(m.endsWith("\r\n\r\n"))
  }
}
