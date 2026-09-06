/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'

import type { ControlMessage, EncryptedMessage } from '../types/index'
import { makeIdentityPair, tamperBase64 } from '../__tests__/helpers/cryptoTestHelpers'
import {
  SealedEnvelopeReplayCache,
  deriveRecipientMailboxToken,
  deriveScopedRecipientMailboxToken,
  deriveThreadToken,
  openControlEnvelope,
  openRelayEnvelope,
  sealControlEnvelope,
  sealRelayEnvelope,
} from './sealedEnvelope'

function makeEncryptedMessage(aliceId: string, bobId: string): EncryptedMessage {
  return {
    header: {
      ratchetKey: 'ratchet-key',
      messageNumber: 1,
      previousChainLength: 0,
    },
    ciphertext: 'ciphertext',
    tag: 'tag',
    nonce: 'nonce',
    signature: 'signature',
    metadata: {
      messageId: 'inner-message-1',
      senderId: aliceId,
      recipientId: bobId,
      sessionId: 'session-1',
      timestamp: 1_700_000_000_000,
      sequenceNumber: 1,
    },
    version: 3,
  }
}

describe('sealed relay envelopes', () => {
  it('hides relay metadata from the server-visible record and opens for the recipient', async () => {
    const { alice, bob } = makeIdentityPair()
    const encryptedMessage = makeEncryptedMessage(alice.identity.id, bob.identity.id)

    const sealed = await sealRelayEnvelope({
      sender: alice.identity,
      recipient: bob.identity,
      encryptedMessage,
      conversationId: 'conversation-1',
      messageKind: 'text',
      senderBundle: alice.bundle,
      timestamp: 1_700_000_000_001,
    })

    const serializedServerRecord = JSON.stringify(sealed)
    expect(sealed.pushNotificationEnabled).toBe(true)
    expect(serializedServerRecord).not.toContain(alice.identity.id)
    expect(serializedServerRecord).not.toContain('conversation-1')
    expect(serializedServerRecord).not.toContain('inner-message-1')
    expect(serializedServerRecord).not.toContain('session-1')
    expect(serializedServerRecord).not.toContain('"text"')
    expect(serializedServerRecord).not.toContain(alice.bundle.identityKey)

    const opened = await openRelayEnvelope({
      recipient: bob.identity,
      recipientMailboxToken: sealed.recipientMailboxToken,
      envelope: sealed.sealedEnvelope,
    })

    expect(opened.senderCredential.senderIdentityId).toBe(alice.identity.id)
    expect(opened.messageKind).toBe('text')
    expect(opened.threadToken).toBe(deriveThreadToken({
      conversationId: 'conversation-1',
      senderIdentityId: alice.identity.id,
      recipientIdentityId: bob.identity.id,
      sessionId: 'session-1',
    }))
    expect(opened.encryptedMessage).toEqual(encryptedMessage)
    expect(opened.senderBundle?.identityId).toBe(alice.identity.id)
  })

  it('keeps hidden-control sealed relays out of user-visible push', async () => {
    const { alice, bob } = makeIdentityPair()

    const sealed = await sealRelayEnvelope({
      sender: alice.identity,
      recipient: bob.identity,
      encryptedMessage: makeEncryptedMessage(alice.identity.id, bob.identity.id),
      conversationId: 'conversation-1',
      messageKind: 'hidden_control',
    })

    expect(sealed.deliveryClass).toBe('message')
    expect(sealed.pushNotificationEnabled).toBe(false)
    expect((await openRelayEnvelope({
      recipient: bob.identity,
      recipientMailboxToken: sealed.recipientMailboxToken,
      envelope: sealed.sealedEnvelope,
    })).messageKind).toBe('hidden_control')
  })

  it('reuses a validated delivery token without making ciphertext deterministic', async () => {
    const { alice, bob } = makeIdentityPair()
    const deliveryToken = `sdv1.${'A'.repeat(43)}=`
    const params = {
      sender: alice.identity,
      recipient: bob.identity,
      encryptedMessage: makeEncryptedMessage(alice.identity.id, bob.identity.id),
      conversationId: 'conversation-1',
      messageKind: 'text' as const,
      deliveryToken,
    }

    const first = await sealRelayEnvelope(params)
    const second = await sealRelayEnvelope(params)

    expect(first.deliveryToken).toBe(deliveryToken)
    expect(second.deliveryToken).toBe(deliveryToken)
    expect(first.sealedEnvelope.ciphertext).not.toBe(second.sealedEnvelope.ciphertext)
    await expect(sealRelayEnvelope({ ...params, deliveryToken: 'sdv1.invalid' }))
      .rejects.toThrow('Invalid relay delivery token')
  })

  it('derives and opens scoped mailbox tokens without changing the default token', async () => {
    const { alice, bob } = makeIdentityPair()
    const defaultToken = deriveRecipientMailboxToken(bob.bundle)
    const scopeSecret = new Uint8Array(32).fill(9)
    const scopedToken = deriveScopedRecipientMailboxToken({
      recipient: bob.bundle,
      scopeSecret,
      scopeId: 'direct:alice-bob',
      epoch: 0,
    })

    expect(scopedToken.startsWith('smbx2.')).toBe(true)
    expect(scopedToken).not.toBe(defaultToken)

    const sealed = await sealRelayEnvelope({
      sender: alice.identity,
      recipient: bob.bundle,
      encryptedMessage: makeEncryptedMessage(alice.identity.id, bob.identity.id),
      conversationId: 'conversation-1',
      recipientMailboxToken: scopedToken,
    })

    expect(sealed.recipientMailboxToken).toBe(scopedToken)
    expect((await openRelayEnvelope({
      recipient: bob.identity,
      recipientMailboxToken: scopedToken,
      envelope: sealed.sealedEnvelope,
    })).senderCredential.senderIdentityId).toBe(alice.identity.id)
    await expect(openRelayEnvelope({
      recipient: bob.identity,
      recipientMailboxToken: defaultToken,
      envelope: sealed.sealedEnvelope,
    })).rejects.toThrow()
    expect(() => deriveScopedRecipientMailboxToken({
      recipient: bob.bundle,
      scopeSecret: new Uint8Array(16),
      scopeId: 'direct:alice-bob',
    })).toThrow(/at least 32 bytes/)
  })

  it('derives identical scoped recipient tokens from recipient identity and bundle material', async () => {
    const { bob } = makeIdentityPair()
    const scopeSecret = new Uint8Array(32).fill(7)
    const scopeId = 'direct:agreed-scope'

    const tokenFromRecipientBundle = deriveScopedRecipientMailboxToken({
      recipient: bob.bundle,
      scopeSecret,
      scopeId,
      epoch: 2,
    })
    const tokenFromRecipientIdentity = deriveScopedRecipientMailboxToken({
      recipient: bob.identity,
      scopeSecret,
      scopeId,
      epoch: 2,
    })

    expect(tokenFromRecipientBundle).toBe(tokenFromRecipientIdentity)
  })

  it('rejects tampering, unsupported versions, and replayed envelope nonces', async () => {
    const { alice, bob } = makeIdentityPair()
    const sealed = await sealRelayEnvelope({
      sender: alice.identity,
      recipient: bob.identity,
      encryptedMessage: makeEncryptedMessage(alice.identity.id, bob.identity.id),
      conversationId: 'conversation-1',
    })

    await expect(openRelayEnvelope({
      recipient: bob.identity,
      recipientMailboxToken: sealed.recipientMailboxToken,
      envelope: {
        ...sealed.sealedEnvelope,
        ciphertext: tamperBase64(sealed.sealedEnvelope.ciphertext),
      },
    })).rejects.toThrow()

    await expect(openRelayEnvelope({
      recipient: bob.identity,
      recipientMailboxToken: sealed.recipientMailboxToken,
      envelope: {
        ...sealed.sealedEnvelope,
        version: 999,
      },
    })).rejects.toThrow(/not supported/)

    const replayCache = new SealedEnvelopeReplayCache()
    await expect(openRelayEnvelope({
      recipient: bob.identity,
      recipientMailboxToken: sealed.recipientMailboxToken,
      envelope: sealed.sealedEnvelope,
      replayCache,
    })).resolves.toBeTruthy()
    await expect(openRelayEnvelope({
      recipient: bob.identity,
      recipientMailboxToken: sealed.recipientMailboxToken,
      envelope: sealed.sealedEnvelope,
      replayCache,
    })).rejects.toThrow(/replay/i)
  })

  it('seals control messages without exposing reference metadata', async () => {
    const { alice, bob } = makeIdentityPair()
    const controlMessage: ControlMessage = {
      type: 'message_retry_request',
      referenceMessageId: 'inner-message-1',
      referenceIdentityId: alice.identity.id,
      timestamp: 1_700_000_000_000,
      data: { reason: 'retry' },
      signature: 'control-signature',
    }

    const sealed = await sealControlEnvelope({
      sender: alice.identity,
      recipient: bob.bundle,
      controlMessage,
    })

    const serializedServerRecord = JSON.stringify(sealed)
    expect(sealed.recipientMailboxToken).toBe(deriveRecipientMailboxToken(bob.bundle))
    expect(serializedServerRecord).not.toContain('message_retry_request')
    expect(serializedServerRecord).not.toContain('inner-message-1')
    expect(serializedServerRecord).not.toContain(alice.identity.id)

    const opened = await openControlEnvelope({
      recipient: bob.identity,
      recipientMailboxToken: sealed.recipientMailboxToken,
      envelope: sealed.sealedEnvelope,
    })

    expect(opened.controlMessage).toEqual(controlMessage)
    expect(opened.senderCredential.senderIdentityId).toBe(alice.identity.id)
  })
})
