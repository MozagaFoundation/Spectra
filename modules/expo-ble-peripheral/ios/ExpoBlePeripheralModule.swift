/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import ExpoModulesCore
import CoreBluetooth

private let TAG = "[BLE::Peripheral:iOS]"
private let READY_FRAME = Data([0x53, 0x42, 0x02, 0x7F])

private struct PendingNotification {
  let data: Data
  let centrals: [CBCentral]?
  let promise: Promise?
}

private final class PeripheralManagerDelegateProxy: NSObject, CBPeripheralManagerDelegate {
  weak var owner: ExpoBlePeripheralModule?

  init(owner: ExpoBlePeripheralModule) {
    self.owner = owner
  }

  func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
    owner?.handlePeripheralManagerDidUpdateState(peripheral)
  }

  func peripheralManager(_ peripheral: CBPeripheralManager, didAdd service: CBService, error: Error?) {
    owner?.handlePeripheralManager(peripheral, didAdd: service, error: error)
  }

  func peripheralManagerDidStartAdvertising(_ peripheral: CBPeripheralManager, error: Error?) {
    owner?.handlePeripheralManagerDidStartAdvertising(peripheral, error: error)
  }

  func peripheralManager(_ peripheral: CBPeripheralManager, central: CBCentral, didSubscribeTo characteristic: CBCharacteristic) {
    owner?.handlePeripheralManager(peripheral, central: central, didSubscribeTo: characteristic)
  }

  func peripheralManager(_ peripheral: CBPeripheralManager, central: CBCentral, didUnsubscribeFrom characteristic: CBCharacteristic) {
    owner?.handlePeripheralManager(peripheral, central: central, didUnsubscribeFrom: characteristic)
  }

  func peripheralManager(_ peripheral: CBPeripheralManager, didReceiveWrite requests: [CBATTRequest]) {
    owner?.handlePeripheralManager(peripheral, didReceiveWrite: requests)
  }

  func peripheralManager(_ peripheral: CBPeripheralManager, didReceiveRead request: CBATTRequest) {
    owner?.handlePeripheralManager(peripheral, didReceiveRead: request)
  }

  func peripheralManagerIsReady(toUpdateSubscribers peripheral: CBPeripheralManager) {
    owner?.handlePeripheralManagerIsReady(toUpdateSubscribers: peripheral)
  }
}

public class ExpoBlePeripheralModule: Module {

  // MARK: - State

  private var peripheralManager: CBPeripheralManager?
  private var writeCharacteristic: CBMutableCharacteristic?
  private var notifyCharacteristic: CBMutableCharacteristic?

  private var subscribedCentrals: [CBCentral] = []
  private var pendingNotifications: [PendingNotification] = []
  private var advertisingRequested = false
  private var pendingStartPromise: Promise?
  private var startupGeneration: UInt64 = 0
  private var startupTimeout: DispatchWorkItem?
  private var serviceGenerations: [ObjectIdentifier: UInt64] = [:]
  private var serviceReadyGeneration: UInt64?
  private var advertisingCallbackGeneration: UInt64?

  private var serviceUUID: CBUUID?
  private var writeCharUUID: CBUUID?
  private var notifyCharUUID: CBUUID?

  private let queue = DispatchQueue(label: "expo.ble.peripheral", qos: .userInitiated)
  private lazy var peripheralDelegate = PeripheralManagerDelegateProxy(owner: self)
  private let maxPendingNotifications = 64
  private let maxWriteBytes = 512
  private let startupTimeoutSeconds = 10.0

  // MARK: - Module Definition

