import { optionalEnv } from './config.ts'
import { type Database, db } from './db.ts'
import { HttpError, isRecord, validHttpsUrl } from './http.ts'

const defaultFiatCodes = [
  'USD',
  'EUR',
  'GBP',
  'CAD',
  'AUD',
  'BRL',
  'MXN',
  'INR',
  'IDR',
  'PHP',
  'VES',
]

export async function currentMarketPrices(refresh = true): Promise<Record<string, unknown>> {
  if (refresh) await runMarketWorker().catch(() => undefined)
  const assets = await db()<{
    symbol: string
    usd_rate: string
    source: string
    fetched_at: string
    expires_at: string
  }[]>`
    select symbol, usd_rate::text, source,
      case when fetched_at='infinity'::timestamptz then 'infinity'
        else to_char(fetched_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end as fetched_at,
      case when expires_at='infinity'::timestamptz then 'infinity'
        else to_char(expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end as expires_at
    from mobile_market_asset_prices where usd_rate > 0 order by symbol limit 100
  `
  const fiat = await db()<{
    code: string
    usd_rate: string
    source: string
    fetched_at: string
    expires_at: string
  }[]>`
    select code, usd_rate::text, source,
      case when fetched_at='infinity'::timestamptz then 'infinity'
        else to_char(fetched_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end as fetched_at,
      case when expires_at='infinity'::timestamptz then 'infinity'
        else to_char(expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end as expires_at
    from mobile_fiat_rates where usd_rate > 0 order by code limit 250
  `
  return {
    assetPrices: assets.map((row) => ({
      symbol: row.symbol,
      usdRate: row.usd_rate,
      source: row.source,
      fetchedAt: row.fetched_at,
      expiresAt: row.expires_at,
    })),
    fiatRates: fiat.map((row) => ({
      code: row.code,
      usdRate: row.usd_rate,
      source: row.source,
      fetchedAt: row.fetched_at,
      expiresAt: row.expires_at,
    })),
    baseFiat: 'USD',
  }
}

export async function runMarketWorker(): Promise<Record<string, unknown>> {
  const run = await db().begin(async (sql) => {
    const lock = await sql<{
      locked: boolean
    }[]>`
      select pg_try_advisory_xact_lock(hashtextextended('spectra_market_worker', 0)) as locked
    `
    if (!lock[0]?.locked) {
      return {
        summary: {
          assetTargetsChecked: 0,
          assetsUpdated: 0,
          fiatTargetsChecked: 0,
          fiatUpdated: 0,
        },
        failure: undefined,
      }
    }
    const assetTargets = await sql<{
      symbol: string
      coingecko_id: string
    }[]>`
      select symbol, coingecko_id from mobile_market_asset_prices
      where expires_at <= now() and manual_override=false and coingecko_id is not null
      order by symbol limit 50
    `
    const fiatCodes = await sql<{
      code: string
    }[]>`
      select code from mobile_fiat_rates where expires_at <= now() order by code limit 50
    `
    let assetsUpdated = 0
    let fiatUpdated = 0
    let failure: unknown
    if (assetTargets.length > 0) {
      try {
        assetsUpdated = await refreshAssets(sql, assetTargets)
      } catch (error) {
        failure = error
      }
    }
    if (fiatCodes.length > 0) {
      try {
        fiatUpdated = await refreshFiat(sql, fiatCodes.map((row) => row.code))
      } catch (error) {
        failure ??= error
      }
    }
    return {
      summary: {
        assetTargetsChecked: assetTargets.length,
        assetsUpdated,
        fiatTargetsChecked: fiatCodes.length,
        fiatUpdated,
      },
      failure,
    }
  })
  if (run.failure) throw run.failure
  return run.summary
}

