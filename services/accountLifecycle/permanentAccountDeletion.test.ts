/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  secureValue: null as string | null,
  events: [] as string[],
  deleteBackendAccount: vi.fn(),
  getDeletionStatus: vi.fn(),
  captureSnapshot: vi.fn(),
  eraseLocal: vi.fn(),
  clearTor: vi.fn(),
  invalidateAuthCaches: vi.fn(),
  hasVerifiedBackendAccess: vi.fn(),
  suspendPushRegistration: vi.fn(),
  retryLocalErasure: vi.fn(),
}))

vi.mock('expo-crypto', () => ({
  getRandomBytesAsync: vi.fn(async () => new Uint8Array(32).fill(0xab)),
}))
vi.mock('expo-secure-store', () => ({
  setItemAsync: vi.fn(async (_key: string, value: string) => {
    mocks.events.push('token_persisted')
    mocks.secureValue = value
  }),
  getItemAsync: vi.fn(async () => mocks.secureValue),
  deleteItemAsync: vi.fn(async () => {
    mocks.events.push('token_cleared')
    mocks.secureValue = null
  }),
}))
vi.mock('@/lib/constants', () => ({
  SECURE_STORE_OPTIONS: {},
  STORAGE_KEYS: {
    PENDING_ACCOUNT_DELETION: 'spectra_pending_account_deletion_v1',
  },
}))
vi.mock('@/services/backend/account', () => ({
  deleteBackendAccount: mocks.deleteBackendAccount,
  getBackendAccountDeletionStatus: mocks.getDeletionStatus,
}))
vi.mock('@/services/backend/client', () => ({
  SpectraBackendError: class SpectraBackendError extends Error {
    status: number
    code: string | null

    constructor(status: number, code: string | null) {
      super(code ?? String(status))
      this.status = status
      this.code = code
    }
  },
}))
vi.mock('@/services/backend/session', () => ({
  hasVerifiedBackendAccess: mocks.hasVerifiedBackendAccess,
  invalidateAuthCaches: mocks.invalidateAuthCaches,
}))
vi.mock('@/services/notifications/registrationCoordinator', () => ({
  suspendActiveWalletPushRegistration: mocks.suspendPushRegistration,
}))
vi.mock('@/services/security/persistedSensitiveData', () => ({
  clearPersistedSensitiveSecureStoreData: mocks.retryLocalErasure,
}))
vi.mock('./accountTeardown', () => ({
  captureAccountTeardownSnapshot: mocks.captureSnapshot,
  eraseLocalAccountData: mocks.eraseLocal,
  clearPreservedTorRuntime: mocks.clearTor,
}))

const deletion = await import('./permanentAccountDeletion')
const { useAccountDeletionStore } = await import('@/store/accountDeletionStore')

