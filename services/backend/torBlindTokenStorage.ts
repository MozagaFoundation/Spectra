/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import * as SecureStore from 'expo-secure-store'

import { SECURE_STORE_OPTIONS, STORAGE_KEYS } from '@/lib/constants'
import { isSameAccountStorageScope } from '@/lib/accountScope'
import type {
  AccountBlindTokenPurpose,
  SpectreBlindActivationToken,
} from '@spectra/privacy-protocol'

const PENDING_SPECTRE_BLIND_TOKEN_KEY = STORAGE_KEYS.PENDING_SPECTRE_BLIND_TOKEN
const ACCOUNT_BLIND_TOKEN_DOMAIN_PREFIX = 'spectra.mobile.account-ticket.v1'

export interface StoredSpectreBlindActivationToken extends SpectreBlindActivationToken {
  issuedAt: string
  nextAvailableAt: string
}

interface StoredSpectreBlindActivationTokenBucket {
  version: 1
  tokens: StoredSpectreBlindActivationToken[]
}

export interface StoredSpectreBlindTokenMatch {
  walletAddress?: string | null
  purpose?: AccountBlindTokenPurpose
  isEphemeral?: boolean
}

function normalizeNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function normalizeBlindAlgorithm(value: unknown): 'rsa-fdh-v1' {
  return value === 'rsa-fdh-v1' ? 'rsa-fdh-v1' : 'rsa-fdh-v1'
}

function normalizeAccountBlindTokenPurpose(value: unknown): AccountBlindTokenPurpose | null {
  switch (value) {
    case 'spectre_ephemeral':
      return value
    default:
      return null
  }
}

function domainForAccountBlindTokenPurpose(purpose: AccountBlindTokenPurpose): string {
  return `${ACCOUNT_BLIND_TOKEN_DOMAIN_PREFIX}.${purpose}`
}

function normalizeStoredBlindToken(value: unknown): StoredSpectreBlindActivationToken | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const record = value as Partial<StoredSpectreBlindActivationToken>
  const keyId = normalizeNullableString(record.keyId)
  const walletAddress = normalizeNullableString(record.walletAddress)
  const nullifierHex = normalizeNullableString(record.nullifierHex)
  const signatureHex = normalizeNullableString(record.signatureHex)
  const issuedAt = normalizeNullableString(record.issuedAt)
  const nextAvailableAt = normalizeNullableString(record.nextAvailableAt)
  const purpose = normalizeAccountBlindTokenPurpose(record.purpose)

  if (!keyId || !purpose || !walletAddress || !nullifierHex || !signatureHex || !issuedAt || !nextAvailableAt) {
    return null
  }

  const domain = normalizeNullableString(record.domain) ?? domainForAccountBlindTokenPurpose(purpose)
  if (domain !== domainForAccountBlindTokenPurpose(purpose)) {
    return null
  }

  return {
    algorithm: normalizeBlindAlgorithm(record.algorithm),
    domain,
    keyId,
    purpose,
    walletAddress,
    isEphemeral: true,
    nullifierHex,
    signatureHex,
    issuedAt,
    nextAvailableAt,
  }
}

function normalizeStoredBlindTokenBucket(value: unknown): StoredSpectreBlindActivationToken[] {
  if (!value || typeof value !== 'object') {
    return []
  }

  const record = value as Partial<StoredSpectreBlindActivationTokenBucket>
  if (record.version !== 1 || !Array.isArray(record.tokens)) {
    return []
  }

  return record.tokens.flatMap((entry) => {
    const token = normalizeStoredBlindToken(entry)
    return token ? [token] : []
  })
}

function matchesStoredBlindToken(
  token: StoredSpectreBlindActivationToken,
  match?: StoredSpectreBlindTokenMatch,
): boolean {
  if (!match) {
    return true
  }

  if (match.walletAddress && !isSameAccountStorageScope(token.walletAddress, match.walletAddress)) {
    return false
  }

  if (match.purpose && token.purpose !== match.purpose) {
    return false
  }

  if (typeof match.isEphemeral === 'boolean' && token.isEphemeral !== match.isEphemeral) {
    return false
  }

  return true
}

async function readStoredBlindTokens(): Promise<StoredSpectreBlindActivationToken[]> {
  const raw = await SecureStore.getItemAsync(PENDING_SPECTRE_BLIND_TOKEN_KEY, SECURE_STORE_OPTIONS)
  if (!raw) {
    return []
  }

  try {
    const tokens = normalizeStoredBlindTokenBucket(JSON.parse(raw))
    if (tokens.length === 0) {
      await SecureStore.deleteItemAsync(PENDING_SPECTRE_BLIND_TOKEN_KEY, SECURE_STORE_OPTIONS)
    }
    return tokens
  } catch {
    await SecureStore.deleteItemAsync(PENDING_SPECTRE_BLIND_TOKEN_KEY, SECURE_STORE_OPTIONS).catch(() => {})
    return []
  }
}

async function persistStoredBlindTokens(tokens: StoredSpectreBlindActivationToken[]): Promise<void> {
  if (tokens.length === 0) {
    await SecureStore.deleteItemAsync(PENDING_SPECTRE_BLIND_TOKEN_KEY, SECURE_STORE_OPTIONS)
    return
  }

  await SecureStore.setItemAsync(
    PENDING_SPECTRE_BLIND_TOKEN_KEY,
    JSON.stringify({ version: 1, tokens } satisfies StoredSpectreBlindActivationTokenBucket),
    SECURE_STORE_OPTIONS,
  )
}

export async function readStoredBlindToken(
  match?: StoredSpectreBlindTokenMatch,
): Promise<StoredSpectreBlindActivationToken | null> {
  const tokens = await readStoredBlindTokens()
  return tokens.find((token) => matchesStoredBlindToken(token, match)) ?? null
}

export async function persistStoredBlindToken(
  token: StoredSpectreBlindActivationToken | null,
): Promise<void> {
  if (!token) {
    await persistStoredBlindTokens([])
    return
  }

  const tokens = await readStoredBlindTokens()
  const nextTokens = tokens.filter((entry) => !matchesStoredBlindToken(entry, {
    walletAddress: token.walletAddress,
    purpose: token.purpose,
    isEphemeral: token.isEphemeral,
  }))
  nextTokens.push(token)
  await persistStoredBlindTokens(nextTokens)
}

export async function removeStoredBlindTokens(
  match?: StoredSpectreBlindTokenMatch,
): Promise<void> {
  if (!match) {
    await persistStoredBlindTokens([])
    return
  }

  const tokens = await readStoredBlindTokens()
  await persistStoredBlindTokens(tokens.filter((token) => !matchesStoredBlindToken(token, match)))
}
