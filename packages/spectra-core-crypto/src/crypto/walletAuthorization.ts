/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { keccak_256 } from '@noble/hashes/sha3'

import type {
  PublicKeyBundle,
  WalletBundleAuthorization,
  WalletBundleAuthorizationPayload,
} from '../types/index'
import { signWithDilithium, verifyDilithiumSignature, verifyDilithiumSignatureAsync } from './dilithium'
import { canonicalJsonStringify } from './canonicalJson'
import { bytesToHex, hexToBytes, stringToBytes } from './utils'

export const WALLET_BUNDLE_AUTHORIZATION_PURPOSE = 'Spectra chat identity authorization' as const

const WALLET_AUTHORIZATION_VERSION = 1 as const
const EXO_ADDRESS_PATTERN = /^EXO00[0-9a-f]{38}$/

export interface WalletBundleAuthorizationVerification {
  valid: boolean
  error?: string
}

function normalizeWalletAddress(walletAddress: string): string {
  const trimmed = walletAddress.trim()
  const normalized = /^EXO00/i.test(trimmed)
    ? `EXO00${trimmed.slice(5).toLowerCase()}`
    : trimmed
  if (!EXO_ADDRESS_PATTERN.test(normalized)) {
    throw new Error('Invalid EXO wallet address')
  }
  return normalized
}

export function deriveExoAddressFromWalletPublicKey(publicKeyHex: string): string {
  const publicKey = hexToBytes(publicKeyHex)
  const hash = keccak_256(publicKey)
  const addressBytes = new Uint8Array(20)
  addressBytes[0] = 0x00
  addressBytes.set(hash.slice(-19), 1)
  return `EXO${bytesToHex(addressBytes).slice(2)}`
}

function assertBundleSignature(bundle: PublicKeyBundle): string {
  if (!bundle.bundleSignature) {
    throw new Error('Bundle signature is required for wallet authorization')
  }
  return bundle.bundleSignature
}

export function buildWalletBundleAuthorizationPayload(
  bundle: PublicKeyBundle,
  walletAddress: string,
  walletPublicKey: string,
  signedAt: number,
): WalletBundleAuthorizationPayload {
  return {
    purpose: WALLET_BUNDLE_AUTHORIZATION_PURPOSE,
    version: WALLET_AUTHORIZATION_VERSION,
    walletAddress: normalizeWalletAddress(walletAddress),
    walletPublicKey,
    identityId: bundle.identityId,
    identityKey: bundle.identityKey,
    mlkemIdentityKey: bundle.mlkemIdentityKey,
    dilithiumKey: bundle.dilithiumKey,
    signedPreKey: bundle.signedPreKey,
    bundleSignature: assertBundleSignature(bundle),
    bundleVersion: bundle.version,
    bundleTimestamp: bundle.timestamp,
    signedAt,
  }
}

export function signPublicKeyBundleWalletAuthorization(
  bundle: PublicKeyBundle,
  walletAddress: string,
  walletPublicKey: string,
  walletPrivateKey: string,
  signedAt: number = Date.now(),
): WalletBundleAuthorization {
  const payload = buildWalletBundleAuthorizationPayload(bundle, walletAddress, walletPublicKey, signedAt)
  const signature = signWithDilithium(
    stringToBytes(canonicalJsonStringify(payload)),
    walletPrivateKey,
  )
  return { payload, signature }
}

