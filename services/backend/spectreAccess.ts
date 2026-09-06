/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { SPECTRA_API_URL } from '@/lib/constants'
import { isSameAccountStorageScope } from '@/lib/accountScope'
import { translateMessage as translate } from '@/lib/i18n/messages'
import {
  finalizeSpectreBlindToken,
  prepareSpectreBlindTokenRequest,
} from '@spectra/privacy-protocol'
import type {
  AccountBlindTokenPurpose,
  SpectreAccessState,
  SpectreActivationGrant,
  SpectreBlindActivationToken,
  SpectreBlindPublicParams,
  SpectreBlindTokenIssueReceipt,
  SpectreCloseResult,
} from '@spectra/privacy-protocol'

import { getCachedBackendAccessToken, ensureVerifiedBackendAccess } from './session'
import {
  persistStoredBlindToken,
  readStoredBlindToken,
  removeStoredBlindTokens,
  type StoredSpectreBlindActivationToken,
} from './torBlindTokenStorage'
import { getAppVersionHeaders } from './appVersion'
import { recordAppUpdateRequiredResponse } from './request'
import {
  readPendingRemoteActivationWalletAddress,
  writePendingRemoteActivationWalletAddress,
} from './spectreActivationStorage'
import { buildBackendUrl } from './url'
import { torAwareFetch } from '@/services/tor/torFetch'
import { useSpectreAccessStore } from '@/store/spectreAccessStore'

const SPECTRE_EPHEMERAL_EXPIRED_ERROR =
  'This ephemeral Spectre address expired. Spectre Mode has been disabled on this device.'
const ACCOUNT_BLIND_TOKEN_DOMAIN_PREFIX = 'spectra.mobile.account-ticket.v1'

let spectreAccessDeadlineTimer: ReturnType<typeof setTimeout> | null = null

function clearSpectreAccessDeadlineTimer(): void {
  if (spectreAccessDeadlineTimer) {
    clearTimeout(spectreAccessDeadlineTimer)
    spectreAccessDeadlineTimer = null
  }
}

function normalizeNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function normalizeBoolean(value: unknown): boolean {
  return value === true
}

function normalizeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function normalizeBlindAlgorithm(value: unknown): 'rsa-fdh-v1' {
  return value === 'rsa-fdh-v1' ? 'rsa-fdh-v1' : 'rsa-fdh-v1'
}

function normalizeAccountBlindTokenPurpose(value: unknown): AccountBlindTokenPurpose | null {
  return value === 'spectre_ephemeral' ? value : null
}

function domainForAccountBlindTokenPurpose(purpose: AccountBlindTokenPurpose): string {
  return `${ACCOUNT_BLIND_TOKEN_DOMAIN_PREFIX}.${purpose}`
}

function normalizeSpectreAccessState(value: unknown): SpectreAccessState {
  const record = value && typeof value === 'object'
    ? value as Partial<SpectreAccessState>
    : {}

  return {
    walletAddress: normalizeNullableString(record.walletAddress),
    canRequestEphemeralToken: normalizeBoolean(record.canRequestEphemeralToken),
    spectreTokenLastIssuedAt: normalizeNullableString(record.spectreTokenLastIssuedAt),
    spectreTokenAvailableAt: normalizeNullableString(record.spectreTokenAvailableAt),
    currentWalletIsSpectre: normalizeBoolean(record.currentWalletIsSpectre),
    currentSpectreIsEphemeral: normalizeBoolean(record.currentSpectreIsEphemeral),
    currentSpectreExpiresAt: normalizeNullableString(record.currentSpectreExpiresAt),
    refreshedAt: normalizeNullableString(record.refreshedAt) ?? new Date().toISOString(),
  }
}

function normalizeSpectreBlindPublicParams(value: unknown): SpectreBlindPublicParams {
  const record = value && typeof value === 'object'
    ? value as Partial<SpectreBlindPublicParams>
    : {}
  const purpose = normalizeAccountBlindTokenPurpose(record.purpose)

  return {
    algorithm: normalizeBlindAlgorithm(record.algorithm),
    domain: normalizeNullableString(record.domain)
      ?? domainForAccountBlindTokenPurpose(purpose ?? 'spectre_ephemeral'),
    issueIntervalHours: normalizeNumber(record.issueIntervalHours, 24),
    keyId: normalizeNullableString(record.keyId) ?? '',
    purpose: purpose ?? 'spectre_ephemeral',
    modulusHex: normalizeNullableString(record.modulusHex) ?? '',
    publicExponentHex: normalizeNullableString(record.publicExponentHex) ?? '',
  }
}

