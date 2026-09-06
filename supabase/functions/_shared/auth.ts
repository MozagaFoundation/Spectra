import { keccak_256 } from '@noble/hashes/sha3'
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import { loadConfig } from './config.ts'
import { type Database, db } from './db.ts'
import {
  base64UrlDecode,
  base64UrlEncode,
  bytesToHex,
  databaseConstraint,
  databaseErrorCode,
  hexToBytes,
  HttpError,
  randomToken,
  sha256Hex,
} from './http.ts'
import {
  hashVdfBinding,
  VDF_MIN_CHALLENGE_AGE_MS,
  type VdfProof,
  type VdfPublicParams,
  verifyVdf,
} from './vdf.ts'

const encoder = new TextEncoder()
const walletPattern = /^EXO00[0-9a-f]{38}$/
const accessTtlMs = 15 * 60 * 1000
const refreshTtlMs = 14 * 24 * 60 * 60 * 1000
const clockSkewSeconds = 60

export interface Principal {
  userId: string
  walletAddress: string
  identityId?: string
  sessionId: string
}

interface Session {
  accessToken: string
  refreshToken: string
  accessExpiresAt: number
  refreshExpiresAt: number
  sessionId: string
  identityId: string | null
}

interface WalletAdmissionVdfChallenge {
  challengeId: string
  nonceHex: string
  bindingHash: string
  expiresAt: number
  notBeforeAt: number
  params: VdfPublicParams
}

function normalizeWallet(value: unknown): string {
  if (typeof value !== 'string') throw new HttpError(400, 'invalid_request')
  const trimmed = value.trim()
  if (!/^EXO00[0-9a-f]{38}$/i.test(trimmed)) throw new HttpError(400, 'invalid_request')
  return `EXO00${trimmed.slice(5).toLowerCase()}`
}

async function userIdForWallet(wallet: string): Promise<string> {
  return `wallet:${await sha256Hex(wallet)}`
}

export async function hasPendingAccountDeletion(
  userId: string,
  sql: Database = db(),
): Promise<boolean> {
  const deletions = await sql`
    select 1
    from account_deletion_jobs
    where user_id=${userId}
      and status in ('pending', 'failed')
  `
  return deletions.length > 0
}

function challengeFields(challenge: string): Record<string, string> {
  const lines = challenge.split('\n')
  if (lines.length !== 6 || lines[0] !== 'EXO wallet auth') {
    throw new HttpError(400, 'invalid_request')
  }
  const result: Record<string, string> = {}
  for (const line of lines.slice(1)) {
    const separator = line.indexOf(':')
    if (separator < 1) throw new HttpError(400, 'invalid_request')
    const key = line.slice(0, separator)
    const value = line.slice(separator + 1)
    if (!['version', 'uid', 'wallet', 'nonce', 'expires_at'].includes(key) || result[key]) {
      throw new HttpError(400, 'invalid_request')
    }
    result[key] = value
  }
  if (
    result.version !== '1' || !result.uid || !result.wallet ||
    !walletPattern.test(result.wallet) || !/^[0-9a-f]{64}$/.test(result.nonce ?? '') ||
    !result.expires_at || !Number.isFinite(Date.parse(result.expires_at))
  ) throw new HttpError(400, 'invalid_request')
  return result
}

function parseVdfProof(value: unknown): VdfProof {
  if (!value || typeof value !== 'object') {
    throw new HttpError(400, 'invalid_request')
  }
  const proof = value as Record<string, unknown>
  const { algorithm, parameterId, outputHex, proofHex } = proof
  if (
    typeof algorithm !== 'string' ||
    typeof parameterId !== 'string' ||
    typeof outputHex !== 'string' ||
    typeof proofHex !== 'string'
  ) throw new HttpError(400, 'invalid_request')
  return {
    algorithm: algorithm as VdfProof['algorithm'],
    parameterId,
    outputHex,
    proofHex,
  }
}

