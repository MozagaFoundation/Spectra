/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it, vi } from 'vitest'
import {
  canOpenTorBridges,
  getTopChromeAwareTopInset,
  getTorPresenceCopy,
  shouldShowTorReconnectGate,
  TOR_BRIDGES_ROUTE,
} from './torPresenceState'

vi.mock('@/lib/i18n', () => ({
  translate: (key: string, options?: { country?: string }) =>
    options?.country ? key.replace('{{country}}', options.country) : key,
}))
vi.mock('@/lib/errorDisplay', () => ({
  getErrorDisplayMessage: () => 'Something went wrong. Please try again.',
}))

describe('torPresenceState', () => {
  it('shows the reconnect gate when a tor resume fails with an error', () => {
    expect(
      shouldShowTorReconnectGate({
        enabled: true,
        status: 'error',
        presenceGateReason: 'foreground_resume',
      }),
    ).toBe(true)

    expect(
      shouldShowTorReconnectGate({
        enabled: true,
        status: 'error',
        presenceGateReason: 'startup',
      }),
    ).toBe(true)
  })

  it('hides the reconnect gate once tor is connected or no gate was requested', () => {
    expect(
      shouldShowTorReconnectGate({
        enabled: true,
        status: 'connected',
        presenceGateReason: 'startup',
      }),
    ).toBe(false)

    expect(
      shouldShowTorReconnectGate({
        enabled: true,
        status: 'connecting',
        presenceGateReason: null,
      }),
    ).toBe(false)

    expect(
      shouldShowTorReconnectGate({
        enabled: false,
        status: 'error',
        presenceGateReason: 'startup',
      }),
    ).toBe(false)
  })

  it('covers the full reconnect gate truth table auditors care about', () => {
    const statuses = ['disconnected', 'connecting', 'connected', 'error'] as const

    for (const status of statuses) {
      expect(
        shouldShowTorReconnectGate({
          enabled: false,
          presenceGateReason: 'startup',
          status,
        }),
      ).toBe(false)

      expect(
        shouldShowTorReconnectGate({
          enabled: true,
          presenceGateReason: null,
          status,
        }),
      ).toBe(false)

      expect(
        shouldShowTorReconnectGate({
          enabled: true,
          presenceGateReason: 'foreground_resume',
          status,
        }),
      ).toBe(status === 'error')
    }
  })

  it('removes the duplicated top inset while any global top chrome is visible', () => {
    expect(getTopChromeAwareTopInset(59, true)).toBe(0)
    expect(getTopChromeAwareTopInset(59, false)).toBe(59)
  })

  it('blocks duplicate tor bridges navigation while pending or already on the route', () => {
    expect(canOpenTorBridges('/(main)/(tabs)/chats', false)).toBe(true)
    expect(canOpenTorBridges(TOR_BRIDGES_ROUTE, false)).toBe(false)
    expect(canOpenTorBridges('/(main)/(tabs)/chats', true)).toBe(false)
  })

  it('builds connected and error copy with the expected exit labels', () => {
    expect(
      getTorPresenceCopy(
        {
          status: 'connected',
          exitCountry: 'Germany',
          errorMessage: null,
          lastHealthError: null,
        },
        'banner',
      ),
    ).toEqual({
      tone: 'connected',
      title: 'Connected to Tor',
      detail: 'Supported Spectra network requests are currently routed through Tor.',
      exitLabel: 'Exit node: Germany',
    })

    expect(
      getTorPresenceCopy(
        {
          status: 'error',
          exitCountry: 'France',
          errorMessage: null,
          lastHealthError: 'Circuit check failed',
        },
        'gate',
      ),
    ).toEqual({
      tone: 'error',
      title: 'Tor connection failed',
      detail: 'Something went wrong. Please try again.',
      exitLabel: 'Last verified exit: France',
    })
  })

  it('documents disconnected copy as a reconnecting state', () => {
    expect(
      getTorPresenceCopy(
        {
          status: 'disconnected',
          exitCountry: null,
          errorMessage: null,
          lastHealthError: null,
        },
        'gate',
      ),
    ).toEqual({
      tone: 'connecting',
      title: 'Connecting to Tor',
      detail: 'Re-establishing your Tor route before showing the app.',
      exitLabel: 'Checking exit node...',
    })
  })
})
