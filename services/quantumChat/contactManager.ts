/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

/**
 * Contact management for the QuantumChat service layer.
 */

import * as S from './_state'
import {
  generateSafetyNumberFromBundlesAsync,
  hasIdentityChanged,
  openContactCardProfile,
  verifyPublicKeyBundleAsync,
  verifyPublicKeyBundleWalletAuthorizationAsync,
  verifySignedContactProfile,
  type ContactCardProfileCapsule,
  type SignedContactProfile,
} from '@spectra/core-crypto'
import {
  createEmptyAddressBookSnapshot,
  mergeTrustState,
  upsertAddressBookEntry,
} from '../../lib/addressBook/addressBookState'
import { projectContacts } from '../../lib/addressBook/contactProjection'
import { localChatStorage } from '@spectra/core-crypto/storage/local'
import type { PublicKeyBundle, SafetyNumber } from '@spectra/core-crypto'
import {
  ensureBackendSession,
  hasBoundBackendAccessForIdentity,
  ensureBoundBackendAccessForIdentity,
} from '../backend/session'
import { useChatStore } from '@/store/chatStore'
import { useWalletStore } from '@/store/walletStore'
import {
  isSameAccountStorageScope,
  matchesAccountStorageScope,
} from '@/lib/accountScope'
import { isValidEXOAddress } from '@/lib/utils'
import type { ContactInvite } from '@/lib/contactInvite'
import type { AddressBookSnapshot, ChatContact, KnownPeer, TrustState } from '@/lib/types'
import { markListStartupMetric } from '@/lib/performanceMetrics'
import { yieldToQuantumChatHost } from './cooperativeScheduler'
import {
  loadActiveAddressBookSnapshot,
  updateAddressBookSnapshot,
} from '@/services/storage/addressBookStorage'

// Callback bridge

interface ContactManagerCallbacks {
  resolveWalletAddressForIdentity: (
    identityId: string,
    knownWalletAddress?: string,
    signal?: AbortSignal,
  ) => Promise<string | null>
  fetchContactBundle: (
    identityId: string,
    signal?: AbortSignal,
    inviteCapability?: string,
  ) => Promise<PublicKeyBundle | null>
  fetchDiscoverableContactBundle?: (
    walletAddress: string,
    signal?: AbortSignal,
  ) => Promise<PublicKeyBundle | null>
  fetchOneTimeContactCard?: (
    cardId: string,
    cardCapability: string,
    signal?: AbortSignal,
  ) => Promise<{
    bundle: PublicKeyBundle
    profileCapsule?: ContactCardProfileCapsule
  } | null>
  getCachedIdentityResolutionValue: (cache: Map<string, any>, key: string) => string | null | undefined
  rememberResolvedWalletAddress: (identityId: string, walletAddress: string) => void
}

let callbacks: ContactManagerCallbacks | null = null

export function initContactManager(cbs: ContactManagerCallbacks): void {
  callbacks = cbs
}

function getContactManagerCallbacks(context: string): ContactManagerCallbacks | null {
  if (callbacks) {
    return callbacks
  }

  logContactLookup('callbackBridge.unavailable', { context })
  return null
}

async function ensureBoundContactAccess(signal?: AbortSignal): Promise<boolean> {
  throwIfContactOperationAborted(signal)
  const identityId = S.chatIdentity?.id
  if (!identityId) {
    return false
  }

  if (hasBoundBackendAccessForIdentity(identityId)) {
    return true
  }

  const session = await ensureBoundBackendAccessForIdentity(identityId).catch(() => null)
  throwIfContactOperationAborted(signal)
  return Boolean(session)
}

async function ensureWalletContactAccess(signal?: AbortSignal): Promise<boolean> {
  throwIfContactOperationAborted(signal)
  const session = await ensureBackendSession().catch(() => null)
  throwIfContactOperationAborted(signal)
  return Boolean(session)
}

// Helpers

const CONTACT_LOOKUP_LOG_PREFIX = '[ContactLookup]'
const IDENTITY_CHANGE_VERIFICATION_REQUIRED = 'Contact identity changed and must be verified before messaging'
const CHAT_ACCOUNT_CHANGED = 'Chat account changed'
const LOCAL_BUNDLE_READ_CONCURRENCY = 2
const CONTACT_BUNDLE_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000
const MAX_PENDING_IDENTITY_REPLACEMENTS = 32
const pendingIdentityReplacementBundles = new Map<string, {
  localWalletAddress: string
  replacement: ContactIdentityReplacement
  bundle: PublicKeyBundle
}>()

type ContactOperationOptions = {
  signal?: AbortSignal
  onCommitStart?: () => void
  forceRemoteVerification?: boolean
  requestProfile?: boolean
  contactProfile?: SignedContactProfile
}

function throwIfContactOperationAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  const error = new Error('Contact operation cancelled')
  error.name = 'AbortError'
  throw error
}

export interface ContactIdentityReplacement {
  reason: 'identity_replacement_required'
  oldIdentityId: string
  newIdentityId: string
  walletAddress: string
  safetyNumber: SafetyNumber
  displayName?: string
  walletAuthorized: true
}

export class ContactIdentityChangeError extends Error {
  readonly replacement?: ContactIdentityReplacement

  constructor(replacement?: ContactIdentityReplacement) {
    super(IDENTITY_CHANGE_VERIFICATION_REQUIRED)
    this.name = 'ContactIdentityChangeError'
    this.replacement = replacement
  }
}

function getActiveContact(identityId: string): ChatContact | undefined {
  const walletAddress = useWalletStore.getState().wallet?.address
  return useChatStore.getState().contacts.find(
    (candidate) => candidate.identityId === identityId
      && matchesAccountStorageScope(candidate.localWalletAddress, walletAddress),
  )
}

function findActiveWalletIdentityReplacement(
  identityId: string,
  walletAddress?: string,
): ChatContact | undefined {
  if (!walletAddress) return undefined
  const localWalletAddress = useWalletStore.getState().wallet?.address
  return useChatStore.getState().contacts.find((candidate) => (
    candidate.identityId !== identityId
    && isSameAccountStorageScope(candidate.walletAddress, walletAddress)
    && matchesAccountStorageScope(candidate.localWalletAddress, localWalletAddress)
  ))
}

function hasActiveWalletIdentityReplacement(
  identityId: string,
  walletAddress?: string,
): boolean {
  return Boolean(findActiveWalletIdentityReplacement(identityId, walletAddress))
}

function authorizedBundleWalletAddress(bundle: PublicKeyBundle | null): string | undefined {
  const walletAddress = bundle?.walletAuthorization?.payload.walletAddress
  return typeof walletAddress === 'string' && isValidEXOAddress(walletAddress)
    ? `EXO00${walletAddress.slice(5).toLowerCase()}`
    : undefined
}

export function assertContactIdentityTrusted(identityId: string): void {
  const contact = getActiveContact(identityId)
  if (contact?.identityChanged || contact?.trustState === 'changed') {
    throw new ContactIdentityChangeError()
  }
}

