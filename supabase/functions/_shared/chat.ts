import { keccak_256 } from '@noble/hashes/sha3'
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import type { Principal } from './auth.ts'
import { loadConfig } from './config.ts'
import { type Database, db } from './db.ts'
import {
  bytesToHex,
  databaseErrorCode,
  hexToBytes,
  HttpError,
  isRecord,
  sha256Hex,
} from './http.ts'
import { publishWakeup } from './realtime_bus.ts'
import { scheduleRelayNotificationDrain } from './relayNotifications.ts'
import {
  hashVdfBinding,
  VDF_MIN_CHALLENGE_AGE_MS,
  type VdfAction,
  type VdfProof,
  verifyVdf,
} from './vdf.ts'
import {
  canonicalDiscoveryAliasKey,
  DISCOVERY_ALIAS_SEARCH_LIMIT,
  escapeIlikePattern,
  MAX_DISCOVERY_ALIAS_BYTES,
  normalizeDiscoveryAlias,
  parseDiscoveryAliasPrefix,
} from './discoveryAlias.ts'

const encoder = new TextEncoder()
const mailboxPattern = /^smbx[12]\.[^\s:]{8,250}$/
const deliveryPattern = /^sdv1\.[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$/
const walletPattern = /^EXO00[0-9a-f]{38}$/i
const DISCOVERY_LOOKUPS_PER_MINUTE = 20
const DISCOVERY_ALIAS_WRITES_PER_MINUTE = 10
const VDF_CHALLENGES_PER_MINUTE = 8
const PRIVATE_IDENTITY_BINDINGS_PER_MINUTE = 12
const TARGET_SESSION_OPK_CLAIMS_PER_HOUR = 20
const VDF_CHALLENGE_TTL_MS = 5 * 60 * 1000
const PUBLIC_DISCOVERY_LEASE_MS = 5 * 60 * 1000
const ACTIVE_DISCOVERY_STEP_MS = 24 * 60 * 60 * 1000
const ACTIVE_DISCOVERY_MAX_MS = 7 * ACTIVE_DISCOVERY_STEP_MS
const ACTIVE_DISCOVERY_CAP_SLACK_MS = 2 * 60 * 60 * 1000
const CONTACT_CARD_TTL_MS = 60 * 60 * 1000
const DISCOVERY_VDF_ACTIONS = new Set<VdfAction>([
  'public_discovery',
  'extend_public_discovery',
  'claim_session_opk',
  'contact_card',
])
const contactCardIdPattern = /^scc1\.[0-9a-f]{32}$/
const contactCardCapabilityPattern = /^sccap1\.[A-Za-z0-9_-]{43}$/
const base64Pattern = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/
const maxContactProfileCapsuleCiphertextBytes = 256 * 1024

function validSafeId(value: unknown, max = 256): value is string {
  return typeof value === 'string' && value.trim() === value &&
    value.length >= 8 && value.length <= max && !/[\s:\0]/.test(value)
}

function normalizeWalletAddress(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() !== value || !walletPattern.test(value)) {
    return null
  }
  return `EXO00${value.slice(5).toLowerCase()}`
}

function queryInteger(value: string | null, fallback: number): number {
  if (value === null || value === '') return fallback
  if (!/^(?:0|[1-9][0-9]*)$/.test(value)) throw new HttpError(400, 'invalid_request')
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) throw new HttpError(400, 'invalid_request')
  return parsed
}

function base64Bytes(value: unknown, expected: number, rejectZero: boolean): Uint8Array | null {
  if (
    typeof value !== 'string' ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  ) return null
  try {
    const decoded = Uint8Array.from(atob(value), (char) => char.charCodeAt(0))
    let canonicalEncoding = ''
    for (const byte of decoded) canonicalEncoding += String.fromCharCode(byte)
    if (btoa(canonicalEncoding) !== value) return null
    if (decoded.length !== expected || (rejectZero && decoded.every((byte) => byte === 0))) {
      return null
    }
    return decoded
  } catch {
    return null
  }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (isRecord(value)) {
    return `{${
      Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
        .join(',')
    }}`
  }
  return JSON.stringify(value)
}

export function isValidBundleRevision(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1
}

function parseVdfProof(value: unknown): VdfProof {
  if (
    !isRecord(value) ||
    typeof value.algorithm !== 'string' ||
    typeof value.parameterId !== 'string' ||
    typeof value.outputHex !== 'string' ||
    typeof value.proofHex !== 'string'
  ) {
    throw new HttpError(400, 'invalid_request')
  }
  return {
    algorithm: value.algorithm as VdfProof['algorithm'],
    parameterId: value.parameterId,
    outputHex: value.outputHex,
    proofHex: value.proofHex,
  }
}

function requireDiscoveryVdf() {
  const params = loadConfig().discoveryVdf
  if (!params) throw new HttpError(503, 'vdf_unavailable')
  return params
}

function publicDiscoveryBinding(
  identityId: string,
  walletAddress: string,
  recipientMailboxToken: string,
  bundle: Record<string, unknown>,
): string {
  return hashVdfBinding({
    action: 'public_discovery',
    bundle,
    identityId,
    recipientMailboxToken,
    walletAddress,
  })
}

function extendPublicDiscoveryBinding(
  identityId: string,
  walletAddress: string,
  recipientMailboxToken: string,
  bundle: Record<string, unknown>,
): string {
  return hashVdfBinding({
    action: 'extend_public_discovery',
    bundle,
    identityId,
    recipientMailboxToken,
    walletAddress,
  })
}

function sessionOpkBinding(requestorId: string, targetIdentityId: string): string {
  return hashVdfBinding({
    action: 'claim_session_opk',
    requestorIdentityId: requestorId,
    targetIdentityId,
  })
}

function nextActiveExpiry(existingExpiresAt: Date | null, nowMs: number): Date {
  const base = existingExpiresAt && existingExpiresAt.getTime() > nowMs
    ? existingExpiresAt.getTime()
    : nowMs
  return new Date(Math.min(base + ACTIVE_DISCOVERY_STEP_MS, nowMs + ACTIVE_DISCOVERY_MAX_MS))
}

function isActiveLeaseAtCap(expiresAt: Date, nowMs: number): boolean {
  return expiresAt.getTime() - nowMs >= ACTIVE_DISCOVERY_MAX_MS - ACTIVE_DISCOVERY_CAP_SLACK_MS
}

type DiscoveryAliasWrite = {
  aliasProvided: boolean
  alias: string | null
  aliasKey: string | null
  autocompleteProvided: boolean
  autocomplete: boolean
}

function parseDiscoveryAliasWrite(body: Record<string, unknown>): DiscoveryAliasWrite | null {
  const aliasProvided = Object.prototype.hasOwnProperty.call(body, 'discoveryAlias')
  const autocompleteProvided = Object.prototype.hasOwnProperty.call(body, 'aliasAutocomplete')
  if (!aliasProvided && !autocompleteProvided) return null

  let alias: string | null = null
  let aliasKey: string | null = null
  if (aliasProvided) {
    if (
      body.discoveryAlias !== null && body.discoveryAlias !== undefined &&
      body.discoveryAlias !== ''
    ) {
      if (typeof body.discoveryAlias !== 'string') throw new HttpError(400, 'invalid_request')
      try {
        alias = normalizeDiscoveryAlias(body.discoveryAlias) ?? null
      } catch {
        throw new HttpError(400, 'invalid_request')
      }
    }
    aliasKey = alias ? canonicalDiscoveryAliasKey(alias) : null
  }
  let autocomplete = true
  if (autocompleteProvided) {
    if (typeof body.aliasAutocomplete !== 'boolean') throw new HttpError(400, 'invalid_request')
    autocomplete = body.aliasAutocomplete
  }
  return { aliasProvided, alias, aliasKey, autocompleteProvided, autocomplete }
}

async function walletHasLiveSpectreAddress(sql: Database, walletAddress: string): Promise<boolean> {
  const rows = await sql<{ present: number }[]>`
    select 1 as present
    from mobile_spectre_addresses
    where lower(wallet_address)=lower(${walletAddress})
      and expires_at > now()
    limit 1
  `
  return rows.length > 0
}

async function assertDiscoveryAliasAllowed(
  sql: Database,
  walletAddress: string,
  write: DiscoveryAliasWrite | null,
): Promise<void> {
  if (write?.alias && await walletHasLiveSpectreAddress(sql, walletAddress)) {
    throw new HttpError(403, 'spectre_alias_forbidden')
  }
}

async function hasLivePublicDiscoveryLease(
  sql: Database,
  userId: string,
  walletAddress: string,
): Promise<boolean> {
  const rows = await sql<{ present: number }[]>`
    select 1 as present
    from chat_key_bundles
    where owner_user_id=${userId}
      and lower(wallet_address)=lower(${walletAddress})
      and discoverable_by_address=true
      and public_expires_at > now()
    limit 1
  `
  return rows.length > 0
}

