/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const state = {
    scanCallback: null as null | ((error: unknown, device: unknown) => void),
    monitorCallbacks: [] as Array<(error: unknown, characteristic: unknown) => void>,
    disconnectCallbacks: [] as Array<() => void>,
    peripheralListener: null as null | ((event: unknown) => void),
    adapterCallbacks: [] as Array<(state: string) => void>,
    device: null as any,
  }
  const manager = {
    onStateChange: vi.fn((callback: (state: string) => void, emitCurrent?: boolean) => {
      state.adapterCallbacks.push(callback)
      if (emitCurrent !== false) queueMicrotask(() => callback('PoweredOn'))
      return { remove: vi.fn() }
    }),
    startDeviceScan: vi.fn((
      _services: string[],
      _options: unknown,
      callback: (error: unknown, device: unknown) => void,
    ) => {
      state.scanCallback = callback
    }),
    stopDeviceScan: vi.fn(),
    connectToDevice: vi.fn(async () => state.device),
    onDeviceDisconnected: vi.fn((_deviceId: string, callback: () => void) => {
      state.disconnectCallbacks.push(callback)
      return { remove: vi.fn() }
    }),
    cancelDeviceConnection: vi.fn(async () => {}),
    writeCharacteristicWithResponseForDevice: vi.fn(async () => {}),
  }
  return {
    state,
    manager,
    platform: { OS: 'ios', Version: '26.0' },
    monitorRemove: vi.fn(),
    peripheralRemove: vi.fn(),
    startAdvertising: vi.fn(async () => true),
    stopAdvertising: vi.fn(async () => {}),
    sendNotification: vi.fn(async () => false),
    cancelNotifications: vi.fn(async () => 0),
  }
})

vi.mock('react-native', () => ({
  Platform: mocks.platform,
  PermissionsAndroid: {
    PERMISSIONS: {
      BLUETOOTH_SCAN: 'android.permission.BLUETOOTH_SCAN',
      BLUETOOTH_CONNECT: 'android.permission.BLUETOOTH_CONNECT',
      BLUETOOTH_ADVERTISE: 'android.permission.BLUETOOTH_ADVERTISE',
      ACCESS_FINE_LOCATION: 'android.permission.ACCESS_FINE_LOCATION',
    },
    RESULTS: { GRANTED: 'granted' },
    request: vi.fn(async () => 'granted'),
    requestMultiple: vi.fn(async (permissions: string[]) => (
      Object.fromEntries(permissions.map((permission) => [permission, 'granted']))
    )),
  },
}))

vi.mock('react-native-ble-plx', () => ({
  BleManager: class {
    constructor() {
      return mocks.manager
    }
  },
}))

vi.mock('../../../modules/expo-ble-peripheral/src', () => ({
  addPeripheralListener: vi.fn((listener) => {
    mocks.state.peripheralListener = listener
    return { remove: mocks.peripheralRemove }
  }),
  startAdvertising: mocks.startAdvertising,
  stopAdvertising: mocks.stopAdvertising,
  isAdvertising: vi.fn(() => false),
  sendNotification: mocks.sendNotification,
  cancelNotifications: mocks.cancelNotifications,
}))

