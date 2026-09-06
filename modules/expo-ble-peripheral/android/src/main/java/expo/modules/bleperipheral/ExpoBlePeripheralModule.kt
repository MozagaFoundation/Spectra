/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

package expo.modules.bleperipheral

import android.bluetooth.*
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.BluetoothLeAdvertiser
import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import android.util.Base64
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import java.util.IdentityHashMap
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList

class ExpoBlePeripheralModule : Module() {

  companion object {
    private const val TAG = "BLE::Peripheral:Android"
    private const val MAX_PENDING_NOTIFICATIONS = 64
    private const val MAX_WRITE_BYTES = 512
    private const val FALLBACK_VALUE_BYTES = 182
    private const val STARTUP_TIMEOUT_MS = 10_000L
    private const val ADVERTISE_RETRY_MS = 1_000L
    private const val ADVERTISE_RETRY_MAX_MS = 30_000L
    private const val NOTIFICATION_RETRY_MS = 50L
    private const val NOTIFICATION_CONFIRM_TIMEOUT_MS = 5_000L
    private const val NOTIFICATION_TOMBSTONE_GRACE_MS = 5_000L
    private const val MAX_NOTIFICATION_RETRIES = 120
    private val READY_FRAME = byteArrayOf(0x53, 0x42, 0x02, 0x7F)
    private val CLIENT_CHARACTERISTIC_CONFIG_UUID: UUID =
      UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")
  }

  private data class PendingNotification(
    val data: ByteArray,
    val device: BluetoothDevice,
    val gattGeneration: Long,
    val promise: Promise? = null,
    val attempts: Int = 0
  )

  private var bluetoothManager: BluetoothManager? = null
  private var bluetoothAdapter: BluetoothAdapter? = null
  private var advertiser: BluetoothLeAdvertiser? = null
  private var gattServer: BluetoothGattServer? = null

  private var writeCharacteristic: BluetoothGattCharacteristic? = null
  private var notifyCharacteristic: BluetoothGattCharacteristic? = null

  private var serviceUUID: UUID? = null
  private var isCurrentlyAdvertising = false
  private var gattServiceReady = false
  private var pendingStartPromise: Promise? = null
  private var startupGeneration = 0L
  private var activeAdvertiseCallback: AdvertiseCallback? = null
  private var startupTimeout: Runnable? = null
  @Volatile private var activeGattGeneration = 0L
  private val connectedDevices = CopyOnWriteArrayList<BluetoothDevice>()
  private val subscribedDevices = CopyOnWriteArrayList<BluetoothDevice>()
  private var linkOffer: ByteArray? = null
  private var advertiseRetryDelayMs = ADVERTISE_RETRY_MS
  private var advertiseRetry: Runnable? = null
  private val pendingNotifications = CopyOnWriteArrayList<PendingNotification>()
  private val inFlightNotifications = ConcurrentHashMap<String, PendingNotification>()
  private val notificationTombstones = ConcurrentHashMap<String, Long>()
  private val deviceValueBudgets = ConcurrentHashMap<String, Int>()
  private val serviceGenerations = IdentityHashMap<BluetoothGattService, Long>()
  private val mainHandler = Handler(Looper.getMainLooper())
  private val notificationFlushRunnable = Runnable { flushPendingNotifications() }
  private var notificationFlushScheduled = false
  private var notificationCompletionTimeout: Runnable? = null

  override fun definition() = ModuleDefinition {
    Name("ExpoBlePeripheral")

    Events("onPeripheralEvent")

    AsyncFunction("startAdvertising") { serviceUUID: String, writeCharUUID: String, notifyCharUUID: String, linkOfferBase64: String, promise: Promise ->
      mainHandler.post {
        handleStartAdvertising(serviceUUID, writeCharUUID, notifyCharUUID, linkOfferBase64, promise)
      }
    }

    AsyncFunction("stopAdvertising") { promise: Promise ->
      mainHandler.post { handleStopAdvertising(promise) }
    }

    Function("isAdvertising") {
      isCurrentlyAdvertising
    }

    AsyncFunction("sendNotification") { base64Data: String, centralId: String?, promise: Promise ->
      mainHandler.post { handleSendNotification(base64Data, centralId, promise) }
    }

    AsyncFunction("cancelNotifications") { centralId: String, promise: Promise ->
      mainHandler.post { handleCancelNotifications(centralId, promise) }
    }

    OnDestroy {
      cleanup()
    }
  }

  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context is null" }