async function loadLiveOwnerLease(
  sql: Database,
  userId: string,
  walletAddress: string,
): Promise<
  {
    identity_id: string
    discovery_mode: string
    public_expires_at: Date
  } | null
> {
  const rows = await sql<{
    identity_id: string
    discovery_mode: string
    public_expires_at: Date
  }[]>`
    select identity_id, discovery_mode, public_expires_at
    from chat_key_bundles
    where owner_user_id=${userId}
      and lower(wallet_address)=lower(${walletAddress})
      and discoverable_by_address=true
      and public_expires_at > now()
    limit 1
  `
  return rows[0] ?? null
}

async function rateLimitVdfChallenge(principal: Principal): Promise<void> {
  const window = new Date(Math.floor(Date.now() / 60_000) * 60_000)
  const key = await sha256Hex(`chat-vdf-challenge:${principal.userId}`)
  const rows = await db()<{ request_count: number }[]>`
    select spectra_private.increment_api_rate_limit(
      ${key}, ${window}, ${new Date(window.getTime() + 60_000)}
    ) as request_count
  `
  if ((rows[0]?.request_count ?? VDF_CHALLENGES_PER_MINUTE + 1) > VDF_CHALLENGES_PER_MINUTE) {
    throw new HttpError(429, 'rate_limited')
  }
}

async function rateLimitPrivateIdentityBinding(principal: Principal): Promise<void> {
  const window = new Date(Math.floor(Date.now() / 60_000) * 60_000)
  const key = await sha256Hex(`chat-private-identity-binding:${principal.userId}`)
  const rows = await db()<{ request_count: number }[]>`
    select spectra_private.increment_api_rate_limit(
      ${key}, ${window}, ${new Date(window.getTime() + 60_000)}
    ) as request_count
  `
  if (
    (rows[0]?.request_count ?? PRIVATE_IDENTITY_BINDINGS_PER_MINUTE + 1) >
      PRIVATE_IDENTITY_BINDINGS_PER_MINUTE
  ) {
    throw new HttpError(429, 'rate_limited')
  }
}

export async function issueVdfChallenge(
  principal: Principal,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const params = requireDiscoveryVdf()
  const action = body.action
  const bindingHash = body.bindingHash
  if (
    typeof action !== 'string' ||
    !DISCOVERY_VDF_ACTIONS.has(action as VdfAction) ||
    typeof bindingHash !== 'string' ||
    !/^[0-9a-f]{64}$/.test(bindingHash)
  ) {
    throw new HttpError(400, 'invalid_request')
  }
  const vdfAction = action as VdfAction
  if (vdfAction === 'public_discovery') {
    if (await hasLivePublicDiscoveryLease(db(), principal.userId, principal.walletAddress)) {
      throw new HttpError(409, 'public_discovery_active')
    }
  }
  if (vdfAction === 'extend_public_discovery') {
    const live = await loadLiveOwnerLease(db(), principal.userId, principal.walletAddress)
    if (
      live?.discovery_mode === 'active' && isActiveLeaseAtCap(live.public_expires_at, Date.now())
    ) {
      throw new HttpError(409, 'public_discovery_at_cap')
    }
  }
  await rateLimitVdfChallenge(principal)
  const challengeId = `vdfc1.${bytesToHex(crypto.getRandomValues(new Uint8Array(32)))}`
  const nonceHex = bytesToHex(crypto.getRandomValues(new Uint8Array(32)))
  const createdAt = new Date()
  const expiresAt = new Date(createdAt.getTime() + VDF_CHALLENGE_TTL_MS)
  const notBeforeAt = new Date(createdAt.getTime() + VDF_MIN_CHALLENGE_AGE_MS)
  await db()`
    insert into chat_vdf_challenges (
      challenge_id, owner_user_id, wallet_address, action, binding_hash,
      nonce_hex, parameter_id, created_at, expires_at
    ) values (
      ${challengeId}, ${principal.userId}, ${principal.walletAddress}, ${action},
      ${bindingHash}, ${nonceHex}, ${params.parameterId}, ${createdAt}, ${expiresAt}
    )
  `
  return {
    challengeId,
    nonceHex,
    expiresAt: expiresAt.getTime(),
    notBeforeAt: notBeforeAt.getTime(),
    params,
  }
}

async function verifyAndConsumeVdfChallenge(
  sql: Database,
  principal: Principal,
  action: VdfAction,
  bindingHash: string,
  challengeId: unknown,
  proofValue: unknown,
): Promise<void> {
  if (typeof challengeId !== 'string' || !/^vdfc1\.[0-9a-f]{32,128}$/.test(challengeId)) {
    throw new HttpError(400, 'invalid_request')
  }
  const proof = parseVdfProof(proofValue)
  const params = requireDiscoveryVdf()
  const rows = await sql<{
    challenge_id: string
    action: VdfAction
    binding_hash: string
    nonce_hex: string
    parameter_id: string
    created_at: Date
    expires_at: Date
  }[]>`
    select challenge_id, action, binding_hash, nonce_hex, parameter_id, created_at, expires_at
    from chat_vdf_challenges
    where challenge_id=${challengeId}
      and owner_user_id=${principal.userId}
      and wallet_address=${principal.walletAddress}
      and consumed_at is null
    for update
  `
  const challenge = rows[0]
  if (
    !challenge ||
    challenge.expires_at.getTime() <= Date.now() ||
    challenge.action !== action ||
    challenge.binding_hash !== bindingHash ||
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
      action,
      bindingHash,
    }, proof)
  ) {
    throw new HttpError(400, 'invalid_vdf_proof')
  }
  const consumed = await sql`
    update chat_vdf_challenges
    set consumed_at=now()
    where challenge_id=${challengeId}
      and consumed_at is null
    returning challenge_id
  `
  if (consumed.length !== 1) throw new HttpError(409, 'vdf_challenge_expired')
}

function signedPreKeyObject(value: Record<string, unknown>): Record<string, unknown> {
  return {
    ...(value.expiresAt === undefined || value.expiresAt === null
      ? {}
      : { expiresAt: value.expiresAt }),
    id: value.id,
    mlkemPublicKey: value.mlkemPublicKey,
    signature: value.signature,
    timestamp: value.timestamp,
    x25519PublicKey: value.x25519PublicKey,
  }
}

function verifyMldsa(publicKey: unknown, signature: unknown, message: Uint8Array): boolean {
  if (
    typeof publicKey !== 'string' || !/^0x[0-9a-fA-F]{3904}$/.test(publicKey) ||
    typeof signature !== 'string' || !/^0x[0-9a-fA-F]{6618}$/.test(signature)
  ) return false
  try {
    return ml_dsa65.verify(hexToBytes(signature), message, hexToBytes(publicKey))
  } catch {
    return false
  }
}

function validateBundleMetadataCapabilities(bundle: Record<string, unknown>): void {
  const capabilities = bundle.metadataCapabilities
  const signature = bundle.capabilitiesSignature
  if (capabilities === undefined && signature === undefined) return
  if (
    !isRecord(capabilities) ||
    typeof signature !== 'string' ||
    !/^0x[0-9a-fA-F]{6618}$/.test(signature)
  ) throw new HttpError(400, 'invalid_request')
  const allowedKeys = new Set([
    'version',
    'mailboxTokens',
    'sealedControl',
    'publishedAt',
  ])
  if (
    Object.keys(capabilities).some((key) => !allowedKeys.has(key)) ||
    capabilities.version !== 1 ||
    !Array.isArray(capabilities.mailboxTokens) ||
    capabilities.mailboxTokens.length < 1 ||
    capabilities.mailboxTokens.length > 2 ||
    new Set(capabilities.mailboxTokens).size !== capabilities.mailboxTokens.length ||
    capabilities.mailboxTokens.some((value) => value !== 'legacy_v1' && value !== 'scoped_v2') ||
    !capabilities.mailboxTokens.includes('legacy_v1') ||
    !Array.isArray(capabilities.sealedControl) ||
    capabilities.sealedControl.length > 1 ||
    capabilities.sealedControl.some((value) => value !== 'mailbox_scope_v1') ||
    !Number.isSafeInteger(capabilities.publishedAt) ||
    (capabilities.publishedAt as number) <= 0
  ) throw new HttpError(400, 'invalid_request')
  const message = encoder.encode(canonical({
    purpose: 'Spectra_Bundle_Metadata_Capabilities_v1',
    identityId: bundle.identityId,
    identityKey: bundle.identityKey,
    mlkemIdentityKey: bundle.mlkemIdentityKey,
    dilithiumKey: bundle.dilithiumKey,
    capabilities,
  }))
  if (!verifyMldsa(bundle.dilithiumKey, signature, message)) {
    throw new HttpError(400, 'invalid_request')
  }
}

