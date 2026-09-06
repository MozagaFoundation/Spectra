/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 */

import {
  createSignedContactProfile,
  localChatStorage,
  normalizeContactProfileDisplayName,
  verifySignedContactProfile,
  type PublicKeyBundle,
  type SignedContactProfile,
} from '@spectra/core-crypto'

import {
  findAddressBookEntry,
  upsertAddressBookEntry,
} from '@/lib/addressBook/addressBookState'
import { useWalletStore } from '@/store/walletStore'
import {
  loadActiveAddressBookSnapshot,
  updateActiveAddressBookSnapshot,
} from '@/services/storage/addressBookStorage'
import {
  loadContactProfile,
  saveContactProfile,
} from '@/services/storage/contactProfileStorage'

const ownProfileCache = new Map<string, SignedContactProfile>()
const ownProfileOperations = new Map<string, Promise<void>>()

type ActiveProfileContext = {
  ownerWalletAddress: string
  encryptionKey: Uint8Array
}

export type ContactProfileInput = {
  displayName?: string | null
  avatarDataUri?: string | null
}

function profileCacheKey(ownerWalletAddress: string, identityId: string): string {
  return `${ownerWalletAddress}:${identityId}`
}

async function runOwnProfileOperation<T>(
  context: ActiveProfileContext,
  identityId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const key = profileCacheKey(context.ownerWalletAddress, identityId)
  const previous = ownProfileOperations.get(key) ?? Promise.resolve()
  const result = previous.catch(() => undefined).then(async () => {
    assertCurrentContext(context)
    return operation()
  })
  const tail = result.then(() => undefined, () => undefined)
  ownProfileOperations.set(key, tail)
  try {
    return await result
  } finally {
    if (ownProfileOperations.get(key) === tail) {
      ownProfileOperations.delete(key)
    }
  }
}

function activeProfileContext(): ActiveProfileContext {
  const { wallet, getActiveAddressBookKey } = useWalletStore.getState()
  const encryptionKey = getActiveAddressBookKey()
  if (!wallet || !encryptionKey) {
    throw new Error('Local profile storage is unavailable')
  }
  return {
    ownerWalletAddress: wallet.address,
    encryptionKey,
  }
}

function assertCurrentContext(context: ActiveProfileContext): void {
  if (useWalletStore.getState().wallet?.address !== context.ownerWalletAddress) {
    throw new Error('Chat account changed')
  }
}

async function localIdentity(identityId: string) {
  const identity = await localChatStorage.getIdentity(identityId)
  if (!identity?.dilithiumPrivateKey || !identity.dilithiumPublicKey) {
    throw new Error('Local chat identity is unavailable')
  }
  return identity
}

function normalizeInput(input: ContactProfileInput): {
  displayName?: string
  avatarDataUri?: string
} {
  const hasDisplayName = Object.hasOwn(input, 'displayName')
  const hasAvatarDataUri = Object.hasOwn(input, 'avatarDataUri')
  return {
    ...(hasDisplayName && input.displayName ? {
        displayName: normalizeContactProfileDisplayName(input.displayName),
      } : {}),
    ...(hasAvatarDataUri && input.avatarDataUri ? { avatarDataUri: input.avatarDataUri } : {}),
  }
}

async function loadOrCreateOwnContactProfile(
  context: ActiveProfileContext,
  identityId: string,
): Promise<SignedContactProfile> {
  const cacheKey = profileCacheKey(context.ownerWalletAddress, identityId)
  const identity = await localIdentity(identityId)
  assertCurrentContext(context)
  const cached = ownProfileCache.get(cacheKey)
  if (cached) return cached
  const stored = await loadContactProfile(
    context.ownerWalletAddress,
    identityId,
    context.encryptionKey,
  )
  assertCurrentContext(context)
  if (stored) {
    if (!verifySignedContactProfile(stored, identity.dilithiumPublicKey, identityId)) {
      throw new Error('Local contact profile is invalid')
    }
    ownProfileCache.set(cacheKey, stored)
    return stored
  }
  const profile = createSignedContactProfile({
    version: 1,
    identityId,
    revision: 1,
  }, identity.dilithiumPrivateKey)
  await saveContactProfile(
    context.ownerWalletAddress,
    identityId,
    context.encryptionKey,
    profile,
  )
  assertCurrentContext(context)
  ownProfileCache.set(cacheKey, profile)
  return profile
}

