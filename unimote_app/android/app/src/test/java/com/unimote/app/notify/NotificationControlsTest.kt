package com.unimote.app.notify

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NotificationControlsTest {
  @Test fun acceptsWellFormedPatterns() = assertTrue(NotificationControls.validPattern(intArrayOf(9000, 4500, 560)))

  @Test fun rejectsEmptyShortZeroNegativeAndHugePatterns() {
    assertFalse(NotificationControls.validPattern(intArrayOf()))
    assertFalse(NotificationControls.validPattern(intArrayOf(500)))
    assertFalse(NotificationControls.validPattern(intArrayOf(500, 0)))
    assertFalse(NotificationControls.validPattern(intArrayOf(500, -5)))
    assertFalse(NotificationControls.validPattern(IntArray(NotificationControls.MAX_PATTERN + 1) { 500 }))
  }

  @Test fun shortensLongLabels() {
    assertEquals("Power", NotificationControls.label("  Power "))
    assertEquals("Volume Do…", NotificationControls.label("Volume Down"))
  }

  @Test fun requestCodesAreDistinctPerSlot() =
      assertEquals(NotificationControls.MAX_ACTIONS, (0 until NotificationControls.MAX_ACTIONS).map { NotificationControls.requestCode(it) }.toSet().size)
}
