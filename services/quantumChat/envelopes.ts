/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type {
  ChatMessage,
  DisappearingMessageTimer,
  OneTimeMessageKind,
} from '@/lib/types'
import { normalizeDisappearingTimer } from '@/lib/disappearingMessages'
import { isHiddenControlEnvelopeType } from './messageKinds'
import { isOneTimeKind } from '@/lib/viewOnce'
import {
  getCryptoPaymentRequestDisplayText,
  parseCryptoPaymentRequest,
  parseCryptoPaymentRequestUpdate,
  type CryptoPaymentRequest,
  type CryptoPaymentRequestUpdate,
} from '../shared/cryptoPaymentRequest'

interface ParsedTextEnvelope {
  type: 'text'
  text: string
  replyTo?: ChatMessage['replyTo']
  disappearing?: DisappearingMessageTimer
}

interface ParsedReactionEnvelope {
  type: 'reaction'
  targetMessageId: string
  emoji: string
}

interface ParsedViewOnceEnvelope {
  type: 'view_once'
  kind: OneTimeMessageKind
  body: string
  replyTo?: ChatMessage['replyTo']
  disappearing?: DisappearingMessageTimer
}

interface ParsedDeletionEnvelope {
  type: 'deletion'
  deletionTarget: string
}

interface ParsedCryptoPaymentRequestEnvelope {
  type: 'crypto_payment_request'
  request: CryptoPaymentRequest
}

interface ParsedCryptoPaymentRequestUpdateEnvelope {
  type: 'crypto_payment_request_update'
  update: CryptoPaymentRequestUpdate
}

interface ParsedConversationDeleteEnvelope {
  type: 'conversation_delete'
  targetIdentityId: string
  issuedAt: number
}

interface ParsedScreenshotProtectionEnvelope {
  type: 'screenshot_protection'
  enabled: boolean
  updatedAt?: number
}

export const SCREENSHOT_TAKEN_NOTICE_TEXT = 'Screenshot taken'

interface ParsedScreenshotTakenEnvelope {
  type: 'screenshot_taken'
  takenAt: number
}

interface ParsedTorStateEnvelope {
  type: 'tor_state'
  enabled: boolean
  updatedAt?: number
}

interface ParsedViewOnceConsumedEnvelope {
  type: 'view_once_consumed'
  targetMessageId: string
  consumedAt: number
}

interface ParsedDisappearingTimerEnvelope {
  type: 'disappearing_timer'
  timer: DisappearingMessageTimer | null
  updatedAt: number
}

interface ParsedBleRouteCapabilityEnvelope {
  type: 'ble_route_capability'
  capability: string
}

interface ParsedHiddenControlEnvelope {
  type: 'hidden_control'
  raw: Record<string, unknown>
}

interface ParsedPlainEnvelope {
  type: 'plain'
  text: string
}

export type ParsedEnvelope =
  | ParsedTextEnvelope
  | ParsedViewOnceEnvelope
  | ParsedCryptoPaymentRequestEnvelope
  | ParsedCryptoPaymentRequestUpdateEnvelope
  | ParsedReactionEnvelope
  | ParsedDeletionEnvelope
  | ParsedConversationDeleteEnvelope
  | ParsedScreenshotProtectionEnvelope
  | ParsedScreenshotTakenEnvelope
  | ParsedTorStateEnvelope
  | ParsedViewOnceConsumedEnvelope
  | ParsedDisappearingTimerEnvelope
  | ParsedBleRouteCapabilityEnvelope
  | ParsedHiddenControlEnvelope
  | ParsedPlainEnvelope

/**
 * Parses a direct-chat envelope or plain text.
 */
