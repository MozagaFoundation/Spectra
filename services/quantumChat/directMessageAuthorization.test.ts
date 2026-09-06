/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'

import {
  canDeleteDirectMessageForEveryone,
  isDirectSenderBlocked,
} from './directMessageAuthorization'
import type { ChatContact } from '@/lib/types'

describe('directMessageAuthorization', () => {
  it('allows delete-for-everyone only when the deleting identity authored the target', () => {
    const messages = [
      { id: 'message-own', senderId: 'identity-alice' },
      { id: 'message-peer', senderId: 'identity-bob' },
    ]

    expect(canDeleteDirectMessageForEveryone('message-own', 'identity-alice', messages)).toBe(true)
    expect(canDeleteDirectMessageForEveryone('message-peer', 'identity-alice', messages)).toBe(false)
    expect(canDeleteDirectMessageForEveryone('missing', 'identity-alice', messages)).toBe(false)
    expect(canDeleteDirectMessageForEveryone('message-own', null, messages)).toBe(false)
  })

  it('identifies blocked direct senders by identity id', () => {
    const contacts: Pick<ChatContact, 'identityId' | 'trustState'>[] = [
      { identityId: 'identity-alice', trustState: 'trusted' },
      { identityId: 'identity-bob', trustState: 'blocked' },
    ]

    expect(isDirectSenderBlocked('identity-bob', contacts)).toBe(true)
    expect(isDirectSenderBlocked('identity-alice', contacts)).toBe(false)
    expect(isDirectSenderBlocked('identity-carol', contacts)).toBe(false)
  })
})
