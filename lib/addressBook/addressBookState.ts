/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { AddressBookEntry, AddressBookSnapshot, TrustState, UserTag } from '../types'
import { normalizeAddressBookWalletAddress } from './contactKeys'

const ADDRESS_BOOK_SCHEMA_VERSION = 1

function generateAddressBookId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
}

function normalizeWalletAddress(walletAddress?: string | null): string | undefined {
  return normalizeAddressBookWalletAddress(walletAddress)
}

function normalizeIdentityId(identityId?: string | null): string | undefined {
  const normalized = identityId?.trim()
  return normalized ? normalized : undefined
}

function parseAddressBookKey(key?: string | null): {
  walletAddress?: string
  identityId?: string
} {
  const normalized = key?.trim()
  if (!normalized) {
    return {}
  }

  if (normalized.startsWith('wallet:')) {
    return {
      walletAddress: normalizeWalletAddress(normalized.slice('wallet:'.length)),
    }
  }

  if (normalized.startsWith('identity:')) {
    return {
      identityId: normalizeIdentityId(normalized.slice('identity:'.length)),
    }
  }

  return {}
}

function buildAddressBookKey(params: {
  walletAddress?: string | null
  identityId?: string | null
}): string | null {
  const walletAddress = normalizeWalletAddress(params.walletAddress)
  if (walletAddress) {
    return `wallet:${walletAddress}`
  }

  const identityId = normalizeIdentityId(params.identityId)
  if (identityId) {
    return `identity:${identityId}`
  }

  return null
}

function getAddressBookLookupKeys(params: {
  walletAddress?: string | null
  identityId?: string | null
}): string[] {
  const keys: string[] = []
  const walletKey = buildAddressBookKey({ walletAddress: params.walletAddress })
  const identityKey = buildAddressBookKey({ identityId: params.identityId })

  if (walletKey) {
    keys.push(walletKey)
  }

  if (identityKey && identityKey !== walletKey) {
    keys.push(identityKey)
  }

  return keys
}

function getEntryWalletAddress(entry: AddressBookEntry): string | undefined {
  return normalizeWalletAddress(entry.walletAddress) || parseAddressBookKey(entry.key).walletAddress
}

function getEntryIdentityId(entry: AddressBookEntry): string | undefined {
  return normalizeIdentityId(entry.lastKnownIdentityId) || parseAddressBookKey(entry.key).identityId
}

function entryMatchesContact(
  entry: AddressBookEntry,
  params: { walletAddress?: string | null; identityId?: string | null },
): boolean {
  const lookupKeys = new Set(getAddressBookLookupKeys(params))
  const normalizedWalletAddress = normalizeWalletAddress(params.walletAddress)
  const normalizedIdentityId = normalizeIdentityId(params.identityId)
  const entryWalletAddress = getEntryWalletAddress(entry)
  const entryIdentityId = getEntryIdentityId(entry)
  const entryKey = buildAddressBookKey({
    walletAddress: entryWalletAddress,
    identityId: entryIdentityId,
  }) || entry.key

  if (lookupKeys.has(entryKey)) {
    return true
  }

  if (normalizedWalletAddress && entryWalletAddress === normalizedWalletAddress) {
    return true
  }

  if (normalizedIdentityId && entryIdentityId === normalizedIdentityId) {
    return true
  }

  return false
}

const TRUST_STATE_PRIORITY: Record<TrustState, number> = {
  unknown: 0,
  trusted: 1,
  verified: 2,
  changed: 3,
  blocked: 4,
}

export function mergeTrustState(left?: TrustState, right?: TrustState): TrustState | undefined {
  if (!left) return right
  if (!right) return left
  return TRUST_STATE_PRIORITY[right] > TRUST_STATE_PRIORITY[left] ? right : left
}

function isFiniteTimestamp(value: number | undefined): value is number {
  return Number.isFinite(value)
}

