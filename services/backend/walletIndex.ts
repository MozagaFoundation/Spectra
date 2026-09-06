/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 */

import type {
  VdfProof,
  VdfPublicParams,
  WalletIndexAddressProof,
  WalletIndexChain,
} from '@spectra/privacy-protocol'
import { backendRequest, isSpectraBackendConfigured, type SpectraBackendOptions } from './client'

export { isSpectraBackendConfigured }
export type { WalletIndexAddressProof, WalletIndexChain }

export interface WalletIndexActivationChallenge {
  activationId: string
  chain: WalletIndexChain
  address: string
  nonceHex: string
  expiresAt: number
}

export interface WalletIndexVdfChallenge {
  activationId: string
  vdfChallenge: {
    challengeId: string
    nonceHex: string
    bindingHash: string
    expiresAt: number
    notBeforeAt: number
    params: VdfPublicParams
  }
}

export interface WalletIndexActivation {
  chain: WalletIndexChain
  address: string
  baselineHeight: number
  leaseGeneration: number
  activatedAt: number
  expiresAt: number
}

export interface WalletIndexDeliveryEvent {
  eventId: string
  chain: WalletIndexChain
  addressHash: string
  leaseGeneration: number
  kind: 'snapshot' | 'transaction' | 'balance'
  payload: unknown
  createdAt: number
  expiresAt: number
}

export interface WalletIndexActiveLease {
  chain: WalletIndexChain
  address: string
  leaseGeneration: number
  baselineHeight: number
  activatedAt: number
  expiresAt: number
}

function unavailable(): Error {
  return new Error('Wallet indexing is unavailable')
}

function validActivationChallenge(value: unknown): value is WalletIndexActivationChallenge {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return typeof row.activationId === 'string' &&
    /^wia1\.[0-9a-f]{32}$/.test(row.activationId) &&
    isWalletIndexChain(row.chain) &&
    typeof row.address === 'string' &&
    row.address.length >= 26 &&
    row.address.length <= 96 &&
    typeof row.nonceHex === 'string' &&
    /^[0-9a-f]{64}$/.test(row.nonceHex) &&
    Number.isSafeInteger(row.expiresAt)
}

function validVdfChallenge(value: unknown): value is WalletIndexVdfChallenge {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  const challenge = row.vdfChallenge
  if (!challenge || typeof challenge !== 'object') return false
  const nested = challenge as Record<string, unknown>
  return typeof row.activationId === 'string' &&
    /^wia1\.[0-9a-f]{32}$/.test(row.activationId) &&
    typeof nested.challengeId === 'string' &&
    /^vdfc1\.[0-9a-f]{32}$/.test(nested.challengeId) &&
    typeof nested.nonceHex === 'string' &&
    /^[0-9a-f]{64}$/.test(nested.nonceHex) &&
    typeof nested.bindingHash === 'string' &&
    /^[0-9a-f]{64}$/.test(nested.bindingHash) &&
    Number.isSafeInteger(nested.expiresAt) &&
    Number.isSafeInteger(nested.notBeforeAt) &&
    Boolean(nested.params)
}

function validActivation(value: unknown): value is WalletIndexActivation {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return isWalletIndexChain(row.chain) &&
    typeof row.address === 'string' &&
    Number.isSafeInteger(row.baselineHeight) &&
    typeof row.leaseGeneration === 'number' &&
    Number.isSafeInteger(row.leaseGeneration) &&
    row.leaseGeneration > 0 &&
    Number.isSafeInteger(row.activatedAt) &&
    Number.isSafeInteger(row.expiresAt)
}

function isWalletIndexChain(value: unknown): value is WalletIndexChain {
  return value === 'mozaga' ||
    value === 'ethereum' ||
    value === 'bitcoin' ||
    value === 'solana' ||
    value === 'tron'
}

export async function beginWalletIndexActivationWithBackend(
  chain: WalletIndexChain,
  address: string,
  options: SpectraBackendOptions,
): Promise<{ data: WalletIndexActivationChallenge | null; error: Error | null }> {
  if (!isSpectraBackendConfigured(options.baseUrl)) return { data: null, error: unavailable() }
  try {
    const data = await backendRequest<unknown>('/v1/wallet-index/activations', {
      method: 'POST',
      body: { chain, address },
    }, options)
    if (!validActivationChallenge(data)) throw new Error('Invalid wallet activation response')
    return { data, error: null }
  } catch (error) {
    return { data: null, error: error as Error }
  }
}

export async function issueWalletIndexActivationVdfWithBackend(
  activationId: string,
  addressProof: WalletIndexAddressProof,
  options: SpectraBackendOptions,
): Promise<{ data: WalletIndexVdfChallenge | null; error: Error | null }> {
  if (!isSpectraBackendConfigured(options.baseUrl)) return { data: null, error: unavailable() }
  try {
    const data = await backendRequest<unknown>('/v1/wallet-index/activations/vdf-challenge', {
      method: 'POST',
      body: { activationId, addressProof },
    }, options)
    if (!validVdfChallenge(data)) throw new Error('Invalid wallet activation VDF response')
    return { data, error: null }
  } catch (error) {
    return { data: null, error: error as Error }
  }
}

