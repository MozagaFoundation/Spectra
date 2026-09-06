/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { gcm } from '@noble/ciphers/aes'
import { pbkdf2 } from '@noble/hashes/pbkdf2'
import { sha256 } from '@noble/hashes/sha256'
import type { EncryptedVault, VaultKeySlot, VaultKeySlotType } from './types'

export const LEGACY_PBKDF2_ITERATIONS = 10000
export const CURRENT_PBKDF2_ITERATIONS = 100000
export const CURRENT_VAULT_ENCRYPTION_VERSION = 4
export const RECOVERY_PASSPHRASE_MIN_LENGTH = 16
export const RECOVERY_PASSPHRASE_MIN_ENTROPY_BITS = 80
const SALT_LENGTH = 16
const IV_LENGTH = 12
const KEY_LENGTH = 32
const VAULT_AEAD_VERSION = 2
const LEGACY_VAULT_KEY_SLOT_ENCRYPTION_VERSION = 3
const VAULT_KEY_SLOT_VERSION = 1
const DEFAULT_PIN_DEVICE_SLOT_ID = 'pin_device_v1'
const DEFAULT_RECOVERY_SLOT_ID = 'recovery_passphrase_v1'
const MAX_PBKDF2_ITERATIONS = 2_000_000

export type PinHashFormat = 'sha256_key' | 'raw_pbkdf2' | null

export interface RecoveryPassphraseValidation {
  valid: boolean
  error?: string
  entropyBits: number
}

export type PBKDF2DerivationSource = 'native' | 'js'

export interface PBKDF2DerivationMetrics {
  key: Uint8Array
  source: PBKDF2DerivationSource
  elapsedMs: number
  iterations: number
}

export interface PBKDF2BenchmarkResult {
  primitive: 'pbkdf2_sha256'
  iterations: number
  samples: Array<{
    source: PBKDF2DerivationSource
    elapsedMs: number
  }>
  avgMs: number
  minMs: number
  maxMs: number
}

type PBKDF2NativeModule = {
  deriveKey(pin: string, salt: string, iterations: number): Promise<string>
}

let nativePBKDF2Module: PBKDF2NativeModule | null | undefined

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return bytes
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

export function base64ToBytes(base64: string): Uint8Array {
  if (
    base64.length % 4 !== 0
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)
  ) {
    throw new Error('Invalid Base64 string')
  }
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  const maxLength = Math.max(a.length, b.length)
  let diff = a.length ^ b.length

  for (let i = 0; i < maxLength; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  }

  return diff === 0
}

function vaultAssociatedData(vault: {
  salt: string
  version?: number
  kdfIterations?: number
}): Uint8Array | undefined {
  const version = vault.version ?? 1
  if (version < VAULT_AEAD_VERSION) {
    return undefined
  }

  return new TextEncoder().encode(JSON.stringify({
    version,
    salt: vault.salt,
    kdfIterations: vault.kdfIterations ?? CURRENT_PBKDF2_ITERATIONS,
  }))
}

function assertDirectKeyVaultVersion(version: number | undefined): void {
  const normalized = version ?? 1
  if (
    !Number.isSafeInteger(normalized)
    || normalized < 1
    || normalized > VAULT_AEAD_VERSION
  ) {
    throw new Error('Unsupported vault version')
  }
}

function assertKdfIterations(iterations: number): void {
  if (
    !Number.isSafeInteger(iterations)
    || iterations < 1
    || iterations > MAX_PBKDF2_ITERATIONS
  ) {
    throw new Error('Invalid PBKDF2 iteration count')
  }
}

function legacyVaultKeySlotAssociatedData(): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({
    version: LEGACY_VAULT_KEY_SLOT_ENCRYPTION_VERSION,
  }))
}

