/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  getItemAsync: vi.fn(async () => null as string | null),
  setItemAsync: vi.fn(async () => undefined),
}))

vi.mock('expo-secure-store', () => state)
vi.mock('@/lib/constants', () => ({
  SECURE_STORE_OPTIONS: { keychainAccessible: 'after-first-unlock' },
  STORAGE_KEYS: { VAULT: 'spectra_vault' },
}))

import {
  acknowledgeSnowflakeBootstrapConsent,
  assertBridgeBootstrapConsent,
  hasSnowflakeBootstrapConsent,
  SNOWFLAKE_CONSENT_VERSION,
} from './snowflakeConsent'
import { TOR_STORAGE_KEYS } from './torConstants'

describe('Snowflake bootstrap consent', () => {
  beforeEach(() => {
    state.getItemAsync.mockReset()
    state.getItemAsync.mockResolvedValue(null)
    state.setItemAsync.mockReset()
    state.setItemAsync.mockResolvedValue(undefined)
  })

  it('requires a current acknowledgement for Snowflake only', async () => {
    await expect(assertBridgeBootstrapConsent('snowflake')).rejects.toThrow(
      'Acknowledge Snowflake bootstrap privacy exposure',
    )
    await expect(assertBridgeBootstrapConsent('obfs4')).resolves.toBeUndefined()

    state.getItemAsync.mockResolvedValue(SNOWFLAKE_CONSENT_VERSION)
    await expect(hasSnowflakeBootstrapConsent()).resolves.toBe(true)
    await expect(assertBridgeBootstrapConsent('snowflake')).resolves.toBeUndefined()
  })

  it('persists a versioned acknowledgement in secure storage', async () => {
    await acknowledgeSnowflakeBootstrapConsent()

    expect(state.setItemAsync).toHaveBeenCalledWith(
      TOR_STORAGE_KEYS.SNOWFLAKE_CONSENT,
      SNOWFLAKE_CONSENT_VERSION,
      { keychainAccessible: 'after-first-unlock' },
    )
  })
})
