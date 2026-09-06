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
import com.facebook.react.bridge.ReadableArray
import com.tencent.mmkv.MMKV
import java.util.concurrent.Executors

class AppKeyValueModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val executor = Executors.newSingleThreadExecutor()
    private val mmkv: MMKV by lazy {
        MMKV.mmkvWithID(MMKV_ID, MMKV.SINGLE_PROCESS_MODE)
    }

    override fun getName(): String = "AppKeyValueModule"

    @ReactMethod
    fun getItem(key: String, promise: Promise) {
        executor.execute {
            try {
                promise.resolve(mmkv.decodeString(key))
            } catch (error: Throwable) {
                promise.reject("ERR_KV_GET", "KV get failed", error)
            }
        }
    }

    @ReactMethod
    fun setItem(key: String, value: String, promise: Promise) {
        executor.execute {
            try {
                if (!mmkv.encode(key, value)) {
                    promise.reject("ERR_KV_SET", "KV set failed")
                    return@execute
                }
                promise.resolve(null)
            } catch (error: Throwable) {
                promise.reject("ERR_KV_SET", "KV set failed", error)
            }
        }
    }

    @ReactMethod
    fun removeItem(key: String, promise: Promise) {
        executor.execute {
            try {
                mmkv.removeValueForKey(key)
                promise.resolve(null)
            } catch (error: Throwable) {
                promise.reject("ERR_KV_REMOVE", "KV remove failed", error)
            }
        }
    }

    @ReactMethod
    fun getAllKeys(promise: Promise) {
        executor.execute {
            try {
                val keys = Arguments.createArray()
                mmkv.allKeys()?.forEach { keys.pushString(it) }
                promise.resolve(keys)
            } catch (error: Throwable) {
                promise.reject("ERR_KV_KEYS", "KV list failed", error)
            }
        }
    }

    @ReactMethod
    fun multiGet(keys: ReadableArray, promise: Promise) {
        executor.execute {
            try {
                val result = Arguments.createArray()
                for (index in 0 until keys.size()) {
                    val key = keys.getString(index) ?: continue
                    val pair = Arguments.createArray()
                    pair.pushString(key)
                    val value = mmkv.decodeString(key)
                    if (value == null) pair.pushNull() else pair.pushString(value)
                    result.pushArray(pair)
                }
                promise.resolve(result)
            } catch (error: Throwable) {
                promise.reject("ERR_KV_MULTI_GET", "KV multiGet failed", error)
            }
        }
    }

    @ReactMethod
    fun multiSet(entries: ReadableArray, promise: Promise) {
        executor.execute {
            try {
                for (index in 0 until entries.size()) {
                    val pair = entries.getArray(index) ?: continue
                    val key = pair.getString(0) ?: continue
                    val value = pair.getString(1) ?: continue
                    if (!mmkv.encode(key, value)) {
                        promise.reject("ERR_KV_MULTI_SET", "KV multiSet failed")
                        return@execute
                    }
                }
                promise.resolve(null)
            } catch (error: Throwable) {
                promise.reject("ERR_KV_MULTI_SET", "KV multiSet failed", error)
            }
        }
    }

    @ReactMethod
    fun multiRemove(keys: ReadableArray, promise: Promise) {
        executor.execute {
            try {
                val toRemove = Array(keys.size()) { index -> keys.getString(index) }
                    .filterNotNull()
                    .toTypedArray()
                if (toRemove.isNotEmpty()) {
                    mmkv.removeValuesForKeys(toRemove)
                }
                promise.resolve(null)
            } catch (error: Throwable) {
                promise.reject("ERR_KV_MULTI_REMOVE", "KV multiRemove failed", error)
            }
        }
    }

    @ReactMethod
    fun clear(promise: Promise) {
        executor.execute {
            try {
                mmkv.clearAll()
                promise.resolve(null)
            } catch (error: Throwable) {
                promise.reject("ERR_KV_CLEAR", "KV clear failed", error)
            }
        }
    }

    companion object {
        private const val MMKV_ID = "spectra-kv"
    }
}
