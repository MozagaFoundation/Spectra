/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { getAppKeyValueStorage } from './keyValueStorage'
import {
  createEmptyAddressBookSnapshot,
  normalizeAddressBookSnapshot,
  upsertAddressBookEntries,
} from '@/lib/addressBook/addressBookState'
import {
  decrypt,
  encrypt,
} from '@spectra/identity-vault'
import { STORAGE_KEYS } from '@/lib/constants'
import type {
  AddressBookSnapshot,
  EncryptedAddressBookSnapshot,
} from '@/lib/types'
import { useWalletStore } from '@/store/walletStore'

const updateQueues = new Map<string, Promise<void>>()

function getAddressBookStorageKey(ownerWalletAddress: string): string {
  return `${STORAGE_KEYS.ADDRESS_BOOK_PREFIX}:${ownerWalletAddress}`
}

function getActiveAddressBookContext(): { ownerWalletAddress: string; encryptionKey: Uint8Array } {
  const { wallet, getActiveAddressBookKey } = useWalletStore.getState()
  if (!wallet) {
    throw new Error('Wallet not connected')
  }

  const encryptionKey = getActiveAddressBookKey()
  if (!encryptionKey) {
    throw new Error('Address book key unavailable')
  }

  return {
    ownerWalletAddress: wallet.address,
    encryptionKey,
  }
}

export async function loadAddressBookSnapshot(
  ownerWalletAddress: string,
  encryptionKey: Uint8Array,
): Promise<AddressBookSnapshot> {
  const storageKey = getAddressBookStorageKey(ownerWalletAddress)
  const raw = await getAppKeyValueStorage().getItem(storageKey)

  if (!raw) {
    return createEmptyAddressBookSnapshot(ownerWalletAddress)
  }

  const encryptedSnapshot = JSON.parse(raw) as EncryptedAddressBookSnapshot
  const decrypted = decrypt(encryptedSnapshot.data, encryptedSnapshot.iv, encryptionKey)
  const parsed = JSON.parse(decrypted) as AddressBookSnapshot

  return normalizeAddressBookSnapshot(parsed, ownerWalletAddress)
}

export async function saveAddressBookSnapshot(
  ownerWalletAddress: string,
  encryptionKey: Uint8Array,
  snapshot: AddressBookSnapshot,
): Promise<AddressBookSnapshot> {
  const normalized = normalizeAddressBookSnapshot(snapshot, ownerWalletAddress)
  const encrypted = encrypt(JSON.stringify(normalized), encryptionKey)
  const payload: EncryptedAddressBookSnapshot = {
    version: normalized.version,
    data: encrypted.ciphertext,
    iv: encrypted.iv,
    updatedAt: Date.now(),
  }

  await getAppKeyValueStorage().setItem(
    getAddressBookStorageKey(ownerWalletAddress),
    JSON.stringify(payload),
  )

  return normalized
}

export async function updateAddressBookSnapshot(
  ownerWalletAddress: string,
  encryptionKey: Uint8Array,
  updater: (snapshot: AddressBookSnapshot) => AddressBookSnapshot | Promise<AddressBookSnapshot>,
): Promise<AddressBookSnapshot> {
  const previousUpdate = updateQueues.get(ownerWalletAddress) ?? Promise.resolve()
  const currentUpdate = previousUpdate
    .catch(() => undefined)
    .then(async () => {
      const current = await loadAddressBookSnapshot(ownerWalletAddress, encryptionKey)
      const next = await updater(current)
      return saveAddressBookSnapshot(ownerWalletAddress, encryptionKey, next)
    })
  const queueTail = currentUpdate.then(() => undefined, () => undefined)
  updateQueues.set(ownerWalletAddress, queueTail)

  try {
    return await currentUpdate
  } finally {
    if (updateQueues.get(ownerWalletAddress) === queueTail) {
      updateQueues.delete(ownerWalletAddress)
    }
  }
}

export async function clearAddressBookSnapshot(ownerWalletAddress: string): Promise<void> {
  const previousUpdate = updateQueues.get(ownerWalletAddress) ?? Promise.resolve()
  const clearOperation = previousUpdate
    .catch(() => undefined)
    .then(() => getAppKeyValueStorage().removeItem(getAddressBookStorageKey(ownerWalletAddress)))
  const queueTail = clearOperation.then(() => undefined, () => undefined)
  updateQueues.set(ownerWalletAddress, queueTail)
  try {
    await clearOperation
  } finally {
    if (updateQueues.get(ownerWalletAddress) === queueTail) {
      updateQueues.delete(ownerWalletAddress)
    }
  }
}

export async function loadActiveAddressBookSnapshot(): Promise<AddressBookSnapshot> {
  const { ownerWalletAddress, encryptionKey } = getActiveAddressBookContext()
  return loadAddressBookSnapshot(ownerWalletAddress, encryptionKey)
}

export async function updateActiveAddressBookSnapshot(
  updater: (snapshot: AddressBookSnapshot) => AddressBookSnapshot | Promise<AddressBookSnapshot>,
): Promise<AddressBookSnapshot> {
  const { ownerWalletAddress, encryptionKey } = getActiveAddressBookContext()
  return updateAddressBookSnapshot(ownerWalletAddress, encryptionKey, updater)
}

export async function exportActiveAddressBookBackupSnapshot(): Promise<AddressBookSnapshot> {
  return loadActiveAddressBookSnapshot()
}

export async function importActiveAddressBookBackupSnapshot(
  snapshot: AddressBookSnapshot,
  options: { replaceExisting?: boolean } = {},
): Promise<AddressBookSnapshot> {
  const { ownerWalletAddress, encryptionKey } = getActiveAddressBookContext()
  if (!options.replaceExisting) {
    const current = await loadAddressBookSnapshot(ownerWalletAddress, encryptionKey)
    const restored = upsertAddressBookEntries(
      current,
      snapshot.entries.map((entry) => ({
        walletAddress: entry.walletAddress,
        identityId: entry.lastKnownIdentityId,
        displayName: entry.displayName,
        isSaved: entry.isSaved,
        isHidden: false,
        trustState: entry.trustState,
        contactProfile: entry.contactProfile,
        lastSharedProfileRevision: entry.lastSharedProfileRevision,
        lastSharedProfileSignature: entry.lastSharedProfileSignature,
        createdAt: entry.createdAt,
        updatedAt: Date.now(),
      })),
    )
    return saveAddressBookSnapshot(ownerWalletAddress, encryptionKey, normalizeAddressBookSnapshot({
      ...restored,
      tags: [
        ...restored.tags,
        ...snapshot.tags.filter((incoming) => !restored.tags.some((existing) => existing.id === incoming.id)),
      ],
    }, ownerWalletAddress))
  }

  return saveAddressBookSnapshot(ownerWalletAddress, encryptionKey, {
    ...snapshot,
    ownerWalletAddress,
  })
}
