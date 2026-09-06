/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'
import * as SecureStore from 'expo-secure-store'
import {
  APP_NAME,
  APP_VERSION,
  BIOMETRIC_SECURE_STORE_OPTIONS,
  EXO_ADDRESS_LENGTH,
  EXO_ADDRESS_REGEX,
  SCREENSHOT_PROTECTION_KEY,
  SECURE_STORE_OPTIONS,
  SECURITY_CONFIG,
  STORAGE_KEYS,
  VAULT_SECURITY_KEYS,
} from './constants'

describe('app constants', () => {
  it('keeps storage keys stable and non-overlapping', () => {
    const storageValues = Object.values(STORAGE_KEYS)
    const vaultValues = Object.values(VAULT_SECURITY_KEYS)

    expect(new Set(storageValues).size).toBe(storageValues.length)
    expect(new Set(vaultValues).size).toBe(vaultValues.length)
    expect(vaultValues.every((key) => key.startsWith(`${STORAGE_KEYS.VAULT}_`))).toBe(true)
    expect(SCREENSHOT_PROTECTION_KEY).toBe(`${STORAGE_KEYS.VAULT}_screenshot_protection`)
  })

  it('pins secure-store keychain service names used for vault isolation', () => {
    expect(SECURE_STORE_OPTIONS).toEqual({
      keychainService: 'org.spectramozaga.exo',
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    })
    expect(BIOMETRIC_SECURE_STORE_OPTIONS).toEqual({
      keychainService: 'org.spectramozaga.exo.biometric',
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      requireAuthentication: true,
    })
  })

  it('exposes only the PIN lockout security constants consumed by the app shell', () => {
    expect(SECURITY_CONFIG).toEqual({
      MAX_PIN_ATTEMPTS: 5,
      LOCKOUT_DURATION: 5 * 60 * 1000,
    })
  })

  it('keeps EXO address format assumptions synchronized', () => {
    const validAddress = `EXO00${'a'.repeat(38)}`

    expect(APP_NAME).toBe('Spectra')
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
    expect(validAddress.length).toBe(EXO_ADDRESS_LENGTH)
    expect(EXO_ADDRESS_REGEX.test(validAddress)).toBe(true)
    expect(EXO_ADDRESS_REGEX.test(`EXO00${'g'.repeat(38)}`)).toBe(false)
    expect(EXO_ADDRESS_REGEX.test(validAddress.toLowerCase())).toBe(false)
  })
})
