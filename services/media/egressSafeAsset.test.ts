/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  resolveStorageUrl: vi.fn(),
  torAwareFetchBytes: vi.fn(),
  getInfoAsync: vi.fn(),
  writeTransientRenderFile: vi.fn(async () => undefined),
  digestMediaCacheKey: vi.fn(async () => 'asset-cache-id'),
}))

vi.mock('./cacheKey', () => ({
  digestMediaCacheKey: mockState.digestMediaCacheKey,
}))

vi.mock('expo-file-system/legacy', () => ({
  getInfoAsync: mockState.getInfoAsync,
}))

vi.mock('@/services/backend/storage', () => ({
  resolveStorageUrl: mockState.resolveStorageUrl,
}))

vi.mock('@/services/tor/torFetch', () => ({
  torAwareFetchBytes: mockState.torAwareFetchBytes,
}))

vi.mock('./transientRenderCache', () => ({
  getTransientRenderPath: (id: string, extension: string, scope: string) =>
    `file:///cache/${scope}/${id}.${extension}`,
  writeTransientRenderFile: mockState.writeTransientRenderFile,
}))

import { resolveEgressSafeAssetUri } from './egressSafeAsset'

describe('resolveEgressSafeAssetUri', () => {
  beforeEach(() => {
    mockState.resolveStorageUrl.mockReset()
    mockState.torAwareFetchBytes.mockReset()
    mockState.getInfoAsync.mockReset()
    mockState.writeTransientRenderFile.mockClear()
    mockState.digestMediaCacheKey.mockReset()
    mockState.digestMediaCacheKey.mockResolvedValue('asset-cache-id')
    mockState.getInfoAsync.mockResolvedValue({ exists: false })
  })

  it('materializes remote assets through the Tor-aware byte transport', async () => {
    const decoded = Uint8Array.from([65, 66, 67, 68])
    mockState.resolveStorageUrl.mockResolvedValue('https://api.spectra.test/v1/objects/download/token')
    mockState.torAwareFetchBytes.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        'content-length': String(decoded.length),
        'content-type': 'image/png',
      }),
      bytes: Uint8Array.from([81, 85, 74, 68, 82, 65, 61, 61]),
      byteCandidates: {
        preferredEncoding: 'latin1',
        availableEncodings: ['base64', 'latin1', 'utf8'],
        latin1: Uint8Array.from([81, 85, 74, 68, 82, 65, 61, 61]),
        utf8: Uint8Array.from([81, 85, 74, 68, 82, 65, 61, 61]),
        base64: decoded,
      },
    })

    await expect(resolveEgressSafeAssetUri('spectra://objects/media/image', {
      expectedMimeType: 'image/png',
    })).resolves.toBe('file:///cache/tor-assets/asset-cache-id.png')

    expect(mockState.torAwareFetchBytes).toHaveBeenCalledWith(
      'https://api.spectra.test/v1/objects/download/token',
      { headers: { Accept: 'image/png' } },
    )
    expect(mockState.writeTransientRenderFile).toHaveBeenCalledWith(
      'file:///cache/tor-assets/asset-cache-id.png',
      [decoded],
    )
    expect(mockState.digestMediaCacheKey).toHaveBeenCalledWith(
      'egress-asset-v1',
      ['spectra://objects/media/image', 'image/png'],
    )
  })

  it('returns local assets without invoking a network transport', async () => {
    mockState.resolveStorageUrl.mockResolvedValue('file:///tmp/image.jpg')

    await expect(resolveEgressSafeAssetUri('file:///tmp/image.jpg')).resolves.toBe(
      'file:///tmp/image.jpg',
    )
    expect(mockState.torAwareFetchBytes).not.toHaveBeenCalled()
  })

  it('rejects non-HTTPS remote assets instead of passing them to native renderers', async () => {
    mockState.resolveStorageUrl.mockResolvedValue('http://example.test/image.jpg')

    await expect(resolveEgressSafeAssetUri('http://example.test/image.jpg')).rejects.toThrow(
      'Remote assets require HTTPS',
    )
    expect(mockState.torAwareFetchBytes).not.toHaveBeenCalled()
  })

  it('rejects oversized remote responses before writing them', async () => {
    mockState.resolveStorageUrl.mockResolvedValue('https://api.spectra.test/v1/objects/download/token')
    mockState.torAwareFetchBytes.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        'content-length': '2048',
        'content-type': 'text/html',
      }),
      bytes: new Uint8Array(0),
    })

    await expect(resolveEgressSafeAssetUri('spectra://objects/media/file', {
      maxBytes: 1024,
    })).rejects.toThrow('Remote asset is too large')
    expect(mockState.writeTransientRenderFile).not.toHaveBeenCalled()
  })

  it('rejects HTML returned in place of an asset', async () => {
    mockState.resolveStorageUrl.mockResolvedValue('https://api.spectra.test/v1/objects/download/token')
    mockState.torAwareFetchBytes.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        'content-length': '4',
        'content-type': 'text/html; charset=utf-8',
      }),
      bytes: Uint8Array.from([60, 104, 49, 62]),
    })

    await expect(resolveEgressSafeAssetUri('spectra://objects/media/html')).rejects.toThrow(
      'unsafe content type',
    )
    expect(mockState.writeTransientRenderFile).not.toHaveBeenCalled()
  })
})
