/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Platform } from 'react-native'

const mockState = vi.hoisted(() => ({
  isBackendConfigured: true,
  chatMediaSingle: vi.fn(),
  chatMediaInsert: vi.fn(),
  createSignedUrl: vi.fn(),
  storageRemove: vi.fn(),
  chatMediaUpdateEq: vi.fn(),
  ensureBoundBackendAccessForIdentity: vi.fn(),
  getValidBackendAccessToken: vi.fn(),
  uploadObjectWithBackend: vi.fn(),
  deleteObjectWithBackend: vi.fn(),
  signObjectDownloadWithBackend: vi.fn(),
  getBackendAuthHeaders: vi.fn(),
  torAwareFetchBytes: vi.fn(),
  torSafeUpload: vi.fn(),
  fileCreate: vi.fn(),
  fileBytes: vi.fn(),
  fileWrite: vi.fn(),
  copyAsync: vi.fn(),
  deleteAsync: vi.fn(),
  legacyGetInfoAsync: vi.fn(),
  makeDirectoryAsync: vi.fn(),
  base64ToBytes: vi.fn(),
  bytesToBase64: vi.fn(),
  computeContentHash: vi.fn(),
  computeContentHashMeasuredAsync: vi.fn(),
  decryptMediaMeasuredAsync: vi.fn(),
  encryptMedia: vi.fn(),
  encryptMediaMeasuredAsync: vi.fn(),
  encryptMediaToBlobFileMeasuredAsync: vi.fn(),
  decryptMediaFromBlobFileMeasuredAsync: vi.fn(),
  canUseNativeMediaFileCrypto: vi.fn(() => false),
  NATIVE_MEDIA_FILE_THRESHOLD_BYTES: 64 * 1024,
  generateRandomBytes: vi.fn(),
  prepareOutgoingMediaAttachment: vi.fn(),
  releasePreparedOutgoingMediaAttachment: vi.fn(),
  registerMediaSendUpload: vi.fn(),
  requestMediaSendAbandonment: vi.fn(),
  recordDiagnostic: vi.fn(),
}))

vi.mock('@/services/backend/client', () => ({
  isBackendConfigured: () => mockState.isBackendConfigured,
  isSpectraBackendConfigured: () => mockState.isBackendConfigured,
  getBackendAuthHeaders: mockState.getBackendAuthHeaders,
}))

vi.mock('@/services/backend/data', () => ({
  backendData: {
    table: (table: string) => {
      if (table !== 'chat_media') {
        throw new Error(`Unexpected table: ${table}`)
      }

      return {
        select: () => ({
          eq: () => ({
            single: mockState.chatMediaSingle,
          }),
        }),
        update: () => ({
          eq: mockState.chatMediaUpdateEq,
        }),
        insert: mockState.chatMediaInsert,
      }
    },
  },
}))

vi.mock('../backend/session', () => ({
  ensureBoundBackendAccessForIdentity: mockState.ensureBoundBackendAccessForIdentity,
  getValidBackendAccessToken: mockState.getValidBackendAccessToken,
}))

vi.mock('@/services/backend/objectStorage', () => ({
  uploadObjectWithBackend: mockState.uploadObjectWithBackend,
  deleteObjectWithBackend: mockState.deleteObjectWithBackend,
  signObjectDownloadWithBackend: mockState.signObjectDownloadWithBackend,
}))

vi.mock('../backend/client', () => ({
  isBackendConfigured: () => mockState.isBackendConfigured,
  isSpectraBackendConfigured: () => mockState.isBackendConfigured,
  getBackendAuthHeaders: mockState.getBackendAuthHeaders,
  backend: {
    from: (table: string) => {
      if (table !== 'chat_media') {
        throw new Error(`Unexpected table: ${table}`)
      }

      return {
        select: () => ({
          eq: () => ({
            single: mockState.chatMediaSingle,
          }),
        }),
        update: () => ({
          eq: mockState.chatMediaUpdateEq,
        }),
        insert: mockState.chatMediaInsert,
      }
    },
    storage: {
      from: (_bucket: string) => ({
        createSignedUrl: mockState.createSignedUrl,
        remove: mockState.storageRemove,
      }),
    },
  },
}))

vi.mock('react-native', async () => await import('../../test/react-native'))

vi.mock('@/lib/constants', () => ({
  SPECTRA_API_URL: 'https://example.com',
  STORAGE_KEYS: {},
}))

vi.mock('@/services/tor/torFetch', () => ({
  torAwareFetchBytes: mockState.torAwareFetchBytes,
}))