vi.mock('../logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

import {
  addEventListener,
  androidBleRuntimePermissions,
  connectToPeer,
  disconnectPeer,
  evictPeer,
  getPeerFrameBudget,
  getPeers,
  hasIncomingCentral,
  initialize,
  resolveCentralFrameBudget,
  resumeDiscovery,
  sendDataSequence,
  shouldDialPeer,
  shouldConnectPeer,
  shutdown,
  startAdvertising,
  startScanning,
  stopScanning,
  announceLinkOffer,
} from '../bleManager'
import { PermissionsAndroid } from 'react-native'
import { DEFAULT_BLE_MESH_CONFIG } from '../types'
import { encodeLinkOfferFrame } from '../linkOffer'

const DEVICE_ID = 'peer-device'
const READY_BASE64 = btoa(String.fromCharCode(0x53, 0x42, 0x02, 0x7f))

function createDevice(mtu = 185) {
  const device: any = {
    id: DEVICE_ID,
    mtu,
    discoverAllServicesAndCharacteristics: vi.fn(),
    characteristicsForService: vi.fn(async () => [
      {
        uuid: '7E57A100-2F5A-4E10-9C6B-61D4D8A2C002',
        isWritableWithResponse: true,
      },
      {
        uuid: '7E57A100-2F5A-4E10-9C6B-61D4D8A2C003',
        isNotifiable: true,
      },
    ]),
    monitorCharacteristicForService: vi.fn((
      _service: string,
      _characteristic: string,
      callback: (error: unknown, characteristic: unknown) => void,
    ) => {
      mocks.state.monitorCallbacks.push(callback)
      return { remove: mocks.monitorRemove }
    }),
  }
  device.discoverAllServicesAndCharacteristics.mockResolvedValue(device)
  return device
}

async function initializeAndDiscover(
  mtu = 185,
  dataCallback: (deviceId: string, data: Uint8Array) => void = vi.fn(),
): Promise<void> {
  mocks.state.device = createDevice(mtu)
  await initialize(
    { ...DEFAULT_BLE_MESH_CONFIG, enabled: true },
    dataCallback,
  )
  await startScanning()
  mocks.state.scanCallback?.(null, {
    id: DEVICE_ID,
    rssi: -40,
    name: 'Peer',
  })
}

describe('bleManager GATT lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    mocks.state.scanCallback = null
    mocks.state.monitorCallbacks = []
    mocks.state.disconnectCallbacks = []
    mocks.state.peripheralListener = null
    mocks.state.adapterCallbacks = []
    mocks.platform.OS = 'ios'
    mocks.platform.Version = '26.0'
  })

  afterEach(async () => {
    await shutdown()
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('resolves platform MTU reports without weakening the minimum check', () => {
    expect(resolveCentralFrameBudget(23, 'ios')).toEqual({
      bytes: 182,
      source: 'ios_fallback',
    })
    expect(resolveCentralFrameBudget(185, 'ios')).toEqual({
      bytes: 182,
      source: 'negotiated',
    })
    expect(resolveCentralFrameBudget(23, 'android')).toEqual({
      bytes: 20,
      source: 'negotiated',
    })
    expect(resolveCentralFrameBudget(517, 'android')).toEqual({
      bytes: 512,
      source: 'negotiated',
    })
    expect(resolveCentralFrameBudget(0, 'android')).toEqual({
      bytes: 0,
      source: 'fallback',
    })
    expect(resolveCentralFrameBudget(3, 'android')).toEqual({
      bytes: 0,
      source: 'fallback',
    })
    expect(resolveCentralFrameBudget('invalid', 'android')).toEqual({
      bytes: 0,
      source: 'fallback',
    })
  })

  it('scans with duplicate callbacks enabled for foreground rediscovery', async () => {
    await initializeAndDiscover()
    expect(mocks.manager.startDeviceScan).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ allowDuplicates: true }),
      expect.any(Function),
    )
  })

  it('keeps an incoming subscription when the first MTU report is the ATT default', async () => {
    await initializeAndDiscover(185)
    mocks.state.peripheralListener?.({
      type: 'centralSubscribed',
      centralId: 'incoming-android',
      maxPayloadBytes: 20,
    })

    expect(hasIncomingCentral()).toBe(true)
    expect(getPeerFrameBudget('incoming-android')).toBe(182)
    expect(shouldDialPeer('incoming-android')).toBe(false)
  })

  it('marks a central link ready as soon as notify is subscribed', async () => {
    await initializeAndDiscover()
    await expect(connectToPeer(DEVICE_ID)).resolves.toBe(true)

    expect(getPeers()[0]?.connectionState).toBe('connected')
    expect(mocks.manager.cancelDeviceConnection).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(8_001)
    expect(getPeers()).toHaveLength(1)
    expect(getPeers()[0]?.connectionState).toBe('connected')
  })

  it('ignores an old monitor callback after reconnecting the same device', async () => {
    await initializeAndDiscover()
    await connectToPeer(DEVICE_ID)
    const oldMonitor = mocks.state.monitorCallbacks[0]
    await evictPeer(DEVICE_ID)

    mocks.state.scanCallback?.(null, { id: DEVICE_ID, rssi: -35, name: 'Peer' })
    await connectToPeer(DEVICE_ID)
    const currentMonitor = mocks.state.monitorCallbacks[1]
    const cancellationsBefore = mocks.manager.cancelDeviceConnection.mock.calls.length

    oldMonitor(new Error('OperationCancelled'), null)
    expect(mocks.manager.cancelDeviceConnection).toHaveBeenCalledTimes(
      cancellationsBefore,
    )

    currentMonitor(null, { value: READY_BASE64 })
    expect(getPeers()[0]?.connectionState).toBe('connected')
  })

  it('keeps a merged iOS peer connected while either radio role is live', async () => {
    await initializeAndDiscover()
    await connectToPeer(DEVICE_ID)
    mocks.state.monitorCallbacks[0](null, { value: READY_BASE64 })
    mocks.state.peripheralListener?.({
      type: 'centralSubscribed',
      centralId: DEVICE_ID,
      maxPayloadBytes: 512,
    })
    expect(getPeerFrameBudget(DEVICE_ID)).toBe(182)

    mocks.state.peripheralListener?.({
      type: 'centralUnsubscribed',
      centralId: DEVICE_ID,
    })
    expect(getPeers()[0]?.connectionState).toBe('connected')
    expect(getPeerFrameBudget(DEVICE_ID)).toBe(182)

    mocks.state.peripheralListener?.({
      type: 'centralSubscribed',
      centralId: DEVICE_ID,
      maxPayloadBytes: 64,
    })
    expect(getPeerFrameBudget(DEVICE_ID)).toBe(64)
    mocks.state.disconnectCallbacks[0]()
    expect(getPeers()[0]?.connectionState).toBe('connected')
    expect(getPeerFrameBudget(DEVICE_ID)).toBe(64)

    mocks.state.peripheralListener?.({
      type: 'centralUnsubscribed',
      centralId: DEVICE_ID,
    })
    expect(getPeers()[0]?.connectionState).toBe('disconnected')
    expect(getPeerFrameBudget(DEVICE_ID)).toBe(182)
  })

  it('accepts peripheral writes only from a live subscribed central', async () => {
    const onData = vi.fn()
    await initializeAndDiscover(185, onData)
    const event = {
      type: 'dataReceived',
      centralId: DEVICE_ID,
      data: btoa(String.fromCharCode(1)),
    }

    mocks.state.peripheralListener?.(event)
    expect(onData).not.toHaveBeenCalled()

    mocks.state.peripheralListener?.({
      type: 'centralSubscribed',
      centralId: DEVICE_ID,
      maxPayloadBytes: 64,
    })
    mocks.state.peripheralListener?.(event)
    expect(onData).toHaveBeenCalledTimes(1)

    mocks.state.peripheralListener?.({
      type: 'centralUnsubscribed',
      centralId: DEVICE_ID,
    })
    mocks.state.peripheralListener?.(event)
    expect(onData).toHaveBeenCalledTimes(1)
  })

  it('uses the bounded fallback when iOS reports its placeholder MTU', async () => {
    await initializeAndDiscover(23)

    await expect(connectToPeer(DEVICE_ID)).resolves.toBe(true)

    expect(getPeerFrameBudget(DEVICE_ID)).toBe(182)
    expect(mocks.state.monitorCallbacks).toHaveLength(1)
  })

  it('accepts native-bounded notifications above the central write budget', async () => {
    const onData = vi.fn()
    await initializeAndDiscover(23, onData)
    await connectToPeer(DEVICE_ID)
    mocks.state.monitorCallbacks[0](null, { value: READY_BASE64 })
    const payload = new Uint8Array(300).fill(7)
    const value = btoa(String.fromCharCode(...payload))

    mocks.state.monitorCallbacks[0](null, { value })

    expect(onData).toHaveBeenCalledWith(DEVICE_ID, payload)
  })

  it('rejects a genuinely undersized Android value budget', async () => {
    mocks.platform.OS = 'android'
    await initializeAndDiscover(23)

    await expect(connectToPeer(DEVICE_ID)).resolves.toBe(false)

    expect(mocks.manager.cancelDeviceConnection).toHaveBeenCalledWith(DEVICE_ID)
    expect(mocks.state.monitorCallbacks).toHaveLength(0)
  })

  it('stops a queued frame sequence when its peer is evicted', async () => {
    await initializeAndDiscover()
    await connectToPeer(DEVICE_ID)
    mocks.state.monitorCallbacks[0](null, { value: READY_BASE64 })
    let releaseWrite!: () => void
    mocks.manager.writeCharacteristicWithResponseForDevice.mockImplementationOnce(
      () => new Promise<void>((resolve) => {
        releaseWrite = resolve
      }),
    )
    const sending = sendDataSequence(
      DEVICE_ID,
      [new Uint8Array(100).fill(1), new Uint8Array(100).fill(2)],
    )
    await vi.waitFor(() => {
      expect(mocks.manager.writeCharacteristicWithResponseForDevice).toHaveBeenCalledTimes(1)
    })
    await evictPeer(DEVICE_ID)
    releaseWrite()
    await vi.advanceTimersByTimeAsync(100)

    await expect(sending).resolves.toBe(false)
    expect(mocks.manager.writeCharacteristicWithResponseForDevice).toHaveBeenCalledTimes(1)
  })

  it('keeps a frame sequence when a second radio role becomes live', async () => {
    await initializeAndDiscover()
    await connectToPeer(DEVICE_ID)
    mocks.state.monitorCallbacks[0](null, { value: READY_BASE64 })
    let releaseWrite!: () => void
    mocks.manager.writeCharacteristicWithResponseForDevice.mockImplementationOnce(
      () => new Promise<void>((resolve) => {
        releaseWrite = resolve
      }),
    )

    const sending = sendDataSequence(
      DEVICE_ID,
      [new Uint8Array(100).fill(1), new Uint8Array(100).fill(2)],
    )
    await vi.waitFor(() => {
      expect(mocks.manager.writeCharacteristicWithResponseForDevice).toHaveBeenCalledTimes(1)
    })
    mocks.state.peripheralListener?.({
      type: 'centralSubscribed',
      centralId: DEVICE_ID,
      maxPayloadBytes: 64,
    })
    releaseWrite()
    await vi.advanceTimersByTimeAsync(100)

    await expect(sending).resolves.toBe(true)
    expect(mocks.manager.writeCharacteristicWithResponseForDevice).toHaveBeenCalledTimes(2)
  })

  it('keeps a delayed peripheral notify instead of failing the same ciphertext', async () => {
    await initializeAndDiscover()
    mocks.state.peripheralListener?.({
      type: 'centralSubscribed',
      centralId: DEVICE_ID,
      maxPayloadBytes: 64,
    })
    mocks.sendNotification.mockImplementationOnce(
      () => new Promise((resolve) => {
        setTimeout(() => resolve(true), 6_000)
      }),
    )

    const sending = sendDataSequence(DEVICE_ID, [new Uint8Array([1])])
    await vi.advanceTimersByTimeAsync(6_000)

    await expect(sending).resolves.toBe(true)
    expect(mocks.sendNotification).toHaveBeenCalledTimes(1)
    expect(mocks.cancelNotifications).not.toHaveBeenCalled()
  })

  it('retries a failed peripheral notify with the same ciphertext', async () => {
    await initializeAndDiscover()
    mocks.state.peripheralListener?.({
      type: 'centralSubscribed',
      centralId: DEVICE_ID,
      maxPayloadBytes: 64,
    })
    mocks.sendNotification
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)

    await expect(sendDataSequence(DEVICE_ID, [new Uint8Array([1])])).resolves.toBe(true)
    expect(mocks.sendNotification).toHaveBeenCalledTimes(2)
  })

  it('matches an incoming central id without requiring identical UUID case', async () => {
    const nativeId = 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE'
    await initializeAndDiscover()
    mocks.state.peripheralListener?.({
      type: 'centralSubscribed',
      centralId: nativeId,
      maxPayloadBytes: 64,
    })
    mocks.sendNotification.mockResolvedValueOnce(true)

    await expect(
      sendDataSequence(nativeId.toLowerCase(), [new Uint8Array([1])]),
    ).resolves.toBe(true)
    expect(mocks.sendNotification).toHaveBeenCalledWith(expect.any(String), nativeId)
  })

  it('cancels a hung peripheral notify instead of leaving it in flight', async () => {
    await initializeAndDiscover()
    mocks.state.peripheralListener?.({
      type: 'centralSubscribed',
      centralId: DEVICE_ID,
      maxPayloadBytes: 64,
    })
    mocks.sendNotification.mockImplementationOnce(() => new Promise(() => {}))

    const sending = sendDataSequence(DEVICE_ID, [new Uint8Array([1])])
    await vi.advanceTimersByTimeAsync(15_001)

    await expect(sending).resolves.toBe(false)
    expect(mocks.cancelNotifications).toHaveBeenCalledWith(DEVICE_ID)
  })

  it('does not bounce advertising when evicting an incoming-only peer', async () => {
    await initializeAndDiscover()
    await startAdvertising()
    mocks.state.peripheralListener?.({
      type: 'centralSubscribed',
      centralId: 'incoming-central',
      maxPayloadBytes: 64,
    })
    const startsBefore = mocks.startAdvertising.mock.calls.length

    await evictPeer('incoming-central')

    expect(mocks.stopAdvertising).not.toHaveBeenCalled()
    expect(mocks.startAdvertising).toHaveBeenCalledTimes(startsBefore)
    expect(getPeers().some((peer) => peer.deviceId === 'incoming-central')).toBe(false)
  })

  it('reports a live incoming central subscription', async () => {
    await initializeAndDiscover()
    expect(hasIncomingCentral()).toBe(false)
    mocks.state.peripheralListener?.({
      type: 'centralSubscribed',
      centralId: 'incoming-central',
      maxPayloadBytes: 64,
    })
    expect(hasIncomingCentral()).toBe(true)
    mocks.state.peripheralListener?.({
      type: 'centralUnsubscribed',
      centralId: 'incoming-central',
    })
    expect(hasIncomingCentral()).toBe(false)
  })

  it('keeps a disconnected peer discoverable so reconnect can reuse it', async () => {
    await initializeAndDiscover()
    await connectToPeer(DEVICE_ID)
    mocks.state.monitorCallbacks[0](null, { value: READY_BASE64 })

    await disconnectPeer(DEVICE_ID)

    expect(getPeers()).toEqual([
      expect.objectContaining({
        deviceId: DEVICE_ID,
        connectionState: 'disconnected',
      }),
    ])
    expect(mocks.stopAdvertising).not.toHaveBeenCalled()
  })

  it('does not drop an incoming central when disconnecting a reverse outbound', async () => {
    await initializeAndDiscover()
    await connectToPeer(DEVICE_ID)
    mocks.state.monitorCallbacks[0](null, { value: READY_BASE64 })
    mocks.state.peripheralListener?.({
      type: 'centralSubscribed',
      centralId: 'incoming-central',
      maxPayloadBytes: 64,
    })
    expect(hasIncomingCentral()).toBe(true)

    await disconnectPeer(DEVICE_ID)

    expect(hasIncomingCentral()).toBe(true)
    expect(getPeers().some((peer) => peer.deviceId === 'incoming-central')).toBe(true)
  })

  it('does not rebuild advertising when discovery resumes while already advertising', async () => {
    await initializeAndDiscover()
    await startAdvertising()
    const startsBefore = mocks.startAdvertising.mock.calls.length

    await resumeDiscovery()

    expect(mocks.startAdvertising).toHaveBeenCalledTimes(startsBefore)
  })

  it('emits disconnect after a central write timeout without duplicating the frame', async () => {
    const listener = vi.fn()
    await initializeAndDiscover()
    addEventListener(listener)
    await connectToPeer(DEVICE_ID)
    mocks.state.monitorCallbacks[0](null, { value: READY_BASE64 })
    let releaseWrite!: () => void
    mocks.manager.writeCharacteristicWithResponseForDevice.mockImplementationOnce(
      () => new Promise<void>((resolve) => {
        releaseWrite = resolve
      }),
    )
    mocks.monitorRemove.mockImplementationOnce(() => {
      throw new Error('monitor cleanup failed')
    })

    const sending = sendDataSequence(DEVICE_ID, [new Uint8Array([1])])
    await vi.waitFor(() => {
      expect(mocks.manager.writeCharacteristicWithResponseForDevice).toHaveBeenCalledTimes(1)
    })
    await vi.advanceTimersByTimeAsync(5_001)

    await expect(sending).resolves.toBe(false)
    expect(mocks.sendNotification).not.toHaveBeenCalled()
    expect(mocks.manager.cancelDeviceConnection).toHaveBeenCalledWith(DEVICE_ID)
    expect(getPeers()[0]?.connectionState).toBe('disconnected')
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      type: 'peer:disconnected',
    }))
    releaseWrite()
  })

  it('keeps the incoming role connected when an outgoing write times out', async () => {
    await initializeAndDiscover()
    await connectToPeer(DEVICE_ID)
    mocks.state.monitorCallbacks[0](null, { value: READY_BASE64 })
    mocks.state.peripheralListener?.({
      type: 'centralSubscribed',
      centralId: DEVICE_ID,
      maxPayloadBytes: 64,
    })
    mocks.sendNotification.mockResolvedValueOnce(true)
    mocks.manager.writeCharacteristicWithResponseForDevice.mockImplementationOnce(
      () => new Promise<void>(() => {}),
    )

    const sending = sendDataSequence(DEVICE_ID, [new Uint8Array([1])])
    await vi.waitFor(() => {
      expect(mocks.manager.writeCharacteristicWithResponseForDevice).toHaveBeenCalledTimes(1)
    })
    await vi.advanceTimersByTimeAsync(5_001)

    await expect(sending).resolves.toBe(true)
    expect(getPeers()[0]?.connectionState).toBe('connected')
    expect(mocks.sendNotification).toHaveBeenCalled()
  })

  it('ignores a cancelled notify callback on the live connection', async () => {
    await initializeAndDiscover()
    await connectToPeer(DEVICE_ID)
    mocks.state.monitorCallbacks[0](null, { value: READY_BASE64 })

    mocks.state.monitorCallbacks[0](new Error('OperationCancelled'), null)

    expect(getPeers()[0]?.connectionState).toBe('connected')
    expect(mocks.manager.cancelDeviceConnection).not.toHaveBeenCalled()
  })

  it('keeps the scan duty cycle after a cancelled scan callback', async () => {
    await initializeAndDiscover()
    const scansBefore = mocks.manager.startDeviceScan.mock.calls.length

    mocks.state.scanCallback?.(new Error('OperationCancelled'), null)
    await vi.advanceTimersByTimeAsync(15_100)

    expect(mocks.manager.startDeviceScan).toHaveBeenCalledTimes(scansBefore + 1)
    expect(getPeers()).toHaveLength(1)
  })

  it('reschedules scanning after a transient scan callback error', async () => {
    await initializeAndDiscover()
    const scansBefore = mocks.manager.startDeviceScan.mock.calls.length

    mocks.state.scanCallback?.(new Error('scan failed'), null)
    await vi.advanceTimersByTimeAsync(2_001)

    expect(mocks.manager.startDeviceScan).toHaveBeenCalledTimes(scansBefore + 1)
  })

  it('force-restarts an already running scan', async () => {
    await initializeAndDiscover()
    const scansBefore = mocks.manager.startDeviceScan.mock.calls.length

    await startScanning(undefined, { force: true })

    expect(mocks.manager.startDeviceScan).toHaveBeenCalledTimes(scansBefore + 1)
  })

  it('force-restarts advertising without requiring a native stop', async () => {
    await initializeAndDiscover()
    await startAdvertising()
    const startsBefore = mocks.startAdvertising.mock.calls.length

    await expect(startAdvertising(undefined, { force: true })).resolves.toBe(true)

    expect(mocks.startAdvertising).toHaveBeenCalledTimes(startsBefore + 1)
    expect(mocks.stopAdvertising).not.toHaveBeenCalled()
  })

  it('disconnects peers when the adapter powers off', async () => {
    await initializeAndDiscover()
    await connectToPeer(DEVICE_ID)
    mocks.state.monitorCallbacks[0](null, { value: READY_BASE64 })
    const listener = vi.fn()
    addEventListener(listener)
    const adapterCallback = mocks.state.adapterCallbacks.at(-1)

    adapterCallback?.('PoweredOff')

    expect(getPeers()[0]?.connectionState).toBe('disconnected')
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      type: 'peer:disconnected',
    }))
  })

  it('recovers scanning state after a native scan callback error', async () => {
    await initializeAndDiscover()
    const scansBefore = mocks.manager.startDeviceScan.mock.calls.length

    mocks.state.scanCallback?.(new Error('scan failed'), null)
    await startScanning(undefined, { force: true })

    expect(mocks.manager.startDeviceScan).toHaveBeenCalledTimes(scansBefore + 1)
  })

  it('recovers after a synchronous native scan failure', async () => {
    mocks.state.device = createDevice()
    await initialize(
      { ...DEFAULT_BLE_MESH_CONFIG, enabled: true },
      vi.fn(),
    )
    mocks.manager.startDeviceScan.mockImplementationOnce(() => {
      throw new Error('scan failed')
    })

    await startScanning()
    await startScanning()

    expect(mocks.manager.startDeviceScan).toHaveBeenCalledTimes(2)
  })

  it('ignores callbacks from a stopped scan generation', async () => {
    mocks.state.device = createDevice()
    await initialize(
      { ...DEFAULT_BLE_MESH_CONFIG, enabled: true },
      vi.fn(),
    )
    await startScanning()
    const oldScanCallback = mocks.state.scanCallback

    await stopScanning()
    await startScanning()
    oldScanCallback?.(null, {
      id: 'stale-peer',
      rssi: -40,
      name: 'Stale',
    })

    expect(getPeers()).toHaveLength(0)
  })

  it('does not dial until a remote link offer is known', async () => {
    await initializeAndDiscover()
    await connectToPeer(DEVICE_ID)
    expect(shouldConnectPeer(DEVICE_ID)).toBe(true)
    expect(shouldDialPeer(DEVICE_ID)).toBe(false)

    mocks.state.monitorCallbacks[0](null, {
      value: btoa(String.fromCharCode(...encodeLinkOfferFrame(new Uint8Array(8).fill(255)))),
    })
    expect(shouldDialPeer(DEVICE_ID)).toBe(true)
    expect(shouldConnectPeer(DEVICE_ID)).toBe(true)
  })

  it('lets the offer winner connect even when only the incoming radio is live', async () => {
    await initializeAndDiscover()
    mocks.state.peripheralListener?.({
      type: 'centralSubscribed',
      centralId: DEVICE_ID,
      maxPayloadBytes: 64,
    })
    mocks.state.peripheralListener?.({
      type: 'dataReceived',
      centralId: DEVICE_ID,
      data: btoa(String.fromCharCode(...encodeLinkOfferFrame(new Uint8Array(8).fill(255)))),
    })

    expect(shouldConnectPeer(DEVICE_ID)).toBe(true)
    expect(shouldDialPeer(DEVICE_ID)).toBe(false)

    await connectToPeer(DEVICE_ID)
    expect(shouldDialPeer(DEVICE_ID)).toBe(true)
  })

  it('does not open a new central after losing link-offer election', async () => {
    await initializeAndDiscover()
    await connectToPeer(DEVICE_ID)
    mocks.state.monitorCallbacks[0](null, {
      value: btoa(String.fromCharCode(...encodeLinkOfferFrame(new Uint8Array(8).fill(0)))),
    })

    expect(shouldDialPeer(DEVICE_ID)).toBe(false)
    expect(shouldConnectPeer(DEVICE_ID)).toBe(false)
  })

  it('delivers aliased incoming handshake bytes on the outgoing device id', async () => {
    const onData = vi.fn()
    await initializeAndDiscover(185, onData)
    await connectToPeer(DEVICE_ID)
    mocks.state.peripheralListener?.({
      type: 'centralSubscribed',
      centralId: 'incoming-central',
      maxPayloadBytes: 64,
    })
    const offer = encodeLinkOfferFrame(new Uint8Array(8).fill(9))
    mocks.state.monitorCallbacks[0](null, {
      value: btoa(String.fromCharCode(...offer)),
    })
    const handshake = new Uint8Array([0x53, 0x42, 0x02, 0x01, 0xaa])
    const coalesced = new Uint8Array(offer.length + handshake.length)
    coalesced.set(offer)
    coalesced.set(handshake, offer.length)
    mocks.state.peripheralListener?.({
      type: 'dataReceived',
      centralId: 'incoming-central',
      data: btoa(String.fromCharCode(...coalesced)),
    })

    expect(onData).toHaveBeenCalledTimes(1)
    expect(onData.mock.calls[0][0]).toBe(DEVICE_ID)
    expect(onData.mock.calls[0][1]).toEqual(handshake)
  })

  it('delivers handshake bytes that were coalesced after a link offer', async () => {
    const onData = vi.fn()
    await initializeAndDiscover(185, onData)
    mocks.state.peripheralListener?.({
      type: 'centralSubscribed',
      centralId: DEVICE_ID,
      maxPayloadBytes: 64,
    })
    const handshake = new Uint8Array([0x53, 0x42, 0x02, 0x01, 0xaa])
    const coalesced = new Uint8Array(12 + handshake.length)
    coalesced.set(encodeLinkOfferFrame(new Uint8Array(8).fill(3)))
    coalesced.set(handshake, 12)

    mocks.state.peripheralListener?.({
      type: 'dataReceived',
      centralId: DEVICE_ID,
      data: btoa(String.fromCharCode(...coalesced)),
    })

    expect(onData).toHaveBeenCalledTimes(1)
    expect(onData.mock.calls[0][1]).toEqual(handshake)
  })

  it('sends responder frames through notify when both radios are live', async () => {
    await initializeAndDiscover()
    await connectToPeer(DEVICE_ID)
    mocks.state.peripheralListener?.({
      type: 'centralSubscribed',
      centralId: DEVICE_ID,
      maxPayloadBytes: 64,
    })
    mocks.sendNotification.mockResolvedValue(true)
    mocks.manager.writeCharacteristicWithResponseForDevice.mockClear()

    await expect(sendDataSequence(
      DEVICE_ID,
      [new Uint8Array([1])],
      0,
      { pipe: 'incoming' },
    )).resolves.toBe(true)

    expect(mocks.sendNotification).toHaveBeenCalled()
    expect(mocks.manager.writeCharacteristicWithResponseForDevice).not.toHaveBeenCalled()
  })

  it('falls back to notify when an initiator central write fails', async () => {
    await initializeAndDiscover()
    await connectToPeer(DEVICE_ID)
    mocks.state.peripheralListener?.({
      type: 'centralSubscribed',
      centralId: DEVICE_ID,
      maxPayloadBytes: 64,
    })
    mocks.manager.writeCharacteristicWithResponseForDevice.mockRejectedValueOnce(
      new Error('write failed'),
    )
    mocks.sendNotification.mockResolvedValueOnce(true)

    await expect(sendDataSequence(
      DEVICE_ID,
      [new Uint8Array([1])],
      0,
      { pipe: 'outgoing' },
    )).resolves.toBe(true)

    expect(mocks.sendNotification).toHaveBeenCalled()
  })

  it('keeps the outgoing GATT pipe after a link-offer write timeout', async () => {
    await initializeAndDiscover()
    await connectToPeer(DEVICE_ID)
    mocks.manager.writeCharacteristicWithResponseForDevice.mockImplementationOnce(
      () => new Promise<void>(() => {}),
    )

    const offering = announceLinkOffer(DEVICE_ID)
    await vi.waitFor(() => {
      expect(mocks.manager.writeCharacteristicWithResponseForDevice).toHaveBeenCalled()
    })
    await vi.advanceTimersByTimeAsync(5_001)
    await offering

    expect(getPeers()[0]?.connectionState).toBe('connected')
    mocks.manager.writeCharacteristicWithResponseForDevice.mockResolvedValue(undefined)
    await expect(sendDataSequence(
      DEVICE_ID,
      [new Uint8Array([1])],
      0,
      { pipe: 'outgoing' },
    )).resolves.toBe(true)
  })

  it('cancels an unbounded native advertising start on abort', async () => {
    await initializeAndDiscover()
    mocks.startAdvertising.mockImplementationOnce(() => new Promise(() => {}))
    const controller = new AbortController()

    const starting = startAdvertising(controller.signal)
    await vi.waitFor(() => expect(mocks.startAdvertising).toHaveBeenCalled())
    controller.abort()

    await expect(starting).resolves.toBe(false)
    expect(mocks.stopAdvertising).toHaveBeenCalled()
  })
})

