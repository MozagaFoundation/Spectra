/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

package com.mozaga.exo

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import kotlin.math.floor

class VdfModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val MAX_ITERATIONS = 20_000_000.0
        private const val EVENT_NAME = "SpectraVdfProgress"

        init {
            System.loadLibrary("vdf_jni")
        }
    }

    private data class ActiveJob(val id: String, val handle: Long)

    private val executor: ExecutorService = Executors.newSingleThreadExecutor()
    private val lock = Any()
    private var activeJob: ActiveJob? = null

    override fun getName(): String = "VdfModule"

    @ReactMethod
    fun addListener(eventName: String) = Unit

    @ReactMethod
    fun removeListeners(count: Double) = Unit

    @ReactMethod
    fun evaluate(
        jobId: String,
        modulusHex: String,
        baseHex: String,
        iterations: Double,
        promise: Promise
    ) {
        run(jobId, iterations, promise) { handle, normalizedIterations ->
            nativeEvaluate(handle, jobId, modulusHex, baseHex, normalizedIterations)
        }
    }

    @ReactMethod
    fun prove(
        jobId: String,
        modulusHex: String,
        baseHex: String,
        primeHex: String,
        iterations: Double,
        promise: Promise
    ) {
        run(jobId, iterations, promise) { handle, normalizedIterations ->
            nativeProve(handle, jobId, modulusHex, baseHex, primeHex, normalizedIterations)
        }
    }

    @ReactMethod
    fun cancel(jobId: String) {
        synchronized(lock) {
            activeJob?.takeIf { it.id == jobId }?.let { nativeCancel(it.handle) }
        }
    }

    @Suppress("unused")
    fun onNativeProgress(
        jobId: String,
        phase: String,
        completedIterations: Int,
        totalIterations: Int
    ) {
        reactApplicationContext.runOnJSQueueThread {
            val payload = Arguments.createMap().apply {
                putString("jobId", jobId)
                putString("phase", phase)
                putInt("completedIterations", completedIterations)
                putInt("totalIterations", totalIterations)
            }
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(EVENT_NAME, payload)
        }
    }

    override fun invalidate() {
        synchronized(lock) {
            activeJob?.let { nativeCancel(it.handle) }
        }
        executor.shutdownNow()
        super.invalidate()
    }

    private fun run(
        jobId: String,
        iterations: Double,
        promise: Promise,
        operation: (Long, Int) -> Array<String>
    ) {
        val normalizedIterations = normalizeIterations(iterations)
        if (!isValidJobId(jobId) || normalizedIterations == null) {
            promise.reject("ERR_VDF_INPUT", "Invalid VDF request")
            return
        }
        val handle = reserve(jobId)
        if (handle == null) {
            promise.reject("ERR_VDF_BUSY", "Another VDF solve is already running")
            return
        }
        executor.execute {
            try {
                resolveNativeResult(promise, operation(handle, normalizedIterations))
            } catch (error: Throwable) {
                promise.reject("ERR_VDF_NATIVE", "Native VDF solve failed", error)
            } finally {
                release(jobId, handle)
            }
        }
    }

    private fun reserve(jobId: String): Long? = synchronized(lock) {
        if (activeJob != null) return@synchronized null
        val handle = nativeCreateJob()
        if (handle == 0L) return@synchronized null
        activeJob = ActiveJob(jobId, handle)
        handle
    }

    private fun release(jobId: String, handle: Long) {
        synchronized(lock) {
            if (activeJob?.id == jobId && activeJob?.handle == handle) {
                activeJob = null
                nativeDestroyJob(handle)
            }
        }
    }

    private fun resolveNativeResult(promise: Promise, result: Array<String>) {
        if (result.size != 2) {
            promise.reject("ERR_VDF_NATIVE", "Native VDF returned an invalid result")
            return
        }
        when (result[0]) {
            "0" -> promise.resolve(result[1])
            "1" -> promise.reject("ERR_VDF_INPUT", "Native VDF rejected the request")
            "2" -> promise.reject("ERR_VDF_CANCELLED", "VDF solving was cancelled")
            else -> promise.reject("ERR_VDF_NATIVE", "Native VDF solve failed")
        }
    }

    private fun normalizeIterations(value: Double): Int? {
        if (!value.isFinite() || value != floor(value) || value < 1.0 || value > MAX_ITERATIONS) {
            return null
        }
        return value.toInt()
    }

    private fun isValidJobId(value: String): Boolean =
        value.length in 1..128 && value.none { it.isWhitespace() || it == '\u0000' }

    private external fun nativeCreateJob(): Long
    private external fun nativeDestroyJob(handle: Long)
    private external fun nativeCancel(handle: Long)
    private external fun nativeEvaluate(
        handle: Long,
        jobId: String,
        modulusHex: String,
        baseHex: String,
        iterations: Int
    ): Array<String>

    private external fun nativeProve(
        handle: Long,
        jobId: String,
        modulusHex: String,
        baseHex: String,
        primeHex: String,
        iterations: Int
    ): Array<String>
}
