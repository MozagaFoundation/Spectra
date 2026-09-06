/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import * as Crypto from 'expo-crypto'
import * as SecureStore from 'expo-secure-store'

import { SECURE_STORE_OPTIONS, VAULT_SECURITY_KEYS } from '@/lib/constants'
import { isSameAccountStorageScope } from '@/lib/accountScope'

const NOTIFICATION_SCOPE_PREFIX = 'nsc1.'
const NOTIFICATION_SCOPE_BYTES = 16
const NOTIFICATION_SCOPE_PATTERN = /^nsc1\.[0-9a-f]{32}$/

export interface NotificationScopeEntry {
  notificationScopeId: string
  walletAddress: string
}

let registryMutation: Promise<unknown> = Promise.resolve()

function normalizeWalletAddress(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function isValidNotificationScopeId(value: unknown): value is string {
  return typeof value === 'string' && NOTIFICATION_SCOPE_PATTERN.test(value)
}

function parseRegistry(raw: string | null): NotificationScopeEntry[] {
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []

    const entries = new Map<string, NotificationScopeEntry>()
    for (const value of parsed) {
      if (!value || typeof value !== 'object') continue
      const candidate = value as Partial<NotificationScopeEntry>
      const walletAddress = normalizeWalletAddress(candidate.walletAddress)
      if (!walletAddress || !isValidNotificationScopeId(candidate.notificationScopeId)) continue
      entries.set(candidate.notificationScopeId, {
        notificationScopeId: candidate.notificationScopeId,
        walletAddress,
      })
    }
    return [...entries.values()]
  } catch {
    return []
  }
}

async function readRegistry(): Promise<NotificationScopeEntry[]> {
  const raw = await SecureStore.getItemAsync(
    VAULT_SECURITY_KEYS.NOTIFICATION_SCOPE_REGISTRY,
    SECURE_STORE_OPTIONS,
  )
  return parseRegistry(raw)
}

async function readSettledRegistry(): Promise<NotificationScopeEntry[]> {
  await registryMutation.catch(() => undefined)
  return readRegistry()
}

async function writeRegistry(entries: NotificationScopeEntry[]): Promise<void> {
  if (entries.length === 0) {
    await SecureStore.deleteItemAsync(
      VAULT_SECURITY_KEYS.NOTIFICATION_SCOPE_REGISTRY,
      SECURE_STORE_OPTIONS,
    )
    return
  }

  await SecureStore.setItemAsync(
    VAULT_SECURITY_KEYS.NOTIFICATION_SCOPE_REGISTRY,
    JSON.stringify(entries),
    SECURE_STORE_OPTIONS,
  )
}

function mutateRegistry<T>(
  mutation: (entries: NotificationScopeEntry[]) => Promise<T>,
): Promise<T> {
  const result = registryMutation
    .catch(() => undefined)
    .then(async () => mutation(await readRegistry()))
  registryMutation = result
  return result
}

async function generateNotificationScopeId(): Promise<string> {
  const random = await Crypto.getRandomBytesAsync(NOTIFICATION_SCOPE_BYTES)
  return `${NOTIFICATION_SCOPE_PREFIX}${bytesToHex(random)}`
}

export async function getOrCreateNotificationScopeId(walletAddress: string): Promise<string> {
  const normalizedAddress = normalizeWalletAddress(walletAddress)
  if (!normalizedAddress) {
    throw new Error('Notification scope requires a wallet')
  }

  return mutateRegistry(async (entries) => {
    const existing = entries.find((entry) =>
      isSameAccountStorageScope(entry.walletAddress, normalizedAddress)
    )
    if (existing) {
      return existing.notificationScopeId
    }

    let notificationScopeId = await generateNotificationScopeId()
    while (entries.some((entry) => entry.notificationScopeId === notificationScopeId)) {
      notificationScopeId = await generateNotificationScopeId()
    }

    await writeRegistry([
      ...entries,
      { notificationScopeId, walletAddress: normalizedAddress },
    ])
    return notificationScopeId
  })
}

export async function resolveNotificationScopeWallet(
  notificationScopeId: string,
): Promise<string | null> {
  if (!isValidNotificationScopeId(notificationScopeId)) return null
  const entries = await readSettledRegistry()
  return entries.find((entry) => entry.notificationScopeId === notificationScopeId)?.walletAddress ?? null
}

export async function getNotificationScopesForWallets(
  walletAddresses: string[],
): Promise<NotificationScopeEntry[]> {
  const normalized = walletAddresses
    .map(normalizeWalletAddress)
    .filter((value): value is string => value !== null)
  if (normalized.length === 0) return []

  const entries = await readSettledRegistry()
  return entries.filter((entry) =>
    normalized.some((walletAddress) =>
      isSameAccountStorageScope(entry.walletAddress, walletAddress)
    )
  )
}

export async function getStoredNotificationScopes(): Promise<NotificationScopeEntry[]> {
  return readSettledRegistry()
}

export async function removeNotificationScopesForWallets(
  walletAddresses: string[],
): Promise<void> {
  const normalized = walletAddresses
    .map(normalizeWalletAddress)
    .filter((value): value is string => value !== null)
  if (normalized.length === 0) return

  await mutateRegistry(async (entries) => {
    const retained = entries.filter((entry) =>
      !normalized.some((walletAddress) =>
        isSameAccountStorageScope(entry.walletAddress, walletAddress)
      )
    )
    await writeRegistry(retained)
  })
}

export async function clearNotificationScopeStorage(): Promise<void> {
  await mutateRegistry(async () => {
    await writeRegistry([])
  })
}