function payloadMatchesBundle(
  payload: WalletBundleAuthorizationPayload,
  bundle: PublicKeyBundle,
  expectedWalletAddress?: string,
): string | null {
  if (payload.purpose !== WALLET_BUNDLE_AUTHORIZATION_PURPOSE) return 'Invalid wallet authorization purpose'
  if (payload.version !== WALLET_AUTHORIZATION_VERSION) return 'Unsupported wallet authorization version'
  if (expectedWalletAddress && payload.walletAddress !== normalizeWalletAddress(expectedWalletAddress)) {
    return 'Wallet authorization address does not match expected wallet'
  }
  if (payload.identityId !== bundle.identityId) return 'Wallet authorization identity ID mismatch'
  if (payload.identityKey !== bundle.identityKey) return 'Wallet authorization X25519 identity key mismatch'
  if (payload.mlkemIdentityKey !== bundle.mlkemIdentityKey) return 'Wallet authorization ML-KEM identity key mismatch'
  if (payload.dilithiumKey !== bundle.dilithiumKey) return 'Wallet authorization ML-DSA key mismatch'
  if (payload.bundleSignature !== bundle.bundleSignature) return 'Wallet authorization bundle signature mismatch'
  if (payload.bundleVersion !== bundle.version) return 'Wallet authorization bundle version mismatch'
  if (payload.bundleTimestamp !== bundle.timestamp) return 'Wallet authorization bundle timestamp mismatch'
  if (canonicalJsonStringify(payload.signedPreKey) !== canonicalJsonStringify(bundle.signedPreKey)) {
    return 'Wallet authorization signed pre-key mismatch'
  }
  return null
}

export function verifyPublicKeyBundleWalletAuthorization(
  bundle: PublicKeyBundle,
  expectedWalletAddress?: string,
): WalletBundleAuthorizationVerification {
  const prepared = prepareWalletAuthorizationVerification(bundle, expectedWalletAddress)
  if (!prepared.ok) return prepared.result
  try {
    const signatureValid = verifyDilithiumSignature(
      stringToBytes(canonicalJsonStringify(prepared.authorization.payload)),
      prepared.authorization.signature,
      prepared.authorization.payload.walletPublicKey,
    )
    if (!signatureValid) {
      return { valid: false, error: 'Wallet authorization signature verification failed' }
    }
    return { valid: true }
  } catch (error) {
    return { valid: false, error: (error as Error).message }
  }
}

export async function verifyPublicKeyBundleWalletAuthorizationAsync(
  bundle: PublicKeyBundle,
  expectedWalletAddress?: string,
): Promise<WalletBundleAuthorizationVerification> {
  const prepared = prepareWalletAuthorizationVerification(bundle, expectedWalletAddress)
  if (!prepared.ok) return prepared.result
  try {
    const signatureValid = await verifyDilithiumSignatureAsync(
      stringToBytes(canonicalJsonStringify(prepared.authorization.payload)),
      prepared.authorization.signature,
      prepared.authorization.payload.walletPublicKey,
    )
    if (!signatureValid) {
      return { valid: false, error: 'Wallet authorization signature verification failed' }
    }
    return { valid: true }
  } catch (error) {
    return { valid: false, error: (error as Error).message }
  }
}

function prepareWalletAuthorizationVerification(
  bundle: PublicKeyBundle,
  expectedWalletAddress?: string,
): (
  | { ok: true; authorization: NonNullable<PublicKeyBundle['walletAuthorization']> }
  | { ok: false; result: WalletBundleAuthorizationVerification }
) {
  try {
    const normalizedExpectedWalletAddress = expectedWalletAddress
      ? normalizeWalletAddress(expectedWalletAddress)
      : undefined
    const authorization = bundle.walletAuthorization
    if (!authorization) {
      return { ok: false, result: { valid: false, error: 'Bundle is missing wallet authorization' } }
    }
    const mismatch = payloadMatchesBundle(authorization.payload, bundle, normalizedExpectedWalletAddress)
    if (mismatch) {
      return { ok: false, result: { valid: false, error: mismatch } }
    }
    const derivedAddress = deriveExoAddressFromWalletPublicKey(authorization.payload.walletPublicKey)
    if (derivedAddress !== authorization.payload.walletAddress) {
      return {
        ok: false,
        result: { valid: false, error: 'Wallet public key does not derive authorized wallet address' },
      }
    }
    return { ok: true, authorization }
  } catch (error) {
    return { ok: false, result: { valid: false, error: (error as Error).message } }
  }
}
