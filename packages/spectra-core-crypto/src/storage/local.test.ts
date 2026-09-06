/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EncryptedMessage, Message, Session } from '../types'
import { makeIdentityMaterial, tamperBase64 } from '../__tests__/helpers/cryptoTestHelpers'

class FakeLocalStorage {
  data = new Map<string, string>()
  writesUntilFailure: number | null = null

  get length(): number {
    return this.data.size
  }

  key(index: number): string | null {
    return Array.from(this.data.keys())[index] ?? null
  }

  getItem(key: string): string | null {
    return this.data.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    if (this.writesUntilFailure !== null) {
      if (this.writesUntilFailure === 0) {
        throw new Error('simulated localStorage interruption')
      }
      this.writesUntilFailure -= 1
    }
    this.data.set(key, value)
  }

  removeItem(key: string): void {
    this.data.delete(key)
  }

  clear(): void {
    this.data.clear()
  }
}

const encryptedMessage: EncryptedMessage = {
  header: {
    ratchetKey: 'ratchet',
    messageNumber: 0,
    previousChainLength: 0,
  },
  ciphertext: 'ciphertext',
  nonce: 'nonce',
  tag: 'tag',
  signature: 'signature',
  metadata: {
    messageId: 'message-1',
    senderId: 'alice',
    recipientId: 'bob',
    sessionId: 'session-1',
    timestamp: 1_717_171_717_000,
    sequenceNumber: 0,
  },
  version: 3,
}

function makeSession(): Session {
  return {
    id: 'session-1',
    localIdentityId: 'alice',
    remoteIdentityId: 'bob',
    remoteDeviceId: 'default',
    state: {
      remoteRatchetKey: 'remote-ratchet',
      localRatchetKeyPair: {
        publicKey: 'local-ratchet-public',
        privateKey: 'local-ratchet-private',
      },
      rootKey: new Uint8Array(32).fill(1),
      sendingChainKey: { key: new Uint8Array(32).fill(2), index: 0 },
      receivingChainKey: { key: new Uint8Array(32).fill(3), index: 0 },
      previousSendingChainLength: 0,
      skippedMessageKeys: new Map(),
      sentMessageCount: 0,
      receivedMessageCount: 0,
      receivedFirstMessage: false,
      createdAt: 1_717_171_717_000,
      lastActivityAt: 1_717_171_717_000,
      sendingHeaderKey: new Uint8Array(32).fill(4),
      receivingHeaderKey: new Uint8Array(32).fill(5),
      nextSendingHeaderKey: new Uint8Array(32).fill(6),
      nextReceivingHeaderKey: new Uint8Array(32).fill(7),
      previousReceivingHeaderKey: null,
    },
    status: 'active',
    baseKeyFingerprint: 'fingerprint',
    boundIdentityKey: 'identity-key',
    boundDilithiumKey: 'dilithium-key',
    createdAt: 1_717_171_717_000,
    updatedAt: 1_717_171_717_000,
    unansweredMessages: 0,
    maxUnansweredMessages: 100,
    isStale: false,
  }
}

async function loadStorageModule() {
  vi.resetModules()
  const fake = new FakeLocalStorage()
  vi.stubGlobal('localStorage', fake)
  vi.stubGlobal('indexedDB', undefined)
  const module = await import('./local')
  return { fake, module }
}

