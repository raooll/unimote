package com.unimote.app.atv

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit

/**
 * Android TV / Google TV control over Wi-Fi.
 * JS: NativeModules.UnimoteAtv
 *   discover(timeoutMs): Promise<{ip, name, port}[]>      mDNS "_androidtvremote2._tcp"
 *   pairStart(host, clientName): Promise<void>             the TV now shows a 6-digit code
 *   pairFinish(host, code): Promise<void>                  rejects with code "bad_code" for a wrong code
 *   sendKey(host, keyCode, direction): Promise<void>       direction 3 = short press, 1/2 = long press start/end
 *   disconnect(host): Promise<void>
 * Errors carry one of: unreachable, not_paired, bad_code, pairing_rejected, error.
 */
class UnimoteAtvModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
  override fun getName() = NAME

  private val pool = Executors.newCachedThreadPool()
  private val pairings = ConcurrentHashMap<String, AtvPairing>()
  private val remotes = ConcurrentHashMap<String, AtvRemote>()
  private val identity: AtvIdentity by lazy { AtvIdentity.loadOrCreate(File(ctx.filesDir, "atv_identity.p12")) }

  private fun run(promise: Promise, block: () -> Unit) {
    pool.execute {
      try {
        block()
      } catch (e: AtvException) {
        promise.reject(e.code, e.message, e)
      } catch (e: Exception) {
        promise.reject("error", e.message ?: "Android TV error", e)
      }
    }
  }

  @ReactMethod
  fun pairStart(host: String, clientName: String, promise: Promise) = run(promise) {
    pairings.remove(host)?.close()
    val pairing = AtvPairing(identity, host)
    pairing.start(clientName.trim().ifEmpty { "Unimote" }.take(40))
    pairings[host] = pairing
    promise.resolve(null)
  }

  @ReactMethod
  fun pairFinish(host: String, code: String, promise: Promise) = run(promise) {
    val pairing = pairings[host] ?: throw AtvException("error", "Start pairing first.")
    try {
      pairing.finish(code)
      pairings.remove(host)
      remotes.remove(host)?.close() // reconnect with the now-paired identity
      promise.resolve(null)
    } catch (e: AtvException) {
      if (e.code != "bad_code" || !code.trim().isHexCode()) pairings.remove(host)
      throw e
    }
  }

  private fun String.isHexCode() = length == 6 && all { it.isDigit() || it.lowercaseChar() in 'a'..'f' }

  @ReactMethod
  fun sendKey(host: String, keyCode: Int, direction: Int, promise: Promise) = run(promise) {
    var remote = remotes[host]
    if (remote == null || remote.closed) {
      remote?.close()
      remote = AtvRemote(identity, host).also { it.connect() }
      remotes[host] = remote
    }
    try {
      remote.sendKey(keyCode, direction)
    } catch (e: AtvException) {
      // the TV may have dropped an idle connection: reconnect once and retry
      remotes.remove(host)?.close()
      remote = AtvRemote(identity, host).also { it.connect() }
      remotes[host] = remote
      remote.sendKey(keyCode, direction)
    }
    promise.resolve(null)
  }

  @ReactMethod
  fun disconnect(host: String, promise: Promise) {
    remotes.remove(host)?.close()
    pairings.remove(host)?.close()
    promise.resolve(null)
  }

  @Suppress("DEPRECATION")
  @ReactMethod
  fun discover(timeoutMs: Int, promise: Promise) {
    pool.execute {
      val nsd = ctx.getSystemService(Context.NSD_SERVICE) as? NsdManager
      if (nsd == null) {
        promise.resolve(Arguments.createArray())
        return@execute
      }
      val found = LinkedBlockingQueue<NsdServiceInfo>()
      val results = ConcurrentHashMap<String, Pair<String, Int>>() // ip -> (name, port)
      val listener = object : NsdManager.DiscoveryListener {
        override fun onServiceFound(info: NsdServiceInfo) { found.add(info) }
        override fun onServiceLost(info: NsdServiceInfo) {}
        override fun onDiscoveryStarted(type: String) {}
        override fun onDiscoveryStopped(type: String) {}
        override fun onStartDiscoveryFailed(type: String, code: Int) {}
        override fun onStopDiscoveryFailed(type: String, code: Int) {}
      }
      val deadline = System.currentTimeMillis() + timeoutMs.coerceIn(500, 10000)
      try {
        nsd.discoverServices("_androidtvremote2._tcp", NsdManager.PROTOCOL_DNS_SD, listener)
        // Resolve one service at a time: Android refuses overlapping resolves.
        while (System.currentTimeMillis() < deadline) {
          val info = found.poll(200, TimeUnit.MILLISECONDS) ?: continue
          val done = CountDownLatch(1)
          nsd.resolveService(info, object : NsdManager.ResolveListener {
            override fun onResolveFailed(i: NsdServiceInfo, code: Int) { done.countDown() }
            override fun onServiceResolved(i: NsdServiceInfo) {
              i.host?.hostAddress?.let { ip -> if (!ip.contains(':')) results[ip] = (i.serviceName ?: "Android TV") to 6466 }
              done.countDown()
            }
          })
          done.await(2, TimeUnit.SECONDS)
        }
      } catch (_: Exception) {
        // fall through with whatever was found
      } finally {
        try { nsd.stopServiceDiscovery(listener) } catch (_: Exception) {}
      }
      val out = Arguments.createArray()
      for ((ip, v) in results) out.pushMap(Arguments.createMap().apply { putString("ip", ip); putString("name", v.first); putInt("port", v.second) })
      promise.resolve(out)
    }
  }

  companion object { const val NAME = "UnimoteAtv" }
}
