/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  deleteAsync: vi.fn(),
  getInfoAsync: vi.fn(),
  readDirectoryAsync: vi.fn(),
  readAsStringAsync: vi.fn(),
  deleteAppOwnedMediaIngress: vi.fn(),
  stageAndValidateMediaIngress: vi.fn(),
}))

vi.mock('expo-file-system/legacy', () => ({
  EncodingType: {
    UTF8: 'utf8',
  },
  deleteAsync: mockState.deleteAsync,
  getInfoAsync: mockState.getInfoAsync,
  readDirectoryAsync: mockState.readDirectoryAsync,
  readAsStringAsync: mockState.readAsStringAsync,
}))

vi.mock('./mediaIngress', () => ({
  deleteAppOwnedMediaIngress: mockState.deleteAppOwnedMediaIngress,
  stageAndValidateMediaIngress: mockState.stageAndValidateMediaIngress,
}))

const manifestId = '123e4567-e89b-12d3-a456-426614174000'
const manifestUri = `file:///private/var/mobile/Containers/Shared/AppGroup/group/SpectraShare/${manifestId}/manifest.json`
const fileUri = `file:///private/var/mobile/Containers/Shared/AppGroup/group/SpectraShare/${manifestId}/0-photo.png`
const ownedFileUri = 'file:///cache/media_ingress/share-photo.png'

function buildManifest(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 2,
    id: manifestId,
    source: 'ios-share-extension',
    createdAt: Date.now(),
    items: [
      {
        id: 'item-0',
        kind: 'image',
        typeIdentifier: 'public.png',
        fileName: 'photo.png',
        mimeType: 'image/png',
        fileUri,
        fileSize: 1024,
        digest: 'a'.repeat(64),
      },
      {
        id: 'item-1',
        kind: 'text',
        typeIdentifier: 'public.plain-text',
        text: 'hello from Photos',
      },
    ],
    ...overrides,
  }
}

