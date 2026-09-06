/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import * as Crypto from 'expo-crypto'
import * as FileSystem from 'expo-file-system/legacy'
import {
  base64ToBytes,
  bytesToBase64,
  decrypt,
  deriveKeyAndHashAsync,
  encrypt,
} from '@spectra/identity-vault'

import type { AddressBookSnapshot } from '@/lib/types'
import {
  exportActiveAddressBookBackupSnapshot,
  importActiveAddressBookBackupSnapshot,
} from '@/services/storage/addressBookStorage'
import { protectSensitiveFilePath } from '@/services/storage/sensitiveFileProtection'
import { useSpectreStore } from '@/store/spectreStore'
import { useWalletStore } from '@/store/walletStore'

const CONTACT_ARCHIVE_SCHEMA_VERSION = 1
const CONTACT_ARCHIVE_CIPHER = 'AES-256-GCM'
const CONTACT_ARCHIVE_KDF = 'PBKDF2-SHA256'
const CONTACT_ARCHIVE_PBKDF2_ITERATIONS = 600000
const MAX_CONTACT_ARCHIVE_PBKDF2_ITERATIONS = 2_000_000
const MIN_CONTACT_ARCHIVE_PASSPHRASE_LENGTH = 16
const MAX_CONTACT_ARCHIVE_BYTES = 4 * 1024 * 1024
const CONTACT_ARCHIVE_AAD_PREFIX = 'spectra:contact-archive:v1'
const CONTACT_ARCHIVE_DIRECTORY = 'spectra-contact-archives/'

export interface ContactArchiveSnapshot {
  schemaVersion: typeof CONTACT_ARCHIVE_SCHEMA_VERSION
  createdAt: string
  ownerWalletAddress: string
  addressBook: AddressBookSnapshot
}

export interface EncryptedContactArchive {
  schemaVersion: typeof CONTACT_ARCHIVE_SCHEMA_VERSION
  createdAt: string
  ownerWalletAddress: string
  encryption: {
    algorithm: typeof CONTACT_ARCHIVE_CIPHER
    kdf: typeof CONTACT_ARCHIVE_KDF
    iterations: number
    salt: string
    iv: string
    aad: string
  }
  ciphertext: string
}

export interface ContactArchiveSummary {
  contacts: number
}

function normalizeContactArchivePassphrase(passphrase: string): string {
  const trimmed = passphrase.trim()
  if (trimmed.length < MIN_CONTACT_ARCHIVE_PASSPHRASE_LENGTH) {
    throw new Error(
      `Contact archive passphrase must be at least ${MIN_CONTACT_ARCHIVE_PASSPHRASE_LENGTH} characters`,
    )
  }
  if (!/[A-Za-z]/.test(trimmed) || !/[0-9]/.test(trimmed) || !/[^A-Za-z0-9]/.test(trimmed)) {
    throw new Error('Contact archive passphrase must include letters, numbers, and symbols')
  }

  return trimmed
}

function getActiveNormalWallet() {
  if (useSpectreStore.getState().enabled) {
    throw new Error('Contact archives are unavailable while Spectre Mode is active')
  }

  const walletStore = useWalletStore.getState()
  const wallet = walletStore.getActiveWallet()
  if (!wallet) {
    throw new Error('No active wallet is available')
  }
  if (wallet.spectreMode) {
    throw new Error('Contact archives are unavailable for Spectre accounts')
  }
  if (!walletStore.isVaultUnlocked) {
    throw new Error('Unlock the vault before managing a contact archive')
  }
  return wallet
}

function associatedData(ownerWalletAddress: string, createdAt: string): Uint8Array {
  return new TextEncoder().encode(
    `${CONTACT_ARCHIVE_AAD_PREFIX}:${ownerWalletAddress}:${createdAt}`,
  )
}

function summarizeSnapshot(snapshot: ContactArchiveSnapshot): ContactArchiveSummary {
  return { contacts: snapshot.addressBook.entries.length }
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function assertSafeArchiveField(value: unknown, name: string, maxLength: number): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) {
    throw new Error(`Invalid contact archive ${name}`)
  }
}