  public func definition() -> ModuleDefinition {
    Name("ExpoBlePeripheral")

    Events("onPeripheralEvent")

    AsyncFunction("startAdvertising") { (serviceUUID: String, writeCharUUID: String, notifyCharUUID: String, _: String, promise: Promise) in
      self.queue.async {
        self.handleStartAdvertising(serviceUUID: serviceUUID, writeCharUUID: writeCharUUID, notifyCharUUID: notifyCharUUID, promise: promise)
      }
    }

    AsyncFunction("stopAdvertising") { (promise: Promise) in
      self.queue.async {
        self.handleStopAdvertising(promise: promise)
      }
    }

    Function("isAdvertising") {
      return self.peripheralManager?.isAdvertising ?? false
    }

    AsyncFunction("sendNotification") { (base64Data: String, centralId: String?, promise: Promise) in
      self.queue.async {
        self.handleSendNotification(base64Data: base64Data, centralId: centralId, promise: promise)
      }
    }

    AsyncFunction("cancelNotifications") { (centralId: String, promise: Promise) in
      self.queue.async {
        self.handleCancelNotifications(centralId: centralId, promise: promise)
      }
    }

    OnDestroy {
      self.cleanup()
    }
  }

  // MARK: - Start Advertising

  private func handleStartAdvertising(serviceUUID: String, writeCharUUID: String, notifyCharUUID: String, promise: Promise) {
    log("startAdvertising called — service=\(serviceUUID) write=\(writeCharUUID) notify=\(notifyCharUUID)")

    if peripheralManager?.isAdvertising == true && advertisingCallbackGeneration == nil {
      log("Already advertising, resolving immediately")
      promise.resolve(true)
      return
    }
    if peripheralManager?.isAdvertising == true {
      peripheralManager?.stopAdvertising()
    }

    if pendingStartPromise != nil {
      logWarn("Advertising startup already in progress")
      promise.resolve(false)
      return
    }

    self.serviceUUID = CBUUID(string: serviceUUID)
    self.writeCharUUID = CBUUID(string: writeCharUUID)
    self.notifyCharUUID = CBUUID(string: notifyCharUUID)
    startupGeneration &+= 1
    self.advertisingRequested = true
    self.pendingStartPromise = promise
    scheduleStartupTimeout(generation: startupGeneration)

    if peripheralManager == nil {
      log("Creating CBPeripheralManager...")
      peripheralManager = CBPeripheralManager(delegate: peripheralDelegate, queue: queue)
      log("CBPeripheralManager created, waiting for state callback")
    } else if peripheralManager?.state == .poweredOn {
      setupServiceAndAdvertise(generation: startupGeneration)
    }
  }

  // MARK: - Stop Advertising

  private func handleStopAdvertising(promise: Promise) {
    log("stopAdvertising called")
    startupGeneration &+= 1
    advertisingRequested = false
    resolvePendingStart(false)

    if let pm = peripheralManager {
      if pm.isAdvertising {
        pm.stopAdvertising()
        log("Advertising stopped")
      }
      pm.removeAllServices()
      log("All services removed")
    }

    subscribedCentrals.removeAll()
    clearPendingNotifications()
    serviceGenerations.removeAll()
    serviceReadyGeneration = nil
    writeCharacteristic = nil
    notifyCharacteristic = nil
    sendEvent("onPeripheralEvent", ["type": "advertisingStopped"])
    promise.resolve(nil)
  }

  // MARK: - Send Notification

