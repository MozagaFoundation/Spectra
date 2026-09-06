/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
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
  digestStringAsync: vi.fn(),
}))

vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digest: mockState.digest,
  digestStringAsync: mockState.digestStringAsync,
}))

import { digestMediaCacheKey } from './cacheKey'

describe('digestMediaCacheKey', () => {
  beforeEach(() => {
    mockState.digest.mockClear()
    mockState.digestStringAsync.mockClear()
  })

  it('separates domains, sources, and MIME types in byte-hashed keys', async () => {
    const avatar = await digestMediaCacheKey('avatar-v2', ['wallet', 'source'])
    const png = await digestMediaCacheKey('egress-asset-v1', ['source', 'image/png'])
    const jpeg = await digestMediaCacheKey('egress-asset-v1', ['source', 'image/jpeg'])

    expect(new Set([avatar, png, jpeg]).size).toBe(3)
    expect(mockState.digest).toHaveBeenCalledTimes(3)
    expect(mockState.digestStringAsync).not.toHaveBeenCalled()
  })

  it('preserves embedded NUL bytes instead of truncating cache material', async () => {
    const first = await digestMediaCacheKey('avatar-v2', ['wallet', 'alice\0avatar'])
    const second = await digestMediaCacheKey('avatar-v2', ['wallet', 'bob\0avatar'])

    expect(first).not.toBe(second)
    const encodedInputs = mockState.digest.mock.calls.map(([, source]) => (
      new TextDecoder().decode(
        source instanceof ArrayBuffer
          ? new Uint8Array(source)
          : new Uint8Array(source.buffer, source.byteOffset, source.byteLength),
      )
    ))
    expect(encodedInputs).toContain(
      JSON.stringify(['spectra-media-cache-v1', 'avatar-v2', 'wallet', 'alice\0avatar']),
    )
  })
})
