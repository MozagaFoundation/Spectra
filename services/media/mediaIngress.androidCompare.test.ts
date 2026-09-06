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

function isoMp4(trackHandlers: string[], brand = 'isom'): Uint8Array {
  const tracks = trackHandlers.map((handler) => isoBox(
    'trak',
    isoBox('mdia', isoBox('hdlr', concatBytes(new Uint8Array(8), ascii(handler)))),
  ))
  return concatBytes(
    isoBox('ftyp', concatBytes(ascii(brand), new Uint8Array(4), ascii(brand), ascii('mp42'))),
    isoBox('moov', concatBytes(...tracks)),
  )
}

function isoMp4MoovAtEnd(trackHandlers: string[], brand = 'isom'): Uint8Array {
  const tracks = trackHandlers.map((handler) => isoBox(
    'trak',
    isoBox('mdia', isoBox('hdlr', concatBytes(new Uint8Array(8), ascii(handler)))),
  ))
  return concatBytes(
    isoBox('ftyp', concatBytes(ascii(brand), new Uint8Array(4), ascii(brand), ascii('mp42'))),
    isoBox('mdat', ascii('aac-audio-payload')),
    isoBox('moov', concatBytes(...tracks)),
  )
}

function isoMp4NoMoov(brand = 'isom'): Uint8Array {
  return concatBytes(
    isoBox('ftyp', concatBytes(ascii(brand), new Uint8Array(4), ascii(brand), ascii('mp42'))),
    isoBox('mdat', ascii('audio-data')),
  )
}

describe('android voice-note ingress scenarios', () => {
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
  })

  it.each([
    ['isom+soun+moov-first', isoMp4(['soun'], 'isom')],
    ['m4a-brand+soun', isoMp4(['soun'], 'm4a ')],
    ['isom+soun+moov-at-end', isoMp4MoovAtEnd(['soun'], 'isom')],
    ['isom+no-moov', isoMp4NoMoov('isom')],
    ['m4a+no-moov', isoMp4NoMoov('m4a ')],
    ['mp42-brand+soun', isoMp4(['soun'], 'mp42')],
  ])('stageAndValidateMediaIngress: %s', async (_label, bytes) => {
    const { inspectMediaIngressBytes, stageAndValidateMediaIngress } = await import('./mediaIngress')
    const sourceUri = 'file:///cache/Audio/recording.m4a'
    mockState.files.set(sourceUri, bytes)

    const inspected = inspectMediaIngressBytes(bytes, 'audio/m4a')
    await expect(stageAndValidateMediaIngress({
      id: 'voice-note',
      uri: sourceUri,
      fileName: 'voice_note.m4a',
      mimeType: 'audio/m4a',
      fileSize: bytes.length,
      mediaType: 'voice_note',
    })).resolves.toMatchObject({
      mediaType: 'voice_note',
      mimeType: 'audio/mp4',
    })

    expect(inspected.mediaType).toBe('audio')
  })
})
