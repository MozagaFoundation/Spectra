/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  assertSafeMediaId: vi.fn(),
  initializeMediaCache: vi.fn(),
  isMediaCached: vi.fn(),
  getLocalMediaUri: vi.fn(),
  registerCachedMedia: vi.fn(),
  downloadAndDecryptMedia: vi.fn(),
  schedulePendingRemoteMediaCleanup: vi.fn(),
  transientExists: false,
  walletAddress: 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
}))

vi.mock('./localMediaCache', () => ({
  assertSafeMediaId: mockState.assertSafeMediaId,
  getLocalMediaUri: mockState.getLocalMediaUri,
  getMediaCacheDirectory: (scope: string) => `file:///cache/${scope}/`,
  initializeMediaCache: mockState.initializeMediaCache,
  isMediaCached: mockState.isMediaCached,
  registerCachedMedia: mockState.registerCachedMedia,
}))

vi.mock('./mediaService', () => ({
  downloadAndDecryptMedia: mockState.downloadAndDecryptMedia,
}))

vi.mock('./remoteMediaCleanup', () => ({
  schedulePendingRemoteMediaCleanup: mockState.schedulePendingRemoteMediaCleanup,
}))

vi.mock('expo-file-system/legacy', () => ({
  deleteAsync: vi.fn(async () => undefined),
  getInfoAsync: vi.fn(async () => ({ exists: mockState.transientExists })),
}))

vi.mock('./transientRenderCache', () => ({
  isTransientRenderUri: (uri?: string | null) => Boolean(
    uri?.startsWith('file:///cache/spectra-transient-render-v1/'),
  ),
}))

vi.mock('@/lib/utils', () => ({
  mapWithConcurrencySettled: async <T, R>(
    items: T[],
    _limit: number,
    mapper: (item: T) => Promise<R>,
    fallback: (item: T, index: number, error: unknown) => R,
  ) => Promise.all(items.map(async (item, index) => {
    try {
      return await mapper(item)
    } catch (error) {
      return fallback(item, index, error)
    }
  })),
}))

vi.mock('@/services/tor/torStore', () => ({
  useTorStore: {
    getState: () => ({ enabled: false }),
  },
}))

vi.mock('@/store/walletStore', () => ({
  useWalletStore: {
    getState: () => ({
      wallet: { address: mockState.walletAddress },
    }),
  },
}))

import {
  __clearAttachmentHydrationCacheForTests,
  hydrateMessageAttachment,
  hydrateMessageAttachments,
  shouldAutoHydrateAttachment,
} from './attachmentHydration'

const encryptedImageAttachment = {
  id: 'media-1',
  type: 'image',
  uri: '',
  fileName: 'photo.jpg',
  mimeType: 'image/jpeg',
  fileSize: 1234,
  isEncrypted: true,
  encryptionKey: 'encrypted-key',
} as const

