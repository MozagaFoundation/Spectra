/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

/**
 * Hybrid Post-Quantum X3DH Key Exchange (X25519 + ML-KEM)
 * 
 * Implements an X3DH-like initial key-establishment protocol
 * using a hybrid approach that combines:
 * - X25519 (classical ECDH)
 * - ML-KEM-768 (post-quantum KEM)
 * 
 * The shared secret is derived from both components. Its intended hybrid
 * robustness property is an engineering goal of this composition, not a
 * formal proof.
 * 
 * Enhanced with:
 * - ML-DSA-65 signatures for post-quantum authentication
 * - ML-KEM for post-quantum key encapsulation
 * - Hybrid key derivation for defense-in-depth
 * - Bundle freshness validation
 * - Pre-key rotation support
 */

import type { 
  PublicKeyBundle, 
  HybridPreKey, 
  SignedPreKey,
  PrivateKeyBundle
} from '../types/index'
import { CryptoError, BundleError } from '../types/index'
import { generateX25519KeyPair, x25519DH, isValidX25519PublicKey } from './x25519'
import { generateMLKEMKeyPair, encapsulateAsync as mlkemEncapsulateAsync, decapsulateAsync as mlkemDecapsulateAsync, isValidMLKEMPublicKey, generateMLKEMKeyPairAsync } from './mlkem'
import {
  signWithDilithium as dilithiumSign,
  signWithDilithiumAsync as dilithiumSignAsync,
  verifyDilithiumSignature as dilithiumVerify,
  verifyDilithiumSignatureAsync as dilithiumVerifyAsync,
  isValidPublicKey as isValidDilithiumPublicKey,
} from './dilithium'
import { canonicalJsonStringify } from './canonicalJson'
import { PROTOCOL_VERSIONS, assertExactVersion } from './protocolVersion'
import { attachBundleMetadataCapabilities, attachBundleMetadataCapabilitiesAsync, verifyBundleMetadataCapabilities, verifyBundleMetadataCapabilitiesAsync } from './bundleCapabilities'
import { 
  deriveKey, 
  concatBytes, 
  stringToBytes, 
  bytesToBase64, 
  base64ToBytes,
  generateRandomInt,
  hash,
  now,
  isExpired,
  createSessionFingerprint,
  int32ToLittleEndianBytes,
  int64ToLittleEndianBytes
} from './utils'

// Protocol constants
const X3DH_INFO = 'QuantumChat_HybridX3DH_v2'
const SHARED_SECRET_LENGTH = 32
const DEFAULT_SIGNED_PREKEY_ROTATION = 2 * 24 * 60 * 60 * 1000
const PREVIOUS_SIGNED_PREKEY_RETENTION = 30 * 24 * 60 * 60 * 1000
export const STARTUP_PREKEY_COUNT = 20
export const TARGET_PREKEY_COUNT = 100
export const OPK_GENERATE_YIELD_EVERY = 4
const DEFAULT_PREKEY_COUNT = STARTUP_PREKEY_COUNT

// Key Bundle Generation

/**
 * Generate a hybrid signed pre-key with an ML-DSA-65 signature.
 * Creates both X25519 and ML-KEM key pairs
 */
export async function generateSignedPreKeyAsync(
  dilithiumPrivateKey: string,
  keyId: number,
  rotationIntervalMs: number = DEFAULT_SIGNED_PREKEY_ROTATION
): Promise<{ signedPreKey: SignedPreKey; x25519PrivateKey: string; mlkemPrivateKey: string }> {
  const x25519KeyPair = generateX25519KeyPair()
  const mlkemKeyPair = await generateMLKEMKeyPairAsync()
  const timestamp = now()
  const x25519PublicKeyBytes = base64ToBytes(x25519KeyPair.publicKey)
  const mlkemPublicKeyBytes = base64ToBytes(mlkemKeyPair.publicKey)
  const timestampBytes = int64ToLittleEndianBytes(timestamp)
  const dataToSign = concatBytes(x25519PublicKeyBytes, mlkemPublicKeyBytes, timestampBytes)
  const signature = await dilithiumSignAsync(dataToSign, dilithiumPrivateKey)

  return {
    signedPreKey: {
      id: keyId,
      x25519PublicKey: x25519KeyPair.publicKey,
      mlkemPublicKey: mlkemKeyPair.publicKey,
      signature,
      timestamp,
      expiresAt: timestamp + rotationIntervalMs
    },
    x25519PrivateKey: x25519KeyPair.privateKey,
    mlkemPrivateKey: mlkemKeyPair.privateKey
  }
}

export function generateSignedPreKey(
  dilithiumPrivateKey: string,
  keyId: number,
  rotationIntervalMs: number = DEFAULT_SIGNED_PREKEY_ROTATION
): { signedPreKey: SignedPreKey; x25519PrivateKey: string; mlkemPrivateKey: string } {
  // Generate X25519 key pair
  const x25519KeyPair = generateX25519KeyPair()
  
  // Generate ML-KEM key pair
  const mlkemKeyPair = generateMLKEMKeyPair()
  
  const timestamp = now()
  
  // Sign both public keys with ML-DSA-65 for post-quantum authentication
  // Include timestamp in signature to prevent replay
  const x25519PublicKeyBytes = base64ToBytes(x25519KeyPair.publicKey)
  const mlkemPublicKeyBytes = base64ToBytes(mlkemKeyPair.publicKey)
  const timestampBytes = int64ToLittleEndianBytes(timestamp)
  const dataToSign = concatBytes(x25519PublicKeyBytes, mlkemPublicKeyBytes, timestampBytes)
  const signature = dilithiumSign(dataToSign, dilithiumPrivateKey)
  
  return {
    signedPreKey: {
      id: keyId,
      x25519PublicKey: x25519KeyPair.publicKey,
      mlkemPublicKey: mlkemKeyPair.publicKey,
      signature,
      timestamp,
      expiresAt: timestamp + rotationIntervalMs
    },
    x25519PrivateKey: x25519KeyPair.privateKey,
    mlkemPrivateKey: mlkemKeyPair.privateKey
  }
}

/**
 * Generate hybrid one-time pre-keys.
 *
 * OPKs are transcript-bound during X3DH but are not individually signed.
 */
