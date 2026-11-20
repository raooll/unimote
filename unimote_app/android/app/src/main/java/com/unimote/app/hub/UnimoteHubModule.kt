package com.unimote.app.hub

import android.content.Context
import android.net.wifi.WifiManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.SocketTimeoutException
import java.util.concurrent.ConcurrentHashMap

/** Wi-Fi IR hubs. Currently Broadlink RM-series. JS: NativeModules.UnimoteHub { discover, sendIr }. */
class UnimoteHubModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
  override fun getName() = NAME

  private class Session(val id: ByteArray, val key: ByteArray, var count: Int)
  private val sessions = ConcurrentHashMap<String, Session>()

  @ReactMethod
  fun discover(timeoutMs: Int, promise: Promise) {
    Thread {
      val wifi = ctx.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
      val lock = wifi?.createMulticastLock("unimote-hub")?.apply { setReferenceCounted(false); acquire() }
      try {
        val found = LinkedHashMap<String, Broadlink.Device>()
        DatagramSocket().use { s ->
          s.broadcast = true
          s.soTimeout = 400
          val hello = Broadlink.hello(s.localPort)
          repeat(2) { s.send(DatagramPacket(hello, hello.size, InetAddress.getByName("255.255.255.255"), 80)) }
          val end = System.currentTimeMillis() + timeoutMs.coerceIn(500, 8000)
          val buf = ByteArray(1024)
          while (System.currentTimeMillis() < end) {
            try {
              val p = DatagramPacket(buf, buf.size)
              s.receive(p)
              val d = Broadlink.parseHelloReply(p.address.hostAddress ?: continue, p.data.copyOf(p.length)) ?: continue
              found.putIfAbsent(Broadlink.macToString(d.mac), d)
            } catch (_: SocketTimeoutException) {}
          }
        }
        val out = Arguments.createArray()
        found.forEach { (mac, d) ->
          out.pushMap(Arguments.createMap().apply { putString("host", d.host); putString("mac", mac); putInt("devType", d.devType) })
        }
        promise.resolve(out)
      } catch (e: Exception) {
        promise.reject("E_HUB", e.message ?: "Discovery failed", e)
      } finally {
        lock?.takeIf { it.isHeld }?.release()
      }
    }.start()
  }

  private fun exchange(host: String, packet: ByteArray): ByteArray {
    DatagramSocket().use { s ->
      s.soTimeout = 2500
      s.send(DatagramPacket(packet, packet.size, InetAddress.getByName(host), 80))
      val buf = ByteArray(2048)
      val p = DatagramPacket(buf, buf.size)
      s.receive(p)
      return p.data.copyOf(p.length)
    }
  }

  private fun authenticate(host: String, mac: ByteArray, devType: Int): Session {
    val pkt = Broadlink.packet(Broadlink.CMD_AUTH, Broadlink.authPayload(), devType, mac, 0x8000, ByteArray(4), Broadlink.DEFAULT_KEY)
    val payload = Broadlink.replyPayload(exchange(host, pkt), Broadlink.DEFAULT_KEY) ?: throw IllegalStateException("The hub rejected the connection")
    return Session(payload.copyOfRange(0, 4), payload.copyOfRange(4, 20), 0x8001)
  }

  @ReactMethod
  fun sendIr(host: String, macStr: String, devType: Int, pattern: ReadableArray, promise: Promise) {
    Thread {
      try {
        val mac = Broadlink.macFromString(macStr)
        val timings = List(pattern.size()) { pattern.getInt(it) }
        if (timings.size < 2) throw IllegalArgumentException("Empty signal")
        var attempt = 0
        while (true) {
          try {
            val s = sessions.getOrPut(macStr) { authenticate(host, mac, devType) }
            s.count = (s.count + 1) and 0xffff
            val pkt = Broadlink.packet(Broadlink.CMD_SEND, Broadlink.sendPayload(timings), devType, mac, s.count, s.id, s.key)
            Broadlink.replyPayload(exchange(host, pkt), s.key) ?: throw IllegalStateException("The hub did not accept the signal")
            break
          } catch (e: Exception) {
            sessions.remove(macStr) // stale session or network blip: re-authenticate once
            if (++attempt >= 2) throw e
          }
        }
        promise.resolve(null)
      } catch (e: SocketTimeoutException) {
        promise.reject("E_HUB_TIMEOUT", "The hub did not answer", e)
      } catch (e: Exception) {
        promise.reject("E_HUB", e.message ?: "Hub error", e)
      }
    }.start()
  }

  /** Puts the hub in learning mode and waits for the user to press a button on their original remote. */
  @ReactMethod
  fun learnIr(host: String, macStr: String, devType: Int, timeoutMs: Int, promise: Promise) {
    Thread {
      try {
        val mac = Broadlink.macFromString(macStr)
        val s = sessions.getOrPut(macStr) { authenticate(host, mac, devType) }
        fun call(cmd: Int, payload: ByteArray): ByteArray? {
          s.count = (s.count + 1) and 0xffff
          val pkt = Broadlink.packet(cmd, payload, devType, mac, s.count, s.id, s.key)
          return Broadlink.replyPayload(exchange(host, pkt), s.key)
        }
        call(Broadlink.CMD_SEND, Broadlink.enterLearningPayload()) ?: throw IllegalStateException("The hub did not enter learning mode")
        val end = System.currentTimeMillis() + timeoutMs.coerceIn(3000, 30000)
        while (System.currentTimeMillis() < end) {
          Thread.sleep(1000)
          val reply = try { call(Broadlink.CMD_SEND, Broadlink.checkDataPayload()) } catch (_: SocketTimeoutException) { null }
          if (reply != null && reply.size > 4) {
            val pattern = Broadlink.decodeIr(reply.copyOfRange(4, reply.size))
            if (pattern != null) {
              promise.resolve(Arguments.createArray().also { arr -> pattern.forEach { arr.pushInt(it) } })
              return@Thread
            }
          }
        }
        promise.reject("E_LEARN_TIMEOUT", "No signal received. Point your remote at the hub and press a button.")
      } catch (e: Exception) {
        sessions.remove(macStr)
        promise.reject("E_HUB", e.message ?: "Hub error", e)
      }
    }.start()
  }

  companion object { const val NAME = "UnimoteHub" }
}