function newestTextValue(
  entries: AddressBookEntry[],
  selector: (entry: AddressBookEntry) => string | undefined,
): string | undefined {
  return [...entries]
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .map((entry) => selector(entry)?.trim())
    .find((value): value is string => Boolean(value))
}

function newestContactProfile(
  entries: AddressBookEntry[],
  identityId?: string,
): AddressBookEntry['contactProfile'] {
  return [...entries]
    .map((entry) => entry.contactProfile)
    .filter((profile): profile is NonNullable<AddressBookEntry['contactProfile']> =>
      Boolean(profile) && (!identityId || profile!.identityId === identityId),
    )
    .sort((left, right) => right.revision - left.revision)
    .at(0)
}

function highestSharedProfileRevision(entries: AddressBookEntry[]): number | undefined {
  const revisions = entries
    .map((entry) => entry.lastSharedProfileRevision)
    .filter((revision): revision is number =>
      typeof revision === 'number' && Number.isSafeInteger(revision) && revision >= 0,
    )
  return revisions.length > 0 ? Math.max(...revisions) : undefined
}

function latestSharedProfileSignature(entries: AddressBookEntry[]): string | undefined {
  return [...entries]
    .filter((entry) =>
      typeof entry.lastSharedProfileSignature === 'string'
      && /^0x[0-9a-f]{6618}$/i.test(entry.lastSharedProfileSignature)
      && Number.isSafeInteger(entry.lastSharedProfileRevision),
    )
    .sort((left, right) => {
      const revisionDifference = (right.lastSharedProfileRevision ?? 0)
        - (left.lastSharedProfileRevision ?? 0)
      return revisionDifference || (right.updatedAt || 0) - (left.updatedAt || 0)
    })
    .map((entry) => entry.lastSharedProfileSignature)
    .find((signature): signature is string => Boolean(signature))
}

function mergeAddressBookEntries(entries: AddressBookEntry[]): AddressBookEntry | null {
  if (entries.length === 0) {
    return null
  }

  const walletAddress = newestTextValue(entries, getEntryWalletAddress)
  const lastKnownIdentityId = newestTextValue(entries, getEntryIdentityId)
  const createdAtValues = entries.map((entry) => entry.createdAt).filter(isFiniteTimestamp)
  const updatedAtValues = entries.map((entry) => entry.updatedAt).filter(isFiniteTimestamp)
  const bundleVersions = entries.map((entry) => entry.bundleVersion).filter(isFiniteTimestamp)
  const verifiedAtValues = entries.map((entry) => entry.identityVerifiedAt).filter(isFiniteTimestamp)
  const now = Date.now()
  const key = buildAddressBookKey({ walletAddress, identityId: lastKnownIdentityId }) || entries[0].key

  return {
    key,
    walletAddress,
    lastKnownIdentityId,
    displayName: newestTextValue(entries, (entry) => entry.displayName),
    isSaved: entries.some((entry) => entry.isSaved),
    isHidden: entries.some((entry) => entry.isHidden),
    trustState: entries.reduce<TrustState | undefined>(
      (state, entry) => mergeTrustState(state, entry.trustState),
      undefined,
    ),
    contactProfile: newestContactProfile(entries, lastKnownIdentityId),
    lastSharedProfileRevision: highestSharedProfileRevision(entries),
    lastSharedProfileSignature: latestSharedProfileSignature(entries),
    bundleVersion: bundleVersions.length > 0 ? Math.max(...bundleVersions) : undefined,
    identityVerifiedAt: verifiedAtValues.length > 0 ? Math.max(...verifiedAtValues) : undefined,
    createdAt: createdAtValues.length > 0 ? Math.min(...createdAtValues) : now,
    updatedAt: updatedAtValues.length > 0 ? Math.max(...updatedAtValues) : now,
  }
}

export function createEmptyAddressBookSnapshot(ownerWalletAddress: string): AddressBookSnapshot {
  return {
    version: ADDRESS_BOOK_SCHEMA_VERSION,
    ownerWalletAddress,
    entries: [],
    tags: [],
  }
}

