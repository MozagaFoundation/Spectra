/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

export const REALTIME_SUBSCRIBER_ID_MAX_LENGTH = 128
export const REALTIME_SUBSCRIBER_ID_PATTERN = /^[^\s:\0]{1,128}$/

export type RealtimeSubscriberScope =
  | 'call'
  | 'chat-mailbox'
  | 'chat-primary'
  | 'chat-receipt'

let subscriberSequence = 0

export function isValidRealtimeSubscriberId(value: unknown): value is string {
  return typeof value === 'string' && REALTIME_SUBSCRIBER_ID_PATTERN.test(value)
}

export function normalizeRealtimeSubscriberId(value: string): string {
  const normalized = value
    .replace(/[\s:\0]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  return (normalized || 'realtime').slice(0, REALTIME_SUBSCRIBER_ID_MAX_LENGTH)
}

export function createRealtimeSubscriberId(scope: RealtimeSubscriberScope): string {
  subscriberSequence = subscriberSequence >= Number.MAX_SAFE_INTEGER
    ? 1
    : subscriberSequence + 1

  const nonce = [
    Date.now().toString(36),
    subscriberSequence.toString(36),
    Math.floor(Math.random() * 0x1_0000_0000).toString(36).padStart(7, '0'),
  ].join('-')
  const normalizedScope = normalizeRealtimeSubscriberId(scope)
  const scopeLength = REALTIME_SUBSCRIBER_ID_MAX_LENGTH - nonce.length - 1
  const subscriberId = `${normalizedScope.slice(0, scopeLength)}-${nonce}`

  if (!isValidRealtimeSubscriberId(subscriberId)) {
    throw new Error('Failed to create a valid realtime subscriber ID')
  }
  return subscriberId
}
