/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import * as SecureStore from 'expo-secure-store'

import { isSameAccountStorageScope, normalizeAccountStorageScope } from '@/lib/accountScope'
import { SECURE_STORE_OPTIONS, STORAGE_KEYS } from '@/lib/constants'

export type DiscoveryVisibility = 'findable' | 'private'

type VisibilityMap = Record<string, DiscoveryVisibility>

let mutation: Promise<unknown> = Promise.resolve()

function mutate<T>(operation: () => Promise<T>): Promise<T> {
  const result = mutation.catch(() => undefined).then(operation)
  mutation = result
  return result
}

function parseMap(raw: string | null): VisibilityMap {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const map: VisibilityMap = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const scope = normalizeAccountStorageScope(key)
      if (!scope || (value !== 'findable' && value !== 'private')) continue
      map[scope] = value
    }
    return map
  } catch {
    return {}
  }
}

async function readMap(): Promise<VisibilityMap> {
  const raw = await SecureStore.getItemAsync(STORAGE_KEYS.DISCOVERY_VISIBILITY, SECURE_STORE_OPTIONS)
  return parseMap(raw)
}

async function writeMap(map: VisibilityMap): Promise<void> {
  if (Object.keys(map).length === 0) {
    await SecureStore.deleteItemAsync(STORAGE_KEYS.DISCOVERY_VISIBILITY, SECURE_STORE_OPTIONS)
    return
  }
  await SecureStore.setItemAsync(
    STORAGE_KEYS.DISCOVERY_VISIBILITY,
    JSON.stringify(map),
    SECURE_STORE_OPTIONS,
  )
}

export async function readDiscoveryVisibility(walletAddress: string): Promise<DiscoveryVisibility> {
  const scope = normalizeAccountStorageScope(walletAddress)
  if (!scope) return 'findable'
  const map = await mutate(() => readMap())
  return map[scope] ?? 'findable'
}

export async function writeDiscoveryVisibility(
  walletAddress: string,
  visibility: DiscoveryVisibility,
): Promise<void> {
  const scope = normalizeAccountStorageScope(walletAddress)
  if (!scope) return
  await mutate(async () => {
    const map = await readMap()
    if (visibility === 'findable') delete map[scope]
    else map[scope] = visibility
    await writeMap(map)
  })
}

export async function clearDiscoveryVisibility(walletAddress?: string): Promise<void> {
  if (!walletAddress) {
    await mutate(() => SecureStore.deleteItemAsync(STORAGE_KEYS.DISCOVERY_VISIBILITY, SECURE_STORE_OPTIONS))
    return
  }
  const scope = normalizeAccountStorageScope(walletAddress)
  if (!scope) return
  await mutate(async () => {
    const map = await readMap()
    const match = Object.keys(map).find((key) => isSameAccountStorageScope(key, scope))
    if (!match) return
    delete map[match]
    await writeMap(map)
  })
}