async function persistContactIdentityMismatch(
  contactIdentityId: string,
  walletAddress: string,
  contact?: ChatContact,
): Promise<void> {
  const store = useChatStore.getState()
  const alreadyChanged = contact?.trustState === 'changed' || contact?.identityChanged
  store.updateContact(contactIdentityId, {
    trustState: 'changed',
    identityChanged: true,
    lastSeenAt: Date.now(),
  })
  if (!alreadyChanged) {
    store.addSecurityAlert({
      type: 'identity_key_changed',
      message: `Chat identity changed for ${contact?.displayName || walletAddress}. Verify the safety number before migrating this conversation.`,
      severity: 'high',
      contactId: contactIdentityId,
      requiresAction: true,
    })
  }

  const writes: Promise<unknown>[] = []
  if (S.chatClient) {
    writes.push(S.chatClient.requireContactIdentityVerification(contactIdentityId))
  }
  const walletState = useWalletStore.getState()
  const ownerWalletAddress = contact?.localWalletAddress || walletState.wallet?.address
  const encryptionKey = walletState.getActiveAddressBookKey()
  if (
    ownerWalletAddress
    && encryptionKey
    && isSameAccountStorageScope(walletState.wallet?.address, ownerWalletAddress)
  ) {
    writes.push(updateAddressBookSnapshot(
      ownerWalletAddress,
      encryptionKey,
      (snapshot) => upsertAddressBookEntry(snapshot, {
        walletAddress,
        identityId: contactIdentityId,
        displayName: contact?.displayName,
        isSaved: contact?.isSaved,
        isHidden: contact?.isHidden,
        trustState: 'changed',
        createdAt: contact?.addedAt,
        updatedAt: Date.now(),
      }),
    ))
  }
  const results = await Promise.allSettled(writes)
  let persisted = false
  for (const result of results) {
    if (result.status === 'rejected') {
      console.warn('[verifyContactBundle] Failed to persist identity lock:', result.reason)
    } else {
      persisted = true
    }
  }
  if (!persisted) {
    throw new Error('Contact identity lock could not be persisted')
  }
}

export interface AddContactResult {
  success: boolean
  error?: string
  identityId?: string
  identityReplacement?: ContactIdentityReplacement
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return []

  const results = new Array<R>(items.length)
  let nextIndex = 0
  const workerCount = Math.min(concurrency, items.length)

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex
      nextIndex += 1
      results[currentIndex] = await mapper(items[currentIndex])
    }
  }))

  return results
}

function summarizeLookupValue(value: string | null | undefined, head: number = 10, tail: number = 6): string | null {
  if (!value) return null
  if (value.length <= head + tail) return value
  return `${value.slice(0, head)}...${value.slice(-tail)}`
}

function logContactLookup(event: string, details?: Record<string, unknown>): void {
  if (!__DEV__) return
  if (details) {
    console.log(CONTACT_LOOKUP_LOG_PREFIX, event, details)
    return
  }
  console.log(CONTACT_LOOKUP_LOG_PREFIX, event)
}

async function verifyWalletAuthorizedBundle(
  bundle: PublicKeyBundle,
  walletAddress: string,
): Promise<{ success: boolean; error?: string }> {
  const walletVerification = await verifyPublicKeyBundleWalletAuthorizationAsync(
    bundle,
    walletAddress,
  )
  if (!walletVerification.valid) {
    return {
      success: false,
      error: `Bundle is not authorized by the claimed wallet: ${walletVerification.error}`,
    }
  }
  return { success: true }
}

function getPendingIdentityReplacementBundleKey(
  localWalletAddress: string,
  replacement: ContactIdentityReplacement,
): string {
  return [
    localWalletAddress.toLowerCase(),
    replacement.newIdentityId,
    replacement.safetyNumber.fullHash,
  ].join(':')
}

function rememberPendingIdentityReplacementBundle(
  localWalletAddress: string,
  replacement: ContactIdentityReplacement,
  bundle: PublicKeyBundle,
): void {
  const key = getPendingIdentityReplacementBundleKey(localWalletAddress, replacement)
  pendingIdentityReplacementBundles.delete(key)
  pendingIdentityReplacementBundles.set(key, {
    localWalletAddress,
    replacement,
    bundle,
  })
  if (pendingIdentityReplacementBundles.size > MAX_PENDING_IDENTITY_REPLACEMENTS) {
    const oldestKey = pendingIdentityReplacementBundles.keys().next().value
    if (oldestKey) {
      pendingIdentityReplacementBundles.delete(oldestKey)
    }
  }
}

function getPendingIdentityReplacementBundle(
  localWalletAddress: string,
  replacement: ContactIdentityReplacement,
): PublicKeyBundle | null {
  return pendingIdentityReplacementBundles.get(
    getPendingIdentityReplacementBundleKey(localWalletAddress, replacement),
  )?.bundle ?? null
}

function clearPendingIdentityReplacementBundle(
  localWalletAddress: string,
  replacement: ContactIdentityReplacement,
): void {
  pendingIdentityReplacementBundles.delete(
    getPendingIdentityReplacementBundleKey(localWalletAddress, replacement),
  )
}

function findPendingIdentityReplacement(
  localWalletAddress: string,
  remoteIdentityId: string,
  knownWalletAddress?: string,
): ContactIdentityReplacement | undefined {
  for (const pending of pendingIdentityReplacementBundles.values()) {
    if (
      !isSameAccountStorageScope(pending.localWalletAddress, localWalletAddress)
      || (
        pending.replacement.oldIdentityId !== remoteIdentityId
        && pending.replacement.newIdentityId !== remoteIdentityId
      )
      || (
        knownWalletAddress
        && !isSameAccountStorageScope(
          pending.replacement.walletAddress,
          knownWalletAddress,
        )
      )
    ) {
      continue
    }
    return pending.replacement
  }
  return undefined
}

export async function getPendingContactIdentityReplacement(
  remoteIdentityId: string,
  knownWalletAddress?: string,
): Promise<ContactIdentityReplacement | undefined> {
  const client = S.chatClient
  const ownerWalletAddress = useWalletStore.getState().wallet?.address
  if (!client || !ownerWalletAddress || !remoteIdentityId) {
    return undefined
  }

  const pendingReplacement = findPendingIdentityReplacement(
    ownerWalletAddress,
    remoteIdentityId,
    knownWalletAddress,
  )
  if (pendingReplacement) {
    return pendingReplacement
  }

  const contacts = useChatStore.getState().contacts.filter((contact) => (
    matchesAccountStorageScope(contact.localWalletAddress, ownerWalletAddress)
  ))
  const routedContact = contacts.find((contact) => contact.identityId === remoteIdentityId)
  const walletAddress = knownWalletAddress ?? routedContact?.walletAddress
  if (!walletAddress) {
    return undefined
  }

  const oldContact = contacts.find((contact) => (
    isSameAccountStorageScope(contact.walletAddress, walletAddress)
    && (contact.identityChanged || contact.trustState === 'changed')
  ))
  if (!oldContact) {
    return undefined
  }

  const replacementContact = contacts.find((contact) => (
    contact.identityId !== oldContact.identityId
    && isSameAccountStorageScope(contact.walletAddress, walletAddress)
    && !contact.identityChanged
    && contact.trustState !== 'changed'
    && Boolean(contact.publicKeyBundle)
  ))
  const bundle = replacementContact?.publicKeyBundle
  if (!replacementContact || !bundle || !(await verifyPublicKeyBundleAsync(bundle)).valid) {
    return undefined
  }

  if (!(await verifyWalletAuthorizedBundle(bundle, walletAddress)).success) {
    return undefined
  }

  try {
    const localBundle = await client.getPublicKeyBundle()
    if (
      !localBundle
      || S.chatClient !== client
      || !isSameAccountStorageScope(
        useWalletStore.getState().wallet?.address,
        ownerWalletAddress,
      )
    ) {
      return undefined
    }

    return {
      reason: 'identity_replacement_required',
      oldIdentityId: oldContact.identityId,
      newIdentityId: replacementContact.identityId,
      walletAddress,
      safetyNumber: await generateSafetyNumberFromBundlesAsync(localBundle, bundle),
      displayName: oldContact.displayName || replacementContact.displayName,
      walletAuthorized: true,
    }
  } catch {
    return undefined
  }
}

