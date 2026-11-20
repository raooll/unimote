package com.unimote.app.shortcuts

import android.content.Intent
import android.net.Uri
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.unimote.app.MainActivity
import com.unimote.app.R

/** Publishes the user's scenes as long-press shortcuts on the app icon. JS: NativeModules.UnimoteShortcuts.setScenes([{id,name}]). */
class UnimoteShortcutsModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
  override fun getName() = NAME

  @ReactMethod
  fun setScenes(scenes: ReadableArray, promise: Promise) {
    try {
      val shortcuts = ArrayList<ShortcutInfoCompat>()
      for (i in 0 until minOf(scenes.size(), DeepLinks.MAX_SHORTCUTS)) {
        val m = scenes.getMap(i) ?: continue
        val id = m.getString("id") ?: continue
        val name = m.getString("name") ?: continue
        val uri = DeepLinks.sceneUri(id) ?: continue
        shortcuts.add(
            ShortcutInfoCompat.Builder(ctx, "scene-$id")
                .setShortLabel(DeepLinks.shortLabel(name))
                .setLongLabel(DeepLinks.longLabel(name))
                .setIcon(IconCompat.createWithResource(ctx, R.mipmap.ic_launcher))
                .setIntent(Intent(Intent.ACTION_VIEW, Uri.parse(uri), ctx, MainActivity::class.java))
                .setRank(i)
                .build())
      }
      ShortcutManagerCompat.setDynamicShortcuts(ctx, shortcuts)
      promise.resolve(shortcuts.size)
    } catch (e: Exception) {
      promise.reject("E_SHORTCUTS", e.message ?: "Could not update shortcuts", e)
    }
  }

  companion object { const val NAME = "UnimoteShortcuts" }
}
