/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const localChatStorage = {
  isMessageProcessed: vi.fn(),
  getPublicKeyBundle: vi.fn(),
  getAllSessions: vi.fn(),
  storeSession: vi.fn(),
  getSessionRecord: vi.fn(),
  storeSessionRecord: vi.fn(),
  storePublicKeyBundle: vi.fn(),
  storePrivateKeyBundle: vi.fn(),
  storeProcessedMessage: vi.fn(),
}

const x3dhResponder = vi.fn()
const consumeOneTimePreKey = vi.fn()
const replenishOneTimePreKeys = vi.fn()
const ratchetEncrypt = vi.fn()
const ratchetDecrypt = vi.fn()
const initSessionAsResponder = vi.fn()

vi.mock('../storage/local', () => ({
  localChatStorage,
}))

vi.mock('../crypto/x3dh', () => ({
  x3dhInitiator: vi.fn(),
  x3dhResponder,
  X3DHInitiatorResult: vi.fn(),
  consumeOneTimePreKey,
  replenishOneTimePreKeys,
}))

vi.mock('../crypto/ratchet', () => ({
  initSessionAsInitiator: vi.fn(),
  initSessionAsResponder,
  ratchetEncrypt,
  ratchetDecrypt,
  canSend: vi.fn(() => true),
  canReceive: vi.fn(() => true),
  needsReestablishment: vi.fn(() => false),
  securelyDeleteSessionState: vi.fn(),
  cleanupExpiredKeys: vi.fn(),
}))

vi.mock('../crypto/utils', () => ({
  generateUUID: vi.fn(() => 'session-1'),
  createMessageHash: vi.fn(() => 'hash'),
  now: vi.fn(() => 1_717_171_717_000),
  isTimestampValid: vi.fn(() => true),
  generateRandomInt: vi.fn(() => 1),
  bytesToBase64: vi.fn(() => 'associated-data-b64'),
  base64ToBytes: vi.fn(() => new Uint8Array([9, 9, 9])),
  constantTimeBase64Equal: vi.fn((a: string, b: string) => a === b),
}))

vi.mock('../crypto/x25519', () => ({
  deriveX25519PublicKey: vi.fn(() => 'derived-previous-spk-public'),
}))

