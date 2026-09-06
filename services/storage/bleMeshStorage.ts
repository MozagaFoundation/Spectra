/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { getAppKeyValueStorage } from './keyValueStorage'
import { normalizeAccountStorageScope } from '@/lib/accountScope'
import {
  buildLocalCacheAad,
  openLocalCacheText,
  sealLocalCacheText,
  type LocalCacheCipher,
} from './localCacheCrypto'

const STORAGE_ROOT_PREFIX = 'ble_mesh_state:'
const STORAGE_PREFIX = `${STORAGE_ROOT_PREFIX}v3:`
const LEGACY_STORAGE_PREFIX = `${STORAGE_ROOT_PREFIX}v2:`
const STATE_VERSION = 3
const OUTBOUND_CORRELATION_VERSION = 1

export const MAX_BLE_OUTBOUND_CORRELATIONS = 128
export const MAX_BLE_OUTBOUND_CORRELATION_BYTES = 2 * 1024 * 1024

export interface PersistedBleRouteCapability {
  remoteIdentityId: string
  routeId: string
  secret: string
  epoch: number
  issuedAt: number
  expiresAt: number
  direction: 'outbound' | 'inbound'
}

export interface PersistedBleEnvelope {
  envelopeId: string
  routeId: string
  encoded: string
  createdAt: number
  expiresAt: number
  attempts: number
  lastAttemptAt: number
  deletionTokenHash: string
}

export interface PersistedBleReplayEntry {
  envelopeId: string
  acceptedAt: number
}

export type PersistedBleOutboundDeliveryState =
  | 'pending'
  | 'stored'
  | 'delivered'
  | 'failed'

export type PersistedBleOutboundFailureReason =
  | 'interrupted'
  | 'expired'
  | 'max_attempts'
  | 'queue_full'
  | 'transmission_failed'
  | 'receipt_timeout'

export interface PersistedBleOutboundCorrelation {
  version: 1
  envelopeId: string
  localMessageId: string
  remoteIdentityId: string
  encodedEnvelope: string
  encodedReturnCapability: string
  state: PersistedBleOutboundDeliveryState
  failureReason: PersistedBleOutboundFailureReason | null
  createdAt: number
  expiresAt: number
  updatedAt: number
  attempts: number
  sequence: number
}

export interface PersistedBleStaticKey {
  publicKey: string
  privateKey: string
}

export interface BleMeshPersistedState {
  version: 3
  staticKey: PersistedBleStaticKey | null
  capabilities: PersistedBleRouteCapability[]
  queuedEnvelopes: PersistedBleEnvelope[]
  replayEntries: PersistedBleReplayEntry[]
  outboundCorrelations: PersistedBleOutboundCorrelation[]
  outboundDeliverySequence: number
}

function storageKey(scope: string): string {
  return `${STORAGE_PREFIX}${scope}`
}

function legacyStorageKey(scope: string): string {
  return `${LEGACY_STORAGE_PREFIX}${scope}`
}

function stateAad(scope: string, version: 2 | 3): Uint8Array {
  return buildLocalCacheAad(['spectra', 'ble-mesh', `v${version}`, scope])
}

function emptyState(): BleMeshPersistedState {
  return {
    version: STATE_VERSION,
    staticKey: null,
    capabilities: [],
    queuedEnvelopes: [],
    replayEntries: [],
    outboundCorrelations: [],
    outboundDeliverySequence: 0,
  }
}

function isFiniteNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= 0
}

function isOutboundCorrelation(
  value: unknown,
): value is PersistedBleOutboundCorrelation {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<PersistedBleOutboundCorrelation>
  return record.version === OUTBOUND_CORRELATION_VERSION
    && typeof record.envelopeId === 'string'
    && record.envelopeId.length > 0
    && record.envelopeId.length <= 128
    && typeof record.localMessageId === 'string'
    && record.localMessageId.length > 0
    && record.localMessageId.length <= 512
    && typeof record.remoteIdentityId === 'string'
    && record.remoteIdentityId.length > 0
    && record.remoteIdentityId.length <= 512
    && typeof record.encodedEnvelope === 'string'
    && record.encodedEnvelope.length > 0
    && typeof record.encodedReturnCapability === 'string'
    && record.encodedReturnCapability.length > 0
    && ['pending', 'stored', 'delivered', 'failed'].includes(record.state ?? '')
    && (
      record.failureReason === null
      || [
        'interrupted',
        'expired',
        'max_attempts',
        'queue_full',
        'transmission_failed',
        'receipt_timeout',
      ].includes(record.failureReason ?? '')
    )
    && (
      (record.state === 'failed' && record.failureReason !== null)
      || (record.state !== 'failed' && record.failureReason === null)
    )
    && isFiniteNonNegativeInteger(record.createdAt)
    && isFiniteNonNegativeInteger(record.expiresAt)
    && isFiniteNonNegativeInteger(record.updatedAt)
    && isFiniteNonNegativeInteger(record.attempts)
    && isFiniteNonNegativeInteger(record.sequence)
    && record.sequence > 0
}

