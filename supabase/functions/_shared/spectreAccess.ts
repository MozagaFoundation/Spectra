import type { Principal } from './auth.ts'
import { optionalEnv } from './config.ts'
import { db } from './db.ts'
import { bytesToHex, hexToBytes, json, sha256Hex } from './http.ts'

const purpose = 'spectre_ephemeral'
const domain = `spectra.mobile.account-ticket.v1.${purpose}`
const encoder = new TextEncoder()

interface BlindKey {
  keyId: string
  modulusHex: string
  publicExponentHex: string
  privateExponentHex: string
  modulus: bigint
  publicExponent: bigint
  privateExponent: bigint
  modulusBytes: number
}

export class SpectreAccessError extends Error {
  constructor(readonly status: number, readonly publicMessage: string) {
    super(publicMessage)
  }
}

export function spectreAccessErrorResponse(error: SpectreAccessError): Response {
  return json({ message: error.publicMessage }, error.status)
}

function key(): BlindKey {
  const read = (name: string) =>
    optionalEnv(`SPECTRA_SPECTRE_EPHEMERAL_BLIND_TOKEN_${name}`) ||
    optionalEnv(`SPECTRE_EPHEMERAL_BLIND_TOKEN_${name}`)
  const keyId = read('KEY_ID').trim()
  const modulusHex = normalizeHex(read('MODULUS_HEX'))
  const publicExponentHex = normalizeHex(read('PUBLIC_EXPONENT_HEX'))
  const privateExponentHex = normalizeHex(read('PRIVATE_EXPONENT_HEX'))
  if (
    !/^[A-Za-z0-9_.-]{1,128}$/.test(keyId) ||
    modulusHex.length < 512 || modulusHex.length > 1024 ||
    !publicExponentHex || publicExponentHex.length > 16 || !privateExponentHex ||
    privateExponentHex.length > modulusHex.length
  ) {
    throw new SpectreAccessError(503, 'Unknown blind activation token key id')
  }

  const modulus = BigInt(`0x${modulusHex}`)
  const publicExponent = BigInt(`0x${publicExponentHex}`)
  const privateExponent = BigInt(`0x${privateExponentHex}`)
  if (
    modulus % 2n !== 1n || modulus <= 3n ||
    publicExponent !== 65537n || publicExponent >= modulus ||
    modPow(modPow(42n, privateExponent, modulus), publicExponent, modulus) !== 42n
  ) {
    throw new SpectreAccessError(503, 'Unknown blind activation token key id')
  }

  return {
    keyId,
    modulusHex,
    publicExponentHex,
    privateExponentHex,
    modulus,
    publicExponent,
    privateExponent,
    modulusBytes: modulusHex.length / 2,
  }
}

export function blindParams(value: string | null): Record<string, unknown> {
  if (value && value !== purpose) {
    throw new SpectreAccessError(400, 'Unsupported ticket purpose')
  }

  const configured = key()
  return {
    algorithm: 'rsa-fdh-v1',
    domain,
    issueIntervalHours: 24,
    keyId: configured.keyId,
    purpose,
    modulusHex: configured.modulusHex,
    publicExponentHex: configured.publicExponentHex,
  }
}

async function activeWallet(principal: Principal): Promise<string> {
  const rows = await db()<[{ wallet_address: string }?]>`
    select wallet_address from auth_wallet_bindings where user_id=${principal.userId}
    order by verified_at desc, wallet_address asc limit 1
  `
  if (!rows[0]) {
    throw new SpectreAccessError(401, 'Authenticated wallet required')
  }
  return rows[0].wallet_address
}

async function buildSpectreAccess(wallet: string): Promise<Record<string, unknown>> {
  const now = new Date()
  await db()`
    delete from mobile_spectre_addresses
    where wallet_address=${wallet} and is_ephemeral=true and expires_at <= ${now}
  `
  const spectreRows = await db()<{
    is_ephemeral: boolean
    expires_at: Date | null
  }[]>`
    select is_ephemeral, expires_at from mobile_spectre_addresses
    where wallet_address=${wallet}
  `
  const issueRows = await db()<{
    last_issued_at: Date | null
    next_available_at: Date | null
  }[]>`
    select last_issued_at, next_available_at
    from mobile_account_blind_token_issues
    where wallet_address=${wallet} and ticket_purpose=${purpose}
      and period_start='1970-01-01'::date
  `

  const spectre = spectreRows[0]
  const issue = issueRows[0]
  const availableAt = issue?.next_available_at ?? null
  const isSpectre = Boolean(spectre)
  return {
    walletAddress: wallet,
    canRequestEphemeralToken: !isSpectre && (
      !availableAt || now.getTime() >= availableAt.getTime()
    ),
    spectreTokenLastIssuedAt: issue?.last_issued_at?.toISOString() ?? null,
    spectreTokenAvailableAt: availableAt?.toISOString() ?? null,
    currentWalletIsSpectre: isSpectre,
    currentSpectreIsEphemeral: spectre?.is_ephemeral ?? false,
    currentSpectreExpiresAt: spectre?.expires_at?.toISOString() ?? null,
    refreshedAt: now.toISOString(),
  }
}

