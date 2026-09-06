/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 */

import { sha256 } from '@noble/hashes/sha256'

export const WALLET_INDEX_ACTIVATION_VERSION = 1 as const
export const WALLET_INDEX_ACTIVATION_SIGNING_DOMAIN =
  'spectra.wallet-index-activation.v1'

const SUPPORTED_CHAINS = ['mozaga', 'ethereum', 'bitcoin', 'solana', 'tron'] as const
const encoder = new TextEncoder()

export type WalletIndexChain = (typeof SUPPORTED_CHAINS)[number]

export interface WalletIndexActivationRequest {
  activationId: string
  ownerWalletAddress: string
  chain: WalletIndexChain
  address: string
  nonceHex: string
  expiresAt: number
}

export interface WalletIndexAddressProof {
  algorithm: 'mldsa65' | 'secp256k1' | 'ed25519'
  publicKeyHex: string
  signatureHex: string
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function assertSafeText(value: string, name: string, maxLength: number): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maxLength ||
    value !== value.trim() ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new Error(`Invalid wallet index activation ${name}`)
  }
  return value
}

function assertHex(value: string, name: string, minLength: number, maxLength: number): string {
  const normalized = assertSafeText(value, name, maxLength).toLowerCase().replace(/^0x/, '')
  if (
    normalized.length < minLength ||
    normalized.length % 2 !== 0 ||
    !/^[0-9a-f]+$/.test(normalized)
  ) {
    throw new Error(`Invalid wallet index activation ${name}`)
  }
  return normalized
}

function assertRequest(input: WalletIndexActivationRequest): Required<WalletIndexActivationRequest> {
  if (!SUPPORTED_CHAINS.includes(input.chain)) {
    throw new Error('Unsupported wallet index activation chain')
  }
  if (!/^wia1\.[0-9a-f]{32}$/.test(input.activationId)) {
    throw new Error('Invalid wallet index activation identifier')
  }
  if (!/^[0-9a-f]{64}$/.test(input.nonceHex)) {
    throw new Error('Invalid wallet index activation nonce')
  }
  if (!Number.isSafeInteger(input.expiresAt) || input.expiresAt <= 0) {
    throw new Error('Invalid wallet index activation expiry')
  }

  return {
    activationId: input.activationId,
    ownerWalletAddress: assertSafeText(input.ownerWalletAddress, 'owner wallet address', 160),
    chain: input.chain,
    address: assertSafeText(input.address, 'address', 160),
    nonceHex: input.nonceHex,
    expiresAt: input.expiresAt,
  }
}

export function isWalletIndexChain(value: unknown): value is WalletIndexChain {
  return typeof value === 'string' && SUPPORTED_CHAINS.includes(value as WalletIndexChain)
}

export function buildWalletIndexActivationSigningMessage(
  input: WalletIndexActivationRequest,
): string {
  const request = assertRequest(input)
  return [
    WALLET_INDEX_ACTIVATION_SIGNING_DOMAIN,
    `version=${WALLET_INDEX_ACTIVATION_VERSION}`,
    `activation_id=${request.activationId}`,
    `owner_wallet_address=${request.ownerWalletAddress}`,
    `chain=${request.chain}`,
    `address=${request.address}`,
    `nonce=${request.nonceHex}`,
    `expires_at=${request.expiresAt}`,
  ].join('\n')
}

export function hashWalletIndexActivationBinding(
  input: WalletIndexActivationRequest,
  proof: WalletIndexAddressProof,
): string {
  const publicKeyHex = assertHex(proof.publicKeyHex, 'public key', 64, 8_000)
  const signatureHex = assertHex(proof.signatureHex, 'signature', 128, 8_000)
  if (
    (proof.algorithm === 'mldsa65' && (publicKeyHex.length !== 3_904 || signatureHex.length !== 6_618)) ||
    (proof.algorithm === 'secp256k1' && ![66, 130].includes(publicKeyHex.length)) ||
    (proof.algorithm === 'ed25519' && (publicKeyHex.length !== 64 || signatureHex.length !== 128)) ||
    !['mldsa65', 'secp256k1', 'ed25519'].includes(proof.algorithm)
  ) {
    throw new Error('Invalid wallet index address proof')
  }

  const binding = [
    'spectra.wallet-index-vdf-binding.v1',
    buildWalletIndexActivationSigningMessage(input),
    `algorithm=${proof.algorithm}`,
    `public_key=${publicKeyHex}`,
    `signature=${signatureHex}`,
  ].join('\n')
  return bytesToHex(sha256(encoder.encode(binding)))
}
