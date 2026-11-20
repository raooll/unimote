package com.unimote.app.hid

/** Pure helpers (JVM unit-tested): HID descriptor and report encoding. */
object HidReports {
  const val ID_CONSUMER = 1
  const val ID_KEYBOARD = 2
  const val PAGE_KEYBOARD = 7
  const val PAGE_CONSUMER = 12

  /** Report descriptor: Report 1 = Consumer Control (one 16-bit usage), Report 2 = Keyboard (boot layout). */
  val DESCRIPTOR: ByteArray = intArrayOf(
      // Consumer control
      0x05, 0x0C, 0x09, 0x01, 0xA1, 0x01, 0x85, ID_CONSUMER,
      0x15, 0x00, 0x26, 0xFF, 0x03, 0x19, 0x00, 0x2A, 0xFF, 0x03,
      0x75, 0x10, 0x95, 0x01, 0x81, 0x00, 0xC0,
      // Keyboard
      0x05, 0x01, 0x09, 0x06, 0xA1, 0x01, 0x85, ID_KEYBOARD,
      0x05, 0x07, 0x19, 0xE0, 0x29, 0xE7, 0x15, 0x00, 0x25, 0x01, 0x75, 0x01, 0x95, 0x08, 0x81, 0x02,
      0x95, 0x01, 0x75, 0x08, 0x81, 0x01,
      0x95, 0x06, 0x75, 0x08, 0x15, 0x00, 0x25, 0x65, 0x05, 0x07, 0x19, 0x00, 0x29, 0x65, 0x81, 0x00,
      0xC0,
  ).map { it.toByte() }.toByteArray()

  /** Returns (reportId, payload) for a key press, or null when the usage page is not supported. */
  fun press(page: Int, usage: Int): Pair<Int, ByteArray>? = when (page) {
    PAGE_CONSUMER -> ID_CONSUMER to byteArrayOf((usage and 0xFF).toByte(), ((usage shr 8) and 0xFF).toByte())
    PAGE_KEYBOARD -> ID_KEYBOARD to byteArrayOf(0, 0, (usage and 0xFF).toByte(), 0, 0, 0, 0, 0)
    else -> null
  }

  fun release(page: Int): Pair<Int, ByteArray>? = when (page) {
    PAGE_CONSUMER -> ID_CONSUMER to ByteArray(2)
    PAGE_KEYBOARD -> ID_KEYBOARD to ByteArray(8)
    else -> null
  }
}
