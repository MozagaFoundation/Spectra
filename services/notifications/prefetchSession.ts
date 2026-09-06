/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import * as SecureStore from 'expo-secure-store'

import { isSameAccountStorageScope } from '@/lib/accountScope'
import {
  SECURE_STORE_OPTIONS,
  SPECTRA_API_URL,
  STORAGE_KEYS,
} from '@/lib/constants'
import { getRuntimeAppVersion } from '@/lib/appMetadata'
import { useSpectreStore } from '@/store/spectreStore'
import { isValidNotificationScopeId } from './notificationScope'
import {
  clearNativePrefetchSession,
  publishNativePrefetchSession,
} from '@/services/storage/sealedPrefetchCache'
import { getAppKeyValueStorage } from '@/services/storage/keyValueStorage'

const PREFETCH_SESSION_VERSION = 1

export interface PrefetchSessionSnapshot {
  v: typeof PREFETCH_SESSION_VERSION
  apiBaseUrl: string
  accessToken: string
  afterSequence: number
  walletAddress: string
  notificationScopeId: string | null
  expiresAt: number
  appVersion: string
}

function nativeSessionPayload(snapshot: PrefetchSessionSnapshot): string {
  return JSON.stringify({
    v: snapshot.v,
    apiBaseUrl: snapshot.apiBaseUrl,
    accessToken: snapshot.accessToken,
    afterSequence: snapshot.afterSequence,
    walletAddress: snapshot.walletAddress,
    notificationScopeId: snapshot.notificationScopeId,
    expiresAt: snapshot.expiresAt,
    appVersion: snapshot.appVersion,
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function cursorKey(walletAddress: string): string {
  return `${STORAGE_KEYS.SEALED_PREFETCH_CURSOR_PREFIX}:${walletAddress.trim()}`
}

function parsePersistedCloudSession(raw: string | null): {
  exoAddress: string
  accessToken: string
  expiresAt: number
} | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!isRecord(parsed)) return null
    if (typeof parsed.exoAddress !== 'string' || typeof parsed.accessToken !== 'string') {
      return null
    }
    if (typeof parsed.expiresAt !== 'number' || !Number.isFinite(parsed.expiresAt)) return null
    return {
      exoAddress: parsed.exoAddress,
      accessToken: parsed.accessToken,
      expiresAt: parsed.expiresAt,
    }
  } catch {
    return null
  }
}

export async function readPrefetchCursor(walletAddress: string): Promise<number> {
  const raw = await getAppKeyValueStorage().getItem(cursorKey(walletAddress))
  const sequence = raw ? Number(raw) : 0
  return Number.isSafeInteger(sequence) && sequence > 0 ? sequence : 0
}

export async function persistPrefetchCursor(
  walletAddress: string,
  sequence: number,
): Promise<void> {
  if (!walletAddress.trim() || !Number.isSafeInteger(sequence) || sequence < 0) return
  await getAppKeyValueStorage().setItem(cursorKey(walletAddress), String(sequence))
}

export async function clearPrefetchCursor(walletAddress?: string): Promise<void> {
  const storage = getAppKeyValueStorage()
  if (walletAddress?.trim()) {
    await storage.removeItem(cursorKey(walletAddress.trim()))
    return
  }
  const keys = await storage.getAllKeys()
  const cursorKeys = keys.filter((key) =>
    key.startsWith(`${STORAGE_KEYS.SEALED_PREFETCH_CURSOR_PREFIX}:`)
  )
  if (cursorKeys.length > 0) {
    await storage.multiRemove(cursorKeys)
  }
}

export async function loadPrefetchSession(
  walletAddress: string,
): Promise<PrefetchSessionSnapshot | null> {
  const session = parsePersistedCloudSession(
    await SecureStore.getItemAsync(STORAGE_KEYS.SESSION, SECURE_STORE_OPTIONS),
  )
  if (!session) return null
  if (!isSameAccountStorageScope(session.exoAddress, walletAddress)) return null
  if (session.expiresAt <= Date.now() + 5_000) return null
  const apiBaseUrl = SPECTRA_API_URL.trim()
  if (!apiBaseUrl.startsWith('https://') && !apiBaseUrl.startsWith('http://localhost')) {
    return null
  }
  return {
    v: PREFETCH_SESSION_VERSION,
    apiBaseUrl,
    accessToken: session.accessToken,
    afterSequence: await readPrefetchCursor(walletAddress),
    walletAddress: session.exoAddress,
    notificationScopeId: null,
    expiresAt: session.expiresAt,
    appVersion: getRuntimeAppVersion(),
  }
}

export async function publishPrefetchSession(input: {
  walletAddress: string
  notificationScopeId?: string | null
  afterSequence?: number
}): Promise<void> {
  if (useSpectreStore.getState().enabled) {
    await clearNativePrefetchSession()
    return
  }
  const snapshot = await loadPrefetchSession(input.walletAddress)
  if (!snapshot) {
    await clearNativePrefetchSession()
    return
  }
  if (Number.isSafeInteger(input.afterSequence) && (input.afterSequence ?? 0) >= 0) {
    snapshot.afterSequence = input.afterSequence ?? 0
    await persistPrefetchCursor(input.walletAddress, snapshot.afterSequence)
  }
  if (isValidNotificationScopeId(input.notificationScopeId)) {
    snapshot.notificationScopeId = input.notificationScopeId
  }
  try {
    await publishNativePrefetchSession(nativeSessionPayload(snapshot))
  } catch {
    // iOS killed-app prefetch is best-effort.
  }
}

export async function clearPrefetchSession(walletAddress?: string): Promise<void> {
  await Promise.all([
    clearPrefetchCursor(walletAddress),
    clearNativePrefetchSession(),
  ])
}