function parseArchive(value: string): EncryptedContactArchive {
  if (utf8Bytes(value) > MAX_CONTACT_ARCHIVE_BYTES) {
    throw new Error('Contact archive is too large')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error('Contact archive is not valid JSON')
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Contact archive is invalid')
  }

  const record = parsed as Partial<EncryptedContactArchive>
  if (record.schemaVersion !== CONTACT_ARCHIVE_SCHEMA_VERSION) {
    throw new Error('Unsupported contact archive version')
  }
  assertSafeArchiveField(record.createdAt, 'created timestamp', 64)
  if (!Number.isFinite(Date.parse(record.createdAt))) {
    throw new Error('Invalid contact archive created timestamp')
  }
  assertSafeArchiveField(record.ownerWalletAddress, 'owner wallet', 128)
  if (!/^EXO00[0-9a-f]{38}$/i.test(record.ownerWalletAddress)) {
    throw new Error('Invalid contact archive owner wallet')
  }
  if (!record.encryption || typeof record.encryption !== 'object') {
    throw new Error('Invalid contact archive encryption metadata')
  }

  const encryption = record.encryption
  if (
    encryption.algorithm !== CONTACT_ARCHIVE_CIPHER
    || encryption.kdf !== CONTACT_ARCHIVE_KDF
    || !Number.isInteger(encryption.iterations)
    || encryption.iterations < CONTACT_ARCHIVE_PBKDF2_ITERATIONS
    || encryption.iterations > MAX_CONTACT_ARCHIVE_PBKDF2_ITERATIONS
  ) {
    throw new Error('Unsupported contact archive encryption metadata')
  }
  assertSafeArchiveField(encryption.salt, 'salt', 512)
  assertSafeArchiveField(encryption.iv, 'IV', 128)
  assertSafeArchiveField(encryption.aad, 'associated data', 512)
  assertSafeArchiveField(record.ciphertext, 'ciphertext', MAX_CONTACT_ARCHIVE_BYTES * 2)

  return {
    schemaVersion: CONTACT_ARCHIVE_SCHEMA_VERSION,
    createdAt: record.createdAt,
    ownerWalletAddress: `EXO00${record.ownerWalletAddress.slice(5).toLowerCase()}`,
    encryption: {
      algorithm: CONTACT_ARCHIVE_CIPHER,
      kdf: CONTACT_ARCHIVE_KDF,
      iterations: encryption.iterations,
      salt: encryption.salt,
      iv: encryption.iv,
      aad: encryption.aad,
    },
    ciphertext: record.ciphertext,
  }
}

function parseSnapshot(value: string, walletAddress: string): ContactArchiveSnapshot {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error('Contact archive could not be decrypted')
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Contact archive could not be decrypted')
  }

  const snapshot = parsed as Partial<ContactArchiveSnapshot>
  if (
    snapshot.schemaVersion !== CONTACT_ARCHIVE_SCHEMA_VERSION
    || snapshot.ownerWalletAddress !== walletAddress
    || typeof snapshot.createdAt !== 'string'
    || !Number.isFinite(Date.parse(snapshot.createdAt))
    || !snapshot.addressBook
    || typeof snapshot.addressBook !== 'object'
    || !Array.isArray(snapshot.addressBook.entries)
    || snapshot.addressBook.entries.length > 10000
  ) {
    throw new Error('Contact archive contents are invalid')
  }

  return {
    schemaVersion: CONTACT_ARCHIVE_SCHEMA_VERSION,
    createdAt: snapshot.createdAt,
    ownerWalletAddress: walletAddress,
    addressBook: snapshot.addressBook,
  }
}

