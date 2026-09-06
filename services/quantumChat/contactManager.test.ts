/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AddressBookSnapshot, ChatContact, Conversation } from '@/lib/types'

const testState = vi.hoisted(() => ({
  activeWalletAddress: 'EXO00owner0000000000000000000000000000000000',
  hasBoundBackendAccessForIdentity: vi.fn(),
  ensureBoundBackendAccessForIdentity: vi.fn(),
  ensureBackendSession: vi.fn(),
  loadAddressBookSnapshot: vi.fn(),
  loadActiveAddressBookSnapshot: vi.fn(),
  updateAddressBookSnapshot: vi.fn(),
  updateActiveAddressBookSnapshot: vi.fn(),
  getIdentityByAddress: vi.fn(),
  getAllTrackedIdentities: vi.fn(),
  getConversations: vi.fn(),
  getPublicKeyBundle: vi.fn(),
  storePublicKeyBundle: vi.fn(),
  storeContactBundle: vi.fn(),
  generateSafetyNumberFromBundles: vi.fn(),
  chatClientAddContact: vi.fn(),
  chatClientGetPublicKeyBundle: vi.fn(),
  chatClientRequireIdentityVerification: vi.fn(async () => {}),
  chatClientVerifyContactIdentity: vi.fn(),
  openContactCardProfile: vi.fn(),
  verifySignedContactProfile: vi.fn(),
  setContacts: vi.fn(),
  setContactsReady: vi.fn(),
  addContact: vi.fn(),
  removeContact: vi.fn(),
  updateContact: vi.fn(),
  updateConversation: vi.fn(),
  addSecurityAlert: vi.fn(),
  store: {
    contacts: [] as ChatContact[],
    conversations: [] as Conversation[],
  },
}))

vi.stubGlobal('__DEV__', false)

vi.mock('react-native', () => ({
  AppState: { currentState: 'active' },
  NativeModules: {},
  Platform: {
    OS: 'ios',
    select: (options: Record<string, unknown>) => (
      options.ios ?? options.native ?? options.default ?? undefined
    ),
  },
  TurboModuleRegistry: {
    get: vi.fn(() => null),
    getEnforcing: vi.fn(() => ({})),
  },
}))

vi.mock('@spectra/core-crypto', () => ({
  openContactCardProfile: testState.openContactCardProfile,
  generateSafetyNumberFromBundlesAsync: vi.fn(async (...args: unknown[]) => (
    testState.generateSafetyNumberFromBundles(...args)
  )),
  storeContactBundle: testState.storeContactBundle,
  hasIdentityChanged: (
    tracked: { currentIdentityKey?: string; currentDilithiumKey?: string; currentMlkemKey?: string },
    identityKey: string,
    dilithiumKey: string,
    mlkemKey?: string,
  ) => (
    tracked.currentIdentityKey !== identityKey
    || tracked.currentDilithiumKey !== dilithiumKey
    || tracked.currentMlkemKey !== mlkemKey
  ),
  verifyPublicKeyBundle: vi.fn(() => ({ valid: true })),
  verifyPublicKeyBundleAsync: vi.fn(async () => ({ valid: true })),
  verifyPublicKeyBundleWalletAuthorization: vi.fn(() => ({ valid: true })),
  verifyPublicKeyBundleWalletAuthorizationAsync: vi.fn(async () => ({ valid: true })),
  verifySignedContactProfile: testState.verifySignedContactProfile,
}))

vi.mock('@/lib/i18n', () => ({
  getCurrentLocaleTag: () => 'en-US',
  translate: (key: string) => key,
}))

vi.mock('@spectra/core-crypto/storage/local', () => ({
  localChatStorage: {
    getIdentityByAddress: testState.getIdentityByAddress,
    getAllTrackedIdentities: testState.getAllTrackedIdentities,
    getConversations: testState.getConversations,
    getPublicKeyBundle: testState.getPublicKeyBundle,
    storePublicKeyBundle: testState.storePublicKeyBundle,
  },
}))

vi.mock('../backend/session', () => ({
  hasBoundBackendAccessForIdentity: testState.hasBoundBackendAccessForIdentity,
  ensureBoundBackendAccessForIdentity: testState.ensureBoundBackendAccessForIdentity,
  ensureBackendSession: testState.ensureBackendSession,
}))

vi.mock('@/services/storage/addressBookStorage', () => ({
  loadAddressBookSnapshot: testState.loadAddressBookSnapshot,
  loadActiveAddressBookSnapshot: testState.loadActiveAddressBookSnapshot,
  updateAddressBookSnapshot: testState.updateAddressBookSnapshot,
  updateActiveAddressBookSnapshot: testState.updateActiveAddressBookSnapshot,
}))

vi.mock('@/store/walletStore', () => ({
  useWalletStore: {
    getState: () => ({
      wallet: { address: testState.activeWalletAddress },
      getActiveAddressBookKey: () => new Uint8Array(32),
    }),
  },
}))

vi.mock('@/store/chatStore', () => ({
  useChatStore: {
    getState: () => ({
      ...testState.store,
      setContacts: testState.setContacts,
      setContactsReady: testState.setContactsReady,
      addContact: testState.addContact,
      removeContact: testState.removeContact,
      updateContact: testState.updateContact,
      updateConversation: testState.updateConversation,
      addSecurityAlert: testState.addSecurityAlert,
    }),
  },
}))

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

function createSnapshot(): AddressBookSnapshot {
  return {
    version: 1,
    ownerWalletAddress: 'EXO00owner0000000000000000000000000000000000',
    entries: [
      {
        key: 'wallet:EXO00alice0000000000000000000000000000000000',
        walletAddress: 'EXO00alice0000000000000000000000000000000000',
        lastKnownIdentityId: 'identity-alice',
        displayName: 'alice',
        isSaved: true,
        isHidden: false,
        createdAt: 10,
        updatedAt: 10,
      },
    ],
    tags: [],
  }
}

function createWalletAuthorizedBundle(identityId: string) {
  return {
    identityId,
    identityKey: 'identity-key',
    mlkemIdentityKey: 'mlkem-key',
    dilithiumKey: 'dilithium-key',
    signedPreKey: {} as any,
    oneTimePreKeys: [],
    version: 1,
    timestamp: 30,
    bundleSignature: 'bundle-signature',
    walletAuthorization: {
      payload: {
        walletAddress: 'EXO00alice0000000000000000000000000000000000',
      },
    },
  } as any
}

const replacementSafetyNumber = {
  numeric: '123451234512345123451234512345123451234512345123451234512345',
  qrData: 'spectra:safety:v1:test',
  fingerprint: '1234 5678',
  fullHash: 'a'.repeat(64),
}

async function initializeReplacementLookup(bundle: unknown) {
  const state = await import('./_state')
  const { initContactManager } = await import('./contactManager')
  state.setChatIdentity({ id: 'identity-me' } as any)
  testState.hasBoundBackendAccessForIdentity.mockReturnValue(true)
  initContactManager({
    resolveWalletAddressForIdentity: vi.fn(),
    fetchContactBundle: vi.fn().mockResolvedValue(bundle),
    fetchDiscoverableContactBundle: vi.fn().mockResolvedValue(null),
    getCachedIdentityResolutionValue: vi.fn(),
    rememberResolvedWalletAddress: vi.fn(),
  })
}

