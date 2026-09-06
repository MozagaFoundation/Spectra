/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

/** Ciphertext-only sealed relay rows. Never decrypt here. */

import { NativeModules, Platform } from 'react-native'
import type { SealedRelayedMessage } from '@spectra/core-crypto'

import { isSameAccountStorageScope } from '@/lib/accountScope'
import { getAppKeyValueStorage } from './keyValueStorage'

const CACHE_KEY_PREFIX = 'exo_sealed_prefetch_rows_v1:'
const MAX_ROWS = 40
const MAX_ROW_BYTES = 512 * 1024
const MAX_CACHE_BYTES = 2 * 1024 * 1024
const MESSAGE_ID_PATTERN = /^msg_[A-Za-z0-9_-]{16,128}$/
const MAILBOX_PATTERN = /^smbx[12]\.[^\s:]{8,250}$/

interface NativeSealedPrefetchModule {
  takeRows(walletAddress: string): Promise<string | null>
  writeSession(json: string): Promise<void>
  clearSession(): Promise<void>
}

function getNativeModule(): NativeSealedPrefetchModule | null {
  if (Platform.OS !== 'ios') return null
  try {
    const native = (
      NativeModules as { SealedPrefetchModule?: NativeSealedPrefetchModule }
    ).SealedPrefetchModule
    return native ?? null
  } catch {
    return null
  }
}

function cacheKey(walletAddress: string): string {
  return `${CACHE_KEY_PREFIX}${walletAddress.trim()}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function parseSealedPrefetchRow(value: unknown): SealedRelayedMessage | null {
  if (!isRecord(value)) return null
  if (typeof value.id !== 'string' || !MESSAGE_ID_PATTERN.test(value.id)) return null
  if (
    typeof value.recipientMailboxToken !== 'string'
    || !MAILBOX_PATTERN.test(value.recipientMailboxToken)
  ) {
    return null
  }
  if (value.deliveryClass !== 'message') return null
  if (!isRecord(value.sealedEnvelope)) return null
  if (
    value.sealedEnvelope.version == null
    || value.sealedEnvelope.type == null
    || typeof value.sealedEnvelope.ciphertext !== 'string'
    || value.sealedEnvelope.ciphertext.length === 0
  ) {
    return null
  }
  if (
    typeof value.serverSequence !== 'number'
    || !Number.isSafeInteger(value.serverSequence)
    || value.serverSequence <= 0
  ) {
    return null
  }
  if (
    typeof value.createdAt !== 'number'
    || typeof value.expiresAt !== 'number'
    || !Number.isFinite(value.createdAt)
    || !Number.isFinite(value.expiresAt)
  ) {
    return null
  }
  if (value.status !== 'pending' && value.status !== 'delivered' && value.status !== 'read') {
    return null
  }

  const row: SealedRelayedMessage = {
    id: value.id,
    recipientMailboxToken: value.recipientMailboxToken,
    deliveryClass: 'message',
    sealedEnvelope: {
      version: value.sealedEnvelope.version,
      type: value.sealedEnvelope.type,
      ciphertext: value.sealedEnvelope.ciphertext,
    } as SealedRelayedMessage['sealedEnvelope'],
    status: value.status,
    serverSequence: value.serverSequence,
    createdAt: value.createdAt,
    expiresAt: value.expiresAt,
  }
  if (typeof value.deliveryToken === 'string' && value.deliveryToken.length > 0) {
    row.deliveryToken = value.deliveryToken
  }
  if (typeof value.deliveredAt === 'number' && Number.isFinite(value.deliveredAt)) {
    row.deliveredAt = value.deliveredAt
  }
  return row
}

function parseRowList(raw: string | null): SealedRelayedMessage[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const rows: SealedRelayedMessage[] = []
    for (const value of parsed) {
      const row = parseSealedPrefetchRow(value)
      if (row) rows.push(row)
    }
    return rows
  } catch {
    return []
  }
}

function serializedSize(row: SealedRelayedMessage): number {
  return JSON.stringify(row).length
}

function mergeRows(
  existing: SealedRelayedMessage[],
  incoming: SealedRelayedMessage[],
): SealedRelayedMessage[] {
  const byId = new Map<string, SealedRelayedMessage>()
  for (const row of existing) byId.set(row.id, row)
  for (const row of incoming) byId.set(row.id, row)
  return [...byId.values()]
    .sort((a, b) => a.serverSequence - b.serverSequence)
    .slice(-MAX_ROWS)
}

export async function storeSealedPrefetchRows(
  walletAddress: string,
  rows: SealedRelayedMessage[],
): Promise<number> {
  const scope = walletAddress.trim()
  if (!scope || rows.length === 0) return 0
  const valid = rows.filter((row) => {
    const size = serializedSize(row)
    return size > 0 && size <= MAX_ROW_BYTES && parseSealedPrefetchRow(row)
  })
  if (valid.length === 0) return 0

  const storage = getAppKeyValueStorage()
  const existing = parseRowList(await storage.getItem(cacheKey(scope)))
  const merged = mergeRows(existing, valid)
  let total = 0
  const bounded: SealedRelayedMessage[] = []
  for (let index = merged.length - 1; index >= 0; index -= 1) {
    const size = serializedSize(merged[index]!)
    if (total + size > MAX_CACHE_BYTES) continue
    total += size
    bounded.unshift(merged[index]!)
  }
  await storage.setItem(cacheKey(scope), JSON.stringify(bounded))
  return bounded.length
}

async function takeNativeRows(walletAddress: string): Promise<SealedRelayedMessage[]> {
  const native = getNativeModule()
  if (!native) return []
  try {
    const raw = await native.takeRows(walletAddress)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) {
      return parseRowList(JSON.stringify(parsed))
    }
    if (
      !isRecord(parsed)
      || typeof parsed.walletAddress !== 'string'
      || !isSameAccountStorageScope(parsed.walletAddress, walletAddress)
    ) {
      return []
    }
    return parseRowList(JSON.stringify(parsed.rows))
  } catch {
    return []
  }
}

export async function takeSealedPrefetchRows(
  walletAddress: string,
): Promise<SealedRelayedMessage[]> {
  const scope = walletAddress.trim()
  if (!scope) return []
  const storage = getAppKeyValueStorage()
  const [nativeRows, localRaw] = await Promise.all([
    takeNativeRows(scope),
    storage.getItem(cacheKey(scope)),
  ])
  const localRows = parseRowList(localRaw)
  const merged = mergeRows(localRows, nativeRows)
  await storage.removeItem(cacheKey(scope))
  return merged
}

export async function clearSealedPrefetchRows(walletAddress?: string): Promise<void> {
  const storage = getAppKeyValueStorage()
  if (walletAddress?.trim()) {
    await storage.removeItem(cacheKey(walletAddress.trim()))
    return
  }
  const keys = await storage.getAllKeys()
  const prefetchKeys = keys.filter((key) => key.startsWith(CACHE_KEY_PREFIX))
  if (prefetchKeys.length > 0) {
    await storage.multiRemove(prefetchKeys)
  }
  try {
    await getNativeModule()?.clearSession()
  } catch {
    // Native session is best-effort.
  }
}

export async function publishNativePrefetchSession(json: string): Promise<void> {
  const native = getNativeModule()
  if (!native) return
  await native.writeSession(json)
}

export async function clearNativePrefetchSession(): Promise<void> {
  const native = getNativeModule()
  if (!native) return
  await native.clearSession()
}
