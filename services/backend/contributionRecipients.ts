/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { ed25519 } from '@noble/curves/ed25519'
import { base64ToBytes } from '@spectra/core-crypto'
import { backendRequest } from './request'

export type ContributionRecipientNetwork = 'mozaga' | 'ethereum' | 'bitcoin' | 'solana' | 'tron'

export interface ContributionRecipientPayload {
  version: number
  issuedAt: string
  expiresAt?: string
  recipients: Record<ContributionRecipientNetwork, { address: string }>
}

interface SignedContributionRecipientsResponse {
  keyId: string
  payload: unknown
  payloadBase64: string
  signature: string
}

export interface VerifiedContributionRecipients {
  keyId: string
  version: number
  issuedAt: string
  expiresAt?: string
  recipients: Record<ContributionRecipientNetwork, string>
}

const CONTRIBUTION_RECIPIENTS_PUBLIC_KEYS_BASE64: Readonly<Record<string, string>> = {
  'contrib-2026-06': 'JKW+2CwCREXKxNbbgZG5eebOp7plToBwff/op2kSkhQ=',
  'contrib-2026-07': 'vvQvR6gE4ePAN5tSxOWSS0byMp//nyQWkSGsKirvR0w=',
}
const REQUIRED_NETWORKS: ContributionRecipientNetwork[] = ['mozaga', 'ethereum', 'bitcoin', 'solana', 'tron']
const CONTRIBUTION_RECIPIENTS_CACHE_TTL_MS = 60 * 60 * 1000

let cachedRecipients: { value: VerifiedContributionRecipients; fetchedAt: number } | null = null

export async function getContributionRecipients(): Promise<VerifiedContributionRecipients> {
  if (
    cachedRecipients &&
    !isExpired(cachedRecipients.value.expiresAt) &&
    Date.now() - cachedRecipients.fetchedAt < CONTRIBUTION_RECIPIENTS_CACHE_TTL_MS
  ) {
    return cachedRecipients.value
  }
  const response = await backendRequest<SignedContributionRecipientsResponse>(
    '/v1/contributions/recipients',
    { method: 'GET' },
  )
  const verified = verifyContributionRecipients(response)
  cachedRecipients = { value: verified, fetchedAt: Date.now() }
  return verified
}

export function clearContributionRecipientsCache(): void {
  cachedRecipients = null
}

export function verifyContributionRecipients(response: SignedContributionRecipientsResponse): VerifiedContributionRecipients {
  const publicKeyBase64 = CONTRIBUTION_RECIPIENTS_PUBLIC_KEYS_BASE64[response.keyId]
  if (!publicKeyBase64) {
    throw new Error('Unexpected contribution recipients key')
  }
  const payloadBytes = base64ToBytes(response.payloadBase64)
  const signatureBytes = base64ToBytes(response.signature)
  const publicKeyBytes = base64ToBytes(publicKeyBase64)
  if (!ed25519.verify(signatureBytes, payloadBytes, publicKeyBytes)) {
    throw new Error('Invalid contribution recipients signature')
  }

  const payload = parsePayload(payloadBytes)
  if (payload.version <= 0) {
    throw new Error('Invalid contribution recipients version')
  }
  if (Number.isNaN(Date.parse(payload.issuedAt))) {
    throw new Error('Invalid contribution recipients issue time')
  }
  if (payload.expiresAt && isExpired(payload.expiresAt)) {
    throw new Error('Contribution recipients expired')
  }

  const recipients = {} as Record<ContributionRecipientNetwork, string>
  for (const network of REQUIRED_NETWORKS) {
    const address = payload.recipients?.[network]?.address?.trim()
    if (!address) {
      throw new Error('Missing contribution recipient')
    }
    recipients[network] = address
  }

  return {
    keyId: response.keyId,
    version: payload.version,
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt,
    recipients,
  }
}

function parsePayload(payloadBytes: Uint8Array): ContributionRecipientPayload {
  const text = new TextDecoder().decode(payloadBytes)
  return JSON.parse(text) as ContributionRecipientPayload
}

function isExpired(value?: string): boolean {
  if (!value) return false
  const time = Date.parse(value)
  return Number.isNaN(time) || time <= Date.now()
}
