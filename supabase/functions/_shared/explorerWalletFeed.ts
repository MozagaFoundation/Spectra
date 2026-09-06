import {
  base64UrlDecode,
  base64UrlEncode,
  HttpError,
  isRecord,
  randomToken,
  readLimitedResponse,
  sha256Hex,
  validHttpsUrl,
} from './http.ts'
import { optionalEnv } from './config.ts'

const maxResponseBytes = 1024 * 1024
const requestTimeoutMs = 12_000
const maxAddresses = 50
const maxLimit = 100
const textEncoder = new TextEncoder()

export interface ExplorerFeedCursor {
  height: number
  txHash: string
}

export interface ExplorerFeedTokenTransfer {
  tokenStandard: string
  tokenIdentifier: string
  tokenSymbol: string
  tokenDecimals: number
  amountAtomic: string
  counterpartyAddress: string
}

export interface ExplorerFeedRecord {
  addressKey: string
  txHash: string
  occurredAt: Date
  direction: 'inbound' | 'outbound' | 'self'
  status: 'confirmed' | 'failed'
  blockHeight: number
  nativeAmountAtomic: string
  nativeSymbol: 'EXO'
  feeAtomic: string
  counterpartyAddress: string
  tokenTransfers: ExplorerFeedTokenTransfer[]
}

export interface ExplorerFeedResponse {
  records: ExplorerFeedRecord[]
  nextCursor: ExplorerFeedCursor | null
  syncComplete: boolean
}

export function isExplorerWalletFeedConfigured(): boolean {
  return Boolean(
    optionalEnv('MOZAGA_EXPLORER_FEED_URL') && optionalEnv('MOZAGA_EXPLORER_FEED_SECRET'),
  )
}

export function decodeExplorerFeedCursor(value: string | null | undefined): ExplorerFeedCursor {
  if (!value) return { height: -1, txHash: '' }
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(base64UrlDecode(value))
    const parsed = JSON.parse(decoded)
    const height = isRecord(parsed) ? parsed.height : undefined
    const txHash = isRecord(parsed) ? parsed.txHash : undefined
    if (
      typeof height !== 'number' || !Number.isSafeInteger(height) || height < -1 ||
      typeof txHash !== 'string' || txHash.length > 256
    ) throw new Error()
    return { height, txHash }
  } catch {
    throw new HttpError(500, 'wallet_index_external_cursor_invalid')
  }
}

export function encodeExplorerFeedCursor(cursor: ExplorerFeedCursor): string {
  if (
    !Number.isSafeInteger(cursor.height) || cursor.height < -1 ||
    typeof cursor.txHash !== 'string' || cursor.txHash.length > 256
  ) throw new HttpError(500, 'wallet_index_external_cursor_invalid')
  return base64UrlEncode(textEncoder.encode(JSON.stringify(cursor)))
}

export async function fetchExplorerWalletFeed(input: {
  addresses: string[]
  cursor: ExplorerFeedCursor
  limit?: number
}): Promise<ExplorerFeedResponse> {
  const addresses = [...new Set(input.addresses.map(normalizeAddress))]
  if (addresses.length < 1 || addresses.length > maxAddresses) {
    throw new HttpError(400, 'wallet_index_external_request_invalid')
  }
  const limit = input.limit ?? maxLimit
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > maxLimit) {
    throw new HttpError(400, 'wallet_index_external_request_invalid')
  }
  const endpoint = feedEndpoint()
  const body = JSON.stringify({
    addresses,
    cursor: input.cursor,
    limit,
  })
  const timestamp = String(Date.now())
  const nonce = randomToken(24)
  const bodyHash = await sha256Hex(body)
  const signature = await hmacHex(
    feedSecret(),
    `POST\nspectra-wallet-feed\n${timestamp}\n${nonce}\n${bodyHash}`,
  )
  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-spectra-feed-timestamp': timestamp,
        'x-spectra-feed-nonce': nonce,
        'x-spectra-feed-signature': signature,
      },
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(requestTimeoutMs),
    })
  } catch {
    throw new HttpError(503, 'mozaga_explorer_feed_unavailable')
  }
  if (!response.ok) {
    await discardResponse(response)
    throw new HttpError(503, 'mozaga_explorer_feed_unavailable')
  }
  let decoded: unknown
  try {
    decoded = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(
      await readLimitedResponse(response, maxResponseBytes),
    ))
  } catch {
    throw new HttpError(502, 'mozaga_explorer_feed_invalid')
  }
  return parseFeedResponse(decoded, limit)
}

function feedEndpoint(): URL {
  const value = optionalEnv('MOZAGA_EXPLORER_FEED_URL')
  if (!value) throw new HttpError(503, 'mozaga_explorer_feed_unavailable')
  const endpoint = validHttpsUrl(value, optionalEnv('SPECTRA_ENV') !== 'production')
  if (endpoint.search || endpoint.hash || !endpoint.pathname.endsWith('/spectra-wallet-feed')) {
    throw new HttpError(503, 'invalid_configuration')
  }
  return endpoint
}

function feedSecret(): string {
  const value = optionalEnv('MOZAGA_EXPLORER_FEED_SECRET')
  if (
    value.length < 32 || value.length > 512 ||
    [...value].some((character) => {
      const code = character.codePointAt(0)!
      return code < 0x21 || code > 0x7e
    })
  ) throw new HttpError(503, 'invalid_configuration')
  return value
}

function normalizeAddress(value: string): string {
  const address = value.trim()
  if (!/^(?:EXO|EXI)[0-9a-f]{40}$/i.test(address)) {
    throw new HttpError(400, 'wallet_index_external_request_invalid')
  }
  return `${address.slice(0, 3).toUpperCase()}${address.slice(3).toLowerCase()}`
}

