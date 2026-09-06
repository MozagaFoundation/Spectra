/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  internetAvailable: true,
  spectreApplying: false,
  torEnabled: false,
  torStatus: 'disconnected',
}))

vi.mock('@/store/bluetoothStore', () => ({
  useBluetoothStore: {
    getState: () => ({ internetAvailable: state.internetAvailable }),
  },
}))

vi.mock('@/store/spectreStore', () => ({
  useSpectreStore: {
    getState: () => ({ isApplying: state.spectreApplying }),
  },
}))

vi.mock('@/services/tor/torStore', () => ({
  useTorStore: {
    getState: () => ({ enabled: state.torEnabled, status: state.torStatus }),
  },
}))

import { isRemoteChatServiceAvailable } from './remoteChatAvailability'

describe('remote chat service availability', () => {
  beforeEach(() => {
    state.internetAvailable = true
    state.spectreApplying = false
    state.torEnabled = false
    state.torStatus = 'disconnected'
  })

  it('allows direct requests only while internet is available', () => {
    expect(isRemoteChatServiceAvailable()).toBe(true)
    state.internetAvailable = false
    expect(isRemoteChatServiceAvailable()).toBe(false)
  })

  it('fails closed until an enabled Tor transport is connected', () => {
    state.torEnabled = true
    expect(isRemoteChatServiceAvailable()).toBe(false)
    state.torStatus = 'connected'
    expect(isRemoteChatServiceAvailable()).toBe(true)
  })

  it('fails closed during a Spectre transition', () => {
    state.spectreApplying = true

    expect(isRemoteChatServiceAvailable()).toBe(false)
  })
})
