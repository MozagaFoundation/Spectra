/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

/**
 * ML-DSA-65 Post-Quantum Signature Functions
 * 
 * This module provides post-quantum digital signatures using ML-DSA-65, the
 * FIPS 204 standardized algorithm based on CRYSTALS-Dilithium, via
 * @noble/post-quantum.
 * 
 * `@noble/post-quantum` remains the JS oracle. iOS/Android verify and chat
 * identity sign offload to PQClean ML-DSA-65 on a native worker. TypeScript
 * keeps canonicalization. Verify sees public key, signature, and message only.
 * Sign copies the chat identity secret key for the call, then wipes native
 * buffers. Wallet and vault keys stay in JavaScript.
 * 
 * Key sizes (ML-DSA-65):
 * - Public key: 1952 bytes
 * - Private key: 4032 bytes  
 * - Signature: 3309 bytes
 */

// @ts-ignore - module exports work at runtime
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import { randomBytes } from '@noble/hashes/utils'
import { base64ToBytes, bytesToBase64, bytesToHex, hexToBytes, stringToBytes } from './utils'

// Constants

/** ML-DSA-65 public key size in bytes */
export const PUBLIC_KEY_SIZE = 1952

/** ML-DSA-65 private key size in bytes */
export const PRIVATE_KEY_SIZE = 4032

/** ML-DSA-65 signature size in bytes */
export const SIGNATURE_SIZE = 3309

export interface DilithiumKeyPair {
  publicKey: string  // hex encoded
  privateKey: string // hex encoded
}

export type DilithiumOperationSource = 'js' | 'js_reused_public_key' | 'native'

interface NativeMlDsaModule {
  verify(messageBase64: string, signatureBase64: string, publicKeyBase64: string): Promise<boolean>
  sign?(messageBase64: string, secretKeyBase64: string): Promise<string>
}

let nativeMlDsaModule: NativeMlDsaModule | null | undefined

export function __setNativeMlDsaModuleForTests(module: NativeMlDsaModule | null | undefined): void {
  if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'test') {
    return
  }
  nativeMlDsaModule = module
}

function getNativeMlDsaModule(): NativeMlDsaModule | null {
  if (nativeMlDsaModule !== undefined) {
    return nativeMlDsaModule
  }
  try {
    const { NativeModules } = require('react-native')
    nativeMlDsaModule = (NativeModules.MlDsaModule as NativeMlDsaModule | undefined) ?? null
  } catch {
    nativeMlDsaModule = null
  }
  return nativeMlDsaModule
}

export interface DilithiumOperationMetrics {
  ok: boolean
  source: DilithiumOperationSource
  elapsedMs: number
}

export interface DilithiumBenchmarkResult {
  primitive: 'ml_dsa65_verify'
  samples: number
  legacy: {
    totalMs: number
    avgMs: number
  }
  reusedPublicKey: {
    totalMs: number
    avgMs: number
  }
  speedupPercent: number
}

export type DilithiumVerifier = (message: Uint8Array, signature: string) => boolean

const VERIFIER_CACHE_LIMIT = 64
const verifierCache = new Map<string, DilithiumVerifier | null>()

function getCachedVerifier(publicKey: string): DilithiumVerifier | null {
  const cached = verifierCache.get(publicKey)
  if (cached !== undefined) {
    verifierCache.delete(publicKey)
    verifierCache.set(publicKey, cached)
    return cached
  }

  const verifier = createDilithiumVerifier(publicKey)
  if (verifierCache.size >= VERIFIER_CACHE_LIMIT) {
    const oldest = verifierCache.keys().next().value
    if (oldest !== undefined) {
      verifierCache.delete(oldest)
    }
  }
  verifierCache.set(publicKey, verifier)
  return verifier
}

function nowMs(): number {
  return globalThis.performance?.now?.() ?? Date.now()
}

/**
 * Generate a new ML-DSA-65 key pair
 * 
 * @returns Key pair with hex-encoded public and private keys
 */
