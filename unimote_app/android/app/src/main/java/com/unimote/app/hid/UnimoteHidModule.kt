package com.unimote.app.hid

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothHidDevice
import android.bluetooth.BluetoothHidDeviceAppSdpSettings
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Makes the phone act as a Bluetooth keyboard / media remote (Android 9+ BluetoothHidDevice API).
 * The target (TV, streaming stick, PC) must already be paired in the phone's Bluetooth settings.
 *
 * JS: NativeModules.UnimoteHid
 *   isSupported(): Promise<boolean>
 *   bondedDevices(): Promise<{name, address}[]>
 *   connect(address): Promise<void>   (resolves once the host accepts the HID connection)
 *   press(page, usage): Promise<void>
 *   disconnect(): Promise<void>
 */
@SuppressLint("MissingPermission") // BLUETOOTH_CONNECT is requested from JS before any call here.
class UnimoteHidModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
  override fun getName() = NAME

  private val main = Handler(Looper.getMainLooper())
  private var hid: BluetoothHidDevice? = null
  private var registered = false
  private var connected: BluetoothDevice? = null
  private var pendingConnect: Promise? = null
  private var pendingAddress: String? = null

  private fun adapter(): BluetoothAdapter? = (ctx.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter

  private val callback = object : BluetoothHidDevice.Callback() {
    override fun onAppStatusChanged(pluggedDevice: BluetoothDevice?, isRegistered: Boolean) {
      registered = isRegistered
      val address = pendingAddress
      if (isRegistered && address != null) connectNow(address)
    }

    override fun onConnectionStateChanged(device: BluetoothDevice, state: Int) {
      when (state) {
        BluetoothProfile.STATE_CONNECTED -> {
          connected = device
          if (device.address == pendingAddress) { pendingConnect?.resolve(null); pendingConnect = null; pendingAddress = null }
        }
        BluetoothProfile.STATE_DISCONNECTED -> {
          if (connected?.address == device.address) connected = null
          if (device.address == pendingAddress) {
            pendingConnect?.reject("E_HID_DISCONNECTED", "The device refused the connection"); pendingConnect = null; pendingAddress = null
          }
        }
      }
    }
  }

  private fun supported() = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && adapter() != null

  @ReactMethod fun isSupported(promise: Promise) = promise.resolve(supported())

  @ReactMethod
  fun bondedDevices(promise: Promise) {
    try {
      val out = Arguments.createArray()
      adapter()?.bondedDevices?.forEach {
        out.pushMap(Arguments.createMap().apply { putString("name", it.name ?: it.address); putString("address", it.address) })
      }
      promise.resolve(out)
    } catch (e: SecurityException) {
      promise.reject("E_PERMISSION", "Bluetooth permission is required", e)
    }
  }

  @ReactMethod
  fun connect(address: String, promise: Promise) {
    if (!supported()) return promise.reject("E_UNSUPPORTED", "Bluetooth remote needs Android 9 or newer")
    val ad = adapter()!!
    if (!ad.isEnabled) return promise.reject("E_BT_OFF", "Turn Bluetooth on first")
    if (connected?.address == address) return promise.resolve(null)
    pendingConnect?.reject("E_SUPERSEDED", "Another connection was started")
    pendingConnect = promise
    pendingAddress = address
    main.postDelayed({
      if (pendingConnect === promise) {
        promise.reject("E_TIMEOUT", "The device did not respond. Make sure it is paired and in range.")
        pendingConnect = null; pendingAddress = null
      }
    }, 12_000)
    try {
      if (hid != null && registered) { connectNow(address); return }
      ad.getProfileProxy(ctx, object : BluetoothProfile.ServiceListener {
        override fun onServiceConnected(profile: Int, proxy: BluetoothProfile) {
          val h = proxy as BluetoothHidDevice
          hid = h
          val sdp = BluetoothHidDeviceAppSdpSettings("Unimote", "Phone remote", "Unimote", BluetoothHidDevice.SUBCLASS1_COMBO, HidReports.DESCRIPTOR)
          h.registerApp(sdp, null, null, { it.run() }, callback)
        }
        override fun onServiceDisconnected(profile: Int) { hid = null; registered = false; connected = null }
      }, BluetoothProfile.HID_DEVICE)
    } catch (e: SecurityException) {
      pendingConnect = null; pendingAddress = null
      promise.reject("E_PERMISSION", "Bluetooth permission is required", e)
    }
  }

  private fun connectNow(address: String) {
    val device = adapter()?.getRemoteDevice(address) ?: return
    hid?.connect(device)
  }

  @ReactMethod
  fun press(page: Int, usage: Int, promise: Promise) {
    val h = hid
    val d = connected
    if (h == null || d == null) return promise.reject("E_NOT_CONNECTED", "Not connected to a Bluetooth device")
    val down = HidReports.press(page, usage) ?: return promise.reject("E_BAD_USAGE", "Unsupported button type")
    val up = HidReports.release(page)!!
    try {
      h.sendReport(d, down.first, down.second)
      main.postDelayed({ try { h.sendReport(d, up.first, up.second) } catch (_: Exception) {} }, 40)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("E_HID", e.message ?: "Could not send", e)
    }
  }

  @ReactMethod
  fun disconnect(promise: Promise) {
    try { connected?.let { hid?.disconnect(it) } } catch (_: Exception) {}
    connected = null
    promise.resolve(null)
  }

  override fun invalidate() {
    try { hid?.unregisterApp() } catch (_: Exception) {}
    hid = null; registered = false; connected = null
    super.invalidate()
  }

  companion object { const val NAME = "UnimoteHid" }
}