export function generateOneTimePreKeys(
  startId: number,
  count: number
): { 
  preKeys: HybridPreKey[]
  x25519PrivateKeys: Map<number, string>
  mlkemPrivateKeys: Map<number, string>
} {
  const preKeys: HybridPreKey[] = []
  const x25519PrivateKeys = new Map<number, string>()
  const mlkemPrivateKeys = new Map<number, string>()
  
  for (let i = 0; i < count; i++) {
    const keyId = startId + i
    
    // Generate X25519 key pair
    const x25519KeyPair = generateX25519KeyPair()
    
    // Generate ML-KEM key pair
    const mlkemKeyPair = generateMLKEMKeyPair()
    
    preKeys.push({
      id: keyId,
      x25519PublicKey: x25519KeyPair.publicKey,
      mlkemPublicKey: mlkemKeyPair.publicKey
    })
    
    x25519PrivateKeys.set(keyId, x25519KeyPair.privateKey)
    mlkemPrivateKeys.set(keyId, mlkemKeyPair.privateKey)
  }
  
  return { preKeys, x25519PrivateKeys, mlkemPrivateKeys }
}

export type GeneratedOneTimePreKeys = ReturnType<typeof generateOneTimePreKeys>

export async function generateOneTimePreKeysAsync(
  startId: number,
  count: number,
  yieldToHost?: () => Promise<void>,
): Promise<GeneratedOneTimePreKeys> {
  if (count <= 0) {
    return { preKeys: [], x25519PrivateKeys: new Map(), mlkemPrivateKeys: new Map() }
  }

  const preKeys: HybridPreKey[] = []
  const x25519PrivateKeys = new Map<number, string>()
  const mlkemPrivateKeys = new Map<number, string>()
  for (let i = 0; i < count; i++) {
    const keyId = startId + i
    const x25519KeyPair = generateX25519KeyPair()
    const mlkemKeyPair = await generateMLKEMKeyPairAsync()
    preKeys.push({
      id: keyId,
      x25519PublicKey: x25519KeyPair.publicKey,
      mlkemPublicKey: mlkemKeyPair.publicKey,
    })
    x25519PrivateKeys.set(keyId, x25519KeyPair.privateKey)
    mlkemPrivateKeys.set(keyId, mlkemKeyPair.privateKey)
    if (yieldToHost && (i + 1) % OPK_GENERATE_YIELD_EVERY === 0 && i + 1 < count) {
      await yieldToHost()
    }
  }
  return { preKeys, x25519PrivateKeys, mlkemPrivateKeys }
}

/**
 * Create a complete hybrid public key bundle for publishing
 * 
 * SIGNED components (covered by bundleSignature):
 * - identityId, identityKey, mlkemIdentityKey, dilithiumKey
 * - signedPreKey (which has its own signature)
 * - version, timestamp
 * 
 * TRANSCRIPT-BOUND components (NOT in bundleSignature):
 * - oneTimePreKeys - consumed by the server and bound into X3DH when used.
 * 
 * This design allows the server to atomically allocate and remove OPKs
 * without invalidating the bundle signature.
 */
export function createPublicKeyBundle(
  identityId: string,
  identityPublicKey: string,
  dilithiumPublicKey: string,
  dilithiumPrivateKey: string,
  identityPrivateKey: string,
  mlkemIdentityKeyPair: { publicKey: string; privateKey: string },
  preKeyCount: number = DEFAULT_PREKEY_COUNT,
  generatedOneTimePreKeys?: GeneratedOneTimePreKeys,
): { bundle: PublicKeyBundle; privateBundle: PrivateKeyBundle; identityPrivateKey: string; mlkemIdentityPrivateKey: string } {
  const x25519IdentityKeyPair = { publicKey: identityPublicKey, privateKey: identityPrivateKey }
  const mlkemKeys = mlkemIdentityKeyPair
  
  // Generate hybrid signed pre-key (this is signed by ML-DSA-65).
  const { signedPreKey, x25519PrivateKey: signedPreKeyPrivate, mlkemPrivateKey: mlkemSignedPreKeyPrivate } = generateSignedPreKey(
    dilithiumPrivateKey,
    1
  )
  
  // Generate hybrid one-time pre-keys; these are not covered by the bundle signature.
  const { preKeys, x25519PrivateKeys, mlkemPrivateKeys } = generatedOneTimePreKeys ?? generateOneTimePreKeys(
    1,
    preKeyCount
  )
  
  const timestamp = now()
  
  // Sign only the static parts so OPKs can be allocated without invalidating
  // the bundle signature.
  const signableBundleData = {
    identityId,
    identityKey: x25519IdentityKeyPair.publicKey,
    mlkemIdentityKey: mlkemKeys.publicKey,
    dilithiumKey: dilithiumPublicKey,
    signedPreKey,
    version: 1,
    timestamp
  }
  
  // Sign only the static parts (excludes oneTimePreKeys)
  // Canonical JSON keeps signature input stable across serialization.
  const signableJson = canonicalJsonStringify(signableBundleData)
  const bundleBytes = stringToBytes(signableJson)
  const bundleSignature = dilithiumSign(bundleBytes, dilithiumPrivateKey)
  
  // Create full bundle with OPKs (but signature doesn't cover them)
  const bundle: PublicKeyBundle = attachBundleMetadataCapabilities({
    identityId,
    identityKey: x25519IdentityKeyPair.publicKey,
    mlkemIdentityKey: mlkemKeys.publicKey,
    dilithiumKey: dilithiumPublicKey,
    signedPreKey,
    oneTimePreKeys: preKeys,
    version: 1,
    timestamp,
    bundleSignature
  }, dilithiumPrivateKey, timestamp)
  
  const privateBundle: PrivateKeyBundle = {
    identityPrivateKey: x25519IdentityKeyPair.privateKey,
    mlkemIdentityPrivateKey: mlkemKeys.privateKey,
    dilithiumPrivateKey,
    signedPreKeyPrivate,
    mlkemSignedPreKeyPrivate,
    oneTimePreKeyPrivates: x25519PrivateKeys,
    mlkemOneTimePreKeyPrivates: mlkemPrivateKeys,
    nextPreKeyId: preKeys.length + 1,
    signedPreKeyRotatedAt: timestamp
  }
  
  return { 
    bundle, 
    privateBundle, 
    identityPrivateKey: x25519IdentityKeyPair.privateKey,
    mlkemIdentityPrivateKey: mlkemKeys.privateKey
  }
}