export function generateDilithiumKeyPair(): DilithiumKeyPair {
  const seed = randomBytes(32)
  const { publicKey, secretKey } = ml_dsa65.keygen(seed)
  return {
    publicKey: bytesToHex(publicKey),
    privateKey: bytesToHex(secretKey)
  }
}

/**
 * Sign a message using ML-DSA-65 private key
 * 
 * @param message Message bytes to sign
 * @param privateKey Hex-encoded private key
 * @returns Hex-encoded signature
 */
export function signWithDilithium(message: Uint8Array, privateKey: string): string {
  const privateKeyBytes = hexToBytes(privateKey)
  if (privateKeyBytes.length !== PRIVATE_KEY_SIZE) {
    throw new Error(`Private key must be ${PRIVATE_KEY_SIZE} bytes, got ${privateKeyBytes.length}`)
  }
  if (message.byteLength > 1_048_576) {
    throw new Error('ML-DSA-65 message exceeds 1 MiB')
  }
  const signature = ml_dsa65.sign(message, privateKeyBytes)
  return bytesToHex(signature)
}

export async function signWithDilithiumAsync(message: Uint8Array, privateKey: string): Promise<string> {
  const privateKeyBytes = hexToBytes(privateKey)
  try {
    if (privateKeyBytes.length !== PRIVATE_KEY_SIZE) {
      throw new Error(`Private key must be ${PRIVATE_KEY_SIZE} bytes, got ${privateKeyBytes.length}`)
    }
    if (message.byteLength > 1_048_576) {
      throw new Error('ML-DSA-65 message exceeds 1 MiB')
    }

    const native = getNativeMlDsaModule()
    if (native?.sign) {
      const signatureBase64 = await native.sign(
        bytesToBase64(message),
        bytesToBase64(privateKeyBytes),
      )
      let signatureBytes: Uint8Array
      try {
        signatureBytes = base64ToBytes(signatureBase64)
      } catch {
        throw new Error('native ML-DSA-65 sign returned invalid encoding')
      }
      if (signatureBytes.length !== SIGNATURE_SIZE) {
        throw new Error('native ML-DSA-65 sign returned an invalid signature')
      }
      return bytesToHex(signatureBytes)
    }

    return signWithDilithium(message, privateKey)
  } finally {
    privateKeyBytes.fill(0)
  }
}

/**
 * Verify a ML-DSA-65 signature
 * 
 * @param message Original message bytes
 * @param signature Hex-encoded signature
 * @param publicKey Hex-encoded public key
 * @returns True if signature is valid
 */
function verifyDilithiumSignatureUncached(
  message: Uint8Array,
  signature: string,
  publicKey: string,
): boolean {
  try {
    const signatureBytes = hexToBytes(signature)
    const publicKeyBytes = hexToBytes(publicKey)

    if (signatureBytes.length !== SIGNATURE_SIZE) {
      return false
    }
    if (publicKeyBytes.length !== PUBLIC_KEY_SIZE) {
      return false
    }

    return ml_dsa65.verify(signatureBytes, message, publicKeyBytes)
  } catch {
    return false
  }
}

export function verifyDilithiumSignature(
  message: Uint8Array, 
  signature: string, 
  publicKey: string
): boolean {
  const verifier = getCachedVerifier(publicKey)
  if (!verifier) {
    return false
  }
  try {
    return verifier(message, signature)
  } catch {
    return false
  }
}

export async function verifyDilithiumSignatureAsync(
  message: Uint8Array,
  signature: string,
  publicKey: string,
): Promise<boolean> {
  let signatureBytes: Uint8Array
  let publicKeyBytes: Uint8Array
  try {
    signatureBytes = hexToBytes(signature)
    publicKeyBytes = hexToBytes(publicKey)
  } catch {
    return false
  }
  if (
    signatureBytes.length !== SIGNATURE_SIZE
    || publicKeyBytes.length !== PUBLIC_KEY_SIZE
    || message.byteLength > 1_048_576
  ) {
    return false
  }

  const native = getNativeMlDsaModule()
  if (native?.verify) {
    try {
      return await native.verify(
        bytesToBase64(message),
        bytesToBase64(signatureBytes),
        bytesToBase64(publicKeyBytes),
      ) === true
    } catch {
      return false
    }
  }

  return verifyDilithiumSignature(message, signature, publicKey)
}

