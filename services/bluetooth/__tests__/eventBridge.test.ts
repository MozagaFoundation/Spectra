/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const bridgeMocks = vi.hoisted(() => ({
  initializeBLEBridge: vi.fn(async (_options: unknown) => true),
  shutdownBLEBridge: vi.fn(async () => {}),
  sendViaBLE: vi.fn(async () => ({ success: true, stored: false })),
  getRoute: vi.fn(() => ({
    route: 'internet',
    bleAvailable: true,
    internetAvailable: true,
    peerNearby: false,
  })),
  lastInitOptions: null as null | {
    onReceiveMessage: (conversationId: string, encryptedData: unknown, senderIdentityId: string) => Promise<void>
    onDeliveryEvent?: (event: unknown) => Promise<void> | void
  },
}))

vi.mock('../chatIntegration', () => ({
  initializeBLEBridge: vi.fn(async (options) => {
    bridgeMocks.lastInitOptions = options
    return bridgeMocks.initializeBLEBridge(options)
  }),
  shutdownBLEBridge: bridgeMocks.shutdownBLEBridge,
  sendViaBLE: bridgeMocks.sendViaBLE,
  getRoute: bridgeMocks.getRoute,
  acceptRouteCapability: vi.fn(async () => true),
}))

import {
  getBLETransportRoute,
  initBLEEventBridge,
  shutdownBLEEventBridge,
  trySendViaBLE,
} from '../eventBridge'