export async function createPublicKeyBundleAsync(
  identityId: string,
  identityPublicKey: string,
  dilithiumPublicKey: string,
  dilithiumPrivateKey: string,
  identityPrivateKey: string,
  mlkemIdentityKeyPair: { publicKey: string; privateKey: string },
  preKeyCount: number = DEFAULT_PREKEY_COUNT,
  yieldToHost?: () => Promise<void>,
): Promise<{ bundle: PublicKeyBundle; privateBundle: PrivateKeyBundle; identityPrivateKey: string; mlkemIdentityPrivateKey: string }> {
  const generatedOneTimePreKeys = await generateOneTimePreKeysAsync(1, preKeyCount, yieldToHost)
  const x25519IdentityKeyPair = { publicKey: identityPublicKey, privateKey: identityPrivateKey }
  const { signedPreKey, x25519PrivateKey: signedPreKeyPrivate, mlkemPrivateKey: mlkemSignedPreKeyPrivate } = await generateSignedPreKeyAsync(
    dilithiumPrivateKey,
    1
  )
  const { preKeys, x25519PrivateKeys, mlkemPrivateKeys } = generatedOneTimePreKeys
  const timestamp = now()
  const signableBundleData = {
    identityId,
    identityKey: x25519IdentityKeyPair.publicKey,
    mlkemIdentityKey: mlkemIdentityKeyPair.publicKey,
    dilithiumKey: dilithiumPublicKey,
    signedPreKey,
    version: 1,
    timestamp
  }
  const bundleBytes = stringToBytes(canonicalJsonStringify(signableBundleData))
  const bundleSignature = await dilithiumSignAsync(bundleBytes, dilithiumPrivateKey)
  const bundle: PublicKeyBundle = await attachBundleMetadataCapabilitiesAsync({
    identityId,
    identityKey: x25519IdentityKeyPair.publicKey,
    mlkemIdentityKey: mlkemIdentityKeyPair.publicKey,
    dilithiumKey: dilithiumPublicKey,
    signedPreKey,
    oneTimePreKeys: preKeys,
    version: 1,
    timestamp,
    bundleSignature
  }, dilithiumPrivateKey, timestamp)

  const privateBundle: PrivateKeyBundle = {
    identityPrivateKey: x25519IdentityKeyPair.privateKey,
    mlkemIdentityPrivateKey: mlkemIdentityKeyPair.privateKey,
    dilithiumPrivateKey,
    signedPreKeyPrivate,
    mlkemSignedPreKeyPrivate,
    oneTimePreKeyPrivates: x25519PrivateKeys,
    mlkemOneTimePreKeyPrivates: mlkemPrivateKeys,
    nextPreKeyId: preKeys.length + 1,
    signedPreKeyRotatedAt: timestamp
  }

  return {
    bundle,
    privateBundle,
    identityPrivateKey: x25519IdentityKeyPair.privateKey,
    mlkemIdentityPrivateKey: mlkemIdentityKeyPair.privateKey
  }
}

// Key Bundle Verification

/**
 * Verify a hybrid signed pre-key signature
 * 
 * The signed pre-key (SPK) is signed by the ML-DSA-65 identity key.
 * 
 * The signature covers: SPK public keys (X25519 + ML-KEM) + timestamp
 * This proves the SPK belongs to the identity that controls the ML-DSA-65 key.
 */
export function verifySignedPreKey(
  signedPreKey: SignedPreKey,
  dilithiumPublicKey: string
): boolean {
  const x25519PublicKeyBytes = base64ToBytes(signedPreKey.x25519PublicKey)
  const mlkemPublicKeyBytes = base64ToBytes(signedPreKey.mlkemPublicKey)
  const timestampBytes = int64ToLittleEndianBytes(signedPreKey.timestamp)
  const dataToVerify = concatBytes(x25519PublicKeyBytes, mlkemPublicKeyBytes, timestampBytes)
  return dilithiumVerify(dataToVerify, signedPreKey.signature, dilithiumPublicKey)
}

async function verifySignedPreKeyAsync(
  signedPreKey: SignedPreKey,
  dilithiumPublicKey: string
): Promise<boolean> {
  const x25519PublicKeyBytes = base64ToBytes(signedPreKey.x25519PublicKey)
  const mlkemPublicKeyBytes = base64ToBytes(signedPreKey.mlkemPublicKey)
  const timestampBytes = int64ToLittleEndianBytes(signedPreKey.timestamp)
  const dataToVerify = concatBytes(x25519PublicKeyBytes, mlkemPublicKeyBytes, timestampBytes)
  return dilithiumVerifyAsync(dataToVerify, signedPreKey.signature, dilithiumPublicKey)
}

/**
 * Verify an entire hybrid public key bundle
 * 
 * Verification checks cryptographic validity (signatures, key formats) but
 * does not reject bundles based on age.
 * Freshness is enforced via proactive rotation on the owner's side,
 * not by the recipient refusing to use an older bundle.
 */
export function verifyPublicKeyBundle(
  bundle: PublicKeyBundle
): { valid: boolean; error?: string; warnings?: string[] } {
  const prepared = preparePublicKeyBundleVerification(bundle)
  if (!prepared.ok) return prepared.result
  if (!dilithiumVerify(prepared.bundleBytes, prepared.bundleSignature, bundle.dilithiumKey)) {
    return { valid: false, error: 'Bundle signature verification failed' }
  }
  if (!verifyBundleMetadataCapabilities(bundle)) {
    return { valid: false, error: 'Bundle metadata capabilities signature verification failed' }
  }
  if (!verifySignedPreKey(bundle.signedPreKey, bundle.dilithiumKey)) {
    return { valid: false, error: 'Signed pre-key signature verification failed' }
  }
  return finishPublicKeyBundleVerification(bundle)
}

export async function verifyPublicKeyBundleAsync(
  bundle: PublicKeyBundle
): Promise<{ valid: boolean; error?: string; warnings?: string[] }> {
  const prepared = preparePublicKeyBundleVerification(bundle)
  if (!prepared.ok) return prepared.result
  if (!await dilithiumVerifyAsync(prepared.bundleBytes, prepared.bundleSignature, bundle.dilithiumKey)) {
    return { valid: false, error: 'Bundle signature verification failed' }
  }
  if (!await verifyBundleMetadataCapabilitiesAsync(bundle)) {
    return { valid: false, error: 'Bundle metadata capabilities signature verification failed' }
  }
  if (!await verifySignedPreKeyAsync(bundle.signedPreKey, bundle.dilithiumKey)) {
    return { valid: false, error: 'Signed pre-key signature verification failed' }
  }
  return finishPublicKeyBundleVerification(bundle)
}

