/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

export type CryptoPaymentRequestNetworkId = 'mozaga' | 'ethereum' | 'bitcoin' | 'solana' | 'tron'
export type CryptoPaymentRequestAssetType = 'native' | 'token'
export type CryptoPaymentRequestSettlementStatus = 'confirmed' | 'pending' | 'failed'
export type CryptoPaymentRequestState = 'open' | 'paid'

export interface CryptoPaymentRequestSettlement {
  payerIdentityId?: string
  payerName?: string
  txHash: string
  status: CryptoPaymentRequestSettlementStatus
  paidAt: number
}

export interface CryptoPaymentRequest {
  v: 2
  type: 'crypto_payment_request'
  requestId: string
  requesterIdentityId?: string
  requesterName?: string
  network: CryptoPaymentRequestNetworkId
  symbol: string
  amount: string
  decimals: number
  recipientAddress: string
  assetType: CryptoPaymentRequestAssetType
  tokenId?: string
  contractAddress?: string
  mintAddress?: string
  tokenStandard?: string
  createdAt: number
  state: CryptoPaymentRequestState
  settlement?: CryptoPaymentRequestSettlement
}

export interface CryptoPaymentRequestUpdate {
  v: 2
  type: 'crypto_payment_request_update'
  requestId: string
  requestMessageId?: string
  payerIdentityId?: string
  payerName?: string
  network: CryptoPaymentRequestNetworkId
  symbol: string
  amount: string
  txHash: string
  status: CryptoPaymentRequestSettlementStatus
  paidAt: number
}

export type CryptoPaymentRequestInput = Omit<CryptoPaymentRequest, 'v' | 'type' | 'state' | 'settlement'>
export type CryptoPaymentRequestUpdateInput = Omit<CryptoPaymentRequestUpdate, 'v' | 'type'>

const NETWORK_IDS = new Set<CryptoPaymentRequestNetworkId>(['mozaga', 'ethereum', 'bitcoin', 'solana', 'tron'])
const ASSET_TYPES = new Set<CryptoPaymentRequestAssetType>(['native', 'token'])
const SETTLEMENT_STATUSES = new Set<CryptoPaymentRequestSettlementStatus>(['confirmed', 'pending', 'failed'])
const AMOUNT_PATTERN = /^(?:0\.[0-9]*[1-9][0-9]*|[1-9][0-9]*(?:\.[0-9]+)?)$/
const IDENTIFIER_PATTERN = /^[A-Za-z0-9:_./-]{1,160}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cleanString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > maxLength || /[\u0000-\u001F\u007F]/.test(trimmed)) return undefined
  return trimmed
}

function cleanOptionalString(value: unknown, maxLength: number): string | undefined {
  if (value == null) return undefined
  return cleanString(value, maxLength)
}

function cleanIdentifier(value: unknown): string | undefined {
  const cleaned = cleanOptionalString(value, 160)
  return cleaned && IDENTIFIER_PATTERN.test(cleaned) ? cleaned : undefined
}

function cleanAmount(value: unknown): string | undefined {
  const cleaned = cleanString(value, 64)
  return cleaned && AMOUNT_PATTERN.test(cleaned) ? cleaned : undefined
}

function cleanNetwork(value: unknown): CryptoPaymentRequestNetworkId | undefined {
  return typeof value === 'string' && NETWORK_IDS.has(value as CryptoPaymentRequestNetworkId)
    ? value as CryptoPaymentRequestNetworkId
    : undefined
}

function cleanAssetType(value: unknown): CryptoPaymentRequestAssetType | undefined {
  return typeof value === 'string' && ASSET_TYPES.has(value as CryptoPaymentRequestAssetType)
    ? value as CryptoPaymentRequestAssetType
    : undefined
}

function cleanSettlementStatus(value: unknown): CryptoPaymentRequestSettlementStatus | undefined {
  return typeof value === 'string' && SETTLEMENT_STATUSES.has(value as CryptoPaymentRequestSettlementStatus)
    ? value as CryptoPaymentRequestSettlementStatus
    : undefined
}

