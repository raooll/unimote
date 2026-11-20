package com.unimote.app.notify

/** Pure helpers (JVM unit-tested) for the ongoing "remote in the notification shade" feature. */
object NotificationControls {
  const val MAX_ACTIONS = 4
  const val MAX_PATTERN = 4000
  const val ACTION_SEND = "com.unimote.app.notify.SEND_IR"

  fun validPattern(p: IntArray): Boolean = p.size in 2..MAX_PATTERN && p.all { it > 0 }

  /** Notification buttons are narrow; keep the label short. */
  fun label(name: String): String = name.trim().let { if (it.length <= 10) it else it.take(9) + "…" }

  /** Unique, stable request code per action slot so PendingIntents do not overwrite each other. */
  fun requestCode(slot: Int): Int = 7100 + slot
}