function normalizeSpectreBlindTokenIssueReceipt(value: unknown): SpectreBlindTokenIssueReceipt {
  const record = value && typeof value === 'object'
    ? value as Partial<SpectreBlindTokenIssueReceipt>
    : {}

  return {
    walletAddress: normalizeNullableString(record.walletAddress) ?? '',
    issuedAt: normalizeNullableString(record.issuedAt) ?? new Date().toISOString(),
    nextAvailableAt: normalizeNullableString(record.nextAvailableAt) ?? new Date().toISOString(),
  }
}

function normalizeSpectreActivationGrant(value: unknown): SpectreActivationGrant {
  const record = value && typeof value === 'object'
    ? value as Partial<SpectreActivationGrant>
    : {}

  return {
    activatedWalletAddress: normalizeNullableString(record.activatedWalletAddress) ?? '',
    isEphemeral: normalizeBoolean(record.isEphemeral),
    expiresAt: normalizeNullableString(record.expiresAt),
    access: normalizeSpectreAccessState(record.access),
  }
}

function normalizeSpectreCloseResult(value: unknown): SpectreCloseResult {
  const record = value && typeof value === 'object'
    ? value as Partial<SpectreCloseResult>
    : {}

  return {
    closed: normalizeBoolean(record.closed),
    walletAddress: normalizeNullableString(record.walletAddress),
    reason: record.reason === 'not_found' ? 'not_found' : 'closed',
  }
}

function parseRpcError(body: string): string | null {
  if (!body) {
    return null
  }

  try {
    const parsed = JSON.parse(body) as { message?: unknown; error?: unknown; hint?: unknown }
    if (typeof parsed.message === 'string' && parsed.message.length > 0) {
      return parsed.message
    }
    if (typeof parsed.error === 'string' && parsed.error.length > 0) {
      return parsed.error
    }
    if (typeof parsed.hint === 'string' && parsed.hint.length > 0) {
      return parsed.hint
    }
  } catch {
    return body
  }

  return body
}

function translateSpectreAccessMessage(message: string): string {
  switch (message) {
    case 'invalid_json':
      return translate('Unable to complete Spectre activation', { ns: 'settings' })
    case 'Authenticated wallet required':
    case 'Verified wallet binding required':
    case 'Spectre wallet address is required':
    case 'Invalid Spectre wallet address':
    case 'The root wallet cannot be activated as its own Spectre address':
    case 'A root wallet cannot also be used as a Spectre address':
    case 'Spectre addresses must be activated with a blind ticket':
    case 'This Spectre address is already issued by another root wallet':
    case 'This Spectre address is already active with a different lifecycle':
    case 'Only the current Spectre wallet can close this ephemeral address':
    case 'Only one anonymous Spectre activation token can be requested every 24 hours':
    case 'Ticket purpose is required':
    case 'Unsupported ticket purpose':
    case 'Next ephemeral Spectre activation token is not available yet':
    case 'A valid wallet address is required':
    case 'Invalid blind activation token nullifier':
    case 'Blind activation token key id is required':
    case 'This blind activation token was already redeemed':
    case 'Blinded message is required':
    case 'Blind activation token payload is incomplete':
    case 'Unknown blind activation token key id':
    case 'Invalid blind activation token':
    case SPECTRE_EPHEMERAL_EXPIRED_ERROR:
    case 'A verified Backend session is required for Spectre activation':
    case 'Failed to refresh Spectre access':
      return translate(message, { ns: 'settings' })
    default:
      return translate('Unable to complete Spectre activation', { ns: 'settings' })
  }
}

async function getSpectreAccessToken(options?: {
  bootstrapIfNeeded?: boolean
}): Promise<string | null> {
  const cachedAccessToken = getCachedBackendAccessToken()
  if (cachedAccessToken) {
    return cachedAccessToken
  }

  if (options?.bootstrapIfNeeded === false) {
    return null
  }

  const session = await ensureVerifiedBackendAccess()
  return session?.accessToken ?? null
}