async function validateBundle(
  identityId: unknown,
  walletAddress: unknown,
  mailboxToken: unknown,
  bundleValue: unknown,
): Promise<{ bundle: Record<string, unknown>; opks: Record<string, unknown>[]; wallet: string }> {
  if (
    !validSafeId(identityId) || typeof walletAddress !== 'string' ||
    !/^EXO00[0-9a-f]{38}$/.test(walletAddress) ||
    typeof mailboxToken !== 'string' || !mailboxToken.startsWith('smbx1.') ||
    !mailboxPattern.test(mailboxToken) || !isRecord(bundleValue)
  ) throw new HttpError(400, 'invalid_request')
  const bundle = bundleValue
  if (
    bundle.identityId !== identityId || !isValidBundleRevision(bundle.version) ||
    !Number.isSafeInteger(bundle.timestamp) || (bundle.timestamp as number) <= 0 ||
    !base64Bytes(bundle.identityKey, 32, true) ||
    !base64Bytes(bundle.mlkemIdentityKey, 1184, false) ||
    typeof bundle.dilithiumKey !== 'string' || !/^0x[0-9a-fA-F]{3904}$/.test(bundle.dilithiumKey) ||
    typeof bundle.bundleSignature !== 'string' ||
    !/^0x[0-9a-fA-F]{6618}$/.test(bundle.bundleSignature) ||
    !isRecord(bundle.signedPreKey) || !isRecord(bundle.walletAuthorization)
  ) throw new HttpError(400, 'invalid_request')
  const signedPreKey = bundle.signedPreKey
  if (
    !Number.isSafeInteger(signedPreKey.id) || (signedPreKey.id as number) < 0 ||
    !Number.isSafeInteger(signedPreKey.timestamp) || (signedPreKey.timestamp as number) <= 0 ||
    (signedPreKey.expiresAt !== undefined && signedPreKey.expiresAt !== null &&
      !Number.isSafeInteger(signedPreKey.expiresAt)) ||
    !base64Bytes(signedPreKey.x25519PublicKey, 32, true) ||
    !base64Bytes(signedPreKey.mlkemPublicKey, 1184, false)
  ) throw new HttpError(400, 'invalid_request')
  const timestamp = new Uint8Array(8)
  new DataView(timestamp.buffer).setBigUint64(0, BigInt(signedPreKey.timestamp as number), true)
  const prekeyMessage = Uint8Array.from([
    ...base64Bytes(signedPreKey.x25519PublicKey, 32, true)!,
    ...base64Bytes(signedPreKey.mlkemPublicKey, 1184, false)!,
    ...timestamp,
  ])
  if (!verifyMldsa(bundle.dilithiumKey, signedPreKey.signature, prekeyMessage)) {
    throw new HttpError(400, 'invalid_request')
  }
  const bundleMessage = encoder.encode(canonical({
    dilithiumKey: bundle.dilithiumKey,
    identityId: bundle.identityId,
    identityKey: bundle.identityKey,
    mlkemIdentityKey: bundle.mlkemIdentityKey,
    signedPreKey: signedPreKeyObject(signedPreKey),
    timestamp: bundle.timestamp,
    version: bundle.version,
  }))
  if (!verifyMldsa(bundle.dilithiumKey, bundle.bundleSignature, bundleMessage)) {
    throw new HttpError(400, 'invalid_request')
  }
  validateBundleMetadataCapabilities(bundle)
  const authorization = bundle.walletAuthorization
  if (!isRecord(authorization.payload)) throw new HttpError(400, 'invalid_request')
  const payload = authorization.payload
  if (
    payload.purpose !== 'Spectra chat identity authorization' || payload.version !== 1 ||
    payload.walletAddress !== walletAddress || payload.identityId !== bundle.identityId ||
    payload.identityKey !== bundle.identityKey ||
    payload.mlkemIdentityKey !== bundle.mlkemIdentityKey ||
    payload.dilithiumKey !== bundle.dilithiumKey ||
    canonical(payload.signedPreKey) !== canonical(signedPreKeyObject(signedPreKey)) ||
    payload.bundleSignature !== bundle.bundleSignature ||
    payload.bundleVersion !== bundle.version ||
    payload.bundleTimestamp !== bundle.timestamp || !Number.isSafeInteger(payload.signedAt) ||
    (payload.signedAt as number) <= 0 || typeof payload.walletPublicKey !== 'string' ||
    !/^0x[0-9a-fA-F]{3904}$/.test(payload.walletPublicKey)
  ) throw new HttpError(400, 'invalid_request')
  const walletKey = hexToBytes(payload.walletPublicKey)
  const walletDigest = keccak_256(walletKey)
  const derived = `EXO${bytesToHex(Uint8Array.from([0, ...walletDigest.slice(-19)]))}`
  if (derived !== walletAddress) throw new HttpError(400, 'invalid_request')
  const authorizationMessage = encoder.encode(canonical({
    bundleSignature: payload.bundleSignature,
    bundleTimestamp: payload.bundleTimestamp,
    bundleVersion: payload.bundleVersion,
    dilithiumKey: payload.dilithiumKey,
    identityId: payload.identityId,
    identityKey: payload.identityKey,
    mlkemIdentityKey: payload.mlkemIdentityKey,
    purpose: payload.purpose,
    signedAt: payload.signedAt,
    signedPreKey: signedPreKeyObject(signedPreKey),
    version: payload.version,
    walletAddress: payload.walletAddress,
    walletPublicKey: payload.walletPublicKey,
  }))
  if (!verifyMldsa(payload.walletPublicKey, authorization.signature, authorizationMessage)) {
    throw new HttpError(400, 'invalid_request')
  }
  const mailboxMaterial = encoder.encode(canonical({
    dilithiumPublicKey: bundle.dilithiumKey,
    identityPublicKey: bundle.identityKey,
    mlkemPublicKey: bundle.mlkemIdentityKey,
    purpose: 'Spectra_RelayMailboxToken_v1',
    version: 1,
  }))
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', mailboxMaterial))
  let binary = ''
  for (const byte of digest) binary += String.fromCharCode(byte)
  if (`smbx1.${btoa(binary)}` !== mailboxToken) throw new HttpError(400, 'invalid_request')
  if (!Array.isArray(bundle.oneTimePreKeys) || bundle.oneTimePreKeys.length > 150) {
    throw new HttpError(400, 'invalid_request')
  }
  const seen = new Set<number>()
  const opks = bundle.oneTimePreKeys.map((opk) => {
    if (
      !isRecord(opk) || !Number.isSafeInteger(opk.id) || (opk.id as number) < 0 ||
      seen.has(opk.id as number) || !base64Bytes(opk.x25519PublicKey, 32, true) ||
      !base64Bytes(opk.mlkemPublicKey, 1184, false)
    ) throw new HttpError(400, 'invalid_request')
    seen.add(opk.id as number)
    return {
      id: opk.id,
      mlkemPublicKey: opk.mlkemPublicKey,
      x25519PublicKey: opk.x25519PublicKey,
    }
  })
  return { bundle, opks, wallet: walletAddress }
}

async function privateIdentityKeyDigest(
  identityId: string,
  walletAddress: string,
  bundle: Record<string, unknown>,
): Promise<string> {
  return await sha256Hex(canonical({
    dilithiumKey: bundle.dilithiumKey,
    identityId,
    identityKey: bundle.identityKey,
    mlkemIdentityKey: bundle.mlkemIdentityKey,
    purpose: 'Spectra_PrivateChatIdentityBinding_v1',
    walletAddress,
  }))
}

async function bindValidatedPrivateIdentity(
  sql: Database,
  principal: Principal,
  validated: Awaited<ReturnType<typeof validateBundle>>,
  recipientMailboxToken: string,
): Promise<void> {
  const identityId = validated.bundle.identityId as string
  const keyDigest = await privateIdentityKeyDigest(
    identityId,
    validated.wallet,
    validated.bundle,
  )
  await sql`
    select spectra_private.bind_chat_identity(
      ${principal.userId},
      ${principal.walletAddress},
      ${identityId},
      ${recipientMailboxToken},
      ${keyDigest}
    )
  `
}

export async function bindPrivateIdentity(
  principal: Principal,
  body: Record<string, unknown>,
): Promise<{ identityId: string }> {
  await rateLimitPrivateIdentityBinding(principal)
  const validated = await validateBundle(
    body.identityId,
    body.walletAddress,
    body.recipientMailboxToken,
    body.bundle,
  )
  const recipientMailboxToken = body.recipientMailboxToken as string
  const userHash = `wallet:${await sha256Hex(validated.wallet)}`
  if (userHash !== principal.userId || principal.walletAddress !== validated.wallet) {
    throw new HttpError(403, 'unauthorized_wallet')
  }

  try {
    await db().begin(async (sql) => {
      await bindValidatedPrivateIdentity(sql, principal, validated, recipientMailboxToken)
    })
  } catch (error) {
    const code = databaseErrorCode(error)
    if (code === '23505') throw new HttpError(409, 'identity_already_bound')
    if (code === '22023') throw new HttpError(409, 'identity_key_mismatch')
    if (code === '42501') throw new HttpError(403, 'unauthorized_wallet')
    throw error
  }
  return { identityId: validated.bundle.identityId as string }
}

