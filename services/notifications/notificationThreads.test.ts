/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'

import {
  getNotificationThreadKey,
  matchesNotificationThreadKey,
} from './notificationThreads'

describe('getNotificationThreadKey', () => {
  it('falls back to conversation and group identifiers', () => {
    expect(getNotificationThreadKey({ conversationId: 'conv-1' })).toBe('conv-1')
    expect(getNotificationThreadKey({ groupId: 'group-1' })).toBe('group:group-1')
  })

  it('falls back to remote wallet keys for privacy-minimized direct payloads', () => {
    expect(getNotificationThreadKey({
      remoteWalletAddress: 'exo1abc',
    })).toBe('exo1abc')
  })

  it('scopes direct thread keys by local wallet when present', () => {
    expect(getNotificationThreadKey({
      conversationId: 'conv-1',
      localWalletAddress: 'exo1work',
    })).toBe('local:exo1work:conv-1')
  })
})

describe('matchesNotificationThreadKey', () => {
  it('matches direct notifications by conversation or remote identity', () => {
    expect(
      matchesNotificationThreadKey('conv-1', {
        conversationId: 'conv-1',
        remoteIdentityId: 'identity-1',
      }),
    ).toBe(true)

    expect(
      matchesNotificationThreadKey('identity-1', {
        conversationId: 'conv-1',
        remoteIdentityId: 'identity-1',
      }),
    ).toBe(true)
  })

  it('matches direct notifications by remote wallet and scoped remote wallet', () => {
    expect(
      matchesNotificationThreadKey('exo1abc', {
        remoteWalletAddress: 'exo1abc',
      }),
    ).toBe(true)

    expect(
      matchesNotificationThreadKey('local:exo1work:exo1abc', {
        remoteWalletAddress: 'exo1abc',
        localWalletAddress: 'exo1work',
      }),
    ).toBe(true)
  })

  it('matches scoped direct notification keys while preserving legacy direct matches', () => {
    expect(
      matchesNotificationThreadKey('local:exo1work:conv-1', {
        conversationId: 'conv-1',
        remoteIdentityId: 'identity-1',
        localWalletAddress: 'exo1work',
      }),
    ).toBe(true)

    expect(
      matchesNotificationThreadKey('conv-1', {
        conversationId: 'conv-1',
        remoteIdentityId: 'identity-1',
        localWalletAddress: 'exo1work',
      }),
    ).toBe(true)
  })

  it('does not match placeholder keys when optional ids are missing', () => {
    expect(matchesNotificationThreadKey('group:null', {
      conversationId: 'conv-1',
    })).toBe(false)
  })

  it('does not match the same conversation id across a different local wallet scope', () => {
    expect(
      matchesNotificationThreadKey('local:exo1work:conv-1', {
        conversationId: 'conv-1',
        localWalletAddress: 'exo1friends',
      }),
    ).toBe(false)
  })
})