vi.mock('@/services/tor/torUpload', () => ({
  torSafeUpload: mockState.torSafeUpload,
}))

vi.mock('./outgoingAttachment', () => ({
  isPreparedOutgoingMediaAttachment: (value: { version?: number }) => value.version === 1,
  prepareOutgoingMediaAttachment: mockState.prepareOutgoingMediaAttachment,
  releasePreparedOutgoingMediaAttachment: mockState.releasePreparedOutgoingMediaAttachment,
}))

vi.mock('./mediaSendOutbox', () => ({
  registerMediaSendUpload: mockState.registerMediaSendUpload,
  requestMediaSendAbandonment: mockState.requestMediaSendAbandonment,
}))

vi.mock('expo-file-system', () => ({
  File: class MockFile {
    private readonly path: string

    constructor(path: string) {
      this.path = path
    }

    create(options: unknown): void {
      mockState.fileCreate(this.path, options)
    }

    write(bytes: Uint8Array): void {
      mockState.fileWrite(this.path, bytes)
    }

    delete(): void {
      mockState.deleteAsync(this.path)
    }

    async bytes(): Promise<Uint8Array> {
      return mockState.fileBytes(this.path)
    }

    get exists(): boolean {
      return true
    }
  },
}))

vi.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  documentDirectory: 'file:///documents/',
  copyAsync: mockState.copyAsync,
  deleteAsync: mockState.deleteAsync,
  getInfoAsync: mockState.legacyGetInfoAsync,
  makeDirectoryAsync: mockState.makeDirectoryAsync,
}))

vi.mock('@spectra/core-crypto', () => ({
  encryptMedia: mockState.encryptMedia,
  encryptMediaMeasuredAsync: mockState.encryptMediaMeasuredAsync,
  encryptMediaToBlobFileMeasuredAsync: mockState.encryptMediaToBlobFileMeasuredAsync,
  decryptMediaFromBlobFileMeasuredAsync: mockState.decryptMediaFromBlobFileMeasuredAsync,
  canUseNativeMediaFileCrypto: mockState.canUseNativeMediaFileCrypto,
  NATIVE_MEDIA_FILE_THRESHOLD_BYTES: mockState.NATIVE_MEDIA_FILE_THRESHOLD_BYTES,
  decryptMediaMeasuredAsync: mockState.decryptMediaMeasuredAsync,
  computeContentHash: mockState.computeContentHash,
  computeContentHashMeasuredAsync: mockState.computeContentHashMeasuredAsync,
  generateRandomBytes: mockState.generateRandomBytes,
  bytesToBase64: mockState.bytesToBase64,
  base64ToBytes: mockState.base64ToBytes,
}))

import { downloadAndDecryptMedia, uploadEncryptedMedia } from './mediaService'

function createEncryptedBlobBytes(mediaId: string): Uint8Array {
  const headerBytes = new TextEncoder().encode(
    JSON.stringify({
      id: mediaId,
      mediaType: 'image',
      encryptedMetadata: {
        ciphertext: 'meta',
        nonce: 'nonce',
        tag: 'tag',
      },
      isChunked: false,
      totalChunks: null,
      encryptedSize: 0,
      version: 1,
    }),
  )
  const headerLength = new Uint8Array(4)
  new DataView(headerLength.buffer).setUint32(0, headerBytes.length, true)

  const contentBytes = new TextEncoder().encode(
    JSON.stringify({
      ciphertext: 'ciphertext',
      nonce: 'nonce',
      tag: 'tag',
    }),
  )

  const blob = new Uint8Array(4 + headerBytes.length + contentBytes.length)
  blob.set(headerLength, 0)
  blob.set(headerBytes, 4)
  blob.set(contentBytes, 4 + headerBytes.length)
  return blob
}

function createDownloadDiagnostics() {
  return {
    correlationId: 'hydrate:test',
    recordDiagnostic: mockState.recordDiagnostic,
  }
}

function getRecordedHydrationStages(): string[] {
  return mockState.recordDiagnostic.mock.calls
    .filter(([eventName]) => eventName === 'attachment_hydration')
    .map(([, fields]) => String((fields as Record<string, unknown>).stage))
}

const uploadAttachment = {
  id: 'local-attachment-1',
  type: 'image',
  uri: 'file:///photos/photo.jpg',
  fileName: 'photo.jpg',
  mimeType: 'image/jpeg',
  fileSize: 4,
  isEncrypted: false,
} as const