export async function publishBundle(
  principal: Principal,
  body: Record<string, unknown>,
): Promise<{ expiresAt: number }> {
  const validated = await validateBundle(
    body.identityId,
    body.walletAddress,
    body.recipientMailboxToken,
    body.bundle,
  )
  const recipientMailboxToken = body.recipientMailboxToken as string
  const userHash = `wallet:${await sha256Hex(validated.wallet)}`
  if (userHash !== principal.userId || principal.walletAddress !== validated.wallet) {
    throw new HttpError(403, 'unauthorized_wallet')
  }
  const bindingHash = publicDiscoveryBinding(
    body.identityId as string,
    validated.wallet,
    recipientMailboxToken,
    validated.bundle,
  )
  const expiresAt = new Date(Date.now() + PUBLIC_DISCOVERY_LEASE_MS)
  const aliasWrite = parseDiscoveryAliasWrite(body)
  try {
    await db().begin(async (sql) => {
      await lockContactCardOwner(sql, principal.userId, validated.wallet)
      await assertDiscoveryAliasAllowed(sql, validated.wallet, aliasWrite)
      if (await hasLivePublicDiscoveryLease(sql, principal.userId, validated.wallet)) {
        throw new HttpError(409, 'public_discovery_active')
      }
      await verifyAndConsumeVdfChallenge(
        sql,
        principal,
        'public_discovery',
        bindingHash,
        body.vdfChallengeId,
        body.vdfProof,
      )
      await bindValidatedPrivateIdentity(sql, principal, validated, recipientMailboxToken)
      await sql`
        delete from chat_key_bundles
        where lower(wallet_address)=lower(${validated.wallet})
          and identity_id<>${body.identityId as string}
          and owner_user_id=${principal.userId}
      `
      const aliasProvided = aliasWrite?.aliasProvided === true
      const autocompleteProvided = aliasWrite?.autocompleteProvided === true
      const stored = await sql`
        insert into chat_key_bundles
          (identity_id, wallet_address, recipient_mailbox_token, bundle,
           owner_user_id, discoverable_by_address, discovery_mode, public_expires_at,
           discovery_alias, discovery_alias_key, alias_autocomplete, created_at, updated_at)
        values (
          ${body.identityId as string}, ${validated.wallet}, ${recipientMailboxToken},
          ${sql.json(validated.bundle)},
          ${principal.userId}, true, 'ephemeral', ${expiresAt},
          ${aliasWrite?.alias ?? null}, ${aliasWrite?.aliasKey ?? null},
          ${aliasWrite?.autocomplete ?? true}, now(), now()
        )
        on conflict (identity_id) do update set
          wallet_address=excluded.wallet_address,
          recipient_mailbox_token=excluded.recipient_mailbox_token, bundle=excluded.bundle,
          owner_user_id=excluded.owner_user_id,
          discoverable_by_address=true,
          discovery_mode='ephemeral',
          public_expires_at=excluded.public_expires_at,
          discovery_alias=case when ${aliasProvided} then excluded.discovery_alias else chat_key_bundles.discovery_alias end,
          discovery_alias_key=case when ${aliasProvided} then excluded.discovery_alias_key else chat_key_bundles.discovery_alias_key end,
          alias_autocomplete=case when ${autocompleteProvided} then excluded.alias_autocomplete else chat_key_bundles.alias_autocomplete end,
          created_at=now(),
          updated_at=now()
        where chat_key_bundles.owner_user_id=excluded.owner_user_id
        returning identity_id
      `
      if (stored.length !== 1) throw new HttpError(403, 'unauthorized_wallet')
      await sql`
        delete from chat_one_time_prekeys
        where identity_id=${body.identityId as string}
          and consumed_at is null
      `
      await insertUnconsumedOpks(sql, body.identityId as string, validated.opks)
    })
  } catch (error) {
    if (error instanceof HttpError) throw error
    const code = databaseErrorCode(error)
    if (code === '22023') throw new HttpError(409, 'identity_key_mismatch')
    if (code === '42501' || code === '23503' || code === '23505') {
      throw new HttpError(403, 'unauthorized_wallet')
    }
    throw error
  }
  return { expiresAt: expiresAt.getTime() }
}

export async function extendActiveDiscoveryLease(
  principal: Principal,
  body: Record<string, unknown>,
): Promise<{ expiresAt: number; discoveryMode: 'active' }> {
  const validated = await validateBundle(
    body.identityId,
    body.walletAddress,
    body.recipientMailboxToken,
    body.bundle,
  )
  const recipientMailboxToken = body.recipientMailboxToken as string
  const userHash = `wallet:${await sha256Hex(validated.wallet)}`
  if (userHash !== principal.userId || principal.walletAddress !== validated.wallet) {
    throw new HttpError(403, 'unauthorized_wallet')
  }
  const bindingHash = extendPublicDiscoveryBinding(
    body.identityId as string,
    validated.wallet,
    recipientMailboxToken,
    validated.bundle,
  )
  let expiresAt = new Date()
  const aliasWrite = parseDiscoveryAliasWrite(body)
  try {
    await db().begin(async (sql) => {
      await lockContactCardOwner(sql, principal.userId, validated.wallet)
      await assertDiscoveryAliasAllowed(sql, validated.wallet, aliasWrite)
      const live = await loadLiveOwnerLease(sql, principal.userId, validated.wallet)
      if (
        live?.discovery_mode === 'active' && isActiveLeaseAtCap(live.public_expires_at, Date.now())
      ) {
        throw new HttpError(409, 'public_discovery_at_cap')
      }
      await verifyAndConsumeVdfChallenge(
        sql,
        principal,
        'extend_public_discovery',
        bindingHash,
        body.vdfChallengeId,
        body.vdfProof,
      )
      const nowMs = Date.now()
      expiresAt = nextActiveExpiry(
        live?.discovery_mode === 'active' ? live.public_expires_at : null,
        nowMs,
      )
      await bindValidatedPrivateIdentity(sql, principal, validated, recipientMailboxToken)
      await sql`
        delete from chat_key_bundles
        where lower(wallet_address)=lower(${validated.wallet})
          and identity_id<>${body.identityId as string}
          and owner_user_id=${principal.userId}
      `
      const aliasProvided = aliasWrite?.aliasProvided === true
      const autocompleteProvided = aliasWrite?.autocompleteProvided === true
      const stored = await sql`
        insert into chat_key_bundles
          (identity_id, wallet_address, recipient_mailbox_token, bundle,
           owner_user_id, discoverable_by_address, discovery_mode, public_expires_at,
           discovery_alias, discovery_alias_key, alias_autocomplete, created_at, updated_at)
        values (
          ${body.identityId as string}, ${validated.wallet}, ${recipientMailboxToken},
          ${sql.json(validated.bundle)},
          ${principal.userId}, true, 'active', ${expiresAt},
          ${aliasWrite?.alias ?? null}, ${aliasWrite?.aliasKey ?? null},
          ${aliasWrite?.autocomplete ?? true}, now(), now()
        )
        on conflict (identity_id) do update set
          wallet_address=excluded.wallet_address,
          recipient_mailbox_token=excluded.recipient_mailbox_token, bundle=excluded.bundle,
          owner_user_id=excluded.owner_user_id,
          discoverable_by_address=true,
          discovery_mode='active',
          public_expires_at=excluded.public_expires_at,
          discovery_alias=case when ${aliasProvided} then excluded.discovery_alias else chat_key_bundles.discovery_alias end,
          discovery_alias_key=case when ${aliasProvided} then excluded.discovery_alias_key else chat_key_bundles.discovery_alias_key end,
          alias_autocomplete=case when ${autocompleteProvided} then excluded.alias_autocomplete else chat_key_bundles.alias_autocomplete end,
          updated_at=now()
        where chat_key_bundles.owner_user_id=excluded.owner_user_id
        returning identity_id
      `
      if (stored.length !== 1) throw new HttpError(403, 'unauthorized_wallet')
      await sql`
        delete from chat_one_time_prekeys
        where identity_id=${body.identityId as string}
          and consumed_at is null
      `
      await insertUnconsumedOpks(sql, body.identityId as string, validated.opks)
    })
  } catch (error) {
    if (error instanceof HttpError) throw error
    const code = databaseErrorCode(error)
    if (code === '22023') throw new HttpError(409, 'identity_key_mismatch')
    if (code === '42501' || code === '23503' || code === '23505') {
      throw new HttpError(403, 'unauthorized_wallet')
    }
    throw error
  }
  return { expiresAt: expiresAt.getTime(), discoveryMode: 'active' }
}

export async function unpublishPublicDiscovery(
  principal: Principal,
): Promise<{ unpublished: true }> {
  await db().begin(async (sql) => {
    await lockContactCardOwner(sql, principal.userId, principal.walletAddress)
    await sql`
      delete from chat_key_bundles
      where owner_user_id=${principal.userId}
        and lower(wallet_address)=lower(${principal.walletAddress})
    `
  })
  return { unpublished: true }
}

