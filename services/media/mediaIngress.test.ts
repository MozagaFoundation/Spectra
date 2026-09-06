/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  files: new Map<string, Uint8Array>(),
  copyAsync: vi.fn(),
  moveAsync: vi.fn(),
  deleteAsync: vi.fn(),
  makeDirectoryAsync: vi.fn(),
}))

vi.mock('@spectra/core-crypto', () => ({
  computeContentHash: () => 'a'.repeat(64),
}))

vi.mock('./transientRenderCache', () => ({
  protectSensitiveFilePath: vi.fn(async () => undefined),
}))

vi.mock('expo-file-system', () => ({
  File: class MockFile {
    constructor(private readonly uri: string) {}

    async bytes(): Promise<Uint8Array> {
      return mockState.files.get(this.uri) ?? new Uint8Array()
    }
  },
}))

vi.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  documentDirectory: 'file:///documents/',
  getInfoAsync: vi.fn(async (uri: string) => {
    if (uri === 'file:///cache/media_ingress/') {
      return { exists: true, isDirectory: true }
    }
    const bytes = mockState.files.get(uri)
    return bytes ? { exists: true, size: bytes.length } : { exists: false }
  }),
  copyAsync: mockState.copyAsync,
  moveAsync: mockState.moveAsync,
  deleteAsync: mockState.deleteAsync,
  makeDirectoryAsync: mockState.makeDirectoryAsync,
}))

function ascii(value: string): Uint8Array {
  return Uint8Array.from(value, (character) => character.charCodeAt(0))
}

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33)
  bytes.set([0x89, ...ascii('PNG\r\n\u001a\n')], 0)
  bytes.set([0, 0, 0, 13], 8)
  bytes.set(ascii('IHDR'), 12)
  new DataView(bytes.buffer).setUint32(16, width)
  new DataView(bytes.buffer).setUint32(20, height)
  return bytes
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.length, 0)
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const part of parts) {
    bytes.set(part, offset)
    offset += part.length
  }
  return bytes
}

function isoBox(type: string, payload: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(payload.length + 8)
  new DataView(bytes.buffer).setUint32(0, bytes.length)
  bytes.set(ascii(type), 4)
  bytes.set(payload, 8)
  return bytes
}

function isoMp4(trackHandlers: string[]): Uint8Array {
  const tracks = trackHandlers.map((handler) => isoBox(
    'trak',
    isoBox('mdia', isoBox('hdlr', concatBytes(new Uint8Array(8), ascii(handler)))),
  ))
  return concatBytes(
    isoBox('ftyp', concatBytes(ascii('isom'), new Uint8Array(4), ascii('isom'), ascii('mp42'))),
    isoBox('moov', concatBytes(...tracks)),
  )
}