async function verifyWalletAdmissionVdf(
  authChallenge: string,
  userId: string,
  walletAddress: string,
  challengeIdValue: unknown,
  proofValue: unknown,
): Promise<void> {
  if (typeof challengeIdValue !== 'string' || !/^vdfc1\.[0-9a-f]{32,128}$/.test(challengeIdValue)) {
    throw new HttpError(400, 'vdf_required')
  }
  const params = loadConfig().discoveryVdf
  if (!params) throw new HttpError(503, 'vdf_unavailable')
  const bindingHash = hashVdfBinding({
    action: 'wallet_admission',
    authChallenge,
    userId,
    walletAddress,
  })
  const rows = await db()<{
    challenge_id: string
    nonce_hex: string
    parameter_id: string
    created_at: Date
    expires_at: Date
  }[]>`
    select challenge_id, nonce_hex, parameter_id, created_at, expires_at
    from chat_vdf_challenges
    where challenge_id=${challengeIdValue}
      and owner_user_id=${userId}
      and wallet_address=${walletAddress}
      and action='wallet_admission'
      and binding_hash=${bindingHash}
      and consumed_at is null
  `
  const challenge = rows[0]
  if (
    !challenge ||
    challenge.expires_at.getTime() <= Date.now() ||
    challenge.parameter_id !== params.parameterId
  ) {
    throw new HttpError(409, 'vdf_challenge_expired')
  }
  const remainingMs = challenge.created_at.getTime() + VDF_MIN_CHALLENGE_AGE_MS - Date.now()
  if (remainingMs > 0) {
    throw new HttpError(409, 'vdf_too_early', {
      'retry-after': String(Math.max(1, Math.ceil(remainingMs / 1_000))),
    })
  }
  if (
    !verifyVdf(params, {
      challengeId: challenge.challenge_id,
      nonceHex: challenge.nonce_hex,
      action: 'wallet_admission',
      bindingHash,
    }, parseVdfProof(proofValue))
  ) {
    throw new HttpError(400, 'invalid_vdf_proof')
  }
}

export async function issueChallenge(walletValue: unknown): Promise<Record<string, unknown>> {
  const walletAddress = normalizeWallet(walletValue)
  const userId = await userIdForWallet(walletAddress)
  const existingBinding = await db()`
    select 1 from auth_wallet_bindings
    where wallet_address=${walletAddress}
  `
  const vdfParams = existingBinding[0] ? undefined : loadConfig().discoveryVdf
  if (!existingBinding[0] && !vdfParams) throw new HttpError(503, 'vdf_unavailable')
  const createdAt = new Date()
  const expiresAt = new Date(createdAt.getTime() + 5 * 60 * 1000)
  const nonce = bytesToHex(crypto.getRandomValues(new Uint8Array(32)))
  const expiration = expiresAt.toISOString()
  const challenge = [
    'EXO wallet auth',
    'version:1',
    `uid:${userId}`,
    `wallet:${walletAddress}`,
    `nonce:${nonce}`,
    `expires_at:${expiration}`,
  ].join('\n')
  await db()`
    insert into auth_wallet_challenges
      (challenge, user_id, wallet_address, expires_at, created_at)
    values (${challenge}, ${userId}, ${walletAddress}, ${expiresAt}, ${createdAt})
  `
  let vdfChallenge: WalletAdmissionVdfChallenge | undefined
  if (!existingBinding[0]) {
    const params = vdfParams!
    const challengeId = `vdfc1.${bytesToHex(crypto.getRandomValues(new Uint8Array(32)))}`
    const nonceHex = bytesToHex(crypto.getRandomValues(new Uint8Array(32)))
    const vdfExpiresAt = new Date(createdAt.getTime() + 5 * 60 * 1000)
    const notBeforeAt = new Date(createdAt.getTime() + VDF_MIN_CHALLENGE_AGE_MS)
    const bindingHash = hashVdfBinding({
      action: 'wallet_admission',
      authChallenge: challenge,
      userId,
      walletAddress,
    })
    await db()`
      insert into chat_vdf_challenges (
        challenge_id, owner_user_id, wallet_address, action, binding_hash,
        nonce_hex, parameter_id, created_at, expires_at
      ) values (
        ${challengeId}, ${userId}, ${walletAddress}, 'wallet_admission', ${bindingHash},
        ${nonceHex}, ${params.parameterId}, ${createdAt}, ${vdfExpiresAt}
      )
    `
    vdfChallenge = {
      challengeId,
      nonceHex,
      bindingHash,
      expiresAt: vdfExpiresAt.getTime(),
      notBeforeAt: notBeforeAt.getTime(),
      params,
    }
  }
  return {
    challenge,
    expiresAt: expiresAt.getTime(),
    ...(vdfChallenge ? { vdfChallenge } : {}),
  }
}