function keySlotManifest(keySlots: VaultKeySlot[]): Array<{
  id: string
  type: VaultKeySlotType
  version: number
  kdf: string
  salt: string
  iterations: number
  iv: string
  wrappedKey: string
  createdAt: number
}> {
  return keySlots
    .map((slot) => ({
      id: slot.id,
      type: slot.type,
      version: slot.version,
      kdf: slot.kdf,
      salt: slot.salt,
      iterations: slot.iterations,
      iv: slot.iv,
      wrappedKey: slot.wrappedKey,
      createdAt: slot.createdAt,
    }))
    .sort((a, b) => (
      a.type.localeCompare(b.type)
      || a.id.localeCompare(b.id)
      || a.createdAt - b.createdAt
      || a.iv.localeCompare(b.iv)
      || a.wrappedKey.localeCompare(b.wrappedKey)
    ))
}

function vaultKeySlotAssociatedData(keySlots: VaultKeySlot[]): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({
    version: CURRENT_VAULT_ENCRYPTION_VERSION,
    keySlots: keySlotManifest(keySlots),
  }))
}

function keySlotAssociatedData(slot: Omit<VaultKeySlot, 'iv' | 'wrappedKey'>): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({
    id: slot.id,
    type: slot.type,
    version: slot.version,
    kdf: slot.kdf,
    salt: slot.salt,
    iterations: slot.iterations,
    createdAt: slot.createdAt,
  }))
}

function parseVaultJson<T>(json: string): T {
  return JSON.parse(json, (key, value) => {
    if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
      throw new Error('Invalid vault object key')
    }
    return value
  }) as T
}

function encryptBytes(
  plaintext: Uint8Array,
  key: Uint8Array,
  associatedData?: Uint8Array,
): { ciphertext: string; iv: string } {
  const iv = randomBytes(IV_LENGTH)
  const cipher = gcm(key, iv, associatedData)
  const ciphertext = cipher.encrypt(plaintext)

  return {
    ciphertext: bytesToBase64(ciphertext),
    iv: bytesToBase64(iv),
  }
}

function decryptBytes(
  ciphertext: string,
  iv: string,
  key: Uint8Array,
  associatedData?: Uint8Array,
): Uint8Array {
  const cipher = gcm(key, base64ToBytes(iv), associatedData)
  return cipher.decrypt(base64ToBytes(ciphertext))
}

function getNativePBKDF2Module(): PBKDF2NativeModule | null {
  if (nativePBKDF2Module !== undefined) {
    return nativePBKDF2Module
  }

  try {
    const { NativeModules, Platform } = require('react-native')
    nativePBKDF2Module = (Platform.OS === 'ios' || Platform.OS === 'android')
      ? (NativeModules.PBKDF2Module as PBKDF2NativeModule | undefined) ?? null
      : null
  } catch {
    nativePBKDF2Module = null
  }

  return nativePBKDF2Module
}

async function deriveKeyWithNativeModule(
  pin: string,
  salt: Uint8Array,
  iterations: number
): Promise<Uint8Array | null> {
  const mod = getNativePBKDF2Module()
  if (!mod?.deriveKey) {
    return null
  }

  try {
    const keyBase64 = await mod.deriveKey(pin, bytesToBase64(salt), iterations)
    return base64ToBytes(keyBase64)
  } catch (error) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[PBKDF2] Native derivation failed, falling back to JS:', error)
    }
    return null
  }
}

function nowMs(): number {
  return globalThis.performance?.now?.() ?? Date.now()
}

export function deriveKeyWithIterations(
  pin: string,
  salt: Uint8Array,
  iterations: number = CURRENT_PBKDF2_ITERATIONS
): Uint8Array {
  assertKdfIterations(iterations)
  return pbkdf2(sha256, pin, salt, {
    c: iterations,
    dkLen: KEY_LENGTH,
  })
}

export function generateVaultKey(): Uint8Array {
  return randomBytes(KEY_LENGTH)
}

export function generateDeviceSecret(): string {
  return bytesToBase64(randomBytes(KEY_LENGTH))
}

export function isVaultV3(encryptedVault: Pick<EncryptedVault, 'version' | 'keySlots'>): boolean {
  return (
    encryptedVault.version === LEGACY_VAULT_KEY_SLOT_ENCRYPTION_VERSION
    || encryptedVault.version === CURRENT_VAULT_ENCRYPTION_VERSION
  )
    && Array.isArray(encryptedVault.keySlots)
}

