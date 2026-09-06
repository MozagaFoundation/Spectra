/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const storageState = vi.hoisted(() => ({
  data: new Map<string, string>(),
  secureStore: new Map<string, string>(),
}))

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => storageState.data.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      storageState.data.set(key, value)
    }),
    removeItem: vi.fn(async (key: string) => {
      storageState.data.delete(key)
    }),
    getAllKeys: vi.fn(async () => Array.from(storageState.data.keys())),
    multiGet: vi.fn(async (keys: string[]) => keys.map((key) => [key, storageState.data.get(key) ?? null])),
    multiSet: vi.fn(async (entries: [string, string][]) => {
      for (const [key, value] of entries) {
        storageState.data.set(key, value)
      }
    }),
    multiRemove: vi.fn(async (keys: string[]) => {
      for (const key of keys) {
        storageState.data.delete(key)
      }
    }),
  },
}))

vi.mock('expo-crypto', () => ({
  getRandomBytesAsync: vi.fn(async (length: number) => new Uint8Array(length).fill(7)),
}))

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (key: string) => storageState.secureStore.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    storageState.secureStore.set(key, value)
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    storageState.secureStore.delete(key)
  }),
}))

vi.mock('@spectra/identity-vault', () => ({
  base64ToBytes: vi.fn((value: string) => Uint8Array.from(Buffer.from(value, 'base64'))),
  bytesToBase64: vi.fn((value: Uint8Array) => Buffer.from(value).toString('base64')),
  encrypt: vi.fn((data: string) => ({
    ciphertext: Buffer.from(data, 'utf8').toString('base64'),
    iv: Buffer.from('iv').toString('base64'),
  })),
  decrypt: vi.fn((ciphertext: string) => Buffer.from(ciphertext, 'base64').toString('utf8')),
}))

vi.mock('@spectra/core-crypto', () => ({
  compareMessageStatus: vi.fn(() => 0),
  serializeSessionState: vi.fn((value: unknown) => value),
  deserializeSessionState: vi.fn((value: unknown) => value),
  shouldSyncOutboundStatus: vi.fn(() => false),
}))

describe('payment request settlements', () => {
  beforeEach(() => {
    vi.resetModules()
    storageState.data.clear()
    storageState.secureStore.clear()
  })

  it('replays a durable settlement after strict cache clearing removes decrypted messages', async () => {
    const {
      applyStoredCryptoPaymentRequestSettlements,
      storeCryptoPaymentRequestSettlement,
    } = await import('./paymentRequestSettlements')
    const {
      createCryptoPaymentRequest,
      createCryptoPaymentRequestUpdate,
      parseCryptoPaymentRequest,
      parseCryptoPaymentRequestUpdate,
    } = await import('../shared/cryptoPaymentRequest')
    const {
      AsyncStorageAdapter,
      prepareAsyncStorageScope,
    } = await import('../storage/asyncStorageAdapter')

    const conversationId = 'conversation-payment'
    const requestContent = createCryptoPaymentRequest({
      requestId: 'request-1',
      network: 'mozaga',
      symbol: 'EXO',
      amount: '12.5',
      decimals: 18,
      recipientAddress: 'EXO_RECEIVER',
      assetType: 'native',
      createdAt: 1_700_000_000_000,
    })
    const update = parseCryptoPaymentRequestUpdate(createCryptoPaymentRequestUpdate({
      requestId: 'request-1',
      requestMessageId: 'request-message-1',
      network: 'mozaga',
      symbol: 'EXO',
      amount: '12.5',
      txHash: 'tx123',
      status: 'confirmed',
      paidAt: 1_700_000_001_000,
    }))
    expect(update).not.toBeNull()

    await prepareAsyncStorageScope('exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
    const adapter = new AsyncStorageAdapter()
    await adapter.storeDecryptedMessage({
      id: 'request-message-1',
      conversationId,
      senderId: 'requester',
      timestamp: 1_700_000_000_000,
      content: requestContent,
    })
    await storeCryptoPaymentRequestSettlement(conversationId, update!)
    expect([...storageState.data.values()].join('\n')).not.toContain('tx123')
    await adapter.clearDecryptedMessageCache({ allScopes: true })

    const [replayed] = await applyStoredCryptoPaymentRequestSettlements(conversationId, [{
      id: 'request-message-1',
      conversationId,
      senderId: 'requester',
      timestamp: 1_700_000_000_000,
      content: requestContent,
    }])

    const request = parseCryptoPaymentRequest(replayed.content)
    expect(request).toMatchObject({
      state: 'paid',
      settlement: {
        txHash: 'tx123',
        status: 'confirmed',
      },
    })
  })

  it('keeps settlement replay scoped to the active EXO account', async () => {
    const {
      applyStoredCryptoPaymentRequestSettlements,
      storeCryptoPaymentRequestSettlement,
    } = await import('./paymentRequestSettlements')
    const {
      createCryptoPaymentRequest,
      createCryptoPaymentRequestUpdate,
      parseCryptoPaymentRequest,
      parseCryptoPaymentRequestUpdate,
    } = await import('../shared/cryptoPaymentRequest')
    const { prepareAsyncStorageScope } = await import('../storage/asyncStorageAdapter')

    const conversationId = 'conversation-payment'
    const requestContent = createCryptoPaymentRequest({
      requestId: 'request-1',
      network: 'ethereum',
      symbol: 'USDT',
      amount: '10',
      decimals: 6,
      recipientAddress: '0xreceiver',
      assetType: 'token',
      contractAddress: '0xtoken',
      createdAt: 1_700_000_000_000,
    })
    const update = parseCryptoPaymentRequestUpdate(createCryptoPaymentRequestUpdate({
      requestId: 'request-1',
      requestMessageId: 'request-message-1',
      network: 'ethereum',
      symbol: 'USDT',
      amount: '10',
      txHash: '0xabc',
      status: 'confirmed',
      paidAt: 1_700_000_001_000,
    }))
    expect(update).not.toBeNull()

    await prepareAsyncStorageScope('exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
    await storeCryptoPaymentRequestSettlement(conversationId, update!)

    await prepareAsyncStorageScope('exo00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')
    const [replayed] = await applyStoredCryptoPaymentRequestSettlements(conversationId, [{
      id: 'request-message-1',
      content: requestContent,
    }])

    expect(parseCryptoPaymentRequest(replayed.content)).toMatchObject({
      state: 'open',
    })
  })
})
