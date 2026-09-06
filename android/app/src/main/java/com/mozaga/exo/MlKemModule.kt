/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

package com.mozaga.exo

import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.concurrent.Executors

class MlKemModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val PUBLIC_KEY_BYTES = 1184
        private const val SECRET_KEY_BYTES = 2400
        private const val CIPHERTEXT_BYTES = 1088
        private const val SHARED_SECRET_BYTES = 32

        init {
            System.loadLibrary("mlkem_jni")
        }
    }

    private val executor = Executors.newSingleThreadExecutor()

    override fun getName(): String = "MlKemModule"

    external fun nativeEncaps(publicKey: ByteArray): ByteArray?
    external fun nativeDecaps(secretKey: ByteArray, ciphertext: ByteArray): ByteArray?
    external fun nativeKeygen(): ByteArray?

    @ReactMethod
    fun generateKeyPair(promise: Promise) {
        executor.execute {
            val packed = try {
                nativeKeygen()
            } catch (_: Throwable) {
                promise.reject("MLKEM_KEYGEN", "native ML-KEM-768 keygen failed")
                return@execute
            }
            if (packed == null || packed.size != PUBLIC_KEY_BYTES + SECRET_KEY_BYTES) {
                packed?.fill(0)
                promise.reject("MLKEM_KEYGEN", "native ML-KEM-768 keygen failed")
                return@execute
            }
            try {
                val publicKey = packed.copyOfRange(0, PUBLIC_KEY_BYTES)
                val secretKey = packed.copyOfRange(PUBLIC_KEY_BYTES, packed.size)
                val result = Arguments.createMap()
                result.putString("publicKey", Base64.encodeToString(publicKey, Base64.NO_WRAP))
                result.putString("privateKey", Base64.encodeToString(secretKey, Base64.NO_WRAP))
                secretKey.fill(0)
                promise.resolve(result)
            } catch (_: Throwable) {
                promise.reject("MLKEM_KEYGEN", "native ML-KEM-768 keygen failed")
            } finally {
                packed.fill(0)
            }
        }
    }

    @ReactMethod
    fun encapsulate(publicKeyBase64: String, promise: Promise) {
        executor.execute {
            try {
                val publicKey = Base64.decode(publicKeyBase64, Base64.DEFAULT)
                val packed = nativeEncaps(publicKey)
                if (packed == null || packed.size != CIPHERTEXT_BYTES + SHARED_SECRET_BYTES) {
                    packed?.fill(0)
                    promise.reject("MLKEM_ENCAPS", "native ML-KEM-768 encaps failed")
                    return@execute
                }
                val ciphertext = packed.copyOfRange(0, CIPHERTEXT_BYTES)
                val sharedSecret = packed.copyOfRange(CIPHERTEXT_BYTES, packed.size)
                packed.fill(0)
                val result = Arguments.createMap()
                result.putString("ciphertext", Base64.encodeToString(ciphertext, Base64.NO_WRAP))
                result.putString("sharedSecret", Base64.encodeToString(sharedSecret, Base64.NO_WRAP))
                sharedSecret.fill(0)
                promise.resolve(result)
            } catch (_: Throwable) {
                promise.reject("MLKEM_ENCAPS", "native ML-KEM-768 encaps failed")
            }
        }
    }

    @ReactMethod
    fun decapsulate(ciphertextBase64: String, secretKeyBase64: String, promise: Promise) {
        executor.execute {
            val secretKey = try {
                Base64.decode(secretKeyBase64, Base64.DEFAULT)
            } catch (_: Throwable) {
                promise.reject("MLKEM_DECAPS", "native ML-KEM-768 decaps failed")
                return@execute
            }
            try {
                val ciphertext = Base64.decode(ciphertextBase64, Base64.DEFAULT)
                val sharedSecret = nativeDecaps(secretKey, ciphertext)
                if (sharedSecret == null || sharedSecret.size != SHARED_SECRET_BYTES) {
                    promise.reject("MLKEM_DECAPS", "native ML-KEM-768 decaps failed")
                    return@execute
                }
                promise.resolve(Base64.encodeToString(sharedSecret, Base64.NO_WRAP))
                sharedSecret.fill(0)
            } catch (_: Throwable) {
                promise.reject("MLKEM_DECAPS", "native ML-KEM-768 decaps failed")
            } finally {
                secretKey.fill(0)
            }
        }
    }
}
