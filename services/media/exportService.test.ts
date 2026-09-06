/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  canOpenURL: vi.fn(),
  copyAsync: vi.fn(),
  getContentUriAsync: vi.fn(),
  getInfoAsync: vi.fn(),
  isAvailableAsync: vi.fn(),
  makeDirectoryAsync: vi.fn(),
  openURL: vi.fn(),
  requestPermissionsAsync: vi.fn(),
  resolveEgressSafeAssetUri: vi.fn(),
  saveToLibraryAsync: vi.fn(),
  shareAsync: vi.fn(),
  writeAsStringAsync: vi.fn(),
  protectSensitiveFilePath: vi.fn(async () => {}),
  platformOS: 'android',
}))

vi.mock('react-native', () => ({
  Linking: {
    canOpenURL: mockState.canOpenURL,
    openURL: mockState.openURL,
  },
  Platform: {
    get OS() {
      return mockState.platformOS
    },
  },
}))

vi.mock('expo-file-system/legacy', () => ({
  EncodingType: {
    Base64: 'base64',
  },
  cacheDirectory: 'file:///cache/',
  copyAsync: mockState.copyAsync,
  documentDirectory: 'file:///documents/',
  getContentUriAsync: mockState.getContentUriAsync,
  getInfoAsync: mockState.getInfoAsync,
  makeDirectoryAsync: mockState.makeDirectoryAsync,
  writeAsStringAsync: mockState.writeAsStringAsync,
}))

vi.mock('expo-media-library', () => ({
  requestPermissionsAsync: mockState.requestPermissionsAsync,
  saveToLibraryAsync: mockState.saveToLibraryAsync,
}))

vi.mock('expo-sharing', () => ({
  isAvailableAsync: mockState.isAvailableAsync,
  shareAsync: mockState.shareAsync,
}))

vi.mock('./egressSafeAsset', () => ({
  resolveEgressSafeAssetUri: mockState.resolveEgressSafeAssetUri,
}))

vi.mock('./transientRenderCache', () => ({
  protectSensitiveFilePath: mockState.protectSensitiveFilePath,
}))