describe('media ingress inspection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.files.clear()
    mockState.copyAsync.mockImplementation(async ({ from, to }: { from: string; to: string }) => {
      mockState.files.set(to, mockState.files.get(from) ?? new Uint8Array())
    })
    mockState.moveAsync.mockImplementation(async ({ from, to }: { from: string; to: string }) => {
      mockState.files.set(to, mockState.files.get(from) ?? new Uint8Array())
      mockState.files.delete(from)
    })
    mockState.deleteAsync.mockImplementation(async (uri: string) => {
      mockState.files.delete(uri)
    })
  })

  it('accepts supported magic and extracts dimensions before decode', async () => {
    const { inspectMediaIngressBytes } = await import('./mediaIngress')

    expect(inspectMediaIngressBytes(png(1024, 768), 'image/png')).toMatchObject({
      mimeType: 'image/png',
      mediaType: 'image',
      width: 1024,
      height: 768,
      frameCount: 1,
    })
  })

  it('accepts Android-style AAC MP4 recordings as voice notes', async () => {
    const { stageAndValidateMediaIngress } = await import('./mediaIngress')
    const sourceUri = 'file:///cache/Audio/recording.m4a'
    const bytes = isoMp4(['soun'])
    mockState.files.set(sourceUri, bytes)

    await expect(stageAndValidateMediaIngress({
      id: 'voice-note',
      uri: sourceUri,
      fileName: 'voice_note.m4a',
      mimeType: 'audio/m4a',
      fileSize: bytes.length,
      mediaType: 'voice_note',
    })).resolves.toMatchObject({
      fileSize: bytes.length,
      mediaType: 'voice_note',
      mimeType: 'audio/mp4',
    })
  })

  it('keeps video-bearing generic MP4 files out of voice notes', async () => {
    const { inspectMediaIngressBytes, stageAndValidateMediaIngress } = await import('./mediaIngress')

    for (const [index, handlers] of [['vide'], ['soun', 'vide']].entries()) {
      const sourceUri = `file:///cache/video-${index}.mp4`
      const bytes = isoMp4(handlers)
      mockState.files.set(sourceUri, bytes)

      expect(inspectMediaIngressBytes(bytes, 'video/mp4')).toMatchObject({
        mediaType: 'video',
        mimeType: 'video/mp4',
      })
      await expect(stageAndValidateMediaIngress({
        id: `video-${index}`,
        uri: sourceUri,
        fileName: 'video.mp4',
        mimeType: 'video/mp4',
        fileSize: bytes.length,
        mediaType: 'voice_note',
      })).rejects.toThrow('does not match its media type')
    }
  })

  it('rejects MIME confusion and oversized pixel surfaces', async () => {
    const { inspectMediaIngressBytes } = await import('./mediaIngress')

    expect(() => inspectMediaIngressBytes(png(100, 100), 'image/jpeg'))
      .toThrow('does not match its declared type')
    expect(() => inspectMediaIngressBytes(png(10_000, 10_000), 'image/png'))
      .toThrow('dimensions are too large')
  })

  it('enforces a safely inspectable PDF page limit', async () => {
    const { inspectMediaIngressBytes } = await import('./mediaIngress')
    const oversizedPdf = ascii(`%PDF-1.7\n${'/Type /Page\n'.repeat(201)}%%EOF`)

    expect(() => inspectMediaIngressBytes(oversizedPdf, 'application/pdf'))
      .toThrow('too many pages')
  })

  it('atomically stages external files and validates digest, size, and type', async () => {
    const { stageAndValidateMediaIngress } = await import('./mediaIngress')
    const sourceUri = 'content://provider/report'
    const bytes = ascii('%PDF-1.7\n/Type /Page\n%%EOF')
    mockState.files.set(sourceUri, bytes)

    const result = await stageAndValidateMediaIngress({
      id: 'report:1',
      uri: sourceUri,
      fileName: 'private-report.pdf',
      mimeType: 'application/pdf',
      fileSize: bytes.length,
      mediaType: 'document',
    }, {
      expectedDigest: 'a'.repeat(64),
      requireDeclaredSizeMatch: true,
    })

    expect(result).toMatchObject({
      digest: 'a'.repeat(64),
      fileSize: bytes.length,
      mediaType: 'document',
      mimeType: 'application/pdf',
      bytes,
      deleteOnRelease: true,
      pageCount: 1,
    })
    expect(result.uri).toMatch(/^file:\/\/\/cache\/media_ingress\/report_1_\d+_\d+\.pdf$/)
    expect(mockState.copyAsync).toHaveBeenCalledWith({
      from: sourceUri,
      to: expect.stringMatching(/\.partial$/),
    })
    expect(mockState.moveAsync).toHaveBeenCalledWith({
      from: expect.stringMatching(/\.partial$/),
      to: result.uri,
    })
  })

  it('rejects an oversized source before copying it', async () => {
    const { MEDIA_INGRESS_MAX_BYTES, stageAndValidateMediaIngress } = await import('./mediaIngress')
    const sourceUri = 'content://provider/oversized'
    mockState.files.set(sourceUri, ascii('%PDF-1.7\n%%EOF'))

    await expect(stageAndValidateMediaIngress({
      id: 'oversized',
      uri: sourceUri,
      mimeType: 'application/pdf',
      fileSize: MEDIA_INGRESS_MAX_BYTES + 1,
      mediaType: 'document',
    })).rejects.toThrow('too large')
    expect(mockState.copyAsync).not.toHaveBeenCalled()
  })

  it('retains release ownership when revalidating staged ingress', async () => {
    const { stageAndValidateMediaIngress } = await import('./mediaIngress')
    const ownedUri = 'file:///cache/media_ingress/report.pdf'
    const bytes = ascii('%PDF-1.7\n/Type /Page\n%%EOF')
    mockState.files.set(ownedUri, bytes)

    const result = await stageAndValidateMediaIngress({
      id: 'report',
      uri: ownedUri,
      mimeType: 'application/pdf',
      fileSize: bytes.length,
      mediaType: 'document',
    })

    expect(result.deleteOnRelease).toBe(true)
    expect(mockState.copyAsync).not.toHaveBeenCalled()
  })

  it('matches the server attachment limit', async () => {
    const { MEDIA_INGRESS_MAX_BYTES } = await import('./mediaIngress')

    expect(MEDIA_INGRESS_MAX_BYTES).toBe(50 * 1024 * 1024)
  })
})
