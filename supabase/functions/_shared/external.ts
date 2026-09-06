import { ed25519 } from '@noble/curves/ed25519'
import { optionalEnv } from './config.ts'
import { HttpError, isRecord, validHttpsUrl } from './http.ts'
import { rpcHeaders, upstreamRPCMethod } from './rpc_auth.ts'

const methods: Record<string, Set<string>> = {
  mozaga: new Set([
    'eth_getBalance',
    'eth_getTransactionCount',
    'eth_blockNumber',
    'eth_chainId',
    'eth_sendRawTransaction',
    'eth_getTransactionReceipt',
    'asset_getAssetInfo',
    'asset_balanceOf',
    'asset_getTotalAssets',
    'asset_getActiveAssets',
    'asset_getAssetAtIndex',
    'asset_getAssetsBySymbol',
    'identity_getAccountIdentity',
  ]),
  ethereum: new Set([
    'eth_getBalance',
    'eth_getTransactionCount',
    'eth_blockNumber',
    'eth_feeHistory',
    'eth_maxPriorityFeePerGas',
    'eth_getBlockByNumber',
    'eth_estimateGas',
    'eth_call',
    'eth_sendRawTransaction',
    'eth_getTransactionReceipt',
  ]),
  bitcoin: new Set([
    'scantxoutset',
    'estimatesmartfee',
    'sendrawtransaction',
    'getrawtransaction',
  ]),
  solana: new Set([
    'getBalance',
    'getAccountInfo',
    'getLatestBlockhash',
    'sendTransaction',
    'getTokenAccountsByOwner',
    'getSignatureStatuses',
  ]),
}
const tronPaths = new Set([
  '/wallet/getaccount',
  '/wallet/triggerconstantcontract',
  '/wallet/createtransaction',
  '/wallet/triggersmartcontract',
  '/wallet/broadcasttransaction',
  '/wallet/gettransactioninfobyid',
])
const rpcEnv: Record<string, string> = {
  mozaga: 'MOZAGA_RPC_URL',
  ethereum: 'ETH_RPC_URL',
  bitcoin: 'BITCOIN_RPC_URL',
  solana: 'SOLANA_RPC_URL',
  tron: 'TRON_RPC_URL',
}

export async function rpcProxy(body: Record<string, unknown>): Promise<unknown> {
  if (typeof body.chain !== 'string') throw new HttpError(400, 'invalid_request')
  const chain = body.chain.trim().toLowerCase()
  const rawEndpoint = optionalEnv(rpcEnv[chain] ?? '')
  if (!rawEndpoint) throw new HttpError(503, 'rpc_proxy_unsupported')
  const endpoint = upstreamUrl(
    rawEndpoint,
    optionalEnv('SPECTRA_RPC_PROXY_TRUSTED_RPC') === 'true',
    'rpc_proxy_unsupported',
  )
  let payload: unknown
  if (chain === 'tron') {
    if (typeof body.path !== 'string' || !tronPaths.has(body.path) || body.body === undefined) {
      throw new HttpError(400, 'invalid_request')
    }
    endpoint.pathname = tronBasePath(endpoint.pathname)
    endpoint.pathname = `${endpoint.pathname.replace(/\/$/, '')}${body.path}`
    payload = body.body
  } else {
    if (
      typeof body.method !== 'string' || !methods[chain]?.has(body.method) ||
      !Array.isArray(body.params)
    ) throw new HttpError(503, 'rpc_proxy_unsupported')
    payload = {
      jsonrpc: '2.0',
      id: 1,
      method: upstreamRPCMethod(chain, body.method),
      params: body.params,
    }
  }
  const encoded = JSON.stringify(payload)
  if (new TextEncoder().encode(encoded).byteLength > 256 * 1024) {
    throw new HttpError(400, 'invalid_request')
  }
  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: rpcHeaders(chain),
      body: encoded,
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    throw new HttpError(502, 'rpc_upstream_unavailable')
  }
  let responseBody: Uint8Array
  try {
    responseBody = await readBounded(response, 512 * 1024, 502, 'rpc_upstream_invalid_response')
  } catch {
    throw new HttpError(502, 'rpc_upstream_invalid_response')
  }
  if (!response.ok) {
    throw new HttpError(502, rpcUpstreamHttpErrorCode(response.status))
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(responseBody))
  } catch {
    throw new HttpError(502, 'rpc_upstream_invalid_response')
  }
}

