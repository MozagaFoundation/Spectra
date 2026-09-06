/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionError, type MailboxScopeState } from '../types'
import type { X3DHBootstrapFailureDetails } from './session'

const signWithDilithium = vi.fn((payload: Uint8Array) => Buffer.from(payload).toString('base64'))
const signWithDilithiumAsync = vi.fn(async (payload: Uint8Array) => signWithDilithium(payload))
const verifyDilithiumSignature = vi.fn((payload: Uint8Array, signature: string) => (
  Buffer.from(payload).toString('base64') === signature
))
const getX3DHBootstrapFailureDetails = vi.fn((): X3DHBootstrapFailureDetails | null => null)
const createPublicKeyBundle = vi.fn(() => ({
  bundle: {
    identityId: 'local-identity',
    identityKey: 'local-identity-pub',
    mlkemIdentityKey: 'local-mlkem-pub',
    dilithiumKey: 'local-dilithium-pub',
    signedPreKey: {
      id: 1,
      x25519PublicKey: 'repaired-spk-x25519',
      mlkemPublicKey: 'repaired-spk-mlkem',
      signature: 'repaired-spk-signature',
      timestamp: 1_717_171_717_000,
    },
    oneTimePreKeys: [],
    version: 1,
    timestamp: 1_717_171_717_000,
    bundleSignature: 'repaired-bundle-signature',
  },
  privateBundle: {
    identityPrivateKey: 'local-identity-private',
    mlkemIdentityPrivateKey: 'local-mlkem-private',
    dilithiumPrivateKey: 'local-dilithium-private',
    signedPreKeyPrivate: 'repaired-spk-private',
    mlkemSignedPreKeyPrivate: 'repaired-mlkem-spk-private',
    oneTimePreKeyPrivates: new Map(),
    mlkemOneTimePreKeyPrivates: new Map(),
    nextPreKeyId: 1,
    signedPreKeyRotatedAt: 1_717_171_717_000,
  },
}))
const createPublicKeyBundleAsync = vi.fn(async () => createPublicKeyBundle())
const deriveX25519PublicKey = vi.fn(() => 'local-identity-pub')
const mockNow = vi.fn(() => 1_717_171_717_000)
const retryRequestState = {
  records: new Map<string, any>(),
  byRelay: new Map<string, string>(),
}
const relayReceiptJobs = new Map<string, any>()
const processedControlMessages = new Set<string>()

const localChatStorage = {
  getMessageByRelayId: vi.fn(),
  getMessage: vi.fn(),
  getDecryptedMessage: vi.fn(),
  getConversation: vi.fn(),
  updateMessageStatus: vi.fn(),
  updateConversation: vi.fn(),
  storeMessage: vi.fn(),
  storeDecryptedMessage: vi.fn(),
  getMessagesNeedingStatusSync: vi.fn(async () => []),
  linkRelayMessage: vi.fn(),
  isMessageProcessed: vi.fn(async (messageId: string) => processedControlMessages.has(messageId)),
  storeProcessedMessage: vi.fn(async (record: any) => {
    processedControlMessages.add(record.messageId)
  }),
  getRetryRequestRecord: vi.fn(async (key: string) => retryRequestState.records.get(key) ?? null),
  getRetryRequestRecordByRelayId: vi.fn(async (relayMessageId: string) => {
    const key = retryRequestState.byRelay.get(relayMessageId)
    return key ? retryRequestState.records.get(key) ?? null : null
  }),
  storeRetryRequestRecord: vi.fn(async (record: any) => {
    const existing = retryRequestState.records.get(record.key)
    if (existing?.relayMessageId && existing.relayMessageId !== record.relayMessageId) {
      retryRequestState.byRelay.delete(existing.relayMessageId)
    }
    retryRequestState.records.set(record.key, record)
    if (record.relayMessageId) {
      retryRequestState.byRelay.set(record.relayMessageId, record.key)
    }
  }),
  cleanupRetryRequestRecords: vi.fn(async (maxAgeMs: number) => {
    const cutoff = mockNow() - maxAgeMs
    let deleted = 0
    for (const [key, record] of Array.from(retryRequestState.records.entries())) {
      if ((record.lastSeenAt ?? 0) >= cutoff) continue
      retryRequestState.records.delete(key)
      if (record.relayMessageId) {
        retryRequestState.byRelay.delete(record.relayMessageId)
      }
      deleted++
    }
    return deleted
  }),
  storeRelayReceiptJob: vi.fn(async (job: any) => {
    relayReceiptJobs.set(job.key, job)
  }),
  getRelayReceiptJob: vi.fn(async (key: string) => relayReceiptJobs.get(key) ?? null),
  getPendingRelayReceiptJobs: vi.fn(async (nowMs: number, limit = 50) => (
    Array.from(relayReceiptJobs.values())
      .filter((job) => job.nextAttemptAt <= nowMs)
      .sort((left, right) => left.nextAttemptAt - right.nextAttemptAt)
      .slice(0, limit)
  )),
  deleteRelayReceiptJob: vi.fn(async (key: string) => {
    relayReceiptJobs.delete(key)
  }),
  cleanupRelayReceiptJobs: vi.fn(async (maxAgeMs: number) => {
    const cutoff = mockNow() - maxAgeMs
    let deleted = 0
    for (const [key, job] of Array.from(relayReceiptJobs.entries())) {
      if ((job.updatedAt ?? 0) >= cutoff) continue
      relayReceiptJobs.delete(key)
      deleted++
    }
    return deleted
  }),
  getPublicKeyBundle: vi.fn(),
  getPrivateKeyBundle: vi.fn(async () => null),
  storePublicKeyBundle: vi.fn(),
  storePrivateKeyBundle: vi.fn(),
  getAllTrackedIdentities: vi.fn(async () => []),
  storeMailboxScope: vi.fn(async () => undefined),
  getMailboxScope: vi.fn(async () => null),
  getMailboxScopes: vi.fn(async (): Promise<MailboxScopeState[]> => []),
  getConversationByParticipants: vi.fn(),
  storeConversation: vi.fn(),
  storeTrackedIdentity: vi.fn(),
}

vi.mock('../storage/local', () => ({
  localChatStorage,
  initStorageEncryption: vi.fn(),
  initStorageEncryptionFromPassword: vi.fn(),
  isStorageEncryptionEnabled: vi.fn(() => false),
}))

vi.mock('../crypto/dilithium', () => ({
  signWithDilithium,
  signWithDilithiumAsync,
  verifyDilithiumSignature,
  verifyDilithiumSignatureAsync: vi.fn(async (...args: Parameters<typeof verifyDilithiumSignature>) => (
    verifyDilithiumSignature(...args)
  )),
}))

vi.mock('../crypto/utils', () => ({
  generateUUID: vi.fn(() => 'uuid'),
  now: mockNow,
  createMessageHash: vi.fn(() => 'hash'),
  hash: vi.fn(() => new Uint8Array([1, 2, 3])),
  bytesToBase64: vi.fn((bytes?: Uint8Array) => (
    bytes?.length === 32 ? Buffer.from(bytes).toString('base64') : 'mailbox-token'
  )),
  base64ToBytes: vi.fn((value: string) => new Uint8Array(Buffer.from(value, 'base64'))),
  generateRandomBytes: vi.fn((length: number) => new Uint8Array(length).fill(4)),
  stringToBytes: vi.fn((value: string) => new TextEncoder().encode(value)),
  concatBytes: vi.fn((...arrays: Uint8Array[]) => {
    const totalLength = arrays.reduce((sum, array) => sum + array.length, 0)
    const merged = new Uint8Array(totalLength)
    let offset = 0
    for (const array of arrays) {
      merged.set(array, offset)
      offset += array.length
    }
    return merged
  }),
}))

vi.mock('../crypto/identityTracking', () => ({
  createTrackedIdentityFromBundle: vi.fn(() => ({
    identityId: 'remote',
    currentIdentityKey: 'identity-key',
    currentDilithiumKey: 'dilithium-key',
    trustState: 'trusted',
  })),
  hasIdentityChanged: vi.fn(() => false),
  updateTrackedIdentity: vi.fn(),
  verifyIdentity: vi.fn(),
  acknowledgeKeyChange: vi.fn(),
  isCommunicationAllowed: vi.fn(() => ({ allowed: true, requiresUserAction: false, reason: undefined })),
}))

vi.mock('../crypto/safetyNumber', () => ({
  generateSafetyNumber: vi.fn(),
  generateSafetyNumberFromBundles: vi.fn(),
  generateSafetyNumberFromBundlesAsync: vi.fn(),
}))

vi.mock('../crypto/bundleCapabilities', () => ({
  bundleSupportsScopedMailbox: vi.fn(() => true),
  bundleSupportsScopedMailboxAsync: vi.fn(async () => true),
  buildDefaultBundleMetadataCapabilities: vi.fn((publishedAt: number) => ({
    version: 1,
    mailboxTokens: ['legacy_v1', 'scoped_v2'],
    sealedControl: ['mailbox_scope_v1'],
    publishedAt,
  })),
  signBundleMetadataCapabilities: vi.fn(() => 'capabilities-signature'),
}))

vi.mock('./identity', () => ({
  createAnonymousIdentity: vi.fn(),
  createLinkedIdentity: vi.fn(),
  loadIdentityByAddress: vi.fn(),
  exportIdentity: vi.fn(),
  importIdentity: vi.fn(),
  getPublicKeyBundle: vi.fn(),
  storeContactBundle: vi.fn(),
  shouldPersistContactBundle: vi.fn(() => true),
  contactBundleAlreadyStored: vi.fn(() => false),
}))

vi.mock('./session', () => ({
  establishSessionAsInitiator: vi.fn(),
  getActiveSessionByRemoteIdentity: vi.fn(),
  getAllSessionsForRemoteIdentity: vi.fn(),
  encryptSessionMessage: vi.fn(),
  decryptWithSessionFallback: vi.fn(),
  establishSessionAndDecrypt: vi.fn(),
  promoteSessionToActive: vi.fn(),
  deleteSession: vi.fn(),
  archiveSession: vi.fn(),
  cleanupProcessedMessages: vi.fn(),
  getX3DHBootstrapFailureDetails,
  sessionNeedsReestablishment: vi.fn(() => false),
  setSessionSecurityConfig: vi.fn(),
}))

vi.mock('../crypto/x3dh', () => ({
  createPublicKeyBundle,
  createPublicKeyBundleAsync,
  bundleNeedsRefresh: vi.fn(() => ({ needsRefresh: false, reason: undefined })),
  rotateSignedPreKeyAsync: vi.fn(),
  replenishOneTimePreKeys: vi.fn(),
  replenishOneTimePreKeysAsync: vi.fn(async (bundle, privateBundle) => ({ bundle, privateBundle })),
  generateOneTimePreKeys: vi.fn(),
  generateOneTimePreKeysAsync: vi.fn(async () => ({
    preKeys: [],
    x25519PrivateKeys: new Map(),
    mlkemPrivateKeys: new Map(),
  })),
  verifyPublicKeyBundle: vi.fn(() => ({ valid: true })),
  verifyPublicKeyBundleAsync: vi.fn(async () => ({ valid: true })),
  STARTUP_PREKEY_COUNT: 20,
  TARGET_PREKEY_COUNT: 100,
}))

vi.mock('../crypto/x25519', () => ({
  deriveX25519PublicKey,
}))

vi.mock('../server/index', () => ({
  createBundleServer: vi.fn(),
  BundleServerRequestError: class BundleServerRequestError extends Error {
    reason: string
    statusCode?: number
    transient: boolean
    retryAfterMs?: number

    constructor(message: string, options?: {
      reason?: string
      statusCode?: number
      transient?: boolean
      retryAfterMs?: number
    }) {
      super(message)
      this.name = 'BundleServerRequestError'
      this.reason = options?.reason ?? 'unknown'
      this.statusCode = options?.statusCode
      this.transient = options?.transient ?? false
      this.retryAfterMs = options?.retryAfterMs
    }
  },
}))

function createRemoteBundle(overrides: Record<string, unknown> = {}): any {
  return {
    identityId: 'remote-identity',
    identityKey: 'identity-key',
    mlkemIdentityKey: 'mlkem-identity-key',
    dilithiumKey: 'dilithium-key',
    signedPreKey: {
      signature: 'remote-spk-sig',
      x25519PublicKey: 'remote-spk-x25519',
      mlkemPublicKey: 'remote-spk-mlkem',
      keyId: 7,
      timestamp: 1_717_171_700_000,
    },
    oneTimePreKeys: [],
    version: 1,
    timestamp: 1_717_171_700_000,
    bundleSignature: 'remote-bundle-sig',
    ...overrides,
  }
}

function createExistingConversation(): any {
  return {
    id: 'conversation-1',
    localIdentityId: 'local-identity',
    remoteIdentityId: 'remote-identity',
    sessionRecordId: 'remote-identity',
    unreadCount: 0,
    createdAt: 1_717_171_700_000,
    updatedAt: 1_717_171_700_000,
    expectedSequenceNumber: 0,
    outgoingSequenceNumber: 0,
  }
}

function installOwnedSealedRelayFetch(client: any, messages: any[]): ReturnType<typeof vi.fn> {
  client.openSealedRelayMessage = vi.fn((sealed: any) => sealed)
  return vi.fn(async () => messages.map((message) => ({
    recipientMailboxToken: message.recipientMailboxToken ?? 'mailbox-token',
    deliveryClass: message.deliveryClass ?? 'message',
    sealedEnvelope: message.sealedEnvelope ?? { type: 'message' },
    ...message,
  })))
}

function installOwnedSealedControlFetch(client: any, messages: any[]): ReturnType<typeof vi.fn> {
  client.openSealedControlMessages = vi.fn(() => messages)
  return vi.fn(async () => messages.map((message) => ({
    id: `control-${message.type}-${message.referenceMessageId ?? message.referenceIdentityId ?? 'message'}`,
    recipientMailboxToken: 'mailbox-token',
    deliveryClass: 'control',
    sealedEnvelope: { type: 'control' },
    status: 'pending',
    serverSequence: 1,
    createdAt: message.timestamp,
    expiresAt: message.timestamp + 60_000,
  })))
}

async function primeExistingConversation(client: any, remoteBundle: any): Promise<void> {
  const sessionModule = await import('./session')

  ;(client as any).identity = { id: 'local-identity' }
  ;(client as any).privateBundle = {}
  ;(client as any).trackedIdentities.set(remoteBundle.identityId, {
    identityId: remoteBundle.identityId,
    currentIdentityKey: remoteBundle.identityKey,
    currentDilithiumKey: remoteBundle.dilithiumKey,
    trustState: 'trusted',
  })
  localChatStorage.getPublicKeyBundle.mockResolvedValue(remoteBundle)
  localChatStorage.getConversationByParticipants.mockResolvedValue(createExistingConversation())
  ;(sessionModule.getActiveSessionByRemoteIdentity as any).mockResolvedValue({ id: 'session-1' })
}

describe('QuantumChat addContact persistence', () => {
  it('does not re-store an unchanged local contact bundle', async () => {
    const { QuantumChat } = await import('./chat')
    const { storeContactBundle, shouldPersistContactBundle } = await import('./identity')
    const remoteBundle = createRemoteBundle()
    const client = new (QuantumChat as any)({})
    storeContactBundle.mockClear()
    ;(shouldPersistContactBundle as any).mockReturnValueOnce(false)
    localChatStorage.getPublicKeyBundle.mockResolvedValue(remoteBundle)
    ;(client as any).trackedIdentities.set(remoteBundle.identityId, {
      identityId: remoteBundle.identityId,
      currentIdentityKey: remoteBundle.identityKey,
      currentDilithiumKey: remoteBundle.dilithiumKey,
      currentMlkemKey: remoteBundle.mlkemIdentityKey,
      trustState: 'trusted',
    })

    await expect(client.addContact(remoteBundle)).resolves.toEqual({
      isNew: false,
      identityChanged: false,
      changeEvent: undefined,
    })
    expect(storeContactBundle).not.toHaveBeenCalled()
  })
})

describe('QuantumChat local bundle repair', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createPublicKeyBundle.mockClear()
    createPublicKeyBundleAsync.mockClear()
    createPublicKeyBundle.mockReturnValue({
      bundle: {
        identityId: 'local-identity',
        identityKey: 'local-identity-pub',
        mlkemIdentityKey: 'local-mlkem-pub',
        dilithiumKey: 'local-dilithium-pub',
        signedPreKey: {
          id: 1,
          x25519PublicKey: 'repaired-spk-x25519',
          mlkemPublicKey: 'repaired-spk-mlkem',
          signature: 'repaired-spk-signature',
          timestamp: 1_717_171_717_000,
        },
        oneTimePreKeys: [],
        version: 1,
        timestamp: 1_717_171_717_000,
        bundleSignature: 'repaired-bundle-signature',
      },
      privateBundle: {
        identityPrivateKey: 'local-identity-private',
        mlkemIdentityPrivateKey: 'local-mlkem-private',
        dilithiumPrivateKey: 'local-dilithium-private',
        signedPreKeyPrivate: 'repaired-spk-private',
        mlkemSignedPreKeyPrivate: 'repaired-mlkem-spk-private',
        oneTimePreKeyPrivates: new Map(),
        mlkemOneTimePreKeyPrivates: new Map(),
        nextPreKeyId: 1,
        signedPreKeyRotatedAt: 1_717_171_717_000,
      },
    })
    deriveX25519PublicKey.mockReturnValue('local-identity-pub')
    localChatStorage.getPublicKeyBundle.mockResolvedValue(null)
    localChatStorage.storePublicKeyBundle.mockResolvedValue(undefined)
    localChatStorage.storePrivateKeyBundle.mockResolvedValue(undefined)
    localChatStorage.getAllTrackedIdentities.mockResolvedValue([])
  })

  it('repairs a missing local public bundle without changing identity keys', async () => {
    const { QuantumChat } = await import('./chat')
    const identityModule = await import('./identity')

    const identity = {
      id: 'local-identity',
      blockchainAddress: 'EXO_LOCAL',
      displayName: 'Local',
      identityPublicKey: 'local-identity-pub',
      mlkemPublicKey: 'local-mlkem-pub',
      dilithiumPublicKey: 'local-dilithium-pub',
      createdAt: 1,
      isAnonymous: false,
    }
    const privateBundle = {
      identityPrivateKey: 'local-identity-private',
      mlkemIdentityPrivateKey: 'local-mlkem-private',
      dilithiumPrivateKey: 'local-dilithium-private',
      signedPreKeyPrivate: 'missing-public-spk-private',
      mlkemSignedPreKeyPrivate: 'missing-public-mlkem-spk-private',
      oneTimePreKeyPrivates: new Map(),
      mlkemOneTimePreKeyPrivates: new Map(),
      nextPreKeyId: 1,
    }

    ;(identityModule.loadIdentityByAddress as any).mockResolvedValue({
      identity,
      privateBundle,
    })

    const client = await QuantumChat.init({
      anonymous: false,
      identity: {
        address: 'EXO_LOCAL',
        publicKey: 'wallet-public',
        privateKey: 'wallet-private',
      },
      preKeyCount: 25,
      autoPublishBundle: false,
    })

    expect(deriveX25519PublicKey).toHaveBeenCalledWith('local-identity-private')
    expect(createPublicKeyBundleAsync).toHaveBeenCalledWith(
      'local-identity',
      'local-identity-pub',
      'local-dilithium-pub',
      'local-dilithium-private',
      'local-identity-private',
      {
        publicKey: 'local-mlkem-pub',
        privateKey: 'local-mlkem-private',
      },
      25,
      expect.any(Function),
    )
    expect(localChatStorage.storePublicKeyBundle).toHaveBeenCalledWith(
      'local-identity',
      expect.objectContaining({ identityKey: 'local-identity-pub' }),
    )
    expect(localChatStorage.storePrivateKeyBundle).toHaveBeenCalledWith(
      'local-identity',
      expect.objectContaining({ identityPrivateKey: 'local-identity-private' }),
    )
    expect(client.getIdentity()).toEqual(expect.objectContaining({
      id: 'local-identity',
      identityPublicKey: 'local-identity-pub',
      mlkemPublicKey: 'local-mlkem-pub',
      dilithiumPublicKey: 'local-dilithium-pub',
    }))

    client.disconnect()
  })

  it('authorizes a freshly linked identity before it can be bound online', async () => {
    const { QuantumChat } = await import('./chat')
    const identityModule = await import('./identity')
    const ensureLocalPublicBundle = vi.spyOn(
      QuantumChat.prototype as any,
      'ensureLocalPublicBundle',
    ).mockResolvedValue(null)
    const identity = {
      id: 'imported-local-identity',
      blockchainAddress: 'EXO_LOCAL',
      displayName: 'Local',
      identityPublicKey: 'local-identity-pub',
      mlkemPublicKey: 'local-mlkem-pub',
      dilithiumPublicKey: 'local-dilithium-pub',
      createdAt: 1,
      isAnonymous: false,
    }
    const privateBundle = {
      identityPrivateKey: 'local-identity-private',
      mlkemIdentityPrivateKey: 'local-mlkem-private',
      dilithiumPrivateKey: 'local-dilithium-private',
      signedPreKeyPrivate: 'local-spk-private',
      mlkemSignedPreKeyPrivate: 'local-mlkem-spk-private',
      oneTimePreKeyPrivates: new Map(),
      mlkemOneTimePreKeyPrivates: new Map(),
      nextPreKeyId: 1,
    }
    ;(identityModule.loadIdentityByAddress as any).mockResolvedValue(null)
    ;(identityModule.createLinkedIdentity as any).mockResolvedValue({
      identity,
      privateBundle,
    })

    try {
      const client = await QuantumChat.init({
        anonymous: false,
        identity: {
          address: 'EXO_LOCAL',
          publicKey: 'wallet-public',
          privateKey: 'wallet-private',
        },
        autoPublishBundle: false,
      })

      expect(ensureLocalPublicBundle).toHaveBeenCalledTimes(1)
      client.disconnect()
    } finally {
      ensureLocalPublicBundle.mockRestore()
    }
  })
})

describe('QuantumChat one-time contact cards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localChatStorage.storePublicKeyBundle.mockResolvedValue(undefined)
    localChatStorage.storePrivateKeyBundle.mockResolvedValue(undefined)
  })

  it('reserves a public OPK while retaining its private halves for redemption', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})
    const privateBundle = {
      oneTimePreKeyPrivates: new Map([[7, 'opk-x25519-private']]),
      mlkemOneTimePreKeyPrivates: new Map([[7, 'opk-mlkem-private']]),
    }
    const bundle = {
      identityId: 'local-identity',
      oneTimePreKeys: [{
        id: 7,
        x25519PublicKey: 'opk-x25519-public',
        mlkemPublicKey: 'opk-mlkem-public',
      }],
    }
    ;(client as any).identity = { id: 'local-identity' }
    ;(client as any).privateBundle = privateBundle
    client.getPublicKeyBundle = vi.fn(async () => bundle)

    const reserved = await client.reserveOneTimeContactCardPreKey()

    expect(reserved).toEqual({
      bundle: { ...bundle, oneTimePreKeys: [bundle.oneTimePreKeys[0]] },
      cardOpk: bundle.oneTimePreKeys[0],
    })
    expect(privateBundle.oneTimePreKeyPrivates.has(7)).toBe(true)
    expect(privateBundle.mlkemOneTimePreKeyPrivates.has(7)).toBe(true)
    expect(localChatStorage.storePublicKeyBundle).toHaveBeenCalledWith(
      'local-identity',
      expect.objectContaining({ oneTimePreKeys: [] }),
    )
  })

  it('restores an unsubmitted contact-card OPK without duplicating it', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})
    const cardOpk = {
      id: 7,
      x25519PublicKey: 'opk-x25519-public',
      mlkemPublicKey: 'opk-mlkem-public',
    }
    ;(client as any).identity = { id: 'local-identity' }
    let bundle = {
      identityId: 'local-identity',
      oneTimePreKeys: [],
    }
    client.getPublicKeyBundle = vi.fn(async () => bundle)
    localChatStorage.storePublicKeyBundle.mockImplementation(async (_identityId, nextBundle) => {
      bundle = nextBundle as typeof bundle
    })

    await client.releaseOneTimeContactCardPreKey(cardOpk)
    await client.releaseOneTimeContactCardPreKey(cardOpk)

    expect(localChatStorage.storePublicKeyBundle).toHaveBeenCalledTimes(1)
    expect(localChatStorage.storePublicKeyBundle).toHaveBeenCalledWith(
      'local-identity',
      expect.objectContaining({ oneTimePreKeys: [cardOpk] }),
    )
  })
})

