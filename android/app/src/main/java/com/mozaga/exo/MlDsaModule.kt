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
import java.util.concurrent.Executors

class MlDsaModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        init {
            System.loadLibrary("mldsa_jni")
        }
    }

    private val executor = Executors.newSingleThreadExecutor()

    override fun getName(): String = "MlDsaModule"

    external fun nativeVerify(publicKey: ByteArray, signature: ByteArray, message: ByteArray): Boolean
    external fun nativeSign(secretKey: ByteArray, message: ByteArray): ByteArray?

    @ReactMethod
    fun verify(messageBase64: String, signatureBase64: String, publicKeyBase64: String, promise: Promise) {
        executor.execute {
            try {
                val message = if (messageBase64.isEmpty()) {
                    ByteArray(0)
                } else {
                    Base64.decode(messageBase64, Base64.DEFAULT)
                }
                val signature = Base64.decode(signatureBase64, Base64.DEFAULT)
                val publicKey = Base64.decode(publicKeyBase64, Base64.DEFAULT)
                promise.resolve(nativeVerify(publicKey, signature, message))
            } catch (_: Throwable) {
                promise.resolve(false)
            }
        }
    }

    @ReactMethod
    fun sign(messageBase64: String, secretKeyBase64: String, promise: Promise) {
        executor.execute {
            val secretKey = try {
                Base64.decode(secretKeyBase64, Base64.DEFAULT)
            } catch (_: Throwable) {
                promise.reject("MLDSA_SIGN", "native ML-DSA-65 sign failed")
                return@execute
            }
            try {
                val message = if (messageBase64.isEmpty()) {
                    ByteArray(0)
                } else {
                    Base64.decode(messageBase64, Base64.DEFAULT)
                }
                val signature = nativeSign(secretKey, message)
                if (signature == null) {
                    promise.reject("MLDSA_SIGN", "native ML-DSA-65 sign failed")
                    return@execute
                }
                promise.resolve(Base64.encodeToString(signature, Base64.NO_WRAP))
            } catch (_: Throwable) {
                promise.reject("MLDSA_SIGN", "native ML-DSA-65 sign failed")
            } finally {
                secretKey.fill(0)
            }
        }
    }
}
