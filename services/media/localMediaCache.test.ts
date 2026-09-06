/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const scope = 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const mockState = vi.hoisted(() => ({
  asyncStorage: new Map<string, string>(),
  directories: new Set<string>(),
  files: new Map<string, Uint8Array>(),
  strings: new Map<string, string>(),
}))

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => mockState.asyncStorage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      mockState.asyncStorage.set(key, value)
    }),
    removeItem: vi.fn(async (key: string) => {
      mockState.asyncStorage.delete(key)
    }),
    getAllKeys: vi.fn(async () => Array.from(mockState.asyncStorage.keys())),
    multiRemove: vi.fn(async (keys: string[]) => {
      keys.forEach((key) => mockState.asyncStorage.delete(key))
    }),
  },
}))

vi.mock('@/store/walletStore', () => ({
  useWalletStore: {
    getState: () => ({ wallet: { address: scope } }),
  },
}))

vi.mock('@/services/storage/localCacheCrypto', () => ({
  buildLocalCacheAad: (parts: string[]) => new TextEncoder().encode(parts.join(':')),
  sealLocalCacheText: vi.fn(async (
    _scope: string,
    _domain: string,
    plaintext: string,
  ) => ({
    v: 1,
    algorithm: 'AES-256-GCM',
    ciphertext: Buffer.from(plaintext, 'utf8').toString('base64'),
    iv: 'test-iv',
  })),
  openLocalCacheText: vi.fn(async (
    _scope: string,
    _domain: string,
    cipher: { ciphertext: string },
  ) => Buffer.from(cipher.ciphertext, 'base64').toString('utf8')),
}))

vi.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  documentDirectory: 'file:///documents/',
  deleteAsync: vi.fn(async (uri: string) => {
    mockState.directories.forEach((path) => {
      if (path.startsWith(uri)) mockState.directories.delete(path)
    })
    mockState.files.forEach((_value, path) => {
      if (path.startsWith(uri)) mockState.files.delete(path)
    })
    mockState.strings.forEach((_value, path) => {
      if (path.startsWith(uri)) mockState.strings.delete(path)
    })
  }),
  getInfoAsync: vi.fn(async (uri: string) => ({
    exists: mockState.directories.has(uri) || mockState.files.has(uri) || mockState.strings.has(uri),
    size: mockState.files.get(uri)?.byteLength ?? mockState.strings.get(uri)?.length,
  })),
  makeDirectoryAsync: vi.fn(async (uri: string) => {
    mockState.directories.add(uri)
  }),
  moveAsync: vi.fn(async ({ from, to }: { from: string; to: string }) => {
    mockState.strings.forEach((value, path) => {
      if (path.startsWith(from)) {
        mockState.strings.set(`${to}${path.slice(from.length)}`, value)
        mockState.strings.delete(path)
      }
    })
    mockState.directories.add(to)
    mockState.directories.delete(from)
  }),
  readAsStringAsync: vi.fn(async (uri: string) => {
    const value = mockState.strings.get(uri)
    if (value === undefined) throw new Error(`Missing string file ${uri}`)
    return value
  }),
  writeAsStringAsync: vi.fn(async (uri: string, value: string) => {
    mockState.strings.set(uri, value)
  }),
}))

vi.mock('expo-file-system', () => ({
  File: class MockFile {
    constructor(public readonly uri: string) {}

    info() {
      const bytes = mockState.files.get(this.uri)
      return { exists: Boolean(bytes), size: bytes?.byteLength }
    }

    open() {
      const fileUri = this.uri
      let offset = 0
      return {
        readBytes(length: number) {
          const bytes = mockState.files.get(fileUri) ?? new Uint8Array()
          const chunk = bytes.slice(offset, offset + length)
          offset += chunk.byteLength
          return chunk
        },
        writeBytes(bytes: Uint8Array) {
          const existing = mockState.files.get(fileUri) ?? new Uint8Array()
          const next = new Uint8Array(existing.byteLength + bytes.byteLength)
          next.set(existing)
          next.set(bytes, existing.byteLength)
          mockState.files.set(fileUri, next)
        },
        close() {},
      }
    }
  },
}))

vi.mock('./transientRenderCache', () => ({
  clearTransientRenderCache: vi.fn(async () => {
    mockState.files.forEach((_value, uri) => {
      if (uri.startsWith('file:///cache/render/')) mockState.files.delete(uri)
    })
  }),
  getTransientRenderDirectory: (walletScope?: string) =>
    `file:///cache/render/${walletScope ? `${walletScope}/` : ''}`,
  getTransientRenderPath: (mediaId: string, extension: string, walletScope?: string) =>
    `file:///cache/render/${walletScope ? `${walletScope}/` : ''}${mediaId}.${extension}`,
  initializeTransientRenderCache: vi.fn(async (walletScope?: string) => {
    mockState.directories.add(`file:///cache/render/${walletScope ? `${walletScope}/` : ''}`)
  }),
  isTransientRenderUri: (uri: string) => uri.startsWith('file:///cache/render/'),
  protectTransientRenderPath: vi.fn(async () => {}),
  writeTransientRenderFile: vi.fn(async (
    uri: string,
    chunks: AsyncIterable<Uint8Array>,
  ) => {
    const values: Uint8Array[] = []
    for await (const chunk of chunks) values.push(chunk)
    const size = values.reduce((total, chunk) => total + chunk.byteLength, 0)
    const output = new Uint8Array(size)
    let offset = 0
    values.forEach((chunk) => {
      output.set(chunk, offset)
      offset += chunk.byteLength
    })
    mockState.files.set(uri, output)
  }),
}))