describe('uploadEncryptedMedia', () => {
  beforeEach(() => {
    ;(Platform as { OS: string }).OS = 'ios'
    mockState.isBackendConfigured = true
    mockState.chatMediaInsert.mockReset()
    mockState.createSignedUrl.mockReset()
    mockState.storageRemove.mockReset()
    mockState.getBackendAuthHeaders.mockReset()
    mockState.ensureBoundBackendAccessForIdentity.mockReset()
    mockState.getValidBackendAccessToken.mockReset()
    mockState.uploadObjectWithBackend.mockReset()
    mockState.deleteObjectWithBackend.mockReset()
    mockState.signObjectDownloadWithBackend.mockReset()
    mockState.torSafeUpload.mockReset()
    mockState.fileCreate.mockReset()
    mockState.fileBytes.mockReset()
    mockState.fileWrite.mockReset()
    mockState.copyAsync.mockReset()
    mockState.deleteAsync.mockReset()
    mockState.legacyGetInfoAsync.mockReset()
    mockState.makeDirectoryAsync.mockReset()
    mockState.bytesToBase64.mockReset()
    mockState.computeContentHash.mockReset()
    mockState.computeContentHashMeasuredAsync.mockReset()
    mockState.encryptMedia.mockReset()
    mockState.encryptMediaMeasuredAsync.mockReset()
    mockState.encryptMediaToBlobFileMeasuredAsync.mockReset()
    mockState.decryptMediaFromBlobFileMeasuredAsync.mockReset()
    mockState.canUseNativeMediaFileCrypto.mockReset()
    mockState.canUseNativeMediaFileCrypto.mockReturnValue(false)
    mockState.generateRandomBytes.mockReset()
    mockState.prepareOutgoingMediaAttachment.mockReset()
    mockState.releasePreparedOutgoingMediaAttachment.mockReset()
    mockState.registerMediaSendUpload.mockReset()
    mockState.requestMediaSendAbandonment.mockReset()

    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})

    mockState.bytesToBase64.mockReturnValue('encoded-media-key')
    mockState.computeContentHash.mockReturnValue('content-hash')
    mockState.computeContentHashMeasuredAsync.mockResolvedValue({
      hash: 'content-hash',
      source: 'js',
      elapsedMs: 1,
      bytes: 4,
    })
    mockState.generateRandomBytes.mockReturnValue(Uint8Array.from([4, 5, 6]))
    mockState.fileBytes.mockResolvedValue(Uint8Array.from([1, 2, 3, 4]))
    mockState.prepareOutgoingMediaAttachment.mockImplementation(async (attachment: typeof uploadAttachment) => ({
      version: 1,
      attachment: {
        ...attachment,
        uri: 'file:///cache/media_ingress/local-attachment-1.jpg',
        fileSize: 4,
        mimeType: 'image/jpeg',
        type: 'image',
      },
      ingress: {
        uri: 'file:///cache/media_ingress/local-attachment-1.jpg',
        fileSize: 4,
        mimeType: 'image/jpeg',
        mediaType: 'image',
        digest: 'content-hash',
        bytes: Uint8Array.from([1, 2, 3, 4]),
        deleteOnRelease: true,
      },
    }))
    mockState.releasePreparedOutgoingMediaAttachment.mockResolvedValue(undefined)
    mockState.registerMediaSendUpload.mockResolvedValue(undefined)
    mockState.requestMediaSendAbandonment.mockResolvedValue(undefined)
    mockState.copyAsync.mockResolvedValue(undefined)
    mockState.legacyGetInfoAsync.mockImplementation(async (uri: string) => ({
      exists: uri === 'file:///cache/outgoing_media/' || uri.startsWith('file:///cache/outgoing_media/'),
      size: uri.includes('outgoing_media') ? 4 : undefined,
    }))
    mockState.makeDirectoryAsync.mockResolvedValue(undefined)
    mockState.getBackendAuthHeaders.mockResolvedValue({ Authorization: 'Bearer token' })
    mockState.ensureBoundBackendAccessForIdentity.mockResolvedValue({ accessToken: 'access-token' })
    mockState.getValidBackendAccessToken.mockResolvedValue('access-token')
    mockState.uploadObjectWithBackend.mockResolvedValue({
      objectRef: 'spectra://objects/chat-media/sender-1/recipient-1/encrypted-media-1.enc',
      error: null,
    })
    mockState.deleteObjectWithBackend.mockResolvedValue({ error: null })
    const encryptedMedia = {
      id: 'encrypted-media-1',
      mediaType: 'image',
      encryptedMetadata: {
        ciphertext: 'meta',
        nonce: 'nonce',
        tag: 'tag',
      },
      encryptedContent: {
        ciphertext: 'ciphertext',
        nonce: 'nonce',
        tag: 'tag',
      },
      encryptedSize: 10,
      isChunked: false,
      totalChunks: undefined,
      version: 1,
    }
    mockState.encryptMedia.mockReturnValue(encryptedMedia)
    mockState.encryptMediaMeasuredAsync.mockResolvedValue({
      encrypted: encryptedMedia,
      performance: {
        source: 'js',
        hashMs: 0,
        encryptMs: 2,
        totalMs: 2,
        sourceBytes: 4,
        isChunked: false,
        totalChunks: undefined,
      },
    })
    mockState.torSafeUpload.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => '',
    })
    mockState.chatMediaInsert.mockResolvedValue({ error: null })
    mockState.storageRemove.mockResolvedValue(undefined)
    mockState.deleteAsync.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uploads encrypted media and persists metadata', async () => {
    await expect(
      uploadEncryptedMedia(
        uploadAttachment,
        'sender-1',
        'recipient-1',
        'direct:recipient-1',
        undefined,
        { optimisticMessageId: 'local:message-1' },
      ),
    ).resolves.toEqual(expect.objectContaining({
      id: 'encrypted-media-1',
      storagePath: expect.stringContaining('sender-1/recipient-1/'),
      encryptionKey: 'encoded-media-key',
      contentHash: 'content-hash',
      performance: expect.objectContaining({
        source: 'js',
        hashSource: 'js',
        encryptSource: 'js',
        sourceBytes: 4,
        uploadBytes: expect.any(Number),
      }),
    }))

    expect(mockState.computeContentHashMeasuredAsync).not.toHaveBeenCalled()
    expect(mockState.encryptMediaMeasuredAsync).toHaveBeenCalledWith(
      Uint8Array.from([4, 5, 6]),
      Uint8Array.from([1, 2, 3, 4]),
      expect.objectContaining({ contentHash: '' }),
      expect.objectContaining({ contentHash: 'content-hash' }),
    )

    expect(mockState.uploadObjectWithBackend).toHaveBeenCalledWith(
      expect.objectContaining({
        fileUri: 'file:///cache/upload_encrypted-media-1.enc',
        fileName: 'encrypted-media-1.enc',
        contentType: 'application/octet-stream',
        size: expect.any(Number),
        diagnostics: expect.objectContaining({
          bucket: 'chat-media',
          conversationId: 'direct:recipient-1',
        }),
      }),
      { accessToken: 'access-token' },
    )
    expect(mockState.chatMediaInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'encrypted-media-1',
        sender_identity_id: 'sender-1',
        recipient_identity_id: 'recipient-1',
        conversation_id: 'direct:recipient-1',
        storage_path: 'spectra://objects/chat-media/sender-1/recipient-1/encrypted-media-1.enc',
        status: 'uploaded',
      }),
    )
    expect(mockState.registerMediaSendUpload).toHaveBeenCalledWith({
      mediaId: 'encrypted-media-1',
      objectRef: 'spectra://objects/chat-media/sender-1/recipient-1/encrypted-media-1.enc',
      sendId: 'local:message-1',
      conversationId: 'direct:recipient-1',
    })
    expect(mockState.deleteAsync).toHaveBeenCalledWith(
      'file:///cache/upload_encrypted-media-1.enc',
      { idempotent: true },
    )
  })

  it('uses app-owned validated ingress files before reading bytes', async () => {
    ;(Platform as { OS: string }).OS = 'android'

    await expect(
      uploadEncryptedMedia(
        {
          ...uploadAttachment,
          uri: 'content://downloads/photo',
          fileName: 'photo.jpg',
        },
        'sender-1',
        'recipient-1',
        'direct:recipient-1',
      ),
    ).resolves.toEqual(expect.objectContaining({
      id: 'encrypted-media-1',
    }))

    expect(mockState.prepareOutgoingMediaAttachment).toHaveBeenCalledWith(
      expect.objectContaining({ uri: 'content://downloads/photo' }),
    )
    expect(mockState.fileBytes).not.toHaveBeenCalled()
    expect(mockState.registerMediaSendUpload).not.toHaveBeenCalled()
    expect(mockState.releasePreparedOutgoingMediaAttachment).toHaveBeenCalledTimes(1)
  })

  it('leaves caller-owned prepared ingress for the caller to release', async () => {
    const prepared = await mockState.prepareOutgoingMediaAttachment(uploadAttachment)

    await uploadEncryptedMedia(
      prepared,
      'sender-1',
      'recipient-1',
      'direct:recipient-1',
    )

    expect(mockState.releasePreparedOutgoingMediaAttachment).not.toHaveBeenCalled()
  })

  it('tags object upload transport exceptions and removes temp files', async () => {
    mockState.uploadObjectWithBackend.mockResolvedValue({
      objectRef: '',
      error: new Error('Network request failed'),
    })

    await expect(
      uploadEncryptedMedia(
        uploadAttachment,
        'sender-1',
        'recipient-1',
        'direct:recipient-1',
      ),
    ).rejects.toThrow('Network request failed')

    expect(mockState.deleteObjectWithBackend).not.toHaveBeenCalled()
    expect(mockState.deleteAsync).toHaveBeenCalledWith(
      'file:///cache/upload_encrypted-media-1.enc',
      { idempotent: true },
    )
  })

  it('removes temp files when metadata persistence fails after object upload', async () => {
    mockState.chatMediaInsert.mockResolvedValue({
      error: { message: 'db insert failed' },
    })

    await expect(
      uploadEncryptedMedia(
        uploadAttachment,
        'sender-1',
        'recipient-1',
        'direct:recipient-1',
        undefined,
        { optimisticMessageId: 'local:message-1' },
      ),
    ).rejects.toThrow('Failed to save media metadata: db insert failed')

    expect(mockState.requestMediaSendAbandonment).toHaveBeenCalledWith(['encrypted-media-1'])
    expect(mockState.deleteObjectWithBackend).not.toHaveBeenCalled()
    expect(mockState.deleteAsync).toHaveBeenCalledWith(
      'file:///cache/upload_encrypted-media-1.enc',
      { idempotent: true },
    )
  })

  it('fails before upload when Backend is not configured', async () => {
    mockState.isBackendConfigured = false

    await expect(
      uploadEncryptedMedia(
        uploadAttachment,
        'sender-1',
        'recipient-1',
        'direct:recipient-1',
      ),
    ).rejects.toThrow('Backend not configured')

    expect(mockState.fileBytes).not.toHaveBeenCalled()
    expect(mockState.uploadObjectWithBackend).not.toHaveBeenCalled()
  })
})