export async function syncContactsIntoChatClient(
  contacts: ChatContact[],
  expectedWalletAddress?: string,
  signal?: AbortSignal,
): Promise<void> {
  const client = S.chatClient
  if (!client) {
    return
  }

  let processed = 0
  for (const contact of contacts) {
    if (
      signal?.aborted
      ||
      S.chatClient !== client
      || (expectedWalletAddress && !isSameAccountStorageScope(
        useWalletStore.getState().wallet?.address,
        expectedWalletAddress,
      ))
    ) {
      return
    }
    if (
      !contact.publicKeyBundle
      || (contact.trustState !== 'trusted' && contact.trustState !== 'verified')
    ) {
      processed += 1
      if (processed % 4 === 0) {
        await yieldToQuantumChatHost('contact_import', { priority: 'realtime' })
      }
      continue
    }

    const tracked = client.getTrackedIdentity?.(contact.identityId)
    if (
      tracked
      && !hasIdentityChanged(
        tracked,
        contact.publicKeyBundle.identityKey,
        contact.publicKeyBundle.dilithiumKey,
        contact.publicKeyBundle.mlkemIdentityKey,
      )
    ) {
      processed += 1
      if (processed % 4 === 0) {
        await yieldToQuantumChatHost('contact_import', { priority: 'realtime' })
      }
      continue
    }

    try {
      await client.addContact(contact.publicKeyBundle)
    } catch {
      // Already local.
    }
    processed += 1
    if (processed % 4 === 0) {
      await yieldToQuantumChatHost('contact_import', { priority: 'realtime' })
    }
  }
}

async function getLocalIdentityId(): Promise<string | null> {
  if (S.chatIdentity?.id) {
    return S.chatIdentity.id
  }

  const { wallet } = useWalletStore.getState()
  if (!wallet?.address) {
    return null
  }

  const storedIdentity = await localChatStorage.getIdentityByAddress(wallet.address).catch(() => null)
  return storedIdentity?.id ?? null
}

async function getLocalAddressBookSnapshot(): Promise<AddressBookSnapshot> {
  const { wallet } = useWalletStore.getState()
  if (!wallet) {
    throw new Error('Wallet not connected')
  }

  try {
    return await loadActiveAddressBookSnapshot()
  } catch (error) {
    console.warn('Failed to load encrypted address book, using empty local snapshot:', error)
    return createEmptyAddressBookSnapshot(wallet.address)
  }
}

async function loadRuntimeKnownPeers(): Promise<KnownPeer[]> {
  const storeSnapshot = useChatStore.getState()
  const existingContacts = storeSnapshot.contacts
  const uiConversations = storeSnapshot.conversations
  const existingByIdentity = new Map(existingContacts.map((contact) => [contact.identityId, contact]))
  const uiConversationByIdentity = new Map(
    uiConversations.map((conversation) => [conversation.remoteIdentityId, conversation])
  )

  const trackedIdentities = await localChatStorage.getAllTrackedIdentities().catch(() => [])
  const trackedByIdentity = new Map(trackedIdentities.map((tracked) => [tracked.identityId, tracked]))
  const localIdentityId = await getLocalIdentityId()
  const { wallet } = useWalletStore.getState()

  const conversations = S.chatClient
    ? await S.chatClient.getConversations().catch(() => [])
    : localIdentityId
      ? await localChatStorage.getConversations(localIdentityId).catch(() => [])
    : []
  const conversationByIdentity = new Map(
    conversations.map((conversation) => [conversation.remoteIdentityId, conversation])
  )

  const candidateIds = new Set<string>([
    ...existingContacts.map((contact) => contact.identityId),
    ...trackedIdentities.map((tracked) => tracked.identityId),
    ...conversations.map((conversation) => conversation.remoteIdentityId),
    ...uiConversations.map((conversation) => conversation.remoteIdentityId),
  ])

  const localContacts = await mapWithConcurrency(
    [...candidateIds],
    LOCAL_BUNDLE_READ_CONCURRENCY,
    async (identityId): Promise<KnownPeer | null> => {
      await yieldToQuantumChatHost(undefined, { priority: 'realtime' })
      if (!identityId || identityId === localIdentityId) {
        return null
      }

      const existing = existingByIdentity.get(identityId)
      const tracked = trackedByIdentity.get(identityId)
      const conversation = conversationByIdentity.get(identityId)
      const uiConversation = uiConversationByIdentity.get(identityId)
      const storedConversation = conversation as { remoteWalletAddress?: string } | undefined
      const localBundle = existing?.publicKeyBundle
        || await localChatStorage.getPublicKeyBundle(identityId).catch(() => null)
      const walletAddress = existing?.walletAddress
        || uiConversation?.remoteWalletAddress
        || storedConversation?.remoteWalletAddress
        || callbacks?.getCachedIdentityResolutionValue(S.walletAddressByIdentityCache, identityId)
        || authorizedBundleWalletAddress(localBundle)
        || undefined

      if (walletAddress) {
        callbacks?.rememberResolvedWalletAddress(identityId, walletAddress)
      }

      if (!existing && !tracked && !conversation && !localBundle) {
        return null
      }

      return {
        localIdentityId: localIdentityId ?? undefined,
        localWalletAddress: wallet?.address,
        identityId,
        walletAddress,
        displayName: existing?.sharedDisplayName || walletAddress || `User ${identityId.slice(0, 8)}`,
        sharedDisplayName: existing?.sharedDisplayName,
        publicKeyBundle: existing?.publicKeyBundle || localBundle || undefined,
        addedAt: existing?.addedAt ?? tracked?.firstSeenAt ?? conversation?.createdAt ?? Date.now(),
        bundleVersion: existing?.bundleVersion ?? localBundle?.version,
        identityVerifiedAt: existing?.identityVerifiedAt,
        trustState: mergeTrustState(existing?.trustState, tracked?.trustState) ?? 'trusted',
        identityChanged: existing?.identityChanged,
        lastSeenAt: existing?.lastSeenAt ?? tracked?.lastUpdatedAt,
        isOnline: existing?.isOnline ?? false,
      }
    })

  return localContacts.filter((contact): contact is KnownPeer => contact !== null)
}