export async function ensureOwnContactProfile(identityId: string): Promise<SignedContactProfile> {
  const context = activeProfileContext()
  return runOwnProfileOperation(
    context,
    identityId,
    () => loadOrCreateOwnContactProfile(context, identityId),
  )
}

export async function updateOwnContactProfile(
  identityId: string,
  input: ContactProfileInput,
): Promise<SignedContactProfile> {
  const context = activeProfileContext()
  return runOwnProfileOperation(context, identityId, async () => {
    const identity = await localIdentity(identityId)
    const current = await loadOrCreateOwnContactProfile(context, identityId)
    assertCurrentContext(context)
    const hasDisplayName = Object.hasOwn(input, 'displayName')
    const hasAvatarDataUri = Object.hasOwn(input, 'avatarDataUri')
    const normalizedInput = normalizeInput(input)
    const profile = createSignedContactProfile({
      version: 1,
      identityId,
      revision: current.revision + 1,
      ...(hasDisplayName
        ? (normalizedInput.displayName ? { displayName: normalizedInput.displayName } : {})
        : (current.displayName ? { displayName: current.displayName } : {})),
      ...(hasAvatarDataUri
        ? (normalizedInput.avatarDataUri ? { avatarDataUri: normalizedInput.avatarDataUri } : {})
        : (current.avatarDataUri ? { avatarDataUri: current.avatarDataUri } : {})),
    }, identity.dilithiumPrivateKey)
    await saveContactProfile(
      context.ownerWalletAddress,
      identityId,
      context.encryptionKey,
      profile,
    )
    assertCurrentContext(context)
    ownProfileCache.set(profileCacheKey(context.ownerWalletAddress, identityId), profile)
    return profile
  })
}

export async function applyContactProfileSnapshot(
  bundle: PublicKeyBundle,
  profile: unknown,
): Promise<boolean> {
  if (!verifySignedContactProfile(profile, bundle.dilithiumKey, bundle.identityId)) {
    return false
  }
  const context = activeProfileContext()
  const walletAddress = bundle.walletAuthorization?.payload.walletAddress
  const verifiedProfile = profile as SignedContactProfile
  let applied = false
  await updateActiveAddressBookSnapshot((snapshot) => {
    assertCurrentContext(context)
    const existing = findAddressBookEntry(snapshot.entries, {
      walletAddress,
      identityId: bundle.identityId,
    })
    const existingProfile = existing?.contactProfile
    if (
      existingProfile
      && (
        existingProfile.revision > verifiedProfile.revision
        || (
          existingProfile.revision === verifiedProfile.revision
          && existingProfile.signature !== verifiedProfile.signature
        )
      )
    ) {
      return snapshot
    }
    if (
      existingProfile?.revision === verifiedProfile.revision
      && existingProfile.signature === verifiedProfile.signature
    ) {
      return snapshot
    }
    applied = true
    return upsertAddressBookEntry(snapshot, {
      walletAddress,
      identityId: bundle.identityId,
      contactProfile: verifiedProfile,
      updatedAt: Date.now(),
    })
  })
  assertCurrentContext(context)
  return applied
}

export async function contactNeedsProfileSync(
  remoteIdentityId: string,
  profile: SignedContactProfile,
): Promise<boolean> {
  const snapshot = await loadActiveAddressBookSnapshot()
  const entry = findAddressBookEntry(snapshot.entries, { identityId: remoteIdentityId })
  return entry?.lastSharedProfileRevision !== profile.revision
    || entry.lastSharedProfileSignature !== profile.signature
}

export async function markContactProfileSynced(
  remoteIdentityId: string,
  profile: Pick<SignedContactProfile, 'revision' | 'signature'>,
): Promise<void> {
  const context = activeProfileContext()
  await updateActiveAddressBookSnapshot((snapshot) => {
    assertCurrentContext(context)
    const entry = findAddressBookEntry(snapshot.entries, { identityId: remoteIdentityId })
    if (!entry) return snapshot
    return upsertAddressBookEntry(snapshot, {
      identityId: remoteIdentityId,
      lastSharedProfileRevision: profile.revision,
      lastSharedProfileSignature: profile.signature,
      updatedAt: Date.now(),
    })
  })
}

export function clearOwnContactProfileMemoryCache(): void {
  ownProfileCache.clear()
}
