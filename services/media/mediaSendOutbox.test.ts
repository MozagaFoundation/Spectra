/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  walletAddress: 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  getValidBackendAccessToken: vi.fn(),
  abandonChatMediaWithBackend: vi.fn(),
}))

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => mockState.storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      mockState.storage.set(key, value)
    }),
    removeItem: vi.fn(async (key: string) => {
      mockState.storage.delete(key)
    }),
  },
}))

vi.mock('@/store/walletStore', () => ({
  useWalletStore: {
    getState: () => ({ wallet: { address: mockState.walletAddress } }),
  },
}))

vi.mock('@/services/backend/session', () => ({
  getValidBackendAccessToken: mockState.getValidBackendAccessToken,
}))

vi.mock('@/services/backend/media', () => ({
  abandonChatMediaWithBackend: mockState.abandonChatMediaWithBackend,
}))

vi.mock('@/services/storage/localCacheCrypto', () => ({
  buildLocalCacheAad: (parts: string[]) => new TextEncoder().encode(JSON.stringify(parts)),
  sealLocalCacheText: vi.fn(async (
    _scope: string,
    _domain: string,
    plaintext: string,
  ) => ({
    v: 1,
    algorithm: 'AES-256-GCM',
    ciphertext: plaintext,
    iv: 'test',
  })),
  openLocalCacheText: vi.fn(async (
    _scope: string,
    _domain: string,
    cipher: { ciphertext: string },
  ) => cipher.ciphertext),
}))

const {
  flushMediaSendCleanup,
  listMediaSendOutbox,
  markMediaSendRelayAccepted,
  recordMediaSendRelayOutcome,
  registerMediaSendUpload,
} = await import('./mediaSendOutbox')

function registration(mediaId: string, expiresAt?: number) {
  return {
    mediaId,
    objectRef: `spectra://objects/users/sender/attachments/${mediaId}.enc`,
    sendId: 'local:message-1',
    conversationId: 'direct:recipient-1',
    ...(expiresAt ? { expiresAt } : {}),
  }
}

describe('media send outbox', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.storage.clear()
    mockState.walletAddress = 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    mockState.getValidBackendAccessToken.mockResolvedValue('access-token')
    mockState.abandonChatMediaWithBackend.mockResolvedValue(undefined)
  })

  it('durably registers uploads and clears them only after relay acceptance', async () => {
    await registerMediaSendUpload(registration('media-1'))

    expect(await listMediaSendOutbox()).toEqual([
      expect.objectContaining({
        mediaId: 'media-1',
        state: 'upload_registered',
        cleanupAttemptCount: 0,
      }),
    ])

    await markMediaSendRelayAccepted(['media-1'])

    expect(await listMediaSendOutbox()).toEqual([])
  })

  it('continues independent cleanup and retains failures with bounded backoff', async () => {
    const now = Date.now()
    await registerMediaSendUpload(registration('media-1', now + 1_000))
    await registerMediaSendUpload(registration('media-2', now + 1_000))
    mockState.abandonChatMediaWithBackend.mockImplementation(async (mediaId: string) => {
      if (mediaId === 'media-1') throw new Error('temporary failure')
    })

    await flushMediaSendCleanup(undefined, now + 1_001)

    expect(mockState.abandonChatMediaWithBackend).toHaveBeenCalledTimes(2)
    expect(await listMediaSendOutbox()).toEqual([
      expect.objectContaining({
        mediaId: 'media-1',
        state: 'cleanup_pending',
        cleanupAttemptCount: 1,
        nextCleanupAt: now + 31_001,
        lastCleanupError: 'temporary failure',
      }),
    ])
  })

  it('retains uploads after transient relay failure', async () => {
    await registerMediaSendUpload(registration('media-1'))

    await recordMediaSendRelayOutcome(['media-1'], 'transient_failure')

    expect(await listMediaSendOutbox()).toEqual([
      expect.objectContaining({
        mediaId: 'media-1',
        state: 'upload_registered',
      }),
    ])
    expect(mockState.abandonChatMediaWithBackend).not.toHaveBeenCalled()
  })

  it('does not clean an old wallet after account handoff', async () => {
    const oldWallet = mockState.walletAddress
    const now = Date.now()
    await registerMediaSendUpload(registration('media-1', now + 1_000), oldWallet)
    mockState.walletAddress = 'exo00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

    await flushMediaSendCleanup(oldWallet, now + 1_001)

    expect(mockState.getValidBackendAccessToken).not.toHaveBeenCalled()
    expect(mockState.abandonChatMediaWithBackend).not.toHaveBeenCalled()
  })
})

