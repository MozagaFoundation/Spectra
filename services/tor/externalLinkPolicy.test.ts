/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  alert: vi.fn(),
  openURL: vi.fn(async () => undefined),
  translateMessage: vi.fn((key: string) => `localized:${key}`),
  spectre: {
    enabled: false,
    isApplying: false,
    spectreAccountMode: null as 'mnemonic' | 'persistent_generated' | 'expendable' | null,
  },
  wallet: {
    wallet: null as { spectreMode?: boolean } | null,
  },
}))

vi.mock('react-native', () => ({
  Alert: { alert: state.alert },
  Linking: { openURL: state.openURL },
}))

vi.mock('@/store/spectreStore', () => ({
  useSpectreStore: {
    getState: () => state.spectre,
  },
}))

vi.mock('@/store/walletStore', () => ({
  useWalletStore: {
    getState: () => state.wallet,
  },
}))

vi.mock('@/lib/i18n/messages', () => ({
  translateMessage: state.translateMessage,
}))

import {
  assertExternalUrlAllowed,
  isExternalUrlAllowed,
  openExternalUrl,
} from './externalLinkPolicy'

describe('external link policy', () => {
  beforeEach(() => {
    state.spectre.enabled = false
    state.spectre.isApplying = false
    state.spectre.spectreAccountMode = null
    state.wallet.wallet = null
    state.alert.mockClear()
    state.openURL.mockClear()
    state.translateMessage.mockClear()
  })

  it('opens system links outside Spectre Mode', async () => {
    await expect(openExternalUrl('https://spectra.example')).resolves.toBe(true)
    expect(state.openURL).toHaveBeenCalledWith('https://spectra.example')
  })

  it('blocks system handoffs for active or transitioning Spectre state', async () => {
    state.spectre.isApplying = true

    await expect(openExternalUrl('https://spectra.example')).resolves.toBe(false)
    expect(state.openURL).not.toHaveBeenCalled()
    expect(state.alert).toHaveBeenCalledWith(
      'localized:External links unavailable',
      'localized:External links are unavailable while Spectre Mode is active.',
    )
    expect(state.translateMessage).toHaveBeenCalledWith('External links unavailable')
    expect(state.translateMessage).toHaveBeenCalledWith(
      'External links are unavailable while Spectre Mode is active.',
    )

    state.spectre.isApplying = false
    state.wallet.wallet = { spectreMode: true }

    expect(isExternalUrlAllowed()).toBe(false)
    expect(assertExternalUrlAllowed).toThrow(
      'External links are unavailable while Spectre Mode is active.',
    )
  })
})
