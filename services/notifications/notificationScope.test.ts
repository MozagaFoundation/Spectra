/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  secure: new Map<string, string>(),
  randomByte: 1,
}))

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (key: string) => mockState.secure.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    mockState.secure.set(key, value)
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    mockState.secure.delete(key)
  }),
}))

vi.mock('expo-crypto', () => ({
  getRandomBytesAsync: vi.fn(async (length: number) =>
    new Uint8Array(length).fill(mockState.randomByte++)
  ),
}))

describe('notificationScope', () => {
  beforeEach(() => {
    mockState.secure.clear()
    mockState.randomByte = 1
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('creates and securely reuses a random 128-bit wallet scope', async () => {
    const scopes = await import('./notificationScope')

    const first = await scopes.getOrCreateNotificationScopeId('EXO_ROOT')
    const second = await scopes.getOrCreateNotificationScopeId('EXO_ROOT')

    expect(first).toBe(`nsc1.${'01'.repeat(16)}`)
    expect(second).toBe(first)
    await expect(scopes.resolveNotificationScopeWallet(first)).resolves.toBe('EXO_ROOT')
  })

  it('keeps wallet scopes distinct and removes lifecycle mappings', async () => {
    const scopes = await import('./notificationScope')

    const root = await scopes.getOrCreateNotificationScopeId('EXO_ROOT')
    const secondary = await scopes.getOrCreateNotificationScopeId('EXO_SECONDARY')
    expect(root).not.toBe(secondary)

    await scopes.removeNotificationScopesForWallets(['EXO_ROOT'])
    await expect(scopes.resolveNotificationScopeWallet(root)).resolves.toBeNull()
    await expect(scopes.resolveNotificationScopeWallet(secondary)).resolves.toBe('EXO_SECONDARY')
  })
})
