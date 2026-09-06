/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import * as SecureStore from 'expo-secure-store'

import { isSameAccountStorageScope, normalizeAccountStorageScope } from '@/lib/accountScope'
import { SECURE_STORE_OPTIONS, STORAGE_KEYS } from '@/lib/constants'

type AutocompleteMap = Record<string, boolean>

let mutation: Promise<unknown> = Promise.resolve()

function mutate<T>(operation: () => Promise<T>): Promise<T> {
  const result = mutation.catch(() => undefined).then(operation)
  mutation = result
  return result
}

function parseMap(raw: string | null): AutocompleteMap {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const map: AutocompleteMap = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const scope = normalizeAccountStorageScope(key)
      if (!scope || typeof value !== 'boolean') continue
      map[scope] = value
    }
    return map
  } catch {
    return {}
  }
}

async function readMap(): Promise<AutocompleteMap> {
  const raw = await SecureStore.getItemAsync(STORAGE_KEYS.ALIAS_AUTOCOMPLETE, SECURE_STORE_OPTIONS)
  return parseMap(raw)
}

async function writeMap(map: AutocompleteMap): Promise<void> {
  if (Object.keys(map).length === 0) {
    await SecureStore.deleteItemAsync(STORAGE_KEYS.ALIAS_AUTOCOMPLETE, SECURE_STORE_OPTIONS)
    return
  }
  await SecureStore.setItemAsync(
    STORAGE_KEYS.ALIAS_AUTOCOMPLETE,
    JSON.stringify(map),
    SECURE_STORE_OPTIONS,
  )
}

export async function readAliasAutocomplete(walletAddress: string): Promise<boolean> {
  const scope = normalizeAccountStorageScope(walletAddress)
  if (!scope) return true
  const map = await mutate(() => readMap())
  return map[scope] ?? true
}

export async function writeAliasAutocomplete(
  walletAddress: string,
  enabled: boolean,
): Promise<void> {
  const scope = normalizeAccountStorageScope(walletAddress)
  if (!scope) return
  await mutate(async () => {
    const map = await readMap()
    if (enabled) delete map[scope]
    else map[scope] = false
    await writeMap(map)
  })
}