  private func handleSendNotification(base64Data: String, centralId: String?, promise: Promise) {
    guard let characteristic = notifyCharacteristic else {
      logWarn("sendNotification: notify characteristic not set up yet")
      promise.resolve(false)
      return
    }

    guard let data = Data(base64Encoded: base64Data) else {
      logError("sendNotification: invalid base64 data")
      promise.resolve(false)
      return
    }

    var targets: [CBCentral]? = nil
    if let targetId = centralId {
      targets = subscribedCentrals.filter { centralMatches($0, targetId) }
      if targets?.isEmpty ?? true {
        logWarn("sendNotification: central \(targetId.prefix(8))... not found in subscribers (\(subscribedCentrals.count) subscribed)")
        promise.resolve(false)
        return
      }
    }

    if targets == nil && subscribedCentrals.isEmpty {
      logWarn("sendNotification: no subscribed centrals")
      promise.resolve(false)
      return
    }

    let activeTargets = targets ?? subscribedCentrals
    if let maxPayload = activeTargets.map({ $0.maximumUpdateValueLength }).min(), data.count > maxPayload {
      logWarn("sendNotification: data length \(data.count) exceeds central maximumUpdateValueLength \(maxPayload)")
      promise.resolve(false)
      return
    }

    guard let pm = peripheralManager else {
      logError("sendNotification: peripheral manager nil")
      promise.resolve(false)
      return
    }

    let success = pm.updateValue(data, for: characteristic, onSubscribedCentrals: targets)

    if !success {
      if pendingNotifications.count >= maxPendingNotifications {
        logWarn("Notification queue full (\(pendingNotifications.count)) — dropping retry")
        promise.resolve(false)
        return
      }
      pendingNotifications.append(PendingNotification(
        data: data,
        centrals: targets,
        promise: promise
      ))
      log("Notification queued (BLE buffer full) — pending=\(pendingNotifications.count) data=\(data.count)B")
    } else {
      log("Notification sent — \(data.count)B to \(targets?.count ?? subscribedCentrals.count) central(s)")
      promise.resolve(true)
    }
  }

  private func handleCancelNotifications(centralId: String, promise: Promise) {
    let cancelled = pendingNotifications.filter { item in
      item.centrals?.contains(where: { centralMatches($0, centralId) }) == true
    }
    cancelled.forEach { $0.promise?.resolve(false) }
    pendingNotifications.removeAll { item in
      item.centrals?.contains(where: { centralMatches($0, centralId) }) == true
    }
    promise.resolve(cancelled.count)
  }

  private func centralMatches(_ central: CBCentral, _ targetId: String) -> Bool {
    central.identifier.uuidString.caseInsensitiveCompare(targetId) == .orderedSame
  }

  // MARK: - Service Setup

  private func setupServiceAndAdvertise(generation: UInt64) {
    guard advertisingRequested, generation == startupGeneration else { return }
    guard let svcUUID = serviceUUID,
          let wUUID = writeCharUUID,
          let nUUID = notifyCharUUID else {
      logError("setupServiceAndAdvertise: UUIDs not configured")
      return
    }

    guard let pm = peripheralManager, pm.state == .poweredOn else {
      logWarn("setupServiceAndAdvertise: peripheral manager not powered on (state=\(peripheralManager?.state.rawValue ?? -1))")
      return
    }

    if pm.isAdvertising {
      log("Already advertising, skipping setup")
      return
    }

    pm.removeAllServices()

    let writeCharacteristic = CBMutableCharacteristic(
      type: wUUID,
      properties: [.write, .writeWithoutResponse],
      value: nil,
      permissions: [.writeable]
    )

    let notifyCharacteristic = CBMutableCharacteristic(
      type: nUUID,
      properties: [.notify],
      value: nil,
      permissions: []
    )
    self.writeCharacteristic = writeCharacteristic
    self.notifyCharacteristic = notifyCharacteristic

    let service = CBMutableService(type: svcUUID, primary: true)
    service.characteristics = [writeCharacteristic, notifyCharacteristic]
    serviceGenerations[ObjectIdentifier(service)] = generation
    serviceReadyGeneration = nil

    log("Adding GATT service: svc=\(svcUUID) write=\(wUUID) notify=\(nUUID)")
    pm.add(service)
  }

  private func startAdvertising(on peripheral: CBPeripheralManager, generation: UInt64) {
    guard advertisingRequested, generation == startupGeneration else { return }
    guard advertisingCallbackGeneration == nil else {
      log("Waiting for previous advertising callback")
      return
    }
    guard let serviceUUID = serviceUUID else {
      logError("startAdvertising: service UUID not configured")
      pendingStartPromise?.resolve(false)
      pendingStartPromise = nil
      return
    }

    advertisingCallbackGeneration = generation
    peripheral.startAdvertising([
      CBAdvertisementDataServiceUUIDsKey: [serviceUUID],
    ])
  }