async function callSpectreAccess<T>(
  path: string,
  payload: Record<string, unknown> | undefined,
  normalize: (value: unknown) => T,
  options: {
    bootstrapIfNeeded?: boolean
    authenticated?: boolean
  } = {},
): Promise<T> {
  if (!SPECTRA_API_URL) {
    throw new Error(translate('Backend is not configured for Spectre activation', { ns: 'settings' }))
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...getAppVersionHeaders(),
  }
  if (options.authenticated !== false) {
    const accessToken = await getSpectreAccessToken({
      bootstrapIfNeeded: options.bootstrapIfNeeded,
    })
    if (!accessToken) {
      throw new Error(
        translate('A verified Backend session is required for Spectre activation', { ns: 'settings' }),
      )
    }
    headers.Authorization = `Bearer ${accessToken}`
  }

  const response = await torAwareFetch(buildBackendUrl(SPECTRA_API_URL, path), {
    method: 'POST',
    headers,
    body: JSON.stringify(payload ?? {}),
  })

  const responseText = await response.text()
  if (!response.ok) {
    recordAppUpdateRequiredResponse(response.status, responseText)
    throw new Error(
      translateSpectreAccessMessage(
        parseRpcError(responseText) ?? `Spectre access request failed (${response.status})`,
      ),
    )
  }

  return normalize(responseText.length > 0 ? JSON.parse(responseText) : null)
}

function setCachedSpectreAccess(access: SpectreAccessState | null): Promise<void> {
  scheduleSpectreAccessDeadline(access)
  return useSpectreAccessStore.getState().setAccess(access)
}

function toMs(isoValue: string | null | undefined): number | null {
  if (!isoValue) {
    return null
  }

  const value = Date.parse(isoValue)
  return Number.isFinite(value) ? value : null
}

export function getCachedSpectreAccessState(
  walletAddress?: string | null,
): SpectreAccessState | null {
  const access = useSpectreAccessStore.getState().access
  if (!access || (walletAddress && access.walletAddress !== walletAddress)) {
    return null
  }

  return access
}

export async function initializeSpectreAccessState(): Promise<void> {
  await useSpectreAccessStore.getState().initialize()
  scheduleSpectreAccessDeadline(useSpectreAccessStore.getState().access)
}

export async function refreshSpectreAccess(options?: {
  bootstrapIfNeeded?: boolean
}): Promise<SpectreAccessState> {
  const store = useSpectreAccessStore.getState()
  store.setRefreshing(true)
  store.setLastError(null)

  try {
    const access = await callSpectreAccess(
      '/v1/spectre/access/current',
      undefined,
      normalizeSpectreAccessState,
      { bootstrapIfNeeded: options?.bootstrapIfNeeded },
    )
    await setCachedSpectreAccess(access)
    return access
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : translate('Failed to refresh Spectre access', { ns: 'settings' })
    store.setLastError(message)
    throw error
  } finally {
    store.setRefreshing(false)
  }
}

async function fetchSpectreBlindPublicParams(
  purpose: AccountBlindTokenPurpose,
): Promise<SpectreBlindPublicParams> {
  return callSpectreAccess(
    `/v1/spectre/activation/params?ticketPurpose=${encodeURIComponent(purpose)}`,
    {},
    normalizeSpectreBlindPublicParams,
    { authenticated: false },
  )
}

export async function markSpectreWalletPendingRemoteActivation(
  walletAddress: string,
): Promise<void> {
  await writePendingRemoteActivationWalletAddress(walletAddress)
}

export async function isSpectreWalletPendingRemoteActivation(
  walletAddress: string,
): Promise<boolean> {
  return (await readPendingRemoteActivationWalletAddress()) === walletAddress
}

export async function getPendingSpectreBlindActivationToken(match?: {
  walletAddress?: string | null
  purpose?: AccountBlindTokenPurpose
  isEphemeral?: boolean
}): Promise<StoredSpectreBlindActivationToken | null> {
  return readStoredBlindToken(match)
}

export async function clearPendingSpectreBlindActivationToken(match?: {
  walletAddress?: string | null
  purpose?: AccountBlindTokenPurpose
  isEphemeral?: boolean
}): Promise<void> {
  await removeStoredBlindTokens(match)
  if (match?.walletAddress === await readPendingRemoteActivationWalletAddress()) {
    await writePendingRemoteActivationWalletAddress(null)
  }
}