export async function completeWalletIndexActivationWithBackend(
  activationId: string,
  vdfProof: VdfProof,
  options: SpectraBackendOptions,
): Promise<{ data: WalletIndexActivation | null; error: Error | null }> {
  if (!isSpectraBackendConfigured(options.baseUrl)) return { data: null, error: unavailable() }
  try {
    const data = await backendRequest<unknown>('/v1/wallet-index/activations/complete', {
      method: 'POST',
      body: { activationId, vdfProof },
    }, options)
    if (!validActivation(data)) throw new Error('Invalid wallet activation response')
    return { data, error: null }
  } catch (error) {
    return { data: null, error: error as Error }
  }
}

export async function getWalletIndexDeliveriesWithBackend(
  options: SpectraBackendOptions,
): Promise<{
  data: WalletIndexDeliveryEvent[]
  activeLeases: WalletIndexActiveLease[]
  error: Error | null
}> {
  if (!isSpectraBackendConfigured(options.baseUrl)) {
    return { data: [], activeLeases: [], error: unavailable() }
  }
  try {
    const response = await backendRequest<{ events?: unknown; activeLeases?: unknown }>(
      '/v1/wallet-index/deliveries?limit=100',
      {
      method: 'GET',
      },
      options,
    )
    if (!Array.isArray(response.events) || !Array.isArray(response.activeLeases)) {
      throw new Error('Invalid wallet delivery response')
    }
    const data = response.events.filter(isWalletIndexDeliveryEvent)
    const activeLeases = response.activeLeases.filter(isWalletIndexActiveLease)
    if (data.length !== response.events.length || activeLeases.length !== response.activeLeases.length) {
      throw new Error('Invalid wallet delivery response')
    }
    return { data, activeLeases, error: null }
  } catch (error) {
    return { data: [], activeLeases: [], error: error as Error }
  }
}

export async function acknowledgeWalletIndexDeliveriesWithBackend(
  eventIds: string[],
  options: SpectraBackendOptions,
): Promise<{ data: string[]; error: Error | null }> {
  if (eventIds.length === 0) return { data: [], error: null }
  if (!isSpectraBackendConfigured(options.baseUrl)) return { data: [], error: unavailable() }
  try {
    const response = await backendRequest<{ acknowledgedEventIds?: unknown }>(
      '/v1/wallet-index/deliveries/ack',
      { method: 'POST', body: { eventIds } },
      options,
    )
    if (
      !Array.isArray(response.acknowledgedEventIds) ||
      response.acknowledgedEventIds.some((eventId) =>
        typeof eventId !== 'string' || !/^wie1\.[0-9a-f]{32}$/.test(eventId)
      )
    ) {
      throw new Error('Invalid wallet delivery acknowledgement')
    }
    return { data: response.acknowledgedEventIds, error: null }
  } catch (error) {
    return { data: [], error: error as Error }
  }
}

function isWalletIndexDeliveryEvent(value: unknown): value is WalletIndexDeliveryEvent {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return typeof row.eventId === 'string' &&
    /^wie1\.[0-9a-f]{32}$/.test(row.eventId) &&
    isWalletIndexChain(row.chain) &&
    typeof row.addressHash === 'string' &&
    /^[0-9a-f]{64}$/.test(row.addressHash) &&
    typeof row.leaseGeneration === 'number' &&
    Number.isSafeInteger(row.leaseGeneration) &&
    row.leaseGeneration > 0 &&
    (row.kind === 'snapshot' || row.kind === 'transaction' || row.kind === 'balance') &&
    typeof row.payload === 'object' &&
    row.payload !== null &&
    typeof row.createdAt === 'number' &&
    Number.isSafeInteger(row.createdAt) &&
    row.createdAt >= 0 &&
    typeof row.expiresAt === 'number' &&
    Number.isSafeInteger(row.expiresAt) &&
    row.expiresAt > row.createdAt
}

function isWalletIndexActiveLease(value: unknown): value is WalletIndexActiveLease {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return isWalletIndexChain(row.chain) &&
    typeof row.address === 'string' &&
    row.address.length >= 26 &&
    row.address.length <= 96 &&
    typeof row.leaseGeneration === 'number' &&
    Number.isSafeInteger(row.leaseGeneration) &&
    row.leaseGeneration > 0 &&
    typeof row.baselineHeight === 'number' &&
    Number.isSafeInteger(row.baselineHeight) &&
    row.baselineHeight >= 0 &&
    typeof row.activatedAt === 'number' &&
    Number.isSafeInteger(row.activatedAt) &&
    row.activatedAt >= 0 &&
    typeof row.expiresAt === 'number' &&
    Number.isSafeInteger(row.expiresAt) &&
    row.expiresAt > row.activatedAt
}
