/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  secureStore: new Map<string, string>(),
  randomCalls: 0,
}))

vi.mock('expo-crypto', () => ({
  getRandomBytesAsync: vi.fn(async (length: number) => {
    mockState.randomCalls += 1
    return new Uint8Array(length).fill(17)
  }),
}))

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (key: string) => mockState.secureStore.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    mockState.secureStore.set(key, value)
  }),
}))

describe('localCacheCrypto', () => {
  beforeEach(() => {
    vi.resetModules()
    mockState.secureStore.clear()
    mockState.randomCalls = 0
  })

  it('round-trips authenticated wallet-scoped cache content', async () => {
    const {
      buildLocalCacheAad,
      openLocalCacheText,
      sealLocalCacheText,
    } = await import('./localCacheCrypto')
    const scope = 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const aad = buildLocalCacheAad(['spectra', 'test', 'wallet-a', 'record-1'])

    const sealed = await sealLocalCacheText(scope, 'group', 'private message', aad)

    expect(JSON.stringify(sealed)).not.toContain('private message')
    await expect(openLocalCacheText(scope, 'group', sealed, aad)).resolves.toBe('private message')
  })

  it('rejects AAD, wallet, and domain substitution', async () => {
    const {
      buildLocalCacheAad,
      openLocalCacheText,
      sealLocalCacheText,
    } = await import('./localCacheCrypto')
    const scopeA = 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const scopeB = 'EXO00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    const aad = buildLocalCacheAad(['spectra', 'test', 'record-1'])
    const sealed = await sealLocalCacheText(scopeA, 'attachment', 'secret', aad)

    await expect(
      openLocalCacheText(scopeA, 'attachment', sealed, buildLocalCacheAad(['spectra', 'test', 'record-2'])),
    ).rejects.toThrow()
    await expect(openLocalCacheText(scopeB, 'attachment', sealed, aad)).rejects.toThrow()
    await expect(openLocalCacheText(scopeA, 'avatar', sealed, aad)).rejects.toThrow()
  })

  it('encodes AAD fields without delimiter collisions', async () => {
    const { buildLocalCacheAad } = await import('./localCacheCrypto')

    expect(buildLocalCacheAad(['record:a', 'b'])).not.toEqual(
      buildLocalCacheAad(['record', 'a:b']),
    )
  })

  it('serializes concurrent root-key creation', async () => {
    const { getLocalCacheKey } = await import('./localCacheCrypto')
    const scope = 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

    await Promise.all([
      getLocalCacheKey(scope, 'direct'),
      getLocalCacheKey(scope, 'group'),
      getLocalCacheKey(scope, 'avatar'),
    ])

    expect(mockState.randomCalls).toBe(1)
    expect(mockState.secureStore.size).toBe(1)
  })

  it('seals and opens a cold-chat page within the regression budget', async () => {
    const {
      buildLocalCacheAad,
      openLocalCacheText,
      sealLocalCacheText,
    } = await import('./localCacheCrypto')
    const scope = 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const payload = 'message-content-'.repeat(128)
    const startedAt = performance.now()
    const records = await Promise.all(Array.from({ length: 100 }, (_, index) => {
      const aad = buildLocalCacheAad(['spectra', 'benchmark', String(index)])
      return sealLocalCacheText(scope, 'direct', payload, aad)
    }))
    await Promise.all(records.map((record, index) => openLocalCacheText(
      scope,
      'direct',
      record,
      buildLocalCacheAad(['spectra', 'benchmark', String(index)]),
    )))

    expect(performance.now() - startedAt).toBeLessThan(5_000)
  })
})