  // MARK: - Cleanup

  private func cleanup() {
    log("cleanup: tearing down peripheral manager")
    peripheralManager?.stopAdvertising()
    peripheralManager?.removeAllServices()
    peripheralManager?.delegate = nil
    peripheralManager = nil
    subscribedCentrals.removeAll()
    clearPendingNotifications()
    serviceGenerations.removeAll()
    serviceReadyGeneration = nil
    advertisingCallbackGeneration = nil
    writeCharacteristic = nil
    notifyCharacteristic = nil
    advertisingRequested = false
    resolvePendingStart(false)
  }

  // MARK: - CBPeripheralManagerDelegate

  fileprivate func handlePeripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
    let stateStr: String
    switch peripheral.state {
    case .poweredOn: stateStr = "poweredOn"
    case .poweredOff: stateStr = "poweredOff"
    case .unauthorized: stateStr = "unauthorized"
    case .unsupported: stateStr = "unsupported"
    case .resetting: stateStr = "resetting"
    case .unknown: stateStr = "unknown"
    @unknown default: stateStr = "unknown(\(peripheral.state.rawValue))"
    }

    log("peripheralManagerDidUpdateState: \(stateStr)")
    sendEvent("onPeripheralEvent", ["type": "stateChanged", "state": stateStr])

