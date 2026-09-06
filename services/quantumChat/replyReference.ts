/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { ChatMessage } from '@/lib/types'

export function normalizeReplyReference(
  replyTo: ChatMessage['replyTo'],
  remoteDisplayName?: string,
  localIdentityId?: string | null,
): ChatMessage['replyTo'] {
  if (!replyTo) {
    return undefined
  }

  let senderName = replyTo.senderName

  if (replyTo.senderId === localIdentityId) {
    senderName = 'You'
  } else if (remoteDisplayName) {
    senderName = remoteDisplayName
  } else if (senderName === 'You' && replyTo.senderId) {
    senderName = `User ${replyTo.senderId.slice(0, 8)}`
  }

  if (senderName === replyTo.senderName) {
    return replyTo
  }

  return {
    ...replyTo,
    senderName,
  }
}
