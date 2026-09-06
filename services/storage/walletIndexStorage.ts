/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 */

import { getAppKeyValueStorage } from './keyValueStorage'
import { normalizeAccountStorageScope } from '@/lib/accountScope'
import {
  buildLocalCacheAad,
  openLocalCacheText,
  sealLocalCacheText,
  type LocalCacheCipher,
} from './localCacheCrypto'

const STORAGE_ROOT_PREFIX = 'wallet_index_state:'
const STORAGE_PREFIX = `${STORAGE_ROOT_PREFIX}v1:`
const STATE_VERSION = 1 as const

export type WalletIndexLocalChain = 'mozaga' | 'ethereum' | 'bitcoin' | 'solana' | 'tron'

export interface WalletIndexLocalActivation {
  chain: WalletIndexLocalChain
  address: string
  baselineHeight: number
  leaseGeneration: number
  activatedAt: number
  expiresAt: number
}

export interface WalletIndexLocalBalance {
  chain: WalletIndexLocalChain
  address: string
  nativeBalanceAtomic: string
  nativeSymbol: string
  tokenBalances: unknown[]
  blockHeight: number
  updatedAt: number
}

export interface WalletIndexLocalTransaction {
  chain: WalletIndexLocalChain
  address: string
  txHash: string
  occurredAt: number
  direction: 'inbound' | 'outbound' | 'self' | 'unknown'
  status: 'pending' | 'confirmed' | 'failed' | 'dropped'
  blockHeight: number
  nativeAmountAtomic: string
  nativeSymbol: string
  feeAtomic: string
  counterpartyAddress: string
  tokenTransfers: unknown[]
}

export interface WalletIndexDeliveryInput {
  eventId: string
  chain: WalletIndexLocalChain
  leaseGeneration: number
  kind: 'snapshot' | 'transaction' | 'balance'
  payload: unknown
  expiresAt: number
}

export interface WalletIndexLocalLease {
  chain: WalletIndexLocalChain
  address: string
  leaseGeneration: number
  baselineHeight: number
  activatedAt: number
  expiresAt: number
}

export interface WalletIndexLocalState {
  version: 1
  activations: WalletIndexLocalActivation[]
  balances: WalletIndexLocalBalance[]
  transactions: WalletIndexLocalTransaction[]
  unreadEventIdsByChain: Partial<Record<WalletIndexLocalChain, string[]>>
  appliedEvents: Array<{ eventId: string; expiresAt: number }>
  remoteLeaseCheckAt: number
}

const stateOperationTails = new Map<string, Promise<void>>()
let clearAllInProgress: Promise<void> | null = null

function storageKey(scope: string): string {
  return `${STORAGE_PREFIX}${scope}`
}

function stateAad(scope: string): Uint8Array {
  return buildLocalCacheAad(['spectra', 'wallet-index', 'v1', scope])
}

function emptyState(): WalletIndexLocalState {
  return {
    version: STATE_VERSION,
    activations: [],
    balances: [],
    transactions: [],
    unreadEventIdsByChain: {},
    appliedEvents: [],
    remoteLeaseCheckAt: 0,
  }
}

function isChain(value: unknown): value is WalletIndexLocalChain {
  return value === 'mozaga' ||
    value === 'ethereum' ||
    value === 'bitcoin' ||
    value === 'solana' ||
    value === 'tron'
}

function isSafeTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isActivation(value: unknown): value is WalletIndexLocalActivation {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return isChain(row.chain) &&
    isSafeAddress(row.address) &&
    isSafeTimestamp(row.baselineHeight) &&
    typeof row.leaseGeneration === 'number' &&
    Number.isSafeInteger(row.leaseGeneration) &&
    row.leaseGeneration > 0 &&
    isSafeTimestamp(row.activatedAt) &&
    isSafeTimestamp(row.expiresAt) &&
    row.expiresAt > row.activatedAt
}

function isBalance(value: unknown): value is WalletIndexLocalBalance {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return isChain(row.chain) &&
    isSafeAddress(row.address) &&
    isAtomic(row.nativeBalanceAtomic) &&
    typeof row.nativeSymbol === 'string' &&
    row.nativeSymbol.length > 0 &&
    row.nativeSymbol.length <= 16 &&
    Array.isArray(row.tokenBalances) &&
    isSafeTimestamp(row.blockHeight) &&
    isSafeTimestamp(row.updatedAt)
}