describe('attachment hydration', () => {
  beforeEach(() => {
    __clearAttachmentHydrationCacheForTests()
    mockState.assertSafeMediaId.mockReset()
    mockState.initializeMediaCache.mockReset()
    mockState.isMediaCached.mockReset()
    mockState.getLocalMediaUri.mockReset()
    mockState.registerCachedMedia.mockReset()
    mockState.downloadAndDecryptMedia.mockReset()
    mockState.schedulePendingRemoteMediaCleanup.mockReset()
    mockState.transientExists = false
    mockState.walletAddress = 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    mockState.initializeMediaCache.mockResolvedValue(undefined)
    mockState.assertSafeMediaId.mockImplementation((mediaId: string) => {
      if (mediaId.includes('..')) {
        throw new Error('Unsafe media id')
      }
    })
    mockState.isMediaCached.mockResolvedValue(false)
    mockState.getLocalMediaUri.mockResolvedValue(null)
    mockState.downloadAndDecryptMedia.mockImplementation(
      async (
        _key: string,
        _id: string,
        _destination: string,
        _progress: unknown,
        _diagnostics: unknown,
        onDisposition?: (value: { remoteObjectRef: string; shouldConsumeRemote: boolean }) => void,
      ) => {
        onDisposition?.({
          remoteObjectRef: 'spectra://objects/users/sender/attachments/media-1.enc',
          shouldConsumeRemote: true,
        })
        return {
          mediaType: 'image',
          fileName: 'photo.jpg',
          mimeType: 'image/jpeg',
          fileSize: 1234,
        }
      },
    )
    mockState.registerCachedMedia.mockResolvedValue({
      id: 'media-1',
      messageId: 'message-1',
      conversationId: 'conversation-1',
      type: 'image',
      fileName: 'photo.jpg',
      mimeType: 'image/jpeg',
      localUri: 'file:///cache/media-1.jpg',
      fileSize: 1234,
      cachedAt: Date.now(),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the cached file immediately when media is already present locally', async () => {
    mockState.isMediaCached.mockResolvedValue(true)
    mockState.getLocalMediaUri.mockResolvedValue('file:///cache/media-1.jpg')

    const result = await hydrateMessageAttachment(
      'message-1',
      'conversation-1',
      encryptedImageAttachment,
    )

    expect(result).toMatchObject({
      id: 'media-1',
      uri: 'file:///cache/media-1.jpg',
      isEncrypted: false,
    })
    expect(mockState.downloadAndDecryptMedia).not.toHaveBeenCalled()
    expect(mockState.registerCachedMedia).not.toHaveBeenCalled()
  })

  it('queues remote deletion only after registering the encrypted local copy', async () => {
    await hydrateMessageAttachment(
      'message-1',
      'conversation-1',
      encryptedImageAttachment,
    )

    expect(mockState.registerCachedMedia).toHaveBeenCalledWith(
      'media-1',
      'message-1',
      'conversation-1',
      expect.any(String),
      expect.objectContaining({ id: 'media-1' }),
      mockState.walletAddress,
      'spectra://objects/users/sender/attachments/media-1.enc',
    )
    expect(mockState.registerCachedMedia.mock.invocationCallOrder[0]).toBeLessThan(
      mockState.schedulePendingRemoteMediaCleanup.mock.invocationCallOrder.at(-1)!,
    )
  })

  it('returns the original attachment on background failure and succeeds on a later retry', async () => {
    mockState.downloadAndDecryptMedia.mockRejectedValueOnce(
      new Error('Tor download failed'),
    )

    const backgroundResult = await hydrateMessageAttachments(
      'message-1',
      'conversation-1',
      [encryptedImageAttachment],
      { backgroundOnly: true },
    )

    expect(backgroundResult).toEqual([encryptedImageAttachment])

    const retryResult = await hydrateMessageAttachment(
      'message-1',
      'conversation-1',
      encryptedImageAttachment,
    )

    expect(retryResult).toMatchObject({
      id: 'media-1',
      uri: 'file:///cache/media-1.jpg',
      isEncrypted: false,
    })
    expect(mockState.downloadAndDecryptMedia).toHaveBeenCalledTimes(2)
    expect(mockState.registerCachedMedia).toHaveBeenCalledTimes(1)
  })

  it('shares one in-flight download for concurrent hydration of the same attachment', async () => {
    let resolveDownload!: () => void
    mockState.downloadAndDecryptMedia.mockImplementation(
      () => new Promise<void>((resolve) => {
        resolveDownload = resolve
      }),
    )

    const first = hydrateMessageAttachment(
      'message-1',
      'conversation-1',
      encryptedImageAttachment,
    )
    const second = hydrateMessageAttachment(
      'message-1',
      'conversation-1',
      encryptedImageAttachment,
    )

    await vi.waitFor(() => {
      expect(mockState.downloadAndDecryptMedia).toHaveBeenCalledTimes(1)
    })

    resolveDownload()

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({
        id: 'media-1',
        uri: 'file:///cache/media-1.jpg',
        isEncrypted: false,
      }),
      expect.objectContaining({
        id: 'media-1',
        uri: 'file:///cache/media-1.jpg',
        isEncrypted: false,
      }),
    ])
    expect(mockState.registerCachedMedia).toHaveBeenCalledTimes(1)
  })

  it('reuses prepared attachments from the in-memory hydration cache', async () => {
    const first = await hydrateMessageAttachment(
      'message-1',
      'conversation-1',
      encryptedImageAttachment,
    )
    const second = await hydrateMessageAttachment(
      'message-1',
      'conversation-1',
      encryptedImageAttachment,
    )

    expect(first).toMatchObject({
      id: 'media-1',
      uri: 'file:///cache/media-1.jpg',
      isEncrypted: false,
    })
    expect(second).toMatchObject({
      id: 'media-1',
      uri: 'file:///cache/media-1.jpg',
      isEncrypted: false,
    })
    expect(mockState.downloadAndDecryptMedia).toHaveBeenCalledTimes(1)
    expect(mockState.initializeMediaCache).toHaveBeenCalledTimes(1)
  })

  it('isolates in-flight work and memory cache by wallet generation', async () => {
    let generation = 1
    let releaseFirstDownload!: () => void
    mockState.downloadAndDecryptMedia
      .mockImplementationOnce(() => new Promise<void>((resolve) => {
        releaseFirstDownload = resolve
      }))
      .mockResolvedValueOnce({
        mediaType: 'image',
        fileName: 'photo.jpg',
        mimeType: 'image/jpeg',
        fileSize: 1234,
      })

    const first = hydrateMessageAttachment(
      'message-1',
      'conversation-1',
      encryptedImageAttachment,
      undefined,
      {
        walletScope: mockState.walletAddress,
        generation,
        isCurrent: () => generation === 1,
      },
    )

    await vi.waitFor(() => {
      expect(mockState.downloadAndDecryptMedia).toHaveBeenCalledTimes(1)
    })

    generation = 2
    mockState.walletAddress = 'exo00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    const second = hydrateMessageAttachment(
      'message-1',
      'conversation-1',
      encryptedImageAttachment,
      undefined,
      {
        walletScope: mockState.walletAddress,
        generation,
        isCurrent: () => generation === 2,
      },
    )

    await expect(second).resolves.toMatchObject({
      id: 'media-1',
      isEncrypted: false,
    })
    expect(mockState.downloadAndDecryptMedia).toHaveBeenCalledTimes(2)

    releaseFirstDownload()
    await expect(first).rejects.toThrow('Attachment hydration wallet scope changed')
    expect(mockState.registerCachedMedia).toHaveBeenCalledTimes(1)
  })

  it('does not reuse hydrated plaintext across wallet scopes', async () => {
    await hydrateMessageAttachment(
      'message-1',
      'conversation-1',
      encryptedImageAttachment,
      undefined,
      {
        walletScope: mockState.walletAddress,
        generation: 1,
      },
    )

    mockState.walletAddress = 'exo00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    await hydrateMessageAttachment(
      'message-1',
      'conversation-1',
      encryptedImageAttachment,
      undefined,
      {
        walletScope: mockState.walletAddress,
        generation: 2,
      },
    )

    expect(mockState.downloadAndDecryptMedia).toHaveBeenCalledTimes(2)
  })

  it('regenerates a missing transient render from encrypted local storage', async () => {
    mockState.isMediaCached.mockResolvedValue(true)
    mockState.getLocalMediaUri.mockResolvedValue(
      'file:///cache/spectra-transient-render-v1/media-1.jpg',
    )

    const hydrated = await hydrateMessageAttachment(
      'message-1',
      'conversation-1',
      {
        ...encryptedImageAttachment,
        uri: 'file:///cache/spectra-transient-render-v1/media-1.jpg',
        isEncrypted: false,
        encryptionKey: undefined,
      },
    )

    expect(hydrated).toMatchObject({
      uri: 'file:///cache/spectra-transient-render-v1/media-1.jpg',
      isEncrypted: false,
    })
    expect(mockState.getLocalMediaUri).toHaveBeenCalledWith(
      'media-1',
      mockState.walletAddress,
    )
    expect(mockState.downloadAndDecryptMedia).not.toHaveBeenCalled()
  })

  it('throws when an encrypted attachment is missing its encryption key', async () => {
    const missingKeyAttachment = {
      ...encryptedImageAttachment,
      encryptionKey: undefined,
    }

    await expect(
      hydrateMessageAttachment(
        'message-1',
        'conversation-1',
        missingKeyAttachment,
      ),
    ).rejects.toThrow('Attachment encryption key is missing')

    expect(mockState.downloadAndDecryptMedia).not.toHaveBeenCalled()
    expect(mockState.registerCachedMedia).not.toHaveBeenCalled()
  })

  it('rejects unsafe media ids before constructing a download destination', async () => {
    const unsafeAttachment = {
      ...encryptedImageAttachment,
      id: '../escape',
    }

    await expect(
      hydrateMessageAttachment(
        'message-1',
        'conversation-1',
        unsafeAttachment,
      ),
    ).rejects.toThrow('Unsafe media id')

    expect(mockState.initializeMediaCache).not.toHaveBeenCalled()
    expect(mockState.downloadAndDecryptMedia).not.toHaveBeenCalled()
    expect(mockState.registerCachedMedia).not.toHaveBeenCalled()
  })

  it('does not auto-hydrate one-time attachments in the background', () => {
    expect(shouldAutoHydrateAttachment({
      ...encryptedImageAttachment,
      isViewOnce: true,
    })).toBe(false)
  })
})
