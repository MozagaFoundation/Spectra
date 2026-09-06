/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import * as Crypto from 'expo-crypto'
import * as SecureStore from 'expo-secure-store'

import { SECURE_STORE_OPTIONS, STORAGE_KEYS } from '@/lib/constants'
import {
  type AccountDeletionStage,
  deleteBackendAccount,
  getBackendAccountDeletionStatus,
} from '@/services/backend/account'
import { SpectraBackendError } from '@/services/backend/client'
import {
  hasVerifiedBackendAccess,
  invalidateAuthCaches,
} from '@/services/backend/session'
import { suspendActiveWalletPushRegistration } from '@/services/notifications/registrationCoordinator'
import { clearPersistedSensitiveSecureStoreData } from '@/services/security/persistedSensitiveData'
import { useAccountDeletionStore } from '@/store/accountDeletionStore'

import {
  captureAccountTeardownSnapshot,
  clearPreservedTorRuntime,
  eraseLocalAccountData,
} from './accountTeardown'

const PENDING_DELETION_KEY = STORAGE_KEYS.PENDING_ACCOUNT_DELETION
const OPERATION_TOKEN_BYTES = 32
const OPERATION_MAX_AGE_MS = 24 * 60 * 60 * 1000
const POLL_DELAYS_MS = [
  750, 1_000, 1_250, 1_500, 2_000, 2_500, 3_000, 3_500, 4_000, 4_000,
] as const

interface PendingDeletionOperation {
  version: 1
  operationToken: string
  createdAt: number
}

let activeDeletion: Promise<void> | null = null

export async function deleteAccountPermanently(): Promise<void> {
  if (activeDeletion) return activeDeletion

  const operation = runPermanentAccountDeletion()
  activeDeletion = operation
  try {
    await operation
  } catch (error) {
    failUnexpectedDeletionError(false)
    throw error
  } finally {
    if (activeDeletion === operation) {
      activeDeletion = null
    }
  }
}

export async function resumePendingAccountDeletion(): Promise<void> {
  if (activeDeletion) return activeDeletion

  const operation = runPendingDeletionResume(true)
  activeDeletion = operation
  try {
    await operation
  } catch (error) {
    failUnexpectedDeletionError(true)
    throw error
  } finally {
    if (activeDeletion === operation) {
      activeDeletion = null
    }
  }
}

export async function resumePendingAccountDeletionOnStartup(): Promise<void> {
  if (activeDeletion) return activeDeletion

  const pending = await readPendingDeletion()
  if (!pending) return

  const operation = runPendingDeletionResume(false, pending)
  activeDeletion = operation
  try {
    await operation
  } catch (error) {
    failUnexpectedDeletionError(true)
    throw error
  } finally {
    if (activeDeletion === operation) {
      activeDeletion = null
    }
  }
}

async function runPermanentAccountDeletion(): Promise<void> {
  const progress = useAccountDeletionStore.getState()
  progress.start()
  await yieldToEventLoop()

  if (!hasVerifiedBackendAccess()) {
    progress.fail('A verified backend session is required before deleting this account.', false)
    throw new Error('backend_session_required')
  }

  const pushRegistrationDrain = suspendActiveWalletPushRegistration()
  const snapshot = await captureAccountTeardownSnapshot()
  await pushRegistrationDrain
  if (!hasVerifiedBackendAccess() || !snapshot.accessToken) {
    progress.fail('A verified backend session is required before deleting this account.', false)
    throw new Error('backend_session_required')
  }

  const pending = await createPendingDeletion()
  await persistPendingDeletion(pending)

  invalidateAuthCaches()
  progress.advance('erasing_local')
  const keyErasureFailures = await eraseLocalAccountData({
    preserveTorRuntime: true,
    preserveAccountDeletion: true,
  })

  progress.advance('submitting')
  let result
  try {
    result = await deleteBackendAccount(
      { accessToken: snapshot.accessToken },
      pending.operationToken,
    )
  } catch (error) {
    await recoverAfterSubmissionError(pending, keyErasureFailures)
    return
  }

  applyBackendStage(result.stage)
  if (
    result.status === 'completed'
    || result.stage === 'completed'
    || (result.status === undefined && result.cleanupPending !== true)
  ) {
    await finishDeletion(keyErasureFailures)
    return
  }
  try {
    await pollUntilCompleted(pending, keyErasureFailures)
  } catch (error) {
    reportPendingError(error)
  }
}

async function runPendingDeletionResume(
  userInitiated: boolean,
  existing?: PendingDeletionOperation,
): Promise<void> {
  const progress = useAccountDeletionStore.getState()
  const pending = existing ?? await readPendingDeletion()
  if (!pending) {
    progress.fail('There is no pending backend cleanup to retry.', false)
    return
  }

  if (!progress.visible || progress.phase === 'completed') {
    progress.start()
  }
  progress.advance('erasing_local')
  await suspendActiveWalletPushRegistration()
  invalidateAuthCaches()
  const keyErasureFailures = await eraseLocalAccountData({
    preserveTorRuntime: true,
    preserveAccountDeletion: true,
  })

  if (Date.now() - pending.createdAt > OPERATION_MAX_AGE_MS) {
    await clearPendingDeletion()
    await clearPreservedTorRuntime().catch(() => undefined)
    progress.fail('The cleanup status token expired. Re-import the account to verify its status.', false)
    return
  }
  progress.advance('submitting')

  try {
    await pollUntilCompleted(pending, keyErasureFailures)
  } catch (error) {
    if (!userInitiated && isDeletionNotFound(error)) {
      await clearPendingDeletion()
      await clearPreservedTorRuntime().catch(() => undefined)
      progress.reset()
      return
    }
    reportPendingError(error)
  }
}