async function hmacHex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, textEncoder.encode(value)))
  return Array.from(signature, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function parseFeedResponse(value: unknown, limit: number): ExplorerFeedResponse {
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) => !['records', 'nextCursor', 'syncComplete'].includes(key))
  ) {
    throw new HttpError(502, 'mozaga_explorer_feed_invalid')
  }
  if (
    !Array.isArray(value.records) || value.records.length > limit ||
    typeof value.syncComplete !== 'boolean'
  ) {
    throw new HttpError(502, 'mozaga_explorer_feed_invalid')
  }
  const records = value.records.map(parseRecord)
  const nextCursor = value.nextCursor === null
    ? null
    : parseCursor(value.nextCursor, 'mozaga_explorer_feed_invalid')
  if (
    records.length < limit &&
    nextCursor !== null
  ) {
    throw new HttpError(502, 'mozaga_explorer_feed_invalid')
  }
  if (
    records.length === limit &&
    (value.syncComplete || !nextCursor ||
      nextCursor.height !== records.at(-1)!.blockHeight ||
      nextCursor.txHash !== records.at(-1)!.txHash)
  ) throw new HttpError(502, 'mozaga_explorer_feed_invalid')
  return { records, nextCursor, syncComplete: value.syncComplete }
}

function parseRecord(value: unknown): ExplorerFeedRecord {
  if (!isRecord(value)) throw new HttpError(502, 'mozaga_explorer_feed_invalid')
  const allowed = new Set([
    'addressKey',
    'txHash',
    'occurredAt',
    'direction',
    'status',
    'blockHeight',
    'nativeAmountAtomic',
    'nativeSymbol',
    'feeAtomic',
    'counterpartyAddress',
    'tokenTransfers',
  ])
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new HttpError(502, 'mozaga_explorer_feed_invalid')
  }
  const occurredAt = typeof value.occurredAt === 'string'
    ? new Date(value.occurredAt)
    : new Date(Number.NaN)
  const blockHeight = value.blockHeight
  if (
    typeof value.addressKey !== 'string' || !/^[0-9a-f]{40}$/.test(value.addressKey) ||
    typeof value.txHash !== 'string' || !/^(?:EXO|0x)[0-9a-f]{64}$/i.test(value.txHash) ||
    !Number.isFinite(occurredAt.getTime()) ||
    typeof blockHeight !== 'number' || !Number.isSafeInteger(blockHeight) || blockHeight < 0 ||
    !/^\d+$/.test(String(value.nativeAmountAtomic)) ||
    value.nativeSymbol !== 'EXO' ||
    !/^\d+$/.test(String(value.feeAtomic)) ||
    typeof value.counterpartyAddress !== 'string' || value.counterpartyAddress.length > 128 ||
    !['inbound', 'outbound', 'self'].includes(String(value.direction)) ||
    !['confirmed', 'failed'].includes(String(value.status)) ||
    !Array.isArray(value.tokenTransfers) || value.tokenTransfers.length > 256
  ) throw new HttpError(502, 'mozaga_explorer_feed_invalid')
  return {
    addressKey: value.addressKey,
    txHash: value.txHash,
    occurredAt,
    direction: value.direction as ExplorerFeedRecord['direction'],
    status: value.status as ExplorerFeedRecord['status'],
    blockHeight,
    nativeAmountAtomic: String(value.nativeAmountAtomic),
    nativeSymbol: 'EXO',
    feeAtomic: String(value.feeAtomic),
    counterpartyAddress: value.counterpartyAddress,
    tokenTransfers: value.tokenTransfers.map(parseTokenTransfer),
  }
}

function parseCursor(value: unknown, code: string): ExplorerFeedCursor {
  const height = isRecord(value) ? value.height : undefined
  const txHash = isRecord(value) ? value.txHash : undefined
  if (
    typeof height !== 'number' || !Number.isSafeInteger(height) || height < -1 ||
    typeof txHash !== 'string' || txHash.length > 256
  ) throw new HttpError(502, code)
  return { height, txHash }
}

function parseTokenTransfer(value: unknown): ExplorerFeedTokenTransfer {
  const tokenDecimals = isRecord(value) ? value.tokenDecimals : undefined
  if (
    !isRecord(value) ||
    typeof value.tokenStandard !== 'string' || !value.tokenStandard ||
    typeof value.tokenIdentifier !== 'string' || !value.tokenIdentifier ||
    typeof value.tokenSymbol !== 'string' || !value.tokenSymbol ||
    typeof tokenDecimals !== 'number' || !Number.isSafeInteger(tokenDecimals) ||
    tokenDecimals < 0 || tokenDecimals > 36 ||
    typeof value.amountAtomic !== 'string' || !/^\d+$/.test(value.amountAtomic) ||
    typeof value.counterpartyAddress !== 'string' || value.counterpartyAddress.length > 128
  ) throw new HttpError(502, 'mozaga_explorer_feed_invalid')
  return {
    tokenStandard: value.tokenStandard,
    tokenIdentifier: value.tokenIdentifier,
    tokenSymbol: value.tokenSymbol,
    tokenDecimals,
    amountAtomic: value.amountAtomic,
    counterpartyAddress: value.counterpartyAddress,
  }
}

async function discardResponse(response: Response): Promise<void> {
  try {
    await readLimitedResponse(response, 1_024)
  } catch {
    try {
      await response.body?.cancel()
    } catch {
      // The upstream body is intentionally discarded.
    }
  }
}
