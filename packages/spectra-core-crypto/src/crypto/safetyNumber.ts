/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

/**
 * Safety Number Generation for Identity Verification
 * 
 * Generates human-readable safety numbers that can be compared out-of-band
 * to verify that encryption keys have not been tampered with (MITM protection).
 * 
 * - Uses both parties' identity keys
 * - Produces a 60-digit numeric code (12 groups of 5 digits)
 * - Generates QR code data for easy scanning
 * - Creates a short fingerprint for display
 * 
 * The safety number changes if either party's identity keys change,
 * which would indicate either a new device/reinstall or potential MITM attack.
 */

import { CryptoError, type SafetyNumber, type PublicKeyBundle } from '../types/index'
import { bytesToHex, stringToBytes, concatBytes, base64ToBytes, hexToBytes, bytesToBase64 } from './utils'
import { sha256 } from '@noble/hashes/sha256'

// Constants

// Version for future compatibility
const SAFETY_NUMBER_VERSION = 0

// Number of iterations for safety number derivation
const SAFETY_NUMBER_ITERATIONS = 5200

interface NativeSafetyNumberModule {
  deriveSafetyNumberFingerprint(keyMaterial: string, identityId: string, version: number): Promise<string>
}

let nativeSafetyNumberModule: NativeSafetyNumberModule | null | undefined

export function __setNativeSafetyNumberModuleForTests(module: NativeSafetyNumberModule | null | undefined): void {
  if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'test') {
    return
  }
  nativeSafetyNumberModule = module
}

function getNativeSafetyNumberModule(): NativeSafetyNumberModule | null {
  if (nativeSafetyNumberModule !== undefined) {
    return nativeSafetyNumberModule
  }
  try {
    const { NativeModules } = require('react-native')
    nativeSafetyNumberModule = (NativeModules.MediaCryptoModule as NativeSafetyNumberModule | undefined) ?? null
  } catch {
    nativeSafetyNumberModule = null
  }
  return nativeSafetyNumberModule
}

interface SafetyNumberMaterial {
  identityKey: string
  identityId: string
  mlkemIdentityKey?: string
  dilithiumKey?: string
}

// Safety Number Generation

/**
 * Generate a safety number for two parties
 * 
 * The safety number is deterministic - both parties will generate the same
 * number when using the same keys. The keys are sorted to ensure consistency.
 * 
 * @param localIdentityKey - Local party's identity public key (X25519, base64)
 * @param localIdentityId - Local party's identity ID
 * @param remoteIdentityKey - Remote party's identity public key (X25519, base64)
 * @param remoteIdentityId - Remote party's identity ID
 * @returns SafetyNumber object with multiple representation formats
 */
export function generateSafetyNumber(
  localIdentityKey: string,
  localIdentityId: string,
  remoteIdentityKey: string,
  remoteIdentityId: string
): SafetyNumber {
  return generateSafetyNumberFromMaterials(
    { identityKey: localIdentityKey, identityId: localIdentityId },
    { identityKey: remoteIdentityKey, identityId: remoteIdentityId },
  )
}

export async function generateSafetyNumberAsync(
  localIdentityKey: string,
  localIdentityId: string,
  remoteIdentityKey: string,
  remoteIdentityId: string
): Promise<SafetyNumber> {
  return generateSafetyNumberFromMaterialsAsync(
    { identityKey: localIdentityKey, identityId: localIdentityId },
    { identityKey: remoteIdentityKey, identityId: remoteIdentityId },
  )
}

function generateSafetyNumberFromMaterials(
  local: SafetyNumberMaterial,
  remote: SafetyNumberMaterial,
): SafetyNumber {
  const [first, second] = local.identityId < remote.identityId
    ? [local, remote]
    : [remote, local]

  const firstFingerprint = computeFingerprint(first)
  const secondFingerprint = computeFingerprint(second)
  return finishSafetyNumber(first, second, firstFingerprint, secondFingerprint)
}

