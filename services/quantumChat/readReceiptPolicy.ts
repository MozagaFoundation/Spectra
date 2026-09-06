/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { Message as StoredMessage } from '@spectra/core-crypto'

export function isIncomingDirectReadReceiptContentEligible(
  message: Pick<StoredMessage, 'messageKind' | 'oneTime' | 'content'>,
  options: { isCallInvite?: boolean } = {},
): boolean {
  if (options.isCallInvite) {
    return false
  }
  if (
    message.messageKind === 'call_invitation'
    || message.messageKind === 'hidden_control'
  ) {
    return false
  }
  if (message.messageKind === 'view_once' && message.oneTime?.state === 'locked') {
    return false
  }

  const content = message.content
  if (!content) return true
  if (content.startsWith('[QCALL:')) return false
  if (!content.startsWith('{')) return true

  try {
    const parsed = JSON.parse(content) as { v?: unknown; type?: unknown }
    return !(parsed?.v === 2 && typeof parsed.type === 'string' && parsed.type !== 'text')
  } catch {
    return true
  }
}

export function shouldSyncIncomingDirectReadReceipt(
  message: Pick<StoredMessage, 'relayMessageId' | 'messageKind' | 'oneTime' | 'content'>,
  options: { isCallInvite?: boolean } = {},
): boolean {
  return Boolean(
    message.relayMessageId
    && isIncomingDirectReadReceiptContentEligible(message, options)
  )
}

export function shouldSyncPersistedIncomingDirectReadReceipt(
  message: Pick<
    StoredMessage,
    'relayMessageId' | 'messageKind' | 'oneTime' | 'content' | 'relayReadReceiptEligible'
  >,
  options: { isCallInvite?: boolean } = {},
): boolean {
  return (
    message.relayReadReceiptEligible === true
    && shouldSyncIncomingDirectReadReceipt(message, options)
  )
}
