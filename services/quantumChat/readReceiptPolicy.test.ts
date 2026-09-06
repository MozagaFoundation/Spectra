/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'

import {
  isIncomingDirectReadReceiptContentEligible,
  shouldSyncIncomingDirectReadReceipt,
  shouldSyncPersistedIncomingDirectReadReceipt,
} from './readReceiptPolicy'

describe('read receipt policy', () => {
  it('allows visible relay messages to sync read receipts immediately', () => {
    expect(shouldSyncIncomingDirectReadReceipt({
      relayMessageId: 'relay-1',
      content: 'hello',
    })).toBe(true)
    expect(isIncomingDirectReadReceiptContentEligible({
      content: 'hello',
    })).toBe(true)
    expect(shouldSyncPersistedIncomingDirectReadReceipt({
      relayMessageId: 'relay-1',
      content: 'hello',
      relayReadReceiptEligible: true,
    })).toBe(true)
  })

  it('skips messages that should not publish normal read receipts', () => {
    expect(shouldSyncIncomingDirectReadReceipt({
      content: 'hello',
    })).toBe(false)
    expect(shouldSyncIncomingDirectReadReceipt({
      relayMessageId: 'relay-1',
      content: 'hello',
    }, { isCallInvite: true })).toBe(false)
    expect(shouldSyncIncomingDirectReadReceipt({
      relayMessageId: 'relay-1',
      content: '[QCALL:offer]',
    })).toBe(false)
    expect(shouldSyncIncomingDirectReadReceipt({
      relayMessageId: 'relay-1',
      messageKind: 'view_once',
      oneTime: { state: 'locked' },
    })).toBe(false)
    expect(shouldSyncIncomingDirectReadReceipt({
      relayMessageId: 'relay-1',
      content: JSON.stringify({ v: 2, type: 'reaction' }),
    })).toBe(false)
    expect(isIncomingDirectReadReceiptContentEligible({
      messageKind: 'hidden_control',
    })).toBe(false)
    expect(isIncomingDirectReadReceiptContentEligible({
      messageKind: 'call_invitation',
    })).toBe(false)
    expect(shouldSyncPersistedIncomingDirectReadReceipt({
      relayMessageId: 'relay-private',
      content: 'private',
      relayReadReceiptEligible: false,
    })).toBe(false)
    expect(shouldSyncPersistedIncomingDirectReadReceipt({
      relayMessageId: 'relay-legacy',
      content: 'legacy',
    })).toBe(false)
  })
})
