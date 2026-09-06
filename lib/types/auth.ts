/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

export interface AuthSession {
  exoAddress: string
  identityId: string | null
  publicKey?: string
  accessToken: string
  refreshToken: string
  expiresAt: number
  metadataVersion?: number
}

export type SecureAccessPhase = 'idle' | 'admitting' | 'binding' | 'ready' | 'failed'

export type SecureAccessFailure =
  | 'native_unavailable'
  | 'native_busy'
  | 'cancelled'
  | 'challenge_expired'
  | 'proof_rejected'
  | 'temporary_backend'
  | 'connectivity'
  | 'deletion_cleanup_pending'
  | 'identity_binding'
  | 'unknown'

export interface SecureAccessState {
  phase: SecureAccessPhase
  failure: SecureAccessFailure | null
  retryable: boolean
}

export interface VdfPublicParams {
  algorithm: 'wesolowski-rsa-v1'
  domain: 'spectra.discovery.vdf.v1'
  parameterId: string
  modulusHex: string
  iterations: number
}

export interface VdfAdmissionChallenge {
  challengeId: string
  nonceHex: string
  bindingHash: string
  expiresAt: number
  notBeforeAt: number
  params: VdfPublicParams
}

export interface AuthChallenge {
  challenge: string
  expiresAt: number
  vdfChallenge?: VdfAdmissionChallenge
}