describe('bleManager Android BLE permission hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.platform.OS = 'ios'
    mocks.platform.Version = '26.0'
  })

  afterEach(async () => {
    await shutdown()
  })

  it('does not include fine location among Android 12+ BLE runtime permissions', () => {
    expect(androidBleRuntimePermissions(31)).toEqual([
      'android.permission.BLUETOOTH_SCAN',
      'android.permission.BLUETOOTH_CONNECT',
      'android.permission.BLUETOOTH_ADVERTISE',
    ])
    expect(androidBleRuntimePermissions(31)).not.toContain(
      'android.permission.ACCESS_FINE_LOCATION',
    )
  })

  it('still uses fine location for BLE on Android 11 and below', () => {
    expect(androidBleRuntimePermissions(30)).toEqual([
      'android.permission.ACCESS_FINE_LOCATION',
    ])
  })

  it('does not request fine location when initializing BLE on Android 12+', async () => {
    mocks.platform.OS = 'android'
    mocks.platform.Version = 31

    await initialize({ ...DEFAULT_BLE_MESH_CONFIG, enabled: true }, vi.fn())

    expect(PermissionsAndroid.requestMultiple).toHaveBeenCalledWith([
      'android.permission.BLUETOOTH_SCAN',
      'android.permission.BLUETOOTH_CONNECT',
      'android.permission.BLUETOOTH_ADVERTISE',
    ])
    expect(PermissionsAndroid.request).not.toHaveBeenCalled()
  })

  it('still requests fine location when initializing BLE on Android 11', async () => {
    mocks.platform.OS = 'android'
    mocks.platform.Version = 30

    await initialize({ ...DEFAULT_BLE_MESH_CONFIG, enabled: true }, vi.fn())

    expect(PermissionsAndroid.request).toHaveBeenCalledWith(
      'android.permission.ACCESS_FINE_LOCATION',
    )
    expect(PermissionsAndroid.requestMultiple).not.toHaveBeenCalled()
  })

  it('does not request Android BLE permissions on iOS', async () => {
    await initialize({ ...DEFAULT_BLE_MESH_CONFIG, enabled: true }, vi.fn())

    expect(PermissionsAndroid.request).not.toHaveBeenCalled()
    expect(PermissionsAndroid.requestMultiple).not.toHaveBeenCalled()
  })
})