async function loadSavedAddressBookPeers(snapshot: AddressBookSnapshot): Promise<KnownPeer[]> {
  const localIdentityId = await getLocalIdentityId()
  const { wallet } = useWalletStore.getState()
  const existingByIdentity = new Map(
    useChatStore.getState().contacts.map((contact) => [contact.identityId, contact]),
  )

  const peers = await mapWithConcurrency(
    snapshot.entries,
    LOCAL_BUNDLE_READ_CONCURRENCY,
    async (entry): Promise<KnownPeer | null> => {
      await yieldToQuantumChatHost(undefined, { priority: 'realtime' })
      const identityId = entry.lastKnownIdentityId
      if (!identityId || identityId === localIdentityId) {
        return null
      }

      if (
        !entry.isSaved && !entry.isHidden && !entry.displayName &&
        !entry.contactProfile && !entry.trustState
      ) {
        return null
      }

      const existing = existingByIdentity.get(identityId)
      const localBundle = existing?.publicKeyBundle
        || await localChatStorage.getPublicKeyBundle(identityId).catch(() => null)
      return {
        localIdentityId: localIdentityId ?? undefined,
        localWalletAddress: wallet?.address,
        identityId,
        walletAddress: entry.walletAddress,
        displayName: entry.displayName || entry.contactProfile?.displayName || entry.walletAddress ||
          `User ${identityId.slice(0, 8)}`,
        sharedDisplayName: entry.contactProfile?.displayName,
        publicKeyBundle: localBundle || undefined,
        addedAt: entry.createdAt,
        bundleVersion: entry.bundleVersion ?? localBundle?.version,
        identityVerifiedAt: entry.identityVerifiedAt,
        trustState: entry.trustState,
      }
    })

  return peers.filter((peer): peer is KnownPeer => peer !== null)
}

export interface LocalContactHydration {
  walletAddress: string
  snapshot: AddressBookSnapshot
  contacts: ChatContact[]
}

export async function hydrateLocalContactProjection(
  expectedWalletAddress?: string,
): Promise<LocalContactHydration | null> {
  const walletAddress = expectedWalletAddress || useWalletStore.getState().wallet?.address
  if (!walletAddress) {
    return null
  }
  const snapshot = await getLocalAddressBookSnapshot()
  if (!isSameAccountStorageScope(useWalletStore.getState().wallet?.address, walletAddress)) {
    return null
  }
  const initialPeers: KnownPeer[] = snapshot.entries.flatMap((entry) => {
    if (!entry.lastKnownIdentityId) return []
    return [{
      localWalletAddress: walletAddress,
      identityId: entry.lastKnownIdentityId,
      walletAddress: entry.walletAddress,
      displayName: entry.displayName || entry.contactProfile?.displayName || entry.walletAddress ||
        `User ${entry.lastKnownIdentityId.slice(0, 8)}`,
      sharedDisplayName: entry.contactProfile?.displayName,
      addedAt: entry.createdAt,
      trustState: entry.trustState,
    }]
  })
  const initialContacts = projectContacts(initialPeers, snapshot.entries)
    .filter((contact) => matchesAccountStorageScope(contact.localWalletAddress, walletAddress))
    .map((contact) => ({ ...contact, localWalletAddress: walletAddress }))
  const initialStore = useChatStore.getState()
  initialStore.setContacts(initialContacts)
  initialStore.setContactsReady(true)
  markListStartupMetric('first_contact_projection', { count: initialContacts.length })
  markListStartupMetric('contacts_list_ready', { count: initialContacts.length })
  return {
    walletAddress,
    snapshot,
    contacts: initialContacts,
  }
}

function contactUiProjectionMatches(previous: ChatContact[], next: ChatContact[]): boolean {
  if (previous.length !== next.length) return false
  const previousById = new Map(previous.map((contact) => [contact.identityId, contact]))
  for (const nextContact of next) {
    const previousContact = previousById.get(nextContact.identityId)
    if (
      !previousContact
      || previousContact.walletAddress !== nextContact.walletAddress
      || previousContact.displayName !== nextContact.displayName
      || previousContact.trustState !== nextContact.trustState
      || previousContact.identityChanged !== nextContact.identityChanged
      || previousContact.localWalletAddress !== nextContact.localWalletAddress
    ) {
      return false
    }
  }
  return true
}

export async function repairLocalContactProjection(
  hydration: LocalContactHydration,
  signal?: AbortSignal,
): Promise<ChatContact[]> {
  const { walletAddress, snapshot } = hydration
  if (signal?.aborted) {
    return []
  }
  const [runtimePeers, savedPeers] = await Promise.all([
    loadRuntimeKnownPeers(),
    loadSavedAddressBookPeers(snapshot),
  ])
  if (
    signal?.aborted
    || !isSameAccountStorageScope(useWalletStore.getState().wallet?.address, walletAddress)
  ) {
    return []
  }
  const localContacts = projectContacts([...runtimePeers, ...savedPeers], snapshot.entries)
  const scopedContacts = localContacts
    .filter((contact) => matchesAccountStorageScope(contact.localWalletAddress, walletAddress))
    .map((contact) => ({
      ...contact,
      localWalletAddress: walletAddress,
    }))
  const currentContacts = useChatStore.getState().contacts.filter((contact) => (
    matchesAccountStorageScope(contact.localWalletAddress, walletAddress)
  ))
  if (!contactUiProjectionMatches(currentContacts, scopedContacts)) {
    useChatStore.getState().setContacts(scopedContacts)
  }
  await syncContactsIntoChatClient(scopedContacts, walletAddress, signal)
  return scopedContacts
}

export async function refreshLocalContactProjection(
  walletAddress: string,
  signal?: AbortSignal,
): Promise<ChatContact[]> {
  if (
    signal?.aborted ||
    !isSameAccountStorageScope(useWalletStore.getState().wallet?.address, walletAddress)
  ) {
    return []
  }
  const hydration = await hydrateLocalContactProjection(walletAddress)
  if (!hydration || signal?.aborted) {
    return []
  }
  return repairLocalContactProjection(hydration, signal)
}