describe('QuantumChat server bundle init', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localChatStorage.getAllTrackedIdentities.mockResolvedValue([])
  })

  async function makeBundlePublishClient(bundleServer: {
    isAvailable: ReturnType<typeof vi.fn>
    bundleExistsOnServer: ReturnType<typeof vi.fn>
    publishBundle: ReturnType<typeof vi.fn>
  }) {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})
    const identity = {
      id: 'local-identity',
      blockchainAddress: 'EXO_LOCAL',
      displayName: 'Local',
      identityPublicKey: 'local-identity-pub',
      mlkemPublicKey: 'local-mlkem-pub',
      dilithiumPublicKey: 'local-dilithium-pub',
      createdAt: 1,
      isAnonymous: false,
    }
    const privateBundle = {
      identityPrivateKey: 'local-identity-private',
      mlkemIdentityPrivateKey: 'local-mlkem-private',
      dilithiumPrivateKey: 'local-dilithium-private',
      signedPreKeyPrivate: 'spk-private',
      mlkemSignedPreKeyPrivate: 'mlkem-spk-private',
      oneTimePreKeyPrivates: new Map(),
      mlkemOneTimePreKeyPrivates: new Map(),
      nextPreKeyId: 1,
      signedPreKeyRotatedAt: mockNow(),
    }
    const publicBundle = {
      identityId: 'local-identity',
      identityKey: 'local-identity-pub',
      mlkemIdentityKey: 'local-mlkem-pub',
      dilithiumKey: 'local-dilithium-pub',
      signedPreKey: {
        id: 1,
        x25519PublicKey: 'spk-x25519',
        mlkemPublicKey: 'spk-mlkem',
        signature: 'spk-signature',
        timestamp: 1_717_171_717_000,
      },
      oneTimePreKeys: [],
      version: 1,
      timestamp: 1_717_171_717_000,
      bundleSignature: 'bundle-signature',
    }
    ;(client as any).identity = identity
    ;(client as any).privateBundle = privateBundle
    ;(client as any).bundleServer = bundleServer
    localChatStorage.getPublicKeyBundle.mockResolvedValue(publicBundle)
    return client as {
      forcePublishBundle: () => Promise<{ success: boolean; error?: string }>
    }
  }

  it('does not republish an already authorized bundle during normal init', async () => {
    const { QuantumChat } = await import('./chat')
    const identityModule = await import('./identity')
    const serverModule = await import('../server/index')

    const identity = {
      id: 'local-identity',
      blockchainAddress: 'EXO_LOCAL',
      displayName: 'Local',
      identityPublicKey: 'local-identity-pub',
      mlkemPublicKey: 'local-mlkem-pub',
      dilithiumPublicKey: 'local-dilithium-pub',
      createdAt: 1,
      isAnonymous: false,
    }
    const privateBundle = {
      identityPrivateKey: 'local-identity-private',
      mlkemIdentityPrivateKey: 'local-mlkem-private',
      dilithiumPrivateKey: 'local-dilithium-private',
      signedPreKeyPrivate: 'spk-private',
      mlkemSignedPreKeyPrivate: 'mlkem-spk-private',
      oneTimePreKeyPrivates: new Map(),
      mlkemOneTimePreKeyPrivates: new Map(),
      nextPreKeyId: 1,
      signedPreKeyRotatedAt: mockNow(),
    }
    const localBundle = {
      identityId: 'local-identity',
      identityKey: 'local-identity-pub',
      mlkemIdentityKey: 'local-mlkem-pub',
      dilithiumKey: 'local-dilithium-pub',
      signedPreKey: {
        id: 1,
        x25519PublicKey: 'spk-x25519',
        mlkemPublicKey: 'spk-mlkem',
        signature: 'spk-signature',
        timestamp: 1_717_171_717_000,
      },
      oneTimePreKeys: Array.from({ length: 50 }, (_value, index) => ({
        id: index + 1,
        x25519PublicKey: `opk-x25519-${index + 1}`,
        mlkemPublicKey: `opk-mlkem-${index + 1}`,
        signature: `opk-signature-${index + 1}`,
      })),
      version: 1,
      timestamp: 1_717_171_717_000,
      bundleSignature: 'bundle-signature',
      walletAuthorization: {
        payload: {
          walletAddress: 'EXO_LOCAL',
          walletPublicKey: 'wallet-public',
          identityId: 'local-identity',
          bundleHash: 'bundle-hash',
          issuedAt: 1_717_171_717_000,
        },
        signature: 'wallet-signature',
      },
    }
    const bundleServer = {
      isAvailable: vi.fn(() => true),
      bundleExistsOnServer: vi.fn(async () => true),
      publishBundle: vi.fn(async () => ({ success: true, opkCount: 100 })),
      getOPKCount: vi.fn(async () => 100),
    }

    ;(identityModule.loadIdentityByAddress as any).mockResolvedValue({
      identity,
      privateBundle,
    })
    ;(serverModule.createBundleServer as any).mockResolvedValue(bundleServer)
    localChatStorage.getPublicKeyBundle.mockResolvedValue(localBundle)

    const client = await QuantumChat.init({
      anonymous: false,
      identity: {
        address: 'EXO_LOCAL',
        publicKey: 'wallet-public',
        privateKey: 'wallet-private',
      },
      server: {
        type: 'backend',
        backendUrl: 'https://example.backend.co',
        accessToken: 'verified-token',
      },
    })

    expect(bundleServer.bundleExistsOnServer).toHaveBeenCalledWith('local-identity')
    expect(bundleServer.publishBundle).not.toHaveBeenCalled()
    expect(bundleServer.getOPKCount).toHaveBeenCalledWith('local-identity')

    client.disconnect()
  })

  it('surfaces backend publish failures during forced bundle recovery', async () => {
    const bundleServer = {
      isAvailable: vi.fn(() => true),
      bundleExistsOnServer: vi.fn(async () => true),
      publishBundle: vi.fn(async () => ({ success: false, error: 'unauthorized_wallet' })),
    }
    const client = await makeBundlePublishClient(bundleServer)

    await expect(client.forcePublishBundle()).resolves.toEqual({
      success: false,
      error: 'unauthorized_wallet',
    })

    expect(bundleServer.bundleExistsOnServer).not.toHaveBeenCalled()
  })

  it('reports when a successful forced publish is still missing afterwards', async () => {
    const bundleServer = {
      isAvailable: vi.fn(() => true),
      bundleExistsOnServer: vi.fn(async () => false),
      publishBundle: vi.fn(async () => ({ success: true, opkCount: 100 })),
    }
    const client = await makeBundlePublishClient(bundleServer)

    await expect(client.forcePublishBundle()).resolves.toEqual({
      success: false,
      error: 'Bundle was not persisted after publish',
    })

    expect(bundleServer.bundleExistsOnServer).toHaveBeenCalledWith('local-identity')
  })

  it('accepts forced bundle recovery after publish and existence verification', async () => {
    const bundleServer = {
      isAvailable: vi.fn(() => true),
      bundleExistsOnServer: vi.fn(async () => true),
      publishBundle: vi.fn(async () => ({ success: true, opkCount: 100 })),
    }
    const client = await makeBundlePublishClient(bundleServer)

    await expect(client.forcePublishBundle()).resolves.toEqual({ success: true })
  })

})

describe('QuantumChat view-once storage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localChatStorage.getConversation.mockResolvedValue({
      id: 'conversation-1',
      expectedSequenceNumber: 0,
      unreadCount: 0,
    })
    localChatStorage.updateConversation.mockResolvedValue(undefined)
    localChatStorage.storeMessage.mockResolvedValue(undefined)
    localChatStorage.storeDecryptedMessage.mockResolvedValue(undefined)
    localChatStorage.getMessage.mockResolvedValue(null)
    localChatStorage.getDecryptedMessage.mockResolvedValue(null)
    localChatStorage.isMessageProcessed.mockResolvedValue(false)
  })

  it('stores relay view-once rows as sealed placeholders without decrypting', async () => {
    const { QuantumChat } = await import('./chat')
    const sessionModule = await import('./session')
    const client = new (QuantumChat as any)({})

    ;(client as any).identity = { id: 'local-identity' }

    const encrypted = {
      header: { sessionFingerprint: 'session-fingerprint' },
      ciphertext: 'ciphertext',
      tag: 'tag',
      nonce: 'nonce',
      signature: 'signature',
      version: 1,
      metadata: {
        messageId: 'message-1',
        senderId: 'remote-identity',
        recipientId: 'local-identity',
        sessionId: 'session-1',
        sequenceNumber: 0,
        timestamp: 1_717_171_717_000,
      },
    }

    const result = await client.receiveDeferredViewOnceMessage(
      'conversation-1',
      encrypted as any,
      'remote-identity',
    )

    expect(result).toEqual(expect.objectContaining({
      id: 'message-1',
      content: '',
      messageKind: 'view_once',
      oneTime: expect.objectContaining({
        state: 'locked',
        requiresReveal: true,
      }),
    }))
    const storedMessage = localChatStorage.storeMessage.mock.calls[0]?.[0]
    expect(storedMessage).toEqual(expect.objectContaining({
      id: 'message-1',
      messageKind: 'view_once',
      oneTime: expect.objectContaining({
        state: 'locked',
        requiresReveal: true,
      }),
    }))
    expect(storedMessage).not.toHaveProperty('content')
    expect(localChatStorage.updateConversation).toHaveBeenNthCalledWith(
      1,
      'conversation-1',
      { unreadProjectionDirty: true },
    )
    expect(localChatStorage.updateConversation.mock.invocationCallOrder[0]).toBeLessThan(
      localChatStorage.storeMessage.mock.invocationCallOrder[0],
    )
    expect(localChatStorage.storeDecryptedMessage).toHaveBeenCalledWith(expect.objectContaining({
      id: 'message-1',
      content: '',
      messageKind: 'view_once',
    }))
    expect(localChatStorage.updateConversation).toHaveBeenCalledWith(
      'conversation-1',
      expect.objectContaining({
        hasVisibleActivity: true,
        lastMessage: expect.objectContaining({
          content: 'One-time message',
        }),
      }),
    )
    expect((sessionModule.decryptWithSessionFallback as any)).not.toHaveBeenCalled()
    expect((sessionModule.establishSessionAndDecrypt as any)).not.toHaveBeenCalled()
  })

  it('stores inbound hidden controls without replacing the visible preview', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})
    ;(client as any).identity = { id: 'local-identity' }
    ;(client as any).decryptIncomingPayload = vi.fn(async () => ({
      id: 'message-hidden',
      conversationId: 'conversation-1',
      senderId: 'remote-identity',
      content: JSON.stringify({
        capability: 'A'.repeat(100),
        v: 2,
        type: 'ble_route_capability',
      }),
      timestamp: 1_717_171_717_000,
      signatureVerified: true,
      status: 'delivered',
    }))

    await client.receiveMessage(
      'conversation-1',
      { metadata: { messageId: 'message-hidden' } } as any,
      'remote-identity',
      { messageKind: 'hidden_control' },
    )

    expect(localChatStorage.storeMessage).toHaveBeenCalledWith(expect.objectContaining({
      messageKind: 'hidden_control',
    }))
    expect(localChatStorage.storeDecryptedMessage).toHaveBeenCalledWith(expect.objectContaining({
      messageKind: 'hidden_control',
    }))
    expect(localChatStorage.updateConversation).toHaveBeenCalledTimes(1)
    expect(localChatStorage.updateConversation).toHaveBeenCalledWith(
      'conversation-1',
      { unreadProjectionDirty: true },
    )
  })

  it('does not store a new inbound row when marking unread dirty fails', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})
    ;(client as any).identity = { id: 'local-identity' }
    localChatStorage.updateConversation.mockRejectedValueOnce(new Error('storage unavailable'))

    await expect(client.receiveDeferredViewOnceMessage(
      'conversation-1',
      {
        header: { sessionFingerprint: 'session-fingerprint' },
        ciphertext: 'ciphertext',
        tag: 'tag',
        nonce: 'nonce',
        signature: 'signature',
        version: 1,
        metadata: {
          messageId: 'message-dirty-failure',
          senderId: 'remote-identity',
          recipientId: 'local-identity',
          sessionId: 'session-1',
          sequenceNumber: 0,
          timestamp: 1_717_171_717_000,
        },
      } as any,
      'remote-identity',
    )).rejects.toThrow('storage unavailable')

    expect(localChatStorage.storeMessage).not.toHaveBeenCalled()
    expect(localChatStorage.storeDecryptedMessage).not.toHaveBeenCalled()
  })

  it('does not increment unread or emit again while repairing an existing placeholder', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})
    const receivedListener = vi.fn()
    client.on('message:received', receivedListener)
    ;(client as any).identity = { id: 'local-identity' }
    localChatStorage.getMessage.mockResolvedValue({
      id: 'message-duplicate',
      messageKind: 'view_once',
    })
    localChatStorage.getDecryptedMessage.mockResolvedValue(null)

    await client.receiveDeferredViewOnceMessage(
      'conversation-1',
      {
        header: { sessionFingerprint: 'session-fingerprint' },
        ciphertext: 'ciphertext',
        tag: 'tag',
        nonce: 'nonce',
        signature: 'signature',
        version: 1,
        metadata: {
          messageId: 'message-duplicate',
          senderId: 'remote-identity',
          recipientId: 'local-identity',
          sessionId: 'session-1',
          sequenceNumber: 0,
          timestamp: 1_717_171_717_000,
        },
      } as any,
      'remote-identity',
    )

    expect(localChatStorage.storeDecryptedMessage).toHaveBeenCalled()
    expect(localChatStorage.updateConversation).not.toHaveBeenCalled()
    expect(receivedListener).not.toHaveBeenCalled()
  })

  it('reveals stored view-once rows on demand without rewriting plaintext', async () => {
    const { QuantumChat } = await import('./chat')
    const sessionModule = await import('./session')
    const client = new (QuantumChat as any)({})

    ;(client as any).identity = { id: 'local-identity' }
    ;(client as any).privateBundle = {}
    ;(client as any).trackedIdentities.set('remote-identity', {
      identityId: 'remote-identity',
      currentIdentityKey: 'identity-key',
      currentDilithiumKey: 'dilithium-key',
      trustState: 'trusted',
    })

    const encrypted = {
      header: { sessionFingerprint: 'session-fingerprint' },
      ciphertext: 'ciphertext',
      tag: 'tag',
      nonce: 'nonce',
      signature: 'signature',
      version: 1,
      metadata: {
        messageId: 'message-1',
        senderId: 'remote-identity',
        recipientId: 'local-identity',
        sessionId: 'session-1',
        sequenceNumber: 0,
        timestamp: 1_717_171_717_000,
      },
    }

    localChatStorage.getMessage.mockResolvedValue({
      id: 'message-1',
      conversationId: 'conversation-1',
      senderIdentityId: 'remote-identity',
      encryptedData: encrypted,
      messageKind: 'view_once',
      oneTime: { state: 'locked', requiresReveal: true },
    })
    localChatStorage.getPublicKeyBundle.mockResolvedValue(createRemoteBundle())
    ;(sessionModule.getActiveSessionByRemoteIdentity as any).mockResolvedValue({
      id: 'session-1',
      baseKeyFingerprint: 'session-fingerprint',
      status: 'active',
      state: {
        receivedFirstMessage: true,
        receivingHeaderKey: 'header-key',
        receivingChainKey: 'chain-key',
      },
    })
    ;(sessionModule.decryptWithSessionFallback as any).mockResolvedValue({
      decrypted: {
        id: 'message-1',
        conversationId: '',
        senderId: 'remote-identity',
        content: JSON.stringify({ v: 2, type: 'view_once', kind: 'text', body: 'secret' }),
        timestamp: 1_717_171_717_000,
        signatureVerified: true,
        sequenceNumber: 0,
      },
      session: {
        id: 'session-1',
        baseKeyFingerprint: 'session-fingerprint',
        status: 'active',
        state: {},
      },
      usedFallback: false,
      sessionPromotable: false,
    })

    const revealed = await client.revealStoredViewOnceMessage('message-1')

    expect(revealed.content).toBe(JSON.stringify({ v: 2, type: 'view_once', kind: 'text', body: 'secret' }))
    expect(localChatStorage.storeMessage).not.toHaveBeenCalled()
    expect(localChatStorage.storeDecryptedMessage).not.toHaveBeenCalled()
    expect(localChatStorage.updateConversation).toHaveBeenCalledWith('conversation-1', {
      expectedSequenceNumber: 1,
    })
  })
})