function preparePublicKeyBundleVerification(
  bundle: PublicKeyBundle,
): (
  | { ok: true; bundleBytes: Uint8Array; bundleSignature: string }
  | { ok: false; result: { valid: false; error: string } }
) {
  if (!isValidX25519PublicKey(bundle.identityKey)) {
    return { ok: false, result: { valid: false, error: 'Invalid X25519 identity key format' } }
  }
  if (!isValidMLKEMPublicKey(bundle.mlkemIdentityKey)) {
    return { ok: false, result: { valid: false, error: 'Invalid ML-KEM identity key format' } }
  }
  if (!isValidDilithiumPublicKey(bundle.dilithiumKey)) {
    return { ok: false, result: { valid: false, error: 'Invalid ML-DSA-65 key format' } }
  }
  if (!bundle.bundleSignature) {
    return { ok: false, result: { valid: false, error: 'Bundle signature is required' } }
  }
  const signableJson = canonicalJsonStringify({
    identityId: bundle.identityId,
    identityKey: bundle.identityKey,
    mlkemIdentityKey: bundle.mlkemIdentityKey,
    dilithiumKey: bundle.dilithiumKey,
    signedPreKey: bundle.signedPreKey,
    version: bundle.version,
    timestamp: bundle.timestamp
  })
  return { ok: true, bundleBytes: stringToBytes(signableJson), bundleSignature: bundle.bundleSignature }
}

function finishPublicKeyBundleVerification(
  bundle: PublicKeyBundle,
): { valid: boolean; error?: string; warnings?: string[] } {
  const warnings: string[] = []
  if (bundle.signedPreKey.expiresAt && isExpired(bundle.signedPreKey.expiresAt)) {
    warnings.push('Signed pre-key past its rotation window; owner should rotate')
  }
  for (const preKey of bundle.oneTimePreKeys) {
    if (!isValidX25519PublicKey(preKey.x25519PublicKey)) {
      return { valid: false, error: `One-time pre-key ${preKey.id} has invalid X25519 key format` }
    }
    if (!isValidMLKEMPublicKey(preKey.mlkemPublicKey)) {
      return { valid: false, error: `One-time pre-key ${preKey.id} has invalid ML-KEM key format` }
    }
  }
  return { valid: true, warnings: warnings.length > 0 ? warnings : undefined }
}

/**
 * Check if OUR OWN bundle needs proactive rotation/refresh.
 * 
 * The owner rotates proactively on a schedule rather than recipients
 * rejecting old bundles. This function checks whether it's time for the
 * owner to generate fresh keys.
 */
export function bundleNeedsRefresh(
  bundle: PublicKeyBundle,
  options: {
    minOTPKs?: number
    rotationInterval?: number
    maxAge?: number // Accepted for API compat; mapped to rotationInterval
  } = {}
): { needsRefresh: boolean; reason?: string } {
  const { minOTPKs = 10 } = options
  const rotationInterval = options.rotationInterval ?? options.maxAge ?? DEFAULT_SIGNED_PREKEY_ROTATION
  
  // Check OPK count
  if (bundle.oneTimePreKeys.length < minOTPKs) {
    return { needsRefresh: true, reason: `Low OPK count: ${bundle.oneTimePreKeys.length}` }
  }
  
  // Check signed pre-key age against rotation interval (proactive refresh)
  if (bundle.signedPreKey.timestamp) {
    const spkAge = now() - bundle.signedPreKey.timestamp
    if (spkAge >= rotationInterval) {
      return { needsRefresh: true, reason: 'Signed pre-key due for rotation' }
    }
  }
  
  return { needsRefresh: false }
}

// Pre-key Rotation

/**
 * Rotate the signed pre-key
 * 
 * The signed pre-key should be rotated periodically.
 * The bundle signature only covers static parts (not OPKs).
 */
export function rotateSignedPreKey(
  bundle: PublicKeyBundle,
  privateBundle: PrivateKeyBundle,
  dilithiumPrivateKey: string
): { bundle: PublicKeyBundle; privateBundle: PrivateKeyBundle } {
  const newKeyId = bundle.signedPreKey.id + 1
  const { signedPreKey, x25519PrivateKey, mlkemPrivateKey } = generateSignedPreKey(
    dilithiumPrivateKey,
    newKeyId
  )
  const newTimestamp = now()
  const bundleSignature = dilithiumSign(
    stringToBytes(canonicalJsonStringify(rotatedBundleSignable(bundle, signedPreKey, newTimestamp))),
    dilithiumPrivateKey,
  )
  return assembleRotatedSignedPreKey(
    bundle,
    privateBundle,
    signedPreKey,
    x25519PrivateKey,
    mlkemPrivateKey,
    bundleSignature,
    newTimestamp,
  )
}

export async function rotateSignedPreKeyAsync(
  bundle: PublicKeyBundle,
  privateBundle: PrivateKeyBundle,
  dilithiumPrivateKey: string
): Promise<{ bundle: PublicKeyBundle; privateBundle: PrivateKeyBundle }> {
  const newKeyId = bundle.signedPreKey.id + 1
  const { signedPreKey, x25519PrivateKey, mlkemPrivateKey } = await generateSignedPreKeyAsync(
    dilithiumPrivateKey,
    newKeyId
  )
  const newTimestamp = now()
  const bundleSignature = await dilithiumSignAsync(
    stringToBytes(canonicalJsonStringify(rotatedBundleSignable(bundle, signedPreKey, newTimestamp))),
    dilithiumPrivateKey,
  )
  return assembleRotatedSignedPreKey(
    bundle,
    privateBundle,
    signedPreKey,
    x25519PrivateKey,
    mlkemPrivateKey,
    bundleSignature,
    newTimestamp,
  )
}

function rotatedBundleSignable(
  bundle: PublicKeyBundle,
  signedPreKey: SignedPreKey,
  newTimestamp: number,
) {
  return {
    identityId: bundle.identityId,
    identityKey: bundle.identityKey,
    mlkemIdentityKey: bundle.mlkemIdentityKey,
    dilithiumKey: bundle.dilithiumKey,
    signedPreKey,
    version: bundle.version + 1,
    timestamp: newTimestamp
  }
}

