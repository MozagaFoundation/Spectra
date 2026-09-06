/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { isRelayDeliveryToken } from './crypto/sealedEnvelope'
import {
  ChatError,
  type Message,
  type MessageStatus,
  type OutboundSealedRelayRecord,
  type RelayedMessage,
} from './types'

export type MessageLifecycleEvent =
  | 'queued'
  | 'relay_sent'
  | 'relay_delivered'
  | 'relay_read'
  | 'send_failed'

export type RelayReceiptStatus = Extract<RelayedMessage['status'], 'delivered' | 'read'>

export const DELIVERED_STATUS_SYNC_WINDOW_MS = 10 * 60 * 1_000

const STATUS_RANK: Record<MessageStatus | RelayedMessage['status'], number> = {
  pending: 0,
  expired: 0,
  failed: 0,
  sending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
}

const EVENT_STATUS: Record<MessageLifecycleEvent, MessageStatus> = {
  queued: 'sending',
  relay_sent: 'sent',
  relay_delivered: 'delivered',
  relay_read: 'read',
  send_failed: 'failed',
}

export function compareMessageStatus(
  left: MessageStatus | RelayedMessage['status'] | undefined,
  right: MessageStatus | RelayedMessage['status'] | undefined,
): number {
  return (STATUS_RANK[left ?? 'pending'] ?? 0) - (STATUS_RANK[right ?? 'pending'] ?? 0)
}

export function nextMessageStatus(
  current: MessageStatus,
  event: MessageLifecycleEvent,
): MessageStatus {
  const next = EVENT_STATUS[event]
  if (event === 'send_failed') {
    return current === 'sending' ? 'failed' : current
  }
  return compareMessageStatus(next, current) > 0 ? next : current
}

export function applyRelayReceipt(
  message: Message,
  receipt: { status: RelayReceiptStatus },
): MessageStatus {
  return nextMessageStatus(
    message.status,
    receipt.status === 'read' ? 'relay_read' : 'relay_delivered',
  )
}

export function stageRelayDeliveryOutbox(
  message: Message,
  record: OutboundSealedRelayRecord,
  timestamp = Date.now(),
): { message: Message; record: OutboundSealedRelayRecord } {
  const deliveryToken = record.deliveryToken
  if (!isRelayDeliveryToken(deliveryToken)) {
    throw new ChatError('Relay delivery token is invalid', 'INVALID_RELAY_TOKEN')
  }

  const stagedRecord = message.relayDeliveryOutbox?.record ?? record
  if (
    message.relayDeliveryToken
    && message.relayDeliveryToken !== deliveryToken
  ) {
    throw new ChatError('Relay delivery token cannot be replaced', 'INVALID_STATE')
  }
  if (stagedRecord.deliveryToken !== deliveryToken) {
    throw new ChatError('Relay outbox token is inconsistent', 'INVALID_STATE')
  }

  return {
    record: stagedRecord,
    message: {
      ...message,
      relayDeliveryToken: deliveryToken,
      relayDeliveryOutbox: {
        record: stagedRecord,
        attemptCount: (message.relayDeliveryOutbox?.attemptCount ?? 0) + 1,
        createdAt: message.relayDeliveryOutbox?.createdAt ?? timestamp,
        lastAttemptAt: timestamp,
      },
    },
  }
}

export function completeRelayDeliveryOutbox(
  message: Message,
  relayMessageId: string,
  relayDeliveryToken?: string,
): Message {
  const expectedToken = message.relayDeliveryToken
    ?? message.relayDeliveryOutbox?.record.deliveryToken
  if (
    expectedToken
    && relayDeliveryToken
    && expectedToken !== relayDeliveryToken
  ) {
    throw new ChatError('Relay delivery token cannot be replaced', 'INVALID_STATE')
  }
  if (message.relayMessageId && message.relayMessageId !== relayMessageId) {
    throw new ChatError('Relay message link cannot be replaced', 'INVALID_STATE')
  }
  if (
    message.relayMessageId === relayMessageId
    && !message.relayDeliveryOutbox
    && (relayDeliveryToken === undefined || expectedToken === relayDeliveryToken)
  ) {
    return message
  }

  const completed = {
    ...message,
    relayMessageId,
    ...(relayDeliveryToken !== undefined ? { relayDeliveryToken } : {}),
  }
  delete completed.relayDeliveryOutbox
  return completed
}

export function hasPendingRelayDelivery(
  message: Pick<Message, 'senderIdentityId' | 'relayMessageId' | 'relayDeliveryOutbox'> | null | undefined,
  senderIdentityId: string,
): boolean {
  return Boolean(
    message
    && message.senderIdentityId === senderIdentityId
    && !message.relayMessageId
    && message.relayDeliveryOutbox?.record.deliveryToken,
  )
}

export function shouldSyncOutboundStatus(
  message: Pick<Message, 'senderIdentityId' | 'relayMessageId' | 'status' | 'deliveredAt'> | null | undefined,
  senderIdentityId: string,
  nowMs = Date.now(),
  deliveredStatusSyncWindowMs = DELIVERED_STATUS_SYNC_WINDOW_MS,
): boolean {
  if (!message || message.senderIdentityId !== senderIdentityId || !message.relayMessageId) {
    return false
  }
  if (message.status === 'sending' || message.status === 'sent') return true
  if (message.status !== 'delivered' || typeof message.deliveredAt !== 'number') return false
  return nowMs - message.deliveredAt <= deliveredStatusSyncWindowMs
}