function isTransaction(value: unknown): value is WalletIndexLocalTransaction {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return isChain(row.chain) &&
    isSafeAddress(row.address) &&
    typeof row.txHash === 'string' &&
    row.txHash.length > 0 &&
    row.txHash.length <= 256 &&
    isSafeTimestamp(row.occurredAt) &&
    (row.direction === 'inbound' ||
      row.direction === 'outbound' ||
      row.direction === 'self' ||
      row.direction === 'unknown') &&
    (row.status === 'pending' ||
      row.status === 'confirmed' ||
      row.status === 'failed' ||
      row.status === 'dropped') &&
    isSafeTimestamp(row.blockHeight) &&
    isAtomic(row.nativeAmountAtomic) &&
    typeof row.nativeSymbol === 'string' &&
    row.nativeSymbol.length > 0 &&
    row.nativeSymbol.length <= 16 &&
    typeof row.feeAtomic === 'string' &&
    row.feeAtomic.length <= 128 &&
    typeof row.counterpartyAddress === 'string' &&
    row.counterpartyAddress.length <= 160 &&
    Array.isArray(row.tokenTransfers)
}

function isAtomic(value: unknown): value is string {
  return typeof value === 'string' && /^\d+$/.test(value) && value.length <= 128
}

function isSafeAddress(value: unknown): value is string {
  return typeof value === 'string' &&
    value.length >= 26 &&
    value.length <= 96 &&
    !/[\u0000-\u001f\u007f]/.test(value)
}

function parseState(value: string): WalletIndexLocalState {
  const parsed = JSON.parse(value) as Partial<WalletIndexLocalState>
  if (
    parsed.version !== STATE_VERSION ||
    !Array.isArray(parsed.activations) ||
    !Array.isArray(parsed.balances) ||
    !Array.isArray(parsed.transactions) ||
    !parsed.unreadEventIdsByChain ||
    typeof parsed.unreadEventIdsByChain !== 'object' ||
    !Array.isArray(parsed.appliedEvents) ||
    (parsed.remoteLeaseCheckAt !== undefined && !isSafeTimestamp(parsed.remoteLeaseCheckAt)) ||
    !parsed.activations.every(isActivation) ||
    !parsed.balances.every(isBalance) ||
    !parsed.transactions.every(isTransaction) ||
    !parsed.appliedEvents.every((event) =>
      event &&
      typeof event === 'object' &&
      /^wie1\.[0-9a-f]{32}$/.test((event as { eventId?: unknown }).eventId as string) &&
      isSafeTimestamp((event as { expiresAt?: unknown }).expiresAt)
    )
  ) {
    throw new Error('Unsupported wallet index state')
  }
  const activationKeys = new Set(parsed.activations.map(activationKey))
  const balanceKeys = new Set(parsed.balances.map(balanceKey))
  const transactionKeys = new Set(parsed.transactions.map(transactionKey))
  const appliedEventIds = new Set(parsed.appliedEvents.map((event) => event.eventId))
  if (
    activationKeys.size !== parsed.activations.length ||
    balanceKeys.size !== parsed.balances.length ||
    transactionKeys.size !== parsed.transactions.length ||
    appliedEventIds.size !== parsed.appliedEvents.length
  ) {
    throw new Error('Unsupported wallet index state')
  }
  for (const [chain, eventIds] of Object.entries(parsed.unreadEventIdsByChain)) {
    if (!isChain(chain) || !Array.isArray(eventIds) || eventIds.some((eventId) =>
      typeof eventId !== 'string' || !/^wie1\.[0-9a-f]{32}$/.test(eventId)
    )) {
      throw new Error('Unsupported wallet index state')
    }
  }
  return {
    version: STATE_VERSION,
    activations: parsed.activations,
    balances: parsed.balances,
    transactions: parsed.transactions,
    unreadEventIdsByChain: parsed.unreadEventIdsByChain,
    appliedEvents: parsed.appliedEvents,
    remoteLeaseCheckAt: parsed.remoteLeaseCheckAt ?? 0,
  } as WalletIndexLocalState
}