export function verifyDilithiumSignatureMeasured(
  message: Uint8Array,
  signature: string,
  publicKey: string,
): DilithiumOperationMetrics {
  const startedAt = nowMs()
  return {
    ok: verifyDilithiumSignature(message, signature, publicKey),
    source: 'js',
    elapsedMs: nowMs() - startedAt,
  }
}

export async function verifyDilithiumSignatureMeasuredAsync(
  message: Uint8Array,
  signature: string,
  publicKey: string,
): Promise<DilithiumOperationMetrics> {
  const startedAt = nowMs()
  const native = getNativeMlDsaModule()
  const ok = await verifyDilithiumSignatureAsync(message, signature, publicKey)
  return {
    ok,
    source: native?.verify ? 'native' : 'js',
    elapsedMs: nowMs() - startedAt,
  }
}

export function createDilithiumVerifier(publicKey: string): DilithiumVerifier | null {
  try {
    const publicKeyBytes = hexToBytes(publicKey)
    if (publicKeyBytes.length !== PUBLIC_KEY_SIZE) {
      return null
    }

    return (message: Uint8Array, signature: string): boolean => {
      try {
        const signatureBytes = hexToBytes(signature)
        if (signatureBytes.length !== SIGNATURE_SIZE) {
          return false
        }
        return ml_dsa65.verify(signatureBytes, message, publicKeyBytes)
      } catch {
        return false
      }
    }
  } catch {
    return null
  }
}

export function verifyWithDilithiumVerifierMeasured(
  verifier: DilithiumVerifier,
  message: Uint8Array,
  signature: string,
): DilithiumOperationMetrics {
  const startedAt = nowMs()
  return {
    ok: verifier(message, signature),
    source: 'js_reused_public_key',
    elapsedMs: nowMs() - startedAt,
  }
}

export function benchmarkDilithiumVerify(samples: number = 25): DilithiumBenchmarkResult {
  if (!Number.isSafeInteger(samples) || samples < 1 || samples > 500) {
    throw new Error('Invalid ML-DSA-65 benchmark sample count')
  }

  const keyPair = generateDilithiumKeyPair()
  const messages = Array.from({ length: samples }, (_, index) => stringToBytes(`message-${index}`))
  const signatures = messages.map((message) => signWithDilithium(message, keyPair.privateKey))

  const legacyStartedAt = nowMs()
  for (let index = 0; index < samples; index += 1) {
    verifyDilithiumSignatureUncached(messages[index], signatures[index], keyPair.publicKey)
  }
  const legacyTotalMs = nowMs() - legacyStartedAt

  const verifier = createDilithiumVerifier(keyPair.publicKey)
  if (!verifier) {
    throw new Error('Failed to create ML-DSA-65 verifier')
  }
  const reusedStartedAt = nowMs()
  for (let index = 0; index < samples; index += 1) {
    verifier(messages[index], signatures[index])
  }
  const reusedTotalMs = nowMs() - reusedStartedAt

  return {
    primitive: 'ml_dsa65_verify',
    samples,
    legacy: {
      totalMs: legacyTotalMs,
      avgMs: legacyTotalMs / samples,
    },
    reusedPublicKey: {
      totalMs: reusedTotalMs,
      avgMs: reusedTotalMs / samples,
    },
    speedupPercent: ((legacyTotalMs - reusedTotalMs) / legacyTotalMs) * 100,
  }
}

/**
 * Validate that a public key has the correct format and length
 * 
 * @param publicKey Hex-encoded public key
 * @returns True if the key appears valid
 */
export function isValidPublicKey(publicKey: string): boolean {
  try {
    const bytes = hexToBytes(publicKey)
    return bytes.length === PUBLIC_KEY_SIZE
  } catch {
    return false
  }
}