async function refreshAssets(
  sql: Database,
  targets: { symbol: string; coingecko_id: string }[],
): Promise<number> {
  targets = targets.filter((target) =>
    /^[A-Z0-9]{1,20}$/.test(target.symbol) &&
    /^[a-z0-9-]{1,100}$/.test(target.coingecko_id)
  )
  if (targets.length === 0) return 0
  const base = optionalEnv('SPECTRA_COINGECKO_BASE_URL') || 'https://api.coingecko.com/api/v3'
  const endpoint = marketUrl(base)
  endpoint.pathname = `${endpoint.pathname.replace(/\/$/, '')}/simple/price`
  endpoint.searchParams.set(
    'ids',
    [...new Set(targets.map((target) => target.coingecko_id))].sort().join(','),
  )
  endpoint.searchParams.set('vs_currencies', 'usd')
  const response = await fetch(endpoint, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new HttpError(502, 'market_data_error')
  const bytes = await readBounded(response, 1024 * 1024)
  let body: unknown
  try {
    body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    throw new HttpError(502, 'market_data_error')
  }
  if (!isRecord(body)) throw new HttpError(502, 'market_data_error')
  let updated = 0
  const now = new Date()
  const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  for (const target of targets) {
    const entry = body[target.coingecko_id]
    if (!isRecord(entry) || !validRate(entry.usd)) continue
    const result = await sql`
      update mobile_market_asset_prices
      set usd_rate=${String(entry.usd)}, source='coingecko', fetched_at=${now},
        expires_at=${expires}, updated_at=${now}
      where symbol=${target.symbol} and manual_override=false
      returning symbol
    `
    updated += result.length
  }
  return updated
}

async function refreshFiat(sql: Database, staleCodes: string[]): Promise<number> {
  staleCodes = staleCodes.filter((code) => /^[A-Z]{3}$/.test(code))
  if (staleCodes.length === 0) return 0
  const base = optionalEnv('SPECTRA_FOREX_BASE_URL') || 'https://open.er-api.com'
  const endpoint = marketUrl(base)
  endpoint.pathname = `${endpoint.pathname.replace(/\/$/, '')}/v6/latest/USD`
  const apiKey = optionalEnv('SPECTRA_FOREX_API_KEY')
  if (apiKey) endpoint.searchParams.set('app_id', apiKey)
  const response = await fetch(endpoint, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new HttpError(502, 'market_data_error')
  const bytes = await readBounded(response, 1024 * 1024)
  let body: unknown
  try {
    body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    throw new HttpError(502, 'market_data_error')
  }
  if (!isRecord(body) || !isRecord(body.rates)) throw new HttpError(502, 'market_data_error')
  const configured = optionalEnv('SPECTRA_MARKET_FIAT_CODES')
    .split(',').map((code) => code.trim().toUpperCase()).filter((code) => /^[A-Z]{3}$/.test(code))
  const allowed = new Set(configured.length > 0 ? configured : defaultFiatCodes)
  const now = new Date()
  const expires = new Date(now.getTime() + 12 * 60 * 60 * 1000)
  let updated = 0
  for (const code of staleCodes) {
    if (!allowed.has(code)) continue
    const rate = code === 'USD' ? 1 : body.rates[code]
    if (!validRate(rate)) continue
    const result = await sql`
      insert into mobile_fiat_rates
        (code, usd_rate, source, fetched_at, expires_at, updated_at)
      values (${code}, ${String(rate)}, 'forex', ${now}, ${expires}, ${now})
      on conflict (code) do update set
        usd_rate=excluded.usd_rate, source=excluded.source, fetched_at=excluded.fetched_at,
        expires_at=excluded.expires_at, updated_at=excluded.updated_at
      returning code
    `
    updated += result.length
  }
  return updated
}

function validRate(value: unknown): boolean {
  const text = String(value)
  return text.length <= 128 && /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text) && Number(text) > 0 &&
    Number.isFinite(Number(text))
}

function marketUrl(value: string): URL {
  const trusted = optionalEnv('SPECTRA_MARKET_TRUSTED_UPSTREAM') === 'true'
  const url = validHttpsUrl(
    value,
    trusted,
  )
  if (url.search || (!trusted && privateHostname(url.hostname))) {
    throw new HttpError(503, 'market_data_not_configured')
  }
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

async function readBounded(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length') ?? '0')
  if (!Number.isFinite(declared) || declared > maxBytes) {
    throw new HttpError(502, 'market_data_error')
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
        throw new HttpError(502, 'market_data_error')
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