export async function ownDiscoveryLease(
  principal: Principal,
): Promise<{ exists: false } | { exists: true; discoveryMode: string; expiresAt: number }> {
  const live = await loadLiveOwnerLease(db(), principal.userId, principal.walletAddress)
  if (!live) return { exists: false }
  return {
    exists: true,
    discoveryMode: live.discovery_mode,
    expiresAt: live.public_expires_at.getTime(),
  }
}

export async function patchOwnDiscoveryAlias(
  principal: Principal,
  body: Record<string, unknown>,
): Promise<{ updated: true }> {
  if (!principal.identityId) throw new HttpError(403, 'identity_binding_required')
  const aliasWrite = parseDiscoveryAliasWrite(body)
  if (!aliasWrite) throw new HttpError(400, 'invalid_request')
  await rateLimitDiscoveryAliasWrite(principal)
  await db().begin(async (sql) => {
    await lockContactCardOwner(sql, principal.userId, principal.walletAddress)
    const live = await loadLiveOwnerLease(sql, principal.userId, principal.walletAddress)
    if (
      !live ||
      live.discovery_mode !== 'active' ||
      live.identity_id !== principal.identityId
    ) {
      throw new HttpError(404, 'not_found')
    }
    await assertDiscoveryAliasAllowed(sql, principal.walletAddress, aliasWrite)
    const aliasProvided = aliasWrite.aliasProvided
    const autocompleteProvided = aliasWrite.autocompleteProvided
    const stored = await sql`
      update chat_key_bundles
      set
        discovery_alias=case when ${aliasProvided} then ${aliasWrite.alias} else chat_key_bundles.discovery_alias end,
        discovery_alias_key=case when ${aliasProvided} then ${aliasWrite.aliasKey} else chat_key_bundles.discovery_alias_key end,
        alias_autocomplete=case when ${autocompleteProvided} then ${aliasWrite.autocomplete} else chat_key_bundles.alias_autocomplete end,
        updated_at=now()
      where owner_user_id=${principal.userId}
        and identity_id=${principal.identityId}
        and lower(wallet_address)=lower(${principal.walletAddress})
        and discovery_mode='active'
        and discoverable_by_address=true
        and public_expires_at > now()
      returning identity_id
    `
    if (stored.length !== 1) throw new HttpError(404, 'not_found')
  })
  return { updated: true }
}

async function rateLimitTargetSessionOpk(targetIdentityId: string): Promise<void> {
  const window = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000)
  const key = await sha256Hex(`chat-session-opk-target:${targetIdentityId}`)
  const rows = await db()<{ request_count: number }[]>`
    select spectra_private.increment_api_rate_limit(
      ${key}, ${window}, ${new Date(window.getTime() + 3_600_000)}
    ) as request_count
  `
  if (
    (rows[0]?.request_count ?? TARGET_SESSION_OPK_CLAIMS_PER_HOUR + 1) >
      TARGET_SESSION_OPK_CLAIMS_PER_HOUR
  ) {
    throw new HttpError(429, 'rate_limited')
  }
}

export async function claimSessionOpk(
  principal: Principal,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!principal.identityId) throw new HttpError(403, 'identity_binding_required')
  const targetIdentityId = body.targetIdentityId
  const requestorId = body.requestorId
  if (
    !validSafeId(targetIdentityId) || !validSafeId(requestorId) ||
    requestorId !== principal.identityId
  ) {
    throw new HttpError(400, 'invalid_request')
  }
  if (targetIdentityId === requestorId) {
    throw new HttpError(400, 'invalid_request')
  }
  const bundles = await db()<{
    identity_id: string
    bundle: Record<string, unknown>
  }[]>`
    select identity_id, bundle
    from chat_key_bundles
    where identity_id=${targetIdentityId}
      and public_expires_at > now()
  `
  if (!bundles[0]) throw new HttpError(404, 'not_found')
  const publicBundle = { ...bundles[0].bundle, oneTimePreKeys: [] }
  const alreadyClaimed = await db()`
    select 1
    from chat_one_time_prekeys
    where identity_id=${targetIdentityId}
      and requestor_user_id=${principal.userId}
      and consumed_at is not null
    limit 1
  `
  if (alreadyClaimed[0]) return { bundle: publicBundle }
  await rateLimitTargetSessionOpk(targetIdentityId)
  const bindingHash = sessionOpkBinding(requestorId, targetIdentityId)
  try {
    return await db().begin(async (sql) => {
      await verifyAndConsumeVdfChallenge(
        sql,
        principal,
        'claim_session_opk',
        bindingHash,
        body.vdfChallengeId,
        body.vdfProof,
      )
      return await allocateOpkForRequestor(
        sql,
        principal,
        targetIdentityId,
        requestorId,
        publicBundle,
      )
    })
  } catch (error) {
    if (error instanceof HttpError) throw error
    if (databaseErrorCode(error) === '42501') throw new HttpError(403, 'forbidden')
    throw error
  }
}

function validateContactCardCapability(
  cardId: unknown,
  cardCapability: unknown,
): { cardId: string; cardCapability: string } {
  if (
    typeof cardId !== 'string' ||
    typeof cardCapability !== 'string' ||
    !contactCardIdPattern.test(cardId) ||
    !contactCardCapabilityPattern.test(cardCapability)
  ) {
    throw new HttpError(400, 'invalid_request')
  }
  return { cardId, cardCapability }
}

export async function contactCardOwnerStatus(
  principal: Principal,
  cardIdValue: string,
): Promise<{ active: boolean }> {
  if (!contactCardIdPattern.test(cardIdValue)) {
    throw new HttpError(400, 'invalid_request')
  }
  const rows = await db()<{ present: number }[]>`
    select 1 as present
    from chat_one_time_contact_cards
    where card_id=${cardIdValue}
      and owner_user_id=${principal.userId}
      and wallet_address=${principal.walletAddress}
      and redeemed_at is null
      and expires_at > now()
    limit 1
  `
  return { active: rows.length === 1 }
}

function decodedBase64Length(value: string): number | null {
  if (!base64Pattern.test(value)) return null
  try {
    const decoded = atob(value)
    return btoa(decoded) === value ? decoded.length : null
  } catch {
    return null
  }
}

function validateContactCardProfileCapsule(value: unknown): Record<string, unknown> {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 4 ||
    Object.keys(value).some((key) => !['version', 'ciphertext', 'nonce', 'tag'].includes(key)) ||
    value.version !== 1 ||
    typeof value.ciphertext !== 'string' ||
    typeof value.nonce !== 'string' ||
    typeof value.tag !== 'string' ||
    value.ciphertext.length > Math.ceil(maxContactProfileCapsuleCiphertextBytes * 4 / 3) + 4
  ) {
    throw new HttpError(400, 'invalid_request')
  }
  const ciphertextLength = decodedBase64Length(value.ciphertext)
  const nonceLength = decodedBase64Length(value.nonce)
  const tagLength = decodedBase64Length(value.tag)
  if (
    ciphertextLength === null ||
    ciphertextLength > maxContactProfileCapsuleCiphertextBytes ||
    nonceLength !== 12 ||
    tagLength !== 16
  ) {
    throw new HttpError(400, 'invalid_request')
  }
  return value
}

function selectCardOpk(
  value: unknown,
  opks: Record<string, unknown>[],
): Record<string, unknown> {
  if (!isRecord(value) || !Number.isSafeInteger(value.id)) {
    throw new HttpError(400, 'invalid_request')
  }
  const opk = opks.find((candidate) => candidate.id === value.id)
  if (
    !opk ||
    opk.x25519PublicKey !== value.x25519PublicKey ||
    opk.mlkemPublicKey !== value.mlkemPublicKey
  ) {
    throw new HttpError(400, 'invalid_request')
  }
  return opk
}

async function hashContactCardCapability(cardId: string, capability: string): Promise<string> {
  return await sha256Hex(`spectra.contact-card.capability.v1\0${cardId}\0${capability}`)
}

function contactCardOwnerLockKey(userId: string, wallet: string): string {
  return `spectra.contact-card.owner.v1:${userId}:${wallet}`
}

async function lockContactCardOwner(
  sql: Database,
  userId: string,
  wallet: string,
): Promise<void> {
  await sql`
    select pg_advisory_xact_lock(
      hashtextextended(${contactCardOwnerLockKey(userId, wallet)}, 0)
    )
  `
}

async function insertUnconsumedOpks(
  sql: Database,
  identityId: string,
  opks: Record<string, unknown>[],
): Promise<void> {
  const reserved = await sql<{ opk_id: string | number }[]>`
    select allocated_opk->>'id' as opk_id
    from chat_one_time_contact_cards
    where identity_id=${identityId}
      and redeemed_at is null
      and expires_at > now()
  `
  const reservedIds = new Set(
    reserved
      .map((row) => Number(row.opk_id))
      .filter((id) => Number.isSafeInteger(id)),
  )
  for (const opk of opks) {
    if (reservedIds.has(opk.id as number)) continue
    await sql`
      insert into chat_one_time_prekeys (identity_id, opk_id, opk, created_at)
      values (${identityId}, ${opk.id as number}, ${sql.json(opk)}, now())
      on conflict (identity_id, opk_id) do nothing
    `
  }
}

