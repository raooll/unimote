package com.unimote.app.shortcuts

import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import com.unimote.app.MainActivity

/** Quick Settings tile: one swipe-down tap opens Unimote's remotes. */
class UnimoteTileService : TileService() {
  override fun onStartListening() {
    qsTile?.apply {
      state = Tile.STATE_INACTIVE
      label = "Unimote"
      updateTile()
    }
  }

  @Suppress("DEPRECATION")
  override fun onClick() {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("${DeepLinks.SCHEME}://home"), this, MainActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    if (Build.VERSION.SDK_INT >= 34) {
      startActivityAndCollapse(PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
    } else {
      startActivityAndCollapse(intent)
    }
  }
}