function cleanTimestamp(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

function cleanDecimals(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 18 ? value : undefined
}

function parseJsonRecord(content: string): Record<string, unknown> | null {
  if (!content.startsWith('{') || content.length > 16_384) return null
  try {
    const parsed = JSON.parse(content)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function normalizeRequestRecord(parsed: Record<string, unknown>): CryptoPaymentRequest | null {
  if (parsed.v !== 2 || parsed.type !== 'crypto_payment_request') return null

  const requestId = cleanIdentifier(parsed.requestId)
  const network = cleanNetwork(parsed.network)
  const symbol = cleanString(parsed.symbol, 16)?.toUpperCase()
  const amount = cleanAmount(parsed.amount)
  const decimals = cleanDecimals(parsed.decimals)
  const recipientAddress = cleanString(parsed.recipientAddress, 200)
  const assetType = cleanAssetType(parsed.assetType)
  const createdAt = cleanTimestamp(parsed.createdAt)
  const state = parsed.state === 'paid' ? 'paid' : parsed.state === 'open' ? 'open' : undefined

  if (!requestId || !network || !symbol || !amount || decimals == null || !recipientAddress || !assetType || !createdAt || !state) {
    return null
  }

  const request: CryptoPaymentRequest = {
    v: 2,
    type: 'crypto_payment_request',
    requestId,
    requesterIdentityId: cleanOptionalString(parsed.requesterIdentityId, 160),
    requesterName: cleanOptionalString(parsed.requesterName, 120),
    network,
    symbol,
    amount,
    decimals,
    recipientAddress,
    assetType,
    tokenId: cleanIdentifier(parsed.tokenId),
    contractAddress: cleanIdentifier(parsed.contractAddress),
    mintAddress: cleanIdentifier(parsed.mintAddress),
    tokenStandard: cleanIdentifier(parsed.tokenStandard),
    createdAt,
    state,
  }

  if (isRecord(parsed.settlement)) {
    const txHash = cleanIdentifier(parsed.settlement.txHash)
    const status = cleanSettlementStatus(parsed.settlement.status)
    const paidAt = cleanTimestamp(parsed.settlement.paidAt)
    if (txHash && status && paidAt) {
      request.settlement = {
        payerIdentityId: cleanOptionalString(parsed.settlement.payerIdentityId, 160),
        payerName: cleanOptionalString(parsed.settlement.payerName, 120),
        txHash,
        status,
        paidAt,
      }
    }
  }

  return request
}

export function createCryptoPaymentRequest(input: CryptoPaymentRequestInput): string {
  const request = normalizeRequestRecord({
    ...input,
    v: 2,
    type: 'crypto_payment_request',
    state: 'open',
  })
  if (!request) {
    throw new Error('Invalid crypto payment request')
  }
  return JSON.stringify(request)
}

export function parseCryptoPaymentRequest(content: string): CryptoPaymentRequest | null {
  const parsed = parseJsonRecord(content.trim())
  return parsed ? normalizeRequestRecord(parsed) : null
}

export function createCryptoPaymentRequestUpdate(input: CryptoPaymentRequestUpdateInput): string {
  const update = normalizeRequestUpdateRecord({
    ...input,
    v: 2,
    type: 'crypto_payment_request_update',
  })
  if (!update) {
    throw new Error('Invalid crypto payment request update')
  }
  return JSON.stringify(update)
}

export function parseCryptoPaymentRequestUpdate(content: string): CryptoPaymentRequestUpdate | null {
  const parsed = parseJsonRecord(content.trim())
  return parsed ? normalizeRequestUpdateRecord(parsed) : null
}

function normalizeRequestUpdateRecord(parsed: Record<string, unknown>): CryptoPaymentRequestUpdate | null {
  if (parsed.v !== 2 || parsed.type !== 'crypto_payment_request_update') return null

  const requestId = cleanIdentifier(parsed.requestId)
  const network = cleanNetwork(parsed.network)
  const symbol = cleanString(parsed.symbol, 16)?.toUpperCase()
  const amount = cleanAmount(parsed.amount)
  const txHash = cleanIdentifier(parsed.txHash)
  const status = cleanSettlementStatus(parsed.status)
  const paidAt = cleanTimestamp(parsed.paidAt)

  if (!requestId || !network || !symbol || !amount || !txHash || !status || !paidAt) {
    return null
  }

  return {
    v: 2,
    type: 'crypto_payment_request_update',
    requestId,
    requestMessageId: cleanOptionalString(parsed.requestMessageId, 160),
    payerIdentityId: cleanOptionalString(parsed.payerIdentityId, 160),
    payerName: cleanOptionalString(parsed.payerName, 120),
    network,
    symbol,
    amount,
    txHash,
    status,
    paidAt,
  }
}

export function isCryptoPaymentRequestContent(content: string): boolean {
  return parseCryptoPaymentRequest(content) !== null
}

export function isCryptoPaymentRequestUpdateContent(content: string): boolean {
  return parseCryptoPaymentRequestUpdate(content) !== null
}

export function applyCryptoPaymentRequestUpdateToContent(
  content: string,
  update: CryptoPaymentRequestUpdate,
): string | null {
  const request = parseCryptoPaymentRequest(content)
  if (!request || request.requestId !== update.requestId) return null
  if (request.network !== update.network || request.symbol !== update.symbol || request.amount !== update.amount) {
    return null
  }
  if (request.state === 'paid' && request.settlement?.txHash) {
    return JSON.stringify(request)
  }

  return JSON.stringify({
    ...request,
    state: 'paid',
    settlement: {
      payerIdentityId: update.payerIdentityId,
      payerName: update.payerName,
      txHash: update.txHash,
      status: update.status,
      paidAt: update.paidAt,
    },
  } satisfies CryptoPaymentRequest)
}

export function getCryptoPaymentRequestDisplayText(request: CryptoPaymentRequest): string {
  return request.state === 'paid'
    ? `Payment submitted: ${request.amount} ${request.symbol}`
    : `Payment request: ${request.amount} ${request.symbol}`
}