export async function addContact(
  bundle: PublicKeyBundle,
  displayName?: string,
  walletAddress?: string,
  options: ContactOperationOptions = {},
): Promise<AddContactResult> {
  const client = S.chatClient
  const walletState = useWalletStore.getState()
  const ownerWalletAddress = walletState.wallet?.address
  const encryptionKey = walletState.getActiveAddressBookKey()
  if (!client) {
    return { success: false, error: 'Chat not initialized' }
  }
  if (!ownerWalletAddress || !encryptionKey) {
    return { success: false, error: 'Wallet not connected' }
  }
  const isOperationScopeCurrent = () => (
    S.chatClient === client
    && isSameAccountStorageScope(
      useWalletStore.getState().wallet?.address,
      ownerWalletAddress,
    )
  )
  
  try {
    throwIfContactOperationAborted(options.signal)
    const verification = await verifyPublicKeyBundleAsync(bundle)
    if (!verification.valid) {
      return { success: false, error: `Invalid bundle: ${verification.error}` }
    }

    const authorizedWalletAddress = bundle.walletAuthorization?.payload.walletAddress
    if (typeof authorizedWalletAddress !== 'string') {
      return { success: false, error: 'Bundle is missing an authorized wallet address' }
    }
    const canonicalWalletAddress = walletAddress ?? authorizedWalletAddress

    const walletVerification = await verifyWalletAuthorizedBundle(bundle, canonicalWalletAddress)
    if (!walletVerification.success) {
      return walletVerification
    }
    const contactProfile = options.contactProfile && verifySignedContactProfile(
      options.contactProfile,
      bundle.dilithiumKey,
      bundle.identityId,
    )
      ? options.contactProfile
      : undefined
    throwIfContactOperationAborted(options.signal)

    const store = useChatStore.getState()
    const localIdentityId = S.chatIdentity?.id
      || (await localChatStorage.getIdentityByAddress(ownerWalletAddress).catch(() => null))?.id
    if (!isOperationScopeCurrent()) {
      return { success: false, error: 'Chat account changed' }
    }
    const localContactContext = {
      localIdentityId: localIdentityId || undefined,
      localWalletAddress: ownerWalletAddress,
    }
    const oldContact = store.contacts.find(
      c => isSameAccountStorageScope(c.walletAddress, canonicalWalletAddress)
        && c.identityId !== bundle.identityId
        && matchesAccountStorageScope(c.localWalletAddress, localContactContext.localWalletAddress)
    )
    options.onCommitStart?.()
    if (oldContact) {
      if (isOperationScopeCurrent()) {
        store.updateContact(oldContact.identityId, {
          trustState: 'changed',
          identityChanged: true,
          lastSeenAt: Date.now(),
        })
        store.addSecurityAlert({
          type: 'identity_key_changed',
          message: `Chat identity changed for ${displayName || oldContact.displayName || canonicalWalletAddress}. Verify the safety number before migrating this conversation.`,
          severity: 'high',
          contactId: oldContact.identityId,
          requiresAction: true,
        })
      }
      const lockWrites = await Promise.allSettled([
        client.requireContactIdentityVerification(oldContact.identityId),
        updateAddressBookSnapshot(
          ownerWalletAddress,
          encryptionKey,
          (snapshot) => upsertAddressBookEntry(snapshot, {
            walletAddress: canonicalWalletAddress,
            identityId: oldContact.identityId,
            displayName: oldContact.displayName,
            isSaved: oldContact.isSaved,
            isHidden: oldContact.isHidden,
            trustState: 'changed',
            createdAt: oldContact.addedAt,
            updatedAt: Date.now(),
          }),
        ),
      ])
      const lockPersisted = lockWrites.some((result) => result.status === 'fulfilled')
      for (const result of lockWrites) {
        if (result.status === 'rejected') {
          console.warn('[addContact] Failed to persist identity lock:', result.reason)
        }
      }
      if (!lockPersisted) {
        return {
          success: false,
          error: 'This wallet changed chat identity, but the verification lock could not be persisted.',
          identityId: bundle.identityId,
        }
      }

      try {
        const localBundle = await client.getPublicKeyBundle()
        if (!localBundle || !isOperationScopeCurrent()) {
          return { success: false, error: 'Chat account changed' }
        }
        const safetyNumber = await generateSafetyNumberFromBundlesAsync(localBundle, bundle)
        const identityReplacement: ContactIdentityReplacement = {
          reason: 'identity_replacement_required',
          oldIdentityId: oldContact.identityId,
          newIdentityId: bundle.identityId,
          walletAddress: canonicalWalletAddress,
          safetyNumber,
          displayName: displayName || oldContact.displayName,
          walletAuthorized: true,
        }
        rememberPendingIdentityReplacementBundle(
          ownerWalletAddress,
          identityReplacement,
          bundle,
        )
        return {
          success: false,
          error: 'This wallet now advertises a new chat identity. Verify the safety number before trusting or migrating it.',
          identityId: bundle.identityId,
          identityReplacement,
        }
      } catch {
        return {
          success: false,
          error: 'Replacement safety number could not be prepared',
          identityId: bundle.identityId,
        }
      }
    }

    const result = await client.addContact(bundle, {
      expectedWalletAddress: canonicalWalletAddress,
      signal: options.signal,
    })
    if (!isOperationScopeCurrent()) {
      return { success: false, error: 'Chat account changed' }
    }
    
    let trustState: TrustState = 'trusted'
    if (result.identityChanged) {
      trustState = 'changed'
      
      useChatStore.getState().addSecurityAlert({
        type: 'identity_key_changed',
        message: `Identity keys changed for ${displayName || bundle.identityId}`,
        severity: 'high',
        contactId: bundle.identityId,
        requiresAction: true,
      })
    }
    
    const localAlias = displayName?.trim() || undefined
    const verifiedAt = Date.now()
    const resolvedDisplayName = localAlias || contactProfile?.displayName ||
      `User ${bundle.identityId.slice(0, 8)}`
    const contact: ChatContact = {
      ...localContactContext,
      identityId: bundle.identityId,
      walletAddress: canonicalWalletAddress,
      displayName: resolvedDisplayName,
      sharedDisplayName: contactProfile?.displayName,
      avatarUrl: contactProfile?.avatarDataUri,
      addedAt: Date.now(),
      publicKeyBundle: bundle,
      bundleVersion: bundle.version,
      identityVerifiedAt: verifiedAt,
      trustState,
      identityChanged: result.identityChanged,
      isSaved: true,
      isHidden: false,
    }

    await updateAddressBookSnapshot(
      ownerWalletAddress,
      encryptionKey,
      (snapshot) => upsertAddressBookEntry(snapshot, {
        walletAddress: canonicalWalletAddress,
        identityId: bundle.identityId,
        displayName: localAlias,
        isSaved: true,
        isHidden: false,
        trustState,
        contactProfile,
        bundleVersion: bundle.version,
        identityVerifiedAt: verifiedAt,
        createdAt: contact.addedAt,
        updatedAt: Date.now(),
      }),
    )
    if (!isOperationScopeCurrent()) {
      return { success: false, error: 'Chat account changed' }
    }
    store.addContact(contact)
    if (!result.identityChanged && options.requestProfile !== false) {
      void client.requestContactProfile?.(bundle.identityId).catch(() => undefined)
    }
    
    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

export async function lockConversationIdentityReplacement(
  previousIdentityId: string,
  bundle: PublicKeyBundle,
  walletAddress: string,
  displayName?: string,
): Promise<AddContactResult> {
  const client = S.chatClient
  const ownerWalletAddress = useWalletStore.getState().wallet?.address
  if (!client || !ownerWalletAddress) {
    return { success: false, error: 'Chat not initialized' }
  }
  if (previousIdentityId === bundle.identityId) {
    return { success: false, error: 'Replacement identity must differ from the previous identity' }
  }
  if (!(await verifyPublicKeyBundleAsync(bundle)).valid) {
    return { success: false, error: 'Invalid replacement bundle' }
  }
  const walletVerification = await verifyWalletAuthorizedBundle(bundle, walletAddress)
  if (!walletVerification.success) {
    return walletVerification
  }

  const store = useChatStore.getState()
  const existing = store.contacts.find((contact) => (
    contact.identityId === previousIdentityId
    && isSameAccountStorageScope(contact.walletAddress, walletAddress)
    && matchesAccountStorageScope(contact.localWalletAddress, ownerWalletAddress)
  ))
  if (!existing) {
    store.addContact({
      identityId: previousIdentityId,
      walletAddress,
      displayName: displayName || `User ${previousIdentityId.slice(0, 8)}`,
      addedAt: Date.now(),
      localIdentityId: S.chatIdentity?.id,
      localWalletAddress: ownerWalletAddress,
      trustState: 'changed',
      identityChanged: true,
      isSaved: false,
      isHidden: true,
    })
  }

  return addContact(bundle, displayName, walletAddress)
}

/**
 * Adds a contact from an invitation capability.
 */
export async function addContactByAddress(
  addressOrIdentityId: string,
  displayName?: string,
  options: ContactOperationOptions = {},
  inviteCapability?: string,
): Promise<AddContactResult> {
  if (!S.chatClient || !S.chatIdentity) {
    return { success: false, error: 'Chat not initialized' }
  }
  
  if (!S.bundleServer) {
    return { success: false, error: 'Server not configured' }
  }
  
  try {
    throwIfContactOperationAborted(options.signal)
    const startedAt = Date.now()
    const hadVerifiedAccess = Boolean(
      S.chatIdentity?.id && hasBoundBackendAccessForIdentity(S.chatIdentity.id),
    )
    let verifiedAccessReady = hadVerifiedAccess

    logContactLookup('addContactByAddress.start', {
      query: summarizeLookupValue(addressOrIdentityId),
      displayNameProvided: Boolean(displayName),
      hadVerifiedAccess,
    })

    if (!verifiedAccessReady) {
      const verifiedSession = await ensureBoundBackendAccessForIdentity(S.chatIdentity?.id)
      throwIfContactOperationAborted(options.signal)
      verifiedAccessReady = Boolean(verifiedSession)
      logContactLookup('addContactByAddress.ensureVerifiedAccess', {
        query: summarizeLookupValue(addressOrIdentityId),
        verifiedAccessReady,
      })
    }

    if (!verifiedAccessReady) {
      return { success: false, error: 'Chat identity is not yet verified with the server' }
    }

    const query = addressOrIdentityId.trim()
    const isDiscoverableWalletLookup = isValidEXOAddress(query)
    let identityId = isDiscoverableWalletLookup ? '' : query
    let resolvedWalletAddress = isDiscoverableWalletLookup
      ? `EXO00${query.slice(5).toLowerCase()}`
      : undefined
    if (
      resolvedWalletAddress &&
      isSameAccountStorageScope(useWalletStore.getState().wallet?.address, resolvedWalletAddress)
    ) {
      return { success: false, error: 'You cannot add yourself as a contact' }
    }

    logContactLookup('addContactByAddress.branch', {
      query: summarizeLookupValue(addressOrIdentityId),
      queryType: isDiscoverableWalletLookup ? 'discoverable_wallet' : 'invitation',
      verifiedAccessReady,
    })
    
    logContactLookup('bundleFetch.start', {
      identityId: summarizeLookupValue(identityId),
      walletAddress: summarizeLookupValue(resolvedWalletAddress),
      elapsedMs: Date.now() - startedAt,
    })
    const cbs = getContactManagerCallbacks('addContactByAddress')
    if (!cbs) {
      return { success: false, error: 'Contact lookup is not ready yet' }
    }

    throwIfContactOperationAborted(options.signal)
    options.onCommitStart?.()
    const bundle = isDiscoverableWalletLookup
      ? await cbs.fetchDiscoverableContactBundle?.(resolvedWalletAddress!, options.signal) ?? null
      : await cbs.fetchContactBundle(identityId, options.signal, inviteCapability)
    identityId = bundle?.identityId ?? identityId

    logContactLookup('bundleFetch.result', {
      identityId: summarizeLookupValue(identityId),
      walletAddress: summarizeLookupValue(resolvedWalletAddress),
      bundleFound: Boolean(bundle),
      bundleVersion: bundle?.version ?? null,
      elapsedMs: Date.now() - startedAt,
    })
    
    if (!bundle) {
      logContactLookup('addContactByAddress.fail.bundleMissing', {
        identityId: summarizeLookupValue(identityId),
        walletAddress: summarizeLookupValue(resolvedWalletAddress),
      })
      return {
        success: false,
        error: isDiscoverableWalletLookup
          ? 'Could not find user. They may not have registered yet.'
          : inviteCapability
          ? 'Could not fetch user\'s key bundle. They may need to come online first.'
          : 'A secure contact invitation is required to add a new contact',
      }
    }

    const existingWalletContact = resolvedWalletAddress
      ? useChatStore.getState().contacts.find(
          (contact) => contact.walletAddress === resolvedWalletAddress && contact.identityId !== identityId,
        )
      : undefined
    
    const result = await addContact(
      bundle,
      displayName || existingWalletContact?.displayName,
      resolvedWalletAddress,
      options,
    )

    logContactLookup('contactSave.result', {
      identityId: summarizeLookupValue(identityId),
      walletAddress: summarizeLookupValue(resolvedWalletAddress),
      success: result.success,
      error: result.error ?? null,
      elapsedMs: Date.now() - startedAt,
    })
    
    return { ...result, identityId: bundle.identityId }
  } catch (error) {
    console.error(`${CONTACT_LOOKUP_LOG_PREFIX} addContactByAddress.exception`, {
      query: summarizeLookupValue(addressOrIdentityId),
      error: (error as Error).message,
    })
    return { success: false, error: (error as Error).message }
  }
}

export async function addContactByInvite(
  invite: ContactInvite,
  displayName?: string,
  options: ContactOperationOptions = {},
): Promise<AddContactResult> {
  if (invite.kind === 'contact_card') {
    const cbs = getContactManagerCallbacks('addContactByInvite.contactCard')
    if (!cbs?.fetchOneTimeContactCard) {
      return { success: false, error: 'One-time contact cards are unavailable' }
    }
    try {
      if (!(await ensureWalletContactAccess(options.signal))) {
        return { success: false, error: 'Secure server access is unavailable' }
      }
      const card = await cbs.fetchOneTimeContactCard(
        invite.cardId,
        invite.cardCapability,
        options.signal,
      )
      throwIfContactOperationAborted(options.signal)
      if (!card) {
        return { success: false, error: 'This one-time contact card is unavailable or already used' }
      }
      let contactProfile: SignedContactProfile | undefined
      if (card.profileCapsule && invite.profileCapability) {
        try {
          const profile = openContactCardProfile(
            card.profileCapsule,
            invite.cardId,
            invite.profileCapability,
            card.bundle.identityId,
          )
          if (verifySignedContactProfile(
            profile,
            card.bundle.dilithiumKey,
            card.bundle.identityId,
          )) {
            contactProfile = profile
          }
        } catch {
          // The contact remains usable without its optional profile snapshot.
        }
      }
      const result = await addContact(
        card.bundle,
        displayName,
        card.bundle.walletAuthorization?.payload.walletAddress,
        {
          ...options,
          requestProfile: false,
          contactProfile,
        },
      )
      if (!result.success) return result
      if (!contactProfile) {
        void S.chatClient?.requestContactProfile?.(card.bundle.identityId).catch(() => undefined)
      }
      const ownerWalletAddress = useWalletStore.getState().wallet?.address
      if (ownerWalletAddress) {
        await refreshLocalContactProjection(ownerWalletAddress, options.signal).catch(() => undefined)
      }
      return { ...result, identityId: card.bundle.identityId }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }
  return addContactByAddress(
    invite.identityId,
    displayName,
    options,
    invite.mailboxCapability,
  )
}

export async function acceptContactIdentityReplacement(
  replacement: ContactIdentityReplacement,
  displayName?: string,
): Promise<AddContactResult> {
  const client = S.chatClient
  const walletState = useWalletStore.getState()
  const ownerWalletAddress = walletState.wallet?.address
  const encryptionKey = walletState.getActiveAddressBookKey()
  if (!client || !ownerWalletAddress || !encryptionKey) {
    return { success: false, error: 'Chat not initialized' }
  }
  const isOperationScopeCurrent = () => (
    S.chatClient === client
    && isSameAccountStorageScope(
      useWalletStore.getState().wallet?.address,
      ownerWalletAddress,
    )
  )

  try {
    const cbs = getContactManagerCallbacks('acceptContactIdentityReplacement')
    if (!isOperationScopeCurrent()) {
      return { success: false, error: 'Chat account changed' }
    }

    const store = useChatStore.getState()
    const localIdentityId = S.chatIdentity?.id
      || (await localChatStorage.getIdentityByAddress(ownerWalletAddress).catch(() => null))?.id
    if (!isOperationScopeCurrent()) {
      return { success: false, error: 'Chat account changed' }
    }
    const localContactContext = {
      localIdentityId: localIdentityId || undefined,
      localWalletAddress: ownerWalletAddress,
    }
    const contactMatchesReplacementWallet = (contact: ChatContact) => (
      isSameAccountStorageScope(contact.walletAddress, replacement.walletAddress)
        && matchesAccountStorageScope(contact.localWalletAddress, localContactContext.localWalletAddress)
    )
    const oldContact = store.contacts.find(
      c => c.identityId === replacement.oldIdentityId
        && contactMatchesReplacementWallet(c)
    ) || store.contacts.find(
      c => c.identityId !== replacement.newIdentityId
        && contactMatchesReplacementWallet(c)
    )
    const currentContact = store.contacts.find(
      c => c.identityId === replacement.newIdentityId
        && contactMatchesReplacementWallet(c)
    )
    if (!oldContact && !currentContact) {
      return { success: false, error: 'Original contact was not found' }
    }

    const pendingBundle = getPendingIdentityReplacementBundle(
      ownerWalletAddress,
      replacement,
    )
    const cachedBundle = await localChatStorage.getPublicKeyBundle(replacement.newIdentityId)
      .catch(() => null)
    const fallbackBundle = pendingBundle ?? cachedBundle
    const activeIdentityId = S.chatIdentity?.id
    const hasBoundAccess = Boolean(
      activeIdentityId && hasBoundBackendAccessForIdentity(activeIdentityId),
    )
    const canFetchLiveBundle = Boolean(
      cbs && (
        hasBoundAccess
        || (!fallbackBundle && await ensureBoundContactAccess())
      ),
    )
    const liveBundle = canFetchLiveBundle && cbs
      ? await cbs.fetchDiscoverableContactBundle?.(replacement.walletAddress)
        ?? await cbs.fetchContactBundle(replacement.newIdentityId)
      : null
    const bundle = liveBundle ?? fallbackBundle
    if (!isOperationScopeCurrent()) {
      return { success: false, error: 'Chat account changed' }
    }
    if (!bundle) {
      return { success: false, error: 'Replacement bundle is not available' }
    }
    if (bundle.identityId !== replacement.newIdentityId) {
      return { success: false, error: 'Replacement bundle identity mismatch' }
    }

    const verification = await verifyPublicKeyBundleAsync(bundle)
    if (!verification.valid) {
      return { success: false, error: `Invalid bundle: ${verification.error}` }
    }

    const walletVerification = await verifyWalletAuthorizedBundle(bundle, replacement.walletAddress)
    if (!walletVerification.success) {
      return walletVerification
    }

    const localBundle = await client.getPublicKeyBundle()
    if (!localBundle || !isOperationScopeCurrent()) {
      return { success: false, error: 'Chat account changed' }
    }
    const safetyNumber = await generateSafetyNumberFromBundlesAsync(localBundle, bundle)
    if (safetyNumber.fullHash !== replacement.safetyNumber.fullHash) {
      clearPendingIdentityReplacementBundle(ownerWalletAddress, replacement)
      return {
        success: false,
        error: 'Replacement identity changed. Verify the newly advertised safety number before accepting it.',
      }
    }

    await client.addContact(bundle, {
      expectedWalletAddress: replacement.walletAddress,
    })
    if (!isOperationScopeCurrent()) {
      return { success: false, error: 'Chat account changed' }
    }
    await client.verifyContactIdentity(bundle.identityId)
    if (!isOperationScopeCurrent()) {
      return { success: false, error: 'Chat account changed' }
    }

    const sourceContact = oldContact || currentContact
    const localAlias = displayName?.trim() || replacement.displayName?.trim() ||
      sourceContact?.displayName?.trim()
    const verifiedAt = Date.now()
    const resolvedDisplayName = localAlias || `User ${bundle.identityId.slice(0, 8)}`
    const preservedRemoteState = oldContact?.remoteAccountState === 'deleted'
      ? oldContact
      : currentContact?.remoteAccountState === 'deleted'
        ? currentContact
        : undefined
    const contact: ChatContact = {
      ...localContactContext,
      identityId: bundle.identityId,
      walletAddress: replacement.walletAddress,
      displayName: resolvedDisplayName,
      addedAt: sourceContact?.addedAt || Date.now(),
      publicKeyBundle: bundle,
      bundleVersion: bundle.version,
      identityVerifiedAt: verifiedAt,
      trustState: 'verified',
      identityChanged: false,
      isSaved: true,
      isHidden: false,
      ...(preservedRemoteState
        ? {
            remoteAccountState: 'deleted',
            remoteAccountStateUpdatedAt: preservedRemoteState.remoteAccountStateUpdatedAt,
          }
        : {}),
    }

    await updateAddressBookSnapshot(
      ownerWalletAddress,
      encryptionKey,
      (snapshot) => upsertAddressBookEntry(snapshot, {
        walletAddress: replacement.walletAddress,
        identityId: bundle.identityId,
        displayName: localAlias,
        isSaved: true,
        isHidden: false,
        trustState: 'verified',
        bundleVersion: bundle.version,
        identityVerifiedAt: verifiedAt,
        createdAt: contact.addedAt,
        updatedAt: Date.now(),
      }),
    )

    if (!isOperationScopeCurrent()) {
      return { success: false, error: 'Chat account changed' }
    }
    if (oldContact && currentContact && oldContact.identityId !== bundle.identityId) {
      store.removeContact(oldContact.identityId)
    }
    store.addContact(contact)
    clearPendingIdentityReplacementBundle(ownerWalletAddress, replacement)
    void client.requestContactProfile?.(bundle.identityId).catch(() => undefined)
    return { success: true, identityId: bundle.identityId }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

/**
 * Verifies that a contact's identity still matches their wallet bundle.
 */
export async function verifyContactBundle(
  contactIdentityId: string,
  options: ContactOperationOptions = {},
): Promise<string> {
  throwIfContactOperationAborted(options.signal)
  try {
    assertContactIdentityTrusted(contactIdentityId)
  } catch (error) {
    if (error instanceof ContactIdentityChangeError) {
      const replacement = await getPendingContactIdentityReplacement(contactIdentityId)
      if (replacement) {
        throw new ContactIdentityChangeError(replacement)
      }
    }
    throw error
  }
  const contact = getActiveContact(contactIdentityId)
  const walletAddress = contact?.walletAddress
    ?? contact?.publicKeyBundle?.walletAuthorization?.payload.walletAddress
  const knownWalletIdentityReplacement = hasActiveWalletIdentityReplacement(
    contactIdentityId,
    walletAddress,
  )
  if (
    !options.forceRemoteVerification &&
    contact?.identityVerifiedAt &&
    Date.now() - contact.identityVerifiedAt < CONTACT_BUNDLE_VERIFICATION_TTL_MS &&
    !knownWalletIdentityReplacement
  ) {
    return contactIdentityId
  }
  if (!S.bundleServer || !S.chatClient) {
    if (knownWalletIdentityReplacement) throw new ContactIdentityChangeError()
    console.warn('[verifyContactBundle] Contact verification unavailable, using current identity')
    return contactIdentityId
  }
  const activeClient = S.chatClient

  const cbs = getContactManagerCallbacks('verifyContactBundle')
  if (!cbs) {
    if (knownWalletIdentityReplacement) throw new ContactIdentityChangeError()
    console.warn('[verifyContactBundle] Contact callbacks unavailable, using current identity')
    return contactIdentityId
  }

  if (!(await ensureBoundContactAccess(options.signal))) {
    if (knownWalletIdentityReplacement) throw new ContactIdentityChangeError()
    console.warn('[verifyContactBundle] Verified server access unavailable, using current identity')
    return contactIdentityId
  }

  if (!walletAddress) {
    console.warn(
      `[verifyContactBundle] Wallet address unavailable for ${contactIdentityId.slice(0, 8)}…, using current identity`,
    )
    return contactIdentityId
  }

  const cachedVerification = S.verifiedContactBundleCache.get(walletAddress)
  if (
    !options.forceRemoteVerification &&
    cachedVerification &&
    Date.now() - cachedVerification.checkedAt < S.VERIFIED_CONTACT_BUNDLE_TTL_MS &&
    !knownWalletIdentityReplacement
  ) {
    return cachedVerification.identityId
  }

  let identityChangeDetected = false
  try {
    let bundle = await cbs.fetchContactBundle(contactIdentityId, options.signal)
    throwIfContactOperationAborted(options.signal)
    if (!bundle && cbs.fetchDiscoverableContactBundle) {
      bundle = await cbs.fetchDiscoverableContactBundle(walletAddress, options.signal)
      throwIfContactOperationAborted(options.signal)
    }
    if (S.chatClient !== activeClient) throw new Error(CHAT_ACCOUNT_CHANGED)
    if (!bundle || !(await verifyPublicKeyBundleAsync(bundle)).valid) {
      throw new Error('Contact bundle could not be verified')
    }
    const walletVerification = await verifyWalletAuthorizedBundle(bundle, walletAddress)
    if (!walletVerification.success) throw new Error(walletVerification.error)
    const hasWalletIdentityReplacement = hasActiveWalletIdentityReplacement(
      bundle.identityId,
      walletAddress,
    )
    if (bundle.identityId !== contactIdentityId || hasWalletIdentityReplacement) {
      const replacement = await addContact(
        bundle,
        contact?.displayName,
        walletAddress,
        options,
      )
      if (replacement.identityReplacement) {
        throw new ContactIdentityChangeError(replacement.identityReplacement)
      }
      throw new Error(replacement.error || 'Contact identity changed')
    }
    const refresh = await activeClient.addContact(bundle, {
      expectedWalletAddress: walletAddress,
      signal: options.signal,
    })
    throwIfContactOperationAborted(options.signal)
    if (S.chatClient !== activeClient) throw new Error(CHAT_ACCOUNT_CHANGED)
    if (refresh.identityChanged) {
      identityChangeDetected = true
      options.onCommitStart?.()
      await persistContactIdentityMismatch(contactIdentityId, walletAddress, contact)
      throw new ContactIdentityChangeError()
    }
    options.onCommitStart?.()
    const verifiedAt = Date.now()
    S.verifiedContactBundleCache.set(walletAddress, {
      identityId: contactIdentityId,
      checkedAt: verifiedAt,
    })
    useChatStore.getState().updateContact(contactIdentityId, {
      publicKeyBundle: bundle,
      bundleVersion: bundle.version,
      identityVerifiedAt: verifiedAt,
    })
    const walletState = useWalletStore.getState()
    const ownerWalletAddress = walletState.wallet?.address
    const encryptionKey = walletState.getActiveAddressBookKey()
    if (
      ownerWalletAddress &&
      encryptionKey &&
      matchesAccountStorageScope(contact?.localWalletAddress, ownerWalletAddress)
    ) {
      await updateAddressBookSnapshot(
        ownerWalletAddress,
        encryptionKey,
        (snapshot) => upsertAddressBookEntry(snapshot, {
          walletAddress,
          identityId: contactIdentityId,
          bundleVersion: bundle.version,
          identityVerifiedAt: verifiedAt,
          updatedAt: verifiedAt,
        }),
      )
    }
    return contactIdentityId
  } catch (error) {
    console.warn('[verifyContactBundle] Verification failed:', error)
    if (
      (identityChangeDetected || knownWalletIdentityReplacement)
      && !(error instanceof ContactIdentityChangeError)
    ) {
      throw new ContactIdentityChangeError()
    }
    if (
      (error as Error).name === 'AbortError'
      ||
      error instanceof ContactIdentityChangeError
      || (error as Error).message === IDENTITY_CHANGE_VERIFICATION_REQUIRED
      || (error as Error).message === CHAT_ACCOUNT_CHANGED
    ) {
      throw error
    }
    return contactIdentityId
  }
}