describe('downloadAndDecryptMedia', () => {
  beforeEach(() => {
    ;(Platform as { OS: string }).OS = 'ios'
    mockState.isBackendConfigured = true
    mockState.chatMediaSingle.mockReset()
    mockState.chatMediaInsert.mockReset()
    mockState.createSignedUrl.mockReset()
    mockState.storageRemove.mockReset()
    mockState.chatMediaUpdateEq.mockReset()
    mockState.getBackendAuthHeaders.mockReset()
    mockState.ensureBoundBackendAccessForIdentity.mockReset()
    mockState.getValidBackendAccessToken.mockReset()
    mockState.uploadObjectWithBackend.mockReset()
    mockState.signObjectDownloadWithBackend.mockReset()
    mockState.torAwareFetchBytes.mockReset()
    mockState.torSafeUpload.mockReset()
    mockState.fileCreate.mockReset()
    mockState.fileBytes.mockReset()
    mockState.fileWrite.mockReset()
    mockState.copyAsync.mockReset()
    mockState.deleteAsync.mockReset()
    mockState.legacyGetInfoAsync.mockReset()
    mockState.makeDirectoryAsync.mockReset()
    mockState.base64ToBytes.mockReset()
    mockState.bytesToBase64.mockReset()
    mockState.computeContentHash.mockReset()
    mockState.computeContentHashMeasuredAsync.mockReset()
    mockState.decryptMediaMeasuredAsync.mockReset()
    mockState.encryptMedia.mockReset()
    mockState.encryptMediaMeasuredAsync.mockReset()
    mockState.encryptMediaToBlobFileMeasuredAsync.mockReset()
    mockState.decryptMediaFromBlobFileMeasuredAsync.mockReset()
    mockState.canUseNativeMediaFileCrypto.mockReset()
    mockState.canUseNativeMediaFileCrypto.mockReturnValue(false)
    mockState.generateRandomBytes.mockReset()
    mockState.recordDiagnostic.mockReset()

    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})

    mockState.base64ToBytes.mockReturnValue(Uint8Array.from([1, 2, 3]))
    mockState.bytesToBase64.mockReturnValue('encoded-media-key')
    mockState.computeContentHash.mockReturnValue('content-hash')
    mockState.generateRandomBytes.mockReturnValue(Uint8Array.from([4, 5, 6]))
    mockState.fileBytes.mockResolvedValue(Uint8Array.from([1, 2, 3, 4]))
    mockState.copyAsync.mockResolvedValue(undefined)
    mockState.legacyGetInfoAsync.mockResolvedValue({ exists: true, size: 4 })
    mockState.makeDirectoryAsync.mockResolvedValue(undefined)
    mockState.getBackendAuthHeaders.mockResolvedValue({ Authorization: 'Bearer token' })
    mockState.getValidBackendAccessToken.mockResolvedValue('access-token')
    mockState.signObjectDownloadWithBackend.mockResolvedValue({
      objectRef: 'spectra://objects/chat-media/sender-1/recipient-1/encrypted-media-1.enc',
      url: 'https://example.com/storage/v1/object/sign/chat-media/encrypted-media-1.enc',
      method: 'GET',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    })
    mockState.encryptMedia.mockReturnValue({
      id: 'encrypted-media-1',
      mediaType: 'image',
      encryptedMetadata: {
        ciphertext: 'meta',
        nonce: 'nonce',
        tag: 'tag',
      },
      encryptedContent: {
        ciphertext: 'ciphertext',
        nonce: 'nonce',
        tag: 'tag',
      },
      encryptedSize: 10,
      isChunked: false,
      totalChunks: undefined,
      version: 1,
    })
    mockState.torSafeUpload.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => '',
    })
    mockState.chatMediaInsert.mockResolvedValue({ error: null })
    mockState.deleteAsync.mockResolvedValue(undefined)
    mockState.decryptMediaMeasuredAsync.mockResolvedValue({
      metadata: {
        mediaType: 'image',
        fileName: 'photo.jpg',
        mimeType: 'image/jpeg',
        fileSize: 3,
      },
      content: Uint8Array.from([9, 8, 7]),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('defers direct-message cleanup until the local cache is durable', async () => {
    const encryptedBlob = createEncryptedBlobBytes('media-1')
    let disposition: { remoteObjectRef: string; shouldConsumeRemote: boolean } | null = null

    mockState.chatMediaSingle.mockResolvedValue({
      data: {
        id: 'media-1',
        status: 'uploaded',
        storage_path: 'spectra://objects/chat-media/sender/recipient/media-1.enc',
        conversation_id: 'direct:alice',
        encrypted_size: encryptedBlob.length,
      },
      error: null,
    })
    mockState.createSignedUrl.mockResolvedValue({
      data: {
        signedUrl: 'https://example.com/storage/v1/object/sign/chat-media/media-1.enc',
      },
      error: null,
    })
    mockState.torAwareFetchBytes.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        'content-type': 'application/octet-stream',
      }),
      bytes: encryptedBlob,
    })
    const operation = downloadAndDecryptMedia(
      'encoded-key',
      'media-1',
      'file:///cache/media-1.jpg',
      undefined,
      undefined,
      (value) => {
        disposition = value
      },
    )

    const settled = await Promise.race([
      operation.then(() => 'resolved'),
      new Promise<'timeout'>((resolve) => {
        setTimeout(() => resolve('timeout'), 20)
      }),
    ])

    expect(settled).toBe('resolved')
    await expect(operation).resolves.toEqual({
      mediaType: 'image',
      fileName: 'photo.jpg',
      mimeType: 'image/jpeg',
      fileSize: 3,
    })
    expect(mockState.fileCreate).toHaveBeenCalledWith(
      'file:///cache/media-1.jpg',
      { intermediates: true, overwrite: true },
    )
    expect(mockState.fileWrite).toHaveBeenCalledWith(
      'file:///cache/media-1.jpg',
      Uint8Array.from([9, 8, 7]),
    )
    expect(disposition).toEqual({
      remoteObjectRef: 'spectra://objects/chat-media/sender/recipient/media-1.enc',
      shouldConsumeRemote: true,
    })
    expect(mockState.chatMediaUpdateEq).not.toHaveBeenCalled()
  })

  it('keeps group media available after a member download', async () => {
    const encryptedBlob = createEncryptedBlobBytes('media-group')

    mockState.chatMediaSingle.mockResolvedValue({
      data: {
        id: 'media-group',
        status: 'uploaded',
        storage_path: 'spectra://objects/chat-media/sender/group-id/media-group.enc',
        conversation_id: 'group:550e8400-e29b-41d4-a716-446655440000',
        encrypted_size: encryptedBlob.length,
      },
      error: null,
    })
    mockState.createSignedUrl.mockResolvedValue({
      data: {
        signedUrl: 'https://example.com/storage/v1/object/sign/chat-media/media-group.enc',
      },
      error: null,
    })
    mockState.torAwareFetchBytes.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        'content-type': 'application/octet-stream',
      }),
      bytes: encryptedBlob,
    })

    await expect(
      downloadAndDecryptMedia(
        'encoded-key',
        'media-group',
        'file:///cache/media-group.jpg',
      ),
    ).resolves.toEqual({
      mediaType: 'image',
      fileName: 'photo.jpg',
      mimeType: 'image/jpeg',
      fileSize: 3,
    })

    expect(mockState.storageRemove).not.toHaveBeenCalled()
    expect(mockState.chatMediaUpdateEq).not.toHaveBeenCalled()
  })

  it('keeps decrypting a Tor candidate even when encrypted_size metadata is stale', async () => {
    const encryptedBlob = createEncryptedBlobBytes('media-2')

    mockState.chatMediaSingle.mockResolvedValue({
      data: {
        id: 'media-2',
        status: 'uploaded',
        storage_path: 'spectra://objects/chat-media/sender/recipient/media-2.enc',
        conversation_id: 'direct:bob',
        encrypted_size: encryptedBlob.length + 5,
      },
      error: null,
    })
    mockState.createSignedUrl.mockResolvedValue({
      data: {
        signedUrl: 'https://example.com/storage/v1/object/sign/chat-media/media-2.enc',
      },
      error: null,
    })
    mockState.torAwareFetchBytes.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        'content-type': 'application/octet-stream',
      }),
      bytes: encryptedBlob,
    })

    await expect(
      downloadAndDecryptMedia(
        'encoded-key',
        'media-2',
        'file:///cache/media-2.jpg',
        undefined,
        createDownloadDiagnostics(),
      ),
    ).resolves.toEqual({
      mediaType: 'image',
      fileName: 'photo.jpg',
      mimeType: 'image/jpeg',
      fileSize: 3,
    })

    expect(mockState.decryptMediaMeasuredAsync).toHaveBeenCalledTimes(1)
    expect(mockState.fileWrite).toHaveBeenCalledWith(
      'file:///cache/media-2.jpg',
      Uint8Array.from([9, 8, 7]),
    )
    expect(getRecordedHydrationStages()).toContain('download_candidate_size_mismatch')
  })

  it('uses the first Tor candidate that actually decrypts when candidates are the same length', async () => {
    const goodCandidate = createEncryptedBlobBytes('media-aa')
    const badCandidate = createEncryptedBlobBytes('media-bb')

    mockState.chatMediaSingle.mockResolvedValue({
      data: {
        id: 'media-3',
        status: 'uploaded',
        storage_path: 'spectra://objects/chat-media/sender/recipient/media-3.enc',
        conversation_id: 'direct:carol',
        encrypted_size: goodCandidate.length,
      },
      error: null,
    })
    mockState.createSignedUrl.mockResolvedValue({
      data: {
        signedUrl: 'https://example.com/storage/v1/object/sign/chat-media/media-3.enc',
      },
      error: null,
    })
    mockState.torAwareFetchBytes.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        'content-type': 'application/octet-stream',
      }),
      bytes: Uint8Array.from([1, 2, 3]),
      byteCandidates: {
        preferredEncoding: 'latin1',
        latin1: badCandidate,
        utf8: goodCandidate,
      },
    })
    mockState.decryptMediaMeasuredAsync.mockImplementation((_key, encryptedMedia) => {
      if (encryptedMedia.id === 'media-bb') {
        throw new Error('Decrypt candidate failed')
      }

      return {
        metadata: {
          mediaType: 'image',
          fileName: 'photo.png',
          mimeType: 'image/png',
          fileSize: 3,
        },
        content: Uint8Array.from([5, 4, 3]),
      }
    })

    await expect(
      downloadAndDecryptMedia(
        'encoded-key',
        'media-3',
        'file:///cache/media-3.png',
        undefined,
        createDownloadDiagnostics(),
      ),
    ).resolves.toEqual({
      mediaType: 'image',
      fileName: 'photo.png',
      mimeType: 'image/png',
      fileSize: 3,
    })

    expect(mockState.decryptMediaMeasuredAsync).toHaveBeenCalledTimes(2)
    expect(mockState.fileWrite).toHaveBeenCalledWith(
      'file:///cache/media-3.png',
      Uint8Array.from([5, 4, 3]),
    )
    expect(getRecordedHydrationStages()).toContain('download_candidate_failed')
    expect(getRecordedHydrationStages()).toContain('download_candidate_selected')
  })

  it('fails only after every Tor byte candidate is exhausted', async () => {
    const parseFailureCandidate = new Uint8Array(createEncryptedBlobBytes('media-4').length)
    const decryptFailureCandidate = createEncryptedBlobBytes('media-bb')

    mockState.chatMediaSingle.mockResolvedValue({
      data: {
        id: 'media-4',
        status: 'uploaded',
        storage_path: 'spectra://objects/chat-media/sender/recipient/media-4.enc',
        conversation_id: 'direct:dave',
        encrypted_size: decryptFailureCandidate.length,
      },
      error: null,
    })
    mockState.createSignedUrl.mockResolvedValue({
      data: {
        signedUrl: 'https://example.com/storage/v1/object/sign/chat-media/media-4.enc',
      },
      error: null,
    })
    mockState.torAwareFetchBytes.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        'content-type': 'application/octet-stream',
      }),
      bytes: parseFailureCandidate,
      byteCandidates: {
        preferredEncoding: 'latin1',
        latin1: parseFailureCandidate,
        utf8: decryptFailureCandidate,
      },
    })
    mockState.decryptMediaMeasuredAsync.mockImplementation(() => {
      throw new Error('Media content integrity verification failed - hash mismatch')
    })

    await expect(
      downloadAndDecryptMedia(
        'encoded-key',
        'media-4',
        'file:///cache/media-4.png',
        undefined,
        createDownloadDiagnostics(),
      ),
    ).rejects.toThrow('Unable to decode Tor media response')

    const stages = getRecordedHydrationStages()
    expect(stages).toContain('download_candidate_failed')
    expect(stages).toContain('download_candidate_exhausted')
    expect(mockState.recordDiagnostic).toHaveBeenCalledWith(
      'attachment_hydration_failed',
      expect.objectContaining({
        failureStage: 'download_candidate_validation',
      }),
    )
  })

  it('rejects malformed encrypted blobs before attempting decryption', async () => {
    mockState.chatMediaSingle.mockResolvedValue({
      data: {
        id: 'media-malformed',
        status: 'uploaded',
        storage_path: 'spectra://objects/chat-media/sender/recipient/media-malformed.enc',
        conversation_id: 'direct:eve',
        encrypted_size: 3,
      },
      error: null,
    })
    mockState.createSignedUrl.mockResolvedValue({
      data: {
        signedUrl: 'https://example.com/storage/v1/object/sign/chat-media/media-malformed.enc',
      },
      error: null,
    })
    mockState.torAwareFetchBytes.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        'content-type': 'application/octet-stream',
      }),
      bytes: Uint8Array.from([1, 2, 3]),
    })

    await expect(
      downloadAndDecryptMedia(
        'encoded-key',
        'media-malformed',
        'file:///cache/media-malformed.jpg',
        undefined,
        createDownloadDiagnostics(),
      ),
    ).rejects.toThrow('Unable to decode Tor media response')

    expect(mockState.decryptMediaMeasuredAsync).not.toHaveBeenCalled()
    expect(getRecordedHydrationStages()).toContain('download_candidate_failed')
  })

  it('rejects encrypted blobs with impossible header lengths', async () => {
    const malformedBlob = new Uint8Array(4)
    new DataView(malformedBlob.buffer).setUint32(0, 1024 * 1024, true)

    mockState.chatMediaSingle.mockResolvedValue({
      data: {
        id: 'media-long-header',
        status: 'uploaded',
        storage_path: 'spectra://objects/chat-media/sender/recipient/media-long-header.enc',
        conversation_id: 'direct:frank',
        encrypted_size: malformedBlob.length,
      },
      error: null,
    })
    mockState.createSignedUrl.mockResolvedValue({
      data: {
        signedUrl: 'https://example.com/storage/v1/object/sign/chat-media/media-long-header.enc',
      },
      error: null,
    })
    mockState.torAwareFetchBytes.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        'content-type': 'application/octet-stream',
      }),
      bytes: malformedBlob,
    })

    await expect(
      downloadAndDecryptMedia(
        'encoded-key',
        'media-long-header',
        'file:///cache/media-long-header.jpg',
        undefined,
        createDownloadDiagnostics(),
      ),
    ).rejects.toThrow('Unable to decode Tor media response')

    expect(mockState.decryptMediaMeasuredAsync).not.toHaveBeenCalled()
    expect(getRecordedHydrationStages()).toContain('download_candidate_failed')
  })
})