export function getVaultKeySlot(
  encryptedVault: Pick<EncryptedVault, 'keySlots'>,
  type: VaultKeySlotType,
): VaultKeySlot | null {
  return encryptedVault.keySlots?.find((slot) => slot.type === type) ?? null
}

export async function deriveKeyWithIterationsAsync(
  pin: string,
  salt: Uint8Array,
  iterations: number = CURRENT_PBKDF2_ITERATIONS
): Promise<Uint8Array> {
  return (await deriveKeyWithIterationsMeasuredAsync(pin, salt, iterations)).key
}

export async function deriveKeyWithIterationsMeasuredAsync(
  pin: string,
  salt: Uint8Array,
  iterations: number = CURRENT_PBKDF2_ITERATIONS
): Promise<PBKDF2DerivationMetrics> {
  assertKdfIterations(iterations)
  const startedAt = nowMs()
  const nativeKey = await deriveKeyWithNativeModule(pin, salt, iterations)
  if (nativeKey) {
    return {
      key: nativeKey,
      source: 'native',
      elapsedMs: nowMs() - startedAt,
      iterations,
    }
  }

  return {
    key: deriveKeyWithIterations(pin, salt, iterations),
    source: 'js',
    elapsedMs: nowMs() - startedAt,
    iterations,
  }
}

export async function benchmarkPBKDF2Async(
  options: {
    pin?: string
    salt?: Uint8Array
    iterations?: number
    samples?: number
  } = {}
): Promise<PBKDF2BenchmarkResult> {
  const pin = options.pin ?? '123456'
  const salt = options.salt ?? generateSalt()
  const iterations = options.iterations ?? CURRENT_PBKDF2_ITERATIONS
  const sampleCount = options.samples ?? 8
  if (!Number.isSafeInteger(sampleCount) || sampleCount < 1 || sampleCount > 100) {
    throw new Error('Invalid PBKDF2 sample count')
  }

  const samples = []
  for (let index = 0; index < sampleCount; index += 1) {
    const measured = await deriveKeyWithIterationsMeasuredAsync(pin, salt, iterations)
    samples.push({
      source: measured.source,
      elapsedMs: measured.elapsedMs,
    })
  }

  const timings = samples.map((sample) => sample.elapsedMs)
  const avgMs = timings.reduce((total, value) => total + value, 0) / timings.length
  return {
    primitive: 'pbkdf2_sha256',
    iterations,
    samples,
    avgMs,
    minMs: Math.min(...timings),
    maxMs: Math.max(...timings),
  }
}

export function deriveKeyAndHash(
  pin: string,
  existingSalt?: string,
  iterations: number = CURRENT_PBKDF2_ITERATIONS
): {
  key: Uint8Array
  pinHash: string
  salt: string
  iterations: number
} {
  const salt = existingSalt ? base64ToBytes(existingSalt) : generateSalt()
  const key = deriveKeyWithIterations(pin, salt, iterations)
  const pinHash = bytesToBase64(sha256(key))
  
  return {
    key,
    pinHash,
    salt: bytesToBase64(salt),
    iterations,
  }
}

export async function deriveKeyAndHashAsync(
  pin: string,
  existingSalt?: string,
  iterations: number = CURRENT_PBKDF2_ITERATIONS
): Promise<{
  key: Uint8Array
  pinHash: string
  salt: string
  iterations: number
}> {
  const salt = existingSalt ? base64ToBytes(existingSalt) : generateSalt()
  const key = await deriveKeyWithIterationsAsync(pin, salt, iterations)

  return {
    key,
    pinHash: bytesToBase64(sha256(key)),
    salt: bytesToBase64(salt),
    iterations,
  }
}