function assertOutboundCorrelationBounds(
  correlations: PersistedBleOutboundCorrelation[],
): void {
  if (
    correlations.length > MAX_BLE_OUTBOUND_CORRELATIONS
    || new TextEncoder().encode(JSON.stringify(correlations)).length
      > MAX_BLE_OUTBOUND_CORRELATION_BYTES
  ) {
    throw new Error('BLE outbound correlation state exceeds its bound')
  }
}

function parseState(value: string): BleMeshPersistedState {
  const parsed = JSON.parse(value) as Partial<BleMeshPersistedState>
  if (
    parsed.version !== STATE_VERSION
    || !Array.isArray(parsed.capabilities)
    || !Array.isArray(parsed.queuedEnvelopes)
    || !Array.isArray(parsed.replayEntries)
    || !Array.isArray(parsed.outboundCorrelations)
    || !isFiniteNonNegativeInteger(parsed.outboundDeliverySequence)
    || !parsed.outboundCorrelations.every(isOutboundCorrelation)
  ) {
    throw new Error('Unsupported BLE mesh state')
  }
  const correlationIds = new Set(
    parsed.outboundCorrelations.map((record) => record.envelopeId),
  )
  if (
    correlationIds.size !== parsed.outboundCorrelations.length
    || parsed.outboundCorrelations.some(
      (record) => record.sequence > parsed.outboundDeliverySequence!,
    )
  ) {
    throw new Error('Unsupported BLE mesh state')
  }
  assertOutboundCorrelationBounds(parsed.outboundCorrelations)
  return {
    version: STATE_VERSION,
    staticKey: parsed.staticKey ?? null,
    capabilities: parsed.capabilities,
    queuedEnvelopes: parsed.queuedEnvelopes,
    replayEntries: parsed.replayEntries,
    outboundCorrelations: parsed.outboundCorrelations,
    outboundDeliverySequence: parsed.outboundDeliverySequence,
  }
}

function parseLegacyState(value: string): BleMeshPersistedState {
  const parsed = JSON.parse(value) as {
    version?: number
    staticKey?: PersistedBleStaticKey | null
    capabilities?: PersistedBleRouteCapability[]
    queuedEnvelopes?: PersistedBleEnvelope[]
    replayEntries?: PersistedBleReplayEntry[]
  }
  if (
    parsed.version !== 2
    || !Array.isArray(parsed.capabilities)
    || !Array.isArray(parsed.queuedEnvelopes)
    || !Array.isArray(parsed.replayEntries)
  ) {
    throw new Error('Unsupported BLE mesh state')
  }
  return {
    version: STATE_VERSION,
    staticKey: parsed.staticKey ?? null,
    capabilities: parsed.capabilities,
    queuedEnvelopes: parsed.queuedEnvelopes,
    replayEntries: parsed.replayEntries,
    outboundCorrelations: [],
    outboundDeliverySequence: 0,
  }
}

async function openState(
  scope: string,
  key: string,
  version: 2 | 3,
  parser: (value: string) => BleMeshPersistedState,
): Promise<BleMeshPersistedState | null> {
  const stored = await getAppKeyValueStorage().getItem(key)
  if (!stored) return null
  try {
    const cipher = JSON.parse(stored) as LocalCacheCipher
    const plaintext = await openLocalCacheText(
      scope,
      'ble',
      cipher,
      stateAad(scope, version),
    )
    return parser(plaintext)
  } catch {
    await getAppKeyValueStorage().removeItem(key)
    throw new Error('BLE mesh state authentication failed')
  }
}

export async function loadBleMeshState(walletAddress: string): Promise<BleMeshPersistedState> {
  const scope = normalizeAccountStorageScope(walletAddress)
  if (!scope) throw new Error('BLE mesh wallet scope is required')

  const current = await openState(scope, storageKey(scope), 3, parseState)
  if (current) return current

  const legacy = await openState(
    scope,
    legacyStorageKey(scope),
    2,
    parseLegacyState,
  )
  if (!legacy) return emptyState()

  await saveBleMeshState(scope, legacy)
  await getAppKeyValueStorage().removeItem(legacyStorageKey(scope))
  return legacy
}

export async function saveBleMeshState(
  walletAddress: string,
  state: BleMeshPersistedState,
): Promise<void> {
  const scope = normalizeAccountStorageScope(walletAddress)
  if (!scope) throw new Error('BLE mesh wallet scope is required')
  if (state.version !== STATE_VERSION) throw new Error('Unsupported BLE mesh state')
  assertOutboundCorrelationBounds(state.outboundCorrelations)

  const cipher = await sealLocalCacheText(
    scope,
    'ble',
    JSON.stringify(state),
    stateAad(scope, 3),
  )
  await getAppKeyValueStorage().setItem(storageKey(scope), JSON.stringify(cipher))
}

export async function clearBleMeshState(walletAddress?: string): Promise<void> {
  const scope = normalizeAccountStorageScope(walletAddress)
  if (scope) {
    await Promise.all([
      getAppKeyValueStorage().removeItem(storageKey(scope)),
      getAppKeyValueStorage().removeItem(legacyStorageKey(scope)),
    ])
    return
  }

  const keys = await getAppKeyValueStorage().getAllKeys()
  await getAppKeyValueStorage().multiRemove(keys.filter(
    (key) => key.startsWith(STORAGE_ROOT_PREFIX),
  ))
}
