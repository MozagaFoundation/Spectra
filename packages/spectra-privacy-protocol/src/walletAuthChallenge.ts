/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

const WALLET_AUTH_CHALLENGE_PURPOSE = 'EXO wallet auth'
const WALLET_AUTH_CHALLENGE_VERSION = '1'

const EXO_ADDRESS_PATTERN = /^exo00[0-9a-f]{38}$/i
const CANONICAL_EXO_ADDRESS_PATTERN = /^EXO00[0-9a-f]{38}$/
const NONCE_HEX_PATTERN = /^[0-9a-f]{64}$/i
const PUBLIC_KEY_PATTERN = /^0x[0-9a-f]{3904}$/i
const SIGNATURE_PATTERN = /^0x[0-9a-f]{6618}$/i
const WALLET_AUTH_FIELDS = new Set(['version', 'uid', 'wallet', 'nonce', 'expires_at'])

export interface ParsedWalletAuthChallenge {
  version: string
  userId: string
  walletAddress: string
  nonce: string
  expiresAt: string
}

export function isValidWalletAddress(walletAddress: string): boolean {
  return EXO_ADDRESS_PATTERN.test(walletAddress)
}

export function isValidWalletPublicKey(publicKey: string): boolean {
  return PUBLIC_KEY_PATTERN.test(publicKey)
}

export function isValidWalletSignature(signature: string): boolean {
  return SIGNATURE_PATTERN.test(signature)
}

export function normalizeWalletAuthAddress(walletAddress: string): string {
  const trimmed = walletAddress.trim()
  if (!isValidWalletAddress(trimmed)) {
    throw new Error('Invalid wallet address')
  }
  return `EXO00${trimmed.slice(5).toLowerCase()}`
}

function normalizeNonceHex(nonceHex: string): string {
  const normalized = nonceHex.trim().toLowerCase()
  if (!NONCE_HEX_PATTERN.test(normalized)) {
    throw new Error('Wallet auth nonce must be 32 bytes of hexadecimal entropy')
  }
  return normalized
}

function assertChallengeFieldValue(name: string, value: string): string {
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.includes('\n') || trimmed.includes('\r')) {
    throw new Error(`Invalid wallet auth challenge ${name}`)
  }
  return trimmed
}

export function buildWalletAuthChallenge(params: {
  userId: string
  walletAddress: string
  nonceHex: string
  expiresAt: Date | string
}): string {
  const userId = assertChallengeFieldValue('user id', params.userId)
  const expiresAt = typeof params.expiresAt === 'string'
    ? params.expiresAt
    : params.expiresAt.toISOString()
  if (!Number.isFinite(Date.parse(expiresAt))) {
    throw new Error('Invalid wallet auth challenge expiration')
  }

  return [
    WALLET_AUTH_CHALLENGE_PURPOSE,
    `version:${WALLET_AUTH_CHALLENGE_VERSION}`,
    `uid:${userId}`,
    `wallet:${normalizeWalletAuthAddress(params.walletAddress)}`,
    `nonce:${normalizeNonceHex(params.nonceHex)}`,
    `expires_at:${expiresAt}`,
  ].join('\n')
}

export function parseWalletAuthChallenge(challenge: string): ParsedWalletAuthChallenge | null {
  const [purpose, ...fields] = challenge.split('\n')
  if (purpose !== WALLET_AUTH_CHALLENGE_PURPOSE) {
    return null
  }

  const parsed = new Map<string, string>()
  for (const field of fields) {
    const separatorIndex = field.indexOf(':')
    if (separatorIndex <= 0) {
      return null
    }

    const key = field.slice(0, separatorIndex)
    const value = field.slice(separatorIndex + 1)
    if (!WALLET_AUTH_FIELDS.has(key) || parsed.has(key)) {
      return null
    }

    parsed.set(key, value)
  }

  const version = parsed.get('version')
  const userId = parsed.get('uid')
  const walletAddress = parsed.get('wallet')
  const nonce = parsed.get('nonce')
  const expiresAt = parsed.get('expires_at')

  if (!version || !userId || !walletAddress || !nonce || !expiresAt) {
    return null
  }

  if (
    version !== WALLET_AUTH_CHALLENGE_VERSION
    || !CANONICAL_EXO_ADDRESS_PATTERN.test(walletAddress)
    || !NONCE_HEX_PATTERN.test(nonce)
    || !Number.isFinite(Date.parse(expiresAt))
  ) {
    return null
  }

  return { version, userId, walletAddress, nonce: nonce.toLowerCase(), expiresAt }
}