function normalizeTag(tag: UserTag, ownerWalletAddress: string): UserTag {
  const tagName = tag.tagName.replace(/^#/, '').trim().toLowerCase()
  const uniqueWallets = [...new Set(
    tag.contactWalletAddresses
      .map((walletAddress) => normalizeWalletAddress(walletAddress))
      .filter((walletAddress): walletAddress is string => Boolean(walletAddress)),
  )]

  return {
    id: tag.id || generateAddressBookId(),
    ownerWalletAddress: normalizeWalletAddress(tag.ownerWalletAddress) || ownerWalletAddress,
    tagName,
    createdAt: Number.isFinite(tag.createdAt) ? tag.createdAt : Date.now(),
    contactWalletAddresses: uniqueWallets,
  }
}

function normalizeContactProfile(
  value: AddressBookEntry['contactProfile'],
  identityId?: string,
): AddressBookEntry['contactProfile'] {
  if (
    !value
    || value.version !== 1
    || typeof value.identityId !== 'string'
    || (identityId && value.identityId !== identityId)
    || !Number.isSafeInteger(value.revision)
    || value.revision < 1
    || typeof value.signature !== 'string'
    || !/^0x[0-9a-f]{6618}$/i.test(value.signature)
    || (value.displayName !== undefined && typeof value.displayName !== 'string')
    || (value.avatarDataUri !== undefined && (
      typeof value.avatarDataUri !== 'string'
      || value.avatarDataUri.length > 180_000
    ))
  ) {
    return undefined
  }
  return {
    version: 1,
    identityId: value.identityId,
    revision: value.revision,
    ...(value.displayName ? { displayName: value.displayName } : {}),
    ...(value.avatarDataUri ? { avatarDataUri: value.avatarDataUri } : {}),
    signature: value.signature,
  }
}

function normalizeAddressBookEntry(rawEntry: AddressBookEntry): AddressBookEntry | null {
  const keyParts = parseAddressBookKey(rawEntry.key)
  const walletAddress = normalizeWalletAddress(rawEntry.walletAddress) || keyParts.walletAddress
  const lastKnownIdentityId = normalizeIdentityId(rawEntry.lastKnownIdentityId) || keyParts.identityId
  const key = buildAddressBookKey({ walletAddress, identityId: lastKnownIdentityId }) || rawEntry.key?.trim()

  if (!key) {
    return null
  }

  return {
    key,
    walletAddress,
    lastKnownIdentityId,
    displayName: rawEntry.displayName?.trim() || undefined,
    isSaved: rawEntry.isSaved ?? false,
    isHidden: rawEntry.isHidden ?? false,
    trustState: rawEntry.trustState,
    contactProfile: normalizeContactProfile(rawEntry.contactProfile, lastKnownIdentityId),
    lastSharedProfileRevision: Number.isSafeInteger(rawEntry.lastSharedProfileRevision)
        && (rawEntry.lastSharedProfileRevision ?? -1) >= 0
      ? rawEntry.lastSharedProfileRevision
      : undefined,
    lastSharedProfileSignature: typeof rawEntry.lastSharedProfileSignature === 'string'
        && /^0x[0-9a-f]{6618}$/i.test(rawEntry.lastSharedProfileSignature)
      ? rawEntry.lastSharedProfileSignature
      : undefined,
    bundleVersion: Number.isSafeInteger(rawEntry.bundleVersion) && (rawEntry.bundleVersion ?? 0) > 0
      ? rawEntry.bundleVersion
      : undefined,
    identityVerifiedAt: Number.isFinite(rawEntry.identityVerifiedAt) &&
        (rawEntry.identityVerifiedAt ?? 0) > 0
      ? rawEntry.identityVerifiedAt
      : undefined,
    createdAt: Number.isFinite(rawEntry.createdAt) ? rawEntry.createdAt : Date.now(),
    updatedAt: Number.isFinite(rawEntry.updatedAt) ? rawEntry.updatedAt : Date.now(),
  }
}

function normalizeAddressBookEntries(rawEntries: AddressBookEntry[]): AddressBookEntry[] {
  const entries = rawEntries
    .map(normalizeAddressBookEntry)
    .filter((entry): entry is AddressBookEntry => Boolean(entry))
  const parents = entries.map((_, index) => index)
  const walletOwners = new Map<string, number>()
  const identityOwners = new Map<string, number>()

  const root = (index: number): number => {
    let current = index
    while (parents[current] !== current) {
      parents[current] = parents[parents[current]]
      current = parents[current]
    }
    return current
  }
  const union = (left: number, right: number): void => {
    const leftRoot = root(left)
    const rightRoot = root(right)
    if (leftRoot !== rightRoot) {
      parents[rightRoot] = leftRoot
    }
  }

  entries.forEach((entry, index) => {
    const walletAddress = getEntryWalletAddress(entry)
    const identityId = getEntryIdentityId(entry)
    if (walletAddress) {
      const owner = walletOwners.get(walletAddress)
      if (owner === undefined) walletOwners.set(walletAddress, index)
      else union(index, owner)
    }
    if (identityId) {
      const owner = identityOwners.get(identityId)
      if (owner === undefined) identityOwners.set(identityId, index)
      else union(index, owner)
    }
  })

  const groups = new Map<number, AddressBookEntry[]>()
  entries.forEach((entry, index) => {
    const groupRoot = root(index)
    const group = groups.get(groupRoot)
    if (group) group.push(entry)
    else groups.set(groupRoot, [entry])
  })

  return [...groups.values()]
    .map(mergeAddressBookEntries)
    .filter((entry): entry is AddressBookEntry => Boolean(entry))
}

export function normalizeAddressBookSnapshot(
  snapshot: Partial<AddressBookSnapshot> | null | undefined,
  ownerWalletAddress: string,
): AddressBookSnapshot {
  const normalized = createEmptyAddressBookSnapshot(ownerWalletAddress)
  normalized.version = snapshot?.version ?? ADDRESS_BOOK_SCHEMA_VERSION
  normalized.entries = normalizeAddressBookEntries(snapshot?.entries || [])

  normalized.tags = (snapshot?.tags || [])
    .filter((tag) => Boolean(tag?.tagName?.trim()))
    .map((tag) => normalizeTag(tag, ownerWalletAddress))

  return normalized
}

export type AddressBookEntryUpdate = {
  walletAddress?: string | null
  identityId?: string | null
  displayName?: string | null
  isSaved?: boolean
  isHidden?: boolean
  trustState?: TrustState
  contactProfile?: AddressBookEntry['contactProfile']
  lastSharedProfileRevision?: number
  lastSharedProfileSignature?: string
  bundleVersion?: number
  identityVerifiedAt?: number
  createdAt?: number
  updatedAt?: number
}

export function findAddressBookEntry(
  entries: AddressBookEntry[],
  params: { walletAddress?: string | null; identityId?: string | null },
): AddressBookEntry | undefined {
  return entries.find((entry) => entryMatchesContact(entry, params))
}

export function upsertAddressBookEntry(
  snapshot: AddressBookSnapshot,
  params: AddressBookEntryUpdate,
): AddressBookSnapshot {
  return upsertAddressBookEntries(snapshot, [params])
}

export function upsertAddressBookEntries(
  snapshot: AddressBookSnapshot,
  updates: AddressBookEntryUpdate[],
): AddressBookSnapshot {
  if (updates.length === 0) {
    return snapshot
  }

  const normalizedSnapshot = normalizeAddressBookSnapshot(snapshot, snapshot.ownerWalletAddress)
  const entries: Array<AddressBookEntry | null> = [...normalizedSnapshot.entries]
  const walletIndex = new Map<string, number>()
  const identityIndex = new Map<string, number>()
  const indexEntry = (entry: AddressBookEntry, index: number): void => {
    const walletAddress = getEntryWalletAddress(entry)
    const identityId = getEntryIdentityId(entry)
    if (walletAddress) walletIndex.set(walletAddress, index)
    if (identityId) identityIndex.set(identityId, index)
  }
  entries.forEach((entry, index) => {
    if (entry) indexEntry(entry, index)
  })

  for (const params of updates) {
    const walletAddress = normalizeWalletAddress(params.walletAddress)
    const identityId = normalizeIdentityId(params.identityId)
    const matchingIndexes = new Set<number>()
    const walletMatch = walletAddress ? walletIndex.get(walletAddress) : undefined
    const identityMatch = identityId ? identityIndex.get(identityId) : undefined
    if (walletMatch !== undefined) matchingIndexes.add(walletMatch)
    if (identityMatch !== undefined) matchingIndexes.add(identityMatch)
    const matchingEntries = [...matchingIndexes]
      .map((index) => entries[index])
      .filter((entry): entry is AddressBookEntry => Boolean(entry))
    const existing = mergeAddressBookEntries(matchingEntries)
    const nextWalletAddress = walletAddress || existing?.walletAddress
    const nextIdentityId = identityId || existing?.lastKnownIdentityId
    const nextKey = buildAddressBookKey({ walletAddress: nextWalletAddress, identityId: nextIdentityId })

    if (!nextKey) {
      continue
    }

    const now = params.updatedAt ?? Date.now()
    const incomingProfile = normalizeContactProfile(params.contactProfile, nextIdentityId)
    const existingProfile = normalizeContactProfile(existing?.contactProfile, nextIdentityId)
    const contactProfile = incomingProfile && (
      !existingProfile || incomingProfile.revision >= existingProfile.revision
    )
      ? incomingProfile
      : existingProfile
    const existingSharedRevision = existing?.lastSharedProfileRevision ?? 0
    const incomingSharedRevision = Number.isSafeInteger(params.lastSharedProfileRevision)
      && (params.lastSharedProfileRevision ?? -1) >= 0
      ? params.lastSharedProfileRevision!
      : undefined
    const incomingSharedSignature = typeof params.lastSharedProfileSignature === 'string'
      && /^0x[0-9a-f]{6618}$/i.test(params.lastSharedProfileSignature)
      ? params.lastSharedProfileSignature
      : undefined
    const useIncomingShareState = incomingSharedRevision !== undefined
      && incomingSharedRevision >= existingSharedRevision
    const merged: AddressBookEntry = {
      ...existing,
      key: nextKey,
      walletAddress: nextWalletAddress,
      lastKnownIdentityId: nextIdentityId,
      displayName: params.displayName?.trim() || existing?.displayName,
      isSaved: params.isSaved ?? existing?.isSaved ?? false,
      isHidden: params.isHidden ?? existing?.isHidden ?? false,
      trustState: params.trustState ?? existing?.trustState,
      contactProfile,
      lastSharedProfileRevision: useIncomingShareState
        ? incomingSharedRevision
        : existing?.lastSharedProfileRevision,
      lastSharedProfileSignature: useIncomingShareState && incomingSharedSignature
        ? incomingSharedSignature
        : existing?.lastSharedProfileSignature,
      bundleVersion: params.bundleVersion ?? existing?.bundleVersion,
      identityVerifiedAt: params.identityVerifiedAt ?? existing?.identityVerifiedAt,
      createdAt: existing?.createdAt ?? params.createdAt ?? now,
      updatedAt: now,
    }

    for (const index of matchingIndexes) {
      const entry = entries[index]
      if (!entry) continue
      const entryWallet = getEntryWalletAddress(entry)
      const entryIdentity = getEntryIdentityId(entry)
      if (entryWallet && walletIndex.get(entryWallet) === index) walletIndex.delete(entryWallet)
      if (entryIdentity && identityIndex.get(entryIdentity) === index) identityIndex.delete(entryIdentity)
      entries[index] = null
    }
    const nextIndex = entries.push(merged) - 1
    indexEntry(merged, nextIndex)
  }

  return normalizeAddressBookSnapshot({
    ...normalizedSnapshot,
    entries: entries.filter((entry): entry is AddressBookEntry => Boolean(entry)),
  }, snapshot.ownerWalletAddress)
}

export function removeAddressBookEntry(
  snapshot: AddressBookSnapshot,
  params: { walletAddress?: string | null; identityId?: string | null },
): AddressBookSnapshot {
  const normalizedSnapshot = normalizeAddressBookSnapshot(snapshot, snapshot.ownerWalletAddress)
  const remaining: AddressBookEntry[] = []
  const removedWallets = new Set<string>()
  for (const entry of normalizedSnapshot.entries) {
    if (entryMatchesContact(entry, params)) {
      const walletAddress = getEntryWalletAddress(entry)
      if (walletAddress) removedWallets.add(walletAddress)
      continue
    }
    remaining.push(entry)
  }

  let next: AddressBookSnapshot = {
    ...normalizedSnapshot,
    entries: remaining,
  }
  for (const walletAddress of removedWallets) {
    for (const tag of next.tags) {
      next = removeWalletFromLocalTag(next, tag.id, walletAddress)
    }
  }

  return normalizeAddressBookSnapshot(next, snapshot.ownerWalletAddress)
}

export function createLocalTag(
  ownerWalletAddress: string,
  tagName: string,
): UserTag {
  return {
    id: generateAddressBookId(),
    ownerWalletAddress,
    tagName: tagName.replace(/^#/, '').trim().toLowerCase(),
    createdAt: Date.now(),
    contactWalletAddresses: [],
  }
}

export function upsertLocalTag(
  snapshot: AddressBookSnapshot,
  tag: UserTag,
): AddressBookSnapshot {
  const normalizedTag = normalizeTag(tag, snapshot.ownerWalletAddress)
  const otherTags = snapshot.tags.filter((entry) => entry.id !== normalizedTag.id)

  return {
    ...snapshot,
    tags: [...otherTags, normalizedTag].sort((a, b) => a.createdAt - b.createdAt),
  }
}

export function removeLocalTag(
  snapshot: AddressBookSnapshot,
  tagId: string,
): AddressBookSnapshot {
  return {
    ...snapshot,
    tags: snapshot.tags.filter((tag) => tag.id !== tagId),
  }
}

export function addWalletToLocalTag(
  snapshot: AddressBookSnapshot,
  tagId: string,
  walletAddress: string,
): AddressBookSnapshot {
  const normalizedWalletAddress = normalizeWalletAddress(walletAddress)
  if (!normalizedWalletAddress) {
    return snapshot
  }

  return {
    ...snapshot,
    tags: snapshot.tags.map((tag) => {
      if (tag.id !== tagId) {
        return tag
      }

      const existingWallets = tag.contactWalletAddresses
        .map((entry) => normalizeWalletAddress(entry))
        .filter((entry): entry is string => Boolean(entry))

      if (existingWallets.includes(normalizedWalletAddress)) {
        return {
          ...tag,
          contactWalletAddresses: [...new Set(existingWallets)],
        }
      }

      return {
        ...tag,
        contactWalletAddresses: [...new Set([...existingWallets, normalizedWalletAddress])],
      }
    }),
  }
}

export function removeWalletFromLocalTag(
  snapshot: AddressBookSnapshot,
  tagId: string,
  walletAddress: string,
): AddressBookSnapshot {
  const normalizedWalletAddress = normalizeWalletAddress(walletAddress)
  if (!normalizedWalletAddress) {
    return snapshot
  }

  return {
    ...snapshot,
    tags: snapshot.tags.map((tag) => {
      if (tag.id !== tagId) {
        return tag
      }

      return {
        ...tag,
        contactWalletAddresses: [...new Set(
          tag.contactWalletAddresses
            .map((entry) => normalizeWalletAddress(entry))
            .filter((entry): entry is string => Boolean(entry) && entry !== normalizedWalletAddress),
        )],
      }
    }),
  }
}
