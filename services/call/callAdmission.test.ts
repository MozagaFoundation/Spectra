/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  spectre: {
    enabled: false,
    isApplying: false,
    spectreAccountMode: null as 'mnemonic' | 'persistent_generated' | 'expendable' | null,
  },
  wallet: {
    wallet: null as { spectreMode?: boolean } | null,
  },
  tor: {
    enabled: false,
    status: 'disconnected' as 'disconnected' | 'connecting',
  },
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

vi.mock('@/services/tor/torStore', () => ({
  useTorStore: {
    getState: () => state.tor,
  },
}))

import {
  assertCallAdmission,
  canAdmitCalls,
  getCallAdmissionBlockReason,
} from './callAdmission'

describe('call admission', () => {
  beforeEach(() => {
    state.spectre.enabled = false
    state.spectre.isApplying = false
    state.spectre.spectreAccountMode = null
    state.wallet.wallet = null
    state.tor.enabled = false
    state.tor.status = 'disconnected'
  })

  it('blocks calls for active and in-progress Spectre transitions', () => {
    state.spectre.isApplying = true

    expect(getCallAdmissionBlockReason()).toBe('spectre')
    expect(canAdmitCalls()).toBe(false)
    expect(assertCallAdmission).toThrow('Calls are disabled in Spectre Mode.')

    state.spectre.isApplying = false
    state.wallet.wallet = { spectreMode: true }

    expect(getCallAdmissionBlockReason()).toBe('spectre')
  })

  it('blocks calls before Tor completes its connection transition', () => {
    state.tor.status = 'connecting'

    expect(getCallAdmissionBlockReason()).toBe('tor')
    expect(assertCallAdmission).toThrow('Calls are unavailable while Tor mode is active.')
  })

  it('admits calls only outside private transport modes', () => {
    expect(canAdmitCalls()).toBe(true)
    expect(assertCallAdmission).not.toThrow()
  })
})