function assembleRotatedSignedPreKey(
  bundle: PublicKeyBundle,
  privateBundle: PrivateKeyBundle,
  signedPreKey: SignedPreKey,
  x25519PrivateKey: string,
  mlkemPrivateKey: string,
  bundleSignature: string,
  newTimestamp: number,
): { bundle: PublicKeyBundle; privateBundle: PrivateKeyBundle } {
  const previousSignedPreKeys = privateBundle.previousSignedPreKeys || []
  previousSignedPreKeys.push({
    id: bundle.signedPreKey.id,
    x25519Private: privateBundle.signedPreKeyPrivate,
    mlkemPrivate: privateBundle.mlkemSignedPreKeyPrivate,
    expiresAt: now() + PREVIOUS_SIGNED_PREKEY_RETENTION
  })
  const validPreviousKeys = previousSignedPreKeys.filter(k => !isExpired(k.expiresAt))
  return {
    bundle: {
      ...bundle,
      signedPreKey,
      version: bundle.version + 1,
      timestamp: newTimestamp,
      bundleSignature
    },
    privateBundle: {
      ...privateBundle,
      signedPreKeyPrivate: x25519PrivateKey,
      mlkemSignedPreKeyPrivate: mlkemPrivateKey,
      previousSignedPreKeys: validPreviousKeys,
      signedPreKeyRotatedAt: now()
    }
  }
}

/**
 * Replenish one-time pre-keys
 */
export function replenishOneTimePreKeys(
  bundle: PublicKeyBundle,
  privateBundle: PrivateKeyBundle,
  targetCount: number = TARGET_PREKEY_COUNT
): { bundle: PublicKeyBundle; privateBundle: PrivateKeyBundle } {
  const currentCount = bundle.oneTimePreKeys.length
  const toGenerate = Math.max(0, targetCount - currentCount)
  
  if (toGenerate === 0) {
    return { bundle, privateBundle }
  }
  
  return mergeGeneratedOneTimePreKeys(
    bundle,
    privateBundle,
    generateOneTimePreKeys(privateBundle.nextPreKeyId, toGenerate),
    toGenerate,
  )
}

export async function replenishOneTimePreKeysAsync(
  bundle: PublicKeyBundle,
  privateBundle: PrivateKeyBundle,
  targetCount: number = TARGET_PREKEY_COUNT,
  yieldToHost?: () => Promise<void>,
): Promise<{ bundle: PublicKeyBundle; privateBundle: PrivateKeyBundle }> {
  const currentCount = bundle.oneTimePreKeys.length
  const toGenerate = Math.max(0, targetCount - currentCount)

  if (toGenerate === 0) {
    return { bundle, privateBundle }
  }

  return mergeGeneratedOneTimePreKeys(
    bundle,
    privateBundle,
    await generateOneTimePreKeysAsync(privateBundle.nextPreKeyId, toGenerate, yieldToHost),
    toGenerate,
  )
}

function mergeGeneratedOneTimePreKeys(
  bundle: PublicKeyBundle,
  privateBundle: PrivateKeyBundle,
  generated: GeneratedOneTimePreKeys,
  toGenerate: number,
): { bundle: PublicKeyBundle; privateBundle: PrivateKeyBundle } {
  const { preKeys, x25519PrivateKeys, mlkemPrivateKeys } = generated
  
  // Merge with existing
  const newOneTimePreKeys = [...bundle.oneTimePreKeys, ...preKeys]
  const newX25519PrivateKeys = new Map(privateBundle.oneTimePreKeyPrivates)
  const newMlkemPrivateKeys = new Map(privateBundle.mlkemOneTimePreKeyPrivates)
  
  for (const [id, key] of x25519PrivateKeys) {
    newX25519PrivateKeys.set(id, key)
  }
  for (const [id, key] of mlkemPrivateKeys) {
    newMlkemPrivateKeys.set(id, key)
  }
  
  // Keep the existing bundle signature; OPKs are transcript-bound when used.
  const newBundle: PublicKeyBundle = {
    ...bundle,
    oneTimePreKeys: newOneTimePreKeys
    // Version and timestamp stay signed by the existing signature.
  }
  
  // Update private bundle
  const newPrivateBundle: PrivateKeyBundle = {
    ...privateBundle,
    oneTimePreKeyPrivates: newX25519PrivateKeys,
    mlkemOneTimePreKeyPrivates: newMlkemPrivateKeys,
    nextPreKeyId: privateBundle.nextPreKeyId + toGenerate
  }
  
  return { bundle: newBundle, privateBundle: newPrivateBundle }
}

/**
 * Mark an OPK as used and remove it
 */
export function consumeOneTimePreKey(
  bundle: PublicKeyBundle,
  privateBundle: PrivateKeyBundle,
  usedKeyId: number
): { bundle: PublicKeyBundle; privateBundle: PrivateKeyBundle } {
  // Remove from public bundle
  const newOneTimePreKeys = bundle.oneTimePreKeys.filter(k => k.id !== usedKeyId)
  
  // Remove from private bundle
  const newX25519PrivateKeys = new Map(privateBundle.oneTimePreKeyPrivates)
  const newMlkemPrivateKeys = new Map(privateBundle.mlkemOneTimePreKeyPrivates)
  newX25519PrivateKeys.delete(usedKeyId)
  newMlkemPrivateKeys.delete(usedKeyId)
  
  // Keep the existing bundle signature; remaining OPKs are unchanged.
  const newBundle: PublicKeyBundle = {
    ...bundle,
    oneTimePreKeys: newOneTimePreKeys
    // Signature remains unchanged.
  }
  
  // Update private bundle
  const newPrivateBundle: PrivateKeyBundle = {
    ...privateBundle,
    oneTimePreKeyPrivates: newX25519PrivateKeys,
    mlkemOneTimePreKeyPrivates: newMlkemPrivateKeys
  }
  
  return { bundle: newBundle, privateBundle: newPrivateBundle }
}

// Hybrid X3DH Key Exchange (Initiator)

