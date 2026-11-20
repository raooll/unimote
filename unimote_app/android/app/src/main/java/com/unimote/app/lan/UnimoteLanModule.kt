package com.unimote.app.lan

import android.content.Context
import android.net.wifi.WifiManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.SocketTimeoutException
import java.net.URI
import java.security.SecureRandom
import java.security.cert.X509Certificate
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import javax.net.ssl.HostnameVerifier
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString

/**
 * Local-network helpers for smart-TV remotes:
 *  - ssdpSearch: UPnP/SSDP discovery (UDP multicast)
 *  - httpRequest: short-timeout HTTP(S) (Roku ECP etc.)
 *  - wsOpen/wsSend/wsClose: WebSocket client that tolerates the self-signed certificates of Samsung/LG
 *    TVs, ONLY for private-network hosts. Events are emitted as "UnimoteLanSocket".
 */
class UnimoteLanModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {

  override fun getName() = NAME

  private val sockets = ConcurrentHashMap<String, WebSocket>()
  private val strict: OkHttpClient by lazy { OkHttpClient.Builder().connectTimeout(4, TimeUnit.SECONDS).build() }
  private val relaxed: OkHttpClient by lazy {
    val trustAll = object : X509TrustManager {
      override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) {}
      override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {}
      override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
    }
    val ssl = SSLContext.getInstance("TLS").apply { init(null, arrayOf<TrustManager>(trustAll), SecureRandom()) }
    OkHttpClient.Builder()
        .sslSocketFactory(ssl.socketFactory, trustAll)
        .hostnameVerifier(HostnameVerifier { _, _ -> true })
        .connectTimeout(4, TimeUnit.SECONDS)
        .pingInterval(20, TimeUnit.SECONDS)
        .build()
  }

  private fun clientFor(url: String, insecure: Boolean): OkHttpClient {
    val host = URI(url).host ?: throw IllegalArgumentException("Bad URL")
    return if (insecure && LanUtil.isPrivateHost(host)) relaxed else strict
  }

  // --- SSDP -----------------------------------------------------------------

  @ReactMethod
  fun ssdpSearch(st: String, timeoutMs: Int, promise: Promise) {
    Thread {
      val wifi = ctx.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
      val lock = wifi?.createMulticastLock("unimote-ssdp")?.apply { setReferenceCounted(false); acquire() }
      try {
        val found = LinkedHashMap<String, Map<String, String>>()
        DatagramSocket().use { socket ->
          socket.soTimeout = 400
          val msg = LanUtil.mSearch(st).toByteArray()
          val group = InetAddress.getByName("239.255.255.250")
          repeat(2) { socket.send(DatagramPacket(msg, msg.size, group, 1900)) }
          val buf = ByteArray(2048)
          val end = System.currentTimeMillis() + timeoutMs.coerceIn(500, 8000)
          while (System.currentTimeMillis() < end) {
            try {
              val p = DatagramPacket(buf, buf.size)
              socket.receive(p)
              val headers = LanUtil.parseSsdp(String(p.data, 0, p.length)) ?: continue
              val ip = p.address.hostAddress ?: continue
              found.putIfAbsent(ip, headers + ("ip" to ip))
            } catch (_: SocketTimeoutException) {}
          }
        }
        val out = Arguments.createArray()
        found.values.forEach { h ->
          out.pushMap(Arguments.createMap().apply {
            putString("ip", h["ip"])
            putString("location", h["location"])
            putString("st", h["st"] ?: h["nt"])
            putString("usn", h["usn"])
            putString("server", h["server"])
          })
        }
        promise.resolve(out)
      } catch (e: Exception) {
        promise.reject("E_SSDP", e.message ?: "Discovery failed", e)
      } finally {
        lock?.takeIf { it.isHeld }?.release()
      }
    }.start()
  }

  // --- HTTP -----------------------------------------------------------------

  @ReactMethod
  fun httpRequest(method: String, url: String, headers: ReadableMap?, body: String?, timeoutMs: Int, promise: Promise) {
    Thread {
      try {
        val client = clientFor(url, insecure = true).newBuilder()
            .callTimeout(timeoutMs.coerceIn(300, 15000).toLong(), TimeUnit.MILLISECONDS).build()
        val builder = Request.Builder().url(url)
        headers?.entryIterator?.forEach { builder.header(it.key, it.value.toString()) }
        val reqBody = if (method == "GET" || method == "HEAD") null
        else (body ?: "").toRequestBody("application/json".toMediaTypeOrNull())
        builder.method(method, reqBody)
        client.newCall(builder.build()).execute().use { r: Response ->
          promise.resolve(Arguments.createMap().apply {
            putInt("status", r.code)
            putString("body", r.body?.string()?.take(200_000) ?: "")
          })
        }
      } catch (e: Exception) {
        promise.reject("E_HTTP", e.message ?: "Request failed", e)
      }
    }.start()
  }

  // --- WebSocket --------------------------------------------------------------

  private fun emit(id: String, type: String, data: String? = null) {
    val map = Arguments.createMap().apply {
      putString("id", id); putString("type", type); if (data != null) putString("data", data)
    }
    ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(EVENT, map)
  }

  @ReactMethod
  fun wsOpen(id: String, url: String, insecure: Boolean, promise: Promise) {
    try {
      val request = Request.Builder().url(url).build()
      val ws = clientFor(url, insecure).newWebSocket(request, object : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) = emit(id, "open")
        override fun onMessage(webSocket: WebSocket, text: String) = emit(id, "message", text)
        override fun onMessage(webSocket: WebSocket, bytes: ByteString) {}
        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) { sockets.remove(id); emit(id, "close", reason) }
        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
          sockets.remove(id); emit(id, "error", t.message ?: "connection failed")
        }
      })
      sockets[id] = ws
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("E_WS", e.message ?: "Cannot open socket", e)
    }
  }

  @ReactMethod
  fun wsSend(id: String, text: String, promise: Promise) {
    val ws = sockets[id]
    if (ws == null) promise.reject("E_WS", "Socket is closed") else { ws.send(text); promise.resolve(null) }
  }

  @ReactMethod
  fun wsClose(id: String) {
    sockets.remove(id)?.close(1000, null)
  }

  // Required by NativeEventEmitter.
  @ReactMethod fun addListener(eventName: String) {}
  @ReactMethod fun removeListeners(count: Int) {}

  override fun invalidate() {
    sockets.values.forEach { it.cancel() }
    sockets.clear()
    super.invalidate()
  }

  companion object {
    const val NAME = "UnimoteLan"
    const val EVENT = "UnimoteLanSocket"
  }
}
