package com.unimote.app.ir

import org.junit.Assert.assertEquals
import org.junit.Test

class IrFrequencyTest {
  private val phone = listOf(30000 to 60000)

  @Test fun `keeps a supported frequency`() =
      assertEquals(38000, IrFrequency.nearestSupported(38000, phone))

  @Test fun `clamps up to the nearest supported edge`() =
      assertEquals(30000, IrFrequency.nearestSupported(20000, phone))

  @Test fun `clamps down to the nearest supported edge`() =
      assertEquals(60000, IrFrequency.nearestSupported(70000, phone))

  @Test fun `picks the closest range when there are several`() =
      assertEquals(40000, IrFrequency.nearestSupported(41000, listOf(36000 to 36000, 38000 to 40000)))

  @Test fun `passes the request through when the phone reports no ranges`() =
      assertEquals(38000, IrFrequency.nearestSupported(38000, emptyList()))
}
