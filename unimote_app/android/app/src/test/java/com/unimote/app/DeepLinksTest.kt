package com.unimote.app

import com.unimote.app.shortcuts.DeepLinks
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class DeepLinksTest {
  @Test fun `scene uri for a uuid`() =
      assertEquals("unimote://scene/3f2c9a-11", DeepLinks.sceneUri("3f2c9a-11"))

  @Test fun `scene uri refuses unsafe ids`() {
    listOf("", "a/b", "a b", "x?y=1", "../etc", "a".repeat(65)).forEach { assertNull(it, DeepLinks.sceneUri(it)) }
  }

  @Test fun `labels are shortened for launchers`() {
    assertEquals("Movie night", DeepLinks.shortLabel("  Movie night "))
    assertEquals("Good mornin…", DeepLinks.shortLabel("Good morning everyone"))
    assertEquals(40, DeepLinks.longLabel("x".repeat(80)).length)
  }
}