describe('session bootstrap behavior', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    localChatStorage.isMessageProcessed.mockResolvedValue(false)
    localChatStorage.getSessionRecord.mockResolvedValue(null)
    localChatStorage.getAllSessions.mockResolvedValue([])
    localChatStorage.storeSession.mockResolvedValue(undefined)
    localChatStorage.storeSessionRecord.mockResolvedValue(undefined)
    localChatStorage.storePublicKeyBundle.mockResolvedValue(undefined)
    localChatStorage.storePrivateKeyBundle.mockResolvedValue(undefined)
    localChatStorage.storeProcessedMessage.mockResolvedValue(undefined)
    replenishOneTimePreKeys.mockImplementation((bundle, privateBundle) => ({
      bundle,
      privateBundle,
    }))
  })

  it('rolls back responder bootstrap persistence when first decrypt fails', async () => {
    const { establishSessionAndDecrypt, getX3DHBootstrapFailureDetails } = await import('./session')

    localChatStorage.getPublicKeyBundle.mockImplementation(async (identityId: string) => (
      identityId === 'local-identity'
        ? {
            mlkemIdentityKey: 'mlkem-id',
            signedPreKey: { id: 1, x25519PublicKey: 'signed-pre-public' },
            oneTimePreKeys: [{ id: 1507 }],
          }
        : {
            identityId: 'remote-identity',
            identityKey: 'remote-identity-pub',
            dilithiumKey: 'remote-dilithium-pub',
          }
    ))
    x3dhResponder.mockReturnValue({
      sharedSecret: new Uint8Array([1, 2, 3]),
      sessionFingerprint: 'fingerprint-1',
      associatedData: new Uint8Array([4, 5, 6]),
    })
    initSessionAsResponder.mockReturnValue({
      receivedFirstMessage: false,
      receivingHeaderKey: new Uint8Array([1]),
      receivingChainKey: { key: new Uint8Array([2]), index: 0 },
    })
    ratchetDecrypt.mockImplementation(() => {
      throw new Error('Failed to decrypt message header - no valid header key found')
    })

    let thrown: unknown
    try {
      await establishSessionAndDecrypt(
        {
          id: 'local-identity',
          identityPublicKey: 'local-identity-pub',
          dilithiumPublicKey: 'local-dilithium-pub',
        } as any,
        {
          identityPrivateKey: 'local-identity-priv',
          signedPreKeyPrivate: 'signed-pre-priv',
          mlkemSignedPreKeyPrivate: 'mlkem-signed-pre-priv',
          oneTimePreKeyPrivates: [{ id: 1507 }],
          mlkemOneTimePreKeyPrivates: [{ id: 1507 }],
        } as any,
        {
          header: { sessionFingerprint: 'fingerprint-1' },
          metadata: {
            messageId: 'message-1',
            senderId: 'remote-identity',
            recipientId: 'local-identity',
            sessionId: 'session-remote',
            sequenceNumber: 0,
            timestamp: 1_717_171_717_000,
          },
          x3dhData: {
            initiatorIdentityKey: 'remote-identity-pub',
            ephemeralKey: 'remote-ephemeral',
            mlkemCiphertext: 'mlkem-cipher',
            usedOneTimePreKeyId: 1507,
            usedSignedPreKeyId: 1,
            initiatorDilithiumKey: 'remote-dilithium-pub',
            bundleTimestamp: 1775765052200,
          },
          ciphertext: 'cipher',
          nonce: 'nonce',
          tag: 'tag',
          signature: 'signature',
          version: 1,
        } as any,
        'remote-identity',
      )
    } catch (error) {
      thrown = error
    }

    expect(localChatStorage.storeSession).not.toHaveBeenCalled()
    expect(localChatStorage.storeSessionRecord).not.toHaveBeenCalled()
    expect(localChatStorage.storePublicKeyBundle).not.toHaveBeenCalled()
    expect(localChatStorage.storePrivateKeyBundle).not.toHaveBeenCalled()
    expect(localChatStorage.storeProcessedMessage).not.toHaveBeenCalled()
    expect(consumeOneTimePreKey).not.toHaveBeenCalled()
    expect(getX3DHBootstrapFailureDetails(thrown)).toEqual({
      code: 'X3DH_BOOTSTRAP_FAILED',
      reason: 'responder_decrypt',
      usedOneTimePreKeyId: 1507,
      bundleTimestamp: 1775765052200,
      sessionFingerprint: 'fingerprint-1',
    })
  })

  it('stages updated responder bundles for the inbound commit', async () => {
    const { establishSessionAndDecrypt } = await import('./session')

    localChatStorage.getPublicKeyBundle.mockImplementation(async (identityId: string) => (
      identityId === 'local-identity'
        ? {
            mlkemIdentityKey: 'mlkem-id',
            signedPreKey: { id: 1, x25519PublicKey: 'signed-pre-public' },
            oneTimePreKeys: Array.from({ length: 25 }, (_, index) => ({ id: 1500 + index })),
          }
        : {
            identityId: 'remote-identity',
            identityKey: 'remote-identity-pub',
            dilithiumKey: 'remote-dilithium-pub',
          }
    ))
    x3dhResponder.mockReturnValue({
      sharedSecret: new Uint8Array([1, 2, 3]),
      sessionFingerprint: 'fingerprint-1',
      associatedData: new Uint8Array([4, 5, 6]),
    })
    initSessionAsResponder.mockReturnValue({
      receivedFirstMessage: false,
      receivingHeaderKey: new Uint8Array([1]),
      receivingChainKey: { key: new Uint8Array([2]), index: 0 },
    })
    ratchetDecrypt.mockReturnValue('hello')

    const refreshedPrivateBundle = {
      identityPrivateKey: 'local-identity-priv',
      signedPreKeyPrivate: 'signed-pre-priv',
      mlkemSignedPreKeyPrivate: 'mlkem-signed-pre-priv',
      oneTimePreKeyPrivates: [{ id: 1508 }],
      mlkemOneTimePreKeyPrivates: [{ id: 1508 }],
    }
    consumeOneTimePreKey.mockReturnValue({
      bundle: {
        mlkemIdentityKey: 'mlkem-id',
        signedPreKey: { id: 1, x25519PublicKey: 'signed-pre-public' },
        oneTimePreKeys: Array.from({ length: 25 }, (_, index) => ({ id: 1600 + index })),
      },
      privateBundle: refreshedPrivateBundle,
    })
    const authenticatedSenderBundle = {
      identityId: 'remote-identity',
      identityKey: 'remote-identity-pub',
      dilithiumKey: 'remote-dilithium-pub',
    }

    const result = await establishSessionAndDecrypt(
      {
        id: 'local-identity',
        identityPublicKey: 'local-identity-pub',
        dilithiumPublicKey: 'local-dilithium-pub',
      } as any,
      {
        identityPrivateKey: 'local-identity-priv',
        signedPreKeyPrivate: 'signed-pre-priv',
        mlkemSignedPreKeyPrivate: 'mlkem-signed-pre-priv',
        oneTimePreKeyPrivates: [{ id: 1507 }],
        mlkemOneTimePreKeyPrivates: [{ id: 1507 }],
      } as any,
      {
        header: { sessionFingerprint: 'fingerprint-1' },
        metadata: {
          messageId: 'message-2',
          senderId: 'remote-identity',
          recipientId: 'local-identity',
          sessionId: 'session-remote',
          sequenceNumber: 0,
          timestamp: 1_717_171_717_000,
        },
        x3dhData: {
          initiatorIdentityKey: 'remote-identity-pub',
          ephemeralKey: 'remote-ephemeral',
          mlkemCiphertext: 'mlkem-cipher',
          usedOneTimePreKeyId: 1507,
          usedSignedPreKeyId: 1,
          initiatorDilithiumKey: 'remote-dilithium-pub',
          bundleTimestamp: 1775765052200,
        },
        ciphertext: 'cipher',
        nonce: 'nonce',
        tag: 'tag',
        signature: 'signature',
        version: 1,
      } as any,
      'remote-identity',
      authenticatedSenderBundle as any,
    )

    expect(result.privateBundle).toBe(refreshedPrivateBundle)
    expect(result.publicBundle).toEqual({
      mlkemIdentityKey: 'mlkem-id',
      signedPreKey: { id: 1, x25519PublicKey: 'signed-pre-public' },
      oneTimePreKeys: Array.from({ length: 25 }, (_, index) => ({ id: 1600 + index })),
    })
    expect(localChatStorage.storePrivateKeyBundle).not.toHaveBeenCalled()
    expect(localChatStorage.storePublicKeyBundle).not.toHaveBeenCalled()
    expect(localChatStorage.getPublicKeyBundle).not.toHaveBeenCalledWith('remote-identity')
  })

  it('initializes responder ratchet with the retained signed prekey used by X3DH', async () => {
    const { establishSessionAndDecrypt } = await import('./session')

    localChatStorage.getPublicKeyBundle.mockImplementation(async (identityId: string) => (
      identityId === 'local-identity'
        ? {
            mlkemIdentityKey: 'mlkem-id',
            signedPreKey: { id: 2, x25519PublicKey: 'current-spk-public' },
            oneTimePreKeys: [],
          }
        : {
            identityId: 'remote-identity',
            identityKey: 'remote-identity-pub',
            dilithiumKey: 'remote-dilithium-pub',
          }
    ))
    x3dhResponder.mockReturnValue({
      sharedSecret: new Uint8Array([1, 2, 3]),
      sessionFingerprint: 'fingerprint-previous-spk',
      associatedData: new Uint8Array([4, 5, 6]),
    })
    initSessionAsResponder.mockReturnValue({
      receivedFirstMessage: false,
      receivingHeaderKey: new Uint8Array([1]),
      receivingChainKey: { key: new Uint8Array([2]), index: 0 },
    })
    ratchetDecrypt.mockReturnValue('hello')

    await establishSessionAndDecrypt(
      {
        id: 'local-identity',
        identityPublicKey: 'local-identity-pub',
        dilithiumPublicKey: 'local-dilithium-pub',
      } as any,
      {
        identityPrivateKey: 'local-identity-priv',
        signedPreKeyPrivate: 'current-spk-private',
        mlkemSignedPreKeyPrivate: 'current-mlkem-spk-private',
        oneTimePreKeyPrivates: new Map(),
        mlkemOneTimePreKeyPrivates: new Map(),
        previousSignedPreKeys: [{
          id: 1,
          x25519Private: 'previous-spk-private',
          mlkemPrivate: 'previous-mlkem-spk-private',
          expiresAt: 1_717_171_717_001,
        }],
      } as any,
      {
        header: { sessionFingerprint: 'fingerprint-previous-spk' },
        metadata: {
          messageId: 'message-previous-spk',
          senderId: 'remote-identity',
          recipientId: 'local-identity',
          sessionId: 'session-remote',
          sequenceNumber: 0,
          timestamp: 1_717_171_717_000,
        },
        x3dhData: {
          initiatorIdentityKey: 'remote-identity-pub',
          ephemeralKey: 'remote-ephemeral',
          mlkemCiphertext: 'mlkem-cipher',
          usedSignedPreKeyId: 1,
          initiatorDilithiumKey: 'remote-dilithium-pub',
        },
        ciphertext: 'cipher',
        nonce: 'nonce',
        tag: 'tag',
        signature: 'signature',
        version: 1,
      } as any,
      'remote-identity',
    )

    expect(initSessionAsResponder).toHaveBeenCalledWith(
      new Uint8Array([1, 2, 3]),
      {
        publicKey: 'derived-previous-spk-public',
        privateKey: 'previous-spk-private',
      },
      'remote-ephemeral',
    )
  })

  it('does not auto-promote an archived fallback session', async () => {
    const { decryptWithSessionFallback } = await import('./session')

    const activeSession = {
      id: 'session-active',
      localIdentityId: 'local-identity',
      remoteIdentityId: 'remote-identity',
      status: 'active',
      baseKeyFingerprint: 'active-fingerprint',
      boundIdentityKey: 'remote-identity-pub',
      boundDilithiumKey: 'remote-dilithium-pub',
      createdAt: 100,
      updatedAt: 100,
      lastMessageAt: 100,
      unansweredMessages: 0,
      state: {
        receivedMessageCount: 0,
      },
    }
    const archivedSession = {
      id: 'session-archived',
      localIdentityId: 'local-identity',
      remoteIdentityId: 'remote-identity',
      status: 'archived',
      baseKeyFingerprint: 'archived-fingerprint',
      boundIdentityKey: 'remote-identity-pub',
      boundDilithiumKey: 'remote-dilithium-pub',
      createdAt: 200,
      updatedAt: 200,
      lastMessageAt: 200,
      unansweredMessages: 0,
      state: {
        receivedMessageCount: 0,
      },
    }

    localChatStorage.getAllSessions.mockResolvedValue([activeSession, archivedSession])
    ratchetDecrypt
      .mockImplementationOnce(() => {
        throw new Error('Failed to decrypt message header - no valid header key found')
      })
      .mockImplementationOnce(() => 'hello from archived session')

    const result = await decryptWithSessionFallback(
      'remote-identity',
      {
        header: { sessionFingerprint: 'missing-fingerprint' },
        metadata: {
          messageId: 'message-fallback',
          senderId: 'remote-identity',
          recipientId: 'local-identity',
          sessionId: 'session-remote',
          sequenceNumber: 12,
          timestamp: 1_717_171_717_000,
        },
        ciphertext: 'cipher',
        nonce: 'nonce',
        tag: 'tag',
        signature: 'signature',
        version: 1,
      } as any,
      'remote-dilithium-pub',
    )

    expect(result.usedFallback).toBe(true)
    expect(result.session.id).toBe('session-archived')
    expect(result.sessionPromotable).toBe(true)
    expect(localChatStorage.storeSessionRecord).not.toHaveBeenCalled()
  })

  it('attaches bootstrap x3dh data only to the first unanswered message', async () => {
    const { encryptSessionMessage } = await import('./session')

    ratchetEncrypt.mockImplementation(() => ({
      metadata: {
        messageId: 'message-1',
      },
      ciphertext: 'cipher',
      nonce: 'nonce',
      tag: 'tag',
      signature: 'signature',
      version: 1,
    }))

    const firstMessage = await encryptSessionMessage(
      {
        id: 'session-1',
        localIdentityId: 'local-identity',
        remoteIdentityId: 'remote-identity',
        state: {
          sentMessageCount: 0,
        },
        pendingX3DHData: {
          ephemeralKey: 'ephemeral',
        },
        unansweredMessages: 0,
      } as any,
      'hello',
      'local-dilithium-private',
      0,
      undefined,
    )

    expect(firstMessage.x3dhData).toEqual({ ephemeralKey: 'ephemeral' })

    const laterMessage = await encryptSessionMessage(
      {
        id: 'session-1',
        localIdentityId: 'local-identity',
        remoteIdentityId: 'remote-identity',
        state: {
          sentMessageCount: 1,
        },
        pendingX3DHData: {
          ephemeralKey: 'ephemeral',
        },
        unansweredMessages: 1,
      } as any,
      'hello again',
      'local-dilithium-private',
      1,
      undefined,
    )

    expect(laterMessage.x3dhData).toBeUndefined()
  })

  it('can defer advanced ratchet persistence to an outbound commit', async () => {
    const { prepareSessionMessage } = await import('./session')
    ratchetEncrypt.mockReturnValue({
      metadata: { messageId: 'message-deferred' },
      ciphertext: 'cipher',
      nonce: 'nonce',
      tag: 'tag',
      signature: 'signature',
      version: 1,
    })
    const session = {
      id: 'session-deferred',
      localIdentityId: 'local-identity',
      remoteIdentityId: 'remote-identity',
      state: { sentMessageCount: 0 },
      unansweredMessages: 0,
    } as any

    const encrypted = await prepareSessionMessage(
      session,
      'deferred',
      'local-dilithium-private',
      0,
    )

    expect(encrypted.metadata.messageId).toBe('message-deferred')
    expect(session.unansweredMessages).toBe(1)
    expect(localChatStorage.storeSession).not.toHaveBeenCalled()
  })
})
