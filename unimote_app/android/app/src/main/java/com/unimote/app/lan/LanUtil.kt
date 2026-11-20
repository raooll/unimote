package com.unimote.app.lan

/** Pure helpers (JVM unit-tested). */
object LanUtil {
  /**
   * TLS certificate checks are only skipped for hosts on the local network. Smart TVs use self-signed
   * certificates; relaxing validation for the public internet would allow man-in-the-middle attacks.
   */
  fun isPrivateHost(host: String): Boolean {
    if (host == "localhost") return true
    val p = host.split(".")
    if (p.size != 4) return false
    val n = p.map { it.toIntOrNull() ?: return false }
    if (n.any { it !in 0..255 }) return false
    return n[0] == 10 || n[0] == 127 || (n[0] == 192 && n[1] == 168) ||
        (n[0] == 172 && n[1] in 16..31) || (n[0] == 169 && n[1] == 254)
  }

  /** Parses an SSDP response / NOTIFY into a lower-cased header map. Returns null if it is not an HTTP-style packet. */
  fun parseSsdp(text: String): Map<String, String>? {
    val lines = text.split("\r\n", "\n")
    val first = lines.firstOrNull()?.trim() ?: return null
    if (!first.startsWith("HTTP/1.1 200") && !first.startsWith("NOTIFY")) return null
    return lines.drop(1).mapNotNull { line ->
      val i = line.indexOf(':')
      if (i <= 0) null else line.substring(0, i).trim().lowercase() to line.substring(i + 1).trim()
    }.toMap()
  }

  fun mSearch(st: String, mx: Int = 2): String =
      "M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: \"ssdp:discover\"\r\nMX: $mx\r\nST: $st\r\n\r\n"
}
