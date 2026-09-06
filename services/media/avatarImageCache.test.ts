/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  files: new Map<string, string>(),
  directories: new Set<string>(),
  torAwareFetchBytes: vi.fn(),
}))

vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: vi.fn(async (_algorithm: string, value: string) => {
    const truncated = value.split('\0')[0]
    let hash = 0
    for (let index = 0; index < truncated.length; index++) {
      hash = ((hash * 31) + truncated.charCodeAt(index)) >>> 0
    }
    return hash.toString(16).padStart(64, '0')
  }),
  digest: vi.fn(async (_algorithm: string, source: ArrayBuffer | ArrayBufferView) => {
    const bytes = source instanceof ArrayBuffer
      ? new Uint8Array(source)
      : new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
    let hash = 2166136261
    for (const byte of bytes) {
      hash = Math.imul(hash ^ byte, 16777619) >>> 0
    }
    const output = new Uint8Array(32)
    for (let index = 0; index < output.length; index += 1) {
      hash = Math.imul(hash ^ index, 16777619) >>> 0
      output[index] = hash & 0xff
    }
    return output.buffer
  }),
}))

vi.mock('@spectra/identity-vault', () => ({
  base64ToBytes: (value: string) => Uint8Array.from(Buffer.from(value, 'base64')),
  bytesToBase64: (value: Uint8Array) => Buffer.from(value).toString('base64'),
}))

vi.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  EncodingType: { Base64: 'base64' },
  deleteAsync: vi.fn(async (uri: string) => {
    mockState.files.forEach((_value, path) => {
      if (path.startsWith(uri)) mockState.files.delete(path)
    })
    mockState.directories.forEach((path) => {
      if (path.startsWith(uri)) mockState.directories.delete(path)
    })
  }),
  getInfoAsync: vi.fn(async (uri: string) => ({
    exists: mockState.files.has(uri) || mockState.directories.has(uri),
    size: mockState.files.get(uri)?.length,
  })),
  makeDirectoryAsync: vi.fn(async (uri: string) => {
    mockState.directories.add(uri)
  }),
  moveAsync: vi.fn(async ({ from, to }: { from: string; to: string }) => {
    const value = mockState.files.get(from)
    if (value === undefined) throw new Error('Missing temporary avatar cache record')
    mockState.files.set(to, value)
    mockState.files.delete(from)
  }),
  readAsStringAsync: vi.fn(async (uri: string) => {
    const value = mockState.files.get(uri)
    if (value === undefined) throw new Error('Missing avatar cache record')
    return value
  }),
  writeAsStringAsync: vi.fn(async (uri: string, value: string) => {
    mockState.files.set(uri, value)
  }),
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

vi.mock('@/services/tor/torFetch', () => ({
  torAwareFetchBytes: mockState.torAwareFetchBytes,
}))

