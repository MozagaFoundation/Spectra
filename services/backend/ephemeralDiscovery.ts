/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import {
  deriveRecipientMailboxToken,
  sealContactCardProfile,
  verifySignedContactProfile,
  type HybridPreKey,
  type PublicKeyBundle,
  type SignedContactProfile,
} from '@spectra/core-crypto'
import {
  hashVdfBinding,
  type VdfInput,
  type VdfProgress,
  type VdfPublicParams,
} from '@spectra/privacy-protocol'

import {
  DISCOVERY_ALIAS_SEARCH_LIMIT,
  parseDiscoveryAliasPrefix,
  normalizeDiscoveryAlias,
} from '@/lib/discoveryAlias'
import { isValidEXOAddress } from '@/lib/utils'
import { backendRequest, SpectraBackendError } from './request'
import { ensureBackendSession } from './session'
import {
  retryVdfSubmissionAfterServerFloor,
  waitForVdfChallengeAge,
} from './vdfChallengeTiming'
import { solveVdfOnDevice } from '@/services/security/nativeVdf'
import { beginVdfActivity, type VdfActivityHandle } from '@/services/shared/vdfActivity'

interface VdfChallengeResponse {
  challengeId: string
  nonceHex: string
  expiresAt: number
  notBeforeAt: number
  params: VdfPublicParams
}

interface VdfProtectedRequestOptions {
  onProgress?: (progress: VdfProgress) => void
  signal?: AbortSignal
  onCancel?: () => void
  activity?: VdfActivityHandle
  holdActivity?: boolean
}

export interface DiscoveryAliasLeaseFields {
  discoveryAlias?: string | null
  aliasAutocomplete?: boolean
}

export interface DiscoveryAliasMatch {
  alias: string
  walletAddress: string
}

interface PublicDiscoveryLeaseResult {
  expiresAt: number
  discoveryMode?: 'active' | 'ephemeral'
}

interface OwnDiscoveryLeaseResult {
  exists: boolean
  discoveryMode?: string
  expiresAt?: number
}

interface ContactCardResult {
  expiresAt: number
}

interface ContactCardOwnerStatusResult {
  active: boolean
}

export interface OneTimeContactCard {
  cardId: string
  cardCapability: string
  profileCapability: string
  expiresAt: number
}

const reusableContactCardPreKeyErrors = new WeakSet<object>()
const contactCardIdPattern = /^scc1\.[0-9a-f]{32}$/

export function canReuseReservedContactCardPreKey(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && reusableContactCardPreKeyErrors.has(error)
}

function canSafelyReuseContactCardPreKey(error: unknown, submitted: boolean): boolean {
  if (!submitted) return true
  if (!(error instanceof SpectraBackendError)) return false
  if ([400, 401, 403, 404, 422].includes(error.status)) return true
  return error.status === 409 && error.code === 'contact_card_active'
}

function markReusableContactCardPreKey(error: unknown): void {
  if (typeof error === 'object' && error !== null) {
    reusableContactCardPreKeyErrors.add(error)
  }
}

function randomHex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

