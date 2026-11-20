package com.unimote.app

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.unimote.app.atv.UnimoteAtvPackage
import com.unimote.app.hid.UnimoteHidPackage
import com.unimote.app.hub.UnimoteHubPackage
import com.unimote.app.ir.UnimoteIrPackage
import com.unimote.app.lan.UnimoteLanPackage
import com.unimote.app.notify.UnimoteNotifyPackage
import com.unimote.app.shortcuts.UnimoteShortcutsPackage

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          add(UnimoteIrPackage())
          add(UnimoteLanPackage())
          add(UnimoteHidPackage())
          add(UnimoteHubPackage())
          add(UnimoteShortcutsPackage())
          add(UnimoteNotifyPackage())
          add(UnimoteAtvPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}