export interface X3DHInitiatorResult {
  /** Hybrid shared secret for deriving session keys */
  sharedSecret: Uint8Array
  /** X25519 ephemeral public key to send to recipient */
  ephemeralPublicKey: string
  /** X25519 ephemeral private key (needed to use as initial ratchet key) */
  ephemeralPrivateKey: string
  /** ML-KEM ciphertext to send to recipient */
  mlkemCiphertext: string
  /** ID of the one-time pre-key used (if any) */
  usedOneTimePreKeyId?: number
  /** ID of the signed pre-key used */
  usedSignedPreKeyId: number
  /** Our X25519 identity key used */
  identityPublicKey: string
  /** Associated data for AEAD */
  associatedData: Uint8Array
  /** Session fingerprint for identification */
  sessionFingerprint: string
  /** Bundle timestamp for freshness tracking */
  bundleTimestamp: number
}

/**
 * Perform hybrid X3DH key exchange as the initiator (Alice)
 * 
 * Computes hybrid shared secret from:
 * 
 * Classical X25519 DH:
 * - DH1 = DH(IKa, SPKb_x25519)
 * - DH2 = DH(EKa, IKb_x25519)
 * - DH3 = DH(EKa, SPKb_x25519)
 * - DH4 = DH(EKa, OPKb_x25519) [if one-time pre-key available]
 * 
 * Post-Quantum ML-KEM:
 * - KEM1 = Encapsulate(SPKb_mlkem)
 * - KEM2 = Encapsulate(OPKb_mlkem) [if one-time pre-key available]
 * 
 * SK = KDF(DH1 || DH2 || DH3 || DH4 || KEM1 || KEM2)
 */
export async function x3dhInitiator(
  ourIdentityPrivateKey: string,
  ourIdentityPublicKey: string,
  ourDilithiumPublicKey: string,
  recipientBundle: PublicKeyBundle,
  options: {
    preferredOTPKId?: number
  } = {}
): Promise<X3DHInitiatorResult> {
  const verification = await verifyPublicKeyBundleAsync(recipientBundle)
  
  if (!verification.valid) {
    throw new BundleError(`Invalid recipient key bundle: ${verification.error}`)
  }
  
  // Generate X25519 ephemeral key pair
  const ephemeralKeyPair = generateX25519KeyPair()
  
  // Select a one-time pre-key if available
  let selectedOneTimePreKey: HybridPreKey | undefined
  
  if (recipientBundle.oneTimePreKeys.length > 0) {
    // Priority 1: Use server-allocated OPK if specified (prevents race conditions)
    if (options.preferredOTPKId !== undefined) {
      selectedOneTimePreKey = recipientBundle.oneTimePreKeys.find(
        k => k.id === options.preferredOTPKId
      )
    }
    
    // Priority 2: Random selection (fallback for local-only mode or server failure)
    if (!selectedOneTimePreKey) {
      const index = generateRandomInt(recipientBundle.oneTimePreKeys.length)
      selectedOneTimePreKey = recipientBundle.oneTimePreKeys[index]
    }
    
    // Validate key formats only
    if (selectedOneTimePreKey) {
      if (!isValidX25519PublicKey(selectedOneTimePreKey.x25519PublicKey)) {
        throw new BundleError(`Selected one-time pre-key ${selectedOneTimePreKey.id} has invalid X25519 key`)
      }
      if (!isValidMLKEMPublicKey(selectedOneTimePreKey.mlkemPublicKey)) {
        throw new BundleError(`Selected one-time pre-key ${selectedOneTimePreKey.id} has invalid ML-KEM key`)
      }
    }
  }
  
  
  // DH1 = DH(IKa, SPKb) - Our identity key with their signed pre-key
  const dh1 = x25519DH(ourIdentityPrivateKey, recipientBundle.signedPreKey.x25519PublicKey)
  
  // DH2 = DH(EKa, IKb) - Our ephemeral key with their identity key
  const dh2 = x25519DH(ephemeralKeyPair.privateKey, recipientBundle.identityKey)
  
  // DH3 = DH(EKa, SPKb) - Our ephemeral key with their signed pre-key
  const dh3 = x25519DH(ephemeralKeyPair.privateKey, recipientBundle.signedPreKey.x25519PublicKey)
  
  // Combine classical DH outputs
  let dhConcat = concatBytes(dh1, dh2, dh3)
  
  // DH4 = DH(EKa, OPKb) - Our ephemeral key with their one-time pre-key (if available)
  if (selectedOneTimePreKey) {
    const dh4 = x25519DH(ephemeralKeyPair.privateKey, selectedOneTimePreKey.x25519PublicKey)
    dhConcat = concatBytes(dhConcat, dh4)
  }
  
  
  // KEM1 = Encapsulate to signed pre-key
  const kem1 = await mlkemEncapsulateAsync(recipientBundle.signedPreKey.mlkemPublicKey)
  
  // Combine KEM shared secrets
  let kemConcat = kem1.sharedSecret
  let mlkemCiphertextCombined = kem1.ciphertext
  
  // KEM2 = Encapsulate to one-time pre-key (if available)
  if (selectedOneTimePreKey) {
    const kem2 = await mlkemEncapsulateAsync(selectedOneTimePreKey.mlkemPublicKey)
    kemConcat = concatBytes(kemConcat, kem2.sharedSecret)
    mlkemCiphertextCombined = mlkemCiphertextCombined + ':' + kem2.ciphertext
  }
  
  
  // Combine classical and post-quantum secrets (KEM || DH per PQXDH)
  const combinedSecret = concatBytes(kemConcat, dhConcat)
  
  // Create associated data
  const spkIdBytes = int32ToLittleEndianBytes(recipientBundle.signedPreKey.id)
  const opkIdBytes = selectedOneTimePreKey 
    ? int32ToLittleEndianBytes(selectedOneTimePreKey.id)
    : new Uint8Array(0)
  
  // Hash the ML-KEM ciphertext for inclusion in AD (ciphertext can be large)
  const mlkemCtHash = hash(stringToBytes(mlkemCiphertextCombined))
  
  // Include all identity-binding keys in associated data.
  const associatedData = concatBytes(
    // Initiator's identity keys (X25519 + ML-DSA-65 for full binding).
    base64ToBytes(ourIdentityPublicKey),
    stringToBytes(ourDilithiumPublicKey),
    // Recipient's identity keys (X25519 + ML-DSA-65 + ML-KEM).
    base64ToBytes(recipientBundle.identityKey),
    stringToBytes(recipientBundle.dilithiumKey),
    base64ToBytes(recipientBundle.mlkemIdentityKey),
    // Ephemeral key (binds this specific exchange)
    base64ToBytes(ephemeralKeyPair.publicKey),
    // Key IDs for pre-key binding
    spkIdBytes,
    opkIdBytes,
    // KEM ciphertext hash (prevents mauling attacks)
    mlkemCtHash
  )
  
  // Derive shared secret using HKDF
  // Use a non-zero fixed salt for domain-separated initial extraction.
  const salt = new Uint8Array(32).fill(0xFF)
  const info = stringToBytes(X3DH_INFO)
  const sharedSecret = deriveKey(combinedSecret, salt, info, SHARED_SECRET_LENGTH)
  
  // Create session fingerprint
  const sessionFingerprint = createSessionFingerprint(
    ourIdentityPublicKey,
    recipientBundle.identityKey,
    ephemeralKeyPair.publicKey
  )
  
  return {
    sharedSecret,
    ephemeralPublicKey: ephemeralKeyPair.publicKey,
    ephemeralPrivateKey: ephemeralKeyPair.privateKey,
    mlkemCiphertext: mlkemCiphertextCombined,
    usedOneTimePreKeyId: selectedOneTimePreKey?.id,
    usedSignedPreKeyId: recipientBundle.signedPreKey.id,
    identityPublicKey: ourIdentityPublicKey,
    associatedData,
    sessionFingerprint,
    bundleTimestamp: recipientBundle.timestamp
  }
}