function activationKey(value: Pick<WalletIndexLocalActivation, 'chain' | 'address'>): string {
  return `${value.chain}:${normalizeAddress(value.chain, value.address)}`
}

function balanceKey(value: Pick<WalletIndexLocalBalance, 'chain' | 'address'>): string {
  return activationKey(value)
}

function transactionKey(value: Pick<WalletIndexLocalTransaction, 'chain' | 'address' | 'txHash'>): string {
  return `${activationKey(value)}:${value.txHash}`
}

function normalizeAddress(chain: WalletIndexLocalChain, address: string): string {
  return chain === 'ethereum' || chain === 'mozaga' || chain === 'bitcoin'
    ? address.toLowerCase()
    : address
}

async function saveState(scope: string, state: WalletIndexLocalState): Promise<void> {
  const cipher = await sealLocalCacheText(
    scope,
    'wallet-index',
    JSON.stringify(state),
    stateAad(scope),
  )
  await getAppKeyValueStorage().setItem(storageKey(scope), JSON.stringify(cipher))
}

async function runScopeOperation<T>(scope: string, operation: () => Promise<T>): Promise<T> {
  const pendingClear = clearAllInProgress
  if (pendingClear) await pendingClear
  const previous = stateOperationTails.get(scope) ?? Promise.resolve()
  let release: (() => void) | undefined
  const current = new Promise<void>((resolve) => {
    release = resolve
  })
  const tail = previous.catch(() => undefined).then(() => current)
  stateOperationTails.set(scope, tail)
  await previous.catch(() => undefined)
  try {
    return await operation()
  } finally {
    release?.()
    if (stateOperationTails.get(scope) === tail) stateOperationTails.delete(scope)
  }
}

async function loadStateForScope(scope: string): Promise<WalletIndexLocalState> {
  const stored = await getAppKeyValueStorage().getItem(storageKey(scope))
  if (!stored) return emptyState()
  try {
    const cipher = JSON.parse(stored) as LocalCacheCipher
    return parseState(await openLocalCacheText(scope, 'wallet-index', cipher, stateAad(scope)))
  } catch {
    await getAppKeyValueStorage().removeItem(storageKey(scope))
    throw new Error('Wallet index state authentication failed')
  }
}

export async function loadWalletIndexState(walletAddress: string): Promise<WalletIndexLocalState> {
  const scope = normalizeAccountStorageScope(walletAddress)
  if (!scope) throw new Error('Wallet index storage scope is required')
  return await loadStateForScope(scope)
}

export async function recordWalletIndexActivation(
  walletAddress: string,
  activation: WalletIndexLocalActivation,
): Promise<WalletIndexLocalState> {
  const scope = normalizeAccountStorageScope(walletAddress)
  if (!scope || !isActivation(activation)) throw new Error('Invalid wallet index activation')
  return await runScopeOperation(scope, async () => {
    const state = await loadStateForScope(scope)
    const key = activationKey(activation)
    state.activations = [...state.activations.filter((entry) => activationKey(entry) !== key), activation]
    state.remoteLeaseCheckAt = 0
    await saveState(scope, state)
    return state
  })
}

export function shouldSyncWalletIndexDeliveries(state: WalletIndexLocalState): boolean {
  return state.activations.some((activation) => activation.expiresAt > Date.now()) ||
    (state.activations.length > 0 && state.remoteLeaseCheckAt === 0)
}

function isLocalLease(value: unknown): value is WalletIndexLocalLease {
  if (!value || typeof value !== 'object') return false
  const lease = value as Record<string, unknown>
  return isChain(lease.chain) &&
    isSafeAddress(lease.address) &&
    typeof lease.leaseGeneration === 'number' &&
    Number.isSafeInteger(lease.leaseGeneration) &&
    lease.leaseGeneration > 0 &&
    isSafeTimestamp(lease.baselineHeight) &&
    isSafeTimestamp(lease.activatedAt) &&
    isSafeTimestamp(lease.expiresAt) &&
    lease.expiresAt > lease.activatedAt
}