function randomBase64Url(bytes: number): string {
  const value = crypto.getRandomValues(new Uint8Array(bytes))
  let binary = ''
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function requireFutureExpiry(expiresAt: unknown): number {
  if (
    typeof expiresAt !== 'number'
    || !Number.isSafeInteger(expiresAt)
    || expiresAt <= Date.now()
  ) {
    throw new Error('The discovery service returned an invalid expiration')
  }
  return expiresAt
}

function finishVdfActivity(
  activity: ReturnType<typeof beginVdfActivity>,
  error: unknown,
  holdActivity = false,
): void {
  if (error instanceof Error && error.name === 'AbortError') {
    activity.cancel()
    return
  }
  if (holdActivity) return
  activity.fail()
}

async function getAccessToken(options: VdfProtectedRequestOptions): Promise<string> {
  const session = await ensureBackendSession({
    signal: options.signal,
    onVdfProgress: options.onProgress,
    onVdfCancel: options.onCancel,
  })
  if (!session?.accessToken) throw new Error('Could not authenticate with the discovery service')
  return session.accessToken
}

export async function isOwnOneTimeContactCardActive(
  cardId: string,
  options: VdfProtectedRequestOptions = {},
): Promise<boolean> {
  if (!contactCardIdPattern.test(cardId)) {
    throw new Error('Invalid one-time contact card')
  }
  const accessToken = await getAccessToken(options)
  const result = await backendRequest<ContactCardOwnerStatusResult>(
    `/v1/chat/contact-cards/${cardId}/owner-status`,
    { method: 'POST' },
    {
      accessToken,
      ...(options.signal ? { signal: options.signal } : {}),
    },
  )
  if (typeof result?.active !== 'boolean') {
    throw new Error('The discovery service returned an invalid contact card status')
  }
  return result.active
}

async function solveBoundVdf(
  accessToken: string,
  action: VdfInput['action'],
  bindingHash: string,
  options: VdfProtectedRequestOptions,
) {
  const challenge = await backendRequest<VdfChallengeResponse>(
    '/v1/chat/discovery/vdf-challenges',
    {
      method: 'POST',
      body: { action, bindingHash },
    },
    {
      accessToken,
      ...(options.signal ? { signal: options.signal } : {}),
    },
  )
  if (
    typeof challenge.challengeId !== 'string' ||
    typeof challenge.nonceHex !== 'string' ||
    !Number.isSafeInteger(challenge.expiresAt) ||
    !Number.isSafeInteger(challenge.notBeforeAt) ||
    challenge.notBeforeAt > challenge.expiresAt ||
    !challenge.params
  ) {
    throw new Error('The discovery service returned an invalid VDF challenge')
  }
  const activity = options.activity ?? beginVdfActivity({
    action,
    cancel: options.onCancel,
    canCancel: Boolean(options.onCancel),
  })
  try {
    const proof = await solveVdfOnDevice(challenge.params, {
      challengeId: challenge.challengeId,
      nonceHex: challenge.nonceHex,
      action,
      bindingHash,
    }, {
      signal: options.signal,
      onProgress: (progress) => {
        activity.progress(progress)
        options.onProgress?.(progress)
      },
    })
    activity.waitForServer(challenge.notBeforeAt)
    await waitForVdfChallengeAge(
      challenge.notBeforeAt,
      options.signal,
      (notBeforeAt, retrying) => activity.waitForServer(notBeforeAt, retrying),
    )
    return { activity, challenge, proof }
  } catch (error) {
    finishVdfActivity(activity, error, options.holdActivity === true)
    throw error
  }
}

function aliasRequestFields(fields?: DiscoveryAliasLeaseFields): Record<string, unknown> {
  if (!fields) return {}
  const extra: Record<string, unknown> = {}
  if (fields.discoveryAlias !== undefined) extra.discoveryAlias = fields.discoveryAlias
  if (fields.aliasAutocomplete !== undefined) extra.aliasAutocomplete = fields.aliasAutocomplete
  return extra
}

export async function publishPublicDiscoveryLease(
  identityId: string,
  walletAddress: string,
  bundle: PublicKeyBundle,
  options: VdfProtectedRequestOptions = {},
  aliasFields?: DiscoveryAliasLeaseFields,
): Promise<PublicDiscoveryLeaseResult> {
  const recipientMailboxToken = deriveRecipientMailboxToken(bundle)
  const bindingHash = hashVdfBinding({
    action: 'public_discovery',
    bundle,
    identityId,
    recipientMailboxToken,
    walletAddress,
  })
  const accessToken = await getAccessToken(options)
  const { activity, challenge, proof } = await solveBoundVdf(
    accessToken,
    'public_discovery',
    bindingHash,
    options,
  )
  try {
    if (challenge.expiresAt <= Date.now()) throw new Error('The VDF challenge expired')
    activity.submit()
    const result = await retryVdfSubmissionAfterServerFloor(
      () => backendRequest<PublicDiscoveryLeaseResult>(
        '/v1/chat/bundles',
        {
          method: 'POST',
          body: {
            identityId,
            walletAddress,
            recipientMailboxToken,
            bundle,
            vdfChallengeId: challenge.challengeId,
            vdfProof: proof,
            ...aliasRequestFields(aliasFields),
          },
        },
        { accessToken },
      ),
      options.signal,
      (notBeforeAt, retrying) => activity.waitForServer(notBeforeAt, retrying),
    )
    const expiresAt = requireFutureExpiry(result.expiresAt)
    activity.complete()
    return { expiresAt }
  } catch (error) {
    finishVdfActivity(activity, error)
    throw error
  }
}

export async function extendActiveDiscoveryLease(
  identityId: string,
  walletAddress: string,
  bundle: PublicKeyBundle,
  options: VdfProtectedRequestOptions = {},
  aliasFields?: DiscoveryAliasLeaseFields,
): Promise<PublicDiscoveryLeaseResult> {
  const recipientMailboxToken = deriveRecipientMailboxToken(bundle)
  const bindingHash = hashVdfBinding({
    action: 'extend_public_discovery',
    bundle,
    identityId,
    recipientMailboxToken,
    walletAddress,
  })
  const accessToken = await getAccessToken(options)
  const { activity, challenge, proof } = await solveBoundVdf(
    accessToken,
    'extend_public_discovery',
    bindingHash,
    options,
  )
  try {
    if (challenge.expiresAt <= Date.now()) throw new Error('The VDF challenge expired')
    activity.submit()
    const result = await retryVdfSubmissionAfterServerFloor(
      () => backendRequest<PublicDiscoveryLeaseResult>(
        '/v1/chat/discovery/leases',
        {
          method: 'POST',
          body: {
            identityId,
            walletAddress,
            recipientMailboxToken,
            bundle,
            vdfChallengeId: challenge.challengeId,
            vdfProof: proof,
            ...aliasRequestFields(aliasFields),
          },
        },
        {
          accessToken,
          ...(options.signal ? { signal: options.signal } : {}),
        },
      ),
      options.signal,
      (notBeforeAt, retrying) => activity.waitForServer(notBeforeAt, retrying),
    )
    const expiresAt = requireFutureExpiry(result.expiresAt)
    if (!options.holdActivity) activity.complete()
    return { expiresAt, discoveryMode: 'active' }
  } catch (error) {
    finishVdfActivity(activity, error, options.holdActivity === true)
    throw error
  }
}

export async function unpublishPublicDiscovery(
  options: VdfProtectedRequestOptions = {},
): Promise<void> {
  const accessToken = await getAccessToken(options)
  await backendRequest(
    '/v1/chat/discovery/lease',
    { method: 'DELETE' },
    {
      accessToken,
      ...(options.signal ? { signal: options.signal } : {}),
    },
  )
}

export async function fetchOwnDiscoveryLease(
  options: VdfProtectedRequestOptions = {},
): Promise<OwnDiscoveryLeaseResult> {
  const accessToken = await getAccessToken(options)
  const result = await backendRequest<OwnDiscoveryLeaseResult>(
    '/v1/chat/discovery/lease',
    { method: 'GET' },
    {
      accessToken,
      ...(options.signal ? { signal: options.signal } : {}),
    },
  )
  if (typeof result?.exists !== 'boolean') {
    throw new Error('The discovery service returned an invalid lease status')
  }
  if (!result.exists) return { exists: false }
  if (typeof result.expiresAt !== 'number' || result.expiresAt <= Date.now()) {
    return { exists: false }
  }
  return result
}

export async function patchOwnDiscoveryAlias(
  fields: DiscoveryAliasLeaseFields,
  options: VdfProtectedRequestOptions = {},
): Promise<'updated' | 'missing'> {
  const body = aliasRequestFields(fields)
  if (Object.keys(body).length === 0) return 'updated'
  const accessToken = await getAccessToken(options)
  try {
    await backendRequest(
      '/v1/chat/discovery/lease',
      { method: 'PATCH', body },
      {
        accessToken,
        ...(options.signal ? { signal: options.signal } : {}),
      },
    )
    return 'updated'
  } catch (error) {
    if (
      error instanceof SpectraBackendError &&
      (error.status === 404 || error.status === 405)
    ) {
      if (__DEV__) {
        console.log('[DiscoveryAlias]', 'patch.unavailable', {
          status: error.status,
          code: error.code,
        })
      }
      return 'missing'
    }
    if (__DEV__ && error instanceof SpectraBackendError) {
      console.log('[DiscoveryAlias]', 'patch.failed', {
        status: error.status,
        code: error.code,
      })
    }
    throw error
  }
}

export async function searchDiscoveryAliases(
  query: string,
  options: VdfProtectedRequestOptions = {},
): Promise<DiscoveryAliasMatch[]> {
  const trimmed = query.trim()
  if (!parseDiscoveryAliasPrefix(trimmed)) return []
  const accessToken = await getAccessToken(options)
  const result = await backendRequest<{ matches?: DiscoveryAliasMatch[] }>(
    `/v1/chat/discovery/aliases?q=${encodeURIComponent(trimmed)}`,
    { method: 'GET' },
    {
      accessToken,
      ...(options.signal ? { signal: options.signal } : {}),
    },
  )
  if (!Array.isArray(result?.matches)) return []
  return result.matches.filter((match) => {
    if (typeof match?.alias !== 'string' || typeof match?.walletAddress !== 'string') return false
    if (!isValidEXOAddress(match.walletAddress)) return false
    try {
      return Boolean(normalizeDiscoveryAlias(match.alias))
    } catch {
      return false
    }
  }).slice(0, DISCOVERY_ALIAS_SEARCH_LIMIT)
}

export async function claimSessionOpk(
  targetIdentityId: string,
  requestorId: string,
  options: VdfProtectedRequestOptions = {},
): Promise<{ bundle: PublicKeyBundle; allocatedOPKId?: number }> {
  const bindingHash = hashVdfBinding({
    action: 'claim_session_opk',
    requestorIdentityId: requestorId,
    targetIdentityId,
  })
  const accessToken = await getAccessToken(options)
  const { activity, challenge, proof } = await solveBoundVdf(
    accessToken,
    'claim_session_opk',
    bindingHash,
    options,
  )
  try {
    if (challenge.expiresAt <= Date.now()) throw new Error('The VDF challenge expired')
    activity.submit()
    const result = await retryVdfSubmissionAfterServerFloor(
      () => backendRequest<{
        bundle: PublicKeyBundle
        allocatedOPK?: PublicKeyBundle['oneTimePreKeys'][number]
        allocatedOPKId?: number
      }>(
        '/v1/chat/discovery/session-opk',
        {
          method: 'POST',
          body: {
            targetIdentityId,
            requestorId,
            vdfChallengeId: challenge.challengeId,
            vdfProof: proof,
          },
        },
        { accessToken },
      ),
      options.signal,
      (notBeforeAt, retrying) => activity.waitForServer(notBeforeAt, retrying),
    )
    if (!result?.bundle) throw new Error('The discovery service returned an invalid session bundle')
    activity.complete()
    return {
      bundle: {
        ...result.bundle,
        oneTimePreKeys: result.allocatedOPK ? [result.allocatedOPK] : [],
      },
      ...(typeof result.allocatedOPKId === 'number' ? { allocatedOPKId: result.allocatedOPKId } : {}),
    }
  } catch (error) {
    finishVdfActivity(activity, error)
    throw error
  }
}

export async function createOneTimeContactCard(
  identityId: string,
  walletAddress: string,
  bundle: PublicKeyBundle,
  cardOpk: HybridPreKey,
  profile: SignedContactProfile,
  options: VdfProtectedRequestOptions = {},
): Promise<OneTimeContactCard> {
  if (
    bundle.identityId !== identityId
    || profile.identityId !== identityId
    || !verifySignedContactProfile(profile, bundle.dilithiumKey, identityId)
  ) {
    throw new Error('Contact profile does not match the chat identity')
  }
  const cardId = `scc1.${randomHex(16)}`
  const cardCapability = `sccap1.${randomBase64Url(32)}`
  const profileCapability = `sccpc1.${randomBase64Url(32)}`
  const recipientMailboxToken = deriveRecipientMailboxToken(bundle)
  const profileCapsule = sealContactCardProfile(profile, cardId, profileCapability)
  const bindingHash = hashVdfBinding({
    action: 'contact_card',
    bundle,
    cardCapability,
    cardId,
    cardOpk,
    identityId,
    profileCapsule,
    recipientMailboxToken,
    walletAddress,
  })
  let activity: ReturnType<typeof beginVdfActivity> | undefined
  let submitted = false
  try {
    const accessToken = await getAccessToken(options)
    const solved = await solveBoundVdf(
      accessToken,
      'contact_card',
      bindingHash,
      options,
    )
    const { activity: vdfActivity, challenge, proof } = solved
    activity = vdfActivity
    if (challenge.expiresAt <= Date.now()) throw new Error('The VDF challenge expired')
    vdfActivity.submit()
    submitted = true
    const result = await retryVdfSubmissionAfterServerFloor(
      () => backendRequest<ContactCardResult>(
        '/v1/chat/contact-cards',
        {
          method: 'POST',
          body: {
            identityId,
            walletAddress,
            recipientMailboxToken,
            bundle,
            cardId,
            cardCapability,
            cardOpk,
            profileCapsule,
            vdfChallengeId: challenge.challengeId,
            vdfProof: proof,
          },
        },
        { accessToken },
      ),
      options.signal,
      (notBeforeAt, retrying) => vdfActivity.waitForServer(notBeforeAt, retrying),
    )
    const expiresAt = requireFutureExpiry(result.expiresAt)
    vdfActivity.complete()
    return {
      cardId,
      cardCapability,
      profileCapability,
      expiresAt,
    }
  } catch (error) {
    if (canSafelyReuseContactCardPreKey(error, submitted)) {
      markReusableContactCardPreKey(error)
    }
    if (activity) finishVdfActivity(activity, error)
    throw error
  }
}