async function generateSafetyNumberFromMaterialsAsync(
  local: SafetyNumberMaterial,
  remote: SafetyNumberMaterial,
): Promise<SafetyNumber> {
  const [first, second] = local.identityId < remote.identityId
    ? [local, remote]
    : [remote, local]

  const firstFingerprint = await computeFingerprintAsync(first)
  const secondFingerprint = await computeFingerprintAsync(second)
  return finishSafetyNumber(first, second, firstFingerprint, secondFingerprint)
}

function finishSafetyNumber(
  first: SafetyNumberMaterial,
  second: SafetyNumberMaterial,
  firstFingerprint: Uint8Array,
  secondFingerprint: Uint8Array,
): SafetyNumber {
  const combinedHash = sha256(concatBytes(firstFingerprint, secondFingerprint))
  const fullHash = bytesToHex(combinedHash)
  const numeric = hashToNumeric(combinedHash, 60)
  const fingerprint = formatFingerprint(fullHash.slice(0, 32))
  const qrData = createQRData(first, second)

  return {
    numeric,
    qrData,
    fingerprint,
    fullHash
  }
}

/**
 * Generate safety number from public key bundles
 * Convenience function that extracts keys from bundles
 */
export function generateSafetyNumberFromBundles(
  localBundle: PublicKeyBundle,
  remoteBundle: PublicKeyBundle
): SafetyNumber {
  return generateSafetyNumberFromMaterials(
    {
      identityKey: localBundle.identityKey,
      identityId: localBundle.identityId,
      mlkemIdentityKey: localBundle.mlkemIdentityKey,
      dilithiumKey: localBundle.dilithiumKey,
    },
    {
      identityKey: remoteBundle.identityKey,
      identityId: remoteBundle.identityId,
      mlkemIdentityKey: remoteBundle.mlkemIdentityKey,
      dilithiumKey: remoteBundle.dilithiumKey,
    },
  )
}

export async function generateSafetyNumberFromBundlesAsync(
  localBundle: PublicKeyBundle,
  remoteBundle: PublicKeyBundle
): Promise<SafetyNumber> {
  return generateSafetyNumberFromMaterialsAsync(
    {
      identityKey: localBundle.identityKey,
      identityId: localBundle.identityId,
      mlkemIdentityKey: localBundle.mlkemIdentityKey,
      dilithiumKey: localBundle.dilithiumKey,
    },
    {
      identityKey: remoteBundle.identityKey,
      identityId: remoteBundle.identityId,
      mlkemIdentityKey: remoteBundle.mlkemIdentityKey,
      dilithiumKey: remoteBundle.dilithiumKey,
    },
  )
}

/**
 * Compare two safety numbers for equality
 * Returns true if they match (conversation is secure)
 */
export function compareSafetyNumbers(
  a: SafetyNumber,
  b: SafetyNumber
): boolean {
  return a.numeric === b.numeric && a.fullHash === b.fullHash
}

/**
 * Verify a scanned QR code matches expected keys
 */
export function verifyQRCode(
  qrData: string,
  expectedLocalKey: string,
  expectedLocalId: string,
  expectedRemoteKey: string,
  expectedRemoteId: string
): { valid: boolean; error?: string } {
  try {
    const parsed = parseQRData(qrData)
    if (!parsed) {
      return { valid: false, error: 'Invalid QR data format' }
    }

    // Sort expected values the same way we sorted when generating
    const [expectedFirst, expectedSecond] = expectedLocalId < expectedRemoteId
      ? [{ key: expectedLocalKey, id: expectedLocalId }, { key: expectedRemoteKey, id: expectedRemoteId }]
      : [{ key: expectedRemoteKey, id: expectedRemoteId }, { key: expectedLocalKey, id: expectedLocalId }]

    if (parsed.firstKey !== expectedFirst.key || 
        parsed.firstId !== expectedFirst.id ||
        parsed.secondKey !== expectedSecond.key ||
        parsed.secondId !== expectedSecond.id) {
      return { valid: false, error: 'Keys do not match - potential security issue' }
    }

    return { valid: true }
  } catch (error) {
    return { valid: false, error: `QR verification failed: ${(error as Error).message}` }
  }
}

