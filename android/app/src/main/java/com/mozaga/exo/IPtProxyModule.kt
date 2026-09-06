/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

package com.mozaga.exo

import android.util.Log
import com.facebook.react.bridge.*
import IPtProxy.Controller
import java.io.File

class IPtProxyModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "IPtProxy"
        private const val TRANSPORT_OBFS4 = "obfs4"
        private const val TRANSPORT_SNOWFLAKE = "snowflake"
        private const val TRANSPORT_WEBTUNNEL = "webtunnel"
        private val TRANSPORTS = listOf(TRANSPORT_OBFS4, TRANSPORT_SNOWFLAKE, TRANSPORT_WEBTUNNEL)
    }

    private fun debugLog(message: String) {
        if (BuildConfig.DEBUG) {
            Log.d(TAG, message)
        }
    }

    private fun infoLog(message: String) {
        Log.i(TAG, message)
    }

    private fun errorLog(message: String, throwable: Throwable? = null) {
        if (throwable != null) {
            Log.e(TAG, message, throwable)
        } else {
            Log.e(TAG, message)
        }
    }

    override fun getName(): String = "IPtProxyModule"

    private var controller: Controller? = null

    init {
        debugLog("IPtProxyModule initialized (Android)")
        debugLog("IPtProxy framework loaded")
    }

    private fun stateDir(): String {
        val dir = File(reactApplicationContext.filesDir, "pt_state")
        if (!dir.exists() && !dir.mkdirs()) {
            throw IllegalStateException("Failed to create IPtProxy state directory")
        }

        val testFile = File(dir, ".writetest")
        try {
            testFile.writeText("test")
            testFile.delete()
            debugLog("State directory is writable")
        } catch (e: Exception) {
            throw IllegalStateException("IPtProxy state directory is not writable", e)
        }
        return dir.absolutePath
    }

    private fun ensureController(): Controller {
        controller?.let {
            debugLog("Reusing existing controller")
            return it
        }
        debugLog("Creating new controller")
        val dir = stateDir()
        val logLevel = if (BuildConfig.DEBUG) "DEBUG" else "NOTICE"
        val c = Controller(dir, true, false, logLevel, null)
        debugLog("Controller created successfully")
        controller = c
        return c
    }

    private fun startTransport(
        transport: String,
        promise: Promise,
        configure: (Controller) -> Unit = {}
    ) {
        debugLog("startTransport($transport)")
        try {
            val c = ensureController()
            configure(c)
            infoLog("Starting $transport transport")
            c.start(transport, "")
            val port = c.port(transport)
            debugLog("$transport started on local port $port")
            promise.resolve(Arguments.createMap().apply { putInt("port", port.toInt()) })
        } catch (e: Exception) {
            errorLog("$transport start failed: ${e.message}", e)
            promise.reject("ERR_START", "Failed to start $transport: ${e.message}", e)
        }
    }

    @ReactMethod
    fun startObfs4(promise: Promise) {
        startTransport(TRANSPORT_OBFS4, promise)
    }

    @ReactMethod
    fun startSnowflake(promise: Promise) {
        startTransport(TRANSPORT_SNOWFLAKE, promise) { c ->
            val iceServers = "stun:stun.l.google.com:19302,stun:stun.l.google.com:5349"
            val brokerUrl = "https://snowflake-broker.torproject.net/"
            val frontDomains = "cdn.sstatic.net,www.phpmyadmin.net"

            debugLog("Configuring snowflake transport")

            c.snowflakeIceServers = iceServers
            c.snowflakeBrokerUrl = brokerUrl
            c.snowflakeFrontDomains = frontDomains
        }
    }

    @ReactMethod
    fun startWebtunnel(promise: Promise) {
        startTransport(TRANSPORT_WEBTUNNEL, promise)
    }

    @ReactMethod
    fun stopTransports(promise: Promise) {
        debugLog("stopTransports()")
        try {
            val c = controller ?: run {
                debugLog("No controller — nothing to stop")
                promise.resolve(null)
                return
            }
            for (transport in TRANSPORTS) {
                val port = c.port(transport)
                if (port > 0) {
                    infoLog("Stopping $transport transport")
                    c.stop(transport)
                    debugLog("$transport stopped")
                } else {
                    debugLog("$transport not running, skipping")
                }
            }
            debugLog("All transports stopped")
            promise.resolve(null)
        } catch (e: Exception) {
            errorLog("stopTransports failed: ${e.message}", e)
            promise.reject("ERR_STOP", "Failed to stop transports: ${e.message}", e)
        }
    }
}