function rpcUpstreamHttpErrorCode(status: number): string {
  if (status === 401 || status === 403) return 'rpc_upstream_unauthorized'
  if (status === 429) return 'rpc_upstream_rate_limited'
  if (status >= 500 || status === 408) return 'rpc_upstream_unavailable'
  return 'rpc_upstream_rejected'
}

function tronBasePath(pathname: string): string {
  return pathname
    .replace(/\/(walletsolidity|wallet|jsonrpc)\/?$/i, '')
    .replace(/\/+$/, '')
}

export async function turnCredentials(ttlValue: unknown): Promise<Record<string, unknown>> {
  const keyId = optionalEnv('SPECTRA_CLOUDFLARE_TURN_KEY_ID')
  const token = optionalEnv('SPECTRA_CLOUDFLARE_TURN_API_TOKEN')
  if (!keyId || !token) throw new HttpError(503, 'turn_not_configured')
  const ttl = ttlValue === undefined || ttlValue === 0 ? 24 * 60 * 60 : ttlValue
  if (!Number.isSafeInteger(ttl) || (ttl as number) < 1 || (ttl as number) > 24 * 60 * 60) {
    throw new HttpError(400, 'invalid_request')
  }
  const base = optionalEnv('SPECTRA_CLOUDFLARE_TURN_BASE_URL') ||
    'https://rtc.live.cloudflare.com/v1/turn/keys'
  const endpoint = upstreamUrl(
    base,
    optionalEnv('SPECTRA_TURN_TRUSTED_BASE_URL') === 'true',
    'turn_not_configured',
  )
  if (
    optionalEnv('SPECTRA_TURN_TRUSTED_BASE_URL') !== 'true' &&
    (endpoint.hostname !== 'rtc.live.cloudflare.com' ||
      (endpoint.port !== '' && endpoint.port !== '443'))
  ) throw new HttpError(503, 'turn_not_configured')
  endpoint.pathname = `${endpoint.pathname.replace(/\/$/, '')}/${
    encodeURIComponent(keyId)
  }/credentials/generate-ice-servers`
  let response: Response
  let bytes: Uint8Array
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ ttl }),
      signal: AbortSignal.timeout(10_000),
    })
    bytes = await readBounded(response, 1024 * 1024, 502, 'turn_unavailable')
  } catch (error) {
    if (error instanceof HttpError) throw error
    throw new HttpError(502, 'turn_unavailable')
  }
  if (!response.ok) throw new HttpError(502, 'turn_unavailable')
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    throw new HttpError(502, 'turn_unavailable')
  }
  if (!isRecord(value) || !Array.isArray(value.iceServers)) {
    throw new HttpError(502, 'turn_unavailable')
  }
  const iceServers = normalizeIceServers(value.iceServers)
  if (!hasTurn(iceServers)) throw new HttpError(502, 'turn_unavailable')
  return { iceServers }
}

function hasTurn(servers: unknown[]): boolean {
  return servers.some((server) => {
    if (!isRecord(server)) return false
    const urls = typeof server.urls === 'string'
      ? [server.urls]
      : Array.isArray(server.urls)
      ? server.urls
      : []
    return urls.some((url) =>
      typeof url === 'string' &&
      (url.toLowerCase().startsWith('turn:') || url.toLowerCase().startsWith('turns:'))
    )
  })
}

function normalizeIceServers(value: unknown[]): Record<string, unknown>[] {
  if (value.length < 1 || value.length > 32) throw new HttpError(502, 'turn_unavailable')
  return value.map((entry) => {
    if (!isRecord(entry)) throw new HttpError(502, 'turn_unavailable')
    const urls = typeof entry.urls === 'string'
      ? [entry.urls]
      : Array.isArray(entry.urls)
      ? entry.urls
      : []
    if (
      urls.length < 1 || urls.length > 16 ||
      urls.some((url) =>
        typeof url !== 'string' || url.length > 2048 ||
        !/^(?:stun|turn|turns):[^\s]+$/i.test(url)
      )
    ) throw new HttpError(502, 'turn_unavailable')
    if (
      entry.username !== undefined &&
      (typeof entry.username !== 'string' || entry.username.length > 1024)
    ) throw new HttpError(502, 'turn_unavailable')
    if (
      entry.credential !== undefined &&
      (typeof entry.credential !== 'string' || entry.credential.length > 4096)
    ) throw new HttpError(502, 'turn_unavailable')
    return {
      urls: typeof entry.urls === 'string' ? urls[0] : urls,
      ...(typeof entry.username === 'string' ? { username: entry.username } : {}),
      ...(typeof entry.credential === 'string' ? { credential: entry.credential } : {}),
    }
  })
}

