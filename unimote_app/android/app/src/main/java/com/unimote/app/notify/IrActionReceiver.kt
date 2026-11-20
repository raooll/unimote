package com.unimote.app.notify

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.hardware.ConsumerIrManager
import com.unimote.app.ir.IrFrequency

/** Sends the IR signal carried by a notification button, so the app does not need to be open. Not exported. */
class IrActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != NotificationControls.ACTION_SEND) return
    val pattern = intent.getIntArrayExtra(EXTRA_PATTERN) ?: return
    if (!NotificationControls.validPattern(pattern)) return
    val ir = context.getSystemService(Context.CONSUMER_IR_SERVICE) as? ConsumerIrManager ?: return
    if (!ir.hasIrEmitter()) return
    try {
      val ranges = ir.carrierFrequencies?.map { it.minFrequency to it.maxFrequency } ?: emptyList()
      ir.transmit(IrFrequency.nearestSupported(intent.getIntExtra(EXTRA_FREQUENCY, 38000), ranges), pattern)
    } catch (_: Exception) {
      // nothing useful to show from a background broadcast
    }
  }

  companion object {
    const val EXTRA_FREQUENCY = "frequency"
    const val EXTRA_PATTERN = "pattern"
  }
}