export async function reconcileWalletIndexLeases(
  walletAddress: string,
  leases: WalletIndexLocalLease[],
): Promise<{ state: WalletIndexLocalState; changed: boolean }> {
  const scope = normalizeAccountStorageScope(walletAddress)
  if (!scope || !leases.every(isLocalLease)) throw new Error('Invalid wallet index lease state')
  return await runScopeOperation(scope, async () => {
    const state = await loadStateForScope(scope)
    const byActivation = new Map(leases.map((lease) => [activationKey(lease), lease]))
    const now = Date.now()
    let changed = false
    state.activations = state.activations.map((activation) => {
      const lease = byActivation.get(activationKey(activation))
      if (!lease) {
        const expiresAt = Math.min(activation.expiresAt, now)
        if (expiresAt !== activation.expiresAt) changed = true
        return expiresAt === activation.expiresAt ? activation : { ...activation, expiresAt }
      }
      const nextActivation: WalletIndexLocalActivation = {
        chain: activation.chain,
        address: activation.address,
        baselineHeight: lease.baselineHeight,
        leaseGeneration: lease.leaseGeneration,
        activatedAt: lease.activatedAt,
        expiresAt: lease.expiresAt,
      }
      if (
        nextActivation.baselineHeight !== activation.baselineHeight ||
        nextActivation.leaseGeneration !== activation.leaseGeneration ||
        nextActivation.activatedAt !== activation.activatedAt ||
        nextActivation.expiresAt !== activation.expiresAt
      ) {
        changed = true
        return nextActivation
      }
      return activation
    })
    const nextLeaseCheckAt = leases.length === 0 ? now : 0
    if (state.remoteLeaseCheckAt !== nextLeaseCheckAt) changed = true
    state.remoteLeaseCheckAt = nextLeaseCheckAt
    if (changed) await saveState(scope, state)
    return { state, changed }
  })
}

export async function applyWalletIndexDeliveries(
  walletAddress: string,
  events: WalletIndexDeliveryInput[],
): Promise<{ state: WalletIndexLocalState; newTransactionCount: number }> {
  const scope = normalizeAccountStorageScope(walletAddress)
  if (!scope) throw new Error('Wallet index storage scope is required')
  return await runScopeOperation(scope, async () => {
    const state = await loadStateForScope(scope)
    const appliedEventIds = new Set(state.appliedEvents.map((event) => event.eventId))
    let newTransactionCount = 0

    for (const event of events) {
      validateDelivery(event)
      if (appliedEventIds.has(event.eventId)) continue
      const payload = parseDeliveryPayload(event)
      const activation = state.activations.find((entry) => activationKey(entry) === activationKey(payload))
      if (!activation || activation.expiresAt <= Date.now()) {
        throw new Error('Wallet index delivery does not match an active local activation')
      }
      if (activation.leaseGeneration > event.leaseGeneration) {
        appliedEventIds.add(event.eventId)
        state.appliedEvents.push({ eventId: event.eventId, expiresAt: event.expiresAt })
        continue
      }
      if (activation.leaseGeneration !== event.leaseGeneration) {
        throw new Error('Wallet index delivery generation is unknown')
      }
      if (event.kind === 'transaction') {
        const key = transactionKey(payload.transaction)
        const wasKnown = state.transactions.some((entry) => transactionKey(entry) === key)
        state.transactions = [
          ...state.transactions.filter((entry) => transactionKey(entry) !== key),
          payload.transaction,
        ]
        if (!wasKnown) {
          state.unreadEventIdsByChain[event.chain] = [
            ...(state.unreadEventIdsByChain[event.chain] ?? []),
            event.eventId,
          ]
          newTransactionCount += 1
        }
      } else {
        state.balances = [
          ...state.balances.filter((entry) => balanceKey(entry) !== balanceKey(payload.balance)),
          payload.balance,
        ]
      }
      activation.expiresAt = Math.max(activation.expiresAt, payload.leaseExpiresAt)
      appliedEventIds.add(event.eventId)
      state.appliedEvents.push({ eventId: event.eventId, expiresAt: event.expiresAt })
    }
    state.appliedEvents = state.appliedEvents.filter((event) => event.expiresAt > Date.now())
    await saveState(scope, state)
    return { state, newTransactionCount }
  })
}

