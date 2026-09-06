/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  clearIdentityCache: vi.fn(),
  revokeBackendSession: vi.fn(async () => {}),
}))

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (key: string) => mockState.storage.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    mockState.storage.set(key, value)
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    mockState.storage.delete(key)
  }),
}))

vi.mock('@/lib/constants', () => ({
  STORAGE_KEYS: {
    SESSION: 'session',
  },
  SECURE_STORE_OPTIONS: {},
}))

vi.mock('@/lib/identity', () => ({
  clearIdentityCache: mockState.clearIdentityCache,
}))

vi.mock('@/services/backend/auth', () => ({
  revokeBackendSession: mockState.revokeBackendSession,
}))

describe('useAuthStore.initialize', () => {
  beforeEach(() => {
    vi.resetModules()
    mockState.storage.clear()
    mockState.clearIdentityCache.mockClear()
    mockState.revokeBackendSession.mockClear()
  })

  it('drops persisted legacy cloud sessions that predate metadataVersion', async () => {
    mockState.storage.set('session', JSON.stringify({
      exoAddress: 'exo1legacy',
      publicKey: 'legacy-public-key',
      accessToken: 'legacy-access-token',
      refreshToken: 'legacy-refresh-token',
      expiresAt: Date.now() + 60_000,
    }))

    const { useAuthStore } = await import('./authStore')
    await useAuthStore.getState().initialize()

    expect(useAuthStore.getState().session).toBeNull()
    expect(mockState.storage.has('session')).toBe(false)
    expect(useAuthStore.getState().isInitialized).toBe(true)
  })

  it('drops sessions that do not carry a server-issued identity claim', async () => {
    mockState.storage.set('session', JSON.stringify({
      exoAddress: 'exo1legacy',
      accessToken: 'legacy-access-token',
      refreshToken: 'legacy-refresh-token',
      expiresAt: Date.now() + 60_000,
      metadataVersion: 3,
    }))

    const { useAuthStore } = await import('./authStore')
    await useAuthStore.getState().initialize()

    expect(useAuthStore.getState().session).toBeNull()
    expect(mockState.storage.has('session')).toBe(false)
  })

  it('retains current persisted cloud sessions', async () => {
    mockState.storage.set('session', JSON.stringify({
      exoAddress: 'exo1current',
      identityId: 'identity-current',
      accessToken: 'current-access-token',
      refreshToken: 'current-refresh-token',
      expiresAt: Date.now() + 60_000,
      metadataVersion: 4,
    }))

    const { useAuthStore } = await import('./authStore')
    await useAuthStore.getState().initialize()

    expect(useAuthStore.getState().session).toEqual(expect.objectContaining({
      exoAddress: 'exo1current',
      accessToken: 'current-access-token',
      identityId: 'identity-current',
      metadataVersion: 4,
    }))
    expect(useAuthStore.getState().isIdentityBound).toBe(true)
    expect(useAuthStore.getState().isCloudAuthVerified).toBe(true)
    expect(mockState.clearIdentityCache).toHaveBeenCalled()
  })

  it('keeps a well-formed session after the access token expires', async () => {
    mockState.storage.set('session', JSON.stringify({
      exoAddress: 'exo1current',
      identityId: 'identity-current',
      accessToken: 'expired-access-token',
      refreshToken: 'current-refresh-token',
      expiresAt: Date.now() - 1_000,
      metadataVersion: 4,
    }))

    const { useAuthStore } = await import('./authStore')
    await useAuthStore.getState().initialize()

    expect(useAuthStore.getState().session).toEqual(expect.objectContaining({
      identityId: 'identity-current',
      refreshToken: 'current-refresh-token',
    }))
    expect(useAuthStore.getState().isIdentityBound).toBe(true)
    expect(useAuthStore.getState().isCloudAuthVerified).toBe(true)
    expect(useAuthStore.getState().isSessionExpired).toBe(true)
    expect(mockState.storage.has('session')).toBe(true)
  })

  it('does not treat an unbound persisted session as identity-bound', async () => {
    mockState.storage.set('session', JSON.stringify({
      exoAddress: 'exo1current',
      identityId: null,
      accessToken: 'current-access-token',
      refreshToken: 'current-refresh-token',
      expiresAt: Date.now() + 60_000,
      metadataVersion: 4,
    }))

    const { useAuthStore } = await import('./authStore')
    await useAuthStore.getState().initialize()

    expect(useAuthStore.getState().isIdentityBound).toBe(false)
    expect(useAuthStore.getState().isCloudAuthVerified).toBe(false)
  })

  it('keeps a persisted cloud session across in-app vault lock', async () => {
    const { useAuthStore } = await import('./authStore')
    await useAuthStore.getState().setSession({
      exoAddress: 'exo1current',
      identityId: 'identity-current',
      accessToken: 'current-access-token',
      refreshToken: 'current-refresh-token',
      expiresAt: Date.now() + 60_000,
      metadataVersion: 4,
    })
    useAuthStore.setState({
      isAuthenticated: true,
      isIdentityBound: true,
      isCloudAuthVerified: true,
    })

    useAuthStore.getState().lockForVault()

    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(useAuthStore.getState().session?.identityId).toBe('identity-current')
    expect(useAuthStore.getState().isIdentityBound).toBe(true)
    expect(mockState.storage.has('session')).toBe(true)
  })

  it('persists compact cloud sessions without the wallet public key', async () => {
    const { useAuthStore } = await import('./authStore')

    useAuthStore.setState({
      isAuthenticated: true,
      publicKey: 'current-wallet-public-key',
    })

    await useAuthStore.getState().setSession({
      exoAddress: 'exo1current',
      identityId: 'identity-current',
      publicKey: 'oversized-wallet-public-key',
      accessToken: 'current-access-token',
      refreshToken: 'current-refresh-token',
      expiresAt: Date.now() + 60_000,
      metadataVersion: 4,
    })

    expect(JSON.parse(mockState.storage.get('session') || '{}')).toEqual({
      exoAddress: 'exo1current',
      identityId: 'identity-current',
      accessToken: 'current-access-token',
      refreshToken: 'current-refresh-token',
      expiresAt: expect.any(Number),
      metadataVersion: 4,
    })
    expect(useAuthStore.getState().publicKey).toBe('oversized-wallet-public-key')
  })

  it('skips SecureStore writes when the persisted session is unchanged', async () => {
    const SecureStore = await import('expo-secure-store')
    const { useAuthStore } = await import('./authStore')
    const session = {
      exoAddress: 'exo1current',
      identityId: 'identity-current',
      accessToken: 'current-access-token',
      refreshToken: 'current-refresh-token',
      expiresAt: Date.now() + 60_000,
      metadataVersion: 4 as const,
    }

    await useAuthStore.getState().setSession(session)
    vi.mocked(SecureStore.setItemAsync).mockClear()

    await useAuthStore.getState().setSession({
      ...session,
      publicKey: 'in-memory-only-public-key',
    })

    expect(SecureStore.setItemAsync).not.toHaveBeenCalled()
    expect(useAuthStore.getState().publicKey).toBe('in-memory-only-public-key')
  })

  it('preserves an exact identity binding across a session refresh', async () => {
    const { useAuthStore } = await import('./authStore')
    useAuthStore.setState({
      isAuthenticated: true,
      isIdentityBound: true,
      isCloudAuthVerified: true,
      session: {
        exoAddress: 'exo1current',
        identityId: 'identity-current',
        accessToken: 'old-access-token',
        refreshToken: 'old-refresh-token',
        expiresAt: Date.now() + 60_000,
        metadataVersion: 4,
      },
      secureAccess: {
        phase: 'ready',
        failure: null,
        retryable: false,
      },
    })

    await useAuthStore.getState().setSession({
      exoAddress: 'exo1current',
      identityId: 'identity-current',
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      expiresAt: Date.now() + 60_000,
      metadataVersion: 4,
    })

    expect(useAuthStore.getState().isIdentityBound).toBe(true)
    expect(useAuthStore.getState().isCloudAuthVerified).toBe(true)
    expect(useAuthStore.getState().secureAccess).toEqual({
      phase: 'ready',
      failure: null,
      retryable: false,
    })
  })

  it('does not keep cloud verification when the bound identity changes', async () => {
    const { useAuthStore } = await import('./authStore')
    useAuthStore.setState({
      isAuthenticated: true,
      isIdentityBound: true,
      isCloudAuthVerified: true,
      session: {
        exoAddress: 'exo1current',
        identityId: 'identity-current',
        accessToken: 'old-access-token',
        refreshToken: 'old-refresh-token',
        expiresAt: Date.now() + 60_000,
        metadataVersion: 4,
      },
    })

    await useAuthStore.getState().setSession({
      exoAddress: 'exo1current',
      identityId: 'identity-other',
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      expiresAt: Date.now() + 60_000,
      metadataVersion: 4,
    })

    expect(useAuthStore.getState().isIdentityBound).toBe(false)
    expect(useAuthStore.getState().isCloudAuthVerified).toBe(false)
  })

  it('propagates SecureStore write failures without mutating in-memory session state', async () => {
    const SecureStore = await import('expo-secure-store')
    const { useAuthStore } = await import('./authStore')
    const storageError = new Error('secure storage unavailable')

    vi.mocked(SecureStore.setItemAsync).mockRejectedValueOnce(storageError)

    await expect(useAuthStore.getState().setSession({
      exoAddress: 'exo1current',
      identityId: 'identity-current',
      accessToken: 'current-access-token',
      refreshToken: 'current-refresh-token',
      expiresAt: Date.now() + 60_000,
      metadataVersion: 4,
    })).rejects.toThrow('secure storage unavailable')

    expect(useAuthStore.getState().session).toBeNull()
    expect(mockState.storage.has('session')).toBe(false)
  })

  it('revokes the backend refresh token on logout before clearing local state', async () => {
    const { useAuthStore } = await import('./authStore')

    await useAuthStore.getState().setSession({
      exoAddress: 'exo1current',
      identityId: 'identity-current',
      accessToken: 'current-access-token',
      refreshToken: 'current-refresh-token',
      expiresAt: Date.now() + 60_000,
      metadataVersion: 4,
    })

    await useAuthStore.getState().logout()

    expect(mockState.revokeBackendSession).toHaveBeenCalledWith('current-refresh-token')
    expect(useAuthStore.getState().session).toBeNull()
    expect(mockState.storage.has('session')).toBe(false)
  })
})
