/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

/** Durable KV for already-sealed JSON strings. Never store PIN, session, or root keys here. */

import AsyncStorage from '@react-native-async-storage/async-storage'

export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  removeItem(key: string): Promise<void>
  getAllKeys(): Promise<string[]>
  multiGet(keys: readonly string[]): Promise<Array<[string, string | null]>>
  multiSet(entries: ReadonlyArray<readonly [string, string]>): Promise<void>
  multiRemove(keys: readonly string[]): Promise<void>
}

interface NativeAppKeyValueModule {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  removeItem(key: string): Promise<void>
  getAllKeys(): Promise<string[]>
  multiGet(keys: readonly string[]): Promise<Array<[string, string | null]>>
  multiSet(entries: ReadonlyArray<readonly [string, string]>): Promise<void>
  multiRemove(keys: readonly string[]): Promise<void>
  clear(): Promise<void>
}

const MIGRATION_MARKER_KEY = '__spectra_kv_backend_mmkv_v1'
const MIGRATION_BATCH_SIZE = 64
const asyncStorageBackend = createAsyncStorageBackend()
let activeBackend: KeyValueStorage = asyncStorageBackend
let preparePromise: Promise<void> | null = null
let prepared = false
let nativeClear: (() => Promise<void>) | null = null

function isTestEnv(): boolean {
  return typeof process !== 'undefined' && process.env?.NODE_ENV === 'test'
}

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

export function createAsyncStorageBackend(): KeyValueStorage {
  return {
    getItem: (key) => AsyncStorage.getItem(key),
    setItem: (key, value) => AsyncStorage.setItem(key, value),
    removeItem: (key) => AsyncStorage.removeItem(key),
    getAllKeys: async () => [...await AsyncStorage.getAllKeys()],
    multiGet: async (keys) => {
      if (keys.length === 0) return []
      return Array.from(await AsyncStorage.multiGet([...keys]))
    },
    multiSet: async (entries) => {
      if (entries.length === 0) return
      await AsyncStorage.multiSet(entries.map(([key, value]) => [key, value]))
    },
    multiRemove: async (keys) => {
      if (keys.length === 0) return
      await AsyncStorage.multiRemove([...keys])
    },
  }
}

export function createMemoryKeyValueStorage(
  initial: Iterable<readonly [string, string]> = [],
): KeyValueStorage {
  const data = new Map<string, string>(initial)
  return {
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      data.set(key, value)
    },
    removeItem: async (key) => {
      data.delete(key)
    },
    getAllKeys: async () => [...data.keys()],
    multiGet: async (keys) => keys.map((key) => [key, data.get(key) ?? null]),
    multiSet: async (entries) => {
      for (const [key, value] of entries) {
        data.set(key, value)
      }
    },
    multiRemove: async (keys) => {
      for (const key of keys) {
        data.delete(key)
      }
    },
  }
}

function createNativeKeyValueBackend(native: NativeAppKeyValueModule): KeyValueStorage {
  return {
    getItem: (key) => native.getItem(key),
    setItem: (key, value) => native.setItem(key, value),
    removeItem: (key) => native.removeItem(key),
    getAllKeys: () => native.getAllKeys(),
    multiGet: async (keys) => {
      if (keys.length === 0) return []
      return native.multiGet(keys)
    },
    multiSet: async (entries) => {
      if (entries.length === 0) return
      await native.multiSet(entries)
    },
    multiRemove: async (keys) => {
      if (keys.length === 0) return
      await native.multiRemove(keys)
    },
  }
}