export async function createContactCard(
  principal: Principal,
  body: Record<string, unknown>,
): Promise<{ expiresAt: number }> {
  const validated = await validateBundle(
    body.identityId,
    body.walletAddress,
    body.recipientMailboxToken,
    body.bundle,
  )
  const recipientMailboxToken = body.recipientMailboxToken as string
  const { cardId, cardCapability } = validateContactCardCapability(
    body.cardId,
    body.cardCapability,
  )
  const cardOpk = selectCardOpk(body.cardOpk, validated.opks)
  const profileCapsule = validateContactCardProfileCapsule(body.profileCapsule)
  const userHash = `wallet:${await sha256Hex(validated.wallet)}`
  if (userHash !== principal.userId || principal.walletAddress !== validated.wallet) {
    throw new HttpError(403, 'unauthorized_wallet')
  }
  const bindingHash = hashVdfBinding({
    action: 'contact_card',
    bundle: validated.bundle,
    cardCapability,
    cardId,
    cardOpk,
    identityId: body.identityId as string,
    profileCapsule,
    recipientMailboxToken,
    walletAddress: validated.wallet,
  })
  const capabilityHash = await hashContactCardCapability(cardId, cardCapability)
  const expiresAt = new Date(Date.now() + CONTACT_CARD_TTL_MS)
  const cardBundle = {
    ...validated.bundle,
    oneTimePreKeys: [],
  }
  try {
    await db().begin(async (sql) => {
      await lockContactCardOwner(sql, principal.userId, validated.wallet)
      const activeCards = await sql`
        select 1
        from chat_one_time_contact_cards
        where owner_user_id=${principal.userId}
          and wallet_address=${validated.wallet}
          and redeemed_at is null
          and expires_at > now()
        limit 1
      `
      if (activeCards.length > 0) throw new HttpError(409, 'contact_card_active')
      await verifyAndConsumeVdfChallenge(
        sql,
        principal,
        'contact_card',
        bindingHash,
        body.vdfChallengeId,
        body.vdfProof,
      )
      await bindValidatedPrivateIdentity(sql, principal, validated, recipientMailboxToken)
      const publicPrekey = await sql<{ consumed_at: Date | null }[]>`
        select consumed_at
        from chat_one_time_prekeys
        where identity_id=${body.identityId as string}
          and opk_id=${cardOpk.id as number}
        for update
      `
      if (publicPrekey[0]?.consumed_at) {
        throw new HttpError(409, 'contact_card_conflict')
      }
      if (publicPrekey[0]) {
        await sql`
          delete from chat_one_time_prekeys
          where identity_id=${body.identityId as string}
            and opk_id=${cardOpk.id as number}
        `
      }
      await sql`
        insert into chat_one_time_contact_cards (
          card_id, capability_hash, identity_id, recipient_mailbox_token, bundle, allocated_opk,
          profile_capsule, owner_user_id, wallet_address, created_at, expires_at
        ) values (
          ${cardId}, ${capabilityHash}, ${body.identityId as string}, ${recipientMailboxToken},
          ${sql.json(cardBundle)}, ${sql.json(cardOpk)}, ${
        sql.json(profileCapsule)
      }, ${principal.userId},
          ${validated.wallet}, now(), ${expiresAt}
        )
      `
    })
  } catch (error) {
    if (error instanceof HttpError) throw error
    const code = databaseErrorCode(error)
    if (code === '22023') throw new HttpError(409, 'identity_key_mismatch')
    if (code === '23505') throw new HttpError(409, 'contact_card_conflict')
    if (code === '42501' || code === '23503') {
      throw new HttpError(403, 'unauthorized_wallet')
    }
    throw error
  }
  return { expiresAt: expiresAt.getTime() }
}

export async function redeemContactCard(
  cardIdValue: string,
  cardCapabilityValue: string,
): Promise<Record<string, unknown>> {
  const { cardId, cardCapability } = validateContactCardCapability(cardIdValue, cardCapabilityValue)
  const capabilityHash = await hashContactCardCapability(cardId, cardCapability)
  const result = await db().begin(async (sql) => {
    const rows = await sql<{
      bundle: Record<string, unknown>
      allocated_opk: Record<string, unknown>
      profile_capsule: Record<string, unknown> | null
    }[]>`
      select bundle, allocated_opk, profile_capsule
      from chat_one_time_contact_cards
      where card_id=${cardId}
        and capability_hash=${capabilityHash}
        and redeemed_at is null
        and expires_at > now()
      for update
    `
    const card = rows[0]
    if (!card) throw new HttpError(404, 'not_found')
    const redeemed = await sql`
      update chat_one_time_contact_cards
      set redeemed_at=now()
      where card_id=${cardId}
        and redeemed_at is null
        and expires_at > now()
      returning card_id
    `
    if (redeemed.length !== 1) throw new HttpError(404, 'not_found')
    await sql`delete from chat_one_time_contact_cards where card_id=${cardId}`
    return card
  })
  return {
    bundle: result.bundle,
    allocatedOPK: result.allocated_opk,
    allocatedOPKId: result.allocated_opk.id,
    ...(result.profile_capsule ? { profileCapsule: result.profile_capsule } : {}),
  }
}

export async function fetchBundle(
  principal: Principal,
  identityId: string,
  requestorId: string,
  inviteCapability: string,
): Promise<Record<string, unknown>> {
  if (
    !validSafeId(identityId) ||
    !validSafeId(requestorId) ||
    !mailboxPattern.test(inviteCapability)
  ) {
    throw new HttpError(404, 'not_found')
  }
  const bundles = await db()<{ bundle: Record<string, unknown> }[]>`
    select bundle
    from chat_key_bundles
    where identity_id=${identityId}
      and recipient_mailbox_token=${inviteCapability}
      and public_expires_at > now()
  `
  if (!bundles[0]) throw new HttpError(404, 'not_found')
  return fetchBundleForRequestor(principal, identityId, requestorId, bundles[0].bundle)
}

async function fetchBundleForRequestor(
  principal: Principal,
  identityId: string,
  requestorId: string,
  bundle: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const publicBundle = { ...bundle, oneTimePreKeys: [] }
  if (identityId === requestorId) return { bundle: publicBundle }
  const requestorBinding = await db()`
    select 1
    from auth_wallet_bindings
    where user_id=${principal.userId}
      and lower(wallet_address)=lower(${principal.walletAddress})
      and identity_id=${requestorId}
      and primary_mailbox_token is not null
      and identity_key_digest is not null
  `
  if (!requestorBinding[0]) throw new HttpError(403, 'forbidden')
  return { bundle: publicBundle }
}

async function allocateOpkForRequestor(
  sql: Database,
  principal: Principal,
  identityId: string,
  requestorId: string,
  publicBundle: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const requestorBinding = await sql`
    select 1
    from auth_wallet_bindings
    where user_id=${principal.userId}
      and lower(wallet_address)=lower(${principal.walletAddress})
      and identity_id=${requestorId}
      and primary_mailbox_token is not null
      and identity_key_digest is not null
  `
  if (!requestorBinding[0]) throw new HttpError(403, 'forbidden')
  const allocated = await sql<{
    opk_id: number
    opk: Record<string, unknown>
  }[]>`
    select * from spectra_private.claim_chat_one_time_prekey(
      ${principal.userId}, ${principal.walletAddress}, ${identityId}, ${requestorId}
    )
  `
  return {
    bundle: publicBundle,
    ...(allocated[0]
      ? { allocatedOPK: allocated[0].opk, allocatedOPKId: allocated[0].opk_id }
      : {}),
  }
}

export async function fetchDiscoverableBundle(
  principal: Principal,
  walletAddress: string,
  requestorId: string,
): Promise<Record<string, unknown>> {
  const normalizedWalletAddress = normalizeWalletAddress(walletAddress)
  if (!normalizedWalletAddress || !validSafeId(requestorId)) {
    throw new HttpError(404, 'not_found')
  }
  await rateLimitDiscoveryLookup(principal)
  const bundles = await db()<{
    identity_id: string
    bundle: Record<string, unknown>
  }[]>`
    select identity_id, bundle
    from chat_key_bundles
    where wallet_address=${normalizedWalletAddress}
      and discoverable_by_address=true
      and public_expires_at > now()
  `
  const bundle = bundles[0]
  if (!bundle) throw new HttpError(404, 'not_found')
  return fetchBundleForRequestor(principal, bundle.identity_id, requestorId, bundle.bundle)
}