describe('local storage encryption at rest', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('encrypts identity private keys, private bundles, and session state when enabled', async () => {
    const { fake, module } = await loadStorageModule()
    const storage = module.createLocalStorage()
    const { identity, privateBundle } = makeIdentityMaterial('alice')

    module.initStorageEncryption(new Uint8Array(32).fill(9))
    await storage.storeIdentity(identity)
    await storage.storePrivateKeyBundle(identity.id, privateBundle)
    await storage.storeSession(makeSession())

    const persistedIdentity = fake.getItem(`quantum_chat_identity_${identity.id}`)!
    const persistedBundle = fake.getItem(`quantum_chat_private_bundle_${identity.id}`)!
    const persistedSession = fake.getItem('quantum_chat_session_session-1')!

    expect(persistedIdentity).not.toContain(identity.identityPrivateKey)
    expect(persistedIdentity).not.toContain(identity.mlkemPrivateKey)
    expect(persistedIdentity).not.toContain(identity.dilithiumPrivateKey)
    expect(persistedBundle).not.toContain(privateBundle.signedPreKeyPrivate)
    expect(persistedSession).not.toContain('local-ratchet-private')
  })

  it('rejects tampered encrypted private-key payloads', async () => {
    const { fake, module } = await loadStorageModule()
    const storage = module.createLocalStorage()
    const { identity } = makeIdentityMaterial('alice')

    module.initStorageEncryption(new Uint8Array(32).fill(9))
    await storage.storeIdentity(identity)

    const key = `quantum_chat_identity_${identity.id}`
    const persisted = JSON.parse(fake.getItem(key)!)
    const encryptedPrivate = JSON.parse(persisted.identityPrivateKey)
    persisted.identityPrivateKey = JSON.stringify({
      ...encryptedPrivate,
      c: tamperBase64(encryptedPrivate.c),
    })
    fake.setItem(key, JSON.stringify(persisted))

    await expect(storage.getIdentity(identity.id)).rejects.toThrow()
  })

  it('fails to decrypt password-protected storage with the wrong password', async () => {
    const { module } = await loadStorageModule()
    const storage = module.createLocalStorage()
    const { identity } = makeIdentityMaterial('alice')

    module.initStorageEncryptionFromPassword('correct horse battery staple')
    await storage.storeIdentity(identity)
    module.disableStorageEncryption()
    module.initStorageEncryptionFromPassword('wrong password')

    await expect(storage.getIdentity(identity.id)).rejects.toThrow()
  })

  it('encrypts local message, decrypted cache, conversation, and public bundle payloads', async () => {
    const { fake, module } = await loadStorageModule()
    const storage = module.createLocalStorage()
    const { identity, bundle } = makeIdentityMaterial('bob')
    module.initStorageEncryption(new Uint8Array(32).fill(9))

    const message: Message = {
      id: 'message-1',
      conversationId: 'conversation-1',
      senderId: 'alice',
      senderIdentityId: 'alice',
      recipientIdentityId: 'bob',
      encryptedData: encryptedMessage,
      content: 'plaintext body',
      status: 'sent',
      createdAt: 1_717_171_717_000,
    }
    await storage.storeMessage(message)
    await storage.storeDecryptedMessage({
      id: 'message-1',
      conversationId: 'conversation-1',
      senderId: 'alice',
      content: 'plaintext body',
      timestamp: 1_717_171_717_000,
      signatureVerified: true,
    })
    await storage.storeConversation({
      id: 'conversation-1',
      localIdentityId: 'alice',
      remoteIdentityId: identity.id,
      sessionRecordId: 'session-record-1',
      lastMessage: {
        content: 'plaintext preview',
        timestamp: 1_717_171_717_000,
        senderId: 'alice',
      },
      unreadCount: 0,
      createdAt: 1_717_171_717_000,
      updatedAt: 1_717_171_717_000,
      expectedSequenceNumber: 0,
      outgoingSequenceNumber: 0,
    })
    await storage.storePublicKeyBundle(identity.id, bundle)

    expect(fake.getItem('quantum_chat_message_message-1')).not.toContain('plaintext body')
    expect(fake.getItem('quantum_chat_decrypted_message-1')).not.toContain('plaintext body')
    expect(fake.getItem('quantum_chat_conversation_conversation-1')).not.toContain('plaintext preview')
    expect(fake.getItem(`quantum_chat_public_bundle_${identity.id}`)).not.toContain(bundle.identityKey)

    await expect(storage.getMessage('message-1')).resolves.toMatchObject({ content: 'plaintext body' })
    await expect(storage.getDecryptedMessage('message-1')).resolves.toMatchObject({ content: 'plaintext body' })
    await expect(storage.getConversation('conversation-1')).resolves.toMatchObject({
      lastMessage: { content: 'plaintext preview' },
    })
    await expect(storage.getPublicKeyBundle(identity.id)).resolves.toMatchObject({ identityKey: bundle.identityKey })
  })

  it('stores versioned KDF metadata and migrates legacy salt-only metadata', async () => {
    const { fake, module } = await loadStorageModule()
    const legacySalt = Buffer.from(new Uint8Array(32).fill(4)).toString('base64')
    fake.setItem('quantum_chat_encryption_salt', legacySalt)

    module.initStorageEncryptionFromPassword('password')

    const metadata = module.getStorageKdfMetadata()
    expect(metadata).toMatchObject({
      version: 1,
      algorithm: 'PBKDF2-HMAC-SHA256',
      salt: legacySalt,
      iterations: 100000,
    })
    expect(fake.getItem('quantum_chat_encryption_metadata')).toContain('PBKDF2-HMAC-SHA256')
  })

  it('recovers a partially applied outbound commit journal', async () => {
    const { fake, module } = await loadStorageModule()
    const storage = module.createLocalStorage()
    module.initStorageEncryption(new Uint8Array(32).fill(9))
    await storage.storeConversation({
      id: 'conversation-commit',
      localIdentityId: 'alice',
      remoteIdentityId: 'bob',
      sessionRecordId: 'session-record-1',
      unreadCount: 0,
      createdAt: 1,
      updatedAt: 1,
      expectedSequenceNumber: 0,
      outgoingSequenceNumber: 0,
    })
    const session = makeSession()
    const message: Message = {
      id: 'message-commit',
      conversationId: 'conversation-commit',
      senderId: 'alice',
      senderIdentityId: 'alice',
      recipientIdentityId: 'bob',
      encryptedData: {
        ...encryptedMessage,
        metadata: {
          ...encryptedMessage.metadata,
          messageId: 'message-commit',
        },
      },
      content: 'journal-private-body',
      relayDeliveryToken: 'journal-delivery-capability',
      status: 'sent',
      createdAt: 2,
    }

    fake.writesUntilFailure = 2
    await expect(storage.commitOutboundMessage({
      session,
      message,
      conversationUpdate: { outgoingSequenceNumber: 1 },
    })).rejects.toThrow('simulated localStorage interruption')

    const wal = fake.getItem('quantum_chat_outbound_commit_message-commit')
    expect(wal).not.toContain('journal-private-body')
    expect(wal).not.toContain('journal-delivery-capability')

    fake.writesUntilFailure = null
    await expect(storage.getMessage('message-commit')).resolves.toMatchObject({
      content: 'journal-private-body',
      relayDeliveryToken: 'journal-delivery-capability',
    })
    await expect(storage.getSession(session.id)).resolves.toMatchObject({
      id: session.id,
    })
    await expect(storage.getConversation('conversation-commit')).resolves.toMatchObject({
      outgoingSequenceNumber: 1,
    })
    expect(fake.getItem('quantum_chat_outbound_commit_message-commit')).toBeNull()
  })

  it('clear removes package data and disables encryption', async () => {
    const { fake, module } = await loadStorageModule()
    const storage = module.createLocalStorage()
    module.initStorageEncryption(new Uint8Array(32).fill(9))
    fake.setItem('quantum_chat_extra', 'value')

    await storage.clear()

    expect(fake.getItem('quantum_chat_extra')).toBeNull()
    expect(module.isStorageEncryptionEnabled()).toBe(false)
  })

  it('keeps relay mailbox cursors isolated by identity', async () => {
    const { module } = await loadStorageModule()
    const storage = module.createLocalStorage()
    const alice = 'c932044b-d196-4540-965b-db103792d956'
    const bob = 'ab061755-09d5-41a3-812a-5f67bce6e872'

    await storage.storeRelayMailboxCursor(alice, 2025)
    await storage.storeRelayMailboxCursor(bob, 9)

    expect(await storage.getRelayMailboxCursor(alice)).toBe(2025)
    expect(await storage.getRelayMailboxCursor(bob)).toBe(9)
    expect(module.parseRelayMailboxCursor({ sequence: 2025 })).toBe(2025)
    expect(module.parseRelayMailboxCursor(-1)).toBe(0)
    expect(module.parseRelayMailboxCursor(Number.NaN)).toBe(0)

    await storage.storeRelayMailboxCursor(alice, 0)
    expect(await storage.getRelayMailboxCursor(alice)).toBe(0)
  })

  it('keeps relay sender bundle attach state isolated by identity pair', async () => {
    const { module } = await loadStorageModule()
    const storage = module.createLocalStorage()
    const alice = 'c932044b-d196-4540-965b-db103792d956'
    const bob = 'ab061755-09d5-41a3-812a-5f67bce6e872'
    const carol = 'f1c0a3e8-2d4b-4f1a-9c7e-6b8d0a1e2f34'

    await storage.storeRelaySenderBundleAttachState(alice, bob, {
      fingerprint: 'fp-bob',
      attachedAt: 1_717_171_717_000,
    })
    await storage.storeRelaySenderBundleAttachState(alice, carol, {
      fingerprint: 'fp-carol',
      attachedAt: 1_717_171_800_000,
    })

    expect(await storage.getRelaySenderBundleAttachState(alice, bob)).toEqual({
      fingerprint: 'fp-bob',
      attachedAt: 1_717_171_717_000,
    })
    expect(await storage.getRelaySenderBundleAttachState(alice, carol)).toEqual({
      fingerprint: 'fp-carol',
      attachedAt: 1_717_171_800_000,
    })
    expect(await storage.getRelaySenderBundleAttachState(bob, alice)).toBeNull()
    expect(module.parseRelaySenderBundleAttachState({
      fingerprint: 'fp-bob',
      attachedAt: 1_717_171_717_000,
    })).toEqual({
      fingerprint: 'fp-bob',
      attachedAt: 1_717_171_717_000,
    })
    expect(module.parseRelaySenderBundleAttachState({ fingerprint: '', attachedAt: 1 })).toBeNull()
    expect(module.parseRelaySenderBundleAttachState({ fingerprint: 'fp', attachedAt: -1 })).toBeNull()
  })
})
