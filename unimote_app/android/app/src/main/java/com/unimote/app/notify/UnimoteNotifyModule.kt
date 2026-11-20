package com.unimote.app.notify

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.unimote.app.MainActivity
import com.unimote.app.R

/**
 * An ongoing notification with up to 4 IR buttons for one remote.
 * JS: NativeModules.UnimoteNotify
 *   areEnabled(): Promise<boolean>
 *   show(remoteKey, title, actions: {label, frequency, pattern: number[]}[]): Promise<void>
 *   hide(): Promise<void>
 *   current(): Promise<string | null>   // the remoteKey now shown
 */
class UnimoteNotifyModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
  override fun getName() = NAME

  private val prefs get() = ctx.getSharedPreferences("unimote_notify", Context.MODE_PRIVATE)

  @ReactMethod
  fun areEnabled(promise: Promise) = promise.resolve(NotificationManagerCompat.from(ctx).areNotificationsEnabled())

  @ReactMethod
  fun current(promise: Promise) = promise.resolve(prefs.getString("key", null))

  @ReactMethod
  fun hide(promise: Promise) {
    NotificationManagerCompat.from(ctx).cancel(NOTIFICATION_ID)
    prefs.edit().remove("key").apply()
    promise.resolve(null)
  }

  @ReactMethod
  fun show(remoteKey: String, title: String, actions: ReadableArray, promise: Promise) {
    try {
      if (!NotificationManagerCompat.from(ctx).areNotificationsEnabled()) {
        promise.reject("E_PERMISSION", "Notifications are turned off for Unimote")
        return
      }
      ensureChannel()
      val open = PendingIntent.getActivity(
          ctx, 0, Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
          PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
      val builder = NotificationCompat.Builder(ctx, CHANNEL)
          .setSmallIcon(R.drawable.ic_tile_remote)
          .setContentTitle(title.trim().take(40))
          .setContentText("Tap a button to send")
          .setContentIntent(open)
          .setOngoing(true)
          .setOnlyAlertOnce(true)
          .setSilent(true)
          .setCategory(NotificationCompat.CATEGORY_SERVICE)
      var added = 0
      for (i in 0 until actions.size()) {
        if (added >= NotificationControls.MAX_ACTIONS) break
        val m = actions.getMap(i) ?: continue
        val arr = m.getArray("pattern") ?: continue
        val pattern = IntArray(arr.size()) { arr.getInt(it) }
        if (!NotificationControls.validPattern(pattern)) continue
        val send = Intent(ctx, IrActionReceiver::class.java).setAction(NotificationControls.ACTION_SEND)
            .putExtra(IrActionReceiver.EXTRA_FREQUENCY, m.getInt("frequency"))
            .putExtra(IrActionReceiver.EXTRA_PATTERN, pattern)
        val pi = PendingIntent.getBroadcast(
            ctx, NotificationControls.requestCode(added), send, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        builder.addAction(0, NotificationControls.label(m.getString("label") ?: "?"), pi)
        added++
      }
      if (added == 0) {
        promise.reject("E_NO_ACTIONS", "This remote has no infrared buttons to show")
        return
      }
      NotificationManagerCompat.from(ctx).notify(NOTIFICATION_ID, builder.build())
      prefs.edit().putString("key", remoteKey).apply()
      promise.resolve(null)
    } catch (e: SecurityException) {
      promise.reject("E_PERMISSION", "Notifications are turned off for Unimote", e)
    } catch (e: Exception) {
      promise.reject("E_NOTIFY", e.message ?: "Could not show the notification", e)
    }
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (nm.getNotificationChannel(CHANNEL) == null) {
      nm.createNotificationChannel(NotificationChannel(CHANNEL, "Remote controls", NotificationManager.IMPORTANCE_LOW))
    }
  }

  companion object {
    const val NAME = "UnimoteNotify"
    private const val CHANNEL = "remote_controls"
    private const val NOTIFICATION_ID = 4201
  }
}