export async function markWalletIndexTransactionsRead(
  walletAddress: string,
  chain?: WalletIndexLocalChain,
): Promise<WalletIndexLocalState> {
  const scope = normalizeAccountStorageScope(walletAddress)
  if (!scope) throw new Error('Wallet index storage scope is required')
  return await runScopeOperation(scope, async () => {
    const state = await loadStateForScope(scope)
    if (chain) {
      delete state.unreadEventIdsByChain[chain]
    } else {
      state.unreadEventIdsByChain = {}
    }
    await saveState(scope, state)
    return state
  })
}

export async function clearWalletIndexState(walletAddress?: string): Promise<void> {
  const scope = normalizeAccountStorageScope(walletAddress)
  if (scope) {
    await runScopeOperation(scope, async () => {
      await getAppKeyValueStorage().removeItem(storageKey(scope))
    })
    return
  }
  if (clearAllInProgress) await clearAllInProgress
  let release: (() => void) | undefined
  const clearing = new Promise<void>((resolve) => {
    release = resolve
  })
  clearAllInProgress = clearing
  try {
    await Promise.all([...stateOperationTails.values()].map((tail) => tail.catch(() => undefined)))
    const keys = await getAppKeyValueStorage().getAllKeys()
    await getAppKeyValueStorage().multiRemove(keys.filter((key) => key.startsWith(STORAGE_ROOT_PREFIX)))
  } finally {
    release?.()
    if (clearAllInProgress === clearing) clearAllInProgress = null
  }
}

function validateDelivery(event: WalletIndexDeliveryInput): void {
  if (
    !/^wie1\.[0-9a-f]{32}$/.test(event.eventId) ||
    !isChain(event.chain) ||
    !Number.isSafeInteger(event.leaseGeneration) ||
    event.leaseGeneration < 1 ||
    !['snapshot', 'transaction', 'balance'].includes(event.kind) ||
    !isSafeTimestamp(event.expiresAt)
  ) {
    throw new Error('Invalid wallet index delivery')
  }
}

function parseDeliveryPayload(event: WalletIndexDeliveryInput): {
  chain: WalletIndexLocalChain
  address: string
  balance: WalletIndexLocalBalance
  transaction: WalletIndexLocalTransaction
  leaseExpiresAt: number
} {
  if (!event.payload || typeof event.payload !== 'object') {
    throw new Error('Invalid wallet index delivery payload')
  }
  const value = event.payload as Record<string, unknown>
  if (
    value.chain !== event.chain ||
    !isSafeAddress(value.address) ||
    !isSafeTimestamp(value.leaseExpiresAt)
  ) {
    throw new Error('Invalid wallet index delivery payload')
  }
  const base = { chain: event.chain, address: value.address as string }
  if (event.kind === 'transaction') {
    const transaction = value.transaction
    if (!transaction || typeof transaction !== 'object') {
      throw new Error('Invalid wallet transaction delivery')
    }
    const parsed = { ...base, ...(transaction as Record<string, unknown>) }
    if (!isTransaction(parsed)) throw new Error('Invalid wallet transaction delivery')
    return {
      ...base,
      balance: emptyBalance(base),
      transaction: parsed,
      leaseExpiresAt: value.leaseExpiresAt,
    }
  }
  const balance = value.balance
  if (!balance || typeof balance !== 'object') throw new Error('Invalid wallet balance delivery')
  const parsed = { ...base, ...(balance as Record<string, unknown>) }
  if (!isBalance(parsed)) throw new Error('Invalid wallet balance delivery')
  return {
    ...base,
    balance: parsed,
    transaction: emptyTransaction(base),
    leaseExpiresAt: value.leaseExpiresAt,
  }
}

function emptyBalance(
  value: Pick<WalletIndexLocalBalance, 'chain' | 'address'>,
): WalletIndexLocalBalance {
  return {
    ...value,
    nativeBalanceAtomic: '0',
    nativeSymbol: '',
    tokenBalances: [],
    blockHeight: 0,
    updatedAt: 0,
  }
}

function emptyTransaction(
  value: Pick<WalletIndexLocalTransaction, 'chain' | 'address'>,
): WalletIndexLocalTransaction {
  return {
    ...value,
    txHash: '',
    occurredAt: 0,
    direction: 'unknown',
    status: 'pending',
    blockHeight: 0,
    nativeAmountAtomic: '0',
    nativeSymbol: '',
    feeAtomic: '',
    counterpartyAddress: '',
    tokenTransfers: [],
  }
}
