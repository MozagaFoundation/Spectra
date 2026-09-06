/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const cleanupMocks = vi.hoisted(() => ({
  walletAddress: 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  getValidBackendAccessToken: vi.fn(),
  listPendingRemoteMediaDeletes: vi.fn(),
  consumeChatMediaWithBackend: vi.fn(),
  markRemoteMediaDeleteComplete: vi.fn(),
}))

vi.mock('@/store/walletStore', () => ({
  useWalletStore: {
    getState: () => ({ wallet: { address: cleanupMocks.walletAddress } }),
  },
}))

vi.mock('@/services/backend/session', () => ({
  getValidBackendAccessToken: cleanupMocks.getValidBackendAccessToken,
}))

vi.mock('@/services/backend/media', () => ({
  consumeChatMediaWithBackend: cleanupMocks.consumeChatMediaWithBackend,
}))

vi.mock('./localMediaCache', () => ({
  listPendingRemoteMediaDeletes: cleanupMocks.listPendingRemoteMediaDeletes,
  markRemoteMediaDeleteComplete: cleanupMocks.markRemoteMediaDeleteComplete,
}))

import { schedulePendingRemoteMediaCleanup } from './remoteMediaCleanup'

describe('remote media cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cleanupMocks.walletAddress = 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    cleanupMocks.getValidBackendAccessToken.mockResolvedValue('token')
    cleanupMocks.listPendingRemoteMediaDeletes.mockResolvedValue([{
      mediaId: 'media-1',
      objectRef: 'spectra://objects/users/sender/attachments/media-1.enc',
    }])
    cleanupMocks.consumeChatMediaWithBackend.mockResolvedValue(undefined)
    cleanupMocks.markRemoteMediaDeleteComplete.mockResolvedValue(undefined)
  })

  it('clears durable cleanup work only after server consumption succeeds', async () => {
    schedulePendingRemoteMediaCleanup(cleanupMocks.walletAddress)

    await vi.waitFor(() => {
      expect(cleanupMocks.markRemoteMediaDeleteComplete).toHaveBeenCalledWith(
        'media-1',
        cleanupMocks.walletAddress,
      )
    })
    expect(cleanupMocks.consumeChatMediaWithBackend).toHaveBeenCalledWith(
      'media-1',
      'spectra://objects/users/sender/attachments/media-1.enc',
      { accessToken: 'token' },
    )
  })

  it('does not run old-wallet cleanup after a wallet handoff', async () => {
    cleanupMocks.walletAddress = 'exo00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

    schedulePendingRemoteMediaCleanup('exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
    await Promise.resolve()

    expect(cleanupMocks.getValidBackendAccessToken).not.toHaveBeenCalled()
    expect(cleanupMocks.consumeChatMediaWithBackend).not.toHaveBeenCalled()
  })

  it('continues cleanup after an independent item fails', async () => {
    cleanupMocks.listPendingRemoteMediaDeletes.mockResolvedValue([
      {
        mediaId: 'media-1',
        objectRef: 'spectra://objects/users/sender/attachments/media-1.enc',
      },
      {
        mediaId: 'media-2',
        objectRef: 'spectra://objects/users/sender/attachments/media-2.enc',
      },
    ])
    cleanupMocks.consumeChatMediaWithBackend.mockImplementation(async (mediaId: string) => {
      if (mediaId === 'media-1') throw new Error('temporary failure')
    })

    schedulePendingRemoteMediaCleanup(cleanupMocks.walletAddress)

    await vi.waitFor(() => {
      expect(cleanupMocks.markRemoteMediaDeleteComplete).toHaveBeenCalledWith(
        'media-2',
        cleanupMocks.walletAddress,
      )
    })
    expect(cleanupMocks.markRemoteMediaDeleteComplete).not.toHaveBeenCalledWith(
      'media-1',
      cleanupMocks.walletAddress,
    )
  })
})
