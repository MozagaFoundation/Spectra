/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const storageState = vi.hoisted(() => ({
  data: new Map<string, string>(),
}))

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => storageState.data.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      storageState.data.set(key, value)
    }),
    removeItem: vi.fn(async (key: string) => {
      storageState.data.delete(key)
    }),
    getAllKeys: vi.fn(async () => Array.from(storageState.data.keys())),
    multiGet: vi.fn(async (keys: string[]) => keys.map((key) => [key, storageState.data.get(key) ?? null])),
    multiSet: vi.fn(async (entries: [string, string][]) => {
      for (const [key, value] of entries) {
        storageState.data.set(key, value)
      }
    }),
    multiRemove: vi.fn(async (keys: string[]) => {
      for (const key of keys) {
        storageState.data.delete(key)
      }
    }),
  },
}))

describe('keyValueStorage', () => {
  beforeEach(async () => {
    vi.resetModules()
    storageState.data.clear()
  })

  it('keeps tests on the AsyncStorage backend', async () => {
    const { getAppKeyValueStorage, prepareAppKeyValueStorage } = await import('./keyValueStorage')
    await prepareAppKeyValueStorage()
    await getAppKeyValueStorage().setItem('sealed', '{"v":1}')
    expect(storageState.data.get('sealed')).toBe('{"v":1}')
    await expect(getAppKeyValueStorage().getItem('sealed')).resolves.toBe('{"v":1}')
  })

  it('round-trips memory storage used for isolated tests', async () => {
    const { createMemoryKeyValueStorage } = await import('./keyValueStorage')
    const storage = createMemoryKeyValueStorage([['a', '1']])
    await storage.multiSet([['b', '2'], ['c', '3']])
    await expect(storage.multiGet(['a', 'b', 'missing'])).resolves.toEqual([
      ['a', '1'],
      ['b', '2'],
      ['missing', null],
    ])
    await storage.multiRemove(['a'])
    await expect(storage.getAllKeys()).resolves.toEqual(['b', 'c'])
  })

  it('can swap the active backend in tests without touching SecureStore', async () => {
    const {
      __resetAppKeyValueStorageForTests,
      __setAppKeyValueStorageForTests,
      createMemoryKeyValueStorage,
      getAppKeyValueStorage,
    } = await import('./keyValueStorage')
    const memory = createMemoryKeyValueStorage()
    __setAppKeyValueStorageForTests(memory)
    await getAppKeyValueStorage().setItem('cipher', 'sealed-blob')
    expect(storageState.data.size).toBe(0)
    await expect(memory.getItem('cipher')).resolves.toBe('sealed-blob')
    __resetAppKeyValueStorageForTests()
  })
})