export function parseDirectEnvelope(content: string): ParsedEnvelope {
  if (!content.startsWith('{')) {
    return { type: 'plain', text: content }
  }

  try {
    const parsed = JSON.parse(content)
    if (parsed.v !== 2 || !parsed.type) {
      return { type: 'plain', text: content }
    }

    switch (parsed.type) {
      case 'text':
        {
          const disappearing = normalizeDisappearingTimer(parsed.disappearing ?? null) ?? undefined
        return {
          type: 'text',
          text: parsed.text || '',
          replyTo: parsed.replyTo,
          disappearing,
        }
        }

      case 'view_once':
        if (isOneTimeKind(parsed.kind) && typeof parsed.body === 'string') {
          const disappearing = normalizeDisappearingTimer(parsed.disappearing ?? null) ?? undefined
          return {
            type: 'view_once',
            kind: parsed.kind,
            body: parsed.body,
            replyTo: parsed.replyTo,
            disappearing,
          }
        }
        return { type: 'plain', text: content }

      case 'crypto_payment_request':
        {
          const request = parseCryptoPaymentRequest(content)
          return request ? { type: 'crypto_payment_request', request } : { type: 'plain', text: content }
        }

      case 'crypto_payment_request_update':
        {
          const update = parseCryptoPaymentRequestUpdate(content)
          return update ? { type: 'crypto_payment_request_update', update } : { type: 'hidden_control', raw: parsed }
        }

      case 'reaction':
        if (parsed.reaction?.targetMessageId && parsed.reaction?.emoji) {
          return {
            type: 'reaction',
            targetMessageId: parsed.reaction.targetMessageId,
            emoji: parsed.reaction.emoji,
          }
        }
        return { type: 'hidden_control', raw: parsed }

      case 'deletion':
        if (parsed.deletionTarget) {
          return {
            type: 'deletion',
            deletionTarget: parsed.deletionTarget,
          }
        }
        return { type: 'hidden_control', raw: parsed }

      case 'conversation_delete':
        if (
          typeof parsed.targetIdentityId === 'string'
          && parsed.targetIdentityId.length > 0
          && typeof parsed.issuedAt === 'number'
        ) {
          return {
            type: 'conversation_delete',
            targetIdentityId: parsed.targetIdentityId,
            issuedAt: parsed.issuedAt,
          }
        }
        return { type: 'hidden_control', raw: parsed }

      case 'screenshot_protection':
        return {
          type: 'screenshot_protection',
          enabled: parsed.enabled === true,
          updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : undefined,
        }

      case 'screenshot_taken':
        if (typeof parsed.takenAt === 'number') {
          return {
            type: 'screenshot_taken',
            takenAt: parsed.takenAt,
          }
        }
        return { type: 'hidden_control', raw: parsed }

      case 'tor_state':
        return {
          type: 'tor_state',
          enabled: parsed.enabled === true,
          updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : undefined,
        }

      case 'view_once_consumed':
        if (
          typeof parsed.targetMessageId === 'string'
          && parsed.targetMessageId.length > 0
          && typeof parsed.consumedAt === 'number'
        ) {
          return {
            type: 'view_once_consumed',
            targetMessageId: parsed.targetMessageId,
            consumedAt: parsed.consumedAt,
          }
        }
        return { type: 'hidden_control', raw: parsed }

      case 'disappearing_timer':
        if (typeof parsed.updatedAt === 'number') {
          const timer = normalizeDisappearingTimer(parsed.timer ?? null)
          if (parsed.timer == null || timer) {
            return {
              type: 'disappearing_timer',
              timer,
              updatedAt: parsed.updatedAt,
            }
          }
        }
        return { type: 'hidden_control', raw: parsed }

      case 'ble_route_capability':
        if (
          typeof parsed.capability === 'string'
          && parsed.capability.length >= 100
          && parsed.capability.length <= 256
          && /^[A-Za-z0-9+/]+={0,2}$/.test(parsed.capability)
        ) {
          return {
            type: 'ble_route_capability',
            capability: parsed.capability,
          }
        }
        return { type: 'hidden_control', raw: parsed }

      default:
        if (isHiddenControlEnvelopeType(parsed.type)) {
          return { type: 'hidden_control', raw: parsed }
        }
        return { type: 'plain', text: content }
    }
  } catch {
    return { type: 'plain', text: content }
  }
}

/**
 * Gets visible text for previews and bubbles.
 */
export function getEnvelopeDisplayText(envelope: ParsedEnvelope): string | null {
  switch (envelope.type) {
    case 'text':
      return envelope.text
    case 'view_once':
      return envelope.body
    case 'crypto_payment_request':
      return getCryptoPaymentRequestDisplayText(envelope.request)
    case 'plain':
      return envelope.text
    case 'screenshot_taken':
      return SCREENSHOT_TAKEN_NOTICE_TEXT
    default:
      return null
  }
}

/**
 * Returns true for non-rendered control envelopes.
 */
export function isControlEnvelope(envelope: ParsedEnvelope): boolean {
  return (
    envelope.type !== 'text'
    && envelope.type !== 'view_once'
    && envelope.type !== 'crypto_payment_request'
    && envelope.type !== 'screenshot_taken'
    && envelope.type !== 'plain'
  )
}

/**
 * Returns visible text, or null for hidden control content.
 */
export function getVisibleText(content: string): string | null {
  const envelope = parseDirectEnvelope(content)
  if (isControlEnvelope(envelope)) return null
  return getEnvelopeDisplayText(envelope)
}