const attachment = {
  id: 'media-1',
  type: 'image',
  uri: 'file:///source/photo.jpg',
  fileName: 'photo.jpg',
  mimeType: 'image/jpeg',
  fileSize: 19,
  isEncrypted: false,
} as const

describe('localMediaCache', () => {
  let mediaCache: typeof import('./localMediaCache')

  beforeEach(async () => {
    vi.resetModules()
    mockState.asyncStorage.clear()
    mockState.directories.clear()
    mockState.files.clear()
    mockState.strings.clear()
    mockState.files.set(attachment.uri, new TextEncoder().encode('private image bytes'))
    mediaCache = await import('./localMediaCache')
  })

  it('stores encrypted chunks and metadata without plaintext copies', async () => {
    const cached = await mediaCache.cacheMediaFromFile(
      'media-1',
      'message-1',
      'conversation-1',
      attachment,
    )

    expect(cached.localUri).toBe(attachment.uri)
    const persistentValues = [
      ...mockState.asyncStorage.values(),
      ...mockState.strings.values(),
    ].join('\n')
    expect(persistentValues).not.toContain('private image bytes')
    expect(persistentValues).not.toContain('photo.jpg')
    expect([...mockState.strings.keys()]).toContain(
      `file:///documents/spectra-encrypted-media-v1/${scope}/media-1/0.chunk`,
    )
    expect([...mockState.files.keys()].some((uri) => (
      uri.startsWith('file:///documents/spectra-encrypted-media-v1/')
    ))).toBe(false)
  })

  it('decrypts only into the transient render directory on cache hit', async () => {
    await mediaCache.cacheMediaFromFile(
      'media-1',
      'message-1',
      'conversation-1',
      attachment,
    )

    await expect(mediaCache.getLocalMediaUri('media-1')).resolves.toBe(
      `file:///cache/render/${scope}/media-1.jpg`,
    )
    expect(new TextDecoder().decode(
      mockState.files.get(`file:///cache/render/${scope}/media-1.jpg`),
    )).toBe('private image bytes')
    await expect(mediaCache.isMediaCached('media-1')).resolves.toBe(true)
  })

  it('persists remote deletion work until the server confirms consumption', async () => {
    const { uri: _uri, ...cachedAttachment } = attachment
    const objectRef = 'spectra://objects/users/sender/attachments/media-1.enc'
    await mediaCache.registerCachedMedia(
      'media-1',
      'message-1',
      'conversation-1',
      attachment.uri,
      cachedAttachment,
      scope,
      objectRef,
    )

    await expect(mediaCache.listPendingRemoteMediaDeletes(scope)).resolves.toEqual([
      { mediaId: 'media-1', objectRef },
    ])

    await mediaCache.markRemoteMediaDeleteComplete('media-1', scope)
    await expect(mediaCache.listPendingRemoteMediaDeletes(scope)).resolves.toEqual([])
  })

  it('purges legacy plaintext media cache artifacts during initialization', async () => {
    mockState.directories.add('file:///documents/media_cache/')
    mockState.files.set('file:///documents/media_cache/plain.jpg', new Uint8Array([1]))
    mockState.asyncStorage.set('qc_media_plain', JSON.stringify({ localUri: 'plain.jpg' }))

    await mediaCache.initializeMediaCache()

    expect(mockState.directories.has('file:///documents/media_cache/')).toBe(false)
    expect(mockState.files.has('file:///documents/media_cache/plain.jpg')).toBe(false)
    expect(mockState.asyncStorage.has('qc_media_plain')).toBe(false)
  })

  it('rejects unsafe media identifiers before writing cache files', async () => {
    await expect(mediaCache.cacheMediaFromFile(
      '../escape',
      'message-1',
      'conversation-1',
      attachment,
    )).rejects.toThrow('Unsafe media id')
  })

  it('deletes encrypted chunks, metadata, and transient renders together', async () => {
    await mediaCache.cacheMediaFromFile(
      'media-1',
      'message-1',
      'conversation-1',
      attachment,
    )
    await mediaCache.getLocalMediaUri('media-1')
    await mediaCache.deleteConversationMedia('conversation-1')

    expect(mockState.files.has(`file:///cache/render/${scope}/media-1.jpg`)).toBe(false)
    expect([...mockState.strings.keys()].some((key) => key.includes('/media-1/'))).toBe(false)
    expect([...mockState.asyncStorage.keys()].some((key) => key.includes('media-1'))).toBe(false)
  })
})
