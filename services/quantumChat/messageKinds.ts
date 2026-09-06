/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { isCallInvitation } from '../shared/callInvitationFormat'
import type { ParsedEnvelope } from './envelopes'

type DirectMessageKind = 'text' | 'view_once' | 'call_invitation' | 'hidden_control'

const HIDDEN_CONTROL_ENVELOPE_TYPES = new Set([
  'reaction',
  'deletion',
  'conversation_delete',
  'view_once_consumed',
  'disappearing_timer',
  'crypto_payment_request_update',
  'group_sender_key_distribution',
  'group_sender_key_request',
  'group_ciphertext',
  'screenshot_protection',
  'tor_state',
  'group_tor_state',
  'ble_route_capability',
])

export function isHiddenControlEnvelopeType(type: string): boolean {
  return HIDDEN_CONTROL_ENVELOPE_TYPES.has(type)
}

export function classifyDirectMessageKind(
  content: string,
  envelope?: ParsedEnvelope,
): DirectMessageKind {
  if (isCallInvitation(content)) {
    return 'call_invitation'
  }

  if (envelope) {
    if (envelope.type === 'view_once') {
      return 'view_once'
    }
    return envelope.type === 'hidden_control' || isHiddenControlEnvelopeType(envelope.type)
      ? 'hidden_control'
      : 'text'
  }

  if (!content.startsWith('{')) {
    return 'text'
  }

  try {
    const parsed = JSON.parse(content)
    if (parsed?.v === 2 && parsed?.type === 'view_once') {
      return 'view_once'
    }
    if (parsed?.v === 2 && typeof parsed.type === 'string' && isHiddenControlEnvelopeType(parsed.type)) {
      return 'hidden_control'
    }
  } catch {
    // Malformed content is regular text.
  }

  return 'text'
}