export function encrypt(
  data: string,
  key: Uint8Array,
  associatedData?: Uint8Array,
): { ciphertext: string; iv: string } {
  const iv = randomBytes(IV_LENGTH)
  const plaintext = new TextEncoder().encode(data)
  
  const cipher = gcm(key, iv, associatedData)
  const ciphertext = cipher.encrypt(plaintext)
  
  return {
    ciphertext: bytesToBase64(ciphertext),
    iv: bytesToBase64(iv),
  }
}

export function decrypt(
  ciphertext: string,
  iv: string,
  key: Uint8Array,
  associatedData?: Uint8Array,
): string {
  const ciphertextBytes = base64ToBytes(ciphertext)
  const ivBytes = base64ToBytes(iv)
  
  const cipher = gcm(key, ivBytes, associatedData)
  const plaintext = cipher.decrypt(ciphertextBytes)
  
  return new TextDecoder().decode(plaintext)
}

export function generateSalt(): Uint8Array {
  return randomBytes(SALT_LENGTH)
}

export function encryptVaultWithKey(
  contents: object,
  key: Uint8Array,
  salt: string,
  kdfIterations: number = CURRENT_PBKDF2_ITERATIONS
): {
  data: string
  iv: string
  salt: string
  version: number
  kdfIterations: number
} {
  const version = VAULT_AEAD_VERSION
  const aad = vaultAssociatedData({ salt, version, kdfIterations })
  const { ciphertext, iv } = encrypt(JSON.stringify(contents), key, aad)
  
  return {
    data: ciphertext,
    iv,
    salt,
    version,
    kdfIterations,
  }
}

export function encryptVaultWithVaultKey(
  contents: object,
  vaultKey: Uint8Array,
  keySlots: VaultKeySlot[],
): EncryptedVault {
  const encrypted = encrypt(JSON.stringify(contents), vaultKey, vaultKeySlotAssociatedData(keySlots))

  return {
    data: encrypted.ciphertext,
    iv: encrypted.iv,
    salt: '',
    version: CURRENT_VAULT_ENCRYPTION_VERSION,
    keySlots,
  }
}

export function decryptVaultWithKey<T>(
  encryptedVault: {
    data: string
    iv: string
    salt: string
    version?: number
    kdfIterations?: number
  },
  key: Uint8Array
): T {
  assertDirectKeyVaultVersion(encryptedVault.version)
  try {
    const decrypted = decrypt(
      encryptedVault.data,
      encryptedVault.iv,
      key,
      vaultAssociatedData(encryptedVault),
    )
    return parseVaultJson<T>(decrypted)
  } catch (error) {
    throw new Error('Invalid PIN')
  }
}

export function decryptVaultWithVaultKey<T>(
  encryptedVault: EncryptedVault,
  vaultKey: Uint8Array,
): T {
  if (!isVaultV3(encryptedVault)) {
    throw new Error('Unsupported vault version')
  }
  if (
    encryptedVault.version !== LEGACY_VAULT_KEY_SLOT_ENCRYPTION_VERSION
    && encryptedVault.version !== CURRENT_VAULT_ENCRYPTION_VERSION
  ) {
    throw new Error('Unsupported vault version')
  }

  try {
    const aad = encryptedVault.version === LEGACY_VAULT_KEY_SLOT_ENCRYPTION_VERSION
      ? legacyVaultKeySlotAssociatedData()
      : vaultKeySlotAssociatedData(encryptedVault.keySlots || [])

    const decrypted = decrypt(
      encryptedVault.data,
      encryptedVault.iv,
      vaultKey,
      aad,
    )
    return parseVaultJson<T>(decrypted)
  } catch {
    throw new Error('Invalid vault key')
  }
}

async function deriveSlotWrappingKey(
  secret: string,
  slotSalt: string,
  iterations: number,
): Promise<Uint8Array> {
  return deriveKeyWithIterationsAsync(secret, base64ToBytes(slotSalt), iterations)
}

function pinDeviceSecret(pin: string, deviceSecret: string): string {
  return `${pin}\u0000${deviceSecret}`
}

function recoveryPassphraseSecret(passphrase: string): string {
  return passphrase.normalize('NFKC')
}