async function randomFileSuffix(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(12)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function collectContactArchiveSnapshot(): Promise<ContactArchiveSnapshot> {
  const wallet = getActiveNormalWallet()
  return {
    schemaVersion: CONTACT_ARCHIVE_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    ownerWalletAddress: wallet.address,
    addressBook: await exportActiveAddressBookBackupSnapshot(),
  }
}

export async function createContactArchive(passphrase: string): Promise<{
  capsuleJson: string
  summary: ContactArchiveSummary
}> {
  const normalizedPassphrase = normalizeContactArchivePassphrase(passphrase)
  const snapshot = await collectContactArchiveSnapshot()
  const derived = await deriveKeyAndHashAsync(
    normalizedPassphrase,
    undefined,
    CONTACT_ARCHIVE_PBKDF2_ITERATIONS,
  )
  const aad = associatedData(snapshot.ownerWalletAddress, snapshot.createdAt)
  const encrypted = encrypt(JSON.stringify(snapshot), derived.key, aad)
  const capsule: EncryptedContactArchive = {
    schemaVersion: CONTACT_ARCHIVE_SCHEMA_VERSION,
    createdAt: snapshot.createdAt,
    ownerWalletAddress: snapshot.ownerWalletAddress,
    encryption: {
      algorithm: CONTACT_ARCHIVE_CIPHER,
      kdf: CONTACT_ARCHIVE_KDF,
      iterations: derived.iterations,
      salt: derived.salt,
      iv: encrypted.iv,
      aad: bytesToBase64(aad),
    },
    ciphertext: encrypted.ciphertext,
  }

  return {
    capsuleJson: JSON.stringify(capsule),
    summary: summarizeSnapshot(snapshot),
  }
}

export async function writeContactArchiveFile(capsuleJson: string): Promise<string> {
  if (utf8Bytes(capsuleJson) > MAX_CONTACT_ARCHIVE_BYTES) {
    throw new Error('Contact archive is too large')
  }

  const baseDirectory = FileSystem.cacheDirectory
  if (!baseDirectory) {
    throw new Error('No writable temporary directory is available')
  }

  const directory = `${baseDirectory}${CONTACT_ARCHIVE_DIRECTORY}`
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true })
  await protectSensitiveFilePath(directory)
  const fileUri = `${directory}spectra-contacts-${await randomFileSuffix()}.spectra-contacts`

  try {
    await FileSystem.writeAsStringAsync(fileUri, capsuleJson, {
      encoding: FileSystem.EncodingType.UTF8,
    })
    await protectSensitiveFilePath(fileUri)
    return fileUri
  } catch (error) {
    await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => undefined)
    throw error
  }
}

export async function deleteContactArchiveFile(uri: string): Promise<void> {
  await FileSystem.deleteAsync(uri, { idempotent: true })
}

export async function restoreContactArchive(
  uri: string,
  passphrase: string,
  options: { replaceExisting?: boolean } = {},
): Promise<ContactArchiveSummary> {
  const normalizedPassphrase = normalizeContactArchivePassphrase(passphrase)
  const wallet = getActiveNormalWallet()
  const info = await FileSystem.getInfoAsync(uri)
  if (
    !info.exists
    || typeof info.size !== 'number'
    || info.size > MAX_CONTACT_ARCHIVE_BYTES
  ) {
    throw new Error('Contact archive is unavailable or too large')
  }

  const capsule = parseArchive(
    await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 }),
  )
  if (capsule.ownerWalletAddress !== wallet.address) {
    throw new Error('Contact archive belongs to a different wallet')
  }
  if (
    capsule.encryption.aad
    !== bytesToBase64(associatedData(capsule.ownerWalletAddress, capsule.createdAt))
  ) {
    throw new Error('Contact archive encryption metadata is invalid')
  }

  const derived = await deriveKeyAndHashAsync(
    normalizedPassphrase,
    capsule.encryption.salt,
    capsule.encryption.iterations,
  )
  const snapshot = parseSnapshot(
    decrypt(
      capsule.ciphertext,
      capsule.encryption.iv,
      derived.key,
      base64ToBytes(capsule.encryption.aad),
    ),
    wallet.address,
  )
  const rollbackSnapshot = await exportActiveAddressBookBackupSnapshot()

  try {
    await importActiveAddressBookBackupSnapshot(snapshot.addressBook, options)
  } catch (error) {
    await importActiveAddressBookBackupSnapshot(rollbackSnapshot, {
      replaceExisting: true,
    }).catch(() => undefined)
    throw error
  }

  return summarizeSnapshot(snapshot)
}