describe('avatarImageCache', () => {
  beforeEach(() => {
    vi.resetModules()
    mockState.files.clear()
    mockState.directories.clear()
    mockState.torAwareFetchBytes.mockReset()
  })

  it('persists only encrypted avatar records and returns memory-only data URIs', async () => {
    const jpegBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])
    mockState.torAwareFetchBytes.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        'content-type': 'image/jpeg',
        'content-length': String(jpegBytes.length),
      }),
      bytes: jpegBytes,
    })
    const { loadEncryptedAvatar } = await import('./avatarImageCache')

    const uri = await loadEncryptedAvatar(
      'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'avatars/alice.jpg',
      'https://backend.test/alice.jpg',
    )

    expect(uri).toMatch(/^data:image\/jpeg;base64,/)
    expect(mockState.torAwareFetchBytes).toHaveBeenCalledTimes(1)
    const persisted = [...mockState.files.values()].join('\n')
    expect(persisted).not.toContain('avatar bytes')
    expect(persisted).not.toContain('avatars/alice.jpg')

    await expect(loadEncryptedAvatar(
      'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'avatars/alice.jpg',
      'https://backend.test/rotated-signature.jpg',
    )).resolves.toBe(uri)
    expect(mockState.torAwareFetchBytes).toHaveBeenCalledTimes(1)
  })

  it('isolates cache entries by wallet and clears disk and memory together', async () => {
    mockState.torAwareFetchBytes.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'image/png' }),
      bytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    })
    const {
      clearEncryptedAvatarCache,
      loadEncryptedAvatar,
    } = await import('./avatarImageCache')

    await loadEncryptedAvatar(
      'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'avatars/shared.png',
      'https://backend.test/shared.png',
    )
    await loadEncryptedAvatar(
      'EXO00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      'avatars/shared.png',
      'https://backend.test/shared.png',
    )
    expect(mockState.torAwareFetchBytes).toHaveBeenCalledTimes(2)
    expect(mockState.files.size).toBe(2)

    await clearEncryptedAvatarCache()
    expect(mockState.files.size).toBe(0)
  })

  it('infers allowlisted image types for opaque object downloads', async () => {
    const jpegBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])
    mockState.torAwareFetchBytes.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/octet-stream' }),
      bytes: jpegBytes,
    })
    const { loadEncryptedAvatar } = await import('./avatarImageCache')

    await expect(loadEncryptedAvatar(
      'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'spectra://objects/avatar-jpeg',
      'https://backend.test/object',
    )).resolves.toMatch(/^data:image\/jpeg;base64,/)

    mockState.torAwareFetchBytes.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/octet-stream' }),
      bytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    })
    await expect(loadEncryptedAvatar(
      'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'spectra://objects/avatar-png',
      'https://backend.test/object-2',
    )).resolves.toMatch(/^data:image\/png;base64,/)
  })

  it('rejects opaque object downloads without an image signature', async () => {
    mockState.torAwareFetchBytes.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/octet-stream' }),
      bytes: Uint8Array.from([1, 2, 3, 4]),
    })
    const { loadEncryptedAvatar } = await import('./avatarImageCache')

    await expect(loadEncryptedAvatar(
      'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'spectra://objects/not-an-image',
      'https://backend.test/object',
    )).rejects.toThrow('supported image')
  })

  it('evicts one wallet-scoped avatar without clearing other entries', async () => {
    const jpegBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])
    mockState.torAwareFetchBytes.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'image/jpeg' }),
      bytes: jpegBytes,
    })
    const {
      evictEncryptedAvatar,
      loadEncryptedAvatar,
    } = await import('./avatarImageCache')
    const walletA = 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const walletB = 'EXO00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

    await loadEncryptedAvatar(walletA, 'avatar.jpg', 'https://backend.test/a.jpg')
    await loadEncryptedAvatar(walletB, 'avatar.jpg', 'https://backend.test/b.jpg')
    await evictEncryptedAvatar(walletA, 'avatar.jpg')
    await loadEncryptedAvatar(walletB, 'avatar.jpg', 'https://backend.test/b-rotated.jpg')
    await loadEncryptedAvatar(walletA, 'avatar.jpg', 'https://backend.test/a-new.jpg')

    expect(mockState.torAwareFetchBytes).toHaveBeenCalledTimes(3)
  })

  it('primes a new object ref before resolving a remote URL', async () => {
    const jpegBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])
    mockState.files.set(
      'file:///normalized.jpg',
      Buffer.from(jpegBytes).toString('base64'),
    )
    const {
      loadEncryptedAvatar,
      primeEncryptedAvatar,
    } = await import('./avatarImageCache')
    const wallet = 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const objectRef = 'spectra://objects/new-avatar'
    await primeEncryptedAvatar(wallet, objectRef, 'file:///normalized.jpg')
    const resolveRemote = vi.fn(async () => 'https://backend.test/new-avatar')

    await expect(loadEncryptedAvatar(wallet, objectRef, resolveRemote))
      .resolves.toMatch(/^data:image\/jpeg;base64,/)
    expect(resolveRemote).not.toHaveBeenCalled()
    expect(mockState.torAwareFetchBytes).not.toHaveBeenCalled()
  })

  it('keeps owner and contact avatars distinct within one wallet scope', async () => {
    const ownerBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1])
    const aliceBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 2])
    const bobBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 3])
    mockState.files.set('file:///owner.jpg', Buffer.from(ownerBytes).toString('base64'))
    mockState.files.set(
      'file:///cache/spectra-encrypted-avatars-v1/collided.json',
      'legacy',
    )
    mockState.directories.add('file:///cache/spectra-encrypted-avatars-v1/')
    mockState.torAwareFetchBytes.mockImplementation(async (uri: string) => {
      const bytes = uri.endsWith('/alice') ? aliceBytes : bobBytes
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'image/jpeg' }),
        bytes,
      }
    })
    const {
      loadEncryptedAvatar,
      primeEncryptedAvatar,
    } = await import('./avatarImageCache')
    const wallet = 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const ownerRef = 'spectra://objects/users/me/avatars/owner.enc'
    const aliceRef = 'spectra://objects/users/alice/avatars/alice.enc'
    const bobRef = 'spectra://objects/users/bob/avatars/bob.enc'
    const resolveAlice = vi.fn(async () => 'https://backend.test/alice')
    const resolveBob = vi.fn(async () => 'https://backend.test/bob')

    const owner = await primeEncryptedAvatar(wallet, ownerRef, 'file:///owner.jpg')
    const alice = await loadEncryptedAvatar(wallet, aliceRef, resolveAlice)
    const bob = await loadEncryptedAvatar(wallet, bobRef, resolveBob)

    expect(new Set([owner, alice, bob]).size).toBe(3)
    expect(resolveAlice).toHaveBeenCalledTimes(1)
    expect(resolveBob).toHaveBeenCalledTimes(1)
    expect([...mockState.files.keys()].some(
      (path) => path.includes('spectra-encrypted-avatars-v1'),
    )).toBe(false)
    expect([...mockState.files.keys()].filter(
      (path) => path.includes('spectra-encrypted-avatars-v2') && path.endsWith('.json'),
    )).toHaveLength(3)
  })

  it('rejects non-HTTPS remote avatar sources', async () => {
    const { loadEncryptedAvatar } = await import('./avatarImageCache')
    await expect(loadEncryptedAvatar(
      'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'avatars/alice.jpg',
      'http://backend.test/alice.jpg',
    )).rejects.toThrow('HTTPS')
    expect(mockState.torAwareFetchBytes).not.toHaveBeenCalled()
  })
})