export async function searchDiscoveryAliases(
  principal: Principal,
  query: string,
): Promise<{ matches: { alias: string; walletAddress: string }[] }> {
  if (typeof query !== 'string' || query.length > MAX_DISCOVERY_ALIAS_BYTES + 8) {
    throw new HttpError(400, 'invalid_request')
  }
  let exactKey: string | null = null
  try {
    const exact = normalizeDiscoveryAlias(query)
    exactKey = exact ? canonicalDiscoveryAliasKey(exact) : null
  } catch {
    exactKey = null
  }
  const prefixKey = parseDiscoveryAliasPrefix(query)
  if (!exactKey && !prefixKey) throw new HttpError(400, 'invalid_request')
  await rateLimitDiscoveryLookup(principal)
  const prefixPattern = prefixKey ? `${escapeIlikePattern(prefixKey)}%` : null
  const rows = await db()<{
    discovery_alias: string
    wallet_address: string
  }[]>`
    select discovery_alias, wallet_address
    from chat_key_bundles
    where discoverable_by_address=true
      and public_expires_at > now()
      and discovery_alias is not null
      and wallet_address is not null
      and not exists (
        select 1
        from mobile_spectre_addresses spectre
        where lower(spectre.wallet_address)=lower(chat_key_bundles.wallet_address)
          and spectre.expires_at > now()
      )
      and (
        (${exactKey}::text is not null and discovery_alias_key=${exactKey})
        or (
          ${prefixPattern}::text is not null
          and alias_autocomplete=true
          and discovery_alias_key like ${prefixPattern} escape '\\'
        )
      )
    order by
      (discovery_alias_key=${exactKey}) desc,
      char_length(discovery_alias_key) asc,
      wallet_address asc
    limit ${DISCOVERY_ALIAS_SEARCH_LIMIT}
  `
  return {
    matches: rows.map((row) => ({
      alias: row.discovery_alias,
      walletAddress: row.wallet_address,
    })),
  }
}

async function rateLimitDiscoveryAliasWrite(principal: Principal): Promise<void> {
  const window = new Date(Math.floor(Date.now() / 60_000) * 60_000)
  const key = await sha256Hex(`chat-discovery-alias-write:${principal.userId}`)
  const rows = await db()<{
    request_count: number
  }[]>`
    select spectra_private.increment_api_rate_limit(
      ${key}, ${window}, ${new Date(window.getTime() + 60_000)}
    ) as request_count
  `
  if (
    (rows[0]?.request_count ?? DISCOVERY_ALIAS_WRITES_PER_MINUTE + 1) >
      DISCOVERY_ALIAS_WRITES_PER_MINUTE
  ) {
    throw new HttpError(429, 'rate_limited')
  }
}

async function rateLimitDiscoveryLookup(principal: Principal): Promise<void> {
  const window = new Date(Math.floor(Date.now() / 60_000) * 60_000)
  const key = await sha256Hex(`chat-discovery:${principal.userId}`)
  const rows = await db()<{
    request_count: number
  }[]>`
    select spectra_private.increment_api_rate_limit(
      ${key}, ${window}, ${new Date(window.getTime() + 60_000)}
    ) as request_count
  `
  if ((rows[0]?.request_count ?? DISCOVERY_LOOKUPS_PER_MINUTE + 1) > DISCOVERY_LOOKUPS_PER_MINUTE) {
    throw new HttpError(429, 'rate_limited')
  }
}

export async function bundleExists(principal: Principal, identityId: string): Promise<boolean> {
  if (!validSafeId(identityId)) throw new HttpError(400, 'invalid_request')
  const rows = await db()`
    select 1 from chat_key_bundles
    where identity_id=${identityId}
      and owner_user_id=${principal.userId}
      and public_expires_at > now()
  `
  return rows.length > 0
}

export async function opkCount(principal: Principal, identityId: string): Promise<number> {
  if (!validSafeId(identityId)) throw new HttpError(400, 'invalid_request')
  const rows = await db()<[{ owner_user_id: string; count: string }?]>`
    select b.owner_user_id,
      (select count(*)::text from chat_one_time_prekeys p
       where p.identity_id=b.identity_id and p.consumed_at is null) as count
    from chat_key_bundles b
    where b.identity_id=${identityId}
      and b.public_expires_at > now()
  `
  if (!rows[0] || rows[0].owner_user_id !== principal.userId) {
    throw new HttpError(403, 'forbidden')
  }
  return Number(rows[0].count)
}

export async function replenishOpks(
  principal: Principal,
  identityId: string,
  value: unknown,
): Promise<number> {
  if (!validSafeId(identityId) || !Array.isArray(value) || value.length > 150) {
    throw new HttpError(400, 'invalid_request')
  }
  const seen = new Set<number>()
  const opks: Record<string, unknown>[] = []
  for (const opk of value) {
    if (
      !isRecord(opk) || !Number.isSafeInteger(opk.id) || (opk.id as number) < 0 ||
      seen.has(opk.id as number) || !base64Bytes(opk.x25519PublicKey, 32, true) ||
      !base64Bytes(opk.mlkemPublicKey, 1184, false)
    ) throw new HttpError(400, 'invalid_request')
    seen.add(opk.id as number)
    opks.push({
      id: opk.id,
      mlkemPublicKey: opk.mlkemPublicKey,
      x25519PublicKey: opk.x25519PublicKey,
    })
  }
  return await db().begin(async (sql) => {
    await lockContactCardOwner(sql, principal.userId, principal.walletAddress)
    const exists = await sql`
      select 1 from chat_key_bundles
      where identity_id=${identityId}
        and owner_user_id=${principal.userId}
        and public_expires_at > now()
      for update
    `
    if (!exists[0]) throw new HttpError(403, 'forbidden')
    await insertUnconsumedOpks(sql, identityId, opks)
    const counts = await sql<[{ count: string }]>`
      select count(*)::text as count from chat_one_time_prekeys
      where identity_id=${identityId} and consumed_at is null
    `
    return Number(counts[0].count)
  })
}

export async function listMailboxes(principal: Principal): Promise<string[]> {
  if (!principal.identityId) return []
  const rows = await db()<{
    mailbox_token: string
  }[]>`
    select owners.mailbox_token
    from auth_wallet_bindings bindings
    join chat_mailbox_token_owners owners
      on owners.user_id=bindings.user_id
      and lower(owners.wallet_address)=lower(bindings.wallet_address)
    where bindings.user_id=${principal.userId}
      and lower(bindings.wallet_address)=lower(${principal.walletAddress})
      and bindings.identity_id=${principal.identityId}
      and bindings.primary_mailbox_token is not null
      and bindings.identity_key_digest is not null
    order by owners.created_at
  `
  return rows.map((row) => row.mailbox_token).filter((token) => mailboxPattern.test(token))
}

export async function registerMailboxes(
  principal: Principal,
  value: unknown,
): Promise<string[]> {
  if (!principal.identityId) throw new HttpError(403, 'identity_binding_required')
  if (!Array.isArray(value) || value.length > 50) throw new HttpError(400, 'invalid_request')
  const tokens = [...new Set(value)]
  if (
    tokens.some((token) => typeof token !== 'string' || !mailboxPattern.test(token))
  ) throw new HttpError(400, 'invalid_request')
  try {
    await db()`
      select spectra_private.register_mailbox_tokens(
        ${principal.userId}, ${principal.walletAddress}, ${tokens as string[]}
      )
    `
  } catch (error) {
    const code = databaseErrorCode(error)
    if (code === '22023') throw new HttpError(400, 'invalid_request')
    if (code === '42501' || code === '23505') {
      throw new HttpError(403, 'unauthorized_mailbox')
    }
    throw error
  }
  return tokens as string[]
}

interface RelayRow {
  message_id: string
  sender_user_id: string
  recipient_mailbox_token: string
  delivery_token: string | null
  delivery_class: string
  sealed_envelope: Record<string, unknown>
  status: string
  server_sequence: string | number
  created_at: Date
  delivered_at: Date | null
  read_at: Date | null
  expires_at: Date
  push_notification_enabled: boolean
}

function messageResponse(body: RelayRow): Record<string, unknown> {
  return {
    id: body.message_id,
    recipientMailboxToken: body.recipient_mailbox_token,
    ...(body.delivery_token ? { deliveryToken: body.delivery_token } : {}),
    deliveryClass: body.delivery_class,
    sealedEnvelope: body.sealed_envelope,
    status: body.status,
    serverSequence: Number(body.server_sequence),
    createdAt: body.created_at.getTime(),
    ...(body.delivered_at ? { deliveredAt: body.delivered_at.getTime() } : {}),
    ...(body.read_at ? { readAt: body.read_at.getTime() } : {}),
    expiresAt: body.expires_at.getTime(),
    pushNotificationEnabled: body.push_notification_enabled,
  }
}