    switch peripheral.state {
    case .poweredOn:
      if advertisingRequested {
        log("Bluetooth powered on — setting up service and advertising")
        setupServiceAndAdvertise(generation: startupGeneration)
      }

    case .poweredOff:
      log("Bluetooth powered off — clearing peripheral state")
      startupGeneration &+= 1
      advertisingRequested = false
      subscribedCentrals.removeAll()
      clearPendingNotifications()
      serviceGenerations.removeAll()
      serviceReadyGeneration = nil
      writeCharacteristic = nil
      notifyCharacteristic = nil
      resolvePendingStart(false)
      sendEvent("onPeripheralEvent", ["type": "bluetoothOff"])

    case .unauthorized:
      logError("Bluetooth unauthorized — user denied permission")
      startupGeneration &+= 1
      advertisingRequested = false
      serviceReadyGeneration = nil
      resolvePendingStart(false)
      sendEvent("onPeripheralEvent", ["type": "unauthorized"])

    case .unsupported:
      logError("Bluetooth LE peripheral unsupported on this device")
      startupGeneration &+= 1
      advertisingRequested = false
      serviceReadyGeneration = nil
      resolvePendingStart(false)
      sendEvent("onPeripheralEvent", ["type": "unsupported"])

    default:
      break
    }
  }

  fileprivate func handlePeripheralManager(_ peripheral: CBPeripheralManager, didAdd service: CBService, error: Error?) {
    let generation = serviceGenerations.removeValue(forKey: ObjectIdentifier(service))
    guard let generation,
          advertisingRequested,
          generation == startupGeneration else {
      if let mutableService = service as? CBMutableService {
        peripheral.remove(mutableService)
      }
      return
    }
    if let error = error {
      logError("Failed to add GATT service: \(error.localizedDescription)")
      resolvePendingStart(false)
      sendEvent("onPeripheralEvent", ["type": "error", "error": "Failed to add service: \(error.localizedDescription)"])
      return
    }

    log("GATT service added successfully — starting advertising")
    serviceReadyGeneration = generation
    startAdvertising(on: peripheral, generation: generation)
  }

  fileprivate func handlePeripheralManagerDidStartAdvertising(_ peripheral: CBPeripheralManager, error: Error?) {
    guard let generation = advertisingCallbackGeneration else {
      peripheral.stopAdvertising()
      return
    }
    advertisingCallbackGeneration = nil
    guard advertisingRequested,
          pendingStartPromise != nil,
          generation == startupGeneration else {
      peripheral.stopAdvertising()
      if advertisingRequested,
         pendingStartPromise != nil,
         serviceReadyGeneration == startupGeneration {
        startAdvertising(on: peripheral, generation: startupGeneration)
      }
      return
    }
    if let error = error {
      logError("Failed to start advertising: \(error.localizedDescription)")
      advertisingRequested = false
      resolvePendingStart(false)
      sendEvent("onPeripheralEvent", ["type": "error", "error": "Advertising failed: \(error.localizedDescription)"])
      return
    }

    log("Advertising started successfully — discoverable by other devices")
    sendEvent("onPeripheralEvent", ["type": "advertisingStarted"])
    resolvePendingStart(true)
  }

  fileprivate func handlePeripheralManager(_ peripheral: CBPeripheralManager, central: CBCentral, didSubscribeTo _: CBCharacteristic) {
    let centralId = central.identifier.uuidString
    if !subscribedCentrals.contains(where: { $0.identifier == central.identifier }) {
      subscribedCentrals.append(central)
    }
    log("Central subscribed: \(centralId.prefix(8))... maxPayload=\(central.maximumUpdateValueLength) subscribers=\(subscribedCentrals.count)")

    sendEvent("onPeripheralEvent", [
      "type": "centralSubscribed",
      "centralId": centralId,
      "maxPayloadBytes": central.maximumUpdateValueLength,
    ])
    scheduleReadyFrames(to: central)
  }

  fileprivate func handlePeripheralManager(_ peripheral: CBPeripheralManager, central: CBCentral, didUnsubscribeFrom _: CBCharacteristic) {
    let centralId = central.identifier.uuidString
    subscribedCentrals.removeAll { $0.identifier == central.identifier }
    log("Central unsubscribed: \(centralId.prefix(8))... remaining=\(subscribedCentrals.count) pending=\(pendingNotifications.count)")
    let removed = pendingNotifications.filter { item in
      item.centrals?.contains(where: { $0.identifier == central.identifier }) == true
    }
    removed.forEach { $0.promise?.resolve(false) }
    pendingNotifications.removeAll { item in
      item.centrals?.contains(where: { $0.identifier == central.identifier }) == true
    }

    sendEvent("onPeripheralEvent", [
      "type": "centralUnsubscribed",
      "centralId": centralId,
    ])

    if !peripheral.isAdvertising && advertisingRequested {
      log("Restarting advertising after central unsubscribed")
      startAdvertising(on: peripheral, generation: startupGeneration)
    }
  }

  fileprivate func handlePeripheralManager(_ peripheral: CBPeripheralManager, didReceiveWrite requests: [CBATTRequest]) {
    log("Received \(requests.count) write request(s)")

    for request in requests {
      let centralId = request.central.identifier.uuidString

      guard request.characteristic.uuid == writeCharUUID else {
        logWarn("Rejecting write to unexpected characteristic \(request.characteristic.uuid)")
        peripheral.respond(to: request, withResult: .requestNotSupported)
        continue
      }

      guard request.offset == 0 else {
        logWarn("Rejecting offset write from \(centralId.prefix(8))... (offset=\(request.offset))")
        peripheral.respond(to: request, withResult: .invalidOffset)
        continue
      }

      guard let data = request.value else {
        logWarn("Write request from \(centralId.prefix(8))... has no data")
        peripheral.respond(to: request, withResult: .invalidAttributeValueLength)
        continue
      }

      guard !data.isEmpty && data.count <= maxWriteBytes else {
        logWarn("Rejecting write from \(centralId.prefix(8))... with invalid length \(data.count)")
        peripheral.respond(to: request, withResult: .invalidAttributeValueLength)
        continue
      }

      if !subscribedCentrals.contains(where: { $0.identifier == request.central.identifier }) {
        subscribedCentrals.append(request.central)
      }

      log("Write from central \(centralId.prefix(8))...: \(data.count) bytes (char=\(request.characteristic.uuid))")

      let base64 = data.base64EncodedString()

      sendEvent("onPeripheralEvent", [
        "type": "dataReceived",
        "centralId": centralId,
        "data": base64,
      ])

      peripheral.respond(to: request, withResult: .success)
    }
  }

  fileprivate func handlePeripheralManager(_ peripheral: CBPeripheralManager, didReceiveRead request: CBATTRequest) {
    let centralId = request.central.identifier.uuidString
    log("Read request from \(centralId.prefix(8))... for char=\(request.characteristic.uuid)")
    peripheral.respond(to: request, withResult: .readNotPermitted)
  }

  fileprivate func handlePeripheralManagerIsReady(toUpdateSubscribers peripheral: CBPeripheralManager) {
    log("Peripheral ready to update subscribers — flushing \(pendingNotifications.count) pending notification(s)")

    guard let characteristic = notifyCharacteristic else { return }

    var sent = 0
    while !pendingNotifications.isEmpty {
      let item = pendingNotifications[0]
      let success = peripheral.updateValue(item.data, for: characteristic, onSubscribedCentrals: item.centrals)
      if success {
        pendingNotifications.removeFirst()
        item.promise?.resolve(true)
        sent += 1
      } else {
        break
      }
    }

    if sent > 0 {
      log("Flushed \(sent) pending notification(s), \(pendingNotifications.count) remaining")
    }
  }

  private func scheduleReadyFrames(to central: CBCentral) {
    let delays: [Double] = [0, 0.05, 0.15]
    for delay in delays {
      queue.asyncAfter(deadline: .now() + delay) { [weak self] in
        self?.enqueueReadyFrame(to: central)
      }
    }
  }

  private func enqueueReadyFrame(to central: CBCentral) {
    guard let peripheral = peripheralManager,
          let characteristic = notifyCharacteristic,
          subscribedCentrals.contains(where: { $0.identifier == central.identifier }) else { return }
    let sent = peripheral.updateValue(
      READY_FRAME,
      for: characteristic,
      onSubscribedCentrals: [central]
    )
    if sent { return }
    if pendingNotifications.count >= maxPendingNotifications {
      let dropped = pendingNotifications.removeLast()
      dropped.promise?.resolve(false)
    }
    pendingNotifications.insert(PendingNotification(
      data: READY_FRAME,
      centrals: [central],
      promise: nil
    ), at: 0)
  }

  private func scheduleStartupTimeout(generation: UInt64) {
    startupTimeout?.cancel()
    let timeout = DispatchWorkItem { [weak self] in
      guard let self,
            self.advertisingRequested,
            generation == self.startupGeneration else { return }
      self.logWarn("Advertising startup timed out")
      self.advertisingRequested = false
      self.peripheralManager?.stopAdvertising()
      self.peripheralManager?.removeAllServices()
      self.resolvePendingStart(false)
    }
    startupTimeout = timeout
    queue.asyncAfter(deadline: .now() + startupTimeoutSeconds, execute: timeout)
  }

  private func resolvePendingStart(_ success: Bool) {
    startupTimeout?.cancel()
    startupTimeout = nil
    pendingStartPromise?.resolve(success)
    pendingStartPromise = nil
  }

  private func clearPendingNotifications() {
    pendingNotifications.forEach { $0.promise?.resolve(false) }
    pendingNotifications.removeAll()
  }

  // MARK: - Logging

  private func log(_ message: String) {
    print("\(TAG) \(message)")
  }

  private func logWarn(_ message: String) {
    print("\(TAG) [WARN] \(message)")
  }

  private func logError(_ message: String) {
    print("\(TAG) [ERROR] \(message)")
  }
}