export async function issueSpectreBlindActivationToken(
  walletAddress: string,
  options: {
    bootstrapIfNeeded?: boolean
    rootWalletAddress?: string
  },
): Promise<StoredSpectreBlindActivationToken> {
  const existingToken = await readStoredBlindToken({
    walletAddress,
    purpose: 'spectre_ephemeral',
    isEphemeral: true,
  })
  if (existingToken) {
    return existingToken
  }

  const publicParams = await fetchSpectreBlindPublicParams('spectre_ephemeral')
  const prepared = prepareSpectreBlindTokenRequest(publicParams, walletAddress, true)
  const issueResponse = await callSpectreAccess(
    '/v1/spectre/activation/issue',
    {
      blindedMessageHex: prepared.blindedMessageHex,
      ticketPurpose: 'spectre_ephemeral',
      rootWalletAddress: options.rootWalletAddress,
    },
    (value) => {
      const record = value && typeof value === 'object'
        ? value as {
          blindSignatureHex?: unknown
          issue?: unknown
          publicParams?: unknown
        }
        : {}

      return {
        blindSignatureHex: normalizeNullableString(record.blindSignatureHex) ?? '',
        issue: normalizeSpectreBlindTokenIssueReceipt(record.issue),
        publicParams: normalizeSpectreBlindPublicParams(record.publicParams),
      }
    },
    { bootstrapIfNeeded: options.bootstrapIfNeeded },
  )

  const token = finalizeSpectreBlindToken(
    issueResponse.publicParams,
    prepared,
    issueResponse.blindSignatureHex,
  )
  const storedToken: StoredSpectreBlindActivationToken = {
    ...token,
    issuedAt: issueResponse.issue.issuedAt,
    nextAvailableAt: issueResponse.issue.nextAvailableAt,
  }

  await persistStoredBlindToken(storedToken)
  await writePendingRemoteActivationWalletAddress(storedToken.walletAddress)
  return storedToken
}

export async function redeemSpectreBlindActivationToken(
  token: SpectreBlindActivationToken,
  options?: {
    bootstrapIfNeeded?: boolean
  },
): Promise<SpectreActivationGrant> {
  if (token.purpose !== 'spectre_ephemeral' || token.isEphemeral !== true) {
    throw new Error(translate('Invalid blind activation token', { ns: 'settings' }))
  }

  const grant = await callSpectreAccess(
    '/v1/spectre/activation/redeem',
    {
      keyId: token.keyId,
      ticketPurpose: token.purpose,
      walletAddress: token.walletAddress,
      nullifierHex: token.nullifierHex,
      signatureHex: token.signatureHex,
      isEphemeral: token.isEphemeral,
    },
    normalizeSpectreActivationGrant,
    { bootstrapIfNeeded: options?.bootstrapIfNeeded },
  )

  if (!isSameAccountStorageScope(grant.activatedWalletAddress, token.walletAddress)) {
    throw new Error(translate('Invalid blind activation token', { ns: 'settings' }))
  }

  await setCachedSpectreAccess(grant.access)
  await clearPendingSpectreBlindActivationToken({
    walletAddress: token.walletAddress,
    purpose: token.purpose,
    isEphemeral: token.isEphemeral,
  })
  await writePendingRemoteActivationWalletAddress(null)
  return grant
}

export async function closeSpectreAddress(options?: {
  bootstrapIfNeeded?: boolean
}): Promise<SpectreCloseResult> {
  return callSpectreAccess(
    '/v1/spectre/access/close',
    {},
    normalizeSpectreCloseResult,
    { bootstrapIfNeeded: options?.bootstrapIfNeeded },
  )
}

export async function enforceExpiredSpectreModeLocally(): Promise<void> {
  const spectreModeModule = await import('@/services/security/spectreMode')
  await spectreModeModule.forceDisableExpiredSpectreMode()
}

function scheduleSpectreAccessDeadline(access: SpectreAccessState | null): void {
  clearSpectreAccessDeadlineTimer()
  if (
    !access?.currentWalletIsSpectre
    || !access.currentSpectreIsEphemeral
  ) {
    return
  }

  const expiresAtMs = toMs(access.currentSpectreExpiresAt)
  if (expiresAtMs === null) {
    return
  }

  spectreAccessDeadlineTimer = setTimeout(() => {
    spectreAccessDeadlineTimer = null
    void enforceExpiredSpectreModeLocally()
  }, Math.max(0, expiresAtMs - Date.now()))
}