function estimateRecoveryPassphraseEntropy(passphrase: string): number {
  const normalized = recoveryPassphraseSecret(passphrase)
  if (normalized.length === 0) return 0

  let charsetSize = 0
  if (/[a-z]/.test(normalized)) charsetSize += 26
  if (/[A-Z]/.test(normalized)) charsetSize += 26
  if (/[0-9]/.test(normalized)) charsetSize += 10
  if (/\s/.test(normalized)) charsetSize += 1
  if (/[^A-Za-z0-9\s]/.test(normalized)) charsetSize += 33
  if (/[^\x00-\x7F]/.test(normalized)) charsetSize += 64

  const repeatedSingleChar = new Set(Array.from(normalized)).size === 1
  if (repeatedSingleChar) return 0

  return Math.floor(normalized.length * Math.log2(Math.max(charsetSize, 1)))
}

export function validateRecoveryPassphrase(passphrase: string): RecoveryPassphraseValidation {
  const normalized = recoveryPassphraseSecret(passphrase)
  const entropyBits = estimateRecoveryPassphraseEntropy(normalized)

  if (normalized.length < RECOVERY_PASSPHRASE_MIN_LENGTH) {
    return {
      valid: false,
      error: `Recovery passphrase must be at least ${RECOVERY_PASSPHRASE_MIN_LENGTH} characters`,
      entropyBits,
    }
  }

  if (entropyBits < RECOVERY_PASSPHRASE_MIN_ENTROPY_BITS) {
    return {
      valid: false,
      error: `Recovery passphrase must have at least ${RECOVERY_PASSPHRASE_MIN_ENTROPY_BITS} bits of estimated entropy`,
      entropyBits,
    }
  }

  return { valid: true, entropyBits }
}

async function createVaultKeySlot(
  type: VaultKeySlotType,
  secret: string,
  vaultKey: Uint8Array,
  options?: {
    id?: string
    iterations?: number
    createdAt?: number
  },
): Promise<VaultKeySlot> {
  const salt = bytesToBase64(generateSalt())
  const slotWithoutCiphertext = {
    id: options?.id ?? (type === 'pin_device' ? DEFAULT_PIN_DEVICE_SLOT_ID : DEFAULT_RECOVERY_SLOT_ID),
    type,
    version: VAULT_KEY_SLOT_VERSION,
    kdf: 'pbkdf2_sha256' as const,
    salt,
    iterations: options?.iterations ?? CURRENT_PBKDF2_ITERATIONS,
    createdAt: options?.createdAt ?? Date.now(),
  }
  const wrappingKey = await deriveSlotWrappingKey(
    secret,
    slotWithoutCiphertext.salt,
    slotWithoutCiphertext.iterations,
  )
  const { ciphertext, iv } = encryptBytes(
    vaultKey,
    wrappingKey,
    keySlotAssociatedData(slotWithoutCiphertext),
  )

  return {
    ...slotWithoutCiphertext,
    iv,
    wrappedKey: ciphertext,
  }
}

async function unwrapVaultKeyFromSlot(slot: VaultKeySlot, secret: string): Promise<Uint8Array> {
  if (slot.version !== VAULT_KEY_SLOT_VERSION || slot.kdf !== 'pbkdf2_sha256') {
    throw new Error('Unsupported vault key slot')
  }

  const wrappingKey = await deriveSlotWrappingKey(secret, slot.salt, slot.iterations)
  const vaultKey = decryptBytes(
    slot.wrappedKey,
    slot.iv,
    wrappingKey,
    keySlotAssociatedData(slot),
  )

  if (vaultKey.length !== KEY_LENGTH) {
    throw new Error('Invalid vault key length')
  }

  return vaultKey
}

export function createPinDeviceVaultKeySlot(
  pin: string,
  deviceSecret: string,
  vaultKey: Uint8Array,
  options?: {
    id?: string
    iterations?: number
    createdAt?: number
  },
): Promise<VaultKeySlot> {
  return createVaultKeySlot('pin_device', pinDeviceSecret(pin, deviceSecret), vaultKey, options)
}

