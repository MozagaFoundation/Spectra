/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { ChatContact, ChatMessage } from '@/lib/types'

export function isDirectSenderBlocked(
  senderIdentityId: string,
  contacts: Pick<ChatContact, 'identityId' | 'trustState'>[],
): boolean {
  return contacts.some(
    (contact) => contact.identityId === senderIdentityId && contact.trustState === 'blocked',
  )
}

export function canDeleteDirectMessageForEveryone(
  targetMessageId: string,
  senderIdentityId: string | null | undefined,
  messages: Pick<ChatMessage, 'id' | 'senderId'>[],
): boolean {
  if (!senderIdentityId) {
    return false
  }

  const target = messages.find((message) => message.id === targetMessageId)
  return target?.senderId === senderIdentityId
}