export function verifyQRCodeFromBundles(
  qrData: string,
  expectedLocalBundle: PublicKeyBundle,
  expectedRemoteBundle: PublicKeyBundle,
): { valid: boolean; error?: string } {
  try {
    const parsed = parseQRData(qrData)
    if (!parsed) {
      return { valid: false, error: 'Invalid QR data format' }
    }

    const [expectedFirst, expectedSecond] = expectedLocalBundle.identityId < expectedRemoteBundle.identityId
      ? [expectedLocalBundle, expectedRemoteBundle]
      : [expectedRemoteBundle, expectedLocalBundle]

    if (
      parsed.firstKey !== expectedFirst.identityKey ||
      parsed.firstId !== expectedFirst.identityId ||
      parsed.firstMlkemKey !== expectedFirst.mlkemIdentityKey ||
      parsed.firstDilithiumKey !== expectedFirst.dilithiumKey ||
      parsed.secondKey !== expectedSecond.identityKey ||
      parsed.secondId !== expectedSecond.identityId ||
      parsed.secondMlkemKey !== expectedSecond.mlkemIdentityKey ||
      parsed.secondDilithiumKey !== expectedSecond.dilithiumKey
    ) {
      return { valid: false, error: 'Keys do not match - potential security issue' }
    }

    return { valid: true }
  } catch (error) {
    return { valid: false, error: `QR verification failed: ${(error as Error).message}` }
  }
}

// Helper Functions

/**
 * Compute the fingerprint for a single party
 */
function computeFingerprint(material: SafetyNumberMaterial): Uint8Array {
  const identityKeyBytes = base64ToBytes(material.identityKey)
  const mlkemIdentityKeyBytes = material.mlkemIdentityKey
    ? base64ToBytes(material.mlkemIdentityKey)
    : new Uint8Array(0)
  const dilithiumKeyBytes = material.dilithiumKey
    ? hexToBytes(material.dilithiumKey)
    : new Uint8Array(0)
  const identityIdBytes = stringToBytes(material.identityId)
  const versionBytes = new Uint8Array([SAFETY_NUMBER_VERSION])
  const keyMaterial = concatBytes(identityKeyBytes, mlkemIdentityKeyBytes, dilithiumKeyBytes)
  let hash = concatBytes(versionBytes, keyMaterial, identityIdBytes)

  for (let i = 0; i < SAFETY_NUMBER_ITERATIONS; i++) {
    hash = sha256(concatBytes(hash, keyMaterial))
  }

  return hash
}

async function computeFingerprintAsync(material: SafetyNumberMaterial): Promise<Uint8Array> {
  const identityKeyBytes = base64ToBytes(material.identityKey)
  const mlkemIdentityKeyBytes = material.mlkemIdentityKey
    ? base64ToBytes(material.mlkemIdentityKey)
    : new Uint8Array(0)
  const dilithiumKeyBytes = material.dilithiumKey
    ? hexToBytes(material.dilithiumKey)
    : new Uint8Array(0)
  const keyMaterial = concatBytes(identityKeyBytes, mlkemIdentityKeyBytes, dilithiumKeyBytes)
  const native = getNativeSafetyNumberModule()
  if (native?.deriveSafetyNumberFingerprint) {
    const hex = await native.deriveSafetyNumberFingerprint(
      bytesToBase64(keyMaterial),
      material.identityId,
      SAFETY_NUMBER_VERSION,
    )
    if (!/^[0-9a-f]{64}$/i.test(hex)) {
      throw new CryptoError('native safety-number KDF returned an invalid digest')
    }
    return hexToBytes(hex)
  }
  return computeFingerprint(material)
}

/**
 * Convert hash bytes to numeric string
 */