describe('QuantumChat scoped mailbox handshake', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localChatStorage.storeMailboxScope.mockResolvedValue(undefined)
    localChatStorage.getMailboxScope.mockResolvedValue(null)
    localChatStorage.getMailboxScopes.mockResolvedValue([])
  })

  it('registers the accepter-owned scoped token before acknowledging an offer', async () => {
    const { QuantumChat } = await import('./chat')
    const registerMailboxScope = vi.fn(async () => undefined)
    const sendControlMessageToRecipient = vi.fn(async () => undefined)
    const client = new (QuantumChat as any)({})
    ;(client as any).identity = {
      id: 'local-identity',
      identityPublicKey: 'local-identity-key',
      mlkemPublicKey: 'local-mlkem-key',
      dilithiumPublicKey: 'local-dilithium-key',
      dilithiumPrivateKey: 'local-dilithium-private-key',
    }
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      registerMailboxScope,
    }
    ;(client as any).sendControlMessageToRecipient = sendControlMessageToRecipient

    await (client as any).acceptMailboxScopeOffer({
      type: 'mailbox_scope_offer',
      referenceIdentityId: 'remote-identity',
      timestamp: 1_717_171_717_000,
      data: {
        scopeId: 'scope-1',
        scopeSecret: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        epoch: 0,
      },
      signature: 'signature',
    })

    expect(registerMailboxScope).toHaveBeenCalledWith(expect.stringMatching(/^smbx2\./))
    expect(localChatStorage.storeMailboxScope).toHaveBeenCalledWith(
      expect.objectContaining({
        localIdentityId: 'local-identity',
        remoteIdentityId: 'remote-identity',
        scopeId: 'scope-1',
        status: 'active',
        initiatedByLocal: false,
        registeredAt: expect.any(Number),
        acknowledgedAt: expect.any(Number),
      }),
    )
    expect(sendControlMessageToRecipient).toHaveBeenCalledWith(
      'remote-identity',
      expect.objectContaining({
        type: 'mailbox_scope_ack',
        data: { scopeId: 'scope-1', epoch: 0 },
      }),
    )
  })

  it('emits when a mailbox scope is registered', async () => {
    const { QuantumChat } = await import('./chat')
    const registerMailboxScope = vi.fn(async () => undefined)
    const client = new (QuantumChat as any)({})
    ;(client as any).identity = {
      id: 'local-identity',
      identityPublicKey: 'local-identity-key',
      mlkemPublicKey: 'local-mlkem-key',
      dilithiumPublicKey: 'local-dilithium-key',
    }
    ;(client as any).bundleServer = {
      registerMailboxScope,
    }
    const listener = vi.fn()
    client.on('mailbox_scope:registered', listener)

    await (client as any).registerMailboxScope({
      localIdentityId: 'local-identity',
      remoteIdentityId: 'remote-identity',
      scopeId: 'scope-registered',
      scopeSecret: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      epoch: 1,
      status: 'active',
      createdAt: 1,
      updatedAt: 1,
    })

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      type: 'mailbox_scope:registered',
      data: expect.objectContaining({
        remoteIdentityId: 'remote-identity',
        scopeId: 'scope-registered',
        epoch: 1,
      }),
    }))
  })

  it('only derives outbound scoped tokens from registered and acknowledged scopes', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})
    ;(client as any).identity = { id: 'local-identity' }
    const recipientBundle = createRemoteBundle()

    localChatStorage.getMailboxScope.mockResolvedValueOnce({
      localIdentityId: 'local-identity',
      remoteIdentityId: 'remote-identity',
      scopeId: 'scope-unsafe',
      scopeSecret: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      epoch: 0,
      status: 'active',
      createdAt: 1,
      updatedAt: 1,
    } as any)
    await expect(client.getScopedMailboxTokenForRecipient(recipientBundle)).resolves.toBeUndefined()

    localChatStorage.getMailboxScope.mockResolvedValueOnce({
      localIdentityId: 'local-identity',
      remoteIdentityId: 'remote-identity',
      scopeId: 'scope-registered-but-not-acked',
      scopeSecret: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      epoch: 0,
      status: 'active',
      createdAt: 1,
      updatedAt: 1,
      registeredAt: 2,
    } as any)
    await expect(client.getScopedMailboxTokenForRecipient(recipientBundle)).resolves.toBeUndefined()

    localChatStorage.getMailboxScope.mockResolvedValueOnce({
      localIdentityId: 'local-identity',
      remoteIdentityId: 'remote-identity',
      scopeId: 'scope-safe',
      scopeSecret: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      epoch: 0,
      status: 'active',
      createdAt: 1,
      updatedAt: 1,
      registeredAt: 2,
      acknowledgedAt: 3,
    } as any)
    await expect(client.getScopedMailboxTokenForRecipient(recipientBundle)).resolves.toMatch(/^smbx2\./)
  })

  it('caches active scoped tokens and invalidates them when scope state changes', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})
    ;(client as any).identity = { id: 'local-identity' }
    const recipientBundle = createRemoteBundle()
    const activeScope = {
      localIdentityId: 'local-identity',
      remoteIdentityId: 'remote-identity',
      scopeId: 'scope-safe',
      scopeSecret: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      epoch: 0,
      status: 'active',
      createdAt: 1,
      updatedAt: 1,
      registeredAt: 2,
      acknowledgedAt: 3,
    } as any
    localChatStorage.getMailboxScope.mockResolvedValue(activeScope)

    await client.getScopedMailboxTokenForRecipient(recipientBundle)
    await client.getScopedMailboxTokenForRecipient(recipientBundle)
    expect(localChatStorage.getMailboxScope).toHaveBeenCalledTimes(1)

    const revisedRecipientBundle = {
      ...recipientBundle,
      identityKey: 'remote-identity-key-revised',
    }
    await client.getScopedMailboxTokenForRecipient(revisedRecipientBundle)
    expect(localChatStorage.getMailboxScope).toHaveBeenCalledTimes(2)

    await (client as any).storeMailboxScope({
      ...activeScope,
      epoch: 1,
      updatedAt: 4,
    })
    await client.getScopedMailboxTokenForRecipient(revisedRecipientBundle)

    expect(localChatStorage.getMailboxScope).toHaveBeenCalledTimes(3)
  })

  it('does not drop a received message when scoped registration fails after decrypt', async () => {
    const { QuantumChat } = await import('./chat')
    const remoteBundle = createRemoteBundle()
    const client = new (QuantumChat as any)({})
    ;(client as any).identity = {
      id: 'local-identity',
      identityPublicKey: 'local-identity-key',
      mlkemPublicKey: 'local-mlkem-key',
      dilithiumPublicKey: 'local-dilithium-key',
      dilithiumPrivateKey: 'local-dilithium-private-key',
    }
    ;(client as any).privateBundle = {}
    ;(client as any).trackedIdentities.set('remote-identity', {
      identityId: 'remote-identity',
      currentIdentityKey: 'identity-key',
      currentDilithiumKey: 'dilithium-key',
      trustState: 'trusted',
    })
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      registerMailboxScope: vi.fn(async () => {
        throw new Error('registration offline')
      }),
      fetchOwnedSealedMessages: installOwnedSealedRelayFetch(client, [
        {
          id: 'relay-1',
          senderIdentityId: 'remote-identity',
          recipientIdentityId: 'local-identity',
          conversationId: 'conversation-1',
          encryptedData: { metadata: { messageId: 'inner-1' } },
          senderBundle: remoteBundle,
          status: 'pending',
          serverSequence: 51,
          createdAt: 1_717_171_717_000,
          expiresAt: 1_717_171_817_000,
        },
      ]),
      fetchBundle: vi.fn(async () => ({ bundle: null })),
      markDelivered: vi.fn(async () => undefined),
      fetchMessageStatuses: vi.fn(async () => []),
    }
    ;(client as any).receiveMessage = vi.fn(async () => ({
      id: 'inner-1',
      conversationId: 'conversation-1',
      senderId: 'remote-identity',
      content: 'hello',
      timestamp: 1_717_171_717_000,
      signatureVerified: true,
      status: 'delivered',
    }))
    localChatStorage.getConversationByParticipants.mockResolvedValue({
      id: 'conversation-1',
      expectedSequenceNumber: 0,
      unreadCount: 0,
    })
    localChatStorage.getMailboxScopes.mockResolvedValue([{
      localIdentityId: 'local-identity',
      remoteIdentityId: 'remote-identity',
      scopeId: 'scope-pending-registration',
      scopeSecret: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      epoch: 0,
      status: 'active',
      initiatedByLocal: true,
      createdAt: 1,
      updatedAt: 1,
    }])
    localChatStorage.linkRelayMessage.mockResolvedValue(undefined)

    const result = await client.fetchPendingMessages()
    await Promise.resolve()

    expect(result.messages).toHaveLength(1)
    expect(result.messages[0].relayMessageId).toBe('relay-1')
    expect(result.messages[0].authenticatedSenderBundle).toBe(remoteBundle)
    expect(result.advanceSequence).toBe(51)
    expect((client as any).bundleServer.registerMailboxScope).toHaveBeenCalled()
  })

  it('starts the owned mailbox GET before a stale scope keepalive POST', async () => {
    const { QuantumChat } = await import('./chat')
    const { MAILBOX_SCOPE_REGISTRATION_VERSION } = await import('./mailboxRegistry')
    const remoteBundle = createRemoteBundle()
    const client = new (QuantumChat as any)({})
    const order: string[] = []
    ;(client as any).identity = {
      id: 'local-identity',
      identityPublicKey: 'local-identity-key',
      mlkemPublicKey: 'local-mlkem-key',
      dilithiumPublicKey: 'local-dilithium-key',
      dilithiumPrivateKey: 'local-dilithium-private-key',
    }
    ;(client as any).privateBundle = {}
    ;(client as any).trackedIdentities.set('remote-identity', {
      identityId: 'remote-identity',
      currentIdentityKey: 'identity-key',
      currentDilithiumKey: 'dilithium-key',
      trustState: 'trusted',
    })
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      registerMailboxScope: vi.fn(async () => {
        order.push('register')
      }),
      fetchOwnedSealedMessages: vi.fn(async () => {
        order.push('get')
        return []
      }),
      fetchBundle: vi.fn(async () => ({ bundle: null })),
      markDelivered: vi.fn(async () => undefined),
      fetchMessageStatuses: vi.fn(async () => []),
    }
    localChatStorage.getMailboxScopes.mockResolvedValue([{
      localIdentityId: 'local-identity',
      remoteIdentityId: 'remote-identity',
      scopeId: 'scope-stale',
      scopeSecret: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      epoch: 0,
      status: 'active',
      initiatedByLocal: true,
      createdAt: 1,
      updatedAt: 1,
      registeredAt: 1,
      acknowledgedAt: 1,
      registrationVersion: MAILBOX_SCOPE_REGISTRATION_VERSION,
    }])

    await client.fetchPendingMessages()
    await Promise.resolve()

    expect(order[0]).toBe('get')
    expect(order).toContain('register')
  })

  it('serializes relay messages by server sequence', async () => {
    const { QuantumChat } = await import('./chat')
    const yieldToHost = vi.fn(async () => undefined)
    const client = new (QuantumChat as any)({
      cooperativeScheduler: { yieldToHost },
    })
    ;(client as any).identity = {
      id: 'local-identity',
      identityPublicKey: 'local-identity-key',
      mlkemPublicKey: 'local-mlkem-key',
      dilithiumPublicKey: 'local-dilithium-key',
      dilithiumPrivateKey: 'local-dilithium-private-key',
    }
    ;(client as any).privateBundle = {}
    ;(client as any).trackedIdentities.set('remote-a', {
      identityId: 'remote-a',
      currentIdentityKey: 'identity-key-a',
      currentDilithiumKey: 'dilithium-key-a',
      trustState: 'trusted',
    })
    ;(client as any).trackedIdentities.set('remote-b', {
      identityId: 'remote-b',
      currentIdentityKey: 'identity-key-b',
      currentDilithiumKey: 'dilithium-key-b',
      trustState: 'trusted',
    })

    let releaseFirstSender: (() => void) | undefined
    const decryptStarts: string[] = []
    const bundleA = createRemoteBundle({
      identityId: 'remote-a',
      identityKey: 'identity-key-a',
      mlkemIdentityKey: 'mlkem-key-a',
      dilithiumKey: 'dilithium-key-a',
    })
    const bundleB = createRemoteBundle({
      identityId: 'remote-b',
      identityKey: 'identity-key-b',
      mlkemIdentityKey: 'mlkem-key-b',
      dilithiumKey: 'dilithium-key-b',
    })

    ;(client as any).bundleServer = {
      isAvailable: () => true,
      fetchOwnedSealedMessages: installOwnedSealedRelayFetch(client, [
        {
          id: 'relay-a-1',
          senderIdentityId: 'remote-a',
          recipientIdentityId: 'local-identity',
          encryptedData: { metadata: { messageId: 'inner-a-1' } },
          senderBundle: bundleA,
          status: 'pending',
          serverSequence: 61,
          createdAt: 1_717_171_717_000,
          expiresAt: 1_717_171_817_000,
        },
        {
          id: 'relay-a-2',
          senderIdentityId: 'remote-a',
          recipientIdentityId: 'local-identity',
          encryptedData: { metadata: { messageId: 'inner-a-2' } },
          senderBundle: bundleA,
          status: 'pending',
          serverSequence: 62,
          createdAt: 1_717_171_717_001,
          expiresAt: 1_717_171_817_000,
        },
        {
          id: 'relay-b-1',
          senderIdentityId: 'remote-b',
          recipientIdentityId: 'local-identity',
          encryptedData: { metadata: { messageId: 'inner-b-1' } },
          senderBundle: bundleB,
          status: 'pending',
          serverSequence: 63,
          createdAt: 1_717_171_717_002,
          expiresAt: 1_717_171_817_000,
        },
      ]),
      fetchBundle: vi.fn(async () => ({ bundle: null })),
      markDelivered: vi.fn(async () => undefined),
      fetchMessageStatuses: vi.fn(async () => []),
    }
    ;(client as any).receiveMessage = vi.fn(async (
      conversationId: string,
      encryptedData: { metadata?: { messageId?: string } },
      senderIdentityId: string,
    ) => {
      const messageId = encryptedData.metadata?.messageId ?? 'unknown'
      decryptStarts.push(messageId)
      if (messageId === 'inner-a-1') {
        await new Promise<void>((resolve) => {
          releaseFirstSender = resolve
        })
      }
      return {
        id: messageId,
        conversationId,
        senderId: senderIdentityId,
        content: messageId,
        timestamp: 1_717_171_717_000,
        signatureVerified: true,
        status: 'delivered',
      }
    })
    localChatStorage.getConversationByParticipants.mockImplementation(async (
      _localIdentityId: string,
      senderIdentityId: string,
    ) => ({
      id: `conversation-${senderIdentityId}`,
      expectedSequenceNumber: 0,
      unreadCount: 0,
    }))
    localChatStorage.getPublicKeyBundle.mockResolvedValue(null)
    localChatStorage.linkRelayMessage.mockResolvedValue(undefined)

    const resultPromise = client.fetchPendingMessages()
    await vi.waitFor(() => {
      expect(decryptStarts).toContain('inner-a-1')
    })
    expect(decryptStarts).not.toContain('inner-b-1')
    expect(decryptStarts).not.toContain('inner-a-2')

    releaseFirstSender?.()
    const result = await resultPromise

    expect(decryptStarts).toEqual([
      'inner-a-1',
      'inner-a-2',
      'inner-b-1',
    ])
    expect(result.messages.map((message: { id: string }) => message.id)).toEqual([
      'inner-a-1',
      'inner-a-2',
      'inner-b-1',
    ])
    expect(result.advanceSequence).toBe(63)
    expect(yieldToHost.mock.calls.length).toBeLessThan(3)
    expect(yieldToHost.mock.calls.every((call) => call[1]?.priority === 'realtime')).toBe(true)
  })

  it('does not yield after every sealed open or decrypt in a large catch-up batch', async () => {
    const { QuantumChat } = await import('./chat')
    const yieldToHost = vi.fn(async () => undefined)
    const client = new (QuantumChat as any)({
      cooperativeScheduler: { yieldToHost },
    })
    ;(client as any).identity = {
      id: 'local-identity',
      identityPublicKey: 'local-identity-key',
      mlkemPublicKey: 'local-mlkem-key',
      dilithiumPublicKey: 'local-dilithium-key',
      dilithiumPrivateKey: 'local-dilithium-private-key',
    }
    ;(client as any).privateBundle = {}
    ;(client as any).trackedIdentities.set('remote-a', {
      identityId: 'remote-a',
      currentIdentityKey: 'identity-key-a',
      currentDilithiumKey: 'dilithium-key-a',
      trustState: 'trusted',
    })
    const bundleA = createRemoteBundle({
      identityId: 'remote-a',
      identityKey: 'identity-key-a',
      mlkemIdentityKey: 'mlkem-key-a',
      dilithiumKey: 'dilithium-key-a',
    })
    const rows = Array.from({ length: 20 }, (_, index) => ({
      id: `relay-a-${index + 1}`,
      senderIdentityId: 'remote-a',
      recipientIdentityId: 'local-identity',
      encryptedData: { metadata: { messageId: `inner-a-${index + 1}` } },
      senderBundle: bundleA,
      status: 'pending',
      serverSequence: 200 + index,
      createdAt: 1_717_171_717_000 + index,
      expiresAt: 1_717_171_817_000,
    }))
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      fetchOwnedSealedMessages: installOwnedSealedRelayFetch(client, rows),
      fetchBundle: vi.fn(async () => ({ bundle: null })),
      markDelivered: vi.fn(async () => undefined),
      fetchMessageStatuses: vi.fn(async () => []),
    }
    ;(client as any).receiveMessage = vi.fn(async (
      conversationId: string,
      encryptedData: { metadata?: { messageId?: string } },
      senderIdentityId: string,
    ) => ({
      id: encryptedData.metadata?.messageId ?? 'unknown',
      conversationId,
      senderId: senderIdentityId,
      content: encryptedData.metadata?.messageId ?? '',
      timestamp: 1_717_171_717_000,
      signatureVerified: true,
      status: 'delivered',
    }))
    localChatStorage.getConversationByParticipants.mockResolvedValue({
      id: 'conversation-remote-a',
      expectedSequenceNumber: 0,
      unreadCount: 0,
    })
    localChatStorage.getPublicKeyBundle.mockResolvedValue(null)
    localChatStorage.linkRelayMessage.mockResolvedValue(undefined)

    const result = await client.fetchPendingMessages()

    expect(result.messages).toHaveLength(20)
    expect(result.advanceSequence).toBe(219)
    expect(yieldToHost.mock.calls.length).toBeLessThan(20)
    expect(yieldToHost.mock.calls.every((call) => call[1]?.priority === 'realtime')).toBe(true)
  })

  it('projects each decrypted relay message before later sealed opens start', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})
    ;(client as any).identity = {
      id: 'local-identity',
      identityPublicKey: 'local-identity-key',
      mlkemPublicKey: 'local-mlkem-key',
      dilithiumPublicKey: 'local-dilithium-key',
      dilithiumPrivateKey: 'local-dilithium-private-key',
    }
    ;(client as any).privateBundle = {}
    ;(client as any).trackedIdentities.set('remote-a', {
      identityId: 'remote-a',
      currentIdentityKey: 'identity-key-a',
      currentDilithiumKey: 'dilithium-key-a',
      trustState: 'trusted',
    })
    const bundleA = createRemoteBundle({
      identityId: 'remote-a',
      identityKey: 'identity-key-a',
      mlkemIdentityKey: 'mlkem-key-a',
      dilithiumKey: 'dilithium-key-a',
    })
    const projected: string[] = []
    const openedIds: string[] = []
    let projectedBeforeSecondDecrypt = false
    let projectedBeforeSecondOpen = false
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      fetchOwnedSealedMessages: installOwnedSealedRelayFetch(client, [
        {
          id: 'relay-a-2',
          senderIdentityId: 'remote-a',
          recipientIdentityId: 'local-identity',
          encryptedData: { metadata: { messageId: 'inner-a-2' } },
          senderBundle: bundleA,
          status: 'pending',
          serverSequence: 82,
          createdAt: 1_717_171_717_001,
          expiresAt: 1_717_171_817_000,
        },
        {
          id: 'relay-a-1',
          senderIdentityId: 'remote-a',
          recipientIdentityId: 'local-identity',
          encryptedData: { metadata: { messageId: 'inner-a-1' } },
          senderBundle: bundleA,
          status: 'pending',
          serverSequence: 81,
          createdAt: 1_717_171_717_000,
          expiresAt: 1_717_171_817_000,
        },
      ]),
      fetchBundle: vi.fn(async () => ({ bundle: null })),
      markDelivered: vi.fn(async () => undefined),
      fetchMessageStatuses: vi.fn(async () => []),
    }
    const openSealed = (client as any).openSealedRelayMessage as ReturnType<typeof vi.fn>
    openSealed.mockImplementation((sealed: { id: string }) => {
      openedIds.push(sealed.id)
      return sealed
    })
    ;(client as any).receiveMessage = vi.fn(async (
      conversationId: string,
      encryptedData: { metadata?: { messageId?: string } },
      senderIdentityId: string,
    ) => {
      const messageId = encryptedData.metadata?.messageId ?? 'unknown'
      if (messageId === 'inner-a-2') {
        projectedBeforeSecondDecrypt = projected.includes('inner-a-1')
      }
      return {
        id: messageId,
        conversationId,
        senderId: senderIdentityId,
        content: messageId,
        timestamp: 1_717_171_717_000,
        signatureVerified: true,
        status: 'delivered',
      }
    })
    localChatStorage.getConversationByParticipants.mockResolvedValue({
      id: 'conversation-remote-a',
      expectedSequenceNumber: 0,
      unreadCount: 0,
    })
    localChatStorage.getPublicKeyBundle.mockResolvedValue(null)
    localChatStorage.linkRelayMessage.mockResolvedValue(undefined)

    const result = await client.fetchPendingMessages(undefined, {
      onDecryptedMessage: (message: { id: string }) => {
        if (message.id === 'inner-a-1') {
          projectedBeforeSecondOpen = !openedIds.includes('relay-a-2')
        }
        projected.push(message.id)
      },
    })

    expect(projectedBeforeSecondOpen).toBe(true)
    expect(projectedBeforeSecondDecrypt).toBe(true)
    expect(openedIds).toEqual(['relay-a-1', 'relay-a-2'])
    expect(projected).toEqual(['inner-a-1', 'inner-a-2'])
    expect(result.messages.map((message: { id: string }) => message.id)).toEqual([
      'inner-a-1',
      'inner-a-2',
    ])
    expect(result.advanceSequence).toBe(82)
  })

  it('does not start established decrypts while an earlier X3DH bootstrap is active', async () => {
    const { QuantumChat } = await import('./chat')
    const yieldToHost = vi.fn(async () => undefined)
    const client = new (QuantumChat as any)({
      cooperativeScheduler: { yieldToHost },
    })
    ;(client as any).identity = {
      id: 'local-identity',
      identityPublicKey: 'local-identity-key',
      mlkemPublicKey: 'local-mlkem-key',
      dilithiumPublicKey: 'local-dilithium-key',
      dilithiumPrivateKey: 'local-dilithium-private-key',
    }
    ;(client as any).privateBundle = {}

    const bundleFor = (identityId: string) => createRemoteBundle({
      identityId,
      identityKey: `${identityId}-identity-key`,
      mlkemIdentityKey: `${identityId}-mlkem-key`,
      dilithiumKey: `${identityId}-dilithium-key`,
    })
    let releaseBootstrap: (() => void) | undefined
    const decryptStarts: string[] = []
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      fetchOwnedSealedMessages: installOwnedSealedRelayFetch(client, [
        {
          id: 'relay-bootstrap-a',
          senderIdentityId: 'bootstrap-a',
          recipientIdentityId: 'local-identity',
          encryptedData: { x3dhData: {}, metadata: { messageId: 'inner-bootstrap-a' } },
          senderBundle: bundleFor('bootstrap-a'),
          status: 'pending',
          serverSequence: 71,
          createdAt: 1_717_171_717_000,
          expiresAt: 1_717_171_817_000,
        },
        {
          id: 'relay-bootstrap-b',
          senderIdentityId: 'bootstrap-b',
          recipientIdentityId: 'local-identity',
          encryptedData: { x3dhData: {}, metadata: { messageId: 'inner-bootstrap-b' } },
          senderBundle: bundleFor('bootstrap-b'),
          status: 'pending',
          serverSequence: 72,
          createdAt: 1_717_171_717_001,
          expiresAt: 1_717_171_817_000,
        },
        {
          id: 'relay-established',
          senderIdentityId: 'established-c',
          recipientIdentityId: 'local-identity',
          encryptedData: { metadata: { messageId: 'inner-established-c' } },
          senderBundle: bundleFor('established-c'),
          status: 'pending',
          serverSequence: 73,
          createdAt: 1_717_171_717_002,
          expiresAt: 1_717_171_817_000,
        },
      ]),
      fetchBundle: vi.fn(async () => ({ bundle: null })),
      markDelivered: vi.fn(async () => undefined),
      fetchMessageStatuses: vi.fn(async () => []),
    }
    ;(client as any).receiveMessage = vi.fn(async (
      conversationId: string,
      encryptedData: { metadata?: { messageId?: string } },
      senderIdentityId: string,
    ) => {
      const messageId = encryptedData.metadata?.messageId ?? 'unknown'
      decryptStarts.push(messageId)
      if (messageId === 'inner-bootstrap-a') {
        await new Promise<void>((resolve) => {
          releaseBootstrap = resolve
        })
      }
      return {
        id: messageId,
        conversationId,
        senderId: senderIdentityId,
        content: messageId,
        timestamp: 1_717_171_717_000,
        signatureVerified: true,
        status: 'delivered',
      }
    })
    localChatStorage.getConversationByParticipants.mockImplementation(async (
      _localIdentityId: string,
      senderIdentityId: string,
    ) => ({
      id: `conversation-${senderIdentityId}`,
      expectedSequenceNumber: 0,
      unreadCount: 0,
    }))
    localChatStorage.getPublicKeyBundle.mockResolvedValue(null)
    localChatStorage.linkRelayMessage.mockResolvedValue(undefined)

    const resultPromise = client.fetchPendingMessages()
    await vi.waitFor(() => {
      expect(decryptStarts).toContain('inner-bootstrap-a')
    })
    expect(decryptStarts).not.toContain('inner-established-c')
    expect(decryptStarts).not.toContain('inner-bootstrap-b')

    releaseBootstrap?.()
    const result = await resultPromise

    expect(decryptStarts.indexOf('inner-bootstrap-a')).toBeLessThan(decryptStarts.indexOf('inner-bootstrap-b'))
    expect(result.messages.map((message: { id: string }) => message.id)).toEqual([
      'inner-bootstrap-a',
      'inner-bootstrap-b',
      'inner-established-c',
    ])
    expect(result.advanceSequence).toBe(73)
  })

  it('stores an authenticated sender bundle only after first-message decrypt', async () => {
    const { QuantumChat } = await import('./chat')
    const { storeContactBundle } = await import('./identity')
    const remoteBundle = createRemoteBundle()
    const client = new (QuantumChat as any)({})
    ;(client as any).identity = {
      id: 'local-identity',
      identityPublicKey: 'local-identity-key',
      mlkemPublicKey: 'local-mlkem-key',
      dilithiumPublicKey: 'local-dilithium-key',
      dilithiumPrivateKey: 'local-dilithium-private-key',
    }
    ;(client as any).privateBundle = {}
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      fetchOwnedSealedMessages: installOwnedSealedRelayFetch(client, [
        {
          id: 'relay-first',
          senderIdentityId: 'remote-identity',
          recipientIdentityId: 'local-identity',
          conversationId: 'conversation-1',
          messageKind: 'hidden_control',
          encryptedData: { metadata: { messageId: 'inner-first' } },
          senderBundle: remoteBundle,
          status: 'pending',
          serverSequence: 52,
          createdAt: 1_717_171_717_000,
          expiresAt: 1_717_171_817_000,
        },
      ]),
      fetchBundle: vi.fn(async () => ({ bundle: null })),
      markDelivered: vi.fn(async () => undefined),
      fetchMessageStatuses: vi.fn(async () => []),
    }
    ;(client as any).receiveMessage = vi.fn(async () => ({
      id: 'inner-first',
      conversationId: 'conversation-1',
      senderId: 'remote-identity',
      content: 'hello',
      timestamp: 1_717_171_717_000,
      signatureVerified: true,
      status: 'delivered',
    }))
    localChatStorage.getPublicKeyBundle
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
    localChatStorage.getConversationByParticipants.mockResolvedValue({
      id: 'conversation-1',
      expectedSequenceNumber: 0,
      unreadCount: 0,
    })
    localChatStorage.linkRelayMessage.mockResolvedValue(undefined)

    const result = await client.fetchPendingMessages()

    expect(result.messages).toHaveLength(1)
    expect(storeContactBundle).toHaveBeenCalledWith(remoteBundle)
    expect((client as any).receiveMessage).toHaveBeenCalledWith(
      'conversation-1',
      expect.objectContaining({ metadata: { messageId: 'inner-first' } }),
      'remote-identity',
      {
        emitReceivedEvent: false,
        messageKind: 'hidden_control',
        schedulingPriority: 'realtime',
        authenticatedSenderBundle: remoteBundle,
        relayMessageId: 'relay-first',
        serverSequence: 52,
      },
    )
    expect((client as any).receiveMessage.mock.invocationCallOrder[0]).toBeLessThan(
      (storeContactBundle as any).mock.invocationCallOrder[0],
    )
    expect(localChatStorage.storeTrackedIdentity).toHaveBeenCalledWith(expect.objectContaining({
      currentIdentityKey: 'identity-key',
      currentDilithiumKey: 'dilithium-key',
    }))
    expect((client as any).receiveMessage.mock.invocationCallOrder[0]).toBeLessThan(
      localChatStorage.storeTrackedIdentity.mock.invocationCallOrder[0],
    )
  })

  it('uses a verified relay bundle for initial decryption before tracking the sender', async () => {
    const { QuantumChat } = await import('./chat')
    const sessionModule = await import('./session')
    const remoteBundle = createRemoteBundle()
    const client = new (QuantumChat as any)({})
    const identity = {
      id: 'local-identity',
      identityPublicKey: 'local-identity-key',
      mlkemPublicKey: 'local-mlkem-key',
      dilithiumPublicKey: 'local-dilithium-key',
      dilithiumPrivateKey: 'local-dilithium-private-key',
    }
    const privateBundle = {}
    const encryptedData = {
      x3dhData: {
        initiatorIdentityKey: remoteBundle.identityKey,
        initiatorDilithiumKey: remoteBundle.dilithiumKey,
      },
      metadata: {
        messageId: 'first-relay-message',
        senderId: 'remote-identity',
        recipientId: 'local-identity',
        sessionId: 'first-relay-session',
        sequenceNumber: 0,
        timestamp: 1_717_171_717_000,
      },
    }
    ;(client as any).identity = identity
    ;(client as any).privateBundle = privateBundle
    ;(sessionModule.getActiveSessionByRemoteIdentity as any).mockResolvedValue(null)
    ;(sessionModule.establishSessionAndDecrypt as any).mockResolvedValue({
      session: { id: 'first-relay-session', baseKeyFingerprint: 'fingerprint' },
      privateBundle,
      decrypted: {
        id: 'first-relay-message',
        senderId: 'remote-identity',
        content: 'hello',
        timestamp: 1_717_171_717_000,
        sequenceNumber: 0,
      },
    })

    await (client as any).decryptIncomingPayload(
      'conversation-1',
      encryptedData,
      'remote-identity',
      remoteBundle,
    )

    expect(localChatStorage.getPublicKeyBundle).not.toHaveBeenCalledWith('remote-identity')
    expect(sessionModule.establishSessionAndDecrypt).toHaveBeenCalledWith(
      identity,
      privateBundle,
      encryptedData,
      'remote-identity',
      remoteBundle,
    )
  })

  it('reuses a verified sender bundle pin without repeated storage work', async () => {
    const { QuantumChat } = await import('./chat')
    const { storeContactBundle } = await import('./identity')
    const remoteBundle = createRemoteBundle()
    const client = new (QuantumChat as any)({})
    localChatStorage.getPublicKeyBundle.mockResolvedValue(remoteBundle)
    const relayedMessage = {
      id: 'relay-pinned',
      senderIdentityId: 'remote-identity',
      senderBundle: remoteBundle,
    }

    await (client as any).prepareSenderBundleForDecrypt(relayedMessage)
    await (client as any).prepareSenderBundleForDecrypt(relayedMessage)

    expect(localChatStorage.getPublicKeyBundle).toHaveBeenCalledTimes(1)
    expect(storeContactBundle).not.toHaveBeenCalled()
  })

  it('uses a local sender pin when the relay envelope omits the transport bundle', async () => {
    const { QuantumChat } = await import('./chat')
    const remoteBundle = createRemoteBundle()
    const fetchBundle = vi.fn()
    const client = new (QuantumChat as any)({})
    localChatStorage.getPublicKeyBundle.mockResolvedValue(remoteBundle)
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      fetchBundle,
    }

    const prepared = await (client as any).prepareSenderBundleForDecrypt({
      id: 'relay-omitted-bundle',
      senderIdentityId: 'remote-identity',
    })

    expect(prepared).toBe(remoteBundle)
    expect(fetchBundle).not.toHaveBeenCalled()
  })

  it('does not fetch a directory bundle when the envelope omits it and no pin exists', async () => {
    const { QuantumChat } = await import('./chat')
    const fetchBundle = vi.fn()
    const client = new (QuantumChat as any)({})
    localChatStorage.getPublicKeyBundle.mockResolvedValue(null)
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      fetchBundle,
    }

    const prepared = await (client as any).prepareSenderBundleForDecrypt({
      id: 'relay-unknown-sender',
      senderIdentityId: 'remote-identity',
    })

    expect(prepared).toBeNull()
    expect(fetchBundle).not.toHaveBeenCalled()
  })

  it('decrypts an omitted-bundle follow-up with a local pin and does not fetch the directory', async () => {
    const { QuantumChat } = await import('./chat')
    const remoteBundle = createRemoteBundle()
    const fetchBundle = vi.fn()
    const client = new (QuantumChat as any)({})
    ;(client as any).identity = {
      id: 'local-identity',
      identityPublicKey: 'local-identity-key',
      mlkemPublicKey: 'local-mlkem-key',
      dilithiumPublicKey: 'local-dilithium-key',
      dilithiumPrivateKey: 'local-dilithium-private-key',
    }
    ;(client as any).privateBundle = {}
    ;(client as any).trackedIdentities.set('remote-identity', {
      identityId: 'remote-identity',
      currentIdentityKey: remoteBundle.identityKey,
      currentDilithiumKey: remoteBundle.dilithiumKey,
      trustState: 'trusted',
    })
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      fetchOwnedSealedMessages: installOwnedSealedRelayFetch(client, [
        {
          id: 'relay-omitted-follow-up',
          senderIdentityId: 'remote-identity',
          recipientIdentityId: 'local-identity',
          conversationId: 'conversation-1',
          encryptedData: { metadata: { messageId: 'inner-omitted' } },
          status: 'pending',
          serverSequence: 88,
          createdAt: 1_717_171_717_000,
          expiresAt: 1_717_171_817_000,
        },
      ]),
      fetchBundle,
      markDelivered: vi.fn(async () => undefined),
      fetchMessageStatuses: vi.fn(async () => []),
    }
    ;(client as any).receiveMessage = vi.fn(async () => ({
      id: 'inner-omitted',
      conversationId: 'conversation-1',
      senderId: 'remote-identity',
      content: 'hello',
      timestamp: 1_717_171_717_000,
      signatureVerified: true,
      status: 'delivered',
    }))
    localChatStorage.getPublicKeyBundle.mockResolvedValue(remoteBundle)
    localChatStorage.getConversationByParticipants.mockResolvedValue({
      id: 'conversation-1',
      expectedSequenceNumber: 0,
      unreadCount: 0,
    })
    localChatStorage.linkRelayMessage.mockResolvedValue(undefined)

    const result = await client.fetchPendingMessages()

    expect(result.messages).toHaveLength(1)
    expect((client as any).receiveMessage).toHaveBeenCalledWith(
      'conversation-1',
      expect.objectContaining({ metadata: { messageId: 'inner-omitted' } }),
      'remote-identity',
      expect.objectContaining({
        authenticatedSenderBundle: remoteBundle,
        relayMessageId: 'relay-omitted-follow-up',
      }),
    )
    expect(fetchBundle).not.toHaveBeenCalled()
  })

  it('does not fetch the directory when an omitted-bundle follow-up has no local pin', async () => {
    const { QuantumChat } = await import('./chat')
    const fetchBundle = vi.fn()
    const client = new (QuantumChat as any)({})
    ;(client as any).identity = {
      id: 'local-identity',
      identityPublicKey: 'local-identity-key',
      mlkemPublicKey: 'local-mlkem-key',
      dilithiumPublicKey: 'local-dilithium-key',
    }
    ;(client as any).privateBundle = {}
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      fetchOwnedSealedMessages: installOwnedSealedRelayFetch(client, [
        {
          id: 'relay-omitted-unknown',
          senderIdentityId: 'remote-identity',
          recipientIdentityId: 'local-identity',
          conversationId: 'conversation-1',
          encryptedData: { metadata: { messageId: 'inner-unknown' } },
          status: 'pending',
          serverSequence: 89,
          createdAt: 1_717_171_717_000,
          expiresAt: 1_717_171_817_000,
        },
      ]),
      fetchBundle,
      fetchMessageStatuses: vi.fn(async () => []),
    }
    ;(client as any).receiveMessage = vi.fn()
    localChatStorage.getPublicKeyBundle.mockResolvedValue(null)
    localChatStorage.getConversationByParticipants.mockResolvedValue({
      id: 'conversation-1',
      expectedSequenceNumber: 0,
      unreadCount: 0,
    })

    const result = await client.fetchPendingMessages()

    expect(result.messages).toHaveLength(0)
    expect((client as any).receiveMessage).not.toHaveBeenCalled()
    expect(fetchBundle).not.toHaveBeenCalled()
  })

  it('creates an inbound conversation for a first message from an unknown sender', async () => {
    const { QuantumChat } = await import('./chat')
    const sessionModule = await import('./session')
    const { storeContactBundle } = await import('./identity')
    const remoteBundle = createRemoteBundle()
    const client = new (QuantumChat as any)({})
    ;(client as any).identity = {
      id: 'local-identity',
      identityPublicKey: 'local-identity-key',
      mlkemPublicKey: 'local-mlkem-key',
      dilithiumPublicKey: 'local-dilithium-key',
      dilithiumPrivateKey: 'local-dilithium-private-key',
    }
    ;(client as any).privateBundle = {}
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      fetchOwnedSealedMessages: installOwnedSealedRelayFetch(client, [
        {
          id: 'relay-first-unknown',
          senderIdentityId: 'remote-identity',
          recipientIdentityId: 'local-identity',
          conversationId: 'conversation-1',
          encryptedData: { metadata: { messageId: 'inner-first-unknown' } },
          senderBundle: remoteBundle,
          status: 'pending',
          serverSequence: 54,
          createdAt: 1_717_171_717_000,
          expiresAt: 1_717_171_817_000,
        },
      ]),
      fetchBundle: vi.fn(async () => ({ bundle: null })),
      markDelivered: vi.fn(async () => undefined),
      fetchMessageStatuses: vi.fn(async () => []),
    }
    const outboundSpy = vi.spyOn(client, 'getOrCreateConversation')
    ;(client as any).receiveMessage = vi.fn(async () => ({
      id: 'inner-first-unknown',
      conversationId: 'uuid',
      senderId: 'remote-identity',
      content: 'hello',
      timestamp: 1_717_171_717_000,
      signatureVerified: true,
      status: 'delivered',
    }))
    localChatStorage.getPublicKeyBundle
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
    localChatStorage.getConversationByParticipants.mockResolvedValue(null)
    localChatStorage.storeConversation.mockResolvedValue(undefined)
    localChatStorage.linkRelayMessage.mockResolvedValue(undefined)

    const result = await client.fetchPendingMessages()

    expect(result.messages).toHaveLength(1)
    expect(outboundSpy).not.toHaveBeenCalled()
    expect(sessionModule.establishSessionAsInitiator).not.toHaveBeenCalled()
    expect(storeContactBundle).toHaveBeenCalledWith(remoteBundle)
    expect(localChatStorage.storeConversation).toHaveBeenCalledWith(expect.objectContaining({
      localIdentityId: 'local-identity',
      remoteIdentityId: 'remote-identity',
      sessionRecordId: 'remote-identity',
      hasVisibleActivity: false,
    }))
    expect((client as any).receiveMessage).toHaveBeenCalledWith(
      'uuid',
      expect.objectContaining({ metadata: { messageId: 'inner-first-unknown' } }),
      'remote-identity',
      {
        emitReceivedEvent: false,
        schedulingPriority: 'realtime',
        authenticatedSenderBundle: remoteBundle,
        relayMessageId: 'relay-first-unknown',
        serverSequence: 54,
      },
    )
  })

  it('keeps outbound conversation creation blocked for unknown contacts', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})
    ;(client as any).identity = { id: 'local-identity' }
    ;(client as any).privateBundle = {}

    await expect(client.getOrCreateConversation('remote-identity')).rejects.toThrow('Contact has not been added yet')
    expect(localChatStorage.storeConversation).not.toHaveBeenCalled()
  })

  it('opens a valid local conversation without remote or session work', async () => {
    const { QuantumChat } = await import('./chat')
    const sessionModule = await import('./session')
    const fetchBundle = vi.fn()
    const client = new (QuantumChat as any)({})
    await primeExistingConversation(client, createRemoteBundle())
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      fetchBundle,
    }

    const handle = await client.tryOpenLocalConversation('remote-identity')

    expect(handle?.getId()).toBe('conversation-1')
    expect(fetchBundle).not.toHaveBeenCalled()
    expect(sessionModule.establishSessionAsInitiator).not.toHaveBeenCalled()
    expect(localChatStorage.storeConversation).not.toHaveBeenCalled()
  })

  it('does not allocate keys or create records when local session readiness is missing', async () => {
    const { QuantumChat } = await import('./chat')
    const sessionModule = await import('./session')
    const fetchBundle = vi.fn()
    const client = new (QuantumChat as any)({})
    await primeExistingConversation(client, createRemoteBundle())
    ;(sessionModule.getActiveSessionByRemoteIdentity as any).mockResolvedValue(null)
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      fetchBundle,
    }

    await expect(client.tryOpenLocalConversation('remote-identity')).resolves.toBeNull()
    expect(fetchBundle).not.toHaveBeenCalled()
    expect(sessionModule.establishSessionAsInitiator).not.toHaveBeenCalled()
    expect(localChatStorage.storeConversation).not.toHaveBeenCalled()
  })

  it('establishes from a pinned local bundle when remote transport is unavailable', async () => {
    const { QuantumChat } = await import('./chat')
    const sessionModule = await import('./session')
    const fetchBundle = vi.fn()
    const client = new (QuantumChat as any)({
      isRemoteTransportAvailable: () => false,
    })

    await primeExistingConversation(client, createRemoteBundle())
    ;(sessionModule.getActiveSessionByRemoteIdentity as any).mockResolvedValue(null)
    ;(sessionModule.establishSessionAsInitiator as any).mockResolvedValue({
      session: { id: 'offline-session' },
    })
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      fetchBundle,
    }

    const handle = await client.getOrCreateConversation('remote-identity')

    expect(handle.getId()).toBe('conversation-1')
    expect(fetchBundle).not.toHaveBeenCalled()
    expect(sessionModule.establishSessionAsInitiator).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'local-identity' }),
      expect.anything(),
      'remote-identity',
      expect.objectContaining({
        trackedIdentity: expect.objectContaining({ trustState: 'trusted' }),
      }),
    )
  })

  it('does not query an unknown contact bundle without an invitation capability', async () => {
    const { QuantumChat } = await import('./chat')
    const identityModule = await import('./identity')
    const fetchBundle = vi.fn()
    ;(identityModule.getPublicKeyBundle as any).mockResolvedValue(null)
    const client = new (QuantumChat as any)({})
    ;(client as any).identity = { id: 'local-identity' }
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      fetchBundle,
    }

    await expect(client.fetchContactBundleFromServer('unknown-identity')).resolves.toBeNull()
    expect(fetchBundle).not.toHaveBeenCalled()
  })

  it('claims a session OPK when looking up a contact without an invitation', async () => {
    const { QuantumChat } = await import('./chat')
    const identityModule = await import('./identity')
    const claimed = createRemoteBundle({ oneTimePreKeys: [{ id: 4 }] })
    const prepareSessionOpkClaim = vi.fn(async () => claimed)
    const fetchBundle = vi.fn()
    ;(identityModule.getPublicKeyBundle as any).mockResolvedValue(null)
    const client = new (QuantumChat as any)({ prepareSessionOpkClaim })
    ;(client as any).identity = { id: 'local-identity' }
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      fetchBundle,
    }

    await expect(client.fetchContactBundleFromServer('remote-identity')).resolves.toEqual(claimed)
    expect(prepareSessionOpkClaim).toHaveBeenCalledWith({
      identityId: 'remote-identity',
      signal: undefined,
    })
    expect(fetchBundle).not.toHaveBeenCalled()
  })

  it('does not claim a session OPK when redeeming an invitation capability', async () => {
    const { QuantumChat } = await import('./chat')
    const identityModule = await import('./identity')
    const invited = createRemoteBundle({ oneTimePreKeys: [{ id: 8 }] })
    const prepareSessionOpkClaim = vi.fn(async () => {
      throw new Error('session OPK must not run for invitation redemption')
    })
    ;(identityModule.getPublicKeyBundle as any).mockResolvedValue(null)
    const client = new (QuantumChat as any)({ prepareSessionOpkClaim })
    ;(client as any).identity = { id: 'local-identity' }
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      fetchBundle: vi.fn(async () => ({ bundle: invited, allocatedOPKId: 8 })),
    }

    await expect(
      client.fetchContactBundleFromServer('remote-identity', undefined, 'smbx1.test-capability'),
    ).resolves.toEqual(invited)
    expect(prepareSessionOpkClaim).not.toHaveBeenCalled()
  })

  it('retains an allocated one-time pre-key bundle when cancellation races the response', async () => {
    const { QuantumChat } = await import('./chat')
    const identityModule = await import('./identity')
    const controller = new AbortController()
    const remoteBundle = createRemoteBundle({
      oneTimePreKeys: [{ id: 9 }],
    })
    ;(identityModule.storeContactBundle as any)
      .mockRejectedValueOnce(new Error('transient storage failure'))
      .mockResolvedValueOnce(undefined)
    const client = new (QuantumChat as any)({})
    ;(client as any).identity = { id: 'local-identity' }
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      fetchBundle: vi.fn(async () => {
        controller.abort()
        return { bundle: remoteBundle, allocatedOPKId: 9 }
      }),
    }

    await expect(
      client.fetchContactBundleFromServer(
        'remote-identity',
        controller.signal,
        'smbx1.test-capability',
      ),
    ).resolves.toBeNull()
    expect(identityModule.storeContactBundle).toHaveBeenCalledTimes(2)
    expect(identityModule.storeContactBundle).toHaveBeenLastCalledWith(remoteBundle)
  })

  it('retries persistence for an in-memory identity verification lock', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})
    ;(client as any).trackedIdentities.set('remote-identity', {
      identityId: 'remote-identity',
      trustState: 'trusted',
      lastUpdatedAt: 1,
    })
    localChatStorage.storeTrackedIdentity
      .mockRejectedValueOnce(new Error('storage unavailable'))
      .mockResolvedValueOnce(undefined)

    await expect(
      client.requireContactIdentityVerification('remote-identity'),
    ).rejects.toThrow('storage unavailable')
    await expect(
      client.requireContactIdentityVerification('remote-identity'),
    ).resolves.toBeUndefined()

    expect(localChatStorage.storeTrackedIdentity).toHaveBeenCalledTimes(2)
    expect(localChatStorage.storeTrackedIdentity).toHaveBeenLastCalledWith(
      expect.objectContaining({ trustState: 'changed' }),
    )
  })

  it('does not archive an active session when replacement X3DH decrypt fails', async () => {
    const { QuantumChat } = await import('./chat')
    const sessionModule = await import('./session')
    const client = new (QuantumChat as any)({})

    ;(client as any).identity = { id: 'local-identity' }
    ;(client as any).privateBundle = {}
    localChatStorage.getPublicKeyBundle.mockResolvedValue(createRemoteBundle())

    ;(sessionModule.getActiveSessionByRemoteIdentity as any).mockResolvedValue({
      id: 'active-session',
      state: { receivedFirstMessage: true, receivingHeaderKey: 'header-key' },
      baseKeyFingerprint: 'active-fingerprint',
    })
    ;(sessionModule.decryptWithSessionFallback as any).mockRejectedValue(
      new Error('Failed to decrypt message header - no valid header key found'),
    )
    ;(sessionModule.establishSessionAndDecrypt as any).mockRejectedValue(
      new SessionError('Failed to decrypt message header - no valid header key found'),
    )

    await expect((client as any).decryptIncomingPayload(
      'conversation-1',
      {
        x3dhData: {
          initiatorIdentityKey: 'remote-identity-key',
          ephemeralKey: 'remote-ephemeral',
          mlkemCiphertext: 'ct',
          usedSignedPreKeyId: 1,
          initiatorDilithiumKey: 'remote-dilithium-key',
        },
        header: { sessionFingerprint: 'replacement-fingerprint' },
        metadata: {
          messageId: 'replacement-message',
          senderId: 'remote-identity',
          recipientId: 'local-identity',
          sessionId: 'replacement-session',
          sequenceNumber: 0,
          timestamp: 1_717_171_717_000,
        },
        ciphertext: 'cipher',
        nonce: 'nonce',
        tag: 'tag',
        signature: 'signature',
        version: 3,
      },
      'remote-identity',
    )).rejects.toThrow()

    expect(sessionModule.archiveSession).not.toHaveBeenCalled()
  })

  it('archives a superseded active session only after replacement X3DH decrypt succeeds', async () => {
    const { QuantumChat } = await import('./chat')
    const sessionModule = await import('./session')
    const client = new (QuantumChat as any)({})

    ;(client as any).identity = { id: 'local-identity' }
    ;(client as any).privateBundle = {}
    localChatStorage.getPublicKeyBundle.mockResolvedValue(createRemoteBundle())

    ;(sessionModule.getActiveSessionByRemoteIdentity as any).mockResolvedValue({
      id: 'active-session',
      state: { receivedFirstMessage: true, receivingHeaderKey: 'header-key' },
      baseKeyFingerprint: 'active-fingerprint',
    })
    ;(sessionModule.decryptWithSessionFallback as any).mockRejectedValue(
      new Error('Failed to decrypt message header - no valid header key found'),
    )
    ;(sessionModule.establishSessionAndDecrypt as any).mockResolvedValue({
      session: { id: 'replacement-session', baseKeyFingerprint: 'replacement-fingerprint' },
      privateBundle: { refreshed: true },
      decrypted: {
        id: 'replacement-message',
        senderId: 'remote-identity',
        content: 'hello',
        timestamp: 1_717_171_717_000,
        sequenceNumber: 0,
      },
    })

    const inbound = await (client as any).decryptIncomingPayload(
      'conversation-1',
      {
        x3dhData: {
          initiatorIdentityKey: 'remote-identity-key',
          ephemeralKey: 'remote-ephemeral',
          mlkemCiphertext: 'ct',
          usedSignedPreKeyId: 1,
          initiatorDilithiumKey: 'remote-dilithium-key',
        },
        header: { sessionFingerprint: 'replacement-fingerprint' },
        metadata: {
          messageId: 'replacement-message',
          senderId: 'remote-identity',
          recipientId: 'local-identity',
          sessionId: 'replacement-session',
          sequenceNumber: 0,
          timestamp: 1_717_171_717_000,
        },
        ciphertext: 'cipher',
        nonce: 'nonce',
        tag: 'tag',
        signature: 'signature',
        version: 3,
      },
      'remote-identity',
    )
    await inbound.afterCommit()

    expect(sessionModule.archiveSession).toHaveBeenCalledWith('active-session', 'superseded')
    expect(
      (sessionModule.establishSessionAndDecrypt as any).mock.invocationCallOrder[0],
    ).toBeLessThan((sessionModule.archiveSession as any).mock.invocationCallOrder[0])
  })

  it('does not track a sender from an attached bundle when first-message decrypt fails', async () => {
    const { QuantumChat } = await import('./chat')
    const { storeContactBundle } = await import('./identity')
    const remoteBundle = createRemoteBundle()
    const client = new (QuantumChat as any)({})
    ;(client as any).identity = {
      id: 'local-identity',
      identityPublicKey: 'local-identity-key',
      mlkemPublicKey: 'local-mlkem-key',
      dilithiumPublicKey: 'local-dilithium-key',
      dilithiumPrivateKey: 'local-dilithium-private-key',
    }
    ;(client as any).privateBundle = {}
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      fetchOwnedSealedMessages: installOwnedSealedRelayFetch(client, [
        {
          id: 'relay-fail',
          senderIdentityId: 'remote-identity',
          recipientIdentityId: 'local-identity',
          conversationId: 'conversation-1',
          encryptedData: { metadata: { messageId: 'inner-fail' } },
          senderBundle: remoteBundle,
          status: 'pending',
          serverSequence: 53,
          createdAt: 1_717_171_717_000,
          expiresAt: 1_717_171_817_000,
        },
      ]),
      fetchBundle: vi.fn(async () => ({ bundle: null })),
      markDelivered: vi.fn(async () => undefined),
      fetchMessageStatuses: vi.fn(async () => []),
    }
    ;(client as any).scheduleRelayDeletion = vi.fn()
    ;(client as any).receiveMessage = vi.fn(async () => {
      throw new Error('authentication tag mismatch')
    })
    client.requestMessageRetry = vi.fn(async () => ({ ok: true }))
    localChatStorage.getPublicKeyBundle.mockResolvedValueOnce(null)
    localChatStorage.getConversationByParticipants.mockResolvedValue({
      id: 'conversation-1',
      expectedSequenceNumber: 0,
      unreadCount: 0,
    })

    const result = await client.fetchPendingMessages()

    expect(result.messages).toHaveLength(0)
    expect(storeContactBundle).not.toHaveBeenCalled()
    expect(localChatStorage.storeTrackedIdentity).not.toHaveBeenCalled()
  })

  it('preserves scoped relay server sequences so status envelopes do not replay', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({
      getReceiptPolicy: () => ({
        deliveryReceiptsEnabled: false,
        readReceiptsEnabled: false,
      }),
    })
    ;(client as any).identity = {
      id: 'local-identity',
      identityPublicKey: 'local-identity-key',
      mlkemPublicKey: 'local-mlkem-key',
      dilithiumPublicKey: 'local-dilithium-key',
    }
    ;(client as any).privateBundle = {}
    const fetchOwnedSealedMessages = vi.fn(async (afterSequence?: number) => (
      afterSequence === 50
        ? [{
            id: 'scoped-status-relay',
            recipientMailboxToken: 'smbx2.scoped',
            deliveryClass: 'message',
            sealedEnvelope: { type: 'message' },
            status: 'pending',
            serverSequence: 51,
            createdAt: 1_717_171_717_000,
            expiresAt: 1_717_171_817_000,
          }]
        : []
    ))
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      fetchOwnedSealedMessages,
      fetchBundle: vi.fn(async () => ({ bundle: null })),
      fetchMessageStatuses: vi.fn(async () => []),
    }
    ;(client as any).openSealedRelayMessage = vi.fn((sealed: any) => ({
      id: sealed.id,
      senderIdentityId: 'remote-identity',
      recipientIdentityId: 'local-identity',
      conversationId: 'conversation-1',
      encryptedData: { metadata: { messageId: 'inner-status' } },
      status: 'pending',
      serverSequence: sealed.serverSequence,
      createdAt: sealed.createdAt,
      expiresAt: sealed.expiresAt,
    }))
    ;(client as any).receiveMessage = vi.fn(async (_conversationId: string, _encrypted: any, _sender: string) => ({
      id: 'inner-status',
      conversationId: 'conversation-1',
      senderId: 'remote-identity',
      content: JSON.stringify({ v: 2, type: 'screenshot_taken', takenAt: 1 }),
      timestamp: 1_717_171_717_000,
      signatureVerified: true,
      status: 'delivered',
    }))
    localChatStorage.getMailboxScopes.mockResolvedValue([{
      localIdentityId: 'local-identity',
      remoteIdentityId: 'remote-identity',
      scopeId: 'scope-safe',
      scopeSecret: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      epoch: 0,
      status: 'active',
      createdAt: 1,
      updatedAt: 1,
      registeredAt: 2,
      acknowledgedAt: 3,
    }] as any)
    localChatStorage.getConversationByParticipants.mockResolvedValue({
      id: 'conversation-1',
      expectedSequenceNumber: 0,
      unreadCount: 0,
    })
    localChatStorage.linkRelayMessage.mockResolvedValue(undefined)

    const result = await client.fetchPendingMessages(50)

    expect(result.messages).toHaveLength(1)
    expect(result.messages[0].serverSequence).toBe(51)
    expect(result.advanceSequence).toBe(51)
    expect(result.mailboxTokens).toEqual(['smbx2.scoped'])
    expect(result.mailboxSequences).toEqual(new Map([['smbx2.scoped', 51]]))
    expect(fetchOwnedSealedMessages).toHaveBeenCalledWith(50)
  })

  it('reports legacy mailbox tokens from owned inbox fetch', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})
    ;(client as any).identity = {
      id: 'local-identity',
      identityPublicKey: 'local-identity-key',
      mlkemPublicKey: 'local-mlkem-key',
      dilithiumPublicKey: 'local-dilithium-key',
    }
    ;(client as any).privateBundle = {}
    const fetchOwnedSealedMessages = vi.fn(async (afterSequence?: number) => (
      afterSequence === 50
        ? [{
            id: 'recovered-relay',
            recipientMailboxToken: 'smbx1.recovered',
            deliveryClass: 'message',
            sealedEnvelope: { type: 'message' },
            status: 'pending',
            serverSequence: 52,
            createdAt: 1_717_171_717_000,
            expiresAt: 1_717_171_817_000,
          }]
        : []
    ))
    const listRegisteredMailboxTokens = vi.fn(async () => ['smbx1.recovered'])
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      fetchOwnedSealedMessages,
      listRegisteredMailboxTokens,
      fetchBundle: vi.fn(async () => ({ bundle: null })),
      fetchMessageStatuses: vi.fn(async () => []),
    }
    ;(client as any).openSealedRelayMessage = vi.fn((sealed: any) => ({
      id: sealed.id,
      senderIdentityId: 'remote-identity',
      recipientIdentityId: 'local-identity',
      conversationId: 'conversation-1',
      encryptedData: { metadata: { messageId: 'inner-recovered' } },
      status: 'pending',
      serverSequence: sealed.serverSequence,
      createdAt: sealed.createdAt,
      expiresAt: sealed.expiresAt,
    }))
    ;(client as any).receiveMessage = vi.fn(async () => ({
      id: 'inner-recovered',
      conversationId: 'conversation-1',
      senderId: 'remote-identity',
      content: 'hello',
      timestamp: 1_717_171_717_000,
      signatureVerified: true,
      status: 'delivered',
    }))
    localChatStorage.getMailboxScopes.mockResolvedValue([])
    localChatStorage.getConversationByParticipants.mockResolvedValue({
      id: 'conversation-1',
      expectedSequenceNumber: 0,
      unreadCount: 0,
    })
    localChatStorage.linkRelayMessage.mockResolvedValue(undefined)

    const result = await client.fetchPendingMessages(50)

    expect(result.messages).toHaveLength(1)
    expect(result.messages[0].serverSequence).toBe(52)
    expect(result.mailboxTokens).toEqual(['smbx1.recovered'])
    expect(result.mailboxSequences).toEqual(new Map([['smbx1.recovered', 52]]))
    expect(fetchOwnedSealedMessages).toHaveBeenCalledWith(50)
    expect(listRegisteredMailboxTokens).not.toHaveBeenCalled()
  })

  it('skips sealed crypto for authenticated relay overlap rows', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})
    ;(client as any).identity = {
      id: 'local-identity',
      identityPublicKey: 'local-identity-key',
      mlkemPublicKey: 'local-mlkem-key',
      dilithiumPublicKey: 'local-dilithium-key',
    }
    ;(client as any).privateBundle = {}
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      fetchOwnedSealedMessages: installOwnedSealedRelayFetch(client, [{
        id: 'relay-overlap',
        status: 'pending',
        serverSequence: 50,
        createdAt: 1_717_171_717_000,
        expiresAt: 1_717_171_817_000,
      }]),
      fetchMessageStatuses: vi.fn(async () => []),
    }
    localChatStorage.getMessageByRelayId.mockResolvedValue({
      id: 'local-overlap',
      status: 'delivered',
      relayMessageId: 'relay-overlap',
      recipientIdentityId: 'local-identity',
    })
    const scheduleRelayDeletion = vi
      .spyOn(client as any, 'scheduleRelayDeletion')
      .mockImplementation(() => {})

    const result = await client.fetchPendingMessages(50, { fastPath: true })

    expect((client as any).openSealedRelayMessage).not.toHaveBeenCalled()
    expect(result.messages).toEqual([])
    expect(result.advanceSequence).toBe(50)
    expect(scheduleRelayDeletion).toHaveBeenCalledWith('relay-overlap', 0)
    expect(relayReceiptJobs.has('relay-overlap:delivered')).toBe(true)
  })

  it('skips sealed crypto for authenticated leftover rows on full resync', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})
    ;(client as any).identity = {
      id: 'local-identity',
      identityPublicKey: 'local-identity-key',
      mlkemPublicKey: 'local-mlkem-key',
      dilithiumPublicKey: 'local-dilithium-key',
    }
    ;(client as any).privateBundle = {}
    const leftoverRows = [
      {
        id: 'relay-leftover-a',
        status: 'delivered',
        serverSequence: 1459,
        createdAt: 1_717_171_717_000,
        expiresAt: 1_717_171_817_000,
      },
      {
        id: 'relay-leftover-b',
        status: 'delivered',
        serverSequence: 2014,
        createdAt: 1_717_171_717_000,
        expiresAt: 1_717_171_817_000,
      },
    ]
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      fetchOwnedSealedMessages: installOwnedSealedRelayFetch(client, leftoverRows),
      fetchMessageStatuses: vi.fn(async () => []),
    }
    localChatStorage.getMessageByRelayId.mockImplementation(async (relayMessageId: string) => ({
      id: `local-${relayMessageId}`,
      status: 'delivered',
      relayMessageId,
      recipientIdentityId: 'local-identity',
    }))
    const scheduleRelayDeletion = vi
      .spyOn(client as any, 'scheduleRelayDeletion')
      .mockImplementation(() => {})

    const result = await client.fetchPendingMessages(undefined, { fastPath: true })

    expect((client as any).openSealedRelayMessage).not.toHaveBeenCalled()
    expect(result.messages).toEqual([])
    expect(result.pendingCount).toBe(0)
    expect(result.advanceSequence).toBe(2014)
    expect(result.highestSeenSequence).toBe(2014)
    expect(scheduleRelayDeletion).toHaveBeenCalledWith('relay-leftover-a', 0)
    expect(scheduleRelayDeletion).toHaveBeenCalledWith('relay-leftover-b', 0)
    expect(relayReceiptJobs.has('relay-leftover-a:delivered')).toBe(true)
    expect(relayReceiptJobs.has('relay-leftover-b:delivered')).toBe(true)
  })

  it('decrypts new mail in a full resync batch that also has authenticated leftovers', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})
    ;(client as any).identity = {
      id: 'local-identity',
      identityPublicKey: 'local-identity-key',
      mlkemPublicKey: 'local-mlkem-key',
      dilithiumPublicKey: 'local-dilithium-key',
      dilithiumPrivateKey: 'local-dilithium-private-key',
    }
    ;(client as any).privateBundle = {}
    ;(client as any).trackedIdentities.set('remote-a', {
      identityId: 'remote-a',
      currentIdentityKey: 'identity-key-a',
      currentDilithiumKey: 'dilithium-key-a',
      trustState: 'trusted',
    })
    const bundleA = createRemoteBundle({
      identityId: 'remote-a',
      identityKey: 'identity-key-a',
      mlkemIdentityKey: 'mlkem-key-a',
      dilithiumKey: 'dilithium-key-a',
    })
    const leftover = {
      id: 'relay-leftover',
      status: 'delivered',
      serverSequence: 1459,
      createdAt: 1_717_171_717_000,
      expiresAt: 1_717_171_817_000,
    }
    const fresh = {
      id: 'relay-new',
      senderIdentityId: 'remote-a',
      recipientIdentityId: 'local-identity',
      encryptedData: { metadata: { messageId: 'inner-new' } },
      senderBundle: bundleA,
      status: 'pending',
      serverSequence: 2015,
      createdAt: 1_717_171_717_000,
      expiresAt: 1_717_171_817_000,
    }
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      fetchOwnedSealedMessages: installOwnedSealedRelayFetch(client, [leftover, fresh]),
      fetchBundle: vi.fn(async () => ({ bundle: null })),
      fetchMessageStatuses: vi.fn(async () => []),
    }
    localChatStorage.getMessageByRelayId.mockImplementation(async (relayMessageId: string) => {
      if (relayMessageId !== leftover.id) return null
      return {
        id: 'local-leftover',
        status: 'delivered',
        relayMessageId: leftover.id,
        recipientIdentityId: 'local-identity',
      }
    })
    localChatStorage.getConversationByParticipants.mockResolvedValue({
      id: 'conversation-remote-a',
      expectedSequenceNumber: 0,
      unreadCount: 0,
    })
    localChatStorage.getPublicKeyBundle.mockResolvedValue(null)
    localChatStorage.linkRelayMessage.mockResolvedValue(undefined)
    ;(client as any).receiveMessage = vi.fn(async () => ({
      id: 'inner-new',
      conversationId: 'conversation-remote-a',
      senderId: 'remote-a',
      content: 'inner-new',
      timestamp: 1_717_171_717_000,
      signatureVerified: true,
      status: 'delivered',
    }))
    const scheduleRelayDeletion = vi
      .spyOn(client as any, 'scheduleRelayDeletion')
      .mockImplementation(() => {})

    const result = await client.fetchPendingMessages(undefined, { fastPath: true })

    expect((client as any).openSealedRelayMessage).toHaveBeenCalledTimes(1)
    expect((client as any).openSealedRelayMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'relay-new', serverSequence: 2015 }),
    )
    expect(result.messages).toHaveLength(1)
    expect(result.messages[0].id).toBe('inner-new')
    expect(scheduleRelayDeletion).toHaveBeenCalledWith('relay-leftover', 0)
    expect(scheduleRelayDeletion).not.toHaveBeenCalledWith('relay-new', 0)
  })

  it('runs sealed crypto when a full-resync leftover link cannot be authenticated', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})
    ;(client as any).identity = {
      id: 'local-identity',
      identityPublicKey: 'local-identity-key',
      mlkemPublicKey: 'local-mlkem-key',
      dilithiumPublicKey: 'local-dilithium-key',
    }
    ;(client as any).privateBundle = {}
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      fetchOwnedSealedMessages: installOwnedSealedRelayFetch(client, [{
        id: 'relay-untrusted-leftover',
        status: 'delivered',
        serverSequence: 1459,
        createdAt: 1_717_171_717_000,
        expiresAt: 1_717_171_817_000,
        encryptedData: { metadata: { messageId: 'inner-untrusted-leftover' } },
      }]),
      fetchBundle: vi.fn(async () => ({ bundle: null })),
      fetchMessageStatuses: vi.fn(async () => []),
    }
    localChatStorage.getMessageByRelayId.mockRejectedValueOnce(new Error('authentication failed'))

    await client.fetchPendingMessages(undefined, { fastPath: true })

    expect((client as any).openSealedRelayMessage).toHaveBeenCalledTimes(1)
  })

  it('does not skip sealed crypto when a leftover is linked to another identity', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})
    ;(client as any).identity = {
      id: 'local-identity',
      identityPublicKey: 'local-identity-key',
      mlkemPublicKey: 'local-mlkem-key',
      dilithiumPublicKey: 'local-dilithium-key',
    }
    ;(client as any).privateBundle = {}
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      fetchOwnedSealedMessages: installOwnedSealedRelayFetch(client, [{
        id: 'relay-foreign-identity',
        status: 'delivered',
        serverSequence: 1459,
        createdAt: 1_717_171_717_000,
        expiresAt: 1_717_171_817_000,
        encryptedData: { metadata: { messageId: 'inner-foreign-identity' } },
      }]),
      fetchBundle: vi.fn(async () => ({ bundle: null })),
      fetchMessageStatuses: vi.fn(async () => []),
    }
    localChatStorage.getMessageByRelayId.mockResolvedValue({
      id: 'local-foreign',
      status: 'delivered',
      relayMessageId: 'relay-foreign-identity',
      recipientIdentityId: 'other-identity',
    })

    await client.fetchPendingMessages(undefined, { fastPath: true })

    expect((client as any).openSealedRelayMessage).toHaveBeenCalledTimes(1)
  })

  it('skips sealed crypto on full resync after the local copy is gone', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})
    ;(client as any).identity = {
      id: 'local-identity',
      identityPublicKey: 'local-identity-key',
      mlkemPublicKey: 'local-mlkem-key',
      dilithiumPublicKey: 'local-dilithium-key',
    }
    ;(client as any).privateBundle = {}
    const leftover = {
      id: 'relay-cleared-local',
      status: 'delivered',
      serverSequence: 1459,
      createdAt: 1_717_171_717_000,
      expiresAt: 1_717_171_817_000,
    }
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      fetchOwnedSealedMessages: installOwnedSealedRelayFetch(client, [leftover]),
      fetchMessageStatuses: vi.fn(async () => []),
    }
    localChatStorage.getMessageByRelayId.mockResolvedValue({
      id: 'local-cleared',
      status: 'delivered',
      relayMessageId: leftover.id,
      recipientIdentityId: 'local-identity',
    })
    vi.spyOn(client as any, 'scheduleRelayDeletion').mockImplementation(() => {})

    await client.fetchPendingMessages(undefined, { fastPath: true })
    expect((client as any).openSealedRelayMessage).not.toHaveBeenCalled()
    expect(localChatStorage.storeProcessedMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: 'relay:local-identity:relay-cleared-local',
        sessionId: 'local-identity',
        messageHash: leftover.id,
      }),
    )

    localChatStorage.getMessageByRelayId.mockResolvedValue(null)
    localChatStorage.isMessageProcessed.mockImplementation(async (messageId: string) => (
      messageId === 'relay:local-identity:relay-cleared-local'
    ))
    ;(client as any).openSealedRelayMessage.mockClear()

    const result = await client.fetchPendingMessages(undefined, { fastPath: true })

    expect((client as any).openSealedRelayMessage).not.toHaveBeenCalled()
    expect(result.messages).toEqual([])
    expect(result.advanceSequence).toBe(1459)
  })

  it('runs sealed crypto when an overlap link cannot be authenticated', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})
    ;(client as any).identity = {
      id: 'local-identity',
      identityPublicKey: 'local-identity-key',
      mlkemPublicKey: 'local-mlkem-key',
      dilithiumPublicKey: 'local-dilithium-key',
    }
    ;(client as any).privateBundle = {}
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      fetchOwnedSealedMessages: installOwnedSealedRelayFetch(client, [{
        id: 'relay-untrusted-overlap',
        status: 'pending',
        serverSequence: 50,
        createdAt: 1_717_171_717_000,
        expiresAt: 1_717_171_817_000,
        encryptedData: { metadata: { messageId: 'inner-untrusted-overlap' } },
      }]),
      fetchBundle: vi.fn(async () => ({ bundle: null })),
      fetchMessageStatuses: vi.fn(async () => []),
    }
    localChatStorage.getMessageByRelayId.mockRejectedValueOnce(new Error('authentication failed'))

    await client.fetchPendingMessages(50, { fastPath: true })

    expect((client as any).openSealedRelayMessage).toHaveBeenCalledTimes(1)
  })
})