export async function currentSpectreAccess(
  principal: Principal,
): Promise<Record<string, unknown>> {
  return buildSpectreAccess(await activeWallet(principal))
}

export async function issueBlindToken(
  principal: Principal,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (body.ticketPurpose !== purpose) {
    throw new SpectreAccessError(400, 'Unsupported ticket purpose')
  }

  const configured = key()
  const rootWallet = typeof body.rootWalletAddress === 'string' && body.rootWalletAddress.trim()
    ? normalizeWallet(body.rootWalletAddress)
    : await activeWallet(principal)
  const bound = await db()`
    select 1 from auth_wallet_bindings
    where user_id=${principal.userId} and wallet_address=${rootWallet}
  `
  if (!bound[0]) {
    throw new SpectreAccessError(401, 'Authenticated wallet required')
  }

  const blinded = parsePositiveBigInt(
    body.blindedMessageHex,
    configured.modulus,
    configured.modulusBytes,
  )
  if (blinded === null || gcd(blinded, configured.modulus) !== 1n) {
    throw new SpectreAccessError(400, 'Invalid blind activation token')
  }

  const now = new Date()
  const nextAvailableAt = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  await db().begin(async (sql) => {
    await sql`select pg_advisory_xact_lock(hashtextextended(${`${rootWallet}:${purpose}`},0))`
    const rootIsSpectre = await sql`
      select 1 from mobile_spectre_addresses where wallet_address=${rootWallet}
    `
    if (rootIsSpectre[0]) {
      throw new SpectreAccessError(
        403,
        'A Spectre address cannot issue another Spectre activation token',
      )
    }

    await sql`
      insert into mobile_spectre_root_wallets (
        wallet_address, registered_at, updated_at
      ) values (
        ${rootWallet}, ${now}, ${now}
      )
      on conflict (wallet_address) do update set updated_at=excluded.updated_at
    `
    const prior = await sql<{
      next_available_at: Date | null
    }[]>`
      select next_available_at from mobile_account_blind_token_issues
      where wallet_address=${rootWallet} and ticket_purpose=${purpose}
        and period_start='1970-01-01'::date for update
    `
    if (prior[0]?.next_available_at && now < prior[0].next_available_at) {
      throw new SpectreAccessError(
        409,
        'Next ephemeral Spectre activation token is not available yet',
      )
    }
    await sql`
      insert into mobile_account_blind_token_issues (
        wallet_address, ticket_purpose, period_start, issued_count, last_issued_at,
        next_available_at, updated_at
      ) values (
        ${rootWallet}, ${purpose}, '1970-01-01'::date, 1, ${now}, ${nextAvailableAt}, ${now}
      )
      on conflict (wallet_address, ticket_purpose, period_start) do update set
        issued_count=1, last_issued_at=excluded.last_issued_at,
        next_available_at=excluded.next_available_at, updated_at=excluded.updated_at
    `
  })

  const signature = modPow(blinded, configured.privateExponent, configured.modulus)
    .toString(16).padStart(configured.modulusBytes * 2, '0')
  return {
    blindSignatureHex: signature,
    issue: {
      walletAddress: rootWallet,
      ticketPurpose: purpose,
      issuedAt: now.toISOString(),
      nextAvailableAt: nextAvailableAt.toISOString(),
    },
    publicParams: blindParams(purpose),
  }
}

