/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  torAwareFetch: vi.fn(),
  torSafeUpload: vi.fn(),
  platform: { OS: 'ios' as string },
}))

vi.mock('@/lib/constants', () => ({
  APP_VERSION: '1.2.5',
  SPECTRA_API_URL: 'https://api.spectra.test',
}))

vi.mock('@/services/tor/torFetch', () => ({
  torAwareFetch: mockState.torAwareFetch,
}))

vi.mock('@/services/tor/torUpload', () => ({
  torSafeUpload: mockState.torSafeUpload,
}))

vi.mock('react-native', () => ({
  Platform: mockState.platform,
}))

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    text: vi.fn(async () => JSON.stringify(body)),
  } as unknown as Response
}

describe('Spectra backend object storage adapter', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockState.platform.OS = 'ios'
  })

  it('signs downloads with bearer auth', async () => {
    mockState.torAwareFetch.mockResolvedValue(jsonResponse({
      objectRef: 'spectra://objects/users/u/file.enc',
      url: 'https://api.spectra.test/v1/objects/download/token',
      method: 'GET',
      expiresAt: '2026-05-16T19:05:00Z',
    }))
    const { signObjectDownloadWithBackend } = await import('./objectStorage')

    const signed = await signObjectDownloadWithBackend(
      'spectra://objects/users/u/file.enc',
      { accessToken: 'token' },
      'chat_media',
    )

    expect(signed.url).toContain('/v1/objects/download/')
    expect(mockState.torAwareFetch).toHaveBeenCalledWith('https://api.spectra.test/v1/objects/downloads', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer token' }),
      body: JSON.stringify({
        objectRef: 'spectra://objects/users/u/file.enc',
        purpose: 'chat_media',
      }),
    }))
  })

  it('rejects insecure object download URLs returned by the backend', async () => {
    mockState.torAwareFetch.mockResolvedValue(jsonResponse({
      objectRef: 'spectra://objects/users/u/file.enc',
      url: 'http://api.spectra.test/v1/objects/download/token',
      method: 'GET',
      expiresAt: '2026-05-16T19:05:00Z',
    }))
    const { signObjectDownloadWithBackend } = await import('./objectStorage')

    await expect(signObjectDownloadWithBackend(
      'spectra://objects/users/u/file.enc',
      { accessToken: 'token' },
      'chat_media',
    )).rejects.toThrow('Backend returned an untrusted object download URL')
  })

  it('uploads through a signed PUT URL without exposing bearer auth to the upload URL', async () => {
    mockState.torAwareFetch.mockResolvedValue(jsonResponse({
      objectRef: 'spectra://objects/users/u/file.enc',
      url: 'https://api.spectra.test/v1/objects/upload/token',
      method: 'PUT',
      expiresAt: '2026-05-16T19:05:00Z',
    }))
    mockState.torSafeUpload.mockResolvedValue({ ok: true, status: 204 })
    const { uploadObjectWithBackend } = await import('./objectStorage')

    const result = await uploadObjectWithBackend({
      fileUri: 'file:///tmp/file.enc',
      fileName: 'file.enc',
      contentType: 'application/octet-stream',
      size: 42,
    }, { accessToken: 'token' })

    expect(result).toEqual({ objectRef: 'spectra://objects/users/u/file.enc', error: null })
    expect(mockState.torSafeUpload).toHaveBeenCalledWith(
      'https://api.spectra.test/v1/objects/upload/token',
      'file:///tmp/file.enc',
      'file.enc',
      'application/octet-stream',
      {},
      undefined,
      { httpMethod: 'PUT', contentLength: 42 },
    )
    expect(mockState.torAwareFetch).toHaveBeenCalledWith(
      'https://api.spectra.test/v1/objects/uploads',
      expect.objectContaining({
        body: JSON.stringify({
          size: 42,
          contentType: 'application/octet-stream',
          purpose: 'attachment',
          bindingId: 'file',
        }),
      }),
    )
    expect(mockState.torAwareFetch).toHaveBeenCalledWith(
      'https://api.spectra.test/v1/objects/finalize',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ objectRef: 'spectra://objects/users/u/file.enc' }),
      }),
    )
  })

  it('binds support uploads to a typed ticket purpose', async () => {
    mockState.torAwareFetch.mockResolvedValue(jsonResponse({
      objectRef: 'spectra://objects/users/u/support-attachments/file.enc',
      url: 'https://api.spectra.test/v1/objects/upload/token',
      method: 'PUT',
      expiresAt: '2026-05-16T19:05:00Z',
    }))
    mockState.torSafeUpload.mockResolvedValue({ ok: true, status: 204 })
    const { uploadObjectWithBackend } = await import('./objectStorage')

    await uploadObjectWithBackend({
      fileUri: 'file:///tmp/screenshot.jpg',
      fileName: 'screenshot.jpg',
      contentType: 'image/jpeg',
      purpose: 'support_attachment',
      ticketId: 'ticket-1',
      size: 42,
    }, { accessToken: 'token' })

    expect(mockState.torAwareFetch).toHaveBeenCalledWith(
      'https://api.spectra.test/v1/objects/uploads',
      expect.objectContaining({
        body: JSON.stringify({
          size: 42,
          contentType: 'application/octet-stream',
          purpose: 'support_attachment',
          ticketId: 'ticket-1',
        }),
      }),
    )
  })

  it('adds Android-only upload diagnostics without bearer auth on the PUT request', async () => {
    mockState.platform.OS = 'android'
    mockState.torAwareFetch.mockResolvedValue(jsonResponse({
      objectRef: 'spectra://objects/users/u/file.enc',
      url: 'https://api.spectra.test/v1/objects/upload/token',
      method: 'PUT',
      expiresAt: '2026-05-16T19:05:00Z',
    }))
    mockState.torSafeUpload.mockResolvedValue({ ok: true, status: 204 })
    const { uploadObjectWithBackend } = await import('./objectStorage')

    await uploadObjectWithBackend({
      fileUri: 'file:///tmp/file.enc',
      fileName: 'file.enc',
      contentType: 'application/octet-stream',
      size: 42,
      diagnostics: { caller: 'media.uploadEncryptedMedia', correlationId: 'media:abc 123' },
    }, { accessToken: 'token' })

    expect(mockState.torAwareFetch).toHaveBeenCalledWith(
      'https://api.spectra.test/v1/objects/uploads',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer token',
          'X-Spectra-Client-Platform': 'android',
          'X-Spectra-Upload-Correlation': 'media:abc_123',
        }),
      }),
    )
    expect(mockState.torSafeUpload).toHaveBeenCalledWith(
      'https://api.spectra.test/v1/objects/upload/token',
      'file:///tmp/file.enc',
      'file.enc',
      'application/octet-stream',
      expect.objectContaining({
        'X-Spectra-Client-Platform': 'android',
        'X-Spectra-Upload-Correlation': 'media:abc_123',
      }),
      expect.objectContaining({ caller: 'media.uploadEncryptedMedia' }),
      { httpMethod: 'PUT', contentLength: 42 },
    )
    expect(mockState.torSafeUpload.mock.calls[0][4]).not.toHaveProperty('Authorization')
  })

  it('deletes objects through an authenticated backend request', async () => {
    mockState.torAwareFetch.mockResolvedValue(jsonResponse({}))
    const { deleteObjectWithBackend } = await import('./objectStorage')

    await expect(deleteObjectWithBackend('spectra://objects/users/u/avatar.enc', { accessToken: 'token' }))
      .resolves.toEqual({ error: null })

    expect(mockState.torAwareFetch).toHaveBeenCalledWith(
      'https://api.spectra.test/v1/objects/delete',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer token' }),
        body: JSON.stringify({ objectRef: 'spectra://objects/users/u/avatar.enc' }),
      }),
    )
  })

  it('removes an uploaded object when finalization fails', async () => {
    mockState.torAwareFetch
      .mockResolvedValueOnce(jsonResponse({
        objectRef: 'spectra://objects/users/u/file.enc',
        url: 'https://api.spectra.test/v1/objects/upload/token',
        method: 'PUT',
        expiresAt: '2026-05-16T19:05:00Z',
      }))
      .mockResolvedValueOnce(jsonResponse({ error: 'object_upload_incomplete' }, false, 409))
      .mockResolvedValueOnce(jsonResponse({}))
    mockState.torSafeUpload.mockResolvedValue({ ok: true, status: 204 })
    const { uploadObjectWithBackend } = await import('./objectStorage')

    const result = await uploadObjectWithBackend({
      fileUri: 'file:///tmp/file.enc',
      fileName: 'file.enc',
      contentType: 'application/octet-stream',
      size: 42,
    }, { accessToken: 'token' })

    expect(result.objectRef).toBe('')
    expect(result.error?.message).toContain('object_upload_incomplete')
    expect(mockState.torAwareFetch).toHaveBeenCalledWith(
      'https://api.spectra.test/v1/objects/delete',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ objectRef: 'spectra://objects/users/u/file.enc' }),
      }),
    )
  })
})
