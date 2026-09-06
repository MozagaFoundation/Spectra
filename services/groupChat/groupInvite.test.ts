/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'
import { isGroupCiphertextEnvelope, isGroupInviteEnvelope } from './groupInvite'

describe('groupInvite envelopes', () => {
  it('accepts a v2 invitation snapshot with unique members', () => {
    expect(isGroupInviteEnvelope({
      v: 2,
      type: 'group_sender_key_distribution',
      groupId: 'group-1',
      recipientIdentityId: 'member',
      distributionId: 'distribution-1',
      keyVersion: 1,
      rotationRevision: 1,
      keyBase64: 'key',
      title: 'Team',
      createdAt: '2026-01-01T00:00:00.000Z',
      members: [
        { identityId: 'owner', role: 'owner', joinedEpoch: 1 },
        { identityId: 'member', role: 'member', joinedEpoch: 1 },
      ],
    })).toBe(true)
  })

  it('rejects duplicate member identities and oversized rosters', () => {
    expect(isGroupInviteEnvelope({
      v: 2,
      type: 'group_sender_key_distribution',
      groupId: 'group-1',
      recipientIdentityId: 'member',
      distributionId: 'distribution-1',
      keyVersion: 1,
      rotationRevision: 1,
      title: 'Team',
      createdAt: '2026-01-01T00:00:00.000Z',
      members: [
        { identityId: 'owner', role: 'owner', joinedEpoch: 1 },
        { identityId: 'owner', role: 'member', joinedEpoch: 1 },
      ],
    })).toBe(false)
  })

  it('accepts a bounded group ciphertext envelope', () => {
    expect(isGroupCiphertextEnvelope({
      v: 2,
      type: 'group_ciphertext',
      groupId: 'group-1',
      recipientIdentityId: 'member',
      payload: {
        id: 'msg-1',
        senderIdentityId: 'owner',
        distributionId: 'distribution-1',
        keyVersion: 1,
        groupRevision: 1,
        contentType: 'text',
        ciphertext: 'ct',
        nonce: 'nonce',
        tag: 'tag',
        signature: 'sig',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    })).toBe(true)
  })
})