export async function redeemBlindToken(
  principal: Principal,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (body.ticketPurpose !== purpose || body.isEphemeral !== true) {
    throw new SpectreAccessError(400, 'Unsupported ticket purpose')
  }

  const wallet = normalizeWallet(body.walletAddress)
  const configured = key()
  if (body.keyId !== configured.keyId) {
    throw new SpectreAccessError(503, 'Unknown blind activation token key id')
  }
  const bound = await db()`
    select 1 from auth_wallet_bindings
    where user_id=${principal.userId} and wallet_address=${wallet}
  `
  if (!bound[0]) {
    throw new SpectreAccessError(401, 'Authenticated wallet required')
  }

  const signature = parsePositiveBigInt(
    body.signatureHex,
    configured.modulus,
    configured.modulusBytes,
  )
  const nullifier = normalizeHex(body.nullifierHex)
  if (!signature || nullifier.length !== 64) {
    throw new SpectreAccessError(400, 'Invalid blind activation token')
  }
  const representative = await hashRepresentative(configured, wallet, nullifier)
  if (modPow(signature, configured.publicExponent, configured.modulus) !== representative) {
    throw new SpectreAccessError(400, 'Invalid blind activation token')
  }

  const nullifierHash = await sha256Hex(Uint8Array.from([
    ...encoder.encode('spectra.mobile.spectre.activate.nullifier.v1'),
    ...hexToBytes(nullifier),
  ]))
  const now = new Date()
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  try {
    await db().begin(async (sql) => {
      await sql`
        delete from mobile_spectre_addresses
        where wallet_address=${wallet} and is_ephemeral=true and expires_at <= ${now}
      `
      const root = await sql`
        select 1 from mobile_spectre_root_wallets where wallet_address=${wallet}
      `
      if (root[0]) {
        throw new SpectreAccessError(
          403,
          'A root wallet cannot also be used as a Spectre address',
        )
      }
      const existingSpectre = await sql`
        select 1 from mobile_spectre_addresses where wallet_address=${wallet}
      `
      if (existingSpectre[0]) {
        throw new SpectreAccessError(
          409,
          'This Spectre address is already active with a different lifecycle',
        )
      }
      await sql`
        insert into mobile_account_blind_token_redemptions (
          nullifier_hash, wallet_address, ticket_purpose, token_key_id,
          is_ephemeral, redeemed_at, updated_at
        ) values (
          ${nullifierHash}, ${wallet}, ${purpose}, ${configured.keyId}, true, ${now}, ${now}
        )
      `
      await sql`
        insert into mobile_spectre_addresses
          (wallet_address, is_ephemeral, activated_at, expires_at, updated_at)
        values (${wallet}, true, ${now}, ${expiresAt}, ${now})
      `
    })
  } catch (error) {
    if (
      error && typeof error === 'object' &&
      ('code' in error && (error as { code?: unknown }).code === '23505')
    ) {
      throw new SpectreAccessError(409, 'This blind activation token was already redeemed')
    }
    throw error
  }

  return {
    activatedWalletAddress: wallet,
    isEphemeral: true,
    expiresAt: expiresAt.toISOString(),
    access: await buildSpectreAccess(wallet),
  }
}

export async function closeSpectre(principal: Principal): Promise<Record<string, unknown>> {
  const wallet = await activeWallet(principal)
  const rows = await db()`
    delete from mobile_spectre_addresses where wallet_address=${wallet} returning wallet_address
  `
  return {
    closed: rows.length > 0,
    walletAddress: wallet,
    reason: rows.length > 0 ? 'closed' : 'not_found',
  }
}

function normalizeWallet(value: unknown): string {
  if (typeof value !== 'string' || !/^EXO00[0-9a-f]{38}$/i.test(value.trim())) {
    throw new SpectreAccessError(400, 'Invalid Spectre wallet address')
  }
  return `EXO00${value.trim().slice(5).toLowerCase()}`
}

function normalizeHex(value: unknown): string {
  if (typeof value !== 'string') return ''
  const normalized = value.trim().toLowerCase().replace(/^0x/, '')
  return normalized && normalized.length % 2 === 0 && /^[0-9a-f]+$/.test(normalized)
    ? normalized
    : ''
}

function parsePositiveBigInt(
  value: unknown,
  modulus: bigint,
  modulusBytes: number,
): bigint | null {
  const normalized = normalizeHex(value)
  if (!normalized || normalized.length > modulusBytes * 2) return null
  const number = BigInt(`0x${normalized}`)
  return number > 0n && number < modulus ? number : null
}

function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  let result = 1n
  let value = base % modulus
  let power = exponent
  while (power > 0n) {
    if (power & 1n) {
      result = result * value % modulus
    }
    value = value * value % modulus
    power >>= 1n
  }
  return result
}

function gcd(left: bigint, right: bigint): bigint {
  let a = left
  let b = right
  while (b !== 0n) {
    const remainder = a % b
    a = b
    b = remainder
  }
  return a
}

async function hashRepresentative(
  configured: BlindKey,
  wallet: string,
  nullifier: string,
): Promise<bigint> {
  const message = [
    domain,
    `key_id:${configured.keyId}`,
    `purpose:${purpose}`,
    `wallet:${wallet}`,
    'ephemeral:1',
    `nullifier:${nullifier}`,
  ].join('\n')
  const output = new Uint8Array(configured.modulusBytes)
  let offset = 0
  let counter = 0
  while (offset < output.length) {
    const counterBytes = new Uint8Array(4)
    new DataView(counterBytes.buffer).setUint32(0, counter, false)
    const chunk = new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        Uint8Array.from([
          ...encoder.encode('spectra.mobile.spectre.activate.fdh.v1'),
          ...counterBytes,
          ...encoder.encode(message),
        ]),
      ),
    )
    const length = Math.min(chunk.length, output.length - offset)
    output.set(chunk.slice(0, length), offset)
    offset += length
    counter++
  }
  return BigInt(`0x${bytesToHex(output)}`) % (configured.modulus - 1n) + 1n
}