describe('permanent account deletion', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.secureValue = null
    mocks.events.length = 0
    mocks.deleteBackendAccount.mockReset()
    mocks.getDeletionStatus.mockReset()
    mocks.captureSnapshot.mockReset()
    mocks.eraseLocal.mockReset()
    mocks.clearTor.mockReset()
    mocks.invalidateAuthCaches.mockReset()
    mocks.hasVerifiedBackendAccess.mockReset()
    mocks.hasVerifiedBackendAccess.mockReturnValue(true)
    mocks.suspendPushRegistration.mockReset()
    mocks.suspendPushRegistration.mockImplementation(async () => {
      mocks.events.push('push_registration_suspended')
    })
    mocks.retryLocalErasure.mockReset()
    mocks.captureSnapshot.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      notificationCleanup: {},
    })
    mocks.eraseLocal.mockImplementation(async () => {
      mocks.events.push('local_erased')
      return []
    })
    mocks.deleteBackendAccount.mockImplementation(async () => {
      mocks.events.push('backend_requested')
      return {
        postgresRowsDeleted: 1,
        relayRowsDeleted: 1,
        objectsDeleted: 1,
        status: 'completed',
        stage: 'completed',
      }
    })
    mocks.clearTor.mockImplementation(async () => {
      mocks.events.push('tor_cleared')
    })
    mocks.retryLocalErasure.mockResolvedValue(undefined)
    useAccountDeletionStore.getState().reset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('erases local keys before submitting and preserves Tor until backend completion', async () => {
    const operation = deletion.deleteAccountPermanently()
    await vi.runAllTimersAsync()
    await operation

    expect(mocks.eraseLocal).toHaveBeenCalledWith({
      preserveTorRuntime: true,
      preserveAccountDeletion: true,
    })
    expect(mocks.events.indexOf('local_erased')).toBeLessThan(
      mocks.events.indexOf('backend_requested'),
    )
    expect(mocks.events.indexOf('push_registration_suspended')).toBeLessThan(
      mocks.events.indexOf('local_erased'),
    )
    expect(mocks.events.indexOf('backend_requested')).toBeLessThan(
      mocks.events.indexOf('tor_cleared'),
    )
    expect(mocks.deleteBackendAccount).toHaveBeenCalledWith(
      { accessToken: 'access-token' },
      'ab'.repeat(32),
    )
    expect(useAccountDeletionStore.getState().phase).toBe('completed')
    expect(mocks.secureValue).toBeNull()
  })

  it('requires verified backend access before erasing local data', async () => {
    mocks.hasVerifiedBackendAccess.mockReturnValue(false)

    const operation = deletion.deleteAccountPermanently()
    const rejection = expect(operation).rejects.toThrow('backend_session_required')
    await vi.runAllTimersAsync()

    await rejection
    expect(mocks.eraseLocal).not.toHaveBeenCalled()
    expect(mocks.deleteBackendAccount).not.toHaveBeenCalled()
  })

  it('polls real backend stages before finalizing', async () => {
    mocks.deleteBackendAccount.mockResolvedValueOnce({
      postgresRowsDeleted: 1,
      relayRowsDeleted: 0,
      objectsDeleted: 0,
      cleanupPending: true,
      status: 'pending',
      stage: 'objects',
    })
    mocks.getDeletionStatus
      .mockResolvedValueOnce({ status: 'pending', stage: 'relay' })
      .mockResolvedValueOnce({ status: 'completed', stage: 'completed' })

    const operation = deletion.deleteAccountPermanently()
    await vi.runAllTimersAsync()
    await operation

    expect(mocks.getDeletionStatus).toHaveBeenCalledTimes(2)
    expect(mocks.events).toContain('tor_cleared')
    expect(useAccountDeletionStore.getState().phase).toBe('completed')
  })

  it('does not downgrade transport when backend status cannot be confirmed', async () => {
    mocks.deleteBackendAccount.mockRejectedValueOnce(new Error('offline'))
    mocks.getDeletionStatus.mockRejectedValueOnce(new Error('offline'))

    const operation = deletion.deleteAccountPermanently()
    await vi.runAllTimersAsync()
    await operation

    expect(mocks.clearTor).not.toHaveBeenCalled()
    expect(mocks.secureValue).not.toBeNull()
    expect(useAccountDeletionStore.getState()).toMatchObject({
      phase: 'error',
      canRetry: true,
    })
  })

  it('deduplicates concurrent destructive requests', async () => {
    const first = deletion.deleteAccountPermanently()
    const second = deletion.deleteAccountPermanently()
    await vi.runAllTimersAsync()
    await Promise.all([first, second])

    expect(mocks.captureSnapshot).toHaveBeenCalledTimes(1)
    expect(mocks.deleteBackendAccount).toHaveBeenCalledTimes(1)
  })

  it('quietly ignores startup recovery when there is no pending token', async () => {
    await deletion.resumePendingAccountDeletionOnStartup()

    expect(mocks.getDeletionStatus).not.toHaveBeenCalled()
    expect(useAccountDeletionStore.getState().visible).toBe(false)
  })

  it('re-erases local state before resuming an interrupted deletion', async () => {
    mocks.secureValue = JSON.stringify({
      version: 1,
      operationToken: 'ef'.repeat(32),
      createdAt: Date.now(),
    })
    mocks.getDeletionStatus.mockResolvedValueOnce({
      status: 'completed',
      stage: 'completed',
    })

    await deletion.resumePendingAccountDeletionOnStartup()

    expect(mocks.events.indexOf('local_erased')).toBeLessThan(
      mocks.events.indexOf('tor_cleared'),
    )
    expect(mocks.eraseLocal).toHaveBeenCalledWith({
      preserveTorRuntime: true,
      preserveAccountDeletion: true,
    })
    expect(useAccountDeletionStore.getState().phase).toBe('completed')
  })
})
