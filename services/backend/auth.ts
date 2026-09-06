/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { AuthChallenge, AuthSession } from '@/lib/types'
import type { PublicKeyBundle } from '@spectra/core-crypto'
import type { VdfProof } from '@spectra/privacy-protocol'

import { backendRequest, isSpectraBackendConfigured, type SpectraBackendOptions } from './client'

export const BACKEND_AUTH_SESSION_METADATA_VERSION = 4

interface BackendSession {
  accessToken: string
  refreshToken: string
  accessExpiresAt: number
  refreshExpiresAt: number
  sessionId: string
  identityId?: string | null
}

interface VerifyWalletChallengeResponse {
  verified: boolean
  identityId: string | null
  walletAddress: string
  verifiedAt: string
  session?: BackendSession
}

export async function requestWalletAuthChallengeWithBackend(
  walletAddress: string,
  options: SpectraBackendOptions = {},
): Promise<AuthChallenge | null> {
  if (!isSpectraBackendConfigured(options.baseUrl)) return null
  const body = await backendRequest<AuthChallenge>('/v1/auth/wallet/challenge', {
    method: 'POST',
    body: { walletAddress },
  }, options)
  return {
    challenge: body.challenge,
    expiresAt: Number(body.expiresAt),
    ...(isVdfAdmissionChallenge(body.vdfChallenge) ? { vdfChallenge: body.vdfChallenge } : {}),
  }
}

export async function verifyWalletAuthChallengeWithBackend(
  request: {
    challenge: string
    walletAddress: string
    publicKey: string
    identityId: string | null
    signature: string
    vdfChallengeId?: string
    vdfProof?: VdfProof
  },
  options: SpectraBackendOptions = {},
): Promise<{ verified: boolean; session: AuthSession | null }> {
  if (!isSpectraBackendConfigured(options.baseUrl)) {
    return { verified: false, session: null }
  }
  const body = await backendRequest<VerifyWalletChallengeResponse>('/v1/auth/wallet/verify', {
    method: 'POST',
    body: request,
  }, options)
  return {
    verified: body.verified === true,
    session: body.session ? mapBackendSession(body.walletAddress, body.session) : null,
  }
}

export async function bindPrivateChatIdentityWithBackend(
  request: {
    identityId: string
    walletAddress: string
    recipientMailboxToken: string
    bundle: PublicKeyBundle
  },
  options: SpectraBackendOptions = {},
): Promise<boolean> {
  if (!isSpectraBackendConfigured(options.baseUrl)) return false
  const body = await backendRequest<{ identityId?: unknown }>('/v1/chat/identity-bindings', {
    method: 'POST',
    body: request,
  }, options)
  return body.identityId === request.identityId
}

function isVdfAdmissionChallenge(value: unknown): value is NonNullable<AuthChallenge['vdfChallenge']> {
  if (!value || typeof value !== 'object') return false
  const challenge = value as Record<string, unknown>
  const params = challenge.params
  return (
    typeof challenge.challengeId === 'string' &&
    typeof challenge.nonceHex === 'string' &&
    typeof challenge.bindingHash === 'string' &&
    typeof challenge.expiresAt === 'number' &&
    typeof challenge.notBeforeAt === 'number' &&
    Number.isSafeInteger(challenge.expiresAt) &&
    Number.isSafeInteger(challenge.notBeforeAt) &&
    challenge.notBeforeAt <= challenge.expiresAt &&
    Boolean(params) &&
    typeof params === 'object' &&
    (params as Record<string, unknown>).algorithm === 'wesolowski-rsa-v1' &&
    (params as Record<string, unknown>).domain === 'spectra.discovery.vdf.v1' &&
    typeof (params as Record<string, unknown>).parameterId === 'string' &&
    typeof (params as Record<string, unknown>).modulusHex === 'string' &&
    typeof (params as Record<string, unknown>).iterations === 'number'
  )
}

export async function refreshBackendSession(
  refreshToken: string,
  walletAddress: string,
  options: SpectraBackendOptions = {},
): Promise<AuthSession | null> {
  if (!isSpectraBackendConfigured(options.baseUrl)) return null
  const body = await backendRequest<BackendSession>('/v1/auth/session/refresh', {
    method: 'POST',
    body: { refreshToken },
  }, options)
  return mapBackendSession(walletAddress, body)
}

export async function revokeBackendSession(
  refreshToken: string,
  options: SpectraBackendOptions = {},
): Promise<void> {
  if (!isSpectraBackendConfigured(options.baseUrl)) return
  await backendRequest('/v1/auth/session/logout', {
    method: 'POST',
    body: { refreshToken },
  }, options)
}

function mapBackendSession(walletAddress: string, session: BackendSession): AuthSession {
  return {
    exoAddress: walletAddress,
    identityId: typeof session.identityId === 'string' ? session.identityId : null,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    expiresAt: session.accessExpiresAt,
    metadataVersion: BACKEND_AUTH_SESSION_METADATA_VERSION,
  }
}