describe('QuantumChat mailbox vacuum', () => {
  it('vacuums read rows at the cursor after decrypt, not before the first bubble', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})
    ;(client as any).identity = {
      id: 'local-identity',
      identityPublicKey: 'local-identity-key',
      mlkemPublicKey: 'local-mlkem-key',
      dilithiumPublicKey: 'local-dilithium-key',
      dilithiumPrivateKey: 'local-dilithium-private-key',
    }
    ;(client as any).privateBundle = {}
    ;(client as any).trackedIdentities.set('remote-a', {
      identityId: 'remote-a',
      currentIdentityKey: 'identity-key-a',
      currentDilithiumKey: 'dilithium-key-a',
      trustState: 'trusted',
    })
    const bundleA = createRemoteBundle({
      identityId: 'remote-a',
      identityKey: 'identity-key-a',
      mlkemIdentityKey: 'mlkem-key-a',
      dilithiumKey: 'dilithium-key-a',
    })
    const order: string[] = []
    const fetchOwnedSealedMessages = vi.fn(async () => {
      order.push('fetch')
      return [{
        id: 'relay-new',
        recipientMailboxToken: 'mailbox-token',
        deliveryClass: 'message',
        sealedEnvelope: { type: 'message' },
        senderIdentityId: 'remote-a',
        recipientIdentityId: 'local-identity',
        encryptedData: { metadata: { messageId: 'inner-new' } },
        senderBundle: bundleA,
        status: 'pending',
        serverSequence: 2250,
        createdAt: 1_717_171_717_000,
        expiresAt: 1_717_171_817_000,
      }]
    })
    const vacuumOwnedSealedMessages = vi.fn(async () => {
      order.push('vacuum')
      return 20
    })
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      fetchOwnedSealedMessages,
      vacuumOwnedSealedMessages,
      fetchBundle: vi.fn(async () => ({ bundle: null })),
      fetchMessageStatuses: vi.fn(async () => []),
    }
    ;(client as any).openSealedRelayMessage = vi.fn((sealed: any) => sealed)
    ;(client as any).receiveMessage = vi.fn(async () => {
      order.push('decrypt')
      return {
        id: 'inner-new',
        conversationId: 'conversation-remote-a',
        senderId: 'remote-a',
        content: 'inner-new',
        timestamp: 1_717_171_717_000,
        signatureVerified: true,
        status: 'delivered',
      }
    })
    localChatStorage.getConversationByParticipants.mockResolvedValue({
      id: 'conversation-remote-a',
      expectedSequenceNumber: 0,
      unreadCount: 0,
    })
    localChatStorage.getPublicKeyBundle.mockResolvedValue(null)
    localChatStorage.linkRelayMessage.mockResolvedValue(undefined)
    localChatStorage.getMessageByRelayId.mockResolvedValue(null)

    const result = await client.fetchPendingMessages(2247, { fastPath: true })
    await Promise.resolve()
    await Promise.resolve()

    expect(order).toEqual(['fetch', 'decrypt', 'vacuum'])
    expect(result.messages).toHaveLength(1)
    expect(result.advanceSequence).toBe(2250)
    expect(vacuumOwnedSealedMessages).toHaveBeenCalledWith(2250, ['read'])
    expect(vacuumOwnedSealedMessages).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining(['pending']),
    )
  })

  it('does not throw when the backend has no mailbox vacuum method', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})
    ;(client as any).identity = {
      id: 'local-identity',
      identityPublicKey: 'local-identity-key',
      mlkemPublicKey: 'local-mlkem-key',
      dilithiumPublicKey: 'local-dilithium-key',
    }
    ;(client as any).privateBundle = {}
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      fetchOwnedSealedMessages: vi.fn(async () => []),
      fetchMessageStatuses: vi.fn(async () => []),
    }

    await expect(client.fetchPendingMessages(50, { fastPath: true })).resolves.toMatchObject({
      advanceSequence: 50,
      messages: [],
    })
  })

  it('decrypts prefetched sealed rows without a relay HTTP GET', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})
    ;(client as any).identity = {
      id: 'local-identity',
      identityPublicKey: 'local-identity-key',
      mlkemPublicKey: 'local-mlkem-key',
      dilithiumPublicKey: 'local-dilithium-key',
    }
    ;(client as any).privateBundle = {}
    const fetchOwnedSealedMessages = vi.fn(async () => {
      throw new Error('relay HTTP should not run')
    })
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      fetchOwnedSealedMessages,
    }
    const processInbound = vi.spyOn(client as any, 'processInboundSealedRelayRows')
      .mockResolvedValue(undefined)

    const prefetchedRows = [{
      id: 'msg_prefetchedrow0001',
      recipientMailboxToken: 'smbx1.mailbox-token-value',
      deliveryClass: 'message',
      sealedEnvelope: { version: 1, type: 'relay', ciphertext: 'aa' },
      status: 'pending',
      serverSequence: 51,
      createdAt: Date.now(),
      expiresAt: Date.now() + 60_000,
    }]

    await expect(client.fetchPendingMessages(50, {
      skipRelayHttp: true,
      prefetchedRows,
      fastPath: true,
    })).resolves.toMatchObject({
      advanceSequence: 50,
    })
    expect(fetchOwnedSealedMessages).not.toHaveBeenCalled()
    expect(processInbound).toHaveBeenCalledTimes(1)
  })

  it('vacuums delivered rows when read receipts are off', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({
      getReceiptPolicy: () => ({
        deliveryReceiptsEnabled: false,
        readReceiptsEnabled: false,
      }),
    })
    ;(client as any).identity = {
      id: 'local-identity',
      identityPublicKey: 'local-identity-key',
      mlkemPublicKey: 'local-mlkem-key',
      dilithiumPublicKey: 'local-dilithium-key',
    }
    ;(client as any).privateBundle = {}
    const vacuumOwnedSealedMessages = vi.fn(async () => 20)
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      fetchOwnedSealedMessages: vi.fn(async () => []),
      vacuumOwnedSealedMessages,
      fetchMessageStatuses: vi.fn(async () => []),
    }

    await client.fetchPendingMessages(2014, { fastPath: true })
    await Promise.resolve()

    expect(vacuumOwnedSealedMessages).toHaveBeenCalledWith(2014, ['delivered', 'read'])
  })

  it('debounces mailbox vacuum at the same cursor', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})
    ;(client as any).identity = {
      id: 'local-identity',
      identityPublicKey: 'local-identity-key',
      mlkemPublicKey: 'local-mlkem-key',
      dilithiumPublicKey: 'local-dilithium-key',
    }
    ;(client as any).privateBundle = {}
    const vacuumOwnedSealedMessages = vi.fn(async () => 0)
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      fetchOwnedSealedMessages: vi.fn(async () => []),
      vacuumOwnedSealedMessages,
      fetchMessageStatuses: vi.fn(async () => []),
    }

    await client.fetchPendingMessages(2272, { fastPath: true })
    await Promise.resolve()
    await client.fetchPendingMessages(2272, { fastPath: true })
    await Promise.resolve()

    expect(vacuumOwnedSealedMessages).toHaveBeenCalledTimes(1)
    expect(vacuumOwnedSealedMessages).toHaveBeenCalledWith(2272, ['read'])
  })

  it('skips empty-mailbox vacuum while Tor is enabled', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({
      isTorEnabled: () => true,
    })
    ;(client as any).identity = {
      id: 'local-identity',
      identityPublicKey: 'local-identity-key',
      mlkemPublicKey: 'local-mlkem-key',
      dilithiumPublicKey: 'local-dilithium-key',
    }
    ;(client as any).privateBundle = {}
    const vacuumOwnedSealedMessages = vi.fn(async () => 0)
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      fetchOwnedSealedMessages: vi.fn(async () => []),
      vacuumOwnedSealedMessages,
      fetchMessageStatuses: vi.fn(async () => []),
    }

    await client.fetchPendingMessages(2272, { fastPath: true })
    await Promise.resolve()

    expect(vacuumOwnedSealedMessages).not.toHaveBeenCalled()
  })
})

