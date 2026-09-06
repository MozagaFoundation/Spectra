const encoder = new TextEncoder()

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly headers?: HeadersInit,
  ) {
    super(code)
  }
}

export function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers)
  responseHeaders.set('content-type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify(data), { status, headers: responseHeaders })
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return json({ error: error.code }, error.status, error.headers)
  }
  const databaseCode = databaseErrorCode(error)
  if (
    databaseCode?.startsWith('08') ||
    databaseCode?.startsWith('53') ||
    databaseCode === '57P01' ||
    databaseCode === '57P02' ||
    databaseCode === '57P03'
  ) {
    return json({ error: 'database_unavailable' }, 503)
  }
  return json({ error: 'internal_error' }, 500)
}

export async function readJson<T extends Record<string, unknown>>(
  request: Request,
  allowedFields: readonly string[],
  maxBytes = 2 * 1024 * 1024,
): Promise<T> {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (contentType !== 'application/json') throw new HttpError(415, 'content_type_required')
  const declared = Number(request.headers.get('content-length') ?? '0')
  if (!Number.isFinite(declared) || declared < 0 || declared > maxBytes) {
    throw new HttpError(413, 'request_too_large')
  }
  const chunks: Uint8Array[] = []
  let total = 0
  const reader = request.body?.getReader()
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        total += value.byteLength
        if (total > maxBytes) {
          await reader.cancel()
          throw new HttpError(413, 'request_too_large')
        }
        chunks.push(value)
      }
    } finally {
      reader.releaseLock()
    }
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    throw new HttpError(400, 'invalid_json')
  }
  if (!isRecord(value)) throw new HttpError(400, 'invalid_request')
  const allowed = new Set(allowedFields)
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new HttpError(400, 'invalid_json')
  }
  return value as T
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function databaseErrorCode(error: unknown): string | undefined {
  if (!isRecord(error)) return undefined
  try {
    const code = error.code
    return typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code) ? code : undefined
  } catch {
    return undefined
  }
}

export function databaseConstraint(error: unknown): string | undefined {
  if (!isRecord(error)) return undefined
  try {
    const constraint = error.constraint_name ?? error.constraint
    return typeof constraint === 'string' && /^[A-Za-z0-9_]{1,128}$/.test(constraint)
      ? constraint
      : undefined
  } catch {
    return undefined
  }
}

export function requireString(
  value: unknown,
  code = 'invalid_request',
  min = 1,
  max = 4096,
): string {
  if (typeof value !== 'string') throw new HttpError(400, code)
  const normalized = value.trim()
  if (normalized.length < min || encoder.encode(normalized).byteLength > max) {
    throw new HttpError(400, code)
  }
  return normalized
}

export function optionalString(value: unknown, max = 4096): string | undefined {
  if (value === undefined || value === null) return undefined
  return requireString(value, 'invalid_request', 1, max)
}

export function requireBoolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new HttpError(400, 'invalid_request')
  return value
}

export function requireInteger(value: unknown, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    throw new HttpError(400, 'invalid_request')
  }
  return value as number
}

export function requireArray(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new HttpError(400, 'invalid_request')
  return value
}

export function allowMethod(request: Request, ...methods: string[]): void {
  if (!methods.includes(request.method)) {
    throw new HttpError(405, 'method_not_allowed', { allow: methods.join(', ') })
  }
}

export function applyMethodOverride(request: Request): Request {
  if (request.method !== 'POST') return request
  if (request.headers.get('x-http-method-override') !== 'PATCH') return request
  return new Request(request, { method: 'PATCH' })
}

export async function sha256Hex(value: string | Uint8Array): Promise<string> {
  const input = typeof value === 'string' ? encoder.encode(value) : value
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(input)))
  return bytesToHex(digest)
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function hexToBytes(value: string): Uint8Array {
  const normalized = value.startsWith('0x') ? value.slice(2) : value
  if (normalized.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(normalized)) {
    throw new HttpError(400, 'invalid_hex')
  }
  return Uint8Array.from(normalized.match(/.{2}/g)!, (byte) => Number.parseInt(byte, 16))
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

export function base64UrlDecode(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new HttpError(401, 'unauthorized')
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') +
    '='.repeat((4 - value.length % 4) % 4)
  try {
    return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0))
  } catch {
    throw new HttpError(401, 'unauthorized')
  }
}

export function randomToken(bytes: number): string {
  const value = crypto.getRandomValues(new Uint8Array(bytes))
  return base64UrlEncode(value)
}

export function constantTimeEqual(left: string, right: string): boolean {
  const a = encoder.encode(left)
  const b = encoder.encode(right)
  const size = Math.max(a.length, b.length)
  let mismatch = a.length ^ b.length
  for (let index = 0; index < size; index++) mismatch |= (a[index] ?? 0) ^ (b[index] ?? 0)
  return mismatch === 0
}

export function validHttpsUrl(value: string, allowLocal = false): URL {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new HttpError(503, 'invalid_configuration')
  }
  const local = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
  if (
    parsed.username || parsed.password || parsed.hash ||
    (parsed.protocol !== 'https:' && !(allowLocal && local && parsed.protocol === 'http:'))
  ) throw new HttpError(503, 'invalid_configuration')
  return parsed
}

export async function readLimitedResponse(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length') ?? '0')
  if (declared > maxBytes) throw new HttpError(502, 'upstream_response_too_large')
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength > maxBytes) throw new HttpError(502, 'upstream_response_too_large')
  return bytes
}