  // ============================================================
  // START ADVERTISING
  // ============================================================

  private fun handleStartAdvertising(
    svcUUID: String,
    writeUUID: String,
    notifyUUID: String,
    linkOfferBase64: String,
    promise: Promise
  ) {
    log("startAdvertising: service=$svcUUID write=$writeUUID notify=$notifyUUID")

    try {
      if (isCurrentlyAdvertising) {
        log("startAdvertising: already advertising")
        promise.resolve(true)
        return
      }

      if (pendingStartPromise != null) {
        logWarn("startAdvertising: advertising startup already in progress")
        promise.resolve(false)
        return
      }

      bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
      bluetoothAdapter = bluetoothManager?.adapter

      if (bluetoothAdapter == null || bluetoothAdapter?.isEnabled != true) {
        logError("Bluetooth adapter not available or not enabled")
        sendEvent("onPeripheralEvent", mapOf("type" to "bluetoothOff"))
        promise.resolve(false)
        return
      }

      advertiser = bluetoothAdapter?.bluetoothLeAdvertiser
      if (advertiser == null) {
        logError("BLE advertising not supported on this device")
        sendEvent("onPeripheralEvent", mapOf("type" to "unsupported"))
        promise.resolve(false)
        return
      }

      val parsedServiceUUID = UUID.fromString(svcUUID)
      val writeUuid = UUID.fromString(writeUUID)
      val notifyUuid = UUID.fromString(notifyUUID)

      serviceUUID = parsedServiceUUID
      linkOffer = decodeLinkOffer(linkOfferBase64)
      advertiseRetryDelayMs = ADVERTISE_RETRY_MS
      startupGeneration += 1
      val generation = startupGeneration
      pendingStartPromise = promise
      gattServiceReady = false
      scheduleStartupTimeout(generation)

      val serviceAddRequested = setupGattServer(
        parsedServiceUUID,
        writeUuid,
        notifyUuid,
        generation
      )
      if (!serviceAddRequested) {
        resolvePendingStart(false)
      }
    } catch (e: Exception) {
      cancelStartupTimeout()
      pendingStartPromise = null
      logError("startAdvertising failed: ${e.message}")
      sendEvent("onPeripheralEvent", mapOf("type" to "error", "error" to (e.message ?: "Unknown error")))
      promise.resolve(false)
    }
  }

  private fun setupGattServer(
    svcUUID: UUID,
    writeUUID: UUID,
    notifyUUID: UUID,
    generation: Long
  ): Boolean {
    log("Setting up GATT server: svc=$svcUUID write=$writeUUID notify=$notifyUUID")

    gattServer?.close()
    gattServer = null
    gattServiceReady = false
    clearNotifications()
    activeGattGeneration = generation
    notificationTombstones.clear()

    gattServer = bluetoothManager?.openGattServer(
      context,
      createGattServerCallback(generation)
    )
    if (gattServer == null) {
      logError("Failed to open GATT server")
      return false
    }

    val writeCharacteristic = BluetoothGattCharacteristic(
      writeUUID,
      BluetoothGattCharacteristic.PROPERTY_WRITE or BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE,
      BluetoothGattCharacteristic.PERMISSION_WRITE
    )

    val notifyCharacteristic = BluetoothGattCharacteristic(
      notifyUUID,
      BluetoothGattCharacteristic.PROPERTY_NOTIFY,
      0
    )

    val cccd = BluetoothGattDescriptor(
      CLIENT_CHARACTERISTIC_CONFIG_UUID,
      BluetoothGattDescriptor.PERMISSION_READ or BluetoothGattDescriptor.PERMISSION_WRITE
    )
    notifyCharacteristic.addDescriptor(cccd)

    this.writeCharacteristic = writeCharacteristic
    this.notifyCharacteristic = notifyCharacteristic

    val service = BluetoothGattService(svcUUID, BluetoothGattService.SERVICE_TYPE_PRIMARY)
    service.addCharacteristic(writeCharacteristic)
    service.addCharacteristic(notifyCharacteristic)
    serviceGenerations[service] = generation

    val added = gattServer?.addService(service) ?: false
    log("GATT service add requested: $added")
    return added
  }