export async function verifyChallenge(input: {
  challenge: unknown
  walletAddress: unknown
  publicKey: unknown
  identityId?: unknown
  signature: unknown
  vdfChallengeId?: unknown
  vdfProof?: unknown
}): Promise<Record<string, unknown>> {
  if (typeof input.challenge !== 'string' || input.challenge.length > 2048) {
    throw new HttpError(400, 'invalid_request')
  }
  const walletAddress = normalizeWallet(input.walletAddress)
  const fields = challengeFields(input.challenge)
  const userId = await userIdForWallet(walletAddress)
  if (
    typeof input.publicKey !== 'string' || !/^0x[0-9a-fA-F]{3904}$/.test(input.publicKey) ||
    typeof input.signature !== 'string' || !/^0x[0-9a-fA-F]{6618}$/.test(input.signature)
  ) throw new HttpError(400, 'invalid_request')
  const challenges = await db()<{
    user_id: string
    wallet_address: string
    expires_at: Date
  }[]>`
    select user_id, wallet_address, expires_at
    from auth_wallet_challenges where challenge=${input.challenge}
  `
  const challenge = challenges[0]
  if (!challenge) throw new HttpError(409, 'challenge_not_found')
  if (
    fields.wallet !== walletAddress || fields.uid !== userId ||
    challenge.user_id !== userId || challenge.wallet_address !== walletAddress
  ) {
    throw new HttpError(409, 'challenge_mismatch')
  }
  if (challenge.expires_at.getTime() <= Date.now()) {
    throw new HttpError(409, 'challenge_expired')
  }
  const publicKey = hexToBytes(input.publicKey)
  const signature = hexToBytes(input.signature)
  const digest = keccak_256(publicKey)
  const derived = `EXO${bytesToHex(Uint8Array.from([0, ...digest.slice(-19)]))}`
  if (derived !== walletAddress) throw new HttpError(400, 'invalid_signature')
  const payload = encoder.encode(`Spectra.WalletAuthChallenge.v1\0${input.challenge}`)
  if (!ml_dsa65.verify(signature, payload, publicKey)) {
    throw new HttpError(400, 'invalid_signature')
  }
  const identityId = input.identityId === undefined || input.identityId === null
    ? null
    : normalizeIdentity(input.identityId)
  if (await hasPendingAccountDeletion(userId)) {
    throw new HttpError(409, 'account_deletion_pending')
  }
  if (identityId) {
    const binding = await db()`
      select 1
      from auth_wallet_bindings
      where user_id=${userId}
        and lower(wallet_address)=lower(${walletAddress})
        and identity_id=${identityId}
        and primary_mailbox_token is not null
        and identity_key_digest is not null
    `
    if (!binding[0]) throw new HttpError(409, 'identity_not_bound')
  }
  const existingBinding = await db()`
    select 1 from auth_wallet_bindings
    where wallet_address=${walletAddress}
  `
  if (!existingBinding[0]) {
    await verifyWalletAdmissionVdf(
      input.challenge,
      userId,
      walletAddress,
      input.vdfChallengeId,
      input.vdfProof,
    )
  }
  let binding: {
    wallet_address: string
    identity_id: string | null
    verified_at: Date
  }
  try {
    const consumed = await db()<{
      wallet_address: string | null
      identity_id: string | null
      verified_at: Date | null
    }[]>`
      select * from spectra_private.consume_wallet_challenge(
        ${input.challenge}, ${userId}, ${walletAddress}, ${input.publicKey}, ${identityId}
      )
    `
    const persisted = consumed[0]
    if (!persisted?.wallet_address || !persisted.verified_at) {
      throw new HttpError(409, 'challenge_replay')
    }
    binding = {
      wallet_address: persisted.wallet_address,
      identity_id: persisted.identity_id,
      verified_at: persisted.verified_at,
    }
  } catch (error) {
    if (error instanceof HttpError) throw error
    if (databaseErrorCode(error) === '23505') {
      const constraint = databaseConstraint(error) ?? ''
      if (constraint.includes('identity')) throw new HttpError(409, 'identity_already_bound')
      throw new HttpError(409, 'wallet_already_bound')
    }
    throw error
  }
  if (!existingBinding[0]) {
    await db()`
      update chat_vdf_challenges
      set consumed_at=now()
      where challenge_id=${input.vdfChallengeId as string}
        and owner_user_id=${userId}
        and wallet_address=${walletAddress}
        and action='wallet_admission'
        and consumed_at is null
    `
  }
  const session = await issueSession({
    userId,
    walletAddress: binding.wallet_address,
    identityId: binding.identity_id ?? undefined,
  })
  return {
    verified: true,
    identityId: binding.identity_id,
    walletAddress: binding.wallet_address,
    verifiedAt: binding.verified_at.toISOString(),
    session,
  }
}