function upstreamUrl(raw: string, allowLocal: boolean, code: string): URL {
  const url = validHttpsUrl(raw, allowLocal)
  if (url.search || (!allowLocal && privateHostname(url.hostname))) throw new HttpError(503, code)
  return url
}

function privateHostname(value: string): boolean {
  const host = value.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host === '::1' || host === '0:0:0:0:0:0:0:1') return true
  if (host.includes(':')) return true
  const octets = host.split('.').map(Number)
  if (
    octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe8') ||
      host.startsWith('fe9') || host.startsWith('fea') || host.startsWith('feb')
  }
  const [first, second] = octets as [number, number, number, number]
  return first === 0 || first === 10 || first === 127 || first >= 224 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && (second === 0 || second === 168)) ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 198 && (second === 18 || second === 19))
}

async function readBounded(
  response: Response,
  maxBytes: number,
  status: number,
  errorCode: string,
): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length') ?? '0')
  if (!Number.isFinite(declared) || declared > maxBytes) {
    throw new HttpError(status, errorCode)
  }
  const reader = response.body?.getReader()
  if (!reader) return new Uint8Array()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      size += next.value.byteLength
      if (size > maxBytes) {
        await reader.cancel()
        throw new HttpError(status, errorCode)
      }
      chunks.push(next.value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

export function contributionRecipients(): Record<string, unknown> {
  const keyId = optionalEnv('SPECTRA_CONTRIBUTION_RECIPIENTS_KEY_ID')
  const rawPayload = optionalEnv('SPECTRA_CONTRIBUTION_RECIPIENTS_PAYLOAD_JSON')
  const signingPrivateKey = decodeCanonicalBase64(
    optionalEnv('SPECTRA_CONTRIBUTION_RECIPIENTS_SIGNING_PRIVATE_KEY_BASE64'),
    32,
  )
  if (!/^[A-Za-z0-9_.-]{1,128}$/.test(keyId) || !rawPayload || !signingPrivateKey) {
    throw new HttpError(503, 'contribution_recipients_not_configured')
  }
  let payload: unknown
  let compact: string
  try {
    compact = compactJson(rawPayload)
    if (new TextEncoder().encode(compact).byteLength > 64 * 1024) throw new Error()
    payload = JSON.parse(compact)
  } catch {
    throw new HttpError(503, 'contribution_recipients_not_configured')
  }
  if (
    !isRecord(payload) || !Number.isSafeInteger(payload.version) ||
    (payload.version as number) <= 0 || typeof payload.issuedAt !== 'string' ||
    !rfc3339(payload.issuedAt) ||
    (payload.expiresAt !== undefined &&
      (typeof payload.expiresAt !== 'string' || !rfc3339(payload.expiresAt))) ||
    !isRecord(payload.recipients)
  ) throw new HttpError(503, 'contribution_recipients_not_configured')
  for (const network of ['mozaga', 'ethereum', 'bitcoin', 'solana', 'tron']) {
    const recipient = payload.recipients[network]
    if (
      !isRecord(recipient) || typeof recipient.address !== 'string' ||
      !recipient.address.trim() || recipient.address.length > 256
    ) {
      throw new HttpError(503, 'contribution_recipients_not_configured')
    }
  }
  const payloadBytes = new TextEncoder().encode(compact)
  let signature: string
  try {
    signature = base64Bytes(ed25519.sign(payloadBytes, signingPrivateKey))
  } catch {
    throw new HttpError(503, 'contribution_recipients_not_configured')
  }
  return { keyId, payload, payloadBase64: base64Bytes(payloadBytes), signature }
}

function compactJson(value: string): string {
  let result = ''
  let quoted = false
  let escaped = false
  for (const character of value.trim()) {
    if (quoted) {
      result += character
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') quoted = false
    } else if (character === '"') {
      quoted = true
      result += character
    } else if (!/\s/.test(character)) result += character
  }
  if (quoted || escaped) throw new Error('invalid json')
  return result
}

function rfc3339(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value))
}

function base64Bytes(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function decodeCanonicalBase64(value: string, expectedLength: number): Uint8Array | null {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    return null
  }
  try {
    const decoded = Uint8Array.from(atob(value), (character) => character.charCodeAt(0))
    if (decoded.byteLength !== expectedLength) return null
    return base64Bytes(decoded) === value ? decoded : null
  } catch {
    return null
  }
}