// Hybrid X3DH Key Exchange (Responder)

export interface X3DHResponderInput {
  /** Initiator's X25519 identity public key */
  initiatorIdentityKey: string
  /** Initiator's X25519 ephemeral public key */
  initiatorEphemeralKey: string
  /** ML-KEM ciphertext(s) from initiator */
  mlkemCiphertext: string
  /** ID of the one-time pre-key used (if any) */
  usedOneTimePreKeyId?: number
  /** ID of the signed pre-key used */
  usedSignedPreKeyId: number
  /** Initiator's ML-DSA-65 public key for verification (historical field name) */
  initiatorDilithiumKey: string
  /** Bundle timestamp from initiator */
  bundleTimestamp?: number
}

export interface X3DHResponderResult {
  /** Hybrid shared secret for deriving session keys */
  sharedSecret: Uint8Array
  /** Associated data for AEAD */
  associatedData: Uint8Array
  /** Session fingerprint for identification */
  sessionFingerprint: string
}

/**
 * Find the correct signed pre-key (current or previous) for decapsulation
 */
function findSignedPreKeyPrivate(
  usedSignedPreKeyId: number,
  currentSignedPreKeyPrivate: string,
  currentMlkemSignedPreKeyPrivate: string,
  bundle: PublicKeyBundle,
  privateBundle: PrivateKeyBundle
): { x25519Private: string; mlkemPrivate: string } | null {
  // Check if it's the current signed pre-key
  if (bundle.signedPreKey.id === usedSignedPreKeyId) {
    return {
      x25519Private: currentSignedPreKeyPrivate,
      mlkemPrivate: currentMlkemSignedPreKeyPrivate
    }
  }
  
  // Check previous signed pre-keys
  if (privateBundle.previousSignedPreKeys) {
    const previous = privateBundle.previousSignedPreKeys.find(
      k => k.id === usedSignedPreKeyId && !isExpired(k.expiresAt)
    )
    if (previous) {
      return {
        x25519Private: previous.x25519Private,
        mlkemPrivate: previous.mlkemPrivate
      }
    }
  }
  
  return null
}

/**
 * Perform hybrid X3DH key exchange as the responder (Bob)
 * 
 * Computes the same hybrid shared secret as the initiator using our private keys
 */
