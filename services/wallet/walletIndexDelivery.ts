/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 */

import { isSameAccountStorageScope } from '@/lib/accountScope'
import {
  acknowledgeWalletIndexDeliveriesWithBackend,
  getWalletIndexDeliveriesWithBackend,
} from '@/services/backend/walletIndex'
import { ensureVerifiedBackendAccess } from '@/services/backend/session'
import {
  applyWalletIndexDeliveries,
  loadWalletIndexState,
  reconcileWalletIndexLeases,
  shouldSyncWalletIndexDeliveries,
  type WalletIndexLocalState,
} from '@/services/storage/walletIndexStorage'
import type { EXOWallet } from '@spectra/identity-vault'

const syncPromises = new Map<string, {
  force: boolean
  promise: Promise<WalletIndexDeliverySyncResult>
}>()

export interface WalletIndexDeliverySyncResult {
  state: WalletIndexLocalState
  newTransactionCount: number
  leaseStateChanged: boolean
  appliedEventIds: string[]
  acknowledgedEventIds: string[]
}

function emptyResult(state: WalletIndexLocalState): WalletIndexDeliverySyncResult {
  return {
    state,
    newTransactionCount: 0,
    leaseStateChanged: false,
    appliedEventIds: [],
    acknowledgedEventIds: [],
  }
}

export async function syncWalletIndexDeliveries(
  wallet: EXOWallet,
  options: { force?: boolean; signal?: AbortSignal } = {},
): Promise<WalletIndexDeliverySyncResult> {
  const existing = syncPromises.get(wallet.address)
  if (existing) {
    if (!options.force || existing.force) return existing.promise
    await existing.promise
    return await syncWalletIndexDeliveries(wallet, options)
  }
  const operation = syncWalletIndexDeliveriesInternal(wallet, options)
    .finally(() => {
      if (syncPromises.get(wallet.address)?.promise === operation) {
        syncPromises.delete(wallet.address)
      }
    })
  syncPromises.set(wallet.address, { force: options.force === true, promise: operation })
  return operation
}

async function syncWalletIndexDeliveriesInternal(
  wallet: EXOWallet,
  options: { force?: boolean; signal?: AbortSignal },
): Promise<WalletIndexDeliverySyncResult> {
  const local = await loadWalletIndexState(wallet.address)
  if ((!options.force && !shouldSyncWalletIndexDeliveries(local)) || options.signal?.aborted) {
    return emptyResult(local)
  }

  const session = await ensureVerifiedBackendAccess({ signal: options.signal })
  if (
    !session ||
    !isSameAccountStorageScope(session.exoAddress, wallet.address) ||
    options.signal?.aborted
  ) {
    return emptyResult(local)
  }
  const fetched = await getWalletIndexDeliveriesWithBackend({ accessToken: session.accessToken })
  if (fetched.error) throw fetched.error
  if (options.signal?.aborted) return emptyResult(local)

  const reconciled = await reconcileWalletIndexLeases(wallet.address, fetched.activeLeases)
  if (fetched.data.length === 0) {
    return {
      ...emptyResult(reconciled.state),
      leaseStateChanged: reconciled.changed,
    }
  }

  const applied = await applyWalletIndexDeliveries(
    wallet.address,
    fetched.data.map((event) => ({
      eventId: event.eventId,
      chain: event.chain,
      leaseGeneration: event.leaseGeneration,
      kind: event.kind,
      payload: event.payload,
      expiresAt: event.expiresAt,
    })),
  )
  if (options.signal?.aborted) {
    return {
      state: applied.state,
      newTransactionCount: applied.newTransactionCount,
      leaseStateChanged: reconciled.changed,
      appliedEventIds: fetched.data.map((event) => event.eventId),
      acknowledgedEventIds: [],
    }
  }
  const acknowledged = await acknowledgeWalletIndexDeliveriesWithBackend(
    fetched.data.map((event) => event.eventId),
    { accessToken: session.accessToken },
  )
  if (acknowledged.error) {
    return {
      state: applied.state,
      newTransactionCount: applied.newTransactionCount,
      leaseStateChanged: reconciled.changed,
      appliedEventIds: fetched.data.map((event) => event.eventId),
      acknowledgedEventIds: [],
    }
  }
  return {
    state: applied.state,
    newTransactionCount: applied.newTransactionCount,
    leaseStateChanged: reconciled.changed,
    appliedEventIds: fetched.data.map((event) => event.eventId),
    acknowledgedEventIds: acknowledged.data,
  }
}