describe('QuantumChat relay status handling', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    processedControlMessages.clear()
    retryRequestState.records.clear()
    retryRequestState.byRelay.clear()
    relayReceiptJobs.clear()
    mockNow.mockReset()
    mockNow.mockReturnValue(1_717_171_717_000)
    getX3DHBootstrapFailureDetails.mockReturnValue(null)
    localChatStorage.getMessagesNeedingStatusSync.mockResolvedValue([])
    localChatStorage.linkRelayMessage.mockResolvedValue(undefined)
    localChatStorage.getConversation.mockResolvedValue({
      id: 'conversation-1',
      expectedSequenceNumber: 0,
      unreadCount: 0,
    })
    localChatStorage.updateConversation.mockResolvedValue(undefined)
    localChatStorage.storeMessage.mockResolvedValue(undefined)
    localChatStorage.storeDecryptedMessage.mockResolvedValue(undefined)
    localChatStorage.getDecryptedMessage.mockResolvedValue(null)
    localChatStorage.getMessage.mockResolvedValue(null)
    localChatStorage.getMessageByRelayId.mockResolvedValue(null)
    localChatStorage.isMessageProcessed.mockResolvedValue(false)
    localChatStorage.getMailboxScopes.mockResolvedValue([])
    localChatStorage.getPublicKeyBundle.mockResolvedValue(createRemoteBundle())
  })

  it('updates local status from relay delivery updates', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})

    const deliveredListener = vi.fn()
    client.on('message:delivered', deliveredListener)

    localChatStorage.getMessageByRelayId.mockResolvedValue({
      id: 'local-message-1',
      status: 'sent',
    })
    localChatStorage.updateMessageStatus.mockResolvedValue(undefined)

    await client.syncRelayedMessageStatus('relay-1', 'delivered')

    expect(localChatStorage.updateMessageStatus).toHaveBeenCalledWith('local-message-1', 'delivered')
    expect(deliveredListener).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'message:delivered',
        data: expect.objectContaining({ messageId: 'local-message-1', relayMessageId: 'relay-1' }),
      }),
    )
  })

  it('does not link relay status without a stored relay mapping', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})

    const readListener = vi.fn()
    client.on('message:read', readListener)

    localChatStorage.getMessageByRelayId.mockResolvedValue(null)
    localChatStorage.updateMessageStatus.mockResolvedValue(undefined)

    await client.syncRelayedMessageStatus('relay-2', 'read')

    expect(localChatStorage.getMessage).not.toHaveBeenCalled()
    expect(localChatStorage.linkRelayMessage).not.toHaveBeenCalled()
    expect(localChatStorage.updateMessageStatus).not.toHaveBeenCalled()
    expect(readListener).not.toHaveBeenCalled()
  })

  it('persists one relay delivery token before network submission', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})
    const deliveryToken = `sdv1.${'A'.repeat(43)}=`
    const record = {
      recipientMailboxToken: 'smbx1.recipient',
      deliveryToken,
      deliveryClass: 'message' as const,
      sealedEnvelope: {
        version: 1,
        type: 'message' as const,
        senderEphemeralKey: 'ephemeral',
        mlkemCiphertext: 'kem',
        ciphertext: 'ciphertext',
        nonce: 'nonce',
        tag: 'tag',
      },
    }
    localChatStorage.getMessage.mockResolvedValue({
      id: 'local-message-staged',
      conversationId: 'conversation-1',
      status: 'sent',
    })
    localChatStorage.storeMessage.mockResolvedValue(undefined)

    await expect(client.stageLocalMessageRelayDelivery('local-message-staged', record))
      .resolves.toEqual(record)

    expect(localChatStorage.storeMessage).toHaveBeenCalledWith(expect.objectContaining({
      id: 'local-message-staged',
      relayDeliveryToken: deliveryToken,
      relayDeliveryOutbox: expect.objectContaining({
        record,
        attemptCount: 1,
      }),
    }))
  })

  it('clears the sealed outbox only after linking the relay response', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})
    localChatStorage.linkRelayMessage.mockResolvedValue({
      id: 'local-message-linked',
      status: 'sent',
      relayMessageId: 'relay-linked',
      relayDeliveryToken: `sdv1.${'A'.repeat(43)}=`,
    })

    await client.linkLocalMessageToRelay(
      'local-message-linked',
      'relay-linked',
      `sdv1.${'A'.repeat(43)}=`,
    )

    expect(localChatStorage.linkRelayMessage).toHaveBeenCalledOnce()
    expect(localChatStorage.getMessage).not.toHaveBeenCalled()
    expect(localChatStorage.storeMessage).not.toHaveBeenCalled()
  })

  it('syncs a relay read receipt when a locally read message is linked late', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})
    const markRead = vi.fn(async () => {})
    ;(client as any).identity = { id: 'local-identity' }
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      markRead,
    }

    localChatStorage.linkRelayMessage.mockResolvedValue({
      id: 'local-message-read',
      status: 'read',
      relayReadReceiptEligible: true,
      relayMessageId: 'relay-read-late',
    })

    await client.linkLocalMessageToRelay('local-message-read', 'relay-read-late')

    expect(localChatStorage.linkRelayMessage).toHaveBeenCalledWith('local-message-read', 'relay-read-late', undefined)
    await vi.waitFor(() => {
      expect(relayReceiptJobs.has('relay-read-late:read')).toBe(true)
    })
    await client.flushRelayReceiptJobs()
    expect(markRead).toHaveBeenCalledWith('relay-read-late')
  })

  it('does not disclose a legacy read when its relay mapping arrives late', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})
    const markRead = vi.fn(async () => {})
    ;(client as any).identity = { id: 'local-identity' }
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      markRead,
    }
    localChatStorage.linkRelayMessage.mockResolvedValue(undefined)
    localChatStorage.getMessage.mockResolvedValue({
      id: 'local-message-private',
      status: 'read',
    })

    await client.linkLocalMessageToRelay('local-message-private', 'relay-private-late')
    await Promise.resolve()

    expect(markRead).not.toHaveBeenCalled()
  })

  it('applies remote read updates even when local read receipts are disabled', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({
      getReceiptPolicy: () => ({
        deliveryReceiptsEnabled: true,
        readReceiptsEnabled: false,
      }),
    })

    const deliveredListener = vi.fn()
    const readListener = vi.fn()
    client.on('message:delivered', deliveredListener)
    client.on('message:read', readListener)

    localChatStorage.getMessageByRelayId.mockResolvedValue({
      id: 'local-message-3',
      status: 'sent',
    })
    localChatStorage.updateMessageStatus.mockResolvedValue(undefined)

    await client.syncRelayedMessageStatus('relay-3', 'read')

    expect(localChatStorage.updateMessageStatus).toHaveBeenCalledWith('local-message-3', 'read')
    expect(readListener).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'message:read',
        data: expect.objectContaining({ messageId: 'local-message-3', relayMessageId: 'relay-3' }),
      }),
    )
    expect(deliveredListener).not.toHaveBeenCalled()
  })

  it('re-emits persisted receipt state to repair a stale sender projection', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})
    const readListener = vi.fn()
    client.on('message:read', readListener)
    localChatStorage.getMessageByRelayId.mockResolvedValue({
      id: 'local-message-reconcile',
      status: 'read',
    })

    await client.syncRelayedMessageStatus('relay-reconcile', 'delivered')

    expect(localChatStorage.updateMessageStatus).not.toHaveBeenCalled()
    expect(readListener).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'message:read',
        data: expect.objectContaining({
          messageId: 'local-message-reconcile',
          relayMessageId: 'relay-reconcile',
        }),
      }),
    )
  })

  it('applies remote delivery updates even when local delivery receipts are disabled', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({
      getReceiptPolicy: () => ({
        deliveryReceiptsEnabled: false,
        readReceiptsEnabled: false,
      }),
    })

    localChatStorage.getMessageByRelayId.mockResolvedValue({
      id: 'local-message-4',
      status: 'sent',
    })

    await client.syncRelayedMessageStatus('relay-4', 'delivered')

    expect(localChatStorage.updateMessageStatus).toHaveBeenCalledWith('local-message-4', 'delivered')
  })

  it('preserves relay rows for read follow-ups when delivery receipts are disabled', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({
      getReceiptPolicy: () => ({
        deliveryReceiptsEnabled: false,
        readReceiptsEnabled: true,
      }),
    })
    const markDelivered = vi.fn(async () => {})
    ;(client as any).scheduleRelayDeletion = vi.fn()

    ;(client as any).bundleServer = { markDelivered }

    ;(client as any).queueRelayedMessageFollowUps(
      { id: 'relay-5' },
      { id: 'local-message-5' },
    )

    expect(markDelivered).not.toHaveBeenCalled()
    expect((client as any).scheduleRelayDeletion).not.toHaveBeenCalled()
  })

  it('retains relays when all receipts are disabled', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({
      getReceiptPolicy: () => ({
        deliveryReceiptsEnabled: false,
        readReceiptsEnabled: false,
      }),
    })
    const markDelivered = vi.fn(async () => {})
    ;(client as any).scheduleRelayDeletion = vi.fn()

    ;(client as any).bundleServer = { markDelivered }

    ;(client as any).queueRelayedMessageFollowUps(
      { id: 'relay-5' },
      { id: 'local-message-5' },
    )

    expect(markDelivered).not.toHaveBeenCalled()
    expect((client as any).scheduleRelayDeletion).not.toHaveBeenCalled()
  })

  it('skips relay read updates when read receipts are disabled', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({
      getReceiptPolicy: () => ({
        deliveryReceiptsEnabled: true,
        readReceiptsEnabled: false,
      }),
    })
    const markRead = vi.fn(async () => {})

    ;(client as any).identity = { id: 'local-identity' }
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      markRead,
    }

    await expect(client.markRelayMessageRead('relay-6')).resolves.toBe(false)
    expect(markRead).not.toHaveBeenCalled()
  })

  it('persists read receipts until the relay server is available', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})
    const markRead = vi.fn(async () => {})
    ;(client as any).scheduleRelayDeletion = vi.fn()

    ;(client as any).identity = { id: 'local-identity' }

    await expect(client.markRelayMessageRead('relay-pending-read')).resolves.toBe(true)
    expect(markRead).not.toHaveBeenCalled()
    expect(relayReceiptJobs.get('relay-pending-read:read')).toEqual(
      expect.objectContaining({
        relayMessageId: 'relay-pending-read',
        status: 'read',
      }),
    )

    ;(client as any).bundleServer = {
      isAvailable: () => true,
      markRead,
      markDelivered: vi.fn(async () => {}),
    }

    await client.flushRelayReceiptJobs()

    expect(markRead).toHaveBeenCalledWith('relay-pending-read')
    expect((client as any).scheduleRelayDeletion).not.toHaveBeenCalled()
    expect(relayReceiptJobs.has('relay-pending-read:read')).toBe(false)
  })

  it('keeps relay rows after durable delivery receipts so read receipts can follow', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})
    const markDelivered = vi.fn(async () => {})
    ;(client as any).identity = { id: 'local-identity' }
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      markDelivered,
      markRead: vi.fn(async () => {}),
    }
    ;(client as any).scheduleRelayDeletion = vi.fn()

    await localChatStorage.storeRelayReceiptJob({
      key: 'relay-delivered:delivered',
      relayMessageId: 'relay-delivered',
      status: 'delivered',
      localIdentityId: 'local-identity',
      attemptCount: 0,
      createdAt: mockNow(),
      updatedAt: mockNow(),
      nextAttemptAt: mockNow(),
    })
    await client.flushRelayReceiptJobs()

    expect(markDelivered).toHaveBeenCalledWith('relay-delivered')
    expect((client as any).scheduleRelayDeletion).not.toHaveBeenCalled()
    expect(relayReceiptJobs.has('relay-delivered:delivered')).toBe(false)
  })

  it('flushes read receipts queued while delivery receipts are in flight', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})
    let resolveDelivered: (() => void) | undefined
    const markDelivered = vi.fn(() => new Promise<void>((resolve) => {
      resolveDelivered = resolve
    }))
    const markRead = vi.fn(async () => {})

    ;(client as any).identity = { id: 'local-identity' }
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      markDelivered,
      markRead,
    }
    ;(client as any).scheduleRelayDeletion = vi.fn()
    await localChatStorage.storeRelayReceiptJob({
      key: 'relay-burst-edge:delivered',
      relayMessageId: 'relay-burst-edge',
      status: 'delivered',
      localIdentityId: 'local-identity',
      attemptCount: 0,
      createdAt: mockNow(),
      updatedAt: mockNow(),
      nextAttemptAt: mockNow(),
    })

    const firstFlush = client.flushRelayReceiptJobs()
    await vi.waitFor(() => {
      expect(markDelivered).toHaveBeenCalledWith('relay-burst-edge')
    })

    await client.markRelayMessageRead('relay-burst-edge')
    expect(relayReceiptJobs.get('relay-burst-edge:read')).toEqual(
      expect.objectContaining({ status: 'read' }),
    )

    resolveDelivered?.()
    await firstFlush

    expect(markRead).toHaveBeenCalledWith('relay-burst-edge')
    expect((client as any).scheduleRelayDeletion).not.toHaveBeenCalled()
    expect(relayReceiptJobs.has('relay-burst-edge:read')).toBe(false)
  })

  it('keeps delivery receipts ahead of reads queued before flushing', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})
    const callOrder: string[] = []
    const markDelivered = vi.fn(async () => {
      callOrder.push('delivered')
    })
    const markRead = vi.fn(async () => {
      callOrder.push('read')
    })

    ;(client as any).identity = { id: 'local-identity' }
    ;(client as any).bundleServer = {
      isAvailable: () => false,
      markDelivered,
      markRead,
    }
    await localChatStorage.storeRelayReceiptJob({
      key: 'relay-before-flush:delivered',
      relayMessageId: 'relay-before-flush',
      status: 'delivered',
      localIdentityId: 'local-identity',
      attemptCount: 0,
      createdAt: mockNow(),
      updatedAt: mockNow(),
      nextAttemptAt: mockNow(),
    })

    await client.markRelayMessageRead('relay-before-flush')

    expect(relayReceiptJobs.has('relay-before-flush:delivered')).toBe(true)
    ;(client as any).bundleServer.isAvailable = () => true
    await client.flushRelayReceiptJobs()

    expect(callOrder).toEqual(['delivered', 'read'])
    expect(relayReceiptJobs.has('relay-before-flush:delivered')).toBe(false)
    expect(relayReceiptJobs.has('relay-before-flush:read')).toBe(false)
  })

  it('drains a 100-message receipt burst with bounded per-message ordering', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})
    const callOrder = new Map<string, string[]>()
    let active = 0
    let peak = 0
    const record = async (relayMessageId: string, status: string): Promise<void> => {
      active += 1
      peak = Math.max(peak, active)
      await Promise.resolve()
      const statuses = callOrder.get(relayMessageId) ?? []
      statuses.push(status)
      callOrder.set(relayMessageId, statuses)
      active -= 1
    }

    ;(client as any).identity = { id: 'local-identity' }
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      markDelivered: (relayMessageId: string) => record(relayMessageId, 'delivered'),
      markRead: (relayMessageId: string) => record(relayMessageId, 'read'),
    }
    for (let index = 0; index < 100; index += 1) {
      const relayMessageId = `relay-burst-${index}`
      await localChatStorage.storeRelayReceiptJob({
        key: `${relayMessageId}:delivered`,
        relayMessageId,
        status: 'delivered',
        localIdentityId: 'local-identity',
        attemptCount: 0,
        createdAt: mockNow(),
        updatedAt: mockNow(),
        nextAttemptAt: mockNow(),
      })
      await localChatStorage.storeRelayReceiptJob({
        key: `${relayMessageId}:read`,
        relayMessageId,
        status: 'read',
        localIdentityId: 'local-identity',
        attemptCount: 0,
        createdAt: mockNow(),
        updatedAt: mockNow(),
        nextAttemptAt: mockNow(),
      })
    }

    await client.flushRelayReceiptJobs()

    expect(relayReceiptJobs.size).toBe(0)
    expect(callOrder.size).toBe(100)
    expect([...callOrder.values()].every(
      (statuses) => statuses.join(',') === 'delivered,read'
    )).toBe(true)
    expect(peak).toBeGreaterThan(1)
    expect(peak).toBeLessThanOrEqual(2)
  })

  it('settles terminal read failures after delivery succeeds', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})
    const markDelivered = vi.fn(async () => {})
    const markRead = vi.fn(async () => {
      throw new Error('{"error":"message_not_found"}')
    })

    ;(client as any).identity = { id: 'local-identity' }
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      markDelivered,
      markRead,
    }
    await localChatStorage.storeRelayReceiptJob({
      key: 'relay-read-retry:delivered',
      relayMessageId: 'relay-read-retry',
      status: 'delivered',
      localIdentityId: 'local-identity',
      attemptCount: 0,
      createdAt: mockNow(),
      updatedAt: mockNow(),
      nextAttemptAt: mockNow(),
    })
    await localChatStorage.storeRelayReceiptJob({
      key: 'relay-read-retry:read',
      relayMessageId: 'relay-read-retry',
      status: 'read',
      localIdentityId: 'local-identity',
      attemptCount: 0,
      createdAt: mockNow(),
      updatedAt: mockNow(),
      nextAttemptAt: mockNow(),
    })

    await client.flushRelayReceiptJobs()

    expect(markDelivered).toHaveBeenCalledWith('relay-read-retry')
    expect(markRead).toHaveBeenCalledWith('relay-read-retry')
    expect(relayReceiptJobs.has('relay-read-retry:delivered')).toBe(false)
    expect(relayReceiptJobs.has('relay-read-retry:read')).toBe(false)
  })

  it('defers relay cleanup until durable receipts settle', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})
    const deleteMessages = vi.fn(async (ids: string[]) => ids.length)

    ;(client as any).identity = { id: 'local-identity' }
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      deleteMessages,
      deleteMessage: vi.fn(async () => 1),
    }
    await localChatStorage.storeRelayReceiptJob({
      key: 'relay-cleanup-race:delivered',
      relayMessageId: 'relay-cleanup-race',
      status: 'delivered',
      localIdentityId: 'local-identity',
      attemptCount: 0,
      createdAt: mockNow(),
      updatedAt: mockNow(),
      nextAttemptAt: mockNow(),
    })
    client.scheduleRelayDeletion('relay-cleanup-race', 60_000)

    await (client as any).flushPendingRelayDeletions()

    expect(deleteMessages).not.toHaveBeenCalled()
    await localChatStorage.deleteRelayReceiptJob('relay-cleanup-race:delivered')
    ;(client as any).activeRelayReceiptIds.clear()
    ;(client as any).clearRelayDeletionTimer()
    localChatStorage.getMessageByRelayId.mockResolvedValue({
      id: 'local-cleanup-race',
      relayMessageId: 'relay-cleanup-race',
      recipientIdentityId: 'local-identity',
      content: 'persisted message',
      status: 'delivered',
    })
    await (client as any).flushPendingRelayDeletions()

    expect(deleteMessages).not.toHaveBeenCalled()
    ;(client as any).clearRelayDeletionTimer()
    localChatStorage.getMessageByRelayId.mockResolvedValue({
      id: 'local-cleanup-race',
      relayMessageId: 'relay-cleanup-race',
      recipientIdentityId: 'local-identity',
      content: 'persisted message',
      status: 'read',
    })
    await (client as any).flushPendingRelayDeletions()

    expect(deleteMessages).toHaveBeenCalledWith(['relay-cleanup-race'])
  })

  it('deletes unprojected leftover relays after an authenticated tombstone', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})
    const deleteMessages = vi.fn(async (ids: string[]) => ids.length)

    ;(client as any).identity = { id: 'local-identity' }
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      deleteMessages,
      deleteMessage: vi.fn(async () => 1),
    }
    localChatStorage.getMessageByRelayId.mockResolvedValue(null)
    localChatStorage.isMessageProcessed.mockImplementation(async (messageId: string) => (
      messageId === 'relay:local-identity:relay-ghost'
    ))
    client.scheduleRelayDeletion('relay-ghost', 0)

    await (client as any).flushPendingRelayDeletions()

    expect(deleteMessages).toHaveBeenCalledWith(['relay-ghost'])
  })

  it('tombstones queued control relays without reopening them', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})

    ;(client as any).identity = { id: 'local-identity' }
    ;(client as any).pendingRelayDeletionIds.add('msg_queued_control')

    const opened = await (client as any).openSealedControlMessages([{
      id: 'msg_queued_control',
      recipientMailboxToken: 'mailbox-token',
      deliveryClass: 'control',
      sealedEnvelope: { version: 1, type: 'control', ciphertext: 'opaque' },
      status: 'pending',
      serverSequence: 9,
      createdAt: 1_717_171_717_000,
      expiresAt: 1_717_171_777_000,
    }])

    expect(opened).toEqual([])
    expect(localChatStorage.storeProcessedMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: 'relay:local-identity:msg_queued_control',
        sessionId: 'local-identity',
        messageHash: 'msg_queued_control',
      }),
    )
  })

  it('does not treat a zero deletedCount as relay cleanup success', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})
    const deleteMessages = vi.fn(async () => 0)
    const deleteMessage = vi.fn(async () => 0)

    ;(client as any).identity = { id: 'local-identity' }
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      deleteMessages,
      deleteMessage,
    }
    localChatStorage.getMessageByRelayId.mockResolvedValue(null)
    localChatStorage.isMessageProcessed.mockImplementation(async (messageId: string) => (
      messageId === 'relay:local-identity:relay-ghost'
    ))
    client.scheduleRelayDeletion('relay-ghost', 0)

    await (client as any).flushPendingRelayDeletions()

    expect(deleteMessages).toHaveBeenCalledWith(['relay-ghost'])
    expect(deleteMessage).toHaveBeenCalledWith('relay-ghost')
    expect((client as any).pendingRelayDeletionIds.has('relay-ghost')).toBe(true)
    expect(relayReceiptJobs.has('relay-ghost:delivered')).toBe(true)
  })

  it('backs off durable receipt jobs after transient relay failures', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})
    const markDelivered = vi.fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(undefined)

    ;(client as any).identity = { id: 'local-identity' }
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      markDelivered,
      markRead: vi.fn(async () => {}),
    }
    await localChatStorage.storeRelayReceiptJob({
      key: 'relay-delivered:delivered',
      relayMessageId: 'relay-delivered',
      status: 'delivered',
      localIdentityId: 'local-identity',
      attemptCount: 0,
      createdAt: mockNow(),
      updatedAt: mockNow(),
      nextAttemptAt: mockNow(),
    })

    await client.flushRelayReceiptJobs()

    const backedOff = relayReceiptJobs.get('relay-delivered:delivered')
    expect(backedOff).toEqual(expect.objectContaining({ attemptCount: 1 }))
    expect(backedOff.nextAttemptAt).toBeGreaterThan(mockNow())

    mockNow.mockReturnValue(backedOff.nextAttemptAt)
    await client.flushRelayReceiptJobs()

    expect(markDelivered).toHaveBeenCalledTimes(2)
    expect(relayReceiptJobs.has('relay-delivered:delivered')).toBe(false)
  })

  it('preserves a durable receipt backoff when the same job is enqueued again', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})
    ;(client as any).identity = { id: 'local-identity' }
    const nextAttemptAt = mockNow() + 60_000
    await localChatStorage.storeRelayReceiptJob({
      key: 'relay-backoff:read',
      relayMessageId: 'relay-backoff',
      status: 'read',
      localIdentityId: 'local-identity',
      attemptCount: 3,
      createdAt: mockNow() - 5_000,
      updatedAt: mockNow(),
      nextAttemptAt,
    })

    await client.markRelayMessageRead('relay-backoff')

    expect(relayReceiptJobs.get('relay-backoff:read')).toEqual(expect.objectContaining({
      attemptCount: 3,
      nextAttemptAt,
    }))
    client.disconnect()
  })

  it('persists receipt acknowledgements and suppresses duplicate jobs', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})
    const markDelivered = vi.fn(async () => {})
    let linkedMessage: any = {
      id: 'local-acknowledged',
      relayMessageId: 'relay-acknowledged',
      status: 'delivered',
    }
    ;(client as any).identity = { id: 'local-identity' }
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      markDelivered,
    }
    localChatStorage.getMessageByRelayId.mockImplementation(async () => linkedMessage)
    localChatStorage.getMessage.mockImplementation(async () => linkedMessage)
    localChatStorage.storeMessage.mockImplementation(async (message: any) => {
      linkedMessage = message
    })
    await localChatStorage.storeRelayReceiptJob({
      key: 'relay-acknowledged:delivered',
      relayMessageId: 'relay-acknowledged',
      status: 'delivered',
      localIdentityId: 'local-identity',
      attemptCount: 0,
      createdAt: mockNow(),
      updatedAt: mockNow(),
      nextAttemptAt: mockNow(),
    })

    await client.flushRelayReceiptJobs()
    const queuedAgain = await (client as any).enqueueRelayReceiptJob(
      'relay-acknowledged',
      'delivered',
    )

    expect(markDelivered).toHaveBeenCalledTimes(1)
    expect(linkedMessage.relayDeliveredReceiptAcknowledgedAt).toBe(mockNow())
    expect(queuedAgain).toBe(false)
    expect(relayReceiptJobs.size).toBe(0)
  })

  it('pauses all receipt lanes when the backend rate limits a burst', async () => {
    const { QuantumChat } = await import('./chat')
    const { BundleServerRequestError } = await import('../server/index')
    const client = new (QuantumChat as any)({})
    const markDelivered = vi.fn(async () => {
      throw new BundleServerRequestError('rate_limited', {
        reason: 'rate_limited',
        statusCode: 429,
        retryAfterMs: 45_000,
        transient: true,
      })
    })
    ;(client as any).identity = { id: 'local-identity' }
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      markDelivered,
      markRead: vi.fn(async () => {}),
    }
    for (let index = 0; index < 6; index += 1) {
      await localChatStorage.storeRelayReceiptJob({
        key: `relay-limited-${index}:delivered`,
        relayMessageId: `relay-limited-${index}`,
        status: 'delivered',
        localIdentityId: 'local-identity',
        attemptCount: 0,
        createdAt: mockNow(),
        updatedAt: mockNow(),
        nextAttemptAt: mockNow(),
      })
    }

    await client.flushRelayReceiptJobs()

    expect(markDelivered.mock.calls.length).toBeLessThanOrEqual(2)
    expect([...relayReceiptJobs.values()].every(
      (job) => job.nextAttemptAt >= mockNow() + 45_000
    )).toBe(true)
    client.disconnect()
  })

  it('allows forced outbound status syncs to bypass the Tor interval', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({
      isTorEnabled: () => true,
    })
    const fetchMessageStatuses = vi.fn(async () => [
      { id: 'relay-forced', status: 'delivered' },
    ])

    ;(client as any).identity = { id: 'local-identity' }
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      fetchMessageStatuses,
    }
    localChatStorage.getMessagesNeedingStatusSync.mockResolvedValue([
      {
        id: 'local-forced',
        relayMessageId: 'relay-forced',
        relayDeliveryToken: 'delivery-forced',
        senderIdentityId: 'local-identity',
        status: 'sent',
        createdAt: 1_717_171_717_000,
      },
    ] as any)
    localChatStorage.getMessageByRelayId.mockResolvedValue({
      id: 'local-forced',
      status: 'sent',
    })
    localChatStorage.updateMessageStatus.mockResolvedValue(undefined)

    await client.syncOutboundRelayStatuses({ force: true })
    mockNow.mockReturnValue(1_717_171_718_000)
    await client.syncOutboundRelayStatuses({ force: true })

    expect(fetchMessageStatuses).toHaveBeenCalledTimes(2)
  })

  it('reruns a forced outbound status sync requested during an active sync', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})
    let resolveFirstFetch: ((value: Array<{ id: string; status: 'delivered' | 'read' }>) => void) | undefined
    const fetchMessageStatuses = vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveFirstFetch = resolve
      }))
      .mockResolvedValueOnce([{ id: 'relay-next', status: 'read' }])

    ;(client as any).identity = { id: 'local-identity' }
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      fetchMessageStatuses,
    }
    localChatStorage.getMessagesNeedingStatusSync
      .mockResolvedValueOnce([
        {
          id: 'local-first',
          relayMessageId: 'relay-first',
          relayDeliveryToken: 'delivery-first',
          senderIdentityId: 'local-identity',
          status: 'sent',
          createdAt: 1_717_171_717_000,
        },
      ] as any)
      .mockResolvedValueOnce([
        {
          id: 'local-next',
          relayMessageId: 'relay-next',
          relayDeliveryToken: 'delivery-next',
          senderIdentityId: 'local-identity',
          status: 'delivered',
          deliveredAt: Date.now(),
          createdAt: 1_717_171_717_001,
        },
      ] as any)
    localChatStorage.getMessageByRelayId.mockResolvedValue({
      id: 'local-next',
      status: 'delivered',
    })
    localChatStorage.updateMessageStatus.mockResolvedValue(undefined)

    const firstSync = client.syncOutboundRelayStatuses({ force: true })
    await Promise.resolve()
    await Promise.resolve()

    const secondSync = client.syncOutboundRelayStatuses({ force: true })
    expect(fetchMessageStatuses).toHaveBeenCalledTimes(1)

    resolveFirstFetch?.([])
    await Promise.all([firstSync, secondSync])

    expect(fetchMessageStatuses).toHaveBeenCalledTimes(2)
    expect(localChatStorage.updateMessageStatus).toHaveBeenCalledWith('local-next', 'read')
  })

  it('syncs receipt statuses beyond the newest 25 tracked relay ids', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})
    const trackedMessages = Array.from({ length: 60 }, (_, index) => ({
      id: `local-${index}`,
      relayMessageId: `relay-${index}`,
      relayDeliveryToken: `delivery-${index}`,
      senderIdentityId: 'local-identity',
      status: 'sent',
      createdAt: 1_717_171_717_000 + index,
    }))
    const fetchMessageStatuses = vi.fn(async (messages: Array<{ id: string; deliveryToken: string }>) => {
      expect(messages).toContainEqual({ id: 'relay-0', deliveryToken: 'delivery-0' })
      expect(messages).toHaveLength(60)
      return [{ id: 'relay-0', status: 'delivered' }]
    })

    ;(client as any).identity = { id: 'local-identity' }
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      fetchMessageStatuses,
    }
    localChatStorage.getMessagesNeedingStatusSync.mockResolvedValue(trackedMessages as any)
    localChatStorage.getMessageByRelayId.mockResolvedValue({
      id: 'local-0',
      status: 'sent',
    })
    localChatStorage.updateMessageStatus.mockResolvedValue(undefined)

    await client.syncOutboundRelayStatuses({ force: true })

    expect(fetchMessageStatuses).toHaveBeenCalledTimes(1)
    expect(localChatStorage.updateMessageStatus).toHaveBeenCalledWith('local-0', 'delivered')
  })

  it.each([101, 250])('chunks %i outbound status candidates at the protocol limit', async (candidateCount) => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})
    const trackedMessages = Array.from({ length: candidateCount }, (_, index) => ({
      id: `local-${index}`,
      relayMessageId: `relay-${index.toString().padStart(3, '0')}`,
      relayDeliveryToken: `delivery-${index}`,
      senderIdentityId: 'local-identity',
      status: 'sent',
      createdAt: 1_717_171_717_000 + index,
    }))
    const fetchMessageStatuses = vi.fn(async (messages: Array<{ id: string; deliveryToken: string }>) => (
      messages.map((message) => ({ id: message.id, status: 'delivered' as const }))
    ))

    ;(client as any).identity = { id: 'local-identity' }
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      fetchMessageStatuses,
    }
    localChatStorage.getMessagesNeedingStatusSync.mockResolvedValue(trackedMessages as any)
    const messagesByRelayId = new Map(trackedMessages.map((message) => [message.relayMessageId, message]))
    localChatStorage.getMessageByRelayId.mockImplementation(async (relayMessageId: string) => {
      const message = messagesByRelayId.get(relayMessageId)
      return message ? { id: message.id, status: message.status } : null
    })
    localChatStorage.updateMessageStatus.mockResolvedValue(undefined)

    await client.syncOutboundRelayStatuses({ force: true })

    const expectedChunkSizes = candidateCount === 101 ? [100, 1] : [100, 100, 50]
    expect(fetchMessageStatuses.mock.calls.map(([messages]) => messages.length)).toEqual(expectedChunkSizes)
    expect(fetchMessageStatuses.mock.calls.flatMap(([messages]) => messages.map((message) => message.id))).toEqual(
      trackedMessages.map((message) => message.relayMessageId),
    )
    expect(localChatStorage.updateMessageStatus).toHaveBeenCalledTimes(candidateCount)
  })

  it('reuses loaded status candidates instead of reading each relay row again', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})
    const trackedMessages = Array.from({ length: 100 }, (_, index) => ({
      id: `local-loaded-${index}`,
      relayMessageId: `relay-loaded-${index}`,
      relayDeliveryToken: `delivery-loaded-${index}`,
      senderIdentityId: 'local-identity',
      status: 'delivered',
      deliveredAt: Date.now(),
      createdAt: 1_717_171_717_000 + index,
    }))
    const fetchMessageStatuses = vi.fn(async (messages: Array<{ id: string }>) => (
      messages.map((message) => ({ id: message.id, status: 'delivered' as const }))
    ))
    const deliveredListener = vi.fn()

    ;(client as any).identity = { id: 'local-identity' }
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      fetchMessageStatuses,
    }
    client.on('message:delivered', deliveredListener)
    localChatStorage.getMessagesNeedingStatusSync.mockResolvedValue(trackedMessages as any)

    await client.syncOutboundRelayStatuses({ force: true })

    expect(localChatStorage.getMessageByRelayId).not.toHaveBeenCalled()
    expect(localChatStorage.updateMessageStatus).not.toHaveBeenCalled()
    expect(deliveredListener).toHaveBeenCalledTimes(100)
  })

  it('continues deterministic status chunks after a partial fetch failure', async () => {
    const { QuantumChat } = await import('./chat')
    const recordDiagnostic = vi.fn()
    const client = new (QuantumChat as any)({
      telemetry: { recordDiagnostic },
    })
    const trackedMessages = Array.from({ length: 250 }, (_, index) => ({
      id: `local-${index}`,
      relayMessageId: `relay-${index.toString().padStart(3, '0')}`,
      relayDeliveryToken: `delivery-${index}`,
      senderIdentityId: 'local-identity',
      status: 'sent',
      createdAt: 1_717_171_717_000 + index,
    }))
    let callIndex = 0
    const fetchMessageStatuses = vi.fn(async (messages: Array<{ id: string; deliveryToken: string }>) => {
      const currentCall = callIndex++
      if (currentCall === 1) {
        throw new Error('temporary status fetch failure')
      }
      return messages.map((message) => ({ id: message.id, status: 'read' as const }))
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    ;(client as any).identity = { id: 'local-identity' }
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      fetchMessageStatuses,
    }
    localChatStorage.getMessagesNeedingStatusSync.mockResolvedValue(trackedMessages as any)
    const messagesByRelayId = new Map(trackedMessages.map((message) => [message.relayMessageId, message]))
    localChatStorage.getMessageByRelayId.mockImplementation(async (relayMessageId: string) => {
      const message = messagesByRelayId.get(relayMessageId)
      return message ? { id: message.id, status: message.status } : null
    })
    localChatStorage.updateMessageStatus.mockResolvedValue(undefined)

    await client.syncOutboundRelayStatuses({ force: true })
    warn.mockRestore()

    expect(fetchMessageStatuses.mock.calls.map(([messages]) => messages.length)).toEqual([100, 100, 50])
    expect(localChatStorage.updateMessageStatus).toHaveBeenCalledTimes(150)
    expect(localChatStorage.updateMessageStatus).toHaveBeenCalledWith('local-99', 'read')
    expect(localChatStorage.updateMessageStatus).not.toHaveBeenCalledWith('local-100', expect.anything())
    expect(localChatStorage.updateMessageStatus).toHaveBeenCalledWith('local-200', 'read')
    expect(recordDiagnostic).toHaveBeenCalledWith(
      'send',
      'relay_status_sync_batch_failed',
      expect.objectContaining({ chunkIndex: 1, chunkCount: 3, relayIdCount: 100 }),
    )
  })

  it('converges burst receipt statuses when one realtime read is missed', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})
    const trackedMessages = Array.from({ length: 10 }, (_, index) => ({
      id: `local-${index}`,
      relayMessageId: `relay-${index}`,
      relayDeliveryToken: `delivery-${index}`,
      senderIdentityId: 'local-identity',
      status: index === 0 ? 'delivered' : 'sent',
      ...(index === 0 ? { deliveredAt: Date.now() } : {}),
      createdAt: 1_717_171_717_000 + index,
    }))
    const fetchMessageStatuses = vi.fn(async (messages: Array<{ id: string; deliveryToken: string }>) => (
      messages.map((message) => ({ id: message.id, status: 'read' as const }))
    ))

    ;(client as any).identity = { id: 'local-identity' }
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      fetchMessageStatuses,
    }
    localChatStorage.getMessagesNeedingStatusSync.mockResolvedValue(trackedMessages as any)
    localChatStorage.getMessageByRelayId.mockImplementation(async (relayMessageId: string) => {
      const index = Number(relayMessageId.replace('relay-', ''))
      return trackedMessages[index] ?? null
    })
    localChatStorage.updateMessageStatus.mockResolvedValue(undefined)

    await client.syncOutboundRelayStatuses({ force: true })

    expect(fetchMessageStatuses).toHaveBeenCalledTimes(1)
    expect(fetchMessageStatuses).toHaveBeenCalledWith(
      expect.arrayContaining([
        { id: 'relay-0', deliveryToken: 'delivery-0' },
        { id: 'relay-9', deliveryToken: 'delivery-9' },
      ]),
    )
    for (let index = 0; index < 10; index++) {
      expect(localChatStorage.updateMessageStatus).toHaveBeenCalledWith(`local-${index}`, 'read')
    }
  })

  it('skips status fetches without weakening receipt capability checks', async () => {
    const { QuantumChat } = await import('./chat')
    const recordDiagnostic = vi.fn()
    const client = new (QuantumChat as any)({
      telemetry: { recordDiagnostic },
    })
    const fetchMessageStatuses = vi.fn(async () => [])

    ;(client as any).identity = { id: 'local-identity' }
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      fetchMessageStatuses,
    }
    localChatStorage.getMessagesNeedingStatusSync.mockResolvedValue([
      {
        id: 'local-missing-token',
        relayMessageId: 'relay-missing-token',
        senderIdentityId: 'local-identity',
        status: 'sent',
        createdAt: 1_717_171_717_000,
      },
    ] as any)

    await client.syncOutboundRelayStatuses({ force: true })

    expect(fetchMessageStatuses).not.toHaveBeenCalled()
    expect(recordDiagnostic).toHaveBeenCalledWith(
      'send',
      'relay_status_sync_missing_delivery_token',
      expect.objectContaining({ missingDeliveryTokenCount: 1 }),
    )
  })

  it('skips stale delivered messages during outbound status sync', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})
    const fetchMessageStatuses = vi.fn(async () => [])

    ;(client as any).identity = { id: 'local-identity' }
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      fetchMessageStatuses,
    }
    localChatStorage.getMessagesNeedingStatusSync.mockResolvedValue([
      {
        id: 'local-stable',
        relayMessageId: 'relay-stable',
        relayDeliveryToken: 'delivery-stable',
        senderIdentityId: 'local-identity',
        status: 'delivered',
        deliveredAt: Date.now() - 11 * 60 * 1_000,
        createdAt: 1_717_171_717_000,
      },
    ] as any)

    await client.syncOutboundRelayStatuses({ force: true })

    expect(fetchMessageStatuses).not.toHaveBeenCalled()
  })

  it('does not advance the sealed relay cursor past a row that failed to open', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})

    ;(client as any).identity = {
      id: 'local-identity',
      identityPublicKey: 'identity-public-key',
      mlkemPublicKey: 'mlkem-public-key',
      dilithiumPublicKey: 'dilithium-public-key',
    }
    ;(client as any).privateBundle = {}
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      fetchOwnedSealedMessages: vi.fn(async () => [
        {
          id: 'sealed-bad',
          recipientMailboxToken: 'mailbox-token',
          deliveryClass: 'message',
          sealedEnvelope: { type: 'message' },
          status: 'pending',
          serverSequence: 10,
          createdAt: 10,
          expiresAt: 100,
        },
        {
          id: 'sealed-good',
          recipientMailboxToken: 'mailbox-token',
          deliveryClass: 'message',
          sealedEnvelope: { type: 'message' },
          status: 'pending',
          serverSequence: 11,
          createdAt: 11,
          expiresAt: 100,
        },
      ]),
      fetchBundle: vi.fn(async () => ({ bundle: null })),
      markDelivered: vi.fn(async () => {}),
      fetchMessageStatuses: vi.fn(async () => []),
    }
    ;(client as any).openSealedRelayMessage = vi.fn((sealed: any) => {
      if (sealed.id === 'sealed-bad') {
        throw new Error('sealed open failed')
      }
      return {
        id: 'relay-good',
        senderIdentityId: 'remote-identity',
        recipientIdentityId: 'local-identity',
        conversationId: 'conversation-1',
        encryptedData: { metadata: { messageId: 'inner-good' } },
        status: 'pending',
        serverSequence: sealed.serverSequence,
        createdAt: sealed.createdAt,
        expiresAt: sealed.expiresAt,
      }
    })
    ;(client as any).receiveMessage = vi.fn(async () => ({
      id: 'inner-good',
      conversationId: 'conversation-1',
      senderId: 'remote-identity',
      content: 'hello',
      timestamp: 11,
      signatureVerified: true,
      status: 'delivered',
    }))
    localChatStorage.getConversationByParticipants.mockResolvedValue({
      id: 'conversation-1',
      expectedSequenceNumber: 0,
      unreadCount: 0,
    })
    localChatStorage.getPublicKeyBundle.mockResolvedValue(createRemoteBundle())
    localChatStorage.linkRelayMessage.mockResolvedValue(undefined)

    const result = await client.fetchPendingMessages(0)

    expect(result.messages).toHaveLength(1)
    expect(result.advanceSequence).toBe(0)
    expect(result.highestSeenSequence).toBe(11)
    expect(result.blockedCount).toBeGreaterThan(0)
  })

  it('advances the sealed relay cursor past already-seen replay rows', async () => {
    const { QuantumChat } = await import('./chat')
    const { ReplayError } = await import('../types')
    const client = new (QuantumChat as any)({})
    const scheduleRelayDeletion = vi.fn()

    ;(client as any).identity = {
      id: 'local-identity',
      identityPublicKey: 'identity-public-key',
      mlkemPublicKey: 'mlkem-public-key',
      dilithiumPublicKey: 'dilithium-public-key',
    }
    ;(client as any).privateBundle = {}
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      fetchOwnedSealedMessages: vi.fn(async () => [
        {
          id: 'sealed-replay',
          recipientMailboxToken: 'smbx2.scope',
          deliveryClass: 'message',
          sealedEnvelope: { type: 'message' },
          status: 'pending',
          serverSequence: 12,
          createdAt: 12,
          expiresAt: 100,
        },
      ]),
      fetchBundle: vi.fn(async () => ({ bundle: null })),
      markDelivered: vi.fn(async () => {}),
      fetchMessageStatuses: vi.fn(async () => []),
    }
    ;(client as any).openSealedRelayMessage = vi.fn(() => {
      throw new ReplayError('Sealed envelope replay detected')
    })
    ;(client as any).scheduleRelayDeletion = scheduleRelayDeletion

    const result = await client.fetchPendingMessages(10)

    expect(result.messages).toHaveLength(0)
    expect(result.advanceSequence).toBe(12)
    expect(result.highestSeenSequence).toBe(12)
    expect(result.quarantinedCount).toBe(1)
    expect(result.blockedCount).toBe(0)
    expect(scheduleRelayDeletion).toHaveBeenCalledWith('sealed-replay', 0)
  })

  it('tombstones a replayed leftover after local history was cleared', async () => {
    const { QuantumChat } = await import('./chat')
    const { ReplayError } = await import('../types')
    const remoteBundle = createRemoteBundle()
    const client = new (QuantumChat as any)({})
    const scheduleRelayDeletion = vi.fn()

    ;(client as any).identity = {
      id: 'local-identity',
      identityPublicKey: 'local-identity-key',
      mlkemPublicKey: 'local-mlkem-key',
      dilithiumPublicKey: 'local-dilithium-key',
    }
    ;(client as any).privateBundle = {}
    ;(client as any).trackedIdentities.set('remote-identity', {
      identityId: 'remote-identity',
      currentIdentityKey: remoteBundle.identityKey,
      currentDilithiumKey: remoteBundle.dilithiumKey,
      trustState: 'trusted',
    })
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      fetchOwnedSealedMessages: installOwnedSealedRelayFetch(client, [{
        id: 'relay-ghost-row',
        senderIdentityId: 'remote-identity',
        recipientIdentityId: 'local-identity',
        encryptedData: { metadata: { messageId: 'inner-ghost' } },
        senderBundle: remoteBundle,
        status: 'delivered',
        serverSequence: 1459,
        createdAt: 1_717_171_717_000,
        expiresAt: 1_717_171_817_000,
      }]),
      fetchBundle: vi.fn(async () => ({ bundle: null })),
      fetchMessageStatuses: vi.fn(async () => []),
    }
    ;(client as any).receiveMessage = vi.fn(async () => {
      throw new ReplayError('Message replay detected')
    })
    ;(client as any).scheduleRelayDeletion = scheduleRelayDeletion
    localChatStorage.getMessageByRelayId.mockResolvedValue(null)
    localChatStorage.getDecryptedMessage.mockResolvedValue(null)
    localChatStorage.isMessageProcessed.mockImplementation(async (messageId: string) => (
      messageId === 'inner-ghost'
    ))
    localChatStorage.getPublicKeyBundle.mockResolvedValue(remoteBundle)
    localChatStorage.getConversationByParticipants.mockResolvedValue({
      id: 'conversation-1',
      expectedSequenceNumber: 0,
      unreadCount: 0,
    })

    const result = await client.fetchPendingMessages(undefined, { fastPath: true })

    expect(result.messages).toEqual([])
    expect(result.advanceSequence).toBe(1459)
    expect(scheduleRelayDeletion).toHaveBeenCalledWith('relay-ghost-row', 0)
    expect(localChatStorage.storeProcessedMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: 'relay:local-identity:relay-ghost-row',
        sessionId: 'local-identity',
        messageHash: 'relay-ghost-row',
      }),
    )
  })

  it('schedules maintenance after fast-path pending fetches', async () => {
    vi.useFakeTimers()
    try {
      const { QuantumChat } = await import('./chat')
      const client = new (QuantumChat as any)({})
      const processControlMessages = vi.fn(async () => {})
      const scheduleReceiveMaintenance = vi.fn()

      ;(client as any).identity = {
        id: 'local-identity',
        identityPublicKey: 'identity-public-key',
        mlkemPublicKey: 'mlkem-public-key',
        dilithiumPublicKey: 'dilithium-public-key',
      }
      ;(client as any).privateBundle = {}
      ;(client as any).bundleServer = {
        isAvailable: () => true,
        fetchOwnedSealedMessages: vi.fn(async () => []),
      }
      ;(client as any).processControlMessages = processControlMessages
      ;(client as any).scheduleReceiveMaintenance = scheduleReceiveMaintenance

      const result = await client.fetchPendingMessages(0, { fastPath: true })

      expect(result.messages).toHaveLength(0)
      expect(processControlMessages).not.toHaveBeenCalled()
      expect(scheduleReceiveMaintenance).toHaveBeenCalledTimes(1)
      expect(scheduleReceiveMaintenance).toHaveBeenCalledWith(750)
    } finally {
      vi.useRealTimers()
    }
  })

  it('waits for durable relay linking during fast-path pending fetches', async () => {
    vi.useFakeTimers()
    try {
      const { QuantumChat } = await import('./chat')
      const client = new (QuantumChat as any)({})
      let resolveRelayLink: (() => void) | undefined

      ;(client as any).identity = {
        id: 'local-identity',
        identityPublicKey: 'identity-public-key',
        mlkemPublicKey: 'mlkem-public-key',
        dilithiumPublicKey: 'dilithium-public-key',
      }
      ;(client as any).privateBundle = {}
      ;(client as any).bundleServer = {
        isAvailable: () => true,
        fetchOwnedSealedMessages: vi.fn(async () => [
          {
            id: 'sealed-fast-path',
            recipientMailboxToken: 'mailbox-token',
            deliveryClass: 'message',
            sealedEnvelope: { type: 'message' },
            status: 'pending',
            serverSequence: 20,
            createdAt: 20,
            expiresAt: 100,
          },
        ]),
        fetchBundle: vi.fn(async () => ({ bundle: null })),
        markDelivered: vi.fn(async () => {}),
      }
      ;(client as any).openSealedRelayMessage = vi.fn((sealed: any) => ({
        id: 'relay-fast-path',
        senderIdentityId: 'remote-identity',
        recipientIdentityId: 'local-identity',
        conversationId: 'conversation-1',
        encryptedData: { metadata: { messageId: 'inner-fast-path' } },
        senderBundle: createRemoteBundle(),
        status: 'pending',
        serverSequence: sealed.serverSequence,
        createdAt: sealed.createdAt,
        expiresAt: sealed.expiresAt,
      }))
      ;(client as any).receiveMessage = vi.fn(async () => ({
        id: 'inner-fast-path',
        conversationId: 'conversation-1',
        senderId: 'remote-identity',
        content: 'hello',
        timestamp: 20,
        signatureVerified: true,
        status: 'delivered',
      }))
      localChatStorage.getConversationByParticipants.mockResolvedValue({
        id: 'conversation-1',
        expectedSequenceNumber: 0,
        unreadCount: 0,
      })
      localChatStorage.linkRelayMessage.mockImplementationOnce(() => new Promise<void>((resolve) => {
        resolveRelayLink = resolve
      }))

      let fetchSettled = false
      const fetchPromise = client.fetchPendingMessages(0, { fastPath: true }).finally(() => {
        fetchSettled = true
      })

      await vi.waitFor(() => {
        expect(localChatStorage.linkRelayMessage).toHaveBeenCalledWith(
          'inner-fast-path',
          'relay-fast-path',
          undefined,
        )
      })
      expect(fetchSettled).toBe(false)

      resolveRelayLink?.()
      const result = await fetchPromise

      expect(result.messages).toHaveLength(1)
      expect(result.advanceSequence).toBe(20)
    } finally {
      vi.clearAllTimers()
      vi.useRealTimers()
    }
  })

  it('does not wait for optional control processing before fetching direct relays', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})
    let controlStarted = false
    const fetchOwnedSealedMessages = vi.fn(async () => {
      expect(controlStarted).toBe(false)
      return []
    })

    ;(client as any).identity = {
      id: 'local-identity',
      identityPublicKey: 'identity-public-key',
      mlkemPublicKey: 'mlkem-public-key',
      dilithiumPublicKey: 'dilithium-public-key',
    }
    ;(client as any).privateBundle = {}
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      fetchOwnedSealedMessages,
      fetchBundle: vi.fn(async () => ({ bundle: null })),
      fetchMessageStatuses: vi.fn(async () => []),
    }
    ;(client as any).processControlMessages = vi.fn(async () => {
      controlStarted = true
    })
    localChatStorage.getMailboxScopes.mockResolvedValue([])

    await expect(client.fetchPendingMessages(10)).resolves.toEqual(expect.objectContaining({
      messages: [],
      advanceSequence: 10,
    }))

    expect(fetchOwnedSealedMessages).toHaveBeenCalledWith(10)
    expect((client as any).processControlMessages).toHaveBeenCalledTimes(1)
  })

  it('does not commit a sealed relay nonce when message processing fails', async () => {
    const { QuantumChat } = await import('./chat')
    const remoteBundle = createRemoteBundle()
    const client = new (QuantumChat as any)({})

    ;(client as any).identity = {
      id: 'local-identity',
      identityPublicKey: 'identity-public-key',
      mlkemPublicKey: 'mlkem-public-key',
      dilithiumPublicKey: 'dilithium-public-key',
    }
    ;(client as any).privateBundle = {}
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      fetchOwnedSealedMessages: vi.fn(async () => [
        {
          id: 'sealed-retryable',
          recipientMailboxToken: 'mailbox-token',
          deliveryClass: 'message',
          sealedEnvelope: { type: 'message' },
          status: 'pending',
          serverSequence: 12,
          createdAt: 12,
          expiresAt: 100,
        },
      ]),
      fetchBundle: vi.fn(async () => ({ bundle: null })),
      markDelivered: vi.fn(async () => {}),
      fetchMessageStatuses: vi.fn(async () => []),
    }
    ;(client as any).openSealedRelayMessage = vi.fn((sealed: any) => {
      ;(client as any).sealedEnvelopeReplayCache.check('retryable-nonce')
      return {
        id: sealed.id,
        senderIdentityId: 'remote-identity',
        recipientIdentityId: 'local-identity',
        conversationId: 'conversation-1',
        encryptedData: { metadata: { messageId: 'inner-retryable' } },
        senderBundle: remoteBundle,
        status: 'pending',
        serverSequence: sealed.serverSequence,
        createdAt: sealed.createdAt,
        expiresAt: sealed.expiresAt,
        sealedEnvelopeNonce: 'retryable-nonce',
      }
    })
    ;(client as any).receiveMessage = vi.fn(async () => {
      throw new Error('temporary receive failure')
    })
    localChatStorage.getConversationByParticipants.mockResolvedValue({
      id: 'conversation-1',
      expectedSequenceNumber: 0,
      unreadCount: 0,
    })
    localChatStorage.getPublicKeyBundle.mockResolvedValue(remoteBundle)

    const firstResult = await client.fetchPendingMessages(0)
    const secondResult = await client.fetchPendingMessages(0)

    expect(firstResult.messages).toHaveLength(0)
    expect(secondResult.messages).toHaveLength(0)
    expect((client as any).openSealedRelayMessage).toHaveBeenCalledTimes(2)
    expect((client as any).receiveMessage).toHaveBeenCalledTimes(2)
  })

  it('advances past terminal undecryptable relays after persisting a failed repair attempt', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})

    const bundleServer = {
      isAvailable: () => true,
      fetchOwnedSealedMessages: installOwnedSealedRelayFetch(client, [
        {
          id: 'relay-1',
          senderIdentityId: 'remote-identity',
          recipientIdentityId: 'local-identity',
          conversationId: 'conversation-1',
          encryptedData: {
            metadata: { messageId: 'inner-message-1' },
          },
          status: 'pending',
          serverSequence: 42,
          createdAt: Date.now(),
          expiresAt: Date.now() + 60_000,
        },
      ]),
      fetchBundle: vi.fn(async () => ({ bundle: null })),
      deleteMessage: vi.fn(async () => {}),
      fetchMessageStatuses: vi.fn(async () => []),
    }

    ;(client as any).bundleServer = bundleServer
    ;(client as any).identity = { id: 'local-identity' }
    ;(client as any).privateBundle = {}
    ;(client as any).flushPendingRelayDeletions = vi.fn(async () => {})
    ;(client as any).processControlMessages = vi.fn(async () => {})
    ;(client as any).scheduleRelayDeletion = vi.fn()
    client.receiveMessage = vi.fn(async () => {
      throw new Error('Decryption failed: authentication tag mismatch')
    })
    client.requestMessageRetry = vi.fn(async () => ({
      ok: false,
      reason: 'network',
      message: 'Network request failed',
    }))

    localChatStorage.getPublicKeyBundle.mockResolvedValue(createRemoteBundle())
    localChatStorage.getConversationByParticipants.mockResolvedValue({
      id: 'conversation-1',
    })

    const result = await client.fetchPendingMessages()

    expect(client.requestMessageRetry).toHaveBeenCalledWith('inner-message-1', 'remote-identity')
    expect(bundleServer.deleteMessage).not.toHaveBeenCalled()
    expect((client as any).scheduleRelayDeletion).not.toHaveBeenCalled()
    expect(result).toEqual(
      expect.objectContaining({
        highestSeenSequence: 42,
        advanceSequence: 42,
        quarantinedCount: 1,
        blockedCount: 0,
      }),
    )
  })

  it('treats invalid wallet-authorized bundles as terminal retry candidates', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})

    const bundleServer = {
      isAvailable: () => true,
      fetchOwnedSealedMessages: installOwnedSealedRelayFetch(client, [
        {
          id: 'relay-wallet-auth-mismatch',
          senderIdentityId: 'remote-identity',
          recipientIdentityId: 'local-identity',
          conversationId: 'conversation-1',
          encryptedData: {
            metadata: { messageId: 'inner-wallet-auth-mismatch' },
          },
          status: 'pending',
          serverSequence: 45,
          createdAt: Date.now(),
          expiresAt: Date.now() + 60_000,
        },
      ]),
      fetchBundle: vi.fn(async () => ({ bundle: null })),
      deleteMessage: vi.fn(async () => {}),
      fetchMessageStatuses: vi.fn(async () => []),
    }

    ;(client as any).bundleServer = bundleServer
    ;(client as any).identity = { id: 'local-identity' }
    ;(client as any).privateBundle = {}
    ;(client as any).flushPendingRelayDeletions = vi.fn(async () => {})
    ;(client as any).processControlMessages = vi.fn(async () => {})
    ;(client as any).scheduleRelayDeletion = vi.fn()
    client.receiveMessage = vi.fn(async () => {
      throw new Error('Invalid contact wallet authorization: Wallet authorization bundle signature mismatch')
    })
    client.requestMessageRetry = vi.fn(async () => ({
      ok: false,
      reason: 'network',
      message: 'Network request failed',
    }))

    localChatStorage.getPublicKeyBundle.mockResolvedValue(createRemoteBundle())
    localChatStorage.getConversationByParticipants.mockResolvedValue({
      id: 'conversation-1',
    })

    const result = await client.fetchPendingMessages()

    expect(client.requestMessageRetry).toHaveBeenCalledWith('inner-wallet-auth-mismatch', 'remote-identity')
    expect(result).toEqual(
      expect.objectContaining({
        highestSeenSequence: 45,
        advanceSequence: 45,
        quarantinedCount: 1,
        blockedCount: 0,
      }),
    )
  })

  it('treats failed X3DH bootstrap header decrypts as terminal retry candidates', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})

    const bundleServer = {
      isAvailable: () => true,
      fetchOwnedSealedMessages: installOwnedSealedRelayFetch(client, [
        {
          id: 'relay-2',
          senderIdentityId: 'remote-identity',
          recipientIdentityId: 'local-identity',
          conversationId: 'conversation-1',
          encryptedData: {
            metadata: { messageId: 'inner-message-2' },
            x3dhData: {
              usedOneTimePreKeyId: 1507,
              bundleTimestamp: 1775765052200,
            },
            header: { sessionFingerprint: 'fingerprint-1' },
          },
          status: 'pending',
          serverSequence: 43,
          createdAt: Date.now(),
          expiresAt: Date.now() + 60_000,
        },
      ]),
      fetchBundle: vi.fn(async () => ({ bundle: null })),
      deleteMessage: vi.fn(async () => {}),
      fetchMessageStatuses: vi.fn(async () => []),
    }

    ;(client as any).bundleServer = bundleServer
    ;(client as any).identity = { id: 'local-identity' }
    ;(client as any).privateBundle = {}
    ;(client as any).flushPendingRelayDeletions = vi.fn(async () => {})
    ;(client as any).processControlMessages = vi.fn(async () => {})
    ;(client as any).scheduleRelayDeletion = vi.fn()
    client.receiveMessage = vi.fn(async () => {
      throw new SessionError('Failed to decrypt message header - no valid header key found', {
        code: 'X3DH_BOOTSTRAP_FAILED',
        reason: 'responder_decrypt',
        usedOneTimePreKeyId: 1507,
        bundleTimestamp: 1775765052200,
        sessionFingerprint: 'fingerprint-1',
      })
    })
    client.requestMessageRetry = vi.fn(async () => ({ ok: true }))
    getX3DHBootstrapFailureDetails.mockReturnValue({
      code: 'X3DH_BOOTSTRAP_FAILED',
      reason: 'responder_decrypt',
      usedOneTimePreKeyId: 1507,
      bundleTimestamp: 1775765052200,
      sessionFingerprint: 'fingerprint-1',
    })

    localChatStorage.getPublicKeyBundle.mockResolvedValue(createRemoteBundle())
    localChatStorage.getConversationByParticipants.mockResolvedValue({
      id: 'conversation-1',
    })

    const result = await client.fetchPendingMessages()

    expect(client.requestMessageRetry).toHaveBeenCalledWith('inner-message-2', 'remote-identity')
    expect((client as any).scheduleRelayDeletion).toHaveBeenCalledWith('relay-2', 0)
    expect(result).toEqual(
      expect.objectContaining({
        highestSeenSequence: 43,
        advanceSequence: 43,
        quarantinedCount: 1,
        blockedCount: 0,
      }),
    )
  })

  it('treats missing-session relays without x3dh data as terminal retry candidates', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})

    const bundleServer = {
      isAvailable: () => true,
      fetchOwnedSealedMessages: installOwnedSealedRelayFetch(client, [
        {
          id: 'relay-3',
          senderIdentityId: 'remote-identity',
          recipientIdentityId: 'local-identity',
          conversationId: 'conversation-1',
          encryptedData: {
            metadata: { messageId: 'inner-message-3' },
          },
          status: 'pending',
          serverSequence: 44,
          createdAt: Date.now(),
          expiresAt: Date.now() + 60_000,
        },
      ]),
      fetchBundle: vi.fn(async () => ({ bundle: null })),
      deleteMessage: vi.fn(async () => {}),
      fetchMessageStatuses: vi.fn(async () => []),
    }

    ;(client as any).bundleServer = bundleServer
    ;(client as any).identity = { id: 'local-identity' }
    ;(client as any).privateBundle = {}
    ;(client as any).flushPendingRelayDeletions = vi.fn(async () => {})
    ;(client as any).processControlMessages = vi.fn(async () => {})
    ;(client as any).scheduleRelayDeletion = vi.fn()
    client.receiveMessage = vi.fn(async () => {
      throw new SessionError('No session found for sender and message has no X3DH data')
    })
    client.requestMessageRetry = vi.fn(async () => ({ ok: true }))

    localChatStorage.getPublicKeyBundle.mockResolvedValue(createRemoteBundle())
    localChatStorage.getConversationByParticipants.mockResolvedValue({
      id: 'conversation-1',
    })

    const result = await client.fetchPendingMessages()

    expect(client.requestMessageRetry).toHaveBeenCalledWith('inner-message-3', 'remote-identity')
    expect((client as any).scheduleRelayDeletion).toHaveBeenCalledWith('relay-3', 0)
    expect(result).toEqual(
      expect.objectContaining({
        highestSeenSequence: 44,
        advanceSequence: 44,
        quarantinedCount: 1,
        blockedCount: 0,
      }),
    )
  })

  it('requests a message retry for OPK-miss relays so the original message can be resent', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})

    const bundleServer = {
      isAvailable: () => true,
      fetchOwnedSealedMessages: installOwnedSealedRelayFetch(client, [
        {
          id: 'relay-opk',
          senderIdentityId: 'remote-identity',
          recipientIdentityId: 'local-identity',
          conversationId: 'conversation-1',
          encryptedData: {
            metadata: { messageId: 'inner-message-opk' },
          },
          status: 'pending',
          serverSequence: 48,
          createdAt: Date.now(),
          expiresAt: Date.now() + 60_000,
        },
      ]),
      fetchBundle: vi.fn(async () => ({ bundle: null })),
      deleteMessage: vi.fn(async () => {}),
      fetchMessageStatuses: vi.fn(async () => []),
    }

    ;(client as any).bundleServer = bundleServer
    ;(client as any).identity = { id: 'local-identity' }
    ;(client as any).privateBundle = {}
    ;(client as any).flushPendingRelayDeletions = vi.fn(async () => {})
    ;(client as any).processControlMessages = vi.fn(async () => {})
    ;(client as any).scheduleRelayDeletion = vi.fn()
    client.receiveMessage = vi.fn(async () => {
      throw new Error('One-time pre-key 1507 not found')
    })
    client.requestMessageRetry = vi.fn(async () => ({ ok: true }))
    client.requestBundleRefresh = vi.fn(async () => ({ ok: true }))

    localChatStorage.getPublicKeyBundle.mockResolvedValue(createRemoteBundle())
    localChatStorage.getConversationByParticipants.mockResolvedValue({
      id: 'conversation-1',
    })

    const result = await client.fetchPendingMessages()

    expect(client.requestMessageRetry).toHaveBeenCalledWith('inner-message-opk', 'remote-identity')
    expect(client.requestBundleRefresh).not.toHaveBeenCalled()
    expect((client as any).scheduleRelayDeletion).toHaveBeenCalledWith('relay-opk', 0)
    expect(result).toEqual(
      expect.objectContaining({
        highestSeenSequence: 48,
        advanceSequence: 48,
        quarantinedCount: 1,
        blockedCount: 0,
      }),
    )
  })

  it('skips retry requests for hidden-control relays that fail terminal decryption', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})

    const bundleServer = {
      isAvailable: () => true,
      fetchOwnedSealedMessages: installOwnedSealedRelayFetch(client, [
        {
          id: 'relay-hidden-control',
          senderIdentityId: 'remote-identity',
          recipientIdentityId: 'local-identity',
          conversationId: 'conversation-1',
          messageKind: 'hidden_control',
          encryptedData: {
            metadata: { messageId: 'inner-hidden-control' },
          },
          status: 'pending',
          serverSequence: 49,
          createdAt: Date.now(),
          expiresAt: Date.now() + 60_000,
        },
      ]),
      fetchBundle: vi.fn(async () => ({ bundle: null })),
      deleteMessage: vi.fn(async () => {}),
      fetchMessageStatuses: vi.fn(async () => []),
    }

    ;(client as any).bundleServer = bundleServer
    ;(client as any).identity = { id: 'local-identity' }
    ;(client as any).privateBundle = {}
    ;(client as any).flushPendingRelayDeletions = vi.fn(async () => {})
    ;(client as any).processControlMessages = vi.fn(async () => {})
    ;(client as any).scheduleRelayDeletion = vi.fn()
    client.receiveMessage = vi.fn(async () => {
      throw new Error('Failed to decrypt message header - no valid header key found')
    })
    client.requestMessageRetry = vi.fn(async () => ({ ok: true }))

    localChatStorage.getPublicKeyBundle.mockResolvedValue(createRemoteBundle())
    localChatStorage.getConversationByParticipants.mockResolvedValue({
      id: 'conversation-1',
    })

    const result = await client.fetchPendingMessages()

    expect(client.requestMessageRetry).not.toHaveBeenCalled()
    expect((client as any).scheduleRelayDeletion).toHaveBeenCalledWith('relay-hidden-control', 0)
    expect(result).toEqual(
      expect.objectContaining({
        highestSeenSequence: 49,
        advanceSequence: 49,
        quarantinedCount: 1,
        blockedCount: 0,
      }),
    )
  })

  it('stores retry request bundles before re-establishing the session', async () => {
    const { QuantumChat } = await import('./chat')
    const sessionModule = await import('./session')
    const identityModule = await import('./identity')
    const client = new (QuantumChat as any)({})

    const identity = {
      id: 'local-identity',
      dilithiumPrivateKey: 'local-private-key',
    }
    const privateBundle = {}
    const localBundle = {
      identityId: 'local-identity',
      identityKey: 'local-identity-key',
      mlkemIdentityKey: 'local-mlkem-identity-key',
      dilithiumKey: 'local-public-bundle',
      signedPreKey: {
        signature: 'local-spk-sig',
        x25519PublicKey: 'local-spk-x25519',
        mlkemPublicKey: 'local-spk-mlkem',
        keyId: 7,
        timestamp: 123,
      },
      oneTimePreKeys: [
        { id: 1, mlkemPublicKey: 'mlkem-1', x25519PublicKey: 'x25519-1' },
        { id: 2, mlkemPublicKey: 'mlkem-2', x25519PublicKey: 'x25519-2' },
      ],
      version: 3,
      timestamp: 456,
      bundleSignature: 'bundle-sig',
    }
    const requesterBundle = createRemoteBundle()
    ;(client as any).identity = identity
    ;(client as any).privateBundle = privateBundle
    client.getPublicKeyBundle = vi.fn(async () => localBundle as any)

    const retryRequest = await client.signControlMessage({
      type: 'message_retry_request',
      referenceMessageId: 'original-message',
      referenceIdentityId: 'remote-identity',
      timestamp: 1_717_171_717_000,
      data: { bundle: requesterBundle },
    })
    const bundleServer = {
      isAvailable: () => true,
      fetchOwnedSealedControlMessages: installOwnedSealedControlFetch(client, [retryRequest]),
    }
    ;(client as any).sendControlMessageToRecipient = vi.fn(async () => {})

    ;(client as any).bundleServer = bundleServer

    localChatStorage.getMessage.mockResolvedValue({
      id: 'original-message',
      content: 'retry me',
      encryptedData: {
        metadata: {
          sequenceNumber: 12,
        },
      },
    })
    ;(sessionModule.establishSessionAsInitiator as any).mockResolvedValue({
      session: { id: 'session-1' },
    })
    ;(sessionModule.encryptSessionMessage as any).mockResolvedValue({
      ciphertext: 'ciphertext',
      metadata: { messageId: 'reencrypted-message' },
    })

    await (client as any).processControlMessages({ force: true })

    expect(identityModule.storeContactBundle).toHaveBeenCalledWith(requesterBundle)
    expect(
      (identityModule.storeContactBundle as any).mock.invocationCallOrder[0]
    ).toBeLessThan(
      (sessionModule.establishSessionAsInitiator as any).mock.invocationCallOrder[0]
    )
    expect(sessionModule.establishSessionAsInitiator).toHaveBeenCalledWith(
      identity,
      privateBundle,
      'remote-identity',
      { trackedIdentity: undefined }
    )
    expect((client as any).sendControlMessageToRecipient).toHaveBeenCalledWith(
      'remote-identity',
      expect.objectContaining({
        type: 'message_retry_response',
        referenceMessageId: 'original-message',
        data: expect.objectContaining({
          bundle: expect.objectContaining({
            dilithiumKey: 'local-public-bundle',
            oneTimePreKeys: [],
          }),
          encryptedMessage: expect.any(Object),
        }),
      })
    )
  })

  it('omits one-time prekeys from retry request control bundles', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})

    ;(client as any).identity = {
      id: 'local-identity',
      dilithiumPrivateKey: 'local-private-key',
    }
    client.getPublicKeyBundle = vi.fn(async () => ({
      identityId: 'local-identity',
      identityKey: 'local-identity-key',
      mlkemIdentityKey: 'local-mlkem-identity-key',
      dilithiumKey: 'local-public-bundle',
      signedPreKey: {
        signature: 'local-spk-sig',
        x25519PublicKey: 'local-spk-x25519',
        mlkemPublicKey: 'local-spk-mlkem',
        keyId: 7,
        timestamp: 123,
      },
      oneTimePreKeys: [
        { id: 1, mlkemPublicKey: 'mlkem-1', x25519PublicKey: 'x25519-1' },
        { id: 2, mlkemPublicKey: 'mlkem-2', x25519PublicKey: 'x25519-2' },
      ],
      version: 3,
      timestamp: 456,
      bundleSignature: 'bundle-sig',
    }) as any)

    const bundleServer = {
      isAvailable: () => true,
    }
    ;(client as any).bundleServer = bundleServer
    ;(client as any).sendControlMessageToRecipient = vi.fn(async () => {})

    await expect(client.requestMessageRetry('message-1', 'remote-identity')).resolves.toEqual({ ok: true })

    expect((client as any).sendControlMessageToRecipient).toHaveBeenCalledWith(
      'remote-identity',
      expect.objectContaining({
        type: 'message_retry_request',
        data: expect.objectContaining({
          bundle: expect.objectContaining({
            dilithiumKey: 'local-public-bundle',
            oneTimePreKeys: [],
          }),
        }),
      }),
    )
  })

  it('suppresses duplicate retry requests for repeated terminal relays within the backoff window', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})

    const bundleServer = {
      isAvailable: () => true,
      fetchOwnedSealedMessages: installOwnedSealedRelayFetch(client, [
        {
          id: 'relay-4',
          senderIdentityId: 'remote-identity',
          recipientIdentityId: 'local-identity',
          conversationId: 'conversation-1',
          encryptedData: {
            metadata: { messageId: 'inner-message-4' },
          },
          status: 'pending',
          serverSequence: 45,
          createdAt: Date.now(),
          expiresAt: Date.now() + 60_000,
        },
      ]),
      fetchBundle: vi.fn(async () => ({ bundle: null })),
      deleteMessage: vi.fn(async () => {}),
      fetchMessageStatuses: vi.fn(async () => []),
    }

    ;(client as any).bundleServer = bundleServer
    ;(client as any).identity = { id: 'local-identity' }
    ;(client as any).privateBundle = {}
    ;(client as any).flushPendingRelayDeletions = vi.fn(async () => {})
    ;(client as any).processControlMessages = vi.fn(async () => {})
    ;(client as any).scheduleRelayDeletion = vi.fn()
    client.receiveMessage = vi.fn(async () => {
      throw new SessionError('No session found for sender and message has no X3DH data')
    })
    client.requestMessageRetry = vi.fn(async () => ({ ok: true }))

    const undecryptableListener = vi.fn()
    client.on('message:undecryptable', undecryptableListener)

    localChatStorage.getPublicKeyBundle.mockResolvedValue(createRemoteBundle())
    localChatStorage.getConversationByParticipants.mockResolvedValue({ id: 'conversation-1' })

    await client.fetchPendingMessages()
    const secondResult = await client.fetchPendingMessages()

    expect(client.requestMessageRetry).toHaveBeenCalledTimes(1)
    expect((client as any).scheduleRelayDeletion).toHaveBeenCalledTimes(2)
    expect(undecryptableListener).toHaveBeenCalledTimes(1)
    expect(secondResult).toEqual(
      expect.objectContaining({
        advanceSequence: 45,
        quarantinedCount: 1,
        blockedCount: 0,
      }),
    )
  })

  it('persists retry-request suppression across client instances', async () => {
    const { QuantumChat } = await import('./chat')

    const createBundleServer = (client: any) => ({
      isAvailable: () => true,
      fetchOwnedSealedMessages: installOwnedSealedRelayFetch(client, [
        {
          id: 'relay-5',
          senderIdentityId: 'remote-identity',
          recipientIdentityId: 'local-identity',
          conversationId: 'conversation-1',
          encryptedData: {
            metadata: { messageId: 'inner-message-5' },
          },
          status: 'pending',
          serverSequence: 46,
          createdAt: Date.now(),
          expiresAt: Date.now() + 60_000,
        },
      ]),
      fetchBundle: vi.fn(async () => ({ bundle: null })),
      deleteMessage: vi.fn(async () => {}),
      fetchMessageStatuses: vi.fn(async () => []),
    })

    const firstClient = new (QuantumChat as any)({})
    const firstServer = createBundleServer(firstClient)
    ;(firstClient as any).bundleServer = firstServer
    ;(firstClient as any).identity = { id: 'local-identity' }
    ;(firstClient as any).privateBundle = {}
    ;(firstClient as any).flushPendingRelayDeletions = vi.fn(async () => {})
    ;(firstClient as any).processControlMessages = vi.fn(async () => {})
    ;(firstClient as any).scheduleRelayDeletion = vi.fn()
    firstClient.receiveMessage = vi.fn(async () => {
      throw new SessionError('No session found for sender and message has no X3DH data')
    })
    firstClient.requestMessageRetry = vi.fn(async () => ({ ok: true }))

    localChatStorage.getPublicKeyBundle.mockResolvedValue(createRemoteBundle())
    localChatStorage.getConversationByParticipants.mockResolvedValue({ id: 'conversation-1' })

    await firstClient.fetchPendingMessages()

    const secondClient = new (QuantumChat as any)({})
    const secondServer = createBundleServer(secondClient)
    ;(secondClient as any).bundleServer = secondServer
    ;(secondClient as any).identity = { id: 'local-identity' }
    ;(secondClient as any).privateBundle = {}
    ;(secondClient as any).flushPendingRelayDeletions = vi.fn(async () => {})
    ;(secondClient as any).processControlMessages = vi.fn(async () => {})
    ;(secondClient as any).scheduleRelayDeletion = vi.fn()
    secondClient.receiveMessage = vi.fn(async () => {
      throw new SessionError('No session found for sender and message has no X3DH data')
    })
    secondClient.requestMessageRetry = vi.fn(async () => ({ ok: true }))

    await secondClient.fetchPendingMessages()

    expect(firstClient.requestMessageRetry).toHaveBeenCalledTimes(1)
    expect(secondClient.requestMessageRetry).not.toHaveBeenCalled()
    expect((secondClient as any).scheduleRelayDeletion).toHaveBeenCalledWith('relay-5', 0)
  })

  it('retries again after the durable backoff window expires', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})

    const bundleServer = {
      isAvailable: () => true,
      fetchOwnedSealedMessages: installOwnedSealedRelayFetch(client, [
        {
          id: 'relay-6',
          senderIdentityId: 'remote-identity',
          recipientIdentityId: 'local-identity',
          conversationId: 'conversation-1',
          encryptedData: {
            metadata: { messageId: 'inner-message-6' },
          },
          status: 'pending',
          serverSequence: 47,
          createdAt: Date.now(),
          expiresAt: Date.now() + 60_000,
        },
      ]),
      fetchBundle: vi.fn(async () => ({ bundle: null })),
      deleteMessage: vi.fn(async () => {
        throw new Error('delete failed')
      }),
      fetchMessageStatuses: vi.fn(async () => []),
    }

    ;(client as any).bundleServer = bundleServer
    ;(client as any).identity = { id: 'local-identity' }
    ;(client as any).privateBundle = {}
    ;(client as any).flushPendingRelayDeletions = vi.fn(async () => {})
    ;(client as any).processControlMessages = vi.fn(async () => {})
    client.receiveMessage = vi.fn(async () => {
      throw new SessionError('No session found for sender and message has no X3DH data')
    })
    client.requestMessageRetry = vi.fn(async () => ({ ok: true }))

    const undecryptableListener = vi.fn()
    client.on('message:undecryptable', undecryptableListener)

    localChatStorage.getPublicKeyBundle.mockResolvedValue(createRemoteBundle())
    localChatStorage.getConversationByParticipants.mockResolvedValue({ id: 'conversation-1' })

    mockNow.mockReturnValue(1_717_171_717_000)
    await client.fetchPendingMessages()

    mockNow.mockReturnValue(1_717_171_717_000 + 16_000)
    await client.fetchPendingMessages()

    expect(client.requestMessageRetry).toHaveBeenCalledTimes(2)
    expect(undecryptableListener).toHaveBeenCalledTimes(2)
  })

  it('resolves retry-request ledger entries after processing a retry response', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})
    ;(client as any).identity = {
      id: 'local-identity',
      dilithiumPrivateKey: 'private-key',
    }

    await localChatStorage.storeRetryRequestRecord({
      key: 'remote-identity:original-message',
      messageId: 'original-message',
      senderIdentityId: 'remote-identity',
      relayMessageId: 'relay-7',
      attemptCount: 1,
      lastSeenAt: 1_717_171_717_000,
      lastAttemptAt: 1_717_171_717_000,
      lastRequestedAt: 1_717_171_717_000,
      status: 'pending',
    })

    const retryResponse = await client.signControlMessage({
      type: 'message_retry_response',
      referenceMessageId: 'original-message',
      referenceIdentityId: 'remote-identity',
      timestamp: 1_717_171_717_000,
      data: {
        encryptedMessage: {
          metadata: { messageId: 'original-message' },
        },
      },
    })

    ;(client as any).bundleServer = {
      isAvailable: () => true,
      fetchOwnedSealedControlMessages: installOwnedSealedControlFetch(client, [retryResponse]),
    }
    client.receiveMessage = vi.fn(async () => ({
      id: 'original-message',
      content: 'recovered',
    }))

    localChatStorage.getPublicKeyBundle.mockResolvedValue({ dilithiumKey: 'remote-dilithium-key' })
    localChatStorage.getConversationByParticipants.mockResolvedValue({ id: 'conversation-1' })

    await (client as any).processControlMessages({ force: true })

    await expect(localChatStorage.getRetryRequestRecord('remote-identity:original-message')).resolves.toEqual(
      expect.objectContaining({
        status: 'resolved',
        resolution: 'retry_response_received',
      }),
    )
  })

  it('ignores invalid bundled retry-response keys and still processes the encrypted retry', async () => {
    const { QuantumChat } = await import('./chat')
    const identityModule = await import('./identity')
    const client = new (QuantumChat as any)({})
    ;(client as any).identity = {
      id: 'local-identity',
      dilithiumPrivateKey: 'private-key',
    }

    const retryResponseBundle = createRemoteBundle()
    const retryResponse = await client.signControlMessage({
      type: 'message_retry_response',
      referenceMessageId: 'original-message',
      referenceIdentityId: 'remote-identity',
      timestamp: 1_717_171_717_000,
      data: {
        encryptedMessage: {
          metadata: { messageId: 'original-message' },
        },
        bundle: retryResponseBundle,
      },
    })

    ;(client as any).bundleServer = {
      isAvailable: () => true,
      fetchOwnedSealedControlMessages: installOwnedSealedControlFetch(client, [retryResponse]),
    }
    client.receiveMessage = vi.fn(async () => ({
      id: 'original-message',
      content: 'recovered',
    }))

    localChatStorage.getPublicKeyBundle.mockResolvedValue(createRemoteBundle())
    localChatStorage.getConversationByParticipants.mockResolvedValue({ id: 'conversation-1' })
    ;(identityModule.storeContactBundle as any).mockRejectedValueOnce(
      new Error('Invalid contact wallet authorization: Wallet authorization bundle signature mismatch'),
    )

    await (client as any).processControlMessages({ force: true })

    expect(client.receiveMessage).toHaveBeenCalledWith(
      'conversation-1',
      expect.objectContaining({ metadata: { messageId: 'original-message' } }),
      'remote-identity',
    )
  })

  it('rejects bundled retry responses without a stored verification key', async () => {
    const { QuantumChat } = await import('./chat')
    const identityModule = await import('./identity')
    const client = new (QuantumChat as any)({})
    ;(client as any).identity = {
      id: 'local-identity',
      dilithiumPrivateKey: 'private-key',
    }

    const retryResponseBundle = createRemoteBundle()

    const retryResponse = await client.signControlMessage({
      type: 'message_retry_response',
      referenceMessageId: 'original-message',
      referenceIdentityId: 'remote-identity',
      timestamp: 1_717_171_717_000,
      data: {
        encryptedMessage: {
          metadata: { messageId: 'original-message' },
        },
        bundle: retryResponseBundle,
      },
    })

    ;(client as any).bundleServer = {
      isAvailable: () => true,
      fetchOwnedSealedControlMessages: installOwnedSealedControlFetch(client, [retryResponse]),
    }
    const receiveMessage = vi.fn(async () => ({
      id: 'original-message',
      content: 'recovered',
    }))
    client.receiveMessage = receiveMessage

    localChatStorage.getPublicKeyBundle.mockResolvedValue(null)
    localChatStorage.getConversationByParticipants.mockResolvedValue({ id: 'conversation-1' })

    await (client as any).processControlMessages({ force: true })

    expect(identityModule.storeContactBundle).not.toHaveBeenCalledWith(retryResponseBundle)
    expect(receiveMessage).not.toHaveBeenCalled()
  })

  it('persists accepted control messages to suppress replay', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})
    ;(client as any).identity = {
      id: 'local-identity',
      dilithiumPrivateKey: 'private-key',
    }
    client.getPublicKeyBundle = vi.fn(async () => createRemoteBundle())

    const controlMessage = await client.signControlMessage({
      type: 'bundle_refresh_request',
      referenceIdentityId: 'remote-identity',
      timestamp: 1_717_171_717_000,
    })
    const sendControlMessageToRecipient = vi.fn(async () => undefined)
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      fetchOwnedSealedControlMessages: installOwnedSealedControlFetch(client, [controlMessage]),
    }
    ;(client as any).sendControlMessageToRecipient = sendControlMessageToRecipient

    localChatStorage.isMessageProcessed.mockImplementation(async (messageId: string) => (
      processedControlMessages.has(messageId)
    ))
    localChatStorage.getPublicKeyBundle.mockResolvedValue(createRemoteBundle())

    await (client as any).processControlMessages({ force: true })
    await (client as any).processControlMessages({ force: true })

    expect(localChatStorage.storeProcessedMessage).toHaveBeenCalledTimes(1)
    expect(sendControlMessageToRecipient).toHaveBeenCalledTimes(1)
  })

  it('does not persist unknown requester bundles or disclose a profile', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})
    ;(client as any).identity = {
      id: 'local-identity',
      dilithiumPrivateKey: 'private-key',
    }
    const controlMessage = {
      type: 'profile_sync_request',
      referenceIdentityId: 'unknown-identity',
      timestamp: 1_717_171_717_000,
      data: { bundle: createRemoteBundle({ identityId: 'unknown-identity' }) },
    }
    const requestedListener = vi.fn()
    client.on('profile:requested', requestedListener)
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      fetchOwnedSealedControlMessages: installOwnedSealedControlFetch(client, [controlMessage]),
    }
    ;(client as any).prepareProfileSyncRequestBundle = vi.fn(() => controlMessage.data.bundle)
    ;(client as any).getControlMessageVerificationKey = vi.fn(async () => 'dilithium-key')
    ;(client as any).verifyControlMessage = vi.fn(() => true)
    ;(client as any).storeControlBundleForIdentity = vi.fn()
    localChatStorage.getPublicKeyBundle.mockResolvedValue(null)

    await (client as any).processControlMessages({ force: true })

    expect((client as any).storeControlBundleForIdentity).not.toHaveBeenCalled()
    expect(requestedListener).not.toHaveBeenCalled()
    expect(localChatStorage.storeProcessedMessage).toHaveBeenCalledTimes(1)
  })

  it('retries a profile response when durable profile persistence is unavailable', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})
    ;(client as any).identity = {
      id: 'local-identity',
      dilithiumPrivateKey: 'private-key',
    }
    const controlMessage = await client.signControlMessage({
      type: 'profile_sync_response',
      referenceIdentityId: 'remote-identity',
      timestamp: 1_717_171_717_000,
      data: { profile: { revision: 1 } },
    })
    const persistenceHandler = vi.fn(async () => 'retry' as const)
    client.setProfileSyncResponseHandler(persistenceHandler)
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      fetchOwnedSealedControlMessages: installOwnedSealedControlFetch(client, [controlMessage]),
    }
    localChatStorage.getPublicKeyBundle.mockResolvedValue(createRemoteBundle())

    await (client as any).processControlMessages({ force: true })

    expect(persistenceHandler).toHaveBeenCalledWith('remote-identity', { revision: 1 })
    expect(localChatStorage.storeProcessedMessage).not.toHaveBeenCalled()

    client.setProfileSyncResponseHandler(vi.fn(async () => 'applied' as const))
    await (client as any).processControlMessages({ force: true })

    expect(localChatStorage.storeProcessedMessage).toHaveBeenCalledTimes(1)
  })

  it('prefers owned sealed control fetch over mailbox fan-out', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})
    const fetchOwnedSealedControlMessages = vi.fn(async () => [])
    ;(client as any).identity = {
      id: 'local-identity',
      identityPublicKey: 'local-identity-pub',
      mlkemPublicKey: 'local-mlkem-pub',
      dilithiumPublicKey: 'local-dilithium-pub',
      dilithiumPrivateKey: 'private-key',
    }
    ;(client as any).bundleServer = {
      isAvailable: () => true,
      fetchOwnedSealedControlMessages,
    }

    await (client as any).processControlMessages({ force: true })

    expect(fetchOwnedSealedControlMessages).toHaveBeenCalledTimes(1)
  })

  it('verifies bundle-bearing control messages after key reordering', async () => {
    const { QuantumChat } = await import('./chat')
    const client = new (QuantumChat as any)({})
    ;(client as any).identity = {
      dilithiumPrivateKey: 'private-key',
    }

    const signed = await client.signControlMessage({
      type: 'bundle_refresh_request',
      referenceIdentityId: 'local-identity',
      timestamp: 1_717_171_717_000,
      data: {
        bundle: {
          signedPreKey: {
            signature: 'sig',
            x25519PublicKey: 'x25519',
            mlkemPublicKey: 'mlkem',
            keyId: 7,
            timestamp: 123,
          },
          bundleSignature: 'bundle-sig',
          oneTimePreKeys: [
            { id: 2, mlkemPublicKey: 'mlkem-2', x25519PublicKey: 'x25519-2' },
            { x25519PublicKey: 'x25519-1', id: 1, mlkemPublicKey: 'mlkem-1' },
          ],
          identityKey: 'identity-key',
          dilithiumKey: 'dilithium-key',
          mlkemIdentityKey: 'mlkem-identity',
          version: 3,
          timestamp: 456,
        },
      },
    })

    const roundTripped = {
      ...signed,
      data: {
        bundle: {
          bundleSignature: 'bundle-sig',
          dilithiumKey: 'dilithium-key',
          identityKey: 'identity-key',
          mlkemIdentityKey: 'mlkem-identity',
          oneTimePreKeys: [
            { id: 2, mlkemPublicKey: 'mlkem-2', x25519PublicKey: 'x25519-2' },
            { id: 1, mlkemPublicKey: 'mlkem-1', x25519PublicKey: 'x25519-1' },
          ],
          signedPreKey: {
            keyId: 7,
            mlkemPublicKey: 'mlkem',
            signature: 'sig',
            timestamp: 123,
            x25519PublicKey: 'x25519',
          },
          timestamp: 456,
          version: 3,
        },
      },
    }

    await expect(client.verifyControlMessage(roundTripped, 'dilithium-key')).resolves.toBe(true)
    expect(signWithDilithiumAsync).toHaveBeenCalled()
    expect(verifyDilithiumSignature).toHaveBeenCalled()
  })

  it('does not emit bundle_stale for compact remote bundles that omit OPKs', async () => {
    const { QuantumChat } = await import('./chat')
    const x3dhModule = await import('../crypto/x3dh')
    const client = new (QuantumChat as any)({})
    const warningListener = vi.fn()

    client.on('security:warning', warningListener)
    ;(x3dhModule.bundleNeedsRefresh as any).mockReturnValue({
      needsRefresh: false,
      reason: undefined,
    })

    await primeExistingConversation(client, createRemoteBundle({ oneTimePreKeys: [] }))
    await client.getOrCreateConversation('remote-identity')

    expect(x3dhModule.bundleNeedsRefresh).toHaveBeenCalledWith(
      expect.objectContaining({ oneTimePreKeys: [] }),
      expect.objectContaining({
        minOTPKs: 0,
        rotationInterval: (client as any).securityConfig.signedPreKeyRotationInterval,
      }),
    )
    expect(warningListener).not.toHaveBeenCalled()
  })

  it('does not emit bundle_stale for remote bundles with a single allocated OPK', async () => {
    const { QuantumChat } = await import('./chat')
    const x3dhModule = await import('../crypto/x3dh')
    const client = new (QuantumChat as any)({})
    const warningListener = vi.fn()
    const allocatedBundle = createRemoteBundle({
      oneTimePreKeys: [
        { id: 1507, mlkemPublicKey: 'allocated-mlkem', x25519PublicKey: 'allocated-x25519' },
      ],
    })

    client.on('security:warning', warningListener)
    ;(x3dhModule.bundleNeedsRefresh as any).mockReturnValue({
      needsRefresh: false,
      reason: undefined,
    })

    await primeExistingConversation(client, allocatedBundle)
    await client.getOrCreateConversation('remote-identity')

    expect(x3dhModule.bundleNeedsRefresh).toHaveBeenCalledWith(
      expect.objectContaining({ oneTimePreKeys: allocatedBundle.oneTimePreKeys }),
      expect.objectContaining({
        minOTPKs: 0,
        rotationInterval: (client as any).securityConfig.signedPreKeyRotationInterval,
      }),
    )
    expect(warningListener).not.toHaveBeenCalled()
  })

  it('still emits bundle_stale for remote signed prekeys that need rotation', async () => {
    const { QuantumChat } = await import('./chat')
    const x3dhModule = await import('../crypto/x3dh')
    const client = new (QuantumChat as any)({})
    const warningListener = vi.fn()

    client.on('security:warning', warningListener)
    ;(x3dhModule.bundleNeedsRefresh as any).mockReturnValue({
      needsRefresh: true,
      reason: 'Signed pre-key due for rotation',
    })

    await primeExistingConversation(client, createRemoteBundle({ oneTimePreKeys: [] }))
    await client.getOrCreateConversation('remote-identity')

    expect(x3dhModule.bundleNeedsRefresh).toHaveBeenCalledWith(
      expect.objectContaining({ identityId: 'remote-identity' }),
      expect.objectContaining({
        minOTPKs: 0,
        rotationInterval: (client as any).securityConfig.signedPreKeyRotationInterval,
      }),
    )
    expect(warningListener).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'security:warning',
        data: expect.objectContaining({
          type: 'bundle_stale',
          details: 'Contact bundle may be stale: Signed pre-key due for rotation',
          severity: 'low',
          identityId: 'remote-identity',
        }),
      }),
    )
  })
})
