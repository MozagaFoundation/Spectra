/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'
import type { Message } from '../types'
import {
  applyRelayReceipt,
  compareMessageStatus,
  completeRelayDeliveryOutbox,
  hasPendingRelayDelivery,
  nextMessageStatus,
  shouldSyncOutboundStatus,
  stageRelayDeliveryOutbox,
} from './messageLifecycle'

const baseMessage: Message = {
  id: 'message-1',
  conversationId: 'conversation-1',
  senderId: 'alice',
  senderIdentityId: 'alice',
  recipientIdentityId: 'bob',
  relayMessageId: 'relay-1',
  encryptedData: {
    header: {
      ratchetKey: 'ratchet',
      messageNumber: 1,
      previousChainLength: 0,
      sessionFingerprint: 'session',
    },
    ciphertext: 'ciphertext',
    nonce: 'nonce',
    tag: 'tag',
    signature: 'signature',
    metadata: {
      messageId: 'message-1',
      senderId: 'alice',
      recipientId: 'bob',
      sessionId: 'session',
      timestamp: 1,
      sequenceNumber: 1,
    },
    version: 1,
  },
  status: 'sent',
  createdAt: 1,
}

describe('messageLifecycle', () => {
  it('orders status transitions monotonically', () => {
    expect(compareMessageStatus('sent', 'sending')).toBeGreaterThan(0)
    expect(compareMessageStatus('delivered', 'sent')).toBeGreaterThan(0)
    expect(compareMessageStatus('read', 'delivered')).toBeGreaterThan(0)
  })

  it('does not regress from read to delivered or sent', () => {
    expect(nextMessageStatus('read', 'relay_delivered')).toBe('read')
    expect(nextMessageStatus('read', 'relay_sent')).toBe('read')
    expect(applyRelayReceipt({ ...baseMessage, status: 'read' }, { status: 'delivered' })).toBe('read')
  })

  it('applies relay receipts as canonical local status', () => {
    expect(applyRelayReceipt({ ...baseMessage, status: 'sent' }, { status: 'delivered' })).toBe('delivered')
    expect(applyRelayReceipt({ ...baseMessage, status: 'delivered' }, { status: 'read' })).toBe('read')
  })

  it('tracks only outbound messages that can still advance', () => {
    expect(shouldSyncOutboundStatus(baseMessage, 'alice')).toBe(true)
    expect(shouldSyncOutboundStatus({ ...baseMessage, status: 'delivered' }, 'alice', 20, 10)).toBe(false)
    expect(shouldSyncOutboundStatus({ ...baseMessage, status: 'delivered', deliveredAt: 15 }, 'alice', 20, 10)).toBe(true)
    expect(shouldSyncOutboundStatus({ ...baseMessage, status: 'delivered', deliveredAt: 1 }, 'alice', 20, 10)).toBe(false)
    expect(shouldSyncOutboundStatus({ ...baseMessage, status: 'read' }, 'alice')).toBe(false)
    expect(shouldSyncOutboundStatus({ ...baseMessage, relayMessageId: undefined }, 'alice')).toBe(false)
    expect(shouldSyncOutboundStatus(baseMessage, 'bob')).toBe(false)
  })

  it('stages one durable sealed relay record before submission', () => {
    const deliveryToken = `sdv1.${'A'.repeat(43)}=`
    const record = {
      recipientMailboxToken: 'smbx1.recipient',
      deliveryToken,
      deliveryClass: 'message' as const,
      sealedEnvelope: {
        version: 1 as const,
        type: 'message' as const,
        senderEphemeralKey: 'ephemeral',
        mlkemCiphertext: 'kem',
        ciphertext: 'ciphertext',
        nonce: 'nonce',
        tag: 'tag',
      },
    }

    const staged = stageRelayDeliveryOutbox(baseMessage, record, 10)

    expect(staged.message).toEqual(expect.objectContaining({
      relayDeliveryToken: deliveryToken,
      relayDeliveryOutbox: {
        record,
        attemptCount: 1,
        createdAt: 10,
        lastAttemptAt: 10,
      },
    }))
  })

  it('links relay acknowledgement and clears its outbox in one transition', () => {
    const deliveryToken = `sdv1.${'A'.repeat(43)}=`
    const staged = {
      ...baseMessage,
      relayMessageId: undefined,
      relayDeliveryToken: deliveryToken,
      relayDeliveryOutbox: {
        record: {
          recipientMailboxToken: 'smbx1.recipient',
          deliveryToken,
          deliveryClass: 'message' as const,
          sealedEnvelope: {
            version: 1 as const,
            type: 'message' as const,
            senderEphemeralKey: 'ephemeral',
            mlkemCiphertext: 'kem',
            ciphertext: 'ciphertext',
            nonce: 'nonce',
            tag: 'tag',
          },
        },
        attemptCount: 1,
        createdAt: 10,
        lastAttemptAt: 10,
      },
    }

    const completed = completeRelayDeliveryOutbox(staged, 'relay-accepted', deliveryToken)

    expect(completed).toEqual(expect.objectContaining({
      relayMessageId: 'relay-accepted',
      relayDeliveryToken: deliveryToken,
    }))
    expect(completed).not.toHaveProperty('relayDeliveryOutbox')
    expect(() => completeRelayDeliveryOutbox(
      staged,
      'relay-accepted',
      `sdv1.${'B'.repeat(43)}=`,
    )).toThrow('Relay delivery token cannot be replaced')
  })

  it('selects only unacknowledged outbox records owned by the sender', () => {
    const pending = {
      ...baseMessage,
      relayMessageId: undefined,
      relayDeliveryOutbox: {
        record: {
          recipientMailboxToken: 'smbx1.recipient',
          deliveryToken: `sdv1.${'A'.repeat(43)}=`,
          deliveryClass: 'message' as const,
          sealedEnvelope: {
            version: 1 as const,
            type: 'message' as const,
            senderEphemeralKey: 'ephemeral',
            mlkemCiphertext: 'kem',
            ciphertext: 'ciphertext',
            nonce: 'nonce',
            tag: 'tag',
          },
        },
        attemptCount: 1,
        createdAt: 10,
        lastAttemptAt: 10,
      },
    }

    expect(hasPendingRelayDelivery(pending, 'alice')).toBe(true)
    expect(hasPendingRelayDelivery(pending, 'bob')).toBe(false)
    expect(hasPendingRelayDelivery({ ...pending, relayMessageId: 'relay-1' }, 'alice')).toBe(false)
  })
})
