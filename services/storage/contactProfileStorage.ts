/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 */

import { getAppKeyValueStorage } from './keyValueStorage'
import { decrypt, encrypt } from '@spectra/identity-vault'
import type { SignedContactProfile } from '@spectra/core-crypto'

import { STORAGE_KEYS } from '@/lib/constants'

type EncryptedContactProfile = {
  version: 1
  data: string
  iv: string
  updatedAt: number
}

const updateQueues = new Map<string, Promise<void>>()

function storageKey(ownerWalletAddress: string, identityId: string): string {
  return `${STORAGE_KEYS.CONTACT_PROFILE_PREFIX}:${ownerWalletAddress}:${encodeURIComponent(identityId)}`
}

function associatedData(ownerWalletAddress: string, identityId: string): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({
    purpose: 'Spectra.ContactProfile.Local.v1',
    ownerWalletAddress,
    identityId,
  }))
}

export async function loadContactProfile(
  ownerWalletAddress: string,
  identityId: string,
  encryptionKey: Uint8Array,
): Promise<SignedContactProfile | null> {
  const raw = await getAppKeyValueStorage().getItem(storageKey(ownerWalletAddress, identityId))
  if (!raw) return null
  try {
    const encrypted = JSON.parse(raw) as EncryptedContactProfile
    if (
      encrypted.version !== 1
      || typeof encrypted.data !== 'string'
      || typeof encrypted.iv !== 'string'
    ) {
      throw new Error('Invalid profile storage')
    }
    return JSON.parse(decrypt(
      encrypted.data,
      encrypted.iv,
      encryptionKey,
      associatedData(ownerWalletAddress, identityId),
    )) as SignedContactProfile
  } catch {
    throw new Error('Contact profile storage is unreadable')
  }
}

export async function saveContactProfile(
  ownerWalletAddress: string,
  identityId: string,
  encryptionKey: Uint8Array,
  profile: SignedContactProfile,
): Promise<void> {
  const key = storageKey(ownerWalletAddress, identityId)
  const previous = updateQueues.get(key) ?? Promise.resolve()
  const write = previous.catch(() => undefined).then(async () => {
    const encrypted = encrypt(
      JSON.stringify(profile),
      encryptionKey,
      associatedData(ownerWalletAddress, identityId),
    )
    const record: EncryptedContactProfile = {
      version: 1,
      data: encrypted.ciphertext,
      iv: encrypted.iv,
      updatedAt: Date.now(),
    }
    await getAppKeyValueStorage().setItem(key, JSON.stringify(record))
  })
  const tail = write.then(() => undefined, () => undefined)
  updateQueues.set(key, tail)
  try {
    await write
  } finally {
    if (updateQueues.get(key) === tail) {
      updateQueues.delete(key)
    }
  }
}

export async function clearContactProfile(
  ownerWalletAddress: string,
  identityId: string,
): Promise<void> {
  const key = storageKey(ownerWalletAddress, identityId)
  const previous = updateQueues.get(key) ?? Promise.resolve()
  const clear = previous.catch(() => undefined).then(() => getAppKeyValueStorage().removeItem(key))
  const tail = clear.then(() => undefined, () => undefined)
  updateQueues.set(key, tail)
  try {
    await clear
  } finally {
    if (updateQueues.get(key) === tail) {
      updateQueues.delete(key)
    }
  }
}
