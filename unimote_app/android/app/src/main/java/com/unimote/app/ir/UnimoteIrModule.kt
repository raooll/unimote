package com.unimote.app.ir

import android.content.Context
import android.hardware.ConsumerIrManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray

/**
 * Sends raw infrared signals through the phone's built-in IR blaster (Android ConsumerIrManager).
 *
 * JS name: NativeModules.UnimoteIr
 *   hasIrEmitter(): Promise<boolean>
 *   transmit(frequencyHz: number, pattern: number[]): Promise<void>
 *
 * `pattern` is alternating mark/space durations in microseconds, starting with a mark, which is exactly
 * what the catalog API returns for IR remotes.
 */
class UnimoteIrModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {

  override fun getName() = NAME

  private fun manager(): ConsumerIrManager? =
      reactApplicationContext.getSystemService(Context.CONSUMER_IR_SERVICE) as? ConsumerIrManager

  @ReactMethod
  fun hasIrEmitter(promise: Promise) {
    try {
      promise.resolve(manager()?.hasIrEmitter() == true)
    } catch (e: Exception) {
      promise.resolve(false)
    }
  }

  @ReactMethod
  fun transmit(frequency: Int, pattern: ReadableArray, promise: Promise) {
    val ir = manager()
    if (ir == null || !ir.hasIrEmitter()) {
      promise.reject("E_NO_IR", "This phone has no infrared blaster")
      return
    }
    if (pattern.size() < 2 || pattern.size() > MAX_PATTERN) {
      promise.reject("E_BAD_PATTERN", "Pattern must have 2..$MAX_PATTERN entries")
      return
    }
    try {
      val timings = IntArray(pattern.size()) { pattern.getInt(it) }
      if (timings.any { it <= 0 }) {
        promise.reject("E_BAD_PATTERN", "Pattern durations must be positive")
        return
      }
      val ranges = ir.carrierFrequencies?.map { it.minFrequency to it.maxFrequency } ?: emptyList()
      ir.transmit(IrFrequency.nearestSupported(frequency, ranges), timings)
      promise.resolve(null)
    } catch (e: IllegalArgumentException) {
      promise.reject("E_BAD_SIGNAL", e.message ?: "The phone rejected this IR signal", e)
    } catch (e: Exception) {
      promise.reject("E_IR", e.message ?: "IR transmit failed", e)
    }
  }

  companion object {
    const val NAME = "UnimoteIr"
    private const val MAX_PATTERN = 4000
  }
}

/** Pure helper (unit-testable): many phones only accept carrier frequencies inside their hardware ranges. */
object IrFrequency {
  fun nearestSupported(requested: Int, ranges: List<Pair<Int, Int>>): Int {
    if (ranges.isEmpty() || ranges.any { requested in it.first..it.second }) return requested
    return ranges
        .flatMap { listOf(it.first, it.second) }
        .minByOrNull { kotlin.math.abs(it - requested) } ?: requested
  }
}
