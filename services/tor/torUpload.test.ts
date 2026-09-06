/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  torEnabled: false,
  torStatus: 'disconnected',
  fileExists: true,
  fileBytes: Uint8Array.from([1, 2, 3, 4]),
  fileSize: null as number | null,
  filePaths: [] as string[],
  torFetch: vi.fn(),
  legacyCreateUploadTask: vi.fn(),
  legacyUploadTaskUploadAsync: vi.fn(),
  legacyUploadTaskCancelAsync: vi.fn(async () => undefined),
}))

vi.mock('./torStore', () => ({
  useTorStore: {
    getState: () => ({
      enabled: mockState.torEnabled,
      status: mockState.torStatus,
    }),
  },
}))

vi.mock('./torFetch', () => ({
  torAwareFetch: mockState.torFetch,
}))

vi.mock('./torConstants', () => ({
  LOG_PREFIX: '[TOR]',
}))

vi.mock('@/services/logging/mobileLogger', () => ({
  createSanitizedConsole: () => console,
}))

vi.mock('expo-file-system', () => ({
  File: class MockFile {
    constructor(path: string) {
      mockState.filePaths.push(path)
    }

    get exists(): boolean {
      return mockState.fileExists
    }

    get size(): number {
      return mockState.fileSize ?? mockState.fileBytes.length
    }

    async bytes(): Promise<Uint8Array> {
      return mockState.fileBytes
    }

    async base64(): Promise<string> {
      return Buffer.from(mockState.fileBytes).toString('base64')
    }
  },
}))

vi.mock('expo-file-system/legacy', () => ({
  FileSystemSessionType: {
    BACKGROUND: 0,
    FOREGROUND: 1,
  },
  FileSystemUploadType: {
    BINARY_CONTENT: 0,
    MULTIPART: 1,
  },
  createUploadTask: mockState.legacyCreateUploadTask,
}))

import { torSafeUpload } from './torUpload'
import { setClearnetEgressAllowed } from './torEgressPolicy'