function createOverlayKeyValueStorage(
  primary: KeyValueStorage,
  secondary: KeyValueStorage,
): KeyValueStorage {
  return {
    getItem: async (key) => (await primary.getItem(key)) ?? secondary.getItem(key),
    setItem: async (key, value) => {
      await Promise.all([primary.setItem(key, value), secondary.setItem(key, value)])
    },
    removeItem: async (key) => {
      await Promise.all([primary.removeItem(key), secondary.removeItem(key)])
    },
    getAllKeys: async () => {
      const [primaryKeys, secondaryKeys] = await Promise.all([
        primary.getAllKeys(),
        secondary.getAllKeys(),
      ])
      return [...new Set([...primaryKeys, ...secondaryKeys])]
    },
    multiGet: async (keys) => {
      const primaryEntries = await primary.multiGet(keys)
      const missing = primaryEntries.flatMap(([key, value]) => (value === null ? [key] : []))
      const secondaryByKey = new Map(
        missing.length > 0 ? await secondary.multiGet(missing) : [],
      )
      return primaryEntries.map(([key, value]) => [
        key,
        value ?? secondaryByKey.get(key) ?? null,
      ])
    },
    multiSet: async (entries) => {
      await Promise.all([primary.multiSet(entries), secondary.multiSet(entries)])
    },
    multiRemove: async (keys) => {
      await Promise.all([primary.multiRemove(keys), secondary.multiRemove(keys)])
    },
  }
}

function getNativeAppKeyValueModule(): NativeAppKeyValueModule | null {
  try {
    const { NativeModules } = require('react-native') as {
      NativeModules?: { AppKeyValueModule?: NativeAppKeyValueModule }
    }
    const native = NativeModules?.AppKeyValueModule
    if (
      native
      && typeof native.getItem === 'function'
      && typeof native.setItem === 'function'
      && typeof native.getAllKeys === 'function'
    ) {
      return native
    }
  } catch {
    return null
  }
  return null
}

async function copyMissingKeys(
  source: KeyValueStorage,
  destination: KeyValueStorage,
): Promise<string[]> {
  const keys = (await source.getAllKeys()).filter((key) => key !== MIGRATION_MARKER_KEY)
  const copied: string[] = []
  for (let index = 0; index < keys.length; index += MIGRATION_BATCH_SIZE) {
    const batch = keys.slice(index, index + MIGRATION_BATCH_SIZE)
    const existing = new Map(await destination.multiGet(batch))
    const entries = await source.multiGet(batch)
    const missing = entries.flatMap(([key, value]) => (
      value !== null && existing.get(key) == null ? [[key, value] as const] : []
    ))
    if (missing.length > 0) {
      await destination.multiSet(missing)
    }
    copied.push(...batch)
    await yieldToUi()
  }
  return copied
}

async function removeCopiedKeys(source: KeyValueStorage, keys: string[]): Promise<void> {
  for (let index = 0; index < keys.length; index += MIGRATION_BATCH_SIZE) {
    await source.multiRemove(keys.slice(index, index + MIGRATION_BATCH_SIZE))
    await yieldToUi()
  }
}

async function migrateToNativeBackend(native: KeyValueStorage): Promise<void> {
  if (await native.getItem(MIGRATION_MARKER_KEY) === '1') {
    activeBackend = native
    return
  }

  activeBackend = createOverlayKeyValueStorage(native, asyncStorageBackend)
  const copiedKeys = await copyMissingKeys(asyncStorageBackend, native)
  await native.setItem(MIGRATION_MARKER_KEY, '1')
  await removeCopiedKeys(asyncStorageBackend, copiedKeys)
  activeBackend = native
}

export function getAppKeyValueStorage(): KeyValueStorage {
  return activeBackend
}

export async function prepareAppKeyValueStorage(): Promise<void> {
  if (prepared) return
  if (preparePromise) {
    await preparePromise
    return
  }

  preparePromise = (async () => {
    if (isTestEnv()) {
      prepared = true
      return
    }

    const nativeModule = getNativeAppKeyValueModule()
    if (!nativeModule) {
      prepared = true
      return
    }

    const nativeBackend = createNativeKeyValueBackend(nativeModule)
    nativeClear = () => nativeModule.clear()
    await migrateToNativeBackend(nativeBackend)
    prepared = true
  })()

  try {
    await preparePromise
  } finally {
    if (preparePromise) {
      preparePromise = null
    }
  }
}

export async function clearNativeKeyValueStorage(): Promise<void> {
  await nativeClear?.()
}

export function __setAppKeyValueStorageForTests(storage: KeyValueStorage): void {
  if (!isTestEnv()) return
  activeBackend = storage
  prepared = true
}

export function __resetAppKeyValueStorageForTests(): void {
  if (!isTestEnv()) return
  activeBackend = asyncStorageBackend
  prepared = false
  preparePromise = null
  nativeClear = null
}