describe('share import service', () => {
  beforeEach(() => {
    vi.resetModules()
    mockState.deleteAsync.mockReset()
    mockState.getInfoAsync.mockReset()
    mockState.readDirectoryAsync.mockReset()
    mockState.readAsStringAsync.mockReset()
    mockState.deleteAppOwnedMediaIngress.mockReset()
    mockState.stageAndValidateMediaIngress.mockReset()
    mockState.getInfoAsync.mockResolvedValue({ exists: true, size: 1024 })
    mockState.deleteAsync.mockResolvedValue(undefined)
    mockState.deleteAppOwnedMediaIngress.mockResolvedValue(undefined)
    mockState.readDirectoryAsync.mockResolvedValue([])
    mockState.readAsStringAsync.mockImplementation(async () => JSON.stringify(buildManifest()))
    mockState.stageAndValidateMediaIngress.mockResolvedValue({
      uri: ownedFileUri,
      fileSize: 1024,
      mimeType: 'image/png',
      mediaType: 'image',
      digest: 'a'.repeat(64),
      width: 640,
      height: 480,
      frameCount: 1,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads a validated extension manifest into chat-ready content and attachments', async () => {
    const { loadPendingShareImport } = await import('./shareImport')

    const pending = await loadPendingShareImport(manifestUri)

    expect(pending.content).toBe('hello from Photos')
    expect(pending.attachments).toEqual([
      expect.objectContaining({
        fileName: 'photo.png',
        fileSize: 1024,
        mimeType: 'image/png',
        source: 'ios_share_extension',
        type: 'image',
        uri: ownedFileUri,
        width: 640,
        height: 480,
      }),
    ])
    expect(mockState.getInfoAsync).toHaveBeenCalledWith(fileUri)
    expect(mockState.stageAndValidateMediaIngress).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: fileUri,
        fileSize: 1024,
        mimeType: 'image/png',
        mediaType: 'image',
      }),
      expect.objectContaining({
        expectedDigest: 'a'.repeat(64),
        requireDeclaredSizeMatch: true,
      }),
    )
  })

  it('rejects forged manifest paths outside the share handoff directory', async () => {
    const { loadPendingShareImport } = await import('./shareImport')

    await expect(loadPendingShareImport('file:///private/var/mobile/manifest.json'))
      .rejects.toThrow('expected handoff directory')
  })

  it('rejects files outside the manifest directory', async () => {
    mockState.readAsStringAsync.mockResolvedValue(JSON.stringify(buildManifest({
      items: [{
        id: 'item-0',
        kind: 'document',
        fileName: 'secret.txt',
        mimeType: 'text/plain',
        fileUri: 'file:///private/var/mobile/Containers/Shared/AppGroup/group/SpectraShare/other/secret.txt',
        fileSize: 32,
        digest: 'b'.repeat(64),
      }],
    })))
    const { loadPendingShareImport } = await import('./shareImport')

    await expect(loadPendingShareImport(manifestUri))
      .rejects.toThrow('outside the expected handoff directory')
  })

  it('cleans up the manifest directory after send or discard', async () => {
    const { cleanupPendingShareImport } = await import('./shareImport')

    await cleanupPendingShareImport({ manifestUri })

    expect(mockState.deleteAsync).toHaveBeenCalledWith(
      `file:///private/var/mobile/Containers/Shared/AppGroup/group/SpectraShare/${manifestId}`,
      { idempotent: true },
    )
  })

  it('removes app-owned staged copies when an import is discarded', async () => {
    const { cleanupPendingShareImport } = await import('./shareImport')

    await cleanupPendingShareImport({
      manifestUri,
      attachments: [{
        id: 'share-1',
        type: 'image',
        uri: ownedFileUri,
        fileName: 'photo.png',
        mimeType: 'image/png',
        fileSize: 1024,
      }],
    })

    expect(mockState.deleteAppOwnedMediaIngress).toHaveBeenCalledWith(ownedFileUri)
  })

  it('removes staged copies when later manifest content validation fails', async () => {
    mockState.readAsStringAsync.mockResolvedValue(JSON.stringify(buildManifest({
      items: [
        buildManifest().items[0],
        {
          id: 'item-1',
          kind: 'text',
          typeIdentifier: 'public.plain-text',
          text: 'x'.repeat((100 * 1024) + 1),
        },
      ],
    })))
    const { loadPendingShareImport } = await import('./shareImport')

    await expect(loadPendingShareImport(manifestUri)).rejects.toThrow('Shared text is too large')

    expect(mockState.deleteAppOwnedMediaIngress).toHaveBeenCalledWith(ownedFileUri)
  })

  it('deletes stale share import directories while preserving the active import', async () => {
    const activeId = manifestId
    const staleId = '223e4567-e89b-12d3-a456-426614174000'
    const freshId = '323e4567-e89b-12d3-a456-426614174000'
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now)
    mockState.readDirectoryAsync.mockResolvedValue([
      activeId,
      staleId,
      freshId,
      'not-a-share-import',
    ])
    mockState.readAsStringAsync.mockImplementation(async (uri: string) => {
      if (uri.includes(`/${staleId}/`)) {
        return JSON.stringify(buildManifest({ id: staleId, createdAt: now - (31 * 60 * 1000) }))
      }
      if (uri.includes(`/${freshId}/`)) {
        return JSON.stringify(buildManifest({ id: freshId, createdAt: now - (5 * 60 * 1000) }))
      }
      return JSON.stringify(buildManifest({ id: activeId, createdAt: now - (31 * 60 * 1000) }))
    })
    const { cleanupStaleShareImports } = await import('./shareImport')

    await cleanupStaleShareImports(manifestUri, { excludeManifestUri: manifestUri })

    expect(mockState.deleteAsync).toHaveBeenCalledTimes(1)
    expect(mockState.deleteAsync).toHaveBeenCalledWith(
      `file:///private/var/mobile/Containers/Shared/AppGroup/group/SpectraShare/${staleId}`,
      { idempotent: true },
    )
  })

  it('uses directory modification time for stale cleanup when a manifest cannot be read', async () => {
    const staleId = '423e4567-e89b-12d3-a456-426614174000'
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now)
    mockState.readDirectoryAsync.mockResolvedValue([staleId])
    mockState.readAsStringAsync.mockRejectedValue(new Error('missing manifest'))
    mockState.getInfoAsync.mockResolvedValue({
      exists: true,
      isDirectory: true,
      modificationTime: (now - (31 * 60 * 1000)) / 1000,
    })
    const { cleanupStaleShareImports } = await import('./shareImport')

    await cleanupStaleShareImports(manifestUri)

    expect(mockState.deleteAsync).toHaveBeenCalledWith(
      `file:///private/var/mobile/Containers/Shared/AppGroup/group/SpectraShare/${staleId}`,
      { idempotent: true },
    )
  })
})