describe('torSafeUpload', () => {
  beforeEach(async () => {
    await setClearnetEgressAllowed(true)
    mockState.torEnabled = false
    mockState.torStatus = 'disconnected'
    mockState.fileExists = true
    mockState.fileBytes = Uint8Array.from([1, 2, 3, 4])
    mockState.fileSize = null
    mockState.filePaths = []
    mockState.torFetch.mockReset()
    mockState.legacyCreateUploadTask.mockReset()
    mockState.legacyUploadTaskUploadAsync.mockReset()
    mockState.legacyUploadTaskCancelAsync.mockClear()
    mockState.legacyUploadTaskUploadAsync.mockResolvedValue({
      body: '{"ok":true}',
      headers: {
        'content-type': 'application/json',
        'x-trace-id': 'trace-legacy-123',
      },
      mimeType: 'application/json',
      status: 200,
    })
    mockState.legacyCreateUploadTask.mockImplementation(() => ({
      uploadAsync: mockState.legacyUploadTaskUploadAsync,
      cancelAsync: mockState.legacyUploadTaskCancelAsync,
    }))
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(async () => {
    await setClearnetEgressAllowed(true)
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('uses the direct storage upload task for native uploads', async () => {
    const response = await torSafeUpload(
      'https://example.com/storage/v1/object/chat-media/sender-1/recipient-1/test.enc',
      'file:///tmp/test.enc',
      'test.enc',
      'application/octet-stream',
      {
        Authorization: 'Bearer token',
        apikey: 'anon-key',
      },
      {
        caller: 'media.uploadEncryptedMedia',
        correlationId: 'media:test',
      },
    )

    expect(response.ok).toBe(true)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/json')
    await expect(response.text()).resolves.toBe('{"ok":true}')
    expect(mockState.legacyCreateUploadTask).toHaveBeenCalledTimes(1)
    expect(mockState.legacyCreateUploadTask).toHaveBeenCalledWith(
      'https://example.com/storage/v1/object/chat-media/sender-1/recipient-1/test.enc',
      'file:///tmp/test.enc',
      expect.objectContaining({
        httpMethod: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer token',
          apikey: 'anon-key',
          'Content-Type': 'application/octet-stream',
        }),
      }),
    )

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('native upload direct_request_ready'),
      expect.objectContaining({
        caller: 'media.uploadEncryptedMedia',
        correlationId: 'media:test',
        transport: 'native-direct-storage',
        nativeUploadApi: 'expo-file-system-upload-task',
        nativeUploadBodyType: 'binary-content',
        nativeUploadBodyByteLength: 4,
      }),
    )
  })

  it('cancels an active native upload before closing the Tor boundary', async () => {
    let rejectUpload!: (error: Error) => void
    mockState.legacyUploadTaskUploadAsync.mockReturnValue(new Promise((_, reject) => {
      rejectUpload = reject
    }))
    mockState.legacyUploadTaskCancelAsync.mockImplementation(async () => {
      rejectUpload(new Error('Native upload cancelled'))
    })

    const upload = torSafeUpload(
      'https://example.com/storage/v1/object/chat-media/test.enc',
      'file:///tmp/test.enc',
      'test.enc',
      'application/octet-stream',
      { Authorization: 'Bearer token' },
    )
    await vi.waitFor(() => expect(mockState.legacyCreateUploadTask).toHaveBeenCalledTimes(1))

    await setClearnetEgressAllowed(false)

    expect(mockState.legacyUploadTaskCancelAsync).toHaveBeenCalledTimes(1)
    await expect(upload).rejects.toThrow('Native upload cancelled')
  })

  it('supports PUT uploads without logging signed URL tokens', async () => {
    const response = await torSafeUpload(
      'https://example.com/storage/v1/object/upload/sign/objects/attachments/media.enc?token=signed-upload-token',
      'file:///tmp/media.enc',
      'media.enc',
      'application/octet-stream',
      {
        Authorization: 'Bearer token',
        apikey: 'anon-key',
        'cache-control': 'max-age=3600',
        'x-upsert': 'false',
      },
      {
        caller: 'media.uploadEncryptedAttachment',
        correlationId: 'media-id',
      },
      { httpMethod: 'PUT' },
    )

    expect(response.status).toBe(200)
    expect(mockState.legacyCreateUploadTask).toHaveBeenCalledWith(
      'https://example.com/storage/v1/object/upload/sign/objects/attachments/media.enc?token=signed-upload-token',
      'file:///tmp/media.enc',
      expect.objectContaining({
        httpMethod: 'PUT',
        headers: expect.objectContaining({
          Authorization: 'Bearer token',
          apikey: 'anon-key',
          'Content-Type': 'application/octet-stream',
          'cache-control': 'max-age=3600',
          'x-upsert': 'false',
        }),
      }),
    )
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('native upload direct_request_ready'),
      expect.objectContaining({
        caller: 'media.uploadEncryptedAttachment',
        correlationId: 'media-id',
        nativeUploadMethod: 'PUT',
        search: '[redacted]',
      }),
    )
    expect(console.log).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        search: expect.stringContaining('signed-upload-token'),
      }),
    )
  })

  it('uses the same direct upload path for large native uploads', async () => {
    mockState.fileSize = 2_000_000
    mockState.legacyUploadTaskUploadAsync.mockResolvedValue({
      body: '{"ok":true}',
      headers: {
        'content-type': 'application/json',
        'x-trace-id': 'trace-direct-123',
      },
      mimeType: 'application/json',
      status: 201,
    })

    const response = await torSafeUpload(
      'https://example.com/storage/v1/object/chat-media/sender-1/recipient-1/test.enc',
      'file:///tmp/test.enc',
      'test.enc',
      'application/octet-stream',
      {
        Authorization: 'Bearer token',
        apikey: 'anon-key',
      },
      {
        caller: 'media.uploadEncryptedMedia',
        correlationId: 'media:large-test',
      },
    )

    expect(response.status).toBe(201)
    await expect(response.text()).resolves.toBe('{"ok":true}')
    expect(mockState.legacyCreateUploadTask).toHaveBeenCalledTimes(1)
    expect(mockState.legacyCreateUploadTask).toHaveBeenCalledWith(
      'https://example.com/storage/v1/object/chat-media/sender-1/recipient-1/test.enc',
      'file:///tmp/test.enc',
      expect.objectContaining({
        httpMethod: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer token',
          apikey: 'anon-key',
          'Content-Type': 'application/octet-stream',
        }),
      }),
    )
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('native upload direct_request_ready'),
      expect.objectContaining({
        transport: 'native-direct-storage',
        nativeUploadApi: 'expo-file-system-upload-task',
        nativeUploadBodyByteLength: 2_000_000,
      }),
    )
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('native upload response'),
      expect.objectContaining({
        transport: 'native-direct-storage',
        nativeUploadApi: 'expo-file-system-upload-task',
        status: 201,
        ok: true,
      }),
    )
  })

  it('normalizes bare file paths for native uploads', async () => {
    mockState.legacyUploadTaskUploadAsync.mockResolvedValue({
      body: 'ok',
      headers: {},
      mimeType: null,
      status: 201,
    })

    const response = await torSafeUpload(
      'https://example.com/storage/v1/object/chat-media/sender-1/recipient-1/test.enc',
      '/tmp/test.enc',
      'test.enc',
      'application/octet-stream',
      {
        Authorization: 'Bearer token',
        apikey: 'anon-key',
      },
    )

    expect(response.status).toBe(201)
    expect(mockState.legacyCreateUploadTask).toHaveBeenCalledTimes(1)
    expect(mockState.legacyCreateUploadTask).toHaveBeenCalledWith(
      'https://example.com/storage/v1/object/chat-media/sender-1/recipient-1/test.enc',
      'file:///tmp/test.enc',
      expect.any(Object),
    )
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('native upload path_ready'),
      expect.objectContaining({
        nativeUploadFileUri: 'file:///tmp/test.enc',
        nativeUploadFileUriWasNormalized: true,
      }),
    )
  })

  it('uses absolute file URIs for Expo file handles on Android', async () => {
    await torSafeUpload(
      'https://example.com/storage/v1/object/upload/sign/avatar.jpg?token=signed-upload-token',
      'file:///tmp/Profile%20Photo.jpg',
      'avatar.jpg',
      'application/octet-stream',
      {},
      { caller: 'profile.uploadAvatar' },
      { httpMethod: 'PUT' },
    )

    expect(mockState.filePaths).toContain('file:///tmp/Profile%20Photo.jpg')
    expect(mockState.legacyCreateUploadTask).toHaveBeenCalledWith(
      'https://example.com/storage/v1/object/upload/sign/avatar.jpg?token=signed-upload-token',
      'file:///tmp/Profile%20Photo.jpg',
      expect.objectContaining({ httpMethod: 'PUT' }),
    )
  })

  it('returns a 404 response without calling the upload task when the file is missing', async () => {
    mockState.fileExists = false

    const response = await torSafeUpload(
      'https://example.com/storage/v1/object/chat-media/sender-1/recipient-1/test.enc',
      'file:///tmp/missing.enc',
      'missing.enc',
      'application/octet-stream',
      {
        Authorization: 'Bearer token',
        apikey: 'anon-key',
      },
    )

    expect(response.status).toBe(404)
    expect(mockState.legacyCreateUploadTask).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('native upload missing_file'),
      expect.objectContaining({
        fileName: 'missing.enc',
        transport: 'native-direct-storage',
      }),
    )
  })

  it('returns direct upload failure responses unchanged', async () => {
    mockState.legacyUploadTaskUploadAsync.mockResolvedValue({
      body: '{"error":"Forbidden"}',
      headers: {
        'content-type': 'application/json',
      },
      mimeType: 'application/json',
      status: 403,
    })

    const response = await torSafeUpload(
      'https://example.com/storage/v1/object/chat-media/sender-1/recipient-1/test.enc',
      'file:///tmp/test.enc',
      'test.enc',
      'application/octet-stream',
      {
        Authorization: 'Bearer token',
        apikey: 'anon-key',
      },
    )

    expect(response.ok).toBe(false)
    expect(response.status).toBe(403)
    await expect(response.text()).resolves.toBe('{"error":"Forbidden"}')
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('native upload response'),
      expect.objectContaining({
        status: 403,
        ok: false,
        transport: 'native-direct-storage',
        responseBodyPreview: '{"error":"Forbidden"}',
      }),
    )
  })

  it('throws when the direct upload transport fails', async () => {
    mockState.legacyUploadTaskUploadAsync.mockRejectedValue(new Error('Native upload failed'))

    await expect(
      torSafeUpload(
        'https://example.com/storage/v1/object/chat-media/sender-1/recipient-1/test.enc',
        'file:///tmp/test.enc',
        'test.enc',
        'application/octet-stream',
        {
          Authorization: 'Bearer token',
          apikey: 'anon-key',
        },
      ),
    ).rejects.toThrow('Native upload failed')

    expect(mockState.legacyCreateUploadTask).toHaveBeenCalledTimes(1)
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('native upload exception'),
      expect.objectContaining({
        failureStage: 'native_direct_upload_dispatch',
        transport: 'native-direct-storage',
        error: expect.objectContaining({
          message: 'Native upload failed',
        }),
      }),
    )
  })

  it('maps avatar uploads to the direct storage path without upsert headers', async () => {
    const response = await torSafeUpload(
      'https://example.com/storage/v1/object/avatars/groups/550e8400-e29b-41d4-a716-446655440000/avatar.png',
      'file:///tmp/avatar.png',
      'avatar.png',
      'image/png',
      {
        Authorization: 'Bearer token',
        apikey: 'anon-key',
      },
      {
        caller: 'backend.uploadAvatar',
        correlationId: 'avatar:test',
      },
    )

    expect(response.status).toBe(200)
    expect(mockState.legacyCreateUploadTask).toHaveBeenCalledTimes(1)
    expect(mockState.legacyCreateUploadTask).toHaveBeenCalledWith(
      'https://example.com/storage/v1/object/avatars/groups/550e8400-e29b-41d4-a716-446655440000/avatar.png',
      'file:///tmp/avatar.png',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer token',
          apikey: 'anon-key',
          'Content-Type': 'image/png',
          'Content-Length': '4',
        }),
      }),
    )
    expect(
      (mockState.legacyCreateUploadTask.mock.calls[0]?.[2] as { headers?: Record<string, string> })?.headers
    ).not.toHaveProperty('x-upsert')
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('native upload direct_request_ready'),
      expect.objectContaining({
        caller: 'backend.uploadAvatar',
        correlationId: 'avatar:test',
        nativeUploadContentType: 'image/png',
        nativeUploadContentLength: '4',
        transport: 'native-direct-storage',
      }),
    )
  })

  it('uses the signed object size for native PUT content length when provided', async () => {
    await torSafeUpload(
      'https://example.com/v1/objects/upload/signed-secret-token',
      'file:///tmp/encrypted.enc',
      'encrypted.enc',
      'application/octet-stream',
      {},
      { caller: 'media.uploadEncryptedMedia' },
      { httpMethod: 'PUT', contentLength: 42 },
    )

    expect(mockState.legacyCreateUploadTask).toHaveBeenCalledWith(
      'https://example.com/v1/objects/upload/signed-secret-token',
      'file:///tmp/encrypted.enc',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Length': '42',
        }),
      }),
    )
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('native upload init'),
      expect.objectContaining({
        path: '/v1/objects/upload/:token',
      }),
    )
    expect(console.log).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        path: expect.stringContaining('signed-secret-token'),
      }),
    )
  })

  it('uses torAwareFetch for Tor-enabled uploads', async () => {
    mockState.torEnabled = true
    mockState.torStatus = 'connected'
    mockState.torFetch.mockResolvedValue(new Response('ok', { status: 201 }))

    const response = await torSafeUpload(
      'https://example.com/storage/v1/object/chat-media/test.enc',
      'file:///tmp/test.enc',
      'test.enc',
      'application/octet-stream',
      {
        Authorization: 'Bearer token',
        apikey: 'anon-key',
      },
    )

    expect(response.status).toBe(201)
    expect(mockState.legacyCreateUploadTask).not.toHaveBeenCalled()
    expect(mockState.torFetch).toHaveBeenCalledTimes(1)
    expect(mockState.torFetch).toHaveBeenCalledWith(
      'https://example.com/storage/v1/object/chat-media/test.enc',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer token',
          apikey: 'anon-key',
          'Content-Type': 'application/octet-stream',
          'Content-Length': '4',
        }),
        body: String.fromCharCode(1, 2, 3, 4),
      }),
    )
  })

  it('passes the configured upload method to Tor-enabled uploads', async () => {
    mockState.torEnabled = true
    mockState.torStatus = 'connected'
    mockState.torFetch.mockResolvedValue(new Response('ok', { status: 200 }))

    const response = await torSafeUpload(
      'https://example.com/storage/v1/object/upload/sign/objects/attachments/media.enc?token=signed-upload-token',
      'file:///tmp/media.enc',
      'media.enc',
      'application/octet-stream',
      {
        Authorization: 'Bearer token',
        apikey: 'anon-key',
      },
      {
        caller: 'media.uploadEncryptedAttachment',
        correlationId: 'media-id',
      },
      { httpMethod: 'PUT' },
    )

    expect(response.status).toBe(200)
    expect(mockState.torFetch).toHaveBeenCalledWith(
      'https://example.com/storage/v1/object/upload/sign/objects/attachments/media.enc?token=signed-upload-token',
      expect.objectContaining({
        method: 'PUT',
      }),
    )
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('tor upload init'),
      expect.objectContaining({
        caller: 'media.uploadEncryptedAttachment',
        correlationId: 'media-id',
        search: '[redacted]',
      }),
    )
  })

  it('allows Tor-enabled uploads to queue while Tor is connecting', async () => {
    mockState.torEnabled = true
    mockState.torStatus = 'connecting'
    mockState.torFetch.mockResolvedValue(new Response('queued', { status: 202 }))

    const response = await torSafeUpload(
      'https://example.com/storage/v1/object/chat-media/test.enc',
      'file:///tmp/test.enc',
      'test.enc',
      'application/octet-stream',
      {
        Authorization: 'Bearer token',
        apikey: 'anon-key',
      },
    )

    expect(response.status).toBe(202)
    expect(mockState.torFetch).toHaveBeenCalledTimes(1)
    expect(mockState.legacyCreateUploadTask).not.toHaveBeenCalled()
  })

  it('throws when Tor is enabled but unusable', async () => {
    mockState.torEnabled = true
    mockState.torStatus = 'error'

    await expect(
      torSafeUpload(
        'https://example.com/storage/v1/object/chat-media/test.enc',
        'file:///tmp/test.enc',
        'test.enc',
        'application/octet-stream',
        {
          Authorization: 'Bearer token',
          apikey: 'anon-key',
        },
      ),
    ).rejects.toThrow('Tor is enabled but not usable')

    expect(mockState.legacyCreateUploadTask).not.toHaveBeenCalled()
    expect(mockState.torFetch).not.toHaveBeenCalled()
  })
})