describe('media export service', () => {
  let ensureLocalAttachmentUri: typeof import('./exportService').ensureLocalAttachmentUri
  let openAttachmentExternally: typeof import('./exportService').openAttachmentExternally
  let saveImageToLibrary: typeof import('./exportService').saveImageToLibrary
  let shareAttachment: typeof import('./exportService').shareAttachment

  beforeEach(async () => {
    vi.resetModules()

    mockState.canOpenURL.mockReset()
    mockState.copyAsync.mockReset()
    mockState.getContentUriAsync.mockReset()
    mockState.getInfoAsync.mockReset()
    mockState.isAvailableAsync.mockReset()
    mockState.makeDirectoryAsync.mockReset()
    mockState.openURL.mockReset()
    mockState.requestPermissionsAsync.mockReset()
    mockState.resolveEgressSafeAssetUri.mockReset()
    mockState.saveToLibraryAsync.mockReset()
    mockState.shareAsync.mockReset()
    mockState.writeAsStringAsync.mockReset()
    mockState.protectSensitiveFilePath.mockClear()
    mockState.platformOS = 'android'

    mockState.getInfoAsync.mockResolvedValue({ exists: false })
    mockState.makeDirectoryAsync.mockResolvedValue(undefined)
    mockState.isAvailableAsync.mockResolvedValue(true)
    mockState.requestPermissionsAsync.mockResolvedValue({ status: 'granted' })
    mockState.copyAsync.mockResolvedValue(undefined)
    mockState.getContentUriAsync.mockResolvedValue('content://exports/local-file.pdf')
    mockState.canOpenURL.mockResolvedValue(true)
    mockState.openURL.mockResolvedValue(undefined)
    mockState.shareAsync.mockResolvedValue(undefined)
    mockState.saveToLibraryAsync.mockResolvedValue(undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const module = await import('./exportService')
    ensureLocalAttachmentUri = module.ensureLocalAttachmentUri
    openAttachmentExternally = module.openAttachmentExternally
    saveImageToLibrary = module.saveImageToLibrary
    shareAttachment = module.shareAttachment
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uses the local file produced by the egress-safe asset resolver', async () => {
    mockState.resolveEgressSafeAssetUri.mockResolvedValue(
      'file:///cache/tor-assets/avatar.jpg',
    )

    const localUri = await ensureLocalAttachmentUri('backend://avatars/user-1', {
      defaultExtension: 'jpg',
      fileName: 'avatar',
      mimeType: 'image/jpeg',
    })

    expect(mockState.resolveEgressSafeAssetUri).toHaveBeenCalledWith(
      'backend://avatars/user-1',
      { expectedMimeType: 'image/jpeg' },
    )
    expect(localUri).toBe('file:///cache/tor-assets/avatar.jpg')
    expect(mockState.makeDirectoryAsync).not.toHaveBeenCalled()
  })

  it('materializes a local file before sharing attachments', async () => {
    mockState.resolveEgressSafeAssetUri.mockResolvedValue(
      'file:///cache/tor-assets/report.pdf',
    )

    await shareAttachment('backend://files/report', {
      defaultExtension: 'pdf',
      fileName: 'report',
      mimeType: 'application/pdf',
    })

    expect(mockState.shareAsync).toHaveBeenCalledWith(
      'file:///cache/tor-assets/report.pdf',
      {
        UTI: undefined,
        dialogTitle: 'report',
        mimeType: 'application/pdf',
      },
    )
  })

  it('requests photo permission and saves a localized image path', async () => {
    mockState.resolveEgressSafeAssetUri.mockResolvedValue(
      'file:///cache/tor-assets/profile-photo.jpg',
    )

    await saveImageToLibrary('backend://avatars/user-1', {
      defaultExtension: 'jpg',
      fileName: 'profile-photo',
      mimeType: 'image/jpeg',
    })

    expect(mockState.requestPermissionsAsync).toHaveBeenCalledWith(true, ['photo'])
    expect(mockState.saveToLibraryAsync).toHaveBeenCalledWith(
      'file:///cache/tor-assets/profile-photo.jpg',
    )
  })

  it('converts Android file URIs to content URIs before opening externally', async () => {
    mockState.resolveEgressSafeAssetUri.mockResolvedValue('file:///documents/report.pdf')

    const opened = await openAttachmentExternally({
      fileName: 'report.pdf',
      mimeType: 'application/pdf',
      uri: 'file:///documents/report.pdf',
    })

    expect(opened).toBe(true)
    expect(mockState.getContentUriAsync).toHaveBeenCalledWith('file:///documents/report.pdf')
    expect(mockState.openURL).toHaveBeenCalledWith('content://exports/local-file.pdf')
    expect(mockState.shareAsync).not.toHaveBeenCalled()
  })

  it('falls back to sharing when no external handler can open the file', async () => {
    mockState.resolveEgressSafeAssetUri.mockResolvedValue(
      'file:///cache/tor-assets/report.pdf',
    )
    mockState.canOpenURL.mockResolvedValue(false)

    const opened = await openAttachmentExternally({
      fileName: 'report.pdf',
      mimeType: 'application/pdf',
      uri: 'backend://files/report',
    })

    expect(opened).toBe(true)
    expect(mockState.shareAsync).toHaveBeenCalledWith(
      'file:///cache/tor-assets/report.pdf',
      {
        UTI: undefined,
        dialogTitle: 'report.pdf',
        mimeType: 'application/pdf',
      },
    )
  })

  it('rejects attachment URIs that cannot be resolved to trusted media', async () => {
    mockState.resolveEgressSafeAssetUri.mockResolvedValue(null)

    await expect(
      ensureLocalAttachmentUri('http://attacker.example/file.pdf', {
        fileName: 'file.pdf',
        mimeType: 'application/pdf',
      }),
    ).rejects.toMatchObject({
      code: 'unresolvable_uri',
    })

    expect(mockState.copyAsync).not.toHaveBeenCalled()
  })

  it('does not fall back to sharing the original URI when media trust resolution fails', async () => {
    mockState.resolveEgressSafeAssetUri.mockResolvedValue(null)

    const opened = await openAttachmentExternally({
      fileName: 'payload.pdf',
      mimeType: 'application/pdf',
      uri: 'http://attacker.example/payload.pdf',
    })

    expect(opened).toBe(false)
    expect(mockState.openURL).not.toHaveBeenCalled()
    expect(mockState.shareAsync).not.toHaveBeenCalled()
  })

  it('returns false when neither opening nor sharing succeeds', async () => {
    mockState.resolveEgressSafeAssetUri.mockResolvedValue(
      'file:///cache/tor-assets/report.pdf',
    )
    mockState.canOpenURL.mockResolvedValue(false)
    mockState.shareAsync.mockRejectedValue(new Error('share failed'))

    const opened = await openAttachmentExternally({
      fileName: 'report.pdf',
      mimeType: 'application/pdf',
      uri: 'backend://files/report',
    })

    expect(opened).toBe(false)
  })
})
