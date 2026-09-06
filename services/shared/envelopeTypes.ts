/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

/** Shared direct-chat envelope payloads. */

import type { DisappearingMessageTimer, OneTimeMessageKind, ReplyReference } from '@/lib/types'
import type { CryptoPaymentRequest, CryptoPaymentRequestUpdate } from './cryptoPaymentRequest'

export interface TextPayload {
  text: string
  replyTo?: ReplyReference
  disappearing?: DisappearingMessageTimer
}

export interface ViewOncePayload {
  kind: OneTimeMessageKind
  body: string
  replyTo?: ReplyReference
  disappearing?: DisappearingMessageTimer
}

export interface ReactionPayload {
  reaction: {
    targetMessageId: string
    emoji: string
  }
}

export interface DeletionPayload {
  deletionTarget: string
}

export interface ConversationDeletePayload {
  targetIdentityId: string
  issuedAt: number
}

export interface ScreenshotProtectionPayload {
  enabled: boolean
  updatedAt?: number
}

export interface ScreenshotTakenPayload {
  takenAt: number
}

export interface TorStatePayload {
  enabled: boolean
  updatedAt?: number
}

export interface ViewOnceConsumedPayload {
  targetMessageId: string
  consumedAt: number
}

export interface DisappearingTimerPayload {
  timer: DisappearingMessageTimer | null
  updatedAt: number
}

export interface BleRouteCapabilityPayload {
  capability: string
}

export interface DirectEnvelopePayloadMap {
  text: TextPayload
  view_once: ViewOncePayload
  crypto_payment_request: CryptoPaymentRequest
  crypto_payment_request_update: CryptoPaymentRequestUpdate
  reaction: ReactionPayload
  deletion: DeletionPayload
  conversation_delete: ConversationDeletePayload
  screenshot_protection: ScreenshotProtectionPayload
  screenshot_taken: ScreenshotTakenPayload
  tor_state: TorStatePayload
  view_once_consumed: ViewOnceConsumedPayload
  disappearing_timer: DisappearingTimerPayload
  ble_route_capability: BleRouteCapabilityPayload
}

export type DirectEnvelopeType = keyof DirectEnvelopePayloadMap

export type DirectEnvelope<T extends DirectEnvelopeType = DirectEnvelopeType> = Readonly<
  DirectEnvelopePayloadMap[T] & {
    v: 2
    type: T
  }
>

export type DirectMessageContent = string | DirectEnvelope

/** Create a typed v2 direct-chat envelope. */
export function createDirectEnvelope<T extends DirectEnvelopeType>(
  type: T,
  payload: DirectEnvelopePayloadMap[T],
): DirectEnvelope<T> {
  return Object.freeze({ ...payload, v: 2 as const, type }) as DirectEnvelope<T>
}

/** Serialize a typed v2 direct-chat envelope. */
export function serializeDirectEnvelope<T extends DirectEnvelopeType>(
  envelope: DirectEnvelope<T>,
): string {
  return JSON.stringify(envelope)
}

export function serializeDirectMessageContent(content: DirectMessageContent): string {
  return typeof content === 'string' ? content : serializeDirectEnvelope(content)
}

/** Build a serialized v2 direct-chat envelope. */
export function buildDirectEnvelope<T extends DirectEnvelopeType>(
  type: T,
  payload: DirectEnvelopePayloadMap[T],
): string {
  return serializeDirectEnvelope(createDirectEnvelope(type, payload))
}