describe('contactManager local hydration', () => {
  beforeEach(() => {
    vi.resetModules()
    testState.activeWalletAddress = 'EXO00owner0000000000000000000000000000000000'
    testState.hasBoundBackendAccessForIdentity.mockReset()
    testState.ensureBoundBackendAccessForIdentity.mockReset()
    testState.ensureBackendSession.mockReset()
    testState.ensureBackendSession.mockResolvedValue({})
    testState.loadAddressBookSnapshot.mockReset()
    testState.loadActiveAddressBookSnapshot.mockReset()
    testState.updateAddressBookSnapshot.mockReset()
    testState.updateActiveAddressBookSnapshot.mockReset()
    testState.getIdentityByAddress.mockReset()
    testState.getAllTrackedIdentities.mockReset()
    testState.getConversations.mockReset()
    testState.getPublicKeyBundle.mockReset()
    testState.storePublicKeyBundle.mockReset()
    testState.storeContactBundle.mockReset()
    testState.generateSafetyNumberFromBundles.mockReset()
    testState.generateSafetyNumberFromBundles.mockReturnValue(replacementSafetyNumber)
    testState.chatClientAddContact.mockReset()
    testState.chatClientGetPublicKeyBundle.mockReset()
    testState.chatClientGetPublicKeyBundle.mockResolvedValue(createWalletAuthorizedBundle('identity-me'))
    testState.chatClientRequireIdentityVerification.mockReset()
    testState.chatClientRequireIdentityVerification.mockResolvedValue(undefined)
    testState.chatClientVerifyContactIdentity.mockReset()
    testState.chatClientVerifyContactIdentity.mockResolvedValue(undefined)
    testState.openContactCardProfile.mockReset()
    testState.verifySignedContactProfile.mockReset()
    testState.verifySignedContactProfile.mockReturnValue(true)
    testState.setContacts.mockReset()
    testState.setContactsReady.mockReset()
    testState.addContact.mockReset()
    testState.removeContact.mockReset()
    testState.updateContact.mockReset()
    testState.updateConversation.mockReset()
    testState.addSecurityAlert.mockReset()
    testState.store.contacts = []
    testState.store.conversations = []

    testState.loadActiveAddressBookSnapshot.mockResolvedValue(createSnapshot())
    testState.loadAddressBookSnapshot.mockResolvedValue(createSnapshot())
    testState.updateAddressBookSnapshot.mockImplementation(async (
      _ownerWalletAddress: string,
      _encryptionKey: Uint8Array,
      updater: (snapshot: AddressBookSnapshot) => AddressBookSnapshot,
    ) => updater(createSnapshot()))
    testState.updateActiveAddressBookSnapshot.mockImplementation(async (updater: (snapshot: AddressBookSnapshot) => AddressBookSnapshot) => (
      updater(createSnapshot())
    ))
    testState.getIdentityByAddress.mockResolvedValue({ id: 'identity-me' })
    testState.getAllTrackedIdentities.mockResolvedValue([
      {
        identityId: 'identity-alice',
        firstSeenAt: 5,
        lastUpdatedAt: 12,
        trustState: 'trusted',
      },
    ])
    testState.getConversations.mockResolvedValue([
      {
        id: 'conversation-alice',
        localIdentityId: 'identity-me',
        remoteIdentityId: 'identity-alice',
        remoteWalletAddress: 'EXO00alice0000000000000000000000000000000000',
        createdAt: 20,
        updatedAt: 20,
      },
    ])
    testState.getPublicKeyBundle.mockResolvedValue({
      identityId: 'identity-alice',
      version: 1,
    })
  })

  it('checks contact trust only in the active wallet scope', async () => {
    testState.store.contacts = [
      {
        identityId: 'identity-alice',
        localWalletAddress: 'EXO00other0000000000000000000000000000000000',
        trustState: 'changed',
        identityChanged: true,
      } as ChatContact,
      {
        identityId: 'identity-alice',
        localWalletAddress: testState.activeWalletAddress,
        trustState: 'verified',
        identityChanged: false,
      } as ChatContact,
    ]
    const { assertContactIdentityTrusted } = await import('./contactManager')

    expect(() => assertContactIdentityTrusted('identity-alice')).not.toThrow()

    testState.store.contacts[1] = {
      ...testState.store.contacts[1],
      trustState: 'changed',
      identityChanged: true,
    }
    expect(() => assertContactIdentityTrusted('identity-alice')).toThrow(
      'Contact identity changed and must be verified before messaging',
    )
  })

  it('projects address-book aliases from local storage without directory lookups', async () => {
    testState.getPublicKeyBundle.mockResolvedValue({
      identityId: 'identity-alice',
      version: 1,
    })
    const {
      hydrateLocalContactProjection,
      repairLocalContactProjection,
    } = await import('./contactManager')

    const hydration = await hydrateLocalContactProjection()
    const contacts = await repairLocalContactProjection(hydration!)

    expect(contacts).toHaveLength(1)
    expect(contacts[0]).toEqual(expect.objectContaining({
      identityId: 'identity-alice',
      walletAddress: 'EXO00alice0000000000000000000000000000000000',
      displayName: 'alice',
      sharedDisplayName: undefined,
    }))
    expect(testState.setContacts).toHaveBeenCalledWith(contacts)
  })

  it('projects an inbound tracked identity from its local bundle', async () => {
    const remoteWalletAddress = `EXO00${'a'.repeat(38)}`
    const emptySnapshot = {
      ...createSnapshot(),
      entries: [],
    }
    testState.loadActiveAddressBookSnapshot.mockResolvedValue(emptySnapshot)
    testState.loadAddressBookSnapshot.mockResolvedValue(emptySnapshot)
    testState.getAllTrackedIdentities.mockResolvedValue([{
      identityId: 'identity-inbound',
      firstSeenAt: 5,
      lastUpdatedAt: 12,
      trustState: 'trusted',
    }])
    testState.getConversations.mockResolvedValue([])
    testState.getPublicKeyBundle.mockResolvedValue({
      ...createWalletAuthorizedBundle('identity-inbound'),
      walletAuthorization: {
        payload: { walletAddress: remoteWalletAddress },
      },
    })
    const { refreshLocalContactProjection } = await import('./contactManager')

    const contacts = await refreshLocalContactProjection(testState.activeWalletAddress)

    expect(contacts).toEqual([
      expect.objectContaining({
        identityId: 'identity-inbound',
        walletAddress: remoteWalletAddress,
        isSaved: false,
      }),
    ])
    expect(testState.setContacts).toHaveBeenCalledWith(contacts)
  })

  it('preserves a persisted core identity lock over stale address-book trust', async () => {
    const snapshot = createSnapshot()
    snapshot.entries[0].trustState = 'trusted'
    testState.loadActiveAddressBookSnapshot.mockResolvedValue(snapshot)
    testState.getAllTrackedIdentities.mockResolvedValue([{
      identityId: 'identity-alice',
      firstSeenAt: 5,
      lastUpdatedAt: 20,
      trustState: 'changed',
    }])
    const state = await import('./_state')
    state.setChatClient({
      addContact: testState.chatClientAddContact,
      getConversations: vi.fn(async () => []),
    } as any)
    const {
      hydrateLocalContactProjection,
      repairLocalContactProjection,
    } = await import('./contactManager')

    const hydration = await hydrateLocalContactProjection()
    const contacts = await repairLocalContactProjection(hydration!)

    expect(contacts[0]?.trustState).toBe('changed')
    expect(testState.chatClientAddContact).not.toHaveBeenCalled()
  })

  it('does not re-import an unchanged tracked contact bundle', async () => {
    const bundle = createWalletAuthorizedBundle('identity-alice')
    testState.getPublicKeyBundle.mockResolvedValue(bundle)
    const state = await import('./_state')
    state.setChatClient({
      addContact: testState.chatClientAddContact,
      getTrackedIdentity: vi.fn(() => ({
        identityId: bundle.identityId,
        currentIdentityKey: bundle.identityKey,
        currentDilithiumKey: bundle.dilithiumKey,
        currentMlkemKey: bundle.mlkemIdentityKey,
      })),
      getConversations: vi.fn(async () => []),
    } as any)
    const {
      hydrateLocalContactProjection,
      repairLocalContactProjection,
    } = await import('./contactManager')

    const hydration = await hydrateLocalContactProjection()
    await repairLocalContactProjection(hydration!)

    expect(testState.chatClientAddContact).not.toHaveBeenCalled()
  })

  it('re-imports a contact when tracked identity keys changed', async () => {
    const bundle = createWalletAuthorizedBundle('identity-alice')
    testState.getPublicKeyBundle.mockResolvedValue(bundle)
    const state = await import('./_state')
    state.setChatClient({
      addContact: testState.chatClientAddContact,
      getTrackedIdentity: vi.fn(() => ({
        identityId: bundle.identityId,
        currentIdentityKey: 'old-identity-key',
        currentDilithiumKey: bundle.dilithiumKey,
        currentMlkemKey: bundle.mlkemIdentityKey,
      })),
      getConversations: vi.fn(async () => []),
    } as any)
    const {
      hydrateLocalContactProjection,
      repairLocalContactProjection,
    } = await import('./contactManager')

    const hydration = await hydrateLocalContactProjection()
    await repairLocalContactProjection(hydration!)

    expect(testState.chatClientAddContact).toHaveBeenCalledWith(bundle)
  })

  it('does not silently migrate an existing wallet contact to a new identity', async () => {
    const state = await import('./_state')
    state.setChatClient({
      addContact: testState.chatClientAddContact,
      getPublicKeyBundle: testState.chatClientGetPublicKeyBundle,
      requireContactIdentityVerification: testState.chatClientRequireIdentityVerification,
    } as any)
    const { addContact, initContactManager } = await import('./contactManager')

    testState.store.contacts = [{
      identityId: 'identity-alice-old',
      walletAddress: 'EXO00alice0000000000000000000000000000000000',
      displayName: 'alice',
      addedAt: 10,
      isSaved: true,
      isHidden: false,
      localWalletAddress: 'EXO00owner0000000000000000000000000000000000',
    }]
    testState.store.conversations = [{
      id: 'conversation-alice',
      localIdentityId: 'identity-me',
      remoteIdentityId: 'identity-alice-old',
      remoteWalletAddress: 'EXO00alice0000000000000000000000000000000000',
      createdAt: 20,
      updatedAt: 20,
    } as Conversation]

    initContactManager({
      resolveWalletAddressForIdentity: vi.fn().mockResolvedValue('EXO00alice0000000000000000000000000000000000'),
      fetchContactBundle: vi.fn(),
      getCachedIdentityResolutionValue: vi.fn(),
      rememberResolvedWalletAddress: vi.fn(),
    })

    const result = await addContact(createWalletAuthorizedBundle('identity-alice-new'), 'alice')

    expect(result.success).toBe(false)
    expect(result.error).toContain('Verify the safety number')
    expect(result.identityReplacement).toEqual(expect.objectContaining({
      reason: 'identity_replacement_required',
      oldIdentityId: 'identity-alice-old',
      newIdentityId: 'identity-alice-new',
      walletAddress: 'EXO00alice0000000000000000000000000000000000',
      walletAuthorized: true,
      safetyNumber: replacementSafetyNumber,
    }))
    expect(testState.chatClientAddContact).not.toHaveBeenCalled()
    expect(testState.updateConversation).not.toHaveBeenCalled()
    expect(testState.storeContactBundle).not.toHaveBeenCalled()
    expect(testState.generateSafetyNumberFromBundles).toHaveBeenCalledWith(
      expect.objectContaining({ identityId: 'identity-me' }),
      expect.objectContaining({ identityId: 'identity-alice-new' }),
    )
    expect(testState.updateAddressBookSnapshot).toHaveBeenCalled()
    expect(testState.chatClientRequireIdentityVerification).toHaveBeenCalledWith(
      'identity-alice-old',
    )
    expect(testState.updateContact).toHaveBeenCalledWith('identity-alice-old', expect.objectContaining({
      trustState: 'changed',
      identityChanged: true,
    }))
    expect(testState.addSecurityAlert).toHaveBeenCalledWith(expect.objectContaining({
      type: 'identity_key_changed',
      requiresAction: true,
    }))
  })

  it('does not expose a replacement unless the old identity lock persists', async () => {
    testState.chatClientRequireIdentityVerification.mockRejectedValueOnce(new Error('core storage failed'))
    testState.updateAddressBookSnapshot.mockRejectedValueOnce(new Error('address book storage failed'))
    const state = await import('./_state')
    state.setChatClient({
      addContact: testState.chatClientAddContact,
      getPublicKeyBundle: testState.chatClientGetPublicKeyBundle,
      requireContactIdentityVerification: testState.chatClientRequireIdentityVerification,
    } as any)
    testState.store.contacts = [{
      identityId: 'identity-alice-old',
      walletAddress: 'EXO00alice0000000000000000000000000000000000',
      displayName: 'alice',
      addedAt: 10,
      localWalletAddress: testState.activeWalletAddress,
    }]

    const { addContact } = await import('./contactManager')
    const result = await addContact(createWalletAuthorizedBundle('identity-alice-new'))

    expect(result).toEqual({
      success: false,
      error: 'This wallet changed chat identity, but the verification lock could not be persisted.',
      identityId: 'identity-alice-new',
    })
    expect(testState.storeContactBundle).not.toHaveBeenCalled()
  })

  it('locks a conversation-only wallet identity before exposing its replacement', async () => {
    testState.addContact.mockImplementation((contact: ChatContact) => {
      testState.store.contacts = [...testState.store.contacts, contact]
    })
    const state = await import('./_state')
    state.setChatClient({
      addContact: testState.chatClientAddContact,
      getPublicKeyBundle: testState.chatClientGetPublicKeyBundle,
      requireContactIdentityVerification: testState.chatClientRequireIdentityVerification,
    } as any)
    state.setChatIdentity({ id: 'identity-me' } as any)
    const { lockConversationIdentityReplacement } = await import('./contactManager')

    const result = await lockConversationIdentityReplacement(
      'identity-alice-old',
      createWalletAuthorizedBundle('identity-alice-new'),
      'EXO00alice0000000000000000000000000000000000',
      'alice',
    )

    expect(result.identityReplacement).toEqual(expect.objectContaining({
      oldIdentityId: 'identity-alice-old',
      newIdentityId: 'identity-alice-new',
      safetyNumber: replacementSafetyNumber,
    }))
    expect(testState.addContact).toHaveBeenCalledWith(expect.objectContaining({
      identityId: 'identity-alice-old',
      trustState: 'changed',
      identityChanged: true,
      isHidden: true,
      isSaved: false,
    }))
    expect(testState.chatClientAddContact).not.toHaveBeenCalled()
    expect(testState.storeContactBundle).not.toHaveBeenCalled()
  })

  it('uses the discovery callback only for Post-Quantum addresses', async () => {
    const state = await import('./_state')
    state.setChatClient({
      addContact: testState.chatClientAddContact,
    } as any)
    state.setChatIdentity({ id: 'identity-me' } as any)
    state.setBundleServer({} as any)
    testState.hasBoundBackendAccessForIdentity.mockReturnValue(true)
    testState.chatClientAddContact.mockResolvedValue({ identityChanged: false })

    const fetchContactBundle = vi.fn()
    const fetchDiscoverableContactBundle = vi.fn().mockResolvedValue(
      createWalletAuthorizedBundle('identity-alice'),
    )
    const { addContactByAddress, initContactManager } = await import('./contactManager')
    initContactManager({
      resolveWalletAddressForIdentity: vi.fn(),
      fetchContactBundle,
      fetchDiscoverableContactBundle,
      getCachedIdentityResolutionValue: vi.fn(),
      rememberResolvedWalletAddress: vi.fn(),
    })

    const walletAddress = `EXO00${'a'.repeat(38)}`
    await expect(addContactByAddress(walletAddress, 'alice')).resolves.toEqual(
      expect.objectContaining({ identityId: 'identity-alice', success: true }),
    )
    expect(fetchDiscoverableContactBundle).toHaveBeenCalledWith(walletAddress, undefined)
    expect(fetchContactBundle).not.toHaveBeenCalled()
  })

  it('persists a verified card profile before exposing the contact', async () => {
    const state = await import('./_state')
    state.setChatClient({
      addContact: testState.chatClientAddContact,
    } as any)
    testState.chatClientAddContact.mockResolvedValue({ isNew: true, identityChanged: false })
    const profile = {
      version: 1 as const,
      identityId: 'identity-alice',
      revision: 1,
      displayName: 'Alice',
      avatarDataUri: 'data:image/png;base64,AAAA',
      signature: `0x${'a'.repeat(6618)}`,
    }
    const persisted = { snapshot: null as AddressBookSnapshot | null }
    testState.updateAddressBookSnapshot.mockImplementation(async (
      _ownerWalletAddress: string,
      _encryptionKey: Uint8Array,
      updater: (snapshot: AddressBookSnapshot) => AddressBookSnapshot,
    ) => {
      persisted.snapshot = updater(createSnapshot())
      return persisted.snapshot
    })
    const { addContact } = await import('./contactManager')

    await expect(addContact(createWalletAuthorizedBundle('identity-alice'), undefined, undefined, {
      contactProfile: profile,
    })).resolves.toEqual({ success: true })

    expect(persisted.snapshot?.entries[0]).toEqual(expect.objectContaining({
      contactProfile: profile,
    }))
    expect(testState.addContact).toHaveBeenCalledWith(expect.objectContaining({
      displayName: 'Alice',
      sharedDisplayName: 'Alice',
      avatarUrl: profile.avatarDataUri,
    }))
  })

  it('initializes a card contact with its verified profile snapshot', async () => {
    const state = await import('./_state')
    state.setChatClient({
      addContact: testState.chatClientAddContact,
    } as any)
    testState.chatClientAddContact.mockResolvedValue({ isNew: true, identityChanged: false })
    const bundle = createWalletAuthorizedBundle('identity-alice')
    const profile = {
      version: 1 as const,
      identityId: bundle.identityId,
      revision: 1,
      displayName: 'Alice',
      avatarDataUri: 'data:image/png;base64,AAAA',
      signature: `0x${'a'.repeat(6618)}`,
    }
    testState.openContactCardProfile.mockReturnValue(profile)
    const fetchOneTimeContactCard = vi.fn(async () => ({
      bundle,
      profileCapsule: {} as any,
    }))
    const { addContactByInvite, initContactManager } = await import('./contactManager')
    initContactManager({
      resolveWalletAddressForIdentity: vi.fn(),
      fetchContactBundle: vi.fn(),
      fetchOneTimeContactCard,
      getCachedIdentityResolutionValue: vi.fn(),
      rememberResolvedWalletAddress: vi.fn(),
    })

    await expect(addContactByInvite({
      kind: 'contact_card',
      cardId: `scc1.${'a'.repeat(32)}`,
      cardCapability: `sccap1.${'A'.repeat(43)}`,
      profileCapability: `sccpc1.${'B'.repeat(43)}`,
    })).resolves.toEqual({
      success: true,
      identityId: bundle.identityId,
    })

    expect(testState.openContactCardProfile).toHaveBeenCalled()
    expect(testState.addContact).toHaveBeenCalledWith(expect.objectContaining({
      displayName: 'Alice',
      avatarUrl: profile.avatarDataUri,
    }))
  })

  it('does not commit a background contact into a new wallet scope', async () => {
    const addCommit = createDeferred<{ isNew: boolean; identityChanged: boolean }>()
    testState.chatClientAddContact.mockReturnValueOnce(addCommit.promise)
    const state = await import('./_state')
    state.setChatClient({ addContact: testState.chatClientAddContact } as any)
    const { addContact, initContactManager } = await import('./contactManager')
    initContactManager({
      resolveWalletAddressForIdentity: vi.fn().mockResolvedValue(
        'EXO00alice0000000000000000000000000000000000',
      ),
      fetchContactBundle: vi.fn(),
      getCachedIdentityResolutionValue: vi.fn(),
      rememberResolvedWalletAddress: vi.fn(),
    })

    const resultPromise = addContact(createWalletAuthorizedBundle('identity-alice'))
    await vi.waitFor(() => expect(testState.chatClientAddContact).toHaveBeenCalled())
    testState.activeWalletAddress = 'EXO00other0000000000000000000000000000000000'
    addCommit.resolve({ isNew: true, identityChanged: false })

    await expect(resultPromise).resolves.toEqual({
      success: false,
      error: 'Chat account changed',
    })
    expect(testState.updateAddressBookSnapshot).not.toHaveBeenCalled()
    expect(testState.addContact).not.toHaveBeenCalled()
  })

  it('locks a replacement in memory before durable writes settle', async () => {
    const coreLock = createDeferred<void>()
    const addressBookLock = createDeferred<AddressBookSnapshot>()
    testState.chatClientRequireIdentityVerification.mockReturnValueOnce(coreLock.promise)
    testState.updateAddressBookSnapshot.mockReturnValueOnce(addressBookLock.promise)
    const state = await import('./_state')
    state.setChatClient({
      addContact: testState.chatClientAddContact,
      getPublicKeyBundle: testState.chatClientGetPublicKeyBundle,
      requireContactIdentityVerification: testState.chatClientRequireIdentityVerification,
    } as any)
    const { addContact, initContactManager } = await import('./contactManager')
    initContactManager({
      resolveWalletAddressForIdentity: vi.fn().mockResolvedValue(
        'EXO00alice0000000000000000000000000000000000',
      ),
      fetchContactBundle: vi.fn(),
      getCachedIdentityResolutionValue: vi.fn(),
      rememberResolvedWalletAddress: vi.fn(),
    })
    testState.store.contacts = [{
      identityId: 'identity-alice-old',
      walletAddress: 'EXO00alice0000000000000000000000000000000000',
      displayName: 'alice',
      addedAt: 10,
      localWalletAddress: testState.activeWalletAddress,
    }]

    const resultPromise = addContact(createWalletAuthorizedBundle('identity-alice-new'))
    await vi.waitFor(() => expect(testState.updateAddressBookSnapshot).toHaveBeenCalled())

    expect(testState.updateContact).toHaveBeenCalledWith(
      'identity-alice-old',
      expect.objectContaining({ trustState: 'changed', identityChanged: true }),
    )
    coreLock.resolve()
    addressBookLock.resolve(createSnapshot())
    await expect(resultPromise).resolves.toEqual(expect.objectContaining({ success: false }))
  })

  it('replaces a changed wallet contact only after explicit verification', async () => {
    const state = await import('./_state')
    state.setChatClient({
      addContact: testState.chatClientAddContact,
      getPublicKeyBundle: testState.chatClientGetPublicKeyBundle,
      verifyContactIdentity: testState.chatClientVerifyContactIdentity,
    } as any)
    const { acceptContactIdentityReplacement } = await import('./contactManager')
    const replacementBundle = {
      identityId: 'identity-alice-new',
      identityKey: 'identity-key',
      mlkemIdentityKey: 'mlkem-key',
      dilithiumKey: 'dilithium-key',
      signedPreKey: {} as any,
      oneTimePreKeys: [],
      version: 1,
      timestamp: 30,
      bundleSignature: 'bundle-signature',
    }
    await initializeReplacementLookup(replacementBundle)
    testState.store.contacts = [{
      identityId: 'identity-alice-old',
      walletAddress: 'EXO00alice0000000000000000000000000000000000',
      displayName: 'alice',
      addedAt: 10,
      isSaved: true,
      isHidden: false,
      localWalletAddress: 'EXO00owner0000000000000000000000000000000000',
    }]

    const result = await acceptContactIdentityReplacement({
      reason: 'identity_replacement_required',
      oldIdentityId: 'identity-alice-old',
      newIdentityId: 'identity-alice-new',
      walletAddress: 'EXO00alice0000000000000000000000000000000000',
      displayName: 'alice',
      safetyNumber: replacementSafetyNumber,
      walletAuthorized: true,
    })

    expect(result).toEqual({ success: true, identityId: 'identity-alice-new' })
    expect(testState.chatClientAddContact).toHaveBeenCalledWith(
      replacementBundle,
      { expectedWalletAddress: 'EXO00alice0000000000000000000000000000000000' },
    )
    expect(testState.chatClientVerifyContactIdentity).toHaveBeenCalledWith('identity-alice-new')
    expect(testState.addContact).toHaveBeenCalledWith(expect.objectContaining({
      identityId: 'identity-alice-new',
      walletAddress: 'EXO00alice0000000000000000000000000000000000',
      displayName: 'alice',
      trustState: 'verified',
      identityChanged: false,
    }))
    expect(testState.updateAddressBookSnapshot).toHaveBeenCalled()
  })

  it('accepts an authenticated cached replacement without backend access', async () => {
    const state = await import('./_state')
    const replacementBundle = createWalletAuthorizedBundle('identity-alice-new')
    const fetchDiscoverableContactBundle = vi.fn()
    const fetchContactBundle = vi.fn()
    state.setChatClient({
      addContact: testState.chatClientAddContact,
      getPublicKeyBundle: testState.chatClientGetPublicKeyBundle,
      verifyContactIdentity: testState.chatClientVerifyContactIdentity,
    } as any)
    state.setChatIdentity({ id: 'identity-me' } as any)
    testState.hasBoundBackendAccessForIdentity.mockReturnValue(false)
    testState.getPublicKeyBundle.mockResolvedValue(replacementBundle)
    const { acceptContactIdentityReplacement, initContactManager } = await import('./contactManager')
    initContactManager({
      resolveWalletAddressForIdentity: vi.fn(),
      fetchContactBundle,
      fetchDiscoverableContactBundle,
      getCachedIdentityResolutionValue: vi.fn(),
      rememberResolvedWalletAddress: vi.fn(),
    })
    testState.store.contacts = [{
      identityId: 'identity-alice-old',
      walletAddress: 'EXO00alice0000000000000000000000000000000000',
      displayName: 'alice',
      addedAt: 10,
      localWalletAddress: testState.activeWalletAddress,
      trustState: 'changed',
      identityChanged: true,
    }]

    await expect(acceptContactIdentityReplacement({
      reason: 'identity_replacement_required',
      oldIdentityId: 'identity-alice-old',
      newIdentityId: 'identity-alice-new',
      walletAddress: 'EXO00alice0000000000000000000000000000000000',
      safetyNumber: replacementSafetyNumber,
      walletAuthorized: true,
    })).resolves.toEqual({ success: true, identityId: 'identity-alice-new' })

    expect(testState.ensureBoundBackendAccessForIdentity).not.toHaveBeenCalled()
    expect(fetchDiscoverableContactBundle).not.toHaveBeenCalled()
    expect(fetchContactBundle).not.toHaveBeenCalled()
  })

  it('accepts a newly discovered replacement without backend access', async () => {
    const state = await import('./_state')
    const replacementBundle = createWalletAuthorizedBundle('identity-alice-new')
    const fetchDiscoverableContactBundle = vi.fn()
    const fetchContactBundle = vi.fn()
    state.setChatClient({
      addContact: testState.chatClientAddContact,
      getPublicKeyBundle: testState.chatClientGetPublicKeyBundle,
      requireContactIdentityVerification: testState.chatClientRequireIdentityVerification,
      verifyContactIdentity: testState.chatClientVerifyContactIdentity,
    } as any)
    state.setChatIdentity({ id: 'identity-me' } as any)
    testState.hasBoundBackendAccessForIdentity.mockReturnValue(false)
    testState.getPublicKeyBundle.mockResolvedValue(null)
    const {
      acceptContactIdentityReplacement,
      addContact,
      getPendingContactIdentityReplacement,
      initContactManager,
    } = await import('./contactManager')
    initContactManager({
      resolveWalletAddressForIdentity: vi.fn(),
      fetchContactBundle,
      fetchDiscoverableContactBundle,
      getCachedIdentityResolutionValue: vi.fn(),
      rememberResolvedWalletAddress: vi.fn(),
    })
    testState.store.contacts = [{
      identityId: 'identity-alice-old',
      walletAddress: 'EXO00alice0000000000000000000000000000000000',
      displayName: 'alice',
      addedAt: 10,
      localWalletAddress: testState.activeWalletAddress,
    }]

    const discovered = await addContact(replacementBundle)
    expect(discovered.identityReplacement).toBeDefined()
    await expect(getPendingContactIdentityReplacement('identity-alice-old')).resolves.toEqual(
      discovered.identityReplacement,
    )

    await expect(acceptContactIdentityReplacement(
      discovered.identityReplacement!,
    )).resolves.toEqual({ success: true, identityId: 'identity-alice-new' })

    expect(testState.ensureBoundBackendAccessForIdentity).not.toHaveBeenCalled()
    expect(fetchDiscoverableContactBundle).not.toHaveBeenCalled()
    expect(fetchContactBundle).not.toHaveBeenCalled()
  })

  it('surfaces a local replacement payload for an already locked contact', async () => {
    const state = await import('./_state')
    const replacementBundle = createWalletAuthorizedBundle('identity-alice-new')
    state.setChatClient({
      getPublicKeyBundle: testState.chatClientGetPublicKeyBundle,
    } as any)
    state.setChatIdentity({ id: 'identity-me' } as any)
    testState.store.contacts = [
      {
        identityId: 'identity-alice-old',
        walletAddress: 'EXO00alice0000000000000000000000000000000000',
        displayName: 'alice',
        addedAt: 10,
        localWalletAddress: testState.activeWalletAddress,
        trustState: 'changed',
        identityChanged: true,
      },
      {
        identityId: 'identity-alice-new',
        walletAddress: 'EXO00alice0000000000000000000000000000000000',
        displayName: 'alice',
        addedAt: 11,
        localWalletAddress: testState.activeWalletAddress,
        publicKeyBundle: replacementBundle,
        trustState: 'trusted',
      },
    ]
    const {
      ContactIdentityChangeError,
      getPendingContactIdentityReplacement,
      verifyContactBundle,
    } = await import('./contactManager')

    await expect(getPendingContactIdentityReplacement('identity-alice-old')).resolves.toEqual(
      expect.objectContaining({
        oldIdentityId: 'identity-alice-old',
        newIdentityId: 'identity-alice-new',
        safetyNumber: replacementSafetyNumber,
      }),
    )
    await expect(verifyContactBundle('identity-alice-old')).rejects.toMatchObject({
      name: ContactIdentityChangeError.name,
      replacement: expect.objectContaining({
        oldIdentityId: 'identity-alice-old',
        newIdentityId: 'identity-alice-new',
        safetyNumber: replacementSafetyNumber,
      }),
    })
  })

  it('does not accept a replacement after the active wallet changes', async () => {
    const state = await import('./_state')
    state.setChatClient({
      addContact: testState.chatClientAddContact,
      getPublicKeyBundle: testState.chatClientGetPublicKeyBundle,
      verifyContactIdentity: testState.chatClientVerifyContactIdentity,
    } as any)
    const bundleRead = createDeferred<any>()
    testState.chatClientGetPublicKeyBundle.mockReturnValueOnce(bundleRead.promise)
    await initializeReplacementLookup(createWalletAuthorizedBundle('identity-alice-new'))
    testState.store.contacts = [{
      identityId: 'identity-alice-old',
      walletAddress: 'EXO00alice0000000000000000000000000000000000',
      displayName: 'alice',
      addedAt: 10,
      localWalletAddress: testState.activeWalletAddress,
    }]
    const { acceptContactIdentityReplacement } = await import('./contactManager')

    const resultPromise = acceptContactIdentityReplacement({
      reason: 'identity_replacement_required',
      oldIdentityId: 'identity-alice-old',
      newIdentityId: 'identity-alice-new',
      walletAddress: 'EXO00alice0000000000000000000000000000000000',
      safetyNumber: replacementSafetyNumber,
      walletAuthorized: true,
    })
    testState.activeWalletAddress = 'EXO00other0000000000000000000000000000000000'
    bundleRead.resolve({
      identityId: 'identity-alice-new',
      identityKey: 'identity-key',
      mlkemIdentityKey: 'mlkem-key',
      dilithiumKey: 'dilithium-key',
      signedPreKey: {},
      oneTimePreKeys: [],
      version: 1,
      timestamp: 30,
      bundleSignature: 'bundle-signature',
    })

    await expect(resultPromise).resolves.toEqual({
      success: false,
      error: 'Chat account changed',
    })
    expect(testState.chatClientAddContact).not.toHaveBeenCalled()
    expect(testState.updateAddressBookSnapshot).not.toHaveBeenCalled()
    expect(testState.addContact).not.toHaveBeenCalled()
  })

  it('accepts replacement when the active contact was already partially migrated', async () => {
    const state = await import('./_state')
    state.setChatClient({
      addContact: testState.chatClientAddContact,
      getPublicKeyBundle: testState.chatClientGetPublicKeyBundle,
      verifyContactIdentity: testState.chatClientVerifyContactIdentity,
    } as any)
    const { acceptContactIdentityReplacement } = await import('./contactManager')
    const replacementBundle = {
      identityId: 'identity-alice-new',
      identityKey: 'identity-key',
      mlkemIdentityKey: 'mlkem-key',
      dilithiumKey: 'dilithium-key',
      signedPreKey: {} as any,
      oneTimePreKeys: [],
      version: 1,
      timestamp: 30,
      bundleSignature: 'bundle-signature',
    }
    await initializeReplacementLookup(replacementBundle)
    testState.store.contacts = [{
      identityId: 'identity-alice-new',
      walletAddress: 'EXO00alice0000000000000000000000000000000000',
      displayName: 'alice',
      addedAt: 10,
      isSaved: true,
      isHidden: false,
      localWalletAddress: 'EXO00owner0000000000000000000000000000000000',
      trustState: 'changed',
      identityChanged: true,
      remoteAccountState: 'deleted',
      remoteAccountStateUpdatedAt: 20,
    }]

    const result = await acceptContactIdentityReplacement({
      reason: 'identity_replacement_required',
      oldIdentityId: 'identity-alice-old',
      newIdentityId: 'identity-alice-new',
      walletAddress: 'EXO00alice0000000000000000000000000000000000',
      displayName: 'alice',
      safetyNumber: replacementSafetyNumber,
      walletAuthorized: true,
    })

    expect(result).toEqual({ success: true, identityId: 'identity-alice-new' })
    expect(testState.chatClientAddContact).toHaveBeenCalledWith(
      replacementBundle,
      { expectedWalletAddress: 'EXO00alice0000000000000000000000000000000000' },
    )
    expect(testState.chatClientVerifyContactIdentity).toHaveBeenCalledWith('identity-alice-new')
    expect(testState.addContact).toHaveBeenCalledWith(expect.objectContaining({
      identityId: 'identity-alice-new',
      trustState: 'verified',
      identityChanged: false,
      remoteAccountState: 'deleted',
      remoteAccountStateUpdatedAt: 20,
    }))
  })

  it('removes a stale wallet identity after accepting an auto-added replacement', async () => {
    const state = await import('./_state')
    state.setChatClient({
      addContact: testState.chatClientAddContact,
      getPublicKeyBundle: testState.chatClientGetPublicKeyBundle,
      verifyContactIdentity: testState.chatClientVerifyContactIdentity,
    } as any)
    const { acceptContactIdentityReplacement } = await import('./contactManager')
    await initializeReplacementLookup(createWalletAuthorizedBundle('identity-alice-new'))
    testState.store.contacts = [
      {
        identityId: 'identity-alice-old',
        walletAddress: 'EXO00alice0000000000000000000000000000000000',
        displayName: 'alice',
        addedAt: 10,
        localWalletAddress: testState.activeWalletAddress,
        trustState: 'changed',
        identityChanged: true,
        remoteAccountState: 'deleted',
        remoteAccountStateUpdatedAt: 20,
      },
      {
        identityId: 'identity-alice-new',
        walletAddress: 'EXO00alice0000000000000000000000000000000000',
        displayName: 'alice',
        addedAt: 10,
        localWalletAddress: testState.activeWalletAddress,
      },
    ]

    await expect(acceptContactIdentityReplacement({
      reason: 'identity_replacement_required',
      oldIdentityId: 'identity-alice-old',
      newIdentityId: 'identity-alice-new',
      walletAddress: 'EXO00alice0000000000000000000000000000000000',
      safetyNumber: replacementSafetyNumber,
      walletAuthorized: true,
    })).resolves.toEqual({ success: true, identityId: 'identity-alice-new' })

    expect(testState.removeContact).toHaveBeenCalledWith('identity-alice-old')
    expect(testState.addContact).toHaveBeenCalledWith(expect.objectContaining({
      identityId: 'identity-alice-new',
      remoteAccountState: 'deleted',
      remoteAccountStateUpdatedAt: 20,
    }))
  })

  it('does not accept a replacement bundle without wallet authorization', async () => {
    const state = await import('./_state')
    state.setChatClient({
      addContact: testState.chatClientAddContact,
      getPublicKeyBundle: testState.chatClientGetPublicKeyBundle,
      verifyContactIdentity: testState.chatClientVerifyContactIdentity,
    } as any)
    const { verifyPublicKeyBundleWalletAuthorizationAsync } = await import('@spectra/core-crypto')
    vi.mocked(verifyPublicKeyBundleWalletAuthorizationAsync).mockResolvedValueOnce({
      valid: false,
      error: 'Wallet authorization bundle signature mismatch',
    } as any)
    const { acceptContactIdentityReplacement } = await import('./contactManager')
    const replacementBundle = {
      identityId: 'identity-alice-new',
      identityKey: 'identity-key',
      mlkemIdentityKey: 'mlkem-key',
      dilithiumKey: 'dilithium-key',
      signedPreKey: {} as any,
      oneTimePreKeys: [],
      version: 1,
      timestamp: 30,
      bundleSignature: 'bundle-signature',
    }
    await initializeReplacementLookup(replacementBundle)
    testState.store.contacts = [{
      identityId: 'identity-alice-old',
      walletAddress: 'EXO00alice0000000000000000000000000000000000',
      displayName: 'alice',
      addedAt: 10,
      isSaved: true,
      localWalletAddress: 'EXO00owner0000000000000000000000000000000000',
    }]

    const result = await acceptContactIdentityReplacement({
      reason: 'identity_replacement_required',
      oldIdentityId: 'identity-alice-old',
      newIdentityId: 'identity-alice-new',
      walletAddress: 'EXO00alice0000000000000000000000000000000000',
      safetyNumber: replacementSafetyNumber,
      walletAuthorized: true,
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('Bundle is not authorized')
    expect(testState.chatClientAddContact).not.toHaveBeenCalled()
    expect(testState.addContact).not.toHaveBeenCalled()
  })

  it('does not accept a replacement when its live safety number changed', async () => {
    const state = await import('./_state')
    state.setChatClient({
      addContact: testState.chatClientAddContact,
      getPublicKeyBundle: testState.chatClientGetPublicKeyBundle,
      verifyContactIdentity: testState.chatClientVerifyContactIdentity,
    } as any)
    const { acceptContactIdentityReplacement } = await import('./contactManager')
    await initializeReplacementLookup(createWalletAuthorizedBundle('identity-alice-new'))
    testState.generateSafetyNumberFromBundles.mockReturnValue({
      ...replacementSafetyNumber,
      fullHash: 'b'.repeat(64),
    })
    testState.store.contacts = [{
      identityId: 'identity-alice-old',
      walletAddress: 'EXO00alice0000000000000000000000000000000000',
      displayName: 'alice',
      addedAt: 10,
      isSaved: true,
      localWalletAddress: 'EXO00owner0000000000000000000000000000000000',
    }]

    const result = await acceptContactIdentityReplacement({
      reason: 'identity_replacement_required',
      oldIdentityId: 'identity-alice-old',
      newIdentityId: 'identity-alice-new',
      walletAddress: 'EXO00alice0000000000000000000000000000000000',
      safetyNumber: replacementSafetyNumber,
      walletAuthorized: true,
    })

    expect(result).toEqual({
      success: false,
      error: 'Replacement identity changed. Verify the newly advertised safety number before accepting it.',
    })
    expect(testState.chatClientAddContact).not.toHaveBeenCalled()
    expect(testState.addContact).not.toHaveBeenCalled()
  })

  it('does not accept a replacement when the advertised bundle identity differs', async () => {
    const state = await import('./_state')
    state.setChatClient({
      addContact: testState.chatClientAddContact,
      getPublicKeyBundle: testState.chatClientGetPublicKeyBundle,
      verifyContactIdentity: testState.chatClientVerifyContactIdentity,
    } as any)
    const { acceptContactIdentityReplacement } = await import('./contactManager')
    await initializeReplacementLookup({
      identityId: 'identity-alice-other',
      identityKey: 'identity-key',
      mlkemIdentityKey: 'mlkem-key',
      dilithiumKey: 'dilithium-key',
      signedPreKey: {} as any,
      oneTimePreKeys: [],
      version: 1,
      timestamp: 30,
      bundleSignature: 'bundle-signature',
    })
    testState.store.contacts = [{
      identityId: 'identity-alice-old',
      walletAddress: 'EXO00alice0000000000000000000000000000000000',
      displayName: 'alice',
      addedAt: 10,
      isSaved: true,
      localWalletAddress: 'EXO00owner0000000000000000000000000000000000',
    }]

    const result = await acceptContactIdentityReplacement({
      reason: 'identity_replacement_required',
      oldIdentityId: 'identity-alice-old',
      newIdentityId: 'identity-alice-new',
      walletAddress: 'EXO00alice0000000000000000000000000000000000',
      safetyNumber: replacementSafetyNumber,
      walletAuthorized: true,
    })

    expect(result).toEqual({ success: false, error: 'Replacement bundle identity mismatch' })
    expect(testState.chatClientAddContact).not.toHaveBeenCalled()
    expect(testState.addContact).not.toHaveBeenCalled()
  })

  it('does not mark a replacement verified when core verification fails', async () => {
    const state = await import('./_state')
    state.setChatClient({
      addContact: testState.chatClientAddContact,
      getPublicKeyBundle: testState.chatClientGetPublicKeyBundle,
      verifyContactIdentity: testState.chatClientVerifyContactIdentity,
    } as any)
    testState.chatClientVerifyContactIdentity.mockRejectedValueOnce(new Error('verify failed'))
    const { acceptContactIdentityReplacement } = await import('./contactManager')
    await initializeReplacementLookup({
      identityId: 'identity-alice-new',
      identityKey: 'identity-key',
      mlkemIdentityKey: 'mlkem-key',
      dilithiumKey: 'dilithium-key',
      signedPreKey: {} as any,
      oneTimePreKeys: [],
      version: 1,
      timestamp: 30,
      bundleSignature: 'bundle-signature',
    })
    testState.store.contacts = [{
      identityId: 'identity-alice-old',
      walletAddress: 'EXO00alice0000000000000000000000000000000000',
      displayName: 'alice',
      addedAt: 10,
      isSaved: true,
      localWalletAddress: 'EXO00owner0000000000000000000000000000000000',
    }]

    const result = await acceptContactIdentityReplacement({
      reason: 'identity_replacement_required',
      oldIdentityId: 'identity-alice-old',
      newIdentityId: 'identity-alice-new',
      walletAddress: 'EXO00alice0000000000000000000000000000000000',
      safetyNumber: replacementSafetyNumber,
      walletAuthorized: true,
    })

    expect(result).toEqual({ success: false, error: 'verify failed' })
    expect(testState.chatClientAddContact).toHaveBeenCalled()
    expect(testState.addContact).not.toHaveBeenCalled()
    expect(testState.updateActiveAddressBookSnapshot).not.toHaveBeenCalled()
  })

  it('uses persisted verification freshness without a remote refresh', async () => {
    const state = await import('./_state')
    state.setChatClient({} as any)
    state.setBundleServer({} as any)
    testState.store.contacts = [{
      identityId: 'identity-alice',
      walletAddress: 'EXO00alice0000000000000000000000000000000000',
      displayName: 'alice',
      addedAt: 10,
      identityVerifiedAt: Date.now(),
    }]
    const { verifyContactBundle } = await import('./contactManager')

    await expect(verifyContactBundle('identity-alice')).resolves.toBe('identity-alice')
    expect(testState.ensureBoundBackendAccessForIdentity).not.toHaveBeenCalled()
  })

  it('fails closed when the chat account changes during verification', async () => {
    const state = await import('./_state')
    const activeClient = {
      addContact: testState.chatClientAddContact,
    }
    state.setChatClient(activeClient as any)
    state.setChatIdentity({ id: 'identity-me' } as any)
    state.setBundleServer({} as any)
    testState.hasBoundBackendAccessForIdentity.mockReturnValue(true)
    testState.chatClientAddContact.mockImplementationOnce(async () => {
      state.setChatClient({} as any)
      return { identityChanged: false }
    })

    const { initContactManager, verifyContactBundle } = await import('./contactManager')
    initContactManager({
      resolveWalletAddressForIdentity: vi.fn().mockResolvedValue(
        'EXO00alice0000000000000000000000000000000000',
      ),
      fetchContactBundle: vi.fn().mockResolvedValue({
        identityId: 'identity-alice',
        version: 1,
      } as any),
      getCachedIdentityResolutionValue: vi.fn(),
      rememberResolvedWalletAddress: vi.fn(),
    })
    testState.store.contacts = [{
      identityId: 'identity-alice',
      walletAddress: 'EXO00alice0000000000000000000000000000000000',
      displayName: 'alice',
      addedAt: 10,
    }]

    await expect(verifyContactBundle('identity-alice')).rejects.toThrow('Chat account changed')
    expect(testState.updateContact).not.toHaveBeenCalled()
  })

  it('refreshes known contacts without a directory identity lookup', async () => {
    const state = await import('./_state')
    state.setChatClient({
      addContact: testState.chatClientAddContact,
    } as any)
    state.setChatIdentity({ id: 'identity-me' } as any)
    state.setBundleServer({} as any)
    testState.hasBoundBackendAccessForIdentity.mockReturnValue(true)
    testState.chatClientAddContact.mockResolvedValue({ identityChanged: false })

    const fetchContactBundle = vi.fn().mockResolvedValue(
      createWalletAuthorizedBundle('identity-alice-old'),
    )
    const { initContactManager, verifyContactBundle } = await import('./contactManager')
    initContactManager({
      resolveWalletAddressForIdentity: vi.fn().mockResolvedValue('EXO00alice0000000000000000000000000000000000'),
      fetchContactBundle,
      getCachedIdentityResolutionValue: vi.fn(),
      rememberResolvedWalletAddress: vi.fn(),
    })
    testState.store.contacts = [{
      identityId: 'identity-alice-old',
      walletAddress: 'EXO00alice0000000000000000000000000000000000',
      displayName: 'alice',
      addedAt: 10,
      identityVerifiedAt: Date.now(),
    }]

    await expect(verifyContactBundle('identity-alice-old', {
      forceRemoteVerification: true,
    })).resolves.toBe('identity-alice-old')
    expect(fetchContactBundle).toHaveBeenCalledWith('identity-alice-old', undefined)
  })

  it('discovers and locks a replacement identity when the old bundle is absent', async () => {
    const state = await import('./_state')
    state.setChatClient({
      addContact: testState.chatClientAddContact,
      getPublicKeyBundle: testState.chatClientGetPublicKeyBundle,
      requireContactIdentityVerification: testState.chatClientRequireIdentityVerification,
    } as any)
    state.setChatIdentity({ id: 'identity-me' } as any)
    state.setBundleServer({} as any)
    testState.hasBoundBackendAccessForIdentity.mockReturnValue(true)
    const fetchContactBundle = vi.fn().mockResolvedValue(null)
    const fetchDiscoverableContactBundle = vi.fn().mockResolvedValue(
      createWalletAuthorizedBundle('identity-alice-new'),
    )
    const {
      ContactIdentityChangeError,
      initContactManager,
      verifyContactBundle,
    } = await import('./contactManager')
    initContactManager({
      resolveWalletAddressForIdentity: vi.fn(),
      fetchContactBundle,
      fetchDiscoverableContactBundle,
      getCachedIdentityResolutionValue: vi.fn(),
      rememberResolvedWalletAddress: vi.fn(),
    })
    testState.store.contacts = [{
      identityId: 'identity-alice-old',
      walletAddress: 'EXO00alice0000000000000000000000000000000000',
      displayName: 'alice',
      addedAt: 10,
      localWalletAddress: testState.activeWalletAddress,
    }]

    await expect(verifyContactBundle('identity-alice-old', {
      forceRemoteVerification: true,
    })).rejects.toMatchObject({
      name: ContactIdentityChangeError.name,
      replacement: expect.objectContaining({
        oldIdentityId: 'identity-alice-old',
        newIdentityId: 'identity-alice-new',
        safetyNumber: replacementSafetyNumber,
      }),
    })

    expect(fetchContactBundle).toHaveBeenCalledWith('identity-alice-old', undefined)
    expect(fetchDiscoverableContactBundle).toHaveBeenCalledWith(
      'EXO00alice0000000000000000000000000000000000',
      undefined,
    )
    expect(testState.chatClientAddContact).not.toHaveBeenCalled()
    expect(testState.storeContactBundle).not.toHaveBeenCalled()
  })

  it('requires verification when an inbound identity shares a saved wallet contact', async () => {
    const state = await import('./_state')
    state.setChatClient({
      addContact: testState.chatClientAddContact,
      getPublicKeyBundle: testState.chatClientGetPublicKeyBundle,
      requireContactIdentityVerification: testState.chatClientRequireIdentityVerification,
    } as any)
    state.setChatIdentity({ id: 'identity-me' } as any)
    state.setBundleServer({} as any)
    testState.hasBoundBackendAccessForIdentity.mockReturnValue(true)
    const replacementBundle = createWalletAuthorizedBundle('identity-alice-new')
    const {
      ContactIdentityChangeError,
      initContactManager,
      verifyContactBundle,
    } = await import('./contactManager')
    initContactManager({
      resolveWalletAddressForIdentity: vi.fn(),
      fetchContactBundle: vi.fn().mockResolvedValue(replacementBundle),
      getCachedIdentityResolutionValue: vi.fn(),
      rememberResolvedWalletAddress: vi.fn(),
    })
    testState.store.contacts = [
      {
        identityId: 'identity-alice-old',
        walletAddress: 'EXO00alice0000000000000000000000000000000000',
        displayName: 'alice',
        addedAt: 10,
        localWalletAddress: testState.activeWalletAddress,
        trustState: 'changed',
        identityChanged: true,
      },
      {
        identityId: 'identity-alice-new',
        walletAddress: 'EXO00alice0000000000000000000000000000000000',
        displayName: 'alice',
        addedAt: 10,
        localWalletAddress: testState.activeWalletAddress,
        identityVerifiedAt: Date.now(),
      },
    ]

    await expect(verifyContactBundle('identity-alice-new')).rejects.toMatchObject({
      name: ContactIdentityChangeError.name,
      replacement: expect.objectContaining({
        oldIdentityId: 'identity-alice-old',
        newIdentityId: 'identity-alice-new',
        safetyNumber: replacementSafetyNumber,
      }),
    })

    expect(testState.chatClientAddContact).not.toHaveBeenCalled()
    expect(testState.storeContactBundle).not.toHaveBeenCalled()
  })

  it('remains fail-closed when refreshed identity-lock writes fail', async () => {
    const state = await import('./_state')
    state.setChatClient({
      addContact: testState.chatClientAddContact,
      requireContactIdentityVerification: testState.chatClientRequireIdentityVerification,
    } as any)
    state.setChatIdentity({ id: 'identity-me' } as any)
    state.setBundleServer({} as any)
    testState.hasBoundBackendAccessForIdentity.mockReturnValue(true)
    testState.chatClientAddContact.mockResolvedValue({ identityChanged: true })
    testState.chatClientRequireIdentityVerification.mockRejectedValueOnce(
      new Error('tracked identity write failed'),
    )
    testState.updateAddressBookSnapshot.mockRejectedValueOnce(
      new Error('address book write failed'),
    )

    const {
      ContactIdentityChangeError,
      initContactManager,
      verifyContactBundle,
    } = await import('./contactManager')
    initContactManager({
      resolveWalletAddressForIdentity: vi.fn().mockResolvedValue(
        'EXO00alice0000000000000000000000000000000000',
      ),
      fetchContactBundle: vi.fn().mockResolvedValue(
        createWalletAuthorizedBundle('identity-alice-old'),
      ),
      getCachedIdentityResolutionValue: vi.fn(),
      rememberResolvedWalletAddress: vi.fn(),
    })
    testState.store.contacts = [{
      identityId: 'identity-alice-old',
      walletAddress: 'EXO00alice0000000000000000000000000000000000',
      displayName: 'alice',
      addedAt: 10,
    }]

    await expect(verifyContactBundle('identity-alice-old')).rejects.toBeInstanceOf(
      ContactIdentityChangeError,
    )
    expect(testState.chatClientRequireIdentityVerification).toHaveBeenCalledWith(
      'identity-alice-old',
    )
    expect(testState.updateContact).toHaveBeenCalledWith(
      'identity-alice-old',
      expect.objectContaining({ trustState: 'changed' }),
    )
    expect(testState.updateAddressBookSnapshot).toHaveBeenCalled()
  })
})
