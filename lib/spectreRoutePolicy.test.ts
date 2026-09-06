/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'

import { isSpectreBlockedRoute } from './spectreRoutePolicy'

describe('isSpectreBlockedRoute', () => {
  it('keeps non-wallet routes available in Spectre Mode', () => {
    expect(isSpectreBlockedRoute('/(main)/(tabs)/chats', { enabled: true })).toBe(false)
    expect(isSpectreBlockedRoute('/(main)/settings/security', { enabled: true })).toBe(false)
  })

  it('blocks wallet and crypto routes while Spectre Mode is active', () => {
    const state = { enabled: true }

    expect(isSpectreBlockedRoute('/(main)/(tabs)/agora', state)).toBe(true)
    expect(isSpectreBlockedRoute('/(main)/agora/room-1', state)).toBe(true)
    expect(isSpectreBlockedRoute('/(main)/(tabs)/crypto', state)).toBe(true)
    expect(isSpectreBlockedRoute('/(main)/crypto/send', state)).toBe(true)
    expect(isSpectreBlockedRoute('/(main)/markets/escrow/create', state)).toBe(true)
    expect(isSpectreBlockedRoute('/(main)/accounts/index', state)).toBe(true)
  })

  it('blocks crypto routes while Spectre activation is applying', () => {
    expect(isSpectreBlockedRoute('/(main)/crypto/receive', { enabled: false }, true)).toBe(true)
  })

  it('does not block routes after Spectre Mode is disabled', () => {
    expect(isSpectreBlockedRoute('/(main)/crypto/send', { enabled: false })).toBe(false)
  })
})