export async function sendMessage(
  principal: Principal,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (
    typeof body.recipientMailboxToken !== 'string' ||
    !mailboxPattern.test(body.recipientMailboxToken) ||
    !['message', 'control'].includes(body.deliveryClass as string) ||
    !isRecord(body.sealedEnvelope) || body.sealedEnvelope.version == null ||
    body.sealedEnvelope.type == null || body.sealedEnvelope.ciphertext == null ||
    encoder.encode(JSON.stringify(body.sealedEnvelope)).length > 2 * 1024 * 1024 ||
    (body.pushNotificationEnabled !== undefined &&
      typeof body.pushNotificationEnabled !== 'boolean')
  ) throw new HttpError(400, 'invalid_request')
  const pushNotificationEnabled = body.pushNotificationEnabled === true
  const deliveryToken = body.deliveryToken === undefined || body.deliveryToken === null
    ? null
    : String(body.deliveryToken).trim()
  if (deliveryToken && !deliveryPattern.test(deliveryToken)) {
    throw new HttpError(400, 'invalid_request')
  }
  let result: {
    message_id: string
    server_sequence: number | string
    status: string
    created_at: Date
    expires_at: Date
  }
  try {
    const rows = await db()<{
      message_id: string
      server_sequence: number | string
      status: string
      created_at: Date
      expires_at: Date
    }[]>`
      select message_id, server_sequence, status, created_at, expires_at
      from spectra_private.store_sealed_relay_message(
        ${principal.userId},
        ${body.recipientMailboxToken as string},
        ${deliveryToken},
        ${body.deliveryClass as string},
        ${db().json(body.sealedEnvelope)},
        ${pushNotificationEnabled},
        interval '7 days'
      )
    `
    if (!rows[0]) throw new Error('relay message was not stored')
    result = rows[0]
  } catch (error) {
    const code = databaseErrorCode(error)
    if (code === '23505') throw new HttpError(409, 'duplicate_delivery_token')
    if (code === '23503') throw new HttpError(410, 'recipient_unavailable')
    if (code === '22023') throw new HttpError(400, 'invalid_request')
    throw error
  }
  const serverSequence = Number(result.server_sequence)
  void publishWakeup({
    topic: `sealed_mailbox:${body.recipientMailboxToken as string}`,
    event: 'sealed_message_insert',
    payload: {
      delivery_class: body.deliveryClass,
      server_sequence: serverSequence,
    },
  }).catch(() => undefined)
  scheduleRelayNotificationDrain()
  return {
    id: result.message_id,
    status: result.status,
    serverSequence,
    createdAt: result.created_at.getTime(),
    expiresAt: result.expires_at.getTime(),
  }
}

export async function fetchMessages(
  principal: Principal,
  url: URL,
): Promise<Record<string, unknown>> {
  const deliveryClass = url.searchParams.get('deliveryClass') || 'message'
  const after = queryInteger(url.searchParams.get('afterSequence'), 0)
  const requestedLimit = queryInteger(url.searchParams.get('limit'), 0)
  const limit = requestedLimit === 0 ? 100 : requestedLimit
  if (
    !['message', 'control'].includes(deliveryClass) || !Number.isSafeInteger(after) || after < 0 ||
    !Number.isSafeInteger(limit) || limit < 1 || limit > 100
  ) throw new HttpError(400, 'invalid_request')
  const tokens = await listMailboxes(principal)
  if (tokens.length === 0) return { messages: [] }
  const rows = await db()<RelayRow[]>`
    select message_id, sender_user_id, recipient_mailbox_token, delivery_token,
      delivery_class, sealed_envelope, status, server_sequence, created_at,
      delivered_at, read_at, expires_at, push_notification_enabled
    from sealed_relay_messages
    where recipient_mailbox_token = any(${tokens})
      and delivery_class=${deliveryClass}
      and server_sequence > ${after}
      and expires_at > now()
    order by server_sequence asc, message_id asc
    limit ${limit}
  `
  return { messages: rows.map(messageResponse) }
}

export async function markMessage(
  principal: Principal,
  messageId: unknown,
  target: 'delivered' | 'read',
): Promise<Record<string, unknown>> {
  if (typeof messageId !== 'string' || !/^msg_[A-Za-z0-9_-]{20,100}$/.test(messageId)) {
    throw new HttpError(400, 'invalid_request')
  }
  const exists = await db()`select 1 from sealed_relay_messages where message_id=${messageId}`
  if (!exists[0]) throw new HttpError(404, 'message_not_found')
  let message: RelayRow
  try {
    const rows = await db()<RelayRow[]>`
      select * from spectra_private.advance_sealed_relay_status(
        ${principal.userId}, ${messageId}, ${target}, now()
      )
    `
    if (!rows[0]) throw new HttpError(404, 'message_not_found')
    message = rows[0]
  } catch (error) {
    if (error instanceof HttpError) throw error
    if (databaseErrorCode(error) === '42501') {
      throw new HttpError(403, 'unauthorized_mailbox')
    }
    throw error
  }
  if (message.delivery_token) {
    await publishWakeup({
      topic: `sealed_receipt:${message.delivery_token}`,
      event: 'sealed_receipt_update',
      payload: {
        message_id: message.message_id,
        status: message.status,
        delivered_at: message.delivered_at?.toISOString() ?? null,
        read_at: message.read_at?.toISOString() ?? null,
      },
    }).catch(() => undefined)
  }
  return messageResponse(message)
}

export async function fetchReceipts(
  principal: Principal,
  value: unknown,
): Promise<Record<string, unknown>> {
  if (!Array.isArray(value)) throw new HttpError(400, 'invalid_request')
  if (value.length > 100) throw new HttpError(400, 'status_query_limit_exceeded')
  const queries: { id: string; deliveryToken: string }[] = []
  for (const query of value) {
    if (
      !isRecord(query) || typeof query.id !== 'string' ||
      typeof query.deliveryToken !== 'string' || !deliveryPattern.test(query.deliveryToken)
    ) throw new HttpError(400, 'invalid_request')
    const id = query.id.trim()
    if (!id || id.length > 200) throw new HttpError(400, 'invalid_request')
    queries.push({ id, deliveryToken: query.deliveryToken })
  }
  if (queries.length === 0) return { receipts: [] }
  const rows = await db()<{
    message_id: string
    status: string
    delivered_at: Date | null
    read_at: Date | null
  }[]>`
    with requested as (
      select entry->>'id' as message_id, entry->>'deliveryToken' as delivery_token, ordinal
      from jsonb_array_elements(${db().json(queries)}::jsonb) with ordinality as q(entry, ordinal)
    )
    select messages.message_id, messages.status, messages.delivered_at, messages.read_at
    from requested
    join sealed_relay_messages messages
      on messages.message_id=requested.message_id
      and messages.delivery_token=requested.delivery_token
      and messages.sender_user_id=${principal.userId}
    order by requested.ordinal
  `
  return {
    receipts: rows.map((row) => ({
      id: row.message_id,
      status: row.status,
      ...(row.delivered_at ? { deliveredAt: row.delivered_at.getTime() } : {}),
      ...(row.read_at ? { readAt: row.read_at.getTime() } : {}),
    })),
  }
}

export async function vacuumSealedMessages(
  principal: Principal,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const beforeSequence = body.beforeSequence
  if (
    typeof beforeSequence !== 'number' ||
    !Number.isSafeInteger(beforeSequence) ||
    beforeSequence <= 0
  ) {
    throw new HttpError(400, 'invalid_request')
  }
  const statuses = parseRelayVacuumStatuses(body.statuses)
  try {
    const rows = await db()<[{ deleted_count: number }]>`
      select spectra_private.vacuum_sealed_relay_messages(
        ${principal.userId},
        ${beforeSequence},
        ${statuses}
      ) as deleted_count
    `
    return { deletedCount: Number(rows[0].deleted_count) }
  } catch (error) {
    if (databaseErrorCode(error) === '42501') {
      throw new HttpError(403, 'unauthorized_mailbox')
    }
    if (databaseErrorCode(error) === '22023') {
      throw new HttpError(400, 'invalid_request')
    }
    throw error
  }
}

function parseRelayVacuumStatuses(value: unknown): string[] {
  if (value === undefined) return ['read']
  if (!Array.isArray(value) || value.length === 0 || value.length > 2) {
    throw new HttpError(400, 'invalid_request')
  }
  const statuses = [
    ...new Set(value.map((status) => (
      typeof status === 'string' ? status.trim() : ''
    ))),
  ]
  if (statuses.some((status) => status !== 'delivered' && status !== 'read')) {
    throw new HttpError(400, 'invalid_request')
  }
  return statuses
}

export async function deleteMessages(
  principal: Principal,
  value: unknown,
): Promise<Record<string, unknown>> {
  if (!Array.isArray(value) || value.length > 100) throw new HttpError(400, 'invalid_request')
  if (value.some((id) => typeof id !== 'string')) throw new HttpError(400, 'invalid_request')
  const ids = [
    ...new Set(
      (value as string[]).map((id) => id.trim()).filter((id) => id && id.length <= 200),
    ),
  ]
  if (ids.length === 0) return { deletedCount: 0 }
  try {
    const rows = await db()<[{ deleted_count: number }]>`
      select spectra_private.delete_sealed_relay_messages(
        ${principal.userId}, ${ids}
      ) as deleted_count
    `
    return { deletedCount: Number(rows[0].deleted_count) }
  } catch (error) {
    if (databaseErrorCode(error) === '42501') {
      throw new HttpError(403, 'unauthorized_mailbox')
    }
    throw error
  }
}