export async function x3dhResponder(
  input: X3DHResponderInput,
  ourIdentityPrivateKey: string,
  ourIdentityPublicKey: string,
  ourDilithiumPublicKey: string,
  ourMlkemIdentityPublicKey: string,
  signedPreKeyPrivate: string,
  mlkemSignedPreKeyPrivate: string,
  oneTimePreKeyPrivates: Map<number, string>,
  mlkemOneTimePreKeyPrivates: Map<number, string>,
  bundle?: PublicKeyBundle,
  privateBundle?: PrivateKeyBundle
): Promise<X3DHResponderResult> {
  // Validate input keys
  if (!isValidX25519PublicKey(input.initiatorIdentityKey)) {
    throw new CryptoError('Invalid initiator identity key')
  }
  
  if (!isValidX25519PublicKey(input.initiatorEphemeralKey)) {
    throw new CryptoError('Invalid initiator ephemeral key')
  }
  
  // Find the correct signed pre-key
  let spkX25519Private = signedPreKeyPrivate
  let spkMlkemPrivate = mlkemSignedPreKeyPrivate
  
  if (bundle && privateBundle) {
    const foundSPK = findSignedPreKeyPrivate(
      input.usedSignedPreKeyId,
      signedPreKeyPrivate,
      mlkemSignedPreKeyPrivate,
      bundle,
      privateBundle
    )
    
    if (!foundSPK) {
      throw new CryptoError(
        `Signed pre-key ${input.usedSignedPreKeyId} not found. ` +
        `This may happen if the sender used an outdated key bundle.`
      )
    }
    
    spkX25519Private = foundSPK.x25519Private
    spkMlkemPrivate = foundSPK.mlkemPrivate
  }
  
  
  // DH1 = DH(SPKb, IKa) - Our signed pre-key with their identity key
  const dh1 = x25519DH(spkX25519Private, input.initiatorIdentityKey)
  
  // DH2 = DH(IKb, EKa) - Our identity key with their ephemeral key
  const dh2 = x25519DH(ourIdentityPrivateKey, input.initiatorEphemeralKey)
  
  // DH3 = DH(SPKb, EKa) - Our signed pre-key with their ephemeral key
  const dh3 = x25519DH(spkX25519Private, input.initiatorEphemeralKey)
  
  // Combine classical DH outputs
  let dhConcat = concatBytes(dh1, dh2, dh3)
  
  // DH4 = DH(OPKb, EKa) - Our one-time pre-key with their ephemeral key (if used)
  if (input.usedOneTimePreKeyId !== undefined) {
    const oneTimePreKeyPrivate = oneTimePreKeyPrivates.get(input.usedOneTimePreKeyId)
    if (!oneTimePreKeyPrivate) {
      const availableKeys = Array.from(oneTimePreKeyPrivates.keys())
      throw new CryptoError(
        `One-time pre-key ${input.usedOneTimePreKeyId} not found. ` +
        `This may happen if the sender used an outdated public key bundle. ` +
        `Available keys: [${availableKeys.slice(0, 5).join(', ')}${availableKeys.length > 5 ? '...' : ''}]. ` +
        `Please ask the sender to refresh your contact and try again.`
      )
    }
    const dh4 = x25519DH(oneTimePreKeyPrivate, input.initiatorEphemeralKey)
    dhConcat = concatBytes(dhConcat, dh4)
  }
  
  
  // Parse ML-KEM ciphertext(s)
  const ciphertexts = input.mlkemCiphertext.split(':')
  
  // KEM1 = Decapsulate from signed pre-key
  const kem1SharedSecret = await mlkemDecapsulateAsync(ciphertexts[0], spkMlkemPrivate)
  let kemConcat = kem1SharedSecret
  
  // KEM2 = Decapsulate from one-time pre-key (if used)
  if (input.usedOneTimePreKeyId !== undefined && ciphertexts.length > 1) {
    const mlkemOneTimePreKeyPrivate = mlkemOneTimePreKeyPrivates.get(input.usedOneTimePreKeyId)
    if (!mlkemOneTimePreKeyPrivate) {
      const availableKeys = Array.from(mlkemOneTimePreKeyPrivates.keys())
      throw new CryptoError(
        `ML-KEM one-time pre-key ${input.usedOneTimePreKeyId} not found. ` +
        `This may happen if the sender used an outdated public key bundle. ` +
        `Available keys: [${availableKeys.slice(0, 5).join(', ')}${availableKeys.length > 5 ? '...' : ''}]. ` +
        `Please ask the sender to refresh your contact and try again.`
      )
    }
    const kem2SharedSecret = await mlkemDecapsulateAsync(ciphertexts[1], mlkemOneTimePreKeyPrivate)
    kemConcat = concatBytes(kemConcat, kem2SharedSecret)
  }
  
  
  // Combine classical and post-quantum secrets (KEM || DH per PQXDH)
  const combinedSecret = concatBytes(kemConcat, dhConcat)
  
  // Match the initiator's associated-data layout.
  const spkIdBytes = int32ToLittleEndianBytes(input.usedSignedPreKeyId)
  const opkIdBytes = input.usedOneTimePreKeyId !== undefined
    ? int32ToLittleEndianBytes(input.usedOneTimePreKeyId)
    : new Uint8Array(0)
  
  // Hash the ML-KEM ciphertext for inclusion in AD (must match initiator)
  const mlkemCtHash = hash(stringToBytes(input.mlkemCiphertext))
  
  // Include all identity-binding keys in associated data; must match initiator.
  const associatedData = concatBytes(
    // Initiator's identity keys (X25519 + ML-DSA-65 for full binding).
    base64ToBytes(input.initiatorIdentityKey),
    stringToBytes(input.initiatorDilithiumKey),
    // Recipient's identity keys (X25519 + ML-DSA-65 + ML-KEM).
    base64ToBytes(ourIdentityPublicKey),
    stringToBytes(ourDilithiumPublicKey),
    base64ToBytes(ourMlkemIdentityPublicKey),
    // Ephemeral key (binds this specific exchange)
    base64ToBytes(input.initiatorEphemeralKey),
    // Key IDs for pre-key binding
    spkIdBytes,
    opkIdBytes,
    // KEM ciphertext hash (prevents mauling attacks)
    mlkemCtHash
  )
  
  // Derive shared secret using HKDF
  const salt = new Uint8Array(32).fill(0xFF)
  const info = stringToBytes(X3DH_INFO)
  const sharedSecret = deriveKey(combinedSecret, salt, info, SHARED_SECRET_LENGTH)
  
  // Create session fingerprint
  const sessionFingerprint = createSessionFingerprint(
    input.initiatorIdentityKey,
    ourIdentityPublicKey,
    input.initiatorEphemeralKey
  )
  
  return {
    sharedSecret,
    associatedData,
    sessionFingerprint
  }
}

// Initial Message Header

/**
 * Create the initial message header for hybrid X3DH
 * This is sent along with the first encrypted message
 */
export function createX3DHHeader(
  initiatorIdentityKey: string,
  ephemeralPublicKey: string,
  mlkemCiphertext: string,
  usedSignedPreKeyId: number,
  usedOneTimePreKeyId?: number,
  bundleTimestamp?: number
): string {
  const header = {
    v: PROTOCOL_VERSIONS.x3dhHeader,
    ik: initiatorIdentityKey,
    ek: ephemeralPublicKey,
    mc: mlkemCiphertext,
    spk: usedSignedPreKeyId,
    opk: usedOneTimePreKeyId,
    bt: bundleTimestamp
  }
  return bytesToBase64(stringToBytes(JSON.stringify(header)))
}

/**
 * Parse a hybrid X3DH header
 */
export function parseX3DHHeader(headerBase64: string): {
  initiatorIdentityKey: string
  ephemeralPublicKey: string
  mlkemCiphertext: string
  usedSignedPreKeyId: number
  usedOneTimePreKeyId?: number
  bundleTimestamp?: number
} {
  try {
    const headerBytes = base64ToBytes(headerBase64)
    const headerStr = new TextDecoder().decode(headerBytes)
    const header = JSON.parse(headerStr)
    assertExactVersion('X3DH header', header.v, PROTOCOL_VERSIONS.x3dhHeader)

    if (typeof header.ik !== 'string' || typeof header.ek !== 'string' || typeof header.mc !== 'string') {
      throw new Error('X3DH header is missing required key material')
    }
    if (!Number.isInteger(header.spk) || header.spk < 0) {
      throw new Error('X3DH header signed pre-key id is invalid')
    }
    if (header.opk !== undefined && (!Number.isInteger(header.opk) || header.opk < 0)) {
      throw new Error('X3DH header one-time pre-key id is invalid')
    }
    
    return {
      initiatorIdentityKey: header.ik,
      ephemeralPublicKey: header.ek,
      mlkemCiphertext: header.mc,
      usedSignedPreKeyId: header.spk,
      usedOneTimePreKeyId: header.opk,
      bundleTimestamp: header.bt
    }
  } catch {
    throw new CryptoError('Invalid X3DH header format')
  }
}