function normalizeIdentity(value: unknown): string {
  if (typeof value !== 'string') throw new HttpError(400, 'invalid_request')
  const identity = value.trim()
  if (identity.length < 8 || identity.length > 256 || /[\r\n\0]/.test(identity)) {
    throw new HttpError(400, 'invalid_request')
  }
  return identity
}

async function importPrivateKey(): Promise<CryptoKey> {
  const privateKey = loadConfig().accessPrivateKey.slice(0, 32)
  const prefix = Uint8Array.from([
    0x30,
    0x2e,
    0x02,
    0x01,
    0x00,
    0x30,
    0x05,
    0x06,
    0x03,
    0x2b,
    0x65,
    0x70,
    0x04,
    0x22,
    0x04,
    0x20,
  ])
  return await crypto.subtle.importKey(
    'pkcs8',
    Uint8Array.from([...prefix, ...privateKey]),
    'Ed25519',
    false,
    ['sign'],
  )
}

async function signAccessToken(
  principal: Omit<Principal, 'sessionId'>,
  sessionId: string,
  now: Date,
  expiresAt: Date,
): Promise<string> {
  const config = loadConfig()
  const header = base64UrlEncode(encoder.encode(JSON.stringify({
    alg: 'EdDSA',
    typ: 'JWT',
    kid: config.accessKeyId,
  })))
  const payload = base64UrlEncode(encoder.encode(JSON.stringify({
    iss: config.issuer,
    aud: config.audience,
    sub: principal.userId,
    sid: sessionId,
    wallet: principal.walletAddress,
    ...(principal.identityId ? { identity_id: principal.identityId } : {}),
    iat: Math.floor(now.getTime() / 1000),
    exp: Math.floor(expiresAt.getTime() / 1000),
  })))
  const signingInput = `${header}.${payload}`
  const signature = await crypto.subtle.sign(
    'Ed25519',
    await importPrivateKey(),
    encoder.encode(signingInput),
  )
  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`
}

async function issueSession(
  principal: Omit<Principal, 'sessionId'>,
  sql: Database = db(),
): Promise<Session> {
  const now = new Date()
  const accessExpiresAt = new Date(now.getTime() + accessTtlMs)
  const refreshExpiresAt = new Date(now.getTime() + refreshTtlMs)
  const refreshToken = randomToken(32)
  const sessionId = randomToken(32)
  const accessToken = await signAccessToken(principal, sessionId, now, accessExpiresAt)
  await sql`
    insert into auth_refresh_tokens
      (token_hash, session_id, user_id, wallet_address, identity_id, created_at, expires_at)
    values (
      ${await sha256Hex(refreshToken)}, ${sessionId}, ${principal.userId},
      ${principal.walletAddress}, ${principal.identityId ?? null}, ${now}, ${refreshExpiresAt}
    )
  `
  return {
    accessToken,
    refreshToken,
    accessExpiresAt: accessExpiresAt.getTime(),
    refreshExpiresAt: refreshExpiresAt.getTime(),
    sessionId,
    identityId: principal.identityId ?? null,
  }
}

export async function refreshSession(value: unknown): Promise<Session> {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpError(400, 'invalid_refresh_token')
  }
  const oldHash = await sha256Hex(value.trim())
  const rows = await db()<{
    user_id: string
    wallet_address: string
    identity_id: string | null
    expires_at: Date
  }[]>`
    select user_id, wallet_address, identity_id, expires_at
    from auth_refresh_tokens where token_hash = ${oldHash}
  `
  const record = rows[0]
  const now = new Date()
  const refreshToken = randomToken(32)
  const nextHash = await sha256Hex(refreshToken)
  const sessionId = randomToken(32)
  const refreshExpiresAt = new Date(now.getTime() + refreshTtlMs)
  const rotated = await db()<[{ rotated: boolean }]>`
    select spectra_private.rotate_refresh_token(
      ${oldHash}, ${nextHash}, ${sessionId}, ${now}, ${refreshExpiresAt}
    ) as rotated
  `
  if (record && record.expires_at.getTime() <= now.getTime()) {
    throw new HttpError(401, 'refresh_token_expired')
  }
  if (!record || !rotated[0].rotated) throw new HttpError(401, 'refresh_token_replay')
  const accessExpiresAt = new Date(now.getTime() + accessTtlMs)
  const accessToken = await signAccessToken(
    {
      userId: record.user_id,
      walletAddress: record.wallet_address,
      identityId: record.identity_id ?? undefined,
    },
    sessionId,
    now,
    accessExpiresAt,
  )
  return {
    accessToken,
    refreshToken,
    accessExpiresAt: accessExpiresAt.getTime(),
    refreshExpiresAt: refreshExpiresAt.getTime(),
    sessionId,
    identityId: record.identity_id,
  }
}

export async function logoutSession(value: unknown): Promise<void> {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpError(400, 'invalid_refresh_token')
  }
  await db()`
    update auth_refresh_tokens set revoked_at = greatest(now(), created_at)
    where token_hash = ${await sha256Hex(
    value.trim(),
  )} and rotated_at is null and revoked_at is null
  `
}

export async function requireWalletPrincipal(request: Request): Promise<Principal> {
  const values = request.headers.get('authorization')
  if (!values?.startsWith('Bearer ') || values.slice(7).includes(' ')) {
    throw new HttpError(401, 'unauthorized')
  }
  const principal = await validateAccessToken(values.slice(7))
  const states = await db()<[{
    cleanupPending: boolean
    completedDeletion: boolean
  }]>`
    select
      exists(
        select 1
        from account_deletion_jobs
        where user_id=${principal.userId}
          and status in ('pending', 'failed')
      ) as "cleanupPending",
      exists(
        select 1
        from account_deletion_jobs
        where user_id=${principal.userId}
          and status = 'completed'
      ) as "completedDeletion"
  `
  if (states[0].cleanupPending) throw new HttpError(401, 'unauthorized')
  if (!states[0].completedDeletion) return principal

  const sessions = await db()`
    select 1
    from auth_refresh_tokens
    where user_id=${principal.userId}
      and session_id=${principal.sessionId}
    limit 1
  `
  if (!sessions[0]) throw new HttpError(401, 'unauthorized')
  return principal
}

export async function requirePrincipal(request: Request): Promise<Principal> {
  const principal = await requireWalletPrincipal(request)
  if (!principal.identityId) return principal

  const binding = await db()`
    select 1
    from auth_wallet_bindings
    where user_id=${principal.userId}
      and lower(wallet_address)=lower(${principal.walletAddress})
      and identity_id=${principal.identityId}
      and primary_mailbox_token is not null
      and identity_key_digest is not null
  `
  if (!binding[0]) throw new HttpError(403, 'identity_binding_required')
  return principal
}

export async function requireBoundIdentityPrincipal(request: Request): Promise<Principal> {
  const principal = await requirePrincipal(request)
  if (!principal.identityId) throw new HttpError(403, 'identity_binding_required')
  return principal
}

export async function validateAccessToken(token: string): Promise<Principal> {
  const parts = token.split('.')
  if (parts.length !== 3) throw new HttpError(401, 'unauthorized')
  let header: unknown
  let claims: unknown
  try {
    header = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0]!)))
    claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1]!)))
  } catch {
    throw new HttpError(401, 'unauthorized')
  }
  if (!header || typeof header !== 'object' || Array.isArray(header)) {
    throw new HttpError(401, 'unauthorized')
  }
  const headerValue = header as Record<string, unknown>
  if (
    headerValue.alg !== 'EdDSA' || headerValue.typ !== 'JWT' ||
    (headerValue.kid !== undefined && typeof headerValue.kid !== 'string')
  ) throw new HttpError(401, 'unauthorized')
  const config = loadConfig()
  const keyId = typeof headerValue.kid === 'string' ? headerValue.kid.trim() : ''
  const publicKey = keyId
    ? config.accessPublicKeys.get(keyId)
    : config.accessPublicKeys.get('') ?? (
      config.accessPublicKeys.size === 1 ? config.accessPublicKeys.values().next().value : undefined
    )
  if (!publicKey) throw new HttpError(401, 'unauthorized')
  const key = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(publicKey).buffer,
    'Ed25519',
    false,
    ['verify'],
  )
  const verified = await crypto.subtle.verify(
    'Ed25519',
    key,
    new Uint8Array(base64UrlDecode(parts[2]!)).buffer,
    encoder.encode(`${parts[0]}.${parts[1]}`),
  )
  if (!verified || !claims || typeof claims !== 'object' || Array.isArray(claims)) {
    throw new HttpError(401, 'unauthorized')
  }
  const value = claims as Record<string, unknown>
  const now = Math.floor(Date.now() / 1000)
  if (
    value.iss !== config.issuer || value.aud !== config.audience ||
    typeof value.sub !== 'string' || !value.sub.trim() ||
    typeof value.sid !== 'string' || !value.sid.trim() ||
    typeof value.wallet !== 'string' || !/^EXO00[0-9a-f]{38}$/i.test(value.wallet) ||
    !Number.isSafeInteger(value.iat) || !Number.isSafeInteger(value.exp) ||
    (value.iat as number) > now + clockSkewSeconds || (value.exp as number) <= now
  ) throw new HttpError(401, 'unauthorized')
  if (
    value.identity_id !== undefined &&
    (typeof value.identity_id !== 'string' || !value.identity_id.trim() ||
      value.identity_id.length > 256)
  ) throw new HttpError(401, 'unauthorized')
  return {
    userId: value.sub,
    walletAddress: value.wallet,
    identityId: value.identity_id as string | undefined,
    sessionId: value.sid,
  }
}
