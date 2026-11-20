package com.unimote.app.atv

import java.io.Closeable
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLSocket

/**
 * A live control connection to a paired TV (port 6466). The TV sends a configure, set-active and start message and then
 * pings now and then (an unanswered ping drops the connection), so a reader thread keeps answering while we send keys.
 */
class AtvRemote(private val identity: AtvIdentity, private val host: String, private val port: Int = 6466) : Closeable {
  private var socket: SSLSocket? = null
  private val ready = CountDownLatch(1)
  @Volatile var closed = false
    private set

  /** Connects and waits for the TV to say it is ready. A TV that has not paired with us hangs up instead. */
  fun connect(timeoutMs: Long = 8000) {
    val s = AtvTls.connect(identity, host, port, readTimeoutMs = 0)
    socket = s
    Thread({ readLoop(s) }, "atv-remote-$host").apply { isDaemon = true }.start()
    if (!ready.await(timeoutMs, TimeUnit.MILLISECONDS)) {
      close()
      throw AtvException("not_paired", "The TV didn't accept this phone. Pair with it first.")
    }
  }

  fun sendKey(keyCode: Int, direction: Int = AtvProto.DIRECTION_SHORT) {
    if (closed) throw AtvException("unreachable", "The TV connection was lost.")
    try {
      write(AtvProto.keyInject(keyCode, direction))
    } catch (e: Exception) {
      close()
      throw AtvException("unreachable", "The TV connection was lost.", e)
    }
  }

  @Synchronized private fun write(body: ByteArray) {
    val out = socket!!.outputStream
    out.write(AtvProto.frame(body))
    out.flush()
  }

  private fun readLoop(s: SSLSocket) {
    try {
      val input = s.inputStream
      while (!closed) {
        val body = AtvProto.readFrame(input) ?: break
        when (val msg = AtvProto.parseRemote(body)) {
          is AtvProto.Remote.Configure -> write(AtvProto.remoteConfigureReply(msg.features and AtvProto.FEATURES))
          is AtvProto.Remote.SetActive -> write(AtvProto.remoteSetActive())
          is AtvProto.Remote.Ping -> write(AtvProto.pingResponse(msg.value))
          is AtvProto.Remote.Start -> ready.countDown()
          else -> {}
        }
      }
    } catch (_: Exception) {
      // connection dropped; `closed` below tells the next send to reconnect
    } finally {
      closed = true
    }
  }

  override fun close() {
    closed = true
    try { socket?.close() } catch (_: Exception) {}
  }
}
