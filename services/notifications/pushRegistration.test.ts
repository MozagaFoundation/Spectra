/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'
import {
  buildPushNotificationRegistrations,
  buildPushRegistrationSignature,
  buildWalletNotificationLabel,
} from './pushRegistration'

describe('buildWalletNotificationLabel', () => {
  it('uses a trimmed display name when available', () => {
    expect(buildWalletNotificationLabel({
      address: 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      displayName: '  Work EXO  ',
    })).toBe('Work EXO')
  })

  it('falls back to a short EXO address label', () => {
    expect(buildWalletNotificationLabel({
      address: 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    })).toBe('EXO EXO00a...aaaa')
  })

  it('limits labels to the notification storage budget', () => {
    expect(buildWalletNotificationLabel({
      address: 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      displayName: 'x'.repeat(100),
    })).toHaveLength(80)
  })
})

describe('buildPushNotificationRegistrations', () => {
  it('filters Spectre wallets and writes labels for normal EXO accounts', () => {
    expect(buildPushNotificationRegistrations([
      {
        address: 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        displayName: 'Work EXO',
        notificationScopeId: 'nsc1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      },
      {
        address: 'EXO00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        displayName: 'Spectre EXO',
        spectreMode: true,
        notificationScopeId: 'nsc1.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      },
      {
        address: 'EXO00cccccccccccccccccccccccccccccccccccccc',
        displayName: 'Friends EXO',
        notificationScopeId: 'nsc1.cccccccccccccccccccccccccccccccc',
      },
    ], 'ExpoPushToken[token]', 'es')).toEqual([
      {
        walletAddress: 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        notificationScopeId: 'nsc1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        pushToken: 'ExpoPushToken[token]',
        notificationLabel: 'Work EXO',
        notificationLocale: 'es',
        protocolVersion: 2,
        clientPlatform: null,
      },
      {
        walletAddress: 'EXO00cccccccccccccccccccccccccccccccccccccc',
        notificationScopeId: 'nsc1.cccccccccccccccccccccccccccccccc',
        pushToken: 'ExpoPushToken[token]',
        notificationLabel: 'Friends EXO',
        notificationLocale: 'es',
        protocolVersion: 2,
        clientPlatform: null,
      },
    ])
  })

  it('trims addresses and keeps the last duplicate registration', () => {
    expect(buildPushNotificationRegistrations([
      {
        address: ' EXO_DUP ',
        displayName: 'First',
        notificationScopeId: 'nsc1.11111111111111111111111111111111',
      },
      {
        address: 'EXO_DUP',
        displayName: 'Second',
        notificationScopeId: 'nsc1.22222222222222222222222222222222',
      },
      {
        address: '   ',
        displayName: 'Blank',
        notificationScopeId: 'nsc1.33333333333333333333333333333333',
      },
    ], 'ExpoPushToken[token]', 'en')).toEqual([
      {
        walletAddress: 'EXO_DUP',
        notificationScopeId: 'nsc1.22222222222222222222222222222222',
        pushToken: 'ExpoPushToken[token]',
        notificationLabel: 'Second',
        notificationLocale: 'en',
        protocolVersion: 2,
        clientPlatform: null,
      },
    ])
  })
})

describe('buildPushRegistrationSignature', () => {
  it('is stable regardless of registration order', () => {
    const first = buildPushRegistrationSignature([
      {
        walletAddress: 'EXO_B',
        notificationScopeId: 'nsc1.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        pushToken: 'token-b',
        notificationLabel: 'Wallet B',
        notificationLocale: 'en',
        protocolVersion: 2,
      },
      {
        walletAddress: 'EXO_A',
        notificationScopeId: 'nsc1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        pushToken: 'token-a',
        notificationLabel: 'Wallet A',
        notificationLocale: 'en',
        protocolVersion: 2,
      },
    ])
    const second = buildPushRegistrationSignature([
      {
        walletAddress: 'EXO_A',
        notificationScopeId: 'nsc1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        pushToken: 'token-a',
        notificationLabel: 'Wallet A',
        notificationLocale: 'en',
        protocolVersion: 2,
      },
      {
        walletAddress: 'EXO_B',
        notificationScopeId: 'nsc1.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        pushToken: 'token-b',
        notificationLabel: 'Wallet B',
        notificationLocale: 'en',
        protocolVersion: 2,
      },
    ])

    expect(first).toBe(second)
  })

  it('changes when the selected notification locale changes', () => {
    const registration = {
      walletAddress: 'EXO_A',
      notificationScopeId: 'nsc1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      pushToken: 'token-a',
      notificationLabel: 'Wallet A',
      protocolVersion: 2 as const,
    }

    expect(buildPushRegistrationSignature([
      { ...registration, notificationLocale: 'en' },
    ])).not.toBe(buildPushRegistrationSignature([
      { ...registration, notificationLocale: 'es' },
    ]))
  })
})