export function unwrapVaultKeyWithPinDeviceSlot(
  pin: string,
  deviceSecret: string,
  slot: VaultKeySlot,
): Promise<Uint8Array> {
  if (slot.type !== 'pin_device') {
    throw new Error('Invalid vault key slot type')
  }
  return unwrapVaultKeyFromSlot(slot, pinDeviceSecret(pin, deviceSecret))
}

export async function createRecoveryPassphraseVaultKeySlot(
  passphrase: string,
  vaultKey: Uint8Array,
  options?: {
    id?: string
    iterations?: number
    createdAt?: number
  },
): Promise<VaultKeySlot> {
  const validation = validateRecoveryPassphrase(passphrase)
  if (!validation.valid) {
    throw new Error(validation.error)
  }
  return createVaultKeySlot('recovery_passphrase', recoveryPassphraseSecret(passphrase), vaultKey, options)
}

export function unwrapVaultKeyWithRecoveryPassphraseSlot(
  passphrase: string,
  slot: VaultKeySlot,
): Promise<Uint8Array> {
  if (slot.type !== 'recovery_passphrase') {
    throw new Error('Invalid vault key slot type')
  }
  return unwrapVaultKeyFromSlot(slot, recoveryPassphraseSecret(passphrase))
}

export function verifyPinAndGetKey(
  pin: string,
  storedHash: string,
  storedSalt: string,
  iterations: number = CURRENT_PBKDF2_ITERATIONS
): {
  valid: boolean
  key: Uint8Array | null
  hashFormat: PinHashFormat
} {
  let storedHashBytes: Uint8Array
  let salt: Uint8Array
  try {
    storedHashBytes = base64ToBytes(storedHash)
    salt = base64ToBytes(storedSalt)
  } catch {
    return { valid: false, key: null, hashFormat: null }
  }

  const key = deriveKeyWithIterations(pin, salt, iterations)
  
  const newFormatHash = sha256(key)
  if (constantTimeEqual(newFormatHash, storedHashBytes)) {
    return { valid: true, key, hashFormat: 'sha256_key' }
  }
  
  // Legacy verifier: raw PBKDF2 output.
  if (constantTimeEqual(key, storedHashBytes)) {
    return { valid: true, key, hashFormat: 'raw_pbkdf2' }
  }
  
  return { valid: false, key: null, hashFormat: null }
}

export async function verifyPinAndGetKeyAsync(
  pin: string,
  storedHash: string,
  storedSalt: string,
  iterations: number = CURRENT_PBKDF2_ITERATIONS
): Promise<{
  valid: boolean
  key: Uint8Array | null
  hashFormat: PinHashFormat
}> {
  let storedHashBytes: Uint8Array
  let salt: Uint8Array
  try {
    storedHashBytes = base64ToBytes(storedHash)
    salt = base64ToBytes(storedSalt)
  } catch {
    return { valid: false, key: null, hashFormat: null }
  }

  const key = await deriveKeyWithIterationsAsync(pin, salt, iterations)

  const newFormatHash = sha256(key)
  if (constantTimeEqual(newFormatHash, storedHashBytes)) {
    return { valid: true, key, hashFormat: 'sha256_key' }
  }

  if (constantTimeEqual(key, storedHashBytes)) {
    return { valid: true, key, hashFormat: 'raw_pbkdf2' }
  }

  return { valid: false, key: null, hashFormat: null }
}

export function verifyPin(
  pin: string,
  storedHash: string,
  storedSalt: string,
  iterations: number = CURRENT_PBKDF2_ITERATIONS
): boolean {
  return verifyPinAndGetKey(pin, storedHash, storedSalt, iterations).valid
}

export async function verifyPinAsync(
  pin: string,
  storedHash: string,
  storedSalt: string,
  iterations: number = CURRENT_PBKDF2_ITERATIONS
): Promise<boolean> {
  return (await verifyPinAndGetKeyAsync(pin, storedHash, storedSalt, iterations)).valid
}
