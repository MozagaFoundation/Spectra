/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  signObjectDownloadWithBackend: vi.fn(),
  getValidBackendAccessToken: vi.fn(),
}))

vi.mock('@/lib/constants', () => ({
  SPECTRA_API_URL: 'https://project.supabase.co/functions/v1/spectra-api',
  STORAGE_KEYS: {
    VAULT: 'exo_vault',
  },
}))

vi.mock('@/services/backend/objectStorage', () => ({
  signObjectDownloadWithBackend: mockState.signObjectDownloadWithBackend,
}))

vi.mock('./session', () => ({
  getValidBackendAccessToken: mockState.getValidBackendAccessToken,
}))

describe('backend storage helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-05T00:00:00.000Z'))
    mockState.signObjectDownloadWithBackend.mockReset()
    mockState.getValidBackendAccessToken.mockReset()
    mockState.getValidBackendAccessToken.mockResolvedValue('access-token')
    mockState.signObjectDownloadWithBackend.mockResolvedValue({
      objectRef: 'spectra://objects/avatars/profile/me.png',
      url: 'https://project.supabase.co/functions/v1/spectra-api/v1/objects/download/avatar-token',
      method: 'GET',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    })
  })

  afterEach(async () => {
    const { clearResolvedStorageUrl } = await import('./storage')
    clearResolvedStorageUrl()
    vi.useRealTimers()
  })

  it('creates, detects, and parses storage refs', async () => {
    const { createStorageRef, isStorageRef, parseStorageRef } = await import('./storage')

    const ref = createStorageRef('avatars', '/profile/me.png')

    expect(ref).toBe('spectra://objects/avatars/profile/me.png')
    expect(isStorageRef(ref)).toBe(true)
    expect(parseStorageRef(ref)).toEqual({ bucket: 'avatars', path: 'profile/me.png' })
    expect(parseStorageRef('spectra://objects/avatars')).toBeNull()
    expect(parseStorageRef('https://example.com/file.png')).toBeNull()
  })

  it('derives stable image cache keys without trusting arbitrary URLs', async () => {
    const { getStorageImageCacheKey } = await import('./storage')

    expect(getStorageImageCacheKey('spectra://objects/attachments/chat/me.enc')).toBe(
      'spectra-storage:attachments:chat/me.enc',
    )
    expect(getStorageImageCacheKey('https://project.supabase.co/functions/v1/spectra-api/v1/objects/download/avatar-token')).toBe(
      'https://project.supabase.co/functions/v1/spectra-api/v1/objects/download/avatar-token',
    )
    expect(getStorageImageCacheKey('https://evil.example.com/avatar.png')).toBeNull()
  })

  it('allowlists only local media and backend object URLs', async () => {
    const { isTrustedMediaUrl } = await import('./storage')

    expect(isTrustedMediaUrl('file:///tmp/image.jpg')).toBe(true)
    expect(isTrustedMediaUrl('content://media/image.jpg')).toBe(true)
    expect(isTrustedMediaUrl('data:image/png;base64,abc')).toBe(true)
    expect(isTrustedMediaUrl('blob:https://app.example/id')).toBe(true)
    expect(isTrustedMediaUrl('https://project.supabase.co/functions/v1/spectra-api/v1/objects/download/avatar-token')).toBe(true)
    expect(isTrustedMediaUrl('https://project.supabase.co/v1/objects/download/avatar-token')).toBe(false)
    expect(isTrustedMediaUrl('https://project.supabase.co/functions/v1/spectra-api/v1/unknown/files/asset.png')).toBe(false)
    expect(isTrustedMediaUrl('https://evil.example.com/storage/v1/object/avatars/me.png')).toBe(false)
    expect(isTrustedMediaUrl('not a url')).toBe(false)
  })

  it('resolves and caches signed storage URLs until the skew window', async () => {
    const { resolveStorageUrl } = await import('./storage')
    const ref = 'spectra://objects/attachments/chat/me.enc'

    await expect(resolveStorageUrl(ref)).resolves.toBe('https://project.supabase.co/functions/v1/spectra-api/v1/objects/download/avatar-token')
    await expect(resolveStorageUrl(ref)).resolves.toBe('https://project.supabase.co/functions/v1/spectra-api/v1/objects/download/avatar-token')
    expect(mockState.signObjectDownloadWithBackend).toHaveBeenCalledTimes(1)
    expect(mockState.signObjectDownloadWithBackend).toHaveBeenCalledWith(ref, { accessToken: 'access-token' })

    vi.advanceTimersByTime(14 * 60 * 1000 + 1)
    await resolveStorageUrl(ref)
    expect(mockState.signObjectDownloadWithBackend).toHaveBeenCalledTimes(2)
  })

  it('dedupes concurrent signed URL requests for the same storage ref', async () => {
    const { resolveStorageUrl } = await import('./storage')
    const ref = 'spectra://objects/attachments/chat/me.enc'

    const [first, second] = await Promise.all([
      resolveStorageUrl(ref),
      resolveStorageUrl(ref),
    ])

    expect(first).toBe('https://project.supabase.co/functions/v1/spectra-api/v1/objects/download/avatar-token')
    expect(second).toBe('https://project.supabase.co/functions/v1/spectra-api/v1/objects/download/avatar-token')
    expect(mockState.signObjectDownloadWithBackend).toHaveBeenCalledTimes(1)
  })

  it('does not recache a signed URL after the ref is invalidated in flight', async () => {
    const { clearResolvedStorageUrl, resolveStorageUrl } = await import('./storage')
    const ref = 'spectra://objects/attachments/chat/me.enc'
    let completeResolution: ((value: {
      objectRef: string
      url: string
      method: string
      expiresAt: string
    }) => void) | undefined
    mockState.signObjectDownloadWithBackend.mockReturnValueOnce(new Promise((resolve) => {
      completeResolution = resolve
    }))

    const firstResolution = resolveStorageUrl(ref)
    await vi.waitFor(() => {
      expect(mockState.signObjectDownloadWithBackend).toHaveBeenCalledTimes(1)
    })
    clearResolvedStorageUrl(ref)
    completeResolution?.({
      objectRef: ref,
      url: 'https://project.supabase.co/functions/v1/spectra-api/v1/objects/download/stale-avatar-token',
      method: 'GET',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    })
    await firstResolution

    await resolveStorageUrl(ref)
    expect(mockState.signObjectDownloadWithBackend).toHaveBeenCalledTimes(2)
  })

  it('rejects untrusted signed download URLs', async () => {
    const { resolveStorageUrl } = await import('./storage')
    mockState.signObjectDownloadWithBackend.mockResolvedValueOnce({
      objectRef: 'spectra://objects/attachments/chat/me.enc',
      url: 'https://evil.example.com/avatar.png',
      method: 'GET',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    })

    await expect(resolveStorageUrl('spectra://objects/attachments/chat/me.enc')).rejects.toThrow(
      'Storage resolver returned an untrusted URL',
    )
  })

  it('returns trusted non-ref URLs and rejects untrusted URLs without signing', async () => {
    const { resolveStorageUrl } = await import('./storage')

    await expect(resolveStorageUrl('file:///tmp/image.jpg')).resolves.toBe('file:///tmp/image.jpg')
    await expect(resolveStorageUrl('http://untrusted.example.com/api/files/asset.png')).resolves.toBeNull()
    await expect(resolveStorageUrl('https://evil.example.com/image.jpg')).resolves.toBeNull()
    expect(mockState.signObjectDownloadWithBackend).not.toHaveBeenCalled()
  })

  it('throws signed URL errors from backend object storage', async () => {
    const { resolveStorageUrl } = await import('./storage')
    mockState.signObjectDownloadWithBackend.mockRejectedValue(new Error('not allowed'))

    await expect(resolveStorageUrl('spectra://objects/attachments/chat/me.enc')).rejects.toThrow('not allowed')
  })
})