describe('eventBridge quantum-facing audit coverage', () => {
  const decryptMessage = vi.fn(async () => ({ plaintext: 'hello' }))

  beforeEach(async () => {
    await shutdownBLEEventBridge()
    vi.clearAllMocks()
    bridgeMocks.lastInitOptions = null
    decryptMessage.mockResolvedValue({ plaintext: 'hello' })
    bridgeMocks.initializeBLEBridge.mockResolvedValue(true)
    bridgeMocks.sendViaBLE.mockResolvedValue({ success: true, stored: false })
    bridgeMocks.getRoute.mockReturnValue({
      route: 'internet',
      bleAvailable: true,
      internetAvailable: true,
      peerNearby: false,
    })
  })

  it('initializes idempotently and hands BLE messages to the decrypt callback', async () => {
    const onDeliveryEvent = vi.fn()
    await initBLEEventBridge({
      walletScope: 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      identityId: 'local-identity',
      identityPrivateKey: 'local-private-key',
      displayName: 'Local',
      bundle: null,
      knownIdentities: [],
      sendControl: vi.fn(async () => true),
      decryptMessage,
      onDeliveryEvent,
    })
    await initBLEEventBridge({
      walletScope: 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      identityId: 'local-identity',
      identityPrivateKey: 'local-private-key',
      displayName: 'Local',
      bundle: null,
      knownIdentities: [],
      sendControl: vi.fn(async () => true),
      decryptMessage,
    })

    expect(bridgeMocks.initializeBLEBridge).toHaveBeenCalledTimes(1)

    await bridgeMocks.lastInitOptions?.onReceiveMessage('conversation-1', { encrypted: true }, 'peer-1')

    expect(decryptMessage).toHaveBeenCalledWith('conversation-1', { encrypted: true }, 'peer-1')
    const delivery = {
      localMessageId: 'message-1',
      state: 'delivered',
      sequence: 3,
    }
    await bridgeMocks.lastInitOptions?.onDeliveryEvent?.(delivery)
    expect(onDeliveryEvent).toHaveBeenCalledWith(delivery)
  })

  it('serializes shutdown and reinitializes for a different wallet identity', async () => {
    await initBLEEventBridge({
      walletScope: 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      identityId: 'local-identity-a',
      identityPrivateKey: 'local-private-key-a',
      displayName: 'Local A',
      bundle: null,
      knownIdentities: [],
      sendControl: vi.fn(async () => true),
      decryptMessage,
    })

    const stopping = shutdownBLEEventBridge()
    const restarting = initBLEEventBridge({
      walletScope: 'exo00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      identityId: 'local-identity-b',
      identityPrivateKey: 'local-private-key-b',
      displayName: 'Local B',
      bundle: null,
      knownIdentities: [],
      sendControl: vi.fn(async () => true),
      decryptMessage,
    })
    await Promise.all([stopping, restarting])

    expect(bridgeMocks.shutdownBLEBridge).toHaveBeenCalledTimes(1)
    expect(bridgeMocks.initializeBLEBridge).toHaveBeenCalledTimes(2)
    expect(bridgeMocks.initializeBLEBridge).toHaveBeenLastCalledWith(
      expect.objectContaining({
        walletScope: 'exo00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        identityId: 'local-identity-b',
      }),
    )
  })

  it('blocks a wallet reinitialization when the previous bridge cannot stop', async () => {
    await initBLEEventBridge({
      walletScope: 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      identityId: 'local-identity-a',
      identityPrivateKey: 'local-private-key-a',
      displayName: 'Local A',
      bundle: null,
      knownIdentities: [],
      sendControl: vi.fn(async () => true),
      decryptMessage,
    })
    bridgeMocks.shutdownBLEBridge.mockRejectedValueOnce(new Error('radio teardown failed'))

    await expect(initBLEEventBridge({
      walletScope: 'exo00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      identityId: 'local-identity-b',
      identityPrivateKey: 'local-private-key-b',
      displayName: 'Local B',
      bundle: null,
      knownIdentities: [],
      sendControl: vi.fn(async () => true),
      decryptMessage,
    })).rejects.toThrow('radio teardown failed')

    expect(bridgeMocks.initializeBLEBridge).toHaveBeenCalledTimes(1)

    await initBLEEventBridge({
      walletScope: 'exo00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      identityId: 'local-identity-b',
      identityPrivateKey: 'local-private-key-b',
      displayName: 'Local B',
      bundle: null,
      knownIdentities: [],
      sendControl: vi.fn(async () => true),
      decryptMessage,
    })
    expect(bridgeMocks.shutdownBLEBridge).toHaveBeenCalledTimes(2)
    expect(bridgeMocks.initializeBLEBridge).toHaveBeenCalledTimes(2)
  })

  it('propagates decrypt failures so BLE does not acknowledge rejected messages', async () => {
    decryptMessage.mockRejectedValueOnce(new Error('bad ciphertext'))
    await initBLEEventBridge({
      walletScope: 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      identityId: 'local-identity',
      identityPrivateKey: 'local-private-key',
      displayName: 'Local',
      bundle: null,
      knownIdentities: [],
      sendControl: vi.fn(async () => true),
      decryptMessage,
    })

    await expect(
      bridgeMocks.lastInitOptions?.onReceiveMessage(
        'conversation-1',
        { encrypted: true },
        'peer-1',
      ),
    ).rejects.toThrow('bad ciphertext')

    expect(decryptMessage).toHaveBeenCalledWith('conversation-1', { encrypted: true }, 'peer-1')
  })

  it('filters non-BLE routes before sending', async () => {
    bridgeMocks.getRoute.mockReturnValue({
      route: 'internet',
      bleAvailable: true,
      internetAvailable: true,
      peerNearby: true,
    })

    await expect(trySendViaBLE('peer-1', { encrypted: true } as never)).resolves.toEqual({
      success: false,
      error: 'BLE not available',
    })
    expect(bridgeMocks.sendViaBLE).not.toHaveBeenCalled()
  })

  it('sends via BLE when the route is BLE', async () => {
    const beforeSend = vi.fn()
    bridgeMocks.getRoute.mockReturnValue({
      route: 'ble',
      bleAvailable: true,
      internetAvailable: false,
      peerNearby: true,
    })

    await expect(trySendViaBLE('peer-1', { encrypted: true } as never, {
      onBeforeBleSend: beforeSend,
    })).resolves.toEqual({ success: true, stored: false })

    expect(beforeSend).toHaveBeenCalled()
    expect(bridgeMocks.sendViaBLE).toHaveBeenCalledWith('peer-1', { encrypted: true })
  })

  it('returns the current BLE route when chat integration is available', async () => {
    await expect(getBLETransportRoute('peer-1')).resolves.toMatchObject({
      route: 'internet',
      bleAvailable: true,
    })
  })

  it('keeps bridge initialization failures non-fatal', async () => {
    bridgeMocks.initializeBLEBridge.mockRejectedValueOnce(new Error('native unavailable'))

    await expect(initBLEEventBridge({
      walletScope: 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      identityId: 'local-identity',
      identityPrivateKey: 'local-private-key',
      displayName: 'Local',
      bundle: null,
      knownIdentities: [],
      sendControl: vi.fn(async () => true),
      decryptMessage,
    })).resolves.toBeUndefined()

    expect(bridgeMocks.initializeBLEBridge).toHaveBeenCalled()
  })
})