  private fun startBleAdvertising(svcUUID: UUID, generation: Long) {
    log("Starting BLE advertising for service $svcUUID")

    val settings = AdvertiseSettings.Builder()
      .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
      .setConnectable(true)
      .setTimeout(0)
      .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM)
      .build()

    val data = AdvertiseData.Builder()
      .setIncludeDeviceName(false)
      .addServiceUuid(ParcelUuid(svcUUID))
      .build()

    val scanResponse = AdvertiseData.Builder()
      .setIncludeDeviceName(false)
      .apply {
        linkOffer?.let { offer -> addServiceData(ParcelUuid(svcUUID), offer) }
      }
      .build()

    val callback = createAdvertiseCallback(generation)
    activeAdvertiseCallback = callback
    advertiser?.startAdvertising(settings, data, scanResponse, callback)
  }

  // ============================================================
  // STOP ADVERTISING
  // ============================================================

  private fun handleStopAdvertising(promise: Promise) {
    log("stopAdvertising called")

    startupGeneration += 1
    activeGattGeneration = startupGeneration
    cancelAdvertiseRetry()
    resolvePendingStart(false)
    gattServiceReady = false

    try {
      activeAdvertiseCallback?.let { advertiser?.stopAdvertising(it) }
      activeAdvertiseCallback = null
      isCurrentlyAdvertising = false
    } catch (e: Exception) {
      logWarn("Error stopping advertising: ${e.message}")
    }

    try {
      gattServer?.close()
      gattServer = null
    } catch (e: Exception) {
      logWarn("Error closing GATT server: ${e.message}")
    }

    subscribedDevices.clear()
    connectedDevices.clear()
    clearNotifications()
    deviceValueBudgets.clear()
    serviceGenerations.clear()
    sendEvent("onPeripheralEvent", mapOf("type" to "advertisingStopped"))
    log("Advertising and GATT server stopped")
    promise.resolve(null)
  }

  // ============================================================
  // SEND NOTIFICATION
  // ============================================================

  private fun handleSendNotification(base64Data: String, centralId: String?, promise: Promise) {
    val server = gattServer
    val characteristic = notifyCharacteristic

    if (server == null || characteristic == null || !gattServiceReady) {
      logWarn("sendNotification: GATT server or notify characteristic not ready")
      promise.resolve(false)
      return
    }

    val data = try {
      Base64.decode(base64Data, Base64.NO_WRAP)
    } catch (e: Exception) {
      logError("sendNotification: invalid base64 — ${e.message}")
      promise.resolve(false)
      return
    }

    val targets = if (centralId != null) {
      subscribedDevices.filter { deviceIdMatches(it.address, centralId) }
    } else {
      subscribedDevices.toList()
    }

    if (targets.size != 1) {
      logWarn("sendNotification: no subscribed devices to notify (centralId=$centralId, total=${subscribedDevices.size})")
      promise.resolve(false)
      return
    }
    val device = targets[0]
    if (data.size > (deviceValueBudgets[device.address] ?: FALLBACK_VALUE_BYTES)) {
      logWarn("sendNotification: data exceeds negotiated value budget")
      promise.resolve(false)
      return
    }

    enqueueNotification(PendingNotification(
      data,
      device,
      activeGattGeneration,
      promise
    ))
  }

  private fun handleCancelNotifications(centralId: String, promise: Promise) {
    promise.resolve(cancelDeviceNotifications(centralId))
  }

  private fun cancelDeviceNotifications(centralId: String): Int {
    val cancelled = pendingNotifications.filter { deviceIdMatches(it.device.address, centralId) }
    cancelled.forEach { it.promise?.resolve(false) }
    pendingNotifications.removeAll { deviceIdMatches(it.device.address, centralId) }
    val inFlight = inFlightNotifications.entries
      .firstOrNull { deviceIdMatches(it.key, centralId) }
      ?.value
    if (inFlight != null) {
      inFlight.promise?.resolve(false)
    }
    return cancelled.size + if (inFlight == null) 0 else 1
  }

  private fun deviceIdMatches(left: String, right: String): Boolean {
    return left.equals(right, ignoreCase = true)
  }

  // ============================================================
  // ADVERTISE CALLBACK
  // ============================================================

  private fun createAdvertiseCallback(generation: Long): AdvertiseCallback {
    return object : AdvertiseCallback() {
      override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {
        if (generation != startupGeneration || pendingStartPromise == null) {
          advertiser?.stopAdvertising(this)
          return
        }
        activeAdvertiseCallback = this
        isCurrentlyAdvertising = true
        advertiseRetryDelayMs = ADVERTISE_RETRY_MS
        log("Advertising started successfully — discoverable by other devices (mode=${settingsInEffect?.mode}, txPower=${settingsInEffect?.txPowerLevel})")
        sendEvent("onPeripheralEvent", mapOf("type" to "advertisingStarted"))
        resolvePendingStart(true)
      }

      override fun onStartFailure(errorCode: Int) {
        if (generation != startupGeneration || pendingStartPromise == null) return
        activeAdvertiseCallback = null
        isCurrentlyAdvertising = false
        val reason = when (errorCode) {
          ADVERTISE_FAILED_DATA_TOO_LARGE -> "data too large"
          ADVERTISE_FAILED_TOO_MANY_ADVERTISERS -> "too many advertisers"
          ADVERTISE_FAILED_ALREADY_STARTED -> "already started"
          ADVERTISE_FAILED_INTERNAL_ERROR -> "internal error"
          ADVERTISE_FAILED_FEATURE_UNSUPPORTED -> "feature unsupported"
          else -> "unknown ($errorCode)"
        }
        logError("Advertising failed: $reason (code=$errorCode)")
        sendEvent("onPeripheralEvent", mapOf("type" to "error", "error" to "Advertising failed: $reason"))
        if (errorCode == ADVERTISE_FAILED_ALREADY_STARTED) {
          isCurrentlyAdvertising = true
          resolvePendingStart(true)
          return
        }
        scheduleAdvertiseRetry(generation)
        if (pendingStartPromise != null) {
          resolvePendingStart(false)
        }
      }
    }
  }

  // ============================================================
  // GATT SERVER CALLBACK
  // ============================================================

  private fun createGattServerCallback(generation: Long): BluetoothGattServerCallback {
    return object : BluetoothGattServerCallback() {

    override fun onServiceAdded(status: Int, service: BluetoothGattService?) {
      mainHandler.post {
        if (generation != activeGattGeneration) return@post
        val serviceGeneration = service?.let { serviceGenerations.remove(it) }
        if (
          serviceGeneration == null
          || serviceGeneration != startupGeneration
          || pendingStartPromise == null
        ) return@post
        if (status == BluetoothGatt.GATT_SUCCESS) {
          log("GATT service added successfully: ${service.uuid}")
          gattServiceReady = true
          val currentServiceUUID = serviceUUID
          if (currentServiceUUID != null) {
            startBleAdvertising(currentServiceUUID, serviceGeneration)
          } else {
            logError("Service UUID missing when service add completed")
            resolvePendingStart(false)
          }
        } else {
          logError("GATT service add failed with status $status")
          gattServiceReady = false
          sendEvent("onPeripheralEvent", mapOf("type" to "error", "error" to "Failed to add GATT service"))
          resolvePendingStart(false)
        }
      }
    }

    override fun onConnectionStateChange(device: BluetoothDevice?, status: Int, newState: Int) {
      mainHandler.post {
        if (generation != activeGattGeneration) return@post
        val addr = device?.address?.take(8) ?: "unknown"
        when (newState) {
          BluetoothProfile.STATE_CONNECTED -> {
            log("Central connected: $addr... (status=$status)")
            device?.let { d ->
              if (!connectedDevices.any { it.address == d.address }) {
                connectedDevices.add(d)
              }
            }
            sendEvent("onPeripheralEvent", mapOf(
              "type" to "centralConnected",
              "centralId" to (device?.address ?: ""),
              "maxPayloadBytes" to FALLBACK_VALUE_BYTES
            ))
          }
          BluetoothProfile.STATE_DISCONNECTED -> {
            log("Central disconnected: $addr... (status=$status)")
            device?.let { d ->
              connectedDevices.removeAll { it.address == d.address }
              subscribedDevices.removeAll { it.address == d.address }
              cancelDeviceNotifications(d.address)
              deviceValueBudgets.remove(d.address)
            }
            sendEvent("onPeripheralEvent", mapOf(
              "type" to "centralDisconnected",
              "centralId" to (device?.address ?: "")
            ))
          }
        }
      }
    }

    override fun onCharacteristicWriteRequest(
      device: BluetoothDevice?,
      requestId: Int,
      characteristic: BluetoothGattCharacteristic?,
      preparedWrite: Boolean,
      responseNeeded: Boolean,
      offset: Int,
      value: ByteArray?
    ) {
      val requestValue = value?.clone()
      mainHandler.post {
        if (generation != activeGattGeneration) return@post
        val addr = device?.address?.take(8) ?: "unknown"
        val dataSize = requestValue?.size ?: 0
        log("Write request from $addr...: ${dataSize}B (char=${characteristic?.uuid}, responseNeeded=$responseNeeded)")

        if (characteristic?.uuid != writeCharacteristic?.uuid) {
          if (responseNeeded) {
            gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_REQUEST_NOT_SUPPORTED, offset, null)
          }
          return@post
        }

        if (preparedWrite || offset != 0) {
          if (responseNeeded) {
            gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_INVALID_OFFSET, offset, null)
          }
          return@post
        }

        if (requestValue == null || requestValue.isEmpty() || requestValue.size > MAX_WRITE_BYTES) {
          if (responseNeeded) {
            gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_INVALID_ATTRIBUTE_LENGTH, 0, null)
          }
          return@post
        }

        if (device == null) {
          if (responseNeeded) {
            gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_WRITE_NOT_PERMITTED, 0, null)
          }
          return@post
        }
        if (!connectedDevices.any { it.address == device.address }) {
          connectedDevices.add(device)
        }
        if (!subscribedDevices.any { it.address == device.address }) {
          subscribedDevices.add(device)
        }

        val base64 = Base64.encodeToString(requestValue, Base64.NO_WRAP)
        sendEvent("onPeripheralEvent", mapOf(
          "type" to "dataReceived",
          "centralId" to device.address,
          "data" to base64
        ))

        if (responseNeeded) {
          gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, null)
        }
      }
    }

    override fun onMtuChanged(device: BluetoothDevice?, mtu: Int) {
      mainHandler.post {
        if (generation != activeGattGeneration) return@post
        device?.let {
          deviceValueBudgets[it.address] = (mtu - 3).coerceIn(1, MAX_WRITE_BYTES)
        }
      }
    }

    override fun onDescriptorWriteRequest(
      device: BluetoothDevice?,
      requestId: Int,
      descriptor: BluetoothGattDescriptor?,
      preparedWrite: Boolean,
      responseNeeded: Boolean,
      offset: Int,
      value: ByteArray?
    ) {
      val descriptorValue = value?.clone()
      mainHandler.post {
        if (generation != activeGattGeneration) return@post
        val addr = device?.address?.take(8) ?: "unknown"
        var responseHandled = false
        if (descriptor?.uuid == CLIENT_CHARACTERISTIC_CONFIG_UUID) {
          if (descriptorValue != null && descriptorValue.contentEquals(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE)) {
            log("Central $addr... subscribed to notifications")
            device?.let { d ->
              if (!subscribedDevices.any { it.address == d.address }) {
                subscribedDevices.add(d)
              }
            }
            if (responseNeeded) {
              gattServer?.sendResponse(
                device,
                requestId,
                BluetoothGatt.GATT_SUCCESS,
                offset,
                descriptorValue
              )
              responseHandled = true
            }
            sendEvent("onPeripheralEvent", mapOf(
              "type" to "centralSubscribed",
              "centralId" to (device?.address ?: ""),
              "maxPayloadBytes" to (
                device?.let { deviceValueBudgets[it.address] } ?: FALLBACK_VALUE_BYTES
              )
            ))
            device?.let { target ->
              repeat(3) {
                enqueueNotification(PendingNotification(
                  READY_FRAME,
                  target,
                  activeGattGeneration
                ))
              }
            }
          } else if (descriptorValue != null && descriptorValue.contentEquals(BluetoothGattDescriptor.DISABLE_NOTIFICATION_VALUE)) {
            log("Central $addr... unsubscribed from notifications")
            device?.let { d ->
              subscribedDevices.removeAll { it.address == d.address }
              cancelDeviceNotifications(d.address)
              deviceValueBudgets.remove(d.address)
            }
            sendEvent("onPeripheralEvent", mapOf(
              "type" to "centralUnsubscribed",
              "centralId" to (device?.address ?: "")
            ))
          }
        }

        if (responseNeeded && !responseHandled) {
          gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, descriptorValue)
        }
      }
    }

    override fun onCharacteristicReadRequest(
      device: BluetoothDevice?,
      requestId: Int,
      offset: Int,
      characteristic: BluetoothGattCharacteristic?
    ) {
      mainHandler.post {
        if (generation != activeGattGeneration) return@post
        val addr = device?.address?.take(8) ?: "unknown"
        log("Read request from $addr... for char=${characteristic?.uuid}")
        gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_READ_NOT_PERMITTED, 0, null)
      }
    }

    override fun onNotificationSent(device: BluetoothDevice?, status: Int) {
      mainHandler.post {
        if (generation != activeGattGeneration) return@post
        val address = device?.address ?: return@post
        if (notificationTombstones.remove(address) != null) return@post
        val pending = inFlightNotifications.remove(address) ?: return@post
        cancelNotificationCompletionTimeout()
        if (status == BluetoothGatt.GATT_SUCCESS) {
          log("Notification confirmed by ${address.take(8)}...")
          pending.promise?.resolve(true)
        } else {
          logWarn("Notification to ${address.take(8)}... failed with status $status")
          pending.promise?.resolve(false)
        }

        flushPendingNotifications()
      }
    }
    }
  }

  // ============================================================
  // HELPERS
  // ============================================================

  private fun flushPendingNotifications() {
    notificationFlushScheduled = false
    if (pendingNotifications.isEmpty() || inFlightNotifications.isNotEmpty()) return
    val item = pendingNotifications[0]
    if (submitNotification(item)) {
      pendingNotifications.removeAt(0)
      return
    }
    if (item.attempts >= MAX_NOTIFICATION_RETRIES) {
      pendingNotifications.removeAt(0)
      item.promise?.resolve(false)
      flushPendingNotifications()
      return
    }
    pendingNotifications[0] = item.copy(attempts = item.attempts + 1)
    scheduleNotificationFlush()
  }

  private fun enqueueNotification(item: PendingNotification) {
    if (inFlightNotifications.isEmpty() && pendingNotifications.isEmpty()) {
      if (submitNotification(item)) return
    }
    if (pendingNotifications.size >= MAX_PENDING_NOTIFICATIONS) {
      if (item.promise == null) {
        val dropped = pendingNotifications.removeAt(pendingNotifications.lastIndex)
        dropped.promise?.resolve(false)
      } else {
        item.promise.resolve(false)
        return
      }
    }
    if (item.promise == null) pendingNotifications.add(0, item)
    else pendingNotifications.add(item)
    scheduleNotificationFlush()
  }

  private fun submitNotification(item: PendingNotification): Boolean {
    if (item.gattGeneration != activeGattGeneration) return false
    val tombstoneExpiry = notificationTombstones[item.device.address]
    if (tombstoneExpiry != null) {
      if (System.currentTimeMillis() < tombstoneExpiry) return false
      notificationTombstones.remove(item.device.address, tombstoneExpiry)
    }
    val server = gattServer ?: return false
    val characteristic = notifyCharacteristic ?: return false
    val success = try {
      sendGattNotification(server, item.device, characteristic, item.data)
    } catch (_: Exception) {
      false
    }
    if (success) {
      inFlightNotifications[item.device.address] = item
      scheduleNotificationCompletionTimeout(item)
    }
    return success
  }

  private fun scheduleNotificationFlush() {
    if (notificationFlushScheduled) return
    notificationFlushScheduled = true
    mainHandler.postDelayed(notificationFlushRunnable, NOTIFICATION_RETRY_MS)
  }

  private fun clearNotifications() {
    cancelNotificationCompletionTimeout()
    pendingNotifications.forEach { it.promise?.resolve(false) }
    inFlightNotifications.values.forEach { it.promise?.resolve(false) }
    pendingNotifications.clear()
    inFlightNotifications.clear()
    notificationTombstones.clear()
    notificationFlushScheduled = false
    mainHandler.removeCallbacks(notificationFlushRunnable)
  }

  private fun scheduleNotificationCompletionTimeout(item: PendingNotification) {
    cancelNotificationCompletionTimeout()
    val timeout = Runnable {
      if (
        item.gattGeneration != activeGattGeneration
        || inFlightNotifications[item.device.address] !== item
      ) return@Runnable
      inFlightNotifications.remove(item.device.address)
      val tombstoneExpiry = System.currentTimeMillis() + NOTIFICATION_TOMBSTONE_GRACE_MS
      notificationTombstones[item.device.address] = tombstoneExpiry
      mainHandler.postDelayed({
        if (notificationTombstones.remove(item.device.address, tombstoneExpiry)) {
          flushPendingNotifications()
        }
      }, NOTIFICATION_TOMBSTONE_GRACE_MS)
      item.promise?.resolve(false)
      val dropped = pendingNotifications.filter {
        it.device.address == item.device.address
      }
      dropped.forEach { it.promise?.resolve(false) }
      pendingNotifications.removeAll {
        it.device.address == item.device.address
      }
      gattServer?.cancelConnection(item.device)
      flushPendingNotifications()
    }
    notificationCompletionTimeout = timeout
    mainHandler.postDelayed(timeout, NOTIFICATION_CONFIRM_TIMEOUT_MS)
  }

  private fun cancelNotificationCompletionTimeout() {
    notificationCompletionTimeout?.let { mainHandler.removeCallbacks(it) }
    notificationCompletionTimeout = null
  }

  private fun scheduleStartupTimeout(generation: Long) {
    cancelStartupTimeout()
    val timeout = Runnable {
      if (generation != startupGeneration || pendingStartPromise == null) return@Runnable
      activeAdvertiseCallback?.let { advertiser?.stopAdvertising(it) }
      activeAdvertiseCallback = null
      isCurrentlyAdvertising = false
      resolvePendingStart(false)
    }
    startupTimeout = timeout
    mainHandler.postDelayed(timeout, STARTUP_TIMEOUT_MS)
  }

  private fun cancelStartupTimeout() {
    startupTimeout?.let { mainHandler.removeCallbacks(it) }
    startupTimeout = null
  }

  private fun resolvePendingStart(success: Boolean) {
    cancelStartupTimeout()
    pendingStartPromise?.resolve(success)
    pendingStartPromise = null
  }

  private fun sendGattNotification(
    server: BluetoothGattServer,
    device: BluetoothDevice,
    characteristic: BluetoothGattCharacteristic,
    data: ByteArray
  ): Boolean {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      server.notifyCharacteristicChanged(device, characteristic, false, data) == BluetoothStatusCodes.SUCCESS
    } else {
      @Suppress("DEPRECATION")
      characteristic.value = data
      @Suppress("DEPRECATION")
      server.notifyCharacteristicChanged(device, characteristic, false)
    }
  }

  private fun cleanup() {
    log("cleanup: tearing down")
    startupGeneration += 1
    activeGattGeneration = startupGeneration
    cancelStartupTimeout()
    cancelAdvertiseRetry()
    try {
      activeAdvertiseCallback?.let { advertiser?.stopAdvertising(it) }
    } catch (_: Exception) {}
    try {
      gattServer?.close()
    } catch (_: Exception) {}
    isCurrentlyAdvertising = false
    gattServiceReady = false
    resolvePendingStart(false)
    activeAdvertiseCallback = null
    subscribedDevices.clear()
    connectedDevices.clear()
    clearNotifications()
    deviceValueBudgets.clear()
    serviceGenerations.clear()
  }

  private fun decodeLinkOffer(value: String): ByteArray? {
    if (value.isEmpty()) return null
    return try {
      val decoded = Base64.decode(value, Base64.NO_WRAP)
      if (decoded.size == 8) decoded else null
    } catch (_: Exception) {
      null
    }
  }

  private fun scheduleAdvertiseRetry(generation: Long) {
    cancelAdvertiseRetry()
    val delay = advertiseRetryDelayMs
    advertiseRetryDelayMs = (advertiseRetryDelayMs * 2).coerceAtMost(ADVERTISE_RETRY_MAX_MS)
    val retry = Runnable {
      if (generation != startupGeneration) return@Runnable
      val svcUUID = serviceUUID ?: return@Runnable
      startBleAdvertising(svcUUID, generation)
    }
    advertiseRetry = retry
    mainHandler.postDelayed(retry, delay)
  }

  private fun cancelAdvertiseRetry() {
    advertiseRetry?.let { mainHandler.removeCallbacks(it) }
    advertiseRetry = null
  }

  private fun log(msg: String) = Log.d(TAG, msg)
  private fun logWarn(msg: String) = Log.w(TAG, msg)
  private fun logError(msg: String) = Log.e(TAG, msg)
}
