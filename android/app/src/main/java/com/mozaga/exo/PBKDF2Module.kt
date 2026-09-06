/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

package com.mozaga.exo

import android.util.Base64
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.Arrays
import java.util.concurrent.Executors
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

class PBKDF2Module(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val KEY_LENGTH_BITS = 256
        private const val MAX_ITERATIONS = 2_000_000
    }

    private val executor = Executors.newSingleThreadExecutor()

    override fun getName(): String = "PBKDF2Module"

    @ReactMethod
    fun deriveKey(pin: String, salt: String, iterations: Int, promise: Promise) {
        executor.execute {
            try {
                if (pin.isEmpty()) {
                    promise.reject("ERR_PIN", "PIN must not be empty")
                    return@execute
                }
                if (iterations <= 0 || iterations > MAX_ITERATIONS) {
                    promise.reject("ERR_ITERATIONS", "Invalid PBKDF2 iteration count")
                    return@execute
                }

                val saltBytes = Base64.decode(salt, Base64.DEFAULT)
                val passwordBytes = pin.toByteArray(Charsets.UTF_8)
                val key = pbkdf2HmacSha256(passwordBytes, saltBytes, iterations, KEY_LENGTH_BITS / 8)
                Arrays.fill(passwordBytes, 0)
                promise.resolve(Base64.encodeToString(key, Base64.NO_WRAP))
            } catch (error: Throwable) {
                promise.reject("ERR_DERIVE", "PBKDF2 failed", error)
            }
        }
    }

    private fun pbkdf2HmacSha256(
        password: ByteArray,
        salt: ByteArray,
        iterations: Int,
        dkLen: Int
    ): ByteArray {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(password, "HmacSHA256"))
        val hLen = mac.macLength
        val blockCount = (dkLen + hLen - 1) / hLen
        val derived = ByteArray(dkLen)
        var offset = 0

        for (blockIndex in 1..blockCount) {
            val block = salt + byteArrayOf(
                (blockIndex ushr 24).toByte(),
                (blockIndex ushr 16).toByte(),
                (blockIndex ushr 8).toByte(),
                blockIndex.toByte()
            )
            var u = mac.doFinal(block)
            val t = u.copyOf()

            for (round in 2..iterations) {
                u = mac.doFinal(u)
                for (index in t.indices) {
                    t[index] = (t[index].toInt() xor u[index].toInt()).toByte()
                }
            }

            val bytesToCopy = minOf(hLen, dkLen - offset)
            System.arraycopy(t, 0, derived, offset, bytesToCopy)
            offset += bytesToCopy
        }

        return derived
    }
}
