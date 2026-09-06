/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { CallType } from '@/lib/types'

export interface ParsedCallInvitation {
  sessionId: string
  callType: CallType
  encryptionKey: string
}

const CALL_INVITATION_REGEX = /^\[QCALL:([a-f0-9-]+):(voice|video):([A-Za-z0-9+/=]+)\]$/

export function createCallInvitationMessage(
  sessionId: string,
  callType: CallType,
  encryptionKey: string,
): string {
  return `[QCALL:${sessionId}:${callType}:${encryptionKey}]`
}

export function parseCallInvitation(content: string): ParsedCallInvitation | null {
  const match = content.match(CALL_INVITATION_REGEX)
  if (!match) return null

  return {
    sessionId: match[1],
    callType: match[2] as CallType,
    encryptionKey: match[3],
  }
}

export function isCallInvitation(content: string): boolean {
  return CALL_INVITATION_REGEX.test(content)
}

export function describeCallInvitation(
  content: string,
  direction: 'incoming' | 'outgoing',
): string | null {
  const invitation = parseCallInvitation(content)
  if (!invitation) return null

  const typeLabel = invitation.callType === 'video' ? 'video' : 'voice'
  const directionLabel = direction === 'outgoing' ? 'Outgoing' : 'Incoming'
  return `${directionLabel} ${typeLabel} call`
}
