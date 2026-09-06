/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

export interface SpectreAccessState {
  walletAddress: string | null
  canRequestEphemeralToken: boolean
  spectreTokenLastIssuedAt: string | null
  spectreTokenAvailableAt: string | null
  currentWalletIsSpectre: boolean
  currentSpectreIsEphemeral: boolean
  currentSpectreExpiresAt: string | null
  refreshedAt: string | null
}

export interface SpectreActivationGrant {
  activatedWalletAddress: string
  isEphemeral: boolean
  expiresAt: string | null
  access: SpectreAccessState
}

export type AccountBlindTokenPurpose = 'spectre_ephemeral'

export interface SpectreBlindPublicParams {
  algorithm: 'rsa-fdh-v1'
  domain: string
  issueIntervalHours: number
  keyId: string
  purpose: AccountBlindTokenPurpose
  modulusHex: string
  publicExponentHex: string
}

export interface SpectreBlindTokenIssueReceipt {
  walletAddress: string
  issuedAt: string
  nextAvailableAt: string
}

export interface SpectreBlindActivationToken {
  algorithm: 'rsa-fdh-v1'
  domain: string
  keyId: string
  purpose: AccountBlindTokenPurpose
  walletAddress: string
  isEphemeral: boolean
  nullifierHex: string
  signatureHex: string
}

export interface SpectreCloseResult {
  closed: boolean
  walletAddress: string | null
  reason: 'closed' | 'not_found'
}