function hashToNumeric(hash: Uint8Array, digits: number): string {
  // Use hash bytes to generate digits
  // Each 2 bytes -> 5 digits (0-99999)
  let result = ''
  const bytesPerGroup = 2
  const digitsPerGroup = 5
  const groups = Math.ceil(digits / digitsPerGroup)

  for (let i = 0; i < groups && result.length < digits; i++) {
    // Get 2 bytes and convert to number (0-65535)
    const offset = (i * bytesPerGroup) % hash.length
    const value = (hash[offset] << 8) | hash[(offset + 1) % hash.length]
    
    // Scale to 0-99999 and pad to 5 digits
    const scaled = Math.floor((value / 65536) * 100000)
    result += scaled.toString().padStart(digitsPerGroup, '0')
  }

  // Format as 12 groups of 5 digits
  return formatNumeric(result.slice(0, digits))
}

/**
 * Format numeric string into groups of 5
 */
function formatNumeric(digits: string): string {
  const groups: string[] = []
  for (let i = 0; i < digits.length; i += 5) {
    groups.push(digits.slice(i, i + 5))
  }
  return groups.join(' ')
}

/**
 * Format hex string into groups of 4 characters
 */
function formatFingerprint(hex: string): string {
  const groups: string[] = []
  for (let i = 0; i < hex.length; i += 4) {
    groups.push(hex.slice(i, i + 4).toUpperCase())
  }
  return groups.join(' ')
}

/**
 * Create QR code data payload
 */
function createQRData(
  first: SafetyNumberMaterial,
  second: SafetyNumberMaterial
): string {
  const payload = {
    v: SAFETY_NUMBER_VERSION,
    k1: first.identityKey,
    i1: first.identityId,
    mk1: first.mlkemIdentityKey,
    dk1: first.dilithiumKey,
    k2: second.identityKey,
    i2: second.identityId,
    mk2: second.mlkemIdentityKey,
    dk2: second.dilithiumKey
  }
  return `qcsn:${btoa(JSON.stringify(payload))}`
}

/**
 * Parse QR code data payload
 */
function parseQRData(qrData: string): {
  firstKey: string
  firstId: string
  firstMlkemKey?: string
  firstDilithiumKey?: string
  secondKey: string
  secondId: string
  secondMlkemKey?: string
  secondDilithiumKey?: string
} | null {
  try {
    if (!qrData.startsWith('qcsn:')) {
      return null
    }
    
    const payload = JSON.parse(atob(qrData.slice(5)))
    
    if (payload.v !== SAFETY_NUMBER_VERSION) {
      console.warn('QR code version mismatch')
    }
    
    return {
      firstKey: payload.k1,
      firstId: payload.i1,
      firstMlkemKey: payload.mk1,
      firstDilithiumKey: payload.dk1,
      secondKey: payload.k2,
      secondId: payload.i2,
      secondMlkemKey: payload.mk2,
      secondDilithiumKey: payload.dk2
    }
  } catch {
    return null
  }
}

// Identity Change Detection

/**
 * Check if identity keys have changed since last verification
 * Returns details about what changed
 */
export function checkIdentityChange(
  currentKey: string,
  currentDilithiumKey: string,
  previousKey?: string,
  previousDilithiumKey?: string
): {
  changed: boolean
  identityKeyChanged: boolean
  signingKeyChanged: boolean
} {
  const identityKeyChanged = previousKey !== undefined && previousKey !== currentKey
  const signingKeyChanged = previousDilithiumKey !== undefined && previousDilithiumKey !== currentDilithiumKey
  
  return {
    changed: identityKeyChanged || signingKeyChanged,
    identityKeyChanged,
    signingKeyChanged
  }
}

/**
 * Generate a display-friendly string describing an identity
 * Useful for UI elements
 */
export function formatIdentityForDisplay(
  identityId: string,
  displayName?: string
): string {
  const shortId = identityId.slice(0, 8)
  return displayName ? `${displayName} (${shortId})` : shortId
}