async function recoverAfterSubmissionError(
  pending: PendingDeletionOperation,
  keyErasureFailures: PromiseRejectedResult[],
): Promise<void> {
  try {
    const status = await getBackendAccountDeletionStatus(pending.operationToken)
    applyBackendStage(status.stage)
    if (status.status === 'completed' || status.stage === 'completed') {
      await finishDeletion(keyErasureFailures)
      return
    }
    if (status.status === 'failed') {
      useAccountDeletionStore.getState().fail(
        'Backend cleanup is paused and will be retried safely. Try checking again.',
      )
      return
    }
    await pollUntilCompleted(pending, keyErasureFailures)
  } catch (statusError) {
    if (isDeletionNotFound(statusError)) {
      await clearPendingDeletion()
      await clearPreservedTorRuntime().catch(() => undefined)
      useAccountDeletionStore.getState().fail(
        'Local data was erased, but the backend did not accept the deletion request. Re-import the account to retry.',
        false,
      )
      return
    }
    useAccountDeletionStore.getState().fail(
      'Local data is erased, but backend cleanup could not be confirmed. Retry when the private connection is available.',
    )
  }
}

async function pollUntilCompleted(
  pending: PendingDeletionOperation,
  keyErasureFailures: PromiseRejectedResult[],
): Promise<void> {
  for (const delayMs of POLL_DELAYS_MS) {
    const status = await getBackendAccountDeletionStatus(pending.operationToken)
    applyBackendStage(status.stage)
    if (status.status === 'completed' || status.stage === 'completed') {
      await finishDeletion(keyErasureFailures)
      return
    }
    if (status.status === 'failed') {
      useAccountDeletionStore.getState().fail(
        'Backend cleanup is paused and will be retried safely. Try checking again.',
      )
      return
    }
    await delay(delayMs)
  }

  useAccountDeletionStore.getState().fail(
    'Backend cleanup is still running. You can retry this status check safely.',
  )
}

async function finishDeletion(
  keyErasureFailures: PromiseRejectedResult[],
): Promise<void> {
  const progress = useAccountDeletionStore.getState()
  progress.advance('finalizing')
  try {
    await clearPreservedTorRuntime()
    await clearPendingDeletion()
  } catch {
    progress.fail(
      'Backend deletion completed, but final device cleanup needs to be retried.',
    )
    return
  }

  if (keyErasureFailures.length > 0) {
    const retry = await Promise.allSettled([
      clearPersistedSensitiveSecureStoreData(),
    ])
    if (retry.some((result) => result.status === 'rejected')) {
      progress.fail(
        'Backend deletion completed, but local key erasure could not be confirmed.',
        false,
      )
      throw new Error('local_key_erasure_incomplete')
    }
  }

  progress.advance('completed')
}

function applyBackendStage(stage?: AccountDeletionStage): void {
  if (!stage) return
  const progress = useAccountDeletionStore.getState()
  if (stage === 'completed') {
    progress.advance('finalizing')
  } else {
    progress.advance(stage)
  }
}

function reportPendingError(error: unknown): void {
  if (isDeletionNotFound(error)) {
    useAccountDeletionStore.getState().fail(
      'The backend no longer recognizes this cleanup token. Re-import the account to verify deletion.',
      false,
    )
    return
  }
  useAccountDeletionStore.getState().fail(
    'Backend cleanup could not be checked. Retry when the private connection is available.',
  )
}

function isDeletionNotFound(error: unknown): boolean {
  return error instanceof SpectraBackendError
    && error.status === 404
}

function failUnexpectedDeletionError(canRetry: boolean): void {
  const progress = useAccountDeletionStore.getState()
  if (progress.phase === 'error') return
  progress.fail(
    'Secure account deletion stopped unexpectedly. Try again when the private connection is available.',
    canRetry,
  )
}

async function createPendingDeletion(): Promise<PendingDeletionOperation> {
  const random = await Crypto.getRandomBytesAsync(OPERATION_TOKEN_BYTES)
  return {
    version: 1,
    operationToken: Array.from(random, (byte) => byte.toString(16).padStart(2, '0')).join(''),
    createdAt: Date.now(),
  }
}

async function persistPendingDeletion(pending: PendingDeletionOperation): Promise<void> {
  await SecureStore.setItemAsync(
    PENDING_DELETION_KEY,
    JSON.stringify(pending),
    SECURE_STORE_OPTIONS,
  )
}

async function readPendingDeletion(): Promise<PendingDeletionOperation | null> {
  const raw = await SecureStore.getItemAsync(PENDING_DELETION_KEY, SECURE_STORE_OPTIONS)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<PendingDeletionOperation>
    if (
      parsed.version !== 1
      || typeof parsed.operationToken !== 'string'
      || !/^[0-9a-f]{64}$/.test(parsed.operationToken)
      || typeof parsed.createdAt !== 'number'
      || !Number.isFinite(parsed.createdAt)
    ) {
      await clearPendingDeletion()
      return null
    }
    return parsed as PendingDeletionOperation
  } catch {
    await clearPendingDeletion()
    return null
  }
}

async function clearPendingDeletion(): Promise<void> {
  await SecureStore.deleteItemAsync(PENDING_DELETION_KEY, SECURE_STORE_OPTIONS)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function yieldToEventLoop(): Promise<void> {
  return delay(0)
}
