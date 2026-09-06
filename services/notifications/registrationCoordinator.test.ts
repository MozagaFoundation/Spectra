/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  wallet: {
    address: 'EXO_ACTIVE',
    displayName: 'Active',
    spectreMode: false,
  } as { address: string; displayName?: string; spectreMode?: boolean } | null,
  spectre: {
    enabled: false,
    isApplying: false,
  },
  authSession: {
    exoAddress: 'EXO_ACTIVE',
    accessToken: 'access-active',
  } as { exoAddress: string; accessToken: string } | null,
  ensureVerifiedBackendAccess: vi.fn(),
  initializePushNotificationsForWallets: vi.fn(async () => true),
  captureNotificationCleanupSnapshot: vi.fn(async () => ({
    walletAddresses: ['EXO_ACTIVE'],
    notificationScopeIds: ['nsc1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
    pushTokens: ['ExpoPushToken[test]'],
  })),
  deactivateNotificationRuntime: vi.fn(async () => {}),
  revokeNotificationCleanupSnapshot: vi.fn(async () => {}),
  removeNotificationScopesForWallets: vi.fn(async () => {}),
}))

vi.mock('@/lib/accountScope', () => ({
  isSameAccountStorageScope: (left?: string | null, right?: string | null) =>
    Boolean(left && right && left.trim().toLowerCase() === right.trim().toLowerCase()),
}))

vi.mock('@/services/backend/session', () => ({
  ensureVerifiedBackendAccess: mockState.ensureVerifiedBackendAccess,
}))

vi.mock('@/services/logging/mobileLogger', () => ({
  mobileLogDebug: vi.fn(),
  mobileLogWarn: vi.fn(),
}))

vi.mock('@/store/authStore', () => ({
  useAuthStore: {
    getState: () => ({ session: mockState.authSession }),
  },
}))

vi.mock('@/store/walletStore', () => ({
  useWalletStore: {
    getState: () => ({ wallet: mockState.wallet }),
  },
}))

vi.mock('@/store/spectreStore', () => ({
  useSpectreStore: {
    getState: () => mockState.spectre,
  },
}))

vi.mock('./pushService', () => ({
  captureNotificationCleanupSnapshot: mockState.captureNotificationCleanupSnapshot,
  deactivateNotificationRuntime: mockState.deactivateNotificationRuntime,
  initializePushNotificationsForWallets: mockState.initializePushNotificationsForWallets,
  revokeNotificationCleanupSnapshot: mockState.revokeNotificationCleanupSnapshot,
}))

vi.mock('./notificationScope', () => ({
  removeNotificationScopesForWallets: mockState.removeNotificationScopesForWallets,
  getOrCreateNotificationScopeId: vi.fn(async () => 'nsc1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
}))

vi.mock('./prefetchSession', () => ({
  publishPrefetchSession: vi.fn(async () => {}),
}))

async function importCoordinator() {
  vi.resetModules()
  return import('./registrationCoordinator')
}

describe('active-wallet notification registration', () => {
  beforeEach(() => {
    mockState.wallet = {
      address: 'EXO_ACTIVE',
      displayName: 'Active',
      spectreMode: false,
    }
    mockState.authSession = {
      exoAddress: 'EXO_ACTIVE',
      accessToken: 'access-active',
    }
    mockState.spectre.enabled = false
    mockState.spectre.isApplying = false
    vi.clearAllMocks()
    mockState.ensureVerifiedBackendAccess.mockImplementation(async () => mockState.authSession)
    mockState.initializePushNotificationsForWallets.mockResolvedValue(true)
    mockState.captureNotificationCleanupSnapshot.mockResolvedValue({
      walletAddresses: ['EXO_ACTIVE'],
      notificationScopeIds: ['nsc1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
      pushTokens: ['ExpoPushToken[test]'],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('registers only the verified active wallet with its access token', async () => {
    const { synchronizeActiveWalletPushRegistration } = await importCoordinator()

    await expect(synchronizeActiveWalletPushRegistration()).resolves.toBe(true)

    expect(mockState.initializePushNotificationsForWallets).toHaveBeenCalledOnce()
    expect(mockState.initializePushNotificationsForWallets).toHaveBeenCalledWith(
      [{
        address: 'EXO_ACTIVE',
        displayName: 'Active',
        spectreMode: false,
      }],
      {
        forceSync: true,
        accessToken: 'access-active',
      },
    )
  })

  it('retries a transient binding race without changing wallet authority', async () => {
    vi.useFakeTimers()
    mockState.ensureVerifiedBackendAccess
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(mockState.authSession)
    const { synchronizeActiveWalletPushRegistration } = await importCoordinator()

    const registration = synchronizeActiveWalletPushRegistration()
    await vi.advanceTimersByTimeAsync(1_000)

    await expect(registration).resolves.toBe(true)
    expect(mockState.ensureVerifiedBackendAccess).toHaveBeenCalledTimes(2)
    expect(mockState.initializePushNotificationsForWallets).toHaveBeenCalledOnce()
  })

  it('abandons an in-flight registration when the active wallet changes', async () => {
    vi.useFakeTimers()
    let resolveSession!: (value: typeof mockState.authSession) => void
    mockState.ensureVerifiedBackendAccess.mockImplementationOnce(() => new Promise((resolve) => {
      resolveSession = resolve
    }))
    const {
      invalidateActiveWalletPushRegistration,
      synchronizeActiveWalletPushRegistration,
    } = await importCoordinator()

    const registration = synchronizeActiveWalletPushRegistration()
    mockState.wallet = { address: 'EXO_OTHER', spectreMode: false }
    invalidateActiveWalletPushRegistration()
    resolveSession({
      exoAddress: 'EXO_ACTIVE',
      accessToken: 'access-active',
    })
    await vi.runAllTimersAsync()

    await expect(registration).resolves.toBe(false)
    expect(mockState.initializePushNotificationsForWallets).not.toHaveBeenCalled()
  })

  it('does not register while Spectre Mode is transitioning', async () => {
    mockState.spectre.isApplying = true
    const { synchronizeActiveWalletPushRegistration } = await importCoordinator()

    await expect(synchronizeActiveWalletPushRegistration()).resolves.toBe(false)
    expect(mockState.initializePushNotificationsForWallets).not.toHaveBeenCalled()
  })

  it('revokes and removes the previous wallet before handoff', async () => {
    const { prepareActiveWalletPushHandoff } = await importCoordinator()

    await prepareActiveWalletPushHandoff()

    expect(mockState.deactivateNotificationRuntime).toHaveBeenCalledOnce()
    expect(mockState.removeNotificationScopesForWallets).toHaveBeenCalledWith(['EXO_ACTIVE'])
    expect(mockState.revokeNotificationCleanupSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        walletAddresses: ['EXO_ACTIVE'],
        pushTokens: [],
      }),
      { accessToken: 'access-active' },
    )
  })
})
