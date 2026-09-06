import { validHttpsUrl } from './http.ts'
import { assertVdfPublicParams, VDF_ALGORITHM, VDF_DOMAIN, type VdfPublicParams } from './vdf.ts'

export interface RuntimeConfig {
  databaseUrl: string
  supabaseUrl: string
  supabasePublishableKey: string
  supabaseServiceRoleKey: string
  issuer: string
  audience: string
  accessPrivateKey: Uint8Array
  accessPublicKeys: Map<string, Uint8Array>
  accessKeyId: string
  internalSecrets: string[]
  allowedOrigins: Set<string>
  rateLimitPerMinute: number
  metricsInternalOnly: boolean
  storageBucket: string
  objectSigningSecret: string
  objectMaxBytes: number
  objectTokenTtlSeconds: number
  discoveryVdf?: VdfPublicParams
}

let cached: RuntimeConfig | undefined

function env(name: string): string {
  return (Deno.env.get(name) ?? '').trim()
}

function required(name: string): string {
  const value = env(name)
  if (!value) throw new Error(`missing required configuration: ${name}`)
  return value
}

function positiveInt(name: string, fallback: number): number {
  const value = env(name)
  if (!value) return fallback
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`invalid ${name}`)
  return parsed
}

function decodeBase64(name: string, sizes: number[]): Uint8Array {
  const raw = required(name)
  let decoded: Uint8Array
  try {
    decoded = Uint8Array.from(
      atob(raw.replaceAll('-', '+').replaceAll('_', '/')),
      (c) => c.charCodeAt(0),
    )
  } catch {
    throw new Error(`invalid ${name}`)
  }
  if (!sizes.includes(decoded.byteLength)) throw new Error(`invalid ${name}`)
  return decoded
}

function loadDiscoveryVdfParams(): VdfPublicParams | undefined {
  const parameterId = env('SPECTRA_DISCOVERY_VDF_PARAMETER_ID')
  const modulusHex = env('SPECTRA_DISCOVERY_VDF_MODULUS_HEX')
  const iterations = env('SPECTRA_DISCOVERY_VDF_ITERATIONS')
  if (!parameterId && !modulusHex && !iterations) return undefined
  if (!parameterId || !modulusHex || !iterations) {
    throw new Error('incomplete discovery VDF configuration')
  }
  const parsedIterations = Number(iterations)
  if (!Number.isSafeInteger(parsedIterations)) {
    throw new Error('invalid SPECTRA_DISCOVERY_VDF_ITERATIONS')
  }
  const params: VdfPublicParams = {
    algorithm: VDF_ALGORITHM,
    domain: VDF_DOMAIN,
    parameterId,
    modulusHex,
    iterations: parsedIterations,
  }
  try {
    assertVdfPublicParams(params)
  } catch {
    throw new Error('invalid discovery VDF configuration')
  }
  return params
}

function loadPublicKeys(defaultKeyId: string): Map<string, Uint8Array> {
  const entries = env('SPECTRA_ACCESS_TOKEN_PUBLIC_KEYS_BASE64')
  const keys = new Map<string, Uint8Array>()
  if (entries) {
    for (const entry of entries.split(',')) {
      const separator = entry.indexOf(':')
      if (separator < 1) throw new Error('invalid access token public key ring')
      const keyId = entry.slice(0, separator).trim()
      const value = entry.slice(separator + 1).trim()
      if (!/^[A-Za-z0-9_.-]{1,64}$/.test(keyId) || keys.has(keyId)) {
        throw new Error('invalid access token public key ring')
      }
      try {
        const decoded = Uint8Array.from(atob(value), (char) => char.charCodeAt(0))
        if (decoded.byteLength !== 32) throw new Error()
        keys.set(keyId, decoded)
      } catch {
        throw new Error('invalid access token public key ring')
      }
    }
  }
  const single = env('SPECTRA_ACCESS_TOKEN_PUBLIC_KEY_BASE64')
  if (single) {
    let decoded: Uint8Array
    try {
      decoded = Uint8Array.from(atob(single), (char) => char.charCodeAt(0))
    } catch {
      throw new Error('invalid access token public key')
    }
    if (decoded.byteLength !== 32) throw new Error('invalid access token public key')
    keys.set(defaultKeyId, decoded)
  }
  if (keys.size === 0) throw new Error('missing access token public keys')
  return keys
}

export function loadConfig(): RuntimeConfig {
  if (cached) return cached
  const supabaseUrl = required('SUPABASE_URL').replace(/\/+$/, '')
  validateSupabaseUrl(supabaseUrl)
  const databaseUrl = env('SPECTRA_POSTGRES_DSN') || required('SUPABASE_DB_URL')
  const parsedDatabase = new URL(databaseUrl)
  if (!['postgres:', 'postgresql:'].includes(parsedDatabase.protocol) || !parsedDatabase.username) {
    throw new Error('invalid database url')
  }
  const accessKeyId = required('SPECTRA_ACCESS_TOKEN_KEY_ID')
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(accessKeyId)) throw new Error('invalid access key id')
  const privateKey = decodeBase64('SPECTRA_ACCESS_TOKEN_PRIVATE_KEY_BASE64', [32, 64])
  const issuer = required('SPECTRA_SESSION_ISSUER')
  const audience = required('SPECTRA_SESSION_AUDIENCE')
  const internalSecrets = [
    env('SPECTRA_INTERNAL_SECRET'),
    ...env('SPECTRA_INTERNAL_SECRETS').split(',').map((value) => value.trim()),
  ].filter(Boolean)
  if (internalSecrets.some((secret) => secret.length < 32)) {
    throw new Error('internal secret is too short')
  }
  const signingSecret = required('SPECTRA_OBJECT_STORAGE_SIGNING_SECRET')
  if (signingSecret.length < 32) throw new Error('object signing secret is too short')
  cached = {
    databaseUrl,
    supabaseUrl,
    supabasePublishableKey: required('SUPABASE_ANON_KEY'),
    supabaseServiceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    issuer,
    audience,
    accessPrivateKey: privateKey,
    accessPublicKeys: loadPublicKeys(accessKeyId),
    accessKeyId,
    internalSecrets,
    allowedOrigins: new Set(
      env('SPECTRA_ADMIN_ALLOWED_ORIGINS').split(',').map((value) => value.trim()).filter(Boolean),
    ),
    rateLimitPerMinute: positiveInt('SPECTRA_RATE_LIMIT_PER_MINUTE', 120),
    metricsInternalOnly: env('SPECTRA_METRICS_INTERNAL_ONLY') !== 'false',
    storageBucket: env('SPECTRA_OBJECT_STORAGE_BUCKET') || 'objects',
    objectSigningSecret: signingSecret,
    objectMaxBytes: positiveInt('SPECTRA_OBJECT_STORAGE_MAX_BYTES', 50 * 1024 * 1024),
    objectTokenTtlSeconds: positiveInt('SPECTRA_OBJECT_STORAGE_SIGNED_URL_TTL_SECONDS', 900),
    discoveryVdf: loadDiscoveryVdfParams(),
  }
  return cached
}

function validateSupabaseUrl(value: string): void {
  if (env('SPECTRA_ENV') !== 'production') {
    const parsed = new URL(value)
    if (
      parsed.protocol === 'http:' &&
      parsed.hostname === 'kong' &&
      parsed.port === '8000' &&
      !parsed.username &&
      !parsed.password &&
      !parsed.hash
    ) return
  }
  validHttpsUrl(value, env('SPECTRA_ENV') !== 'production')
}

export function optionalEnv(name: string): string {
  return env(name)
}

export function resetConfigForTests(): void {
  cached = undefined
}
