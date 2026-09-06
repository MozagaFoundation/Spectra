/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import NetInfo from '@react-native-community/netinfo'

import { isSameAccountStorageScope } from '@/lib/accountScope'
import { loadIdentityByAddress } from '@spectra/core-crypto/client/identity'
import {
  deriveRecipientMailboxToken,
  signPublicKeyBundleWalletAuthorization,
  type PublicKeyBundle,
  verifyPublicKeyBundle,
  verifyPublicKeyBundleWalletAuthorization,
} from '@spectra/core-crypto'
import { localChatStorage } from '@spectra/core-crypto/storage/local'
import type {
  AuthSession,
  SecureAccessFailure,
  SecureAccessState,
} from '@/lib/types'
import {
  BACKEND_AUTH_SESSION_METADATA_VERSION,
  bindPrivateChatIdentityWithBackend,
  refreshBackendSession,
  requestWalletAuthChallengeWithBackend,
  verifyWalletAuthChallengeWithBackend,
} from '@/services/backend/auth'
import {
  isSpectraBackendConfigured,
  registerBackendIdentityRecovery,
  SpectraBackendError,
} from '@/services/backend/client'
import { solveVdfOnDevice } from '@/services/security/nativeVdf'
import { beginVdfActivity } from '@/services/shared/vdfActivity'
import { persistDevSessionLog } from '@/services/logging/devSessionLog'
import { useTorStore } from '@/services/tor/torStore'
import { signMessage, type EXOWallet } from '@spectra/identity-vault'
import { type VdfProgress } from '@spectra/privacy-protocol'
import { useAuthStore } from '@/store/authStore'
import { useWalletStore } from '@/store/walletStore'
import {
  retryVdfSubmissionAfterServerFloor,
  waitForVdfChallengeAge,
} from './vdfChallengeTiming'

const SESSION_METADATA_VERSION = BACKEND_AUTH_SESSION_METADATA_VERSION
const SESSION_EXPIRY_BUFFER_MS = 60_000
const BOOTSTRAP_RETRY_COOLDOWN_MS = 15_000
export const BACKEND_BINDING_RETRY_COOLDOWN_MS = 15_000
const BINDING_VERIFIED_CACHE_TTL_MS = 10 * 60 * 1000
const ADMISSION_TRANSIENT_RETRY_DELAY_MS = 1_000
const MAX_ADMISSION_TRANSIENT_RETRIES = 1
const CLOUD_AUTH_LOG_PREFIX = '[CloudAuth]'
const WALLET_AUTH_SIGNATURE_DOMAIN = 'Spectra.WalletAuthChallenge.v1'

let bootstrapPromise: Promise<AuthSession | null> | null = null
let foregroundRecoveryPromise: Promise<AuthSession | null> | null = null
let authCacheGeneration = 0
let lastBootstrapFailureAt = 0
let lastBindingFailureAt = 0
let lastBindingSuccessAt = 0
let lastBoundWalletAddress: string | null = null
let lastBoundIdentityId: string | null = null
let lastVerifiedAccessSignature: string | null = null
let lastBoundAccessSignature: string | null = null
let lastStoredSessionRefreshInvalid = false
const verifiedAccessPromises = new Map<string, Promise<AuthSession | null>>()
const bindingPromises = new Map<string, Promise<boolean>>()
let lastBackendAdmissionOutcome: BackendAdmissionOutcome = {
  phase: 'idle',
  failure: null,
  retryable: false,
}

export type BackendAdmissionOutcome = SecureAccessState

export interface BackendSessionVdfOptions {
  signal?: AbortSignal
  onVdfProgress?: (progress: VdfProgress) => void
  onVdfCancel?: () => void
}

function describeSession(session: AuthSession | null | undefined): Record<string, unknown> {
  return {
    hasSession: Boolean(session),
    hasIdentity: Boolean(session?.identityId),
    expiresInMs: session?.expiresAt ? session.expiresAt - Date.now() : null,
    metadataVersion: session?.metadataVersion ?? null,
  }
}

function logCloudAuth(event: string, details?: Record<string, unknown>): void {
  if (!__DEV__) return
  persistDevSessionLog('CloudAuth', event, details ?? {})
  if (details) {
    console.log(CLOUD_AUTH_LOG_PREFIX, event, details)
    return
  }
  console.log(CLOUD_AUTH_LOG_PREFIX, event)
}

function logBoundBackendAccessState(details: Record<string, unknown>): void {
  if (!__DEV__) return
  const { expiresInMs: _expiresInMs, ...stableDetails } = details
  const signature = JSON.stringify(stableDetails)
  if (signature === lastBoundAccessSignature) {
    return
  }
  lastBoundAccessSignature = signature
  console.log(CLOUD_AUTH_LOG_PREFIX, 'hasBoundBackendAccessForIdentity', details)
}

function logVerifiedAccessState(details: Record<string, unknown>): void {
  if (!__DEV__) return
  const signature = JSON.stringify(details)
  if (signature === lastVerifiedAccessSignature) {
    return
  }
  lastVerifiedAccessSignature = signature
  console.log(CLOUD_AUTH_LOG_PREFIX, 'hasVerifiedBackendAccess', details)
}

function setBackendAdmissionOutcome(outcome: BackendAdmissionOutcome): void {
  lastBackendAdmissionOutcome = outcome
  useAuthStore.getState().setSecureAccess(outcome)
}

function setAdmissionPending(phase: Extract<BackendAdmissionOutcome['phase'], 'admitting' | 'binding'>): void {
  setBackendAdmissionOutcome({
    phase,
    failure: null,
    retryable: false,
  })
}

function setAdmissionReady(): void {
  setBackendAdmissionOutcome({
    phase: 'ready',
    failure: null,
    retryable: false,
  })
}

function setAdmissionFailure(
  failure: SecureAccessFailure,
  retryable: boolean,
): void {
  setBackendAdmissionOutcome({
    phase: 'failed',
    failure,
    retryable,
  })
}

function errorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('code' in error)) return null
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : null
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function describeAdmissionError(error: unknown): { errorCode: string | null; status: number | null } {
  return {
    errorCode: errorCode(error),
    status: error instanceof SpectraBackendError ? error.status : null,
  }
}

function bootstrapReadiness() {
  const authState = useAuthStore.getState()
  const walletState = useWalletStore.getState()
  return {
    isAuthenticated: authState.isAuthenticated,
    isVaultUnlocked: walletState.isVaultUnlocked,
    hasWallet: Boolean(walletState.wallet),
    storeExpiresInMs: authState.session?.expiresAt ? authState.session.expiresAt - Date.now() : null,
    cooldownRemainingMs: lastBootstrapFailureAt > 0
      ? Math.max(0, BOOTSTRAP_RETRY_COOLDOWN_MS - (Date.now() - lastBootstrapFailureAt))
      : 0,
  }
}

function canCommitRefreshedSession(walletAddress: string, generation: number): boolean {
  if (authCacheGeneration !== generation) {
    return false
  }

  const activeWallet = useWalletStore.getState().wallet
  if (activeWallet) {
    return isSameAccountStorageScope(activeWallet.address, walletAddress)
  }

  const stored = useAuthStore.getState().session
  return Boolean(stored && isSameAccountStorageScope(stored.exoAddress, walletAddress))
}

function classifyAdmissionFailure(error: unknown): SecureAccessFailure {
  if (isAbortError(error) || errorCode(error) === 'ERR_VDF_CANCELLED') {
    return 'cancelled'
  }

  switch (errorCode(error)) {
    case 'ERR_VDF_UNAVAILABLE':
      return 'native_unavailable'
    case 'ERR_VDF_BUSY':
      return 'native_busy'
    case 'vdf_challenge_expired':
    case 'challenge_expired':
    case 'challenge_not_found':
      return 'challenge_expired'
    case 'invalid_vdf_proof':
    case 'vdf_required':
    case 'invalid_signature':
    case 'challenge_replay':
    case 'challenge_mismatch':
      return 'proof_rejected'
    case 'account_deletion_pending':
      return 'deletion_cleanup_pending'
    case 'identity_not_bound':
    case 'identity_already_bound':
      return 'identity_binding'
    case 'database_unavailable':
    case 'vdf_unavailable':
    case 'challenge_unavailable':
      return 'temporary_backend'
    case 'invalid_refresh_token':
    case 'refresh_token_expired':
    case 'refresh_token_replay':
      return 'unknown'
  }

  if (error instanceof SpectraBackendError) {
    if (error.status === 0 && error.code !== 'backend_not_configured') {
      return 'connectivity'
    }
    if (error.status === 429 || error.status >= 500) {
      return 'temporary_backend'
    }
  }

  if (error instanceof TypeError) {
    return 'connectivity'
  }

  return 'unknown'
}

function isRefreshTokenInvalid(error: unknown): boolean {
  const code = errorCode(error)
  return code === 'invalid_refresh_token'
    || code === 'refresh_token_expired'
    || code === 'refresh_token_replay'
}

function isTransientAdmissionFailure(failure: SecureAccessFailure): boolean {
  return failure === 'challenge_expired'
    || failure === 'temporary_backend'
    || failure === 'connectivity'
}

function isRetryableAdmissionFailure(failure: SecureAccessFailure): boolean {
  return isTransientAdmissionFailure(failure) || failure === 'deletion_cleanup_pending'
}

function waitForAdmissionRetry(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const onAbort = () => {
      if (timer) clearTimeout(timer)
      reject(Object.assign(new Error('VDF solving was cancelled'), { name: 'AbortError' }))
    }
    timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ADMISSION_TRANSIENT_RETRY_DELAY_MS)
    signal?.addEventListener('abort', onAbort, { once: true })
    if (signal?.aborted) onAbort()
  })
}

function finishVdfActivity(
  activity: ReturnType<typeof beginVdfActivity>,
  error: unknown,
): void {
  if (isAbortError(error)) {
    activity.cancel()
    return
  }
  activity.fail(classifyAdmissionFailure(error))
}

function getVerifiedAccessRequestKey(identityId?: string | null): string {
  const walletAddress = useWalletStore.getState().wallet?.address ?? '__no_wallet__'
  const normalizedIdentityId = identityId?.trim() ?? ''
  const identityKey = normalizedIdentityId.length > 0 ? normalizedIdentityId : '__wallet__'
  return `${authCacheGeneration}:${walletAddress}:${identityKey}`
}

function normalizeIdentityId(identityId?: string | null): string | null {
  const normalizedIdentityId = identityId?.trim() ?? ''
  return normalizedIdentityId.length > 0 ? normalizedIdentityId : null
}

/**
 * Clear cooldowns and invalidate in-flight work after transport changes.
 * Binding success is preserved because transport does not change wallet binding.
 */
export function resetAuthCooldowns(): void {
  authCacheGeneration += 1
  bootstrapPromise = null
  foregroundRecoveryPromise = null
  lastBootstrapFailureAt = 0
  lastBindingFailureAt = 0
  lastStoredSessionRefreshInvalid = false
  verifiedAccessPromises.clear()
  bindingPromises.clear()
}

/**
 * Clear all auth caches after identity changes.
 */
export function invalidateAuthCaches(): void {
  authCacheGeneration += 1
  bootstrapPromise = null
  foregroundRecoveryPromise = null
  lastBootstrapFailureAt = 0
  lastBindingFailureAt = 0
  lastStoredSessionRefreshInvalid = false
  lastBindingSuccessAt = 0
  lastBoundWalletAddress = null
  lastBoundIdentityId = null
  lastBoundAccessSignature = null
  setBackendAdmissionOutcome({
    phase: 'idle',
    failure: null,
    retryable: false,
  })
  verifiedAccessPromises.clear()
  bindingPromises.clear()
}

export function getBackendAdmissionOutcome(): BackendAdmissionOutcome {
  return lastBackendAdmissionOutcome
}

type Session = {
  access_token: string
  refresh_token: string
  expires_at?: number
  expires_in: number
  identity_id: string | null
}

type BackendAuthClient = {
  auth: {
    setSession: (tokens: { access_token: string; refresh_token: string }) => Promise<{ data: { session: Session | null }; error: Error | null }>
    signInAnonymously: () => Promise<{ data: { session: Session | null }; error: Error | null }>
  }
}

function hasBackendConfig(): boolean {
  return isSpectraBackendConfigured()
}

function isSessionUnexpired(session: AuthSession | null | undefined): session is AuthSession {
  return Boolean(
    session
      && session.metadataVersion === SESSION_METADATA_VERSION
      && session.expiresAt > Date.now()
  )
}

function isSessionFresh(session: AuthSession | null | undefined): session is AuthSession {
  return Boolean(
    isSessionUnexpired(session)
      && session.expiresAt - Date.now() > SESSION_EXPIRY_BUFFER_MS
  )
}

function isTransientBindingFailure(failure: SecureAccessFailure): boolean {
  return isRetryableAdmissionFailure(failure) || failure === 'cancelled'
}

function canUseLocalCloudBootstrap(): boolean {
  const authState = useAuthStore.getState()
  const walletState = useWalletStore.getState()

  return Boolean(
    hasBackendConfig()
      && authState.isAuthenticated
      && walletState.isVaultUnlocked
      && walletState.wallet
  )
}

function isCurrentAuthContext(walletAddress: string, generation: number): boolean {
  const activeWallet = useWalletStore.getState().wallet
  return authCacheGeneration === generation
    && Boolean(activeWallet && isSameAccountStorageScope(activeWallet.address, walletAddress))
}

function clearExactIdentityBindingCache(): void {
  lastBindingSuccessAt = 0
  lastBoundWalletAddress = null
  lastBoundIdentityId = null
  lastBoundAccessSignature = null
}

function markWalletVerificationUnavailable(): void {
  clearExactIdentityBindingCache()
  useAuthStore.getState().setIdentityBound(false)
  useAuthStore.getState().setCloudAuthVerified(false)
}

function shouldUnbindOnMissingSession(): boolean {
  if (useAuthStore.getState().session) {
    return false
  }

  const outcome = lastBackendAdmissionOutcome
  if (outcome.retryable || outcome.failure === 'cancelled') {
    return false
  }

  const { enabled, status } = useTorStore.getState()
  if (enabled && status !== 'connected' && status !== 'connecting') {
    return false
  }

  return true
}

function markWalletVerificationState(
  walletAddress: string,
  options: {
    identityId?: string | null
    exactIdentityBound: boolean
    cacheExactBinding?: boolean
  },
): void {
  const normalizedIdentityId = normalizeIdentityId(options.identityId)
  const exactIdentityBound = Boolean(options.exactIdentityBound && normalizedIdentityId)

  useAuthStore.getState().setCloudAuthVerified(true)
  useAuthStore.getState().setIdentityBound(exactIdentityBound)

  if (exactIdentityBound && options.cacheExactBinding) {
    lastBindingFailureAt = 0
    lastBindingSuccessAt = Date.now()
    lastBoundWalletAddress = walletAddress
    lastBoundIdentityId = normalizedIdentityId
    return
  }

  clearExactIdentityBindingCache()
}

function markAdmissionCancelled(): void {
  if (!useAuthStore.getState().isIdentityBound) {
    setAdmissionFailure('cancelled', false)
  }
}

function hasPersistedExactIdentityBinding(
  walletAddress: string,
  identityId: string | null,
  session: AuthSession,
): boolean {
  const normalizedIdentityId = normalizeIdentityId(identityId)
  return Boolean(
    normalizedIdentityId
    && session.refreshToken
    && session.identityId === normalizedIdentityId
    && isSameAccountStorageScope(session.exoAddress, walletAddress)
    && isSameAccountStorageScope(walletAddress, useWalletStore.getState().wallet?.address)
  )
}

export function rehydratePersistedBoundIdentityCache(identityId?: string | null): boolean {
  if (!canUseLocalCloudBootstrap()) return false
  const wallet = useWalletStore.getState().wallet
  const session = useAuthStore.getState().session
  if (!wallet || !session?.refreshToken) return false

  const targetIdentityId = identityId ?? session.identityId ?? null
  if (!hasPersistedExactIdentityBinding(wallet.address, targetIdentityId, session)) {
    return false
  }
  const normalizedIdentityId = normalizeIdentityId(targetIdentityId)
  if (!normalizedIdentityId) return false

  lastBindingFailureAt = 0
  lastBindingSuccessAt = Date.now()
  lastBoundWalletAddress = wallet.address
  lastBoundIdentityId = normalizedIdentityId
  useAuthStore.getState().setCloudAuthVerified(true)
  useAuthStore.getState().setIdentityBound(true)
  setAdmissionReady()
  return true
}

function hasFreshExactIdentityBinding(
  walletAddress: string,
  identityId: string | null,
  session: AuthSession,
): boolean {
  const normalizedIdentityId = normalizeIdentityId(identityId)
  if (!normalizedIdentityId) {
    return false
  }

  const authState = useAuthStore.getState()
  const activeWallet = useWalletStore.getState().wallet
  return Boolean(
    authState.isCloudAuthVerified
      && authState.isIdentityBound
      && isSessionFresh(session)
      && activeWallet
      && isSameAccountStorageScope(activeWallet.address, walletAddress)
      && session.identityId === normalizedIdentityId
      && lastBindingSuccessAt > 0
      && Date.now() - lastBindingSuccessAt < BINDING_VERIFIED_CACHE_TTL_MS
      && lastBoundWalletAddress === walletAddress
      && lastBoundIdentityId === normalizedIdentityId
  )
}

function hasCachedExactIdentityBindingForSession(
  walletAddress: string,
  session: AuthSession,
): boolean {
  return Boolean(
    useAuthStore.getState().isIdentityBound
      && session.identityId
      && session.exoAddress === walletAddress
      && lastBoundWalletAddress === walletAddress
      && lastBoundIdentityId === session.identityId,
  )
}

function createAuthClient(options: BackendSessionVdfOptions = {}): BackendAuthClient {
  if (!isSpectraBackendConfigured()) {
    throw new Error('Spectra backend auth bootstrap is not configured')
  }

  return {
    auth: {
      setSession: async ({ refresh_token }) => {
        const wallet = useWalletStore.getState().wallet
        if (!wallet) return { data: { session: null }, error: new Error('Wallet is not available') }
        const cached = useAuthStore.getState().session
        if (cached && cached.exoAddress === wallet.address && isSessionFresh(cached)) {
          return { data: { session: toBackendCompatibleSession(cached) }, error: null }
        }
        try {
          const session = await refreshBackendSession(refresh_token, wallet.address)
          if (!session) {
            return { data: { session: null }, error: new Error('session_unavailable') }
          }
          return { data: { session: toBackendCompatibleSession(session) }, error: null }
        } catch (error) {
          logCloudAuth('refreshBackendSession.failed', describeAdmissionError(error))
          return {
            data: { session: null },
            error: error instanceof Error ? error : new Error('refresh_failed'),
          }
        }
      },
      signInAnonymously: async () => {
        const wallet = useWalletStore.getState().wallet
        if (!wallet) return { data: { session: null }, error: new Error('Wallet is not available') }
        const session = await createVerifiedBackendSession(wallet, null, options)
        return { data: { session: session ? toBackendCompatibleSession(session) : null }, error: null }
      },
    },
  }
}

function mapBackendSession(
  session: Session,
  walletAddress: string,
): AuthSession {
  const expiresAtSeconds = session.expires_at
    ?? Math.floor(Date.now() / 1000) + session.expires_in

  return {
    exoAddress: walletAddress,
    identityId: session.identity_id,
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: expiresAtSeconds * 1000,
    metadataVersion: SESSION_METADATA_VERSION,
  }
}

function toBackendCompatibleSession(session: AuthSession): Session {
  return {
    access_token: session.accessToken,
    refresh_token: session.refreshToken,
    expires_at: Math.floor(session.expiresAt / 1000),
    expires_in: Math.max(1, Math.floor((session.expiresAt - Date.now()) / 1000)),
    identity_id: session.identityId,
  }
}

async function createVerifiedBackendSession(
  wallet: EXOWallet,
  identityId: string | null,
  options: BackendSessionVdfOptions = {},
): Promise<AuthSession | null> {
  setAdmissionPending('admitting')

  for (let attempt = 0; attempt <= MAX_ADMISSION_TRANSIENT_RETRIES; attempt += 1) {
    try {
      const session = await createVerifiedBackendSessionAttempt(wallet, identityId, options)
      if (!session) {
        setAdmissionFailure('proof_rejected', false)
      }
      return session
    } catch (error) {
      const failure = classifyAdmissionFailure(error)
      if (failure === 'cancelled') {
        logCloudAuth('walletAdmission.cancelled')
        throw error
      }
      const retryable = isRetryableAdmissionFailure(failure)
      if (isTransientAdmissionFailure(failure) && attempt < MAX_ADMISSION_TRANSIENT_RETRIES) {
        logCloudAuth('walletAdmission.retry', {
          failure,
          attempt: attempt + 1,
        })
        if (failure !== 'challenge_expired') {
          await waitForAdmissionRetry(options.signal)
        }
        continue
      }

      setAdmissionFailure(failure, retryable)
      logCloudAuth('walletAdmission.failed', {
        failure,
        retryable,
      })
      throw error
    }
  }

  return null
}

async function createVerifiedBackendSessionAttempt(
  wallet: EXOWallet,
  identityId: string | null,
  options: BackendSessionVdfOptions,
): Promise<AuthSession | null> {
  const challenge = await requestWalletAuthChallengeWithBackend(wallet.address)
  if (!challenge) {
    throw new SpectraBackendError(503, 'challenge_unavailable')
  }
  const signature = await signMessage(challenge.challenge, wallet.privateKey, {
    domain: WALLET_AUTH_SIGNATURE_DOMAIN,
  })
  const vdfChallenge = challenge.vdfChallenge
  const vdfActivity = vdfChallenge
    ? beginVdfActivity({
      action: 'wallet_admission',
      cancel: options.onVdfCancel,
      canCancel: Boolean(options.onVdfCancel),
    })
    : null
  let vdfProof: Awaited<ReturnType<typeof solveVdfOnDevice>> | undefined

  if (vdfChallenge && vdfActivity) {
    try {
      vdfProof = await solveVdfOnDevice(vdfChallenge.params, {
        challengeId: vdfChallenge.challengeId,
        nonceHex: vdfChallenge.nonceHex,
        action: 'wallet_admission',
        bindingHash: vdfChallenge.bindingHash,
      }, {
        signal: options.signal,
        onProgress: (progress) => {
          vdfActivity.progress(progress)
          options.onVdfProgress?.(progress)
        },
      })
      vdfActivity.waitForServer(vdfChallenge.notBeforeAt)
      await waitForVdfChallengeAge(
        vdfChallenge.notBeforeAt,
        options.signal,
        (notBeforeAt, retrying) => vdfActivity.waitForServer(notBeforeAt, retrying),
      )
    } catch (error) {
      finishVdfActivity(vdfActivity, error)
      throw error
    }
  }

  const verifyChallenge = () => verifyWalletAuthChallengeWithBackend({
    challenge: challenge.challenge,
    walletAddress: wallet.address,
    publicKey: wallet.publicKey,
    identityId,
    signature,
    ...(vdfChallenge
      ? {
        vdfChallengeId: vdfChallenge.challengeId,
        vdfProof,
      }
      : {}),
  })

  try {
    vdfActivity?.submit()
    const result = vdfChallenge
      ? await retryVdfSubmissionAfterServerFloor(
        verifyChallenge,
        options.signal,
        (notBeforeAt, retrying) => vdfActivity?.waitForServer(notBeforeAt, retrying),
      )
      : await verifyChallenge()
    if (!result.verified) {
      vdfActivity?.fail('proof_rejected')
      return null
    }
    vdfActivity?.complete()
    return result.session
  } catch (error) {
    if (vdfActivity) finishVdfActivity(vdfActivity, error)
    throw error
  }
}

function isSameCloudSession(
  left: AuthSession | null | undefined,
  right: AuthSession,
): boolean {
  return Boolean(
    left
      && left.exoAddress === right.exoAddress
      && left.identityId === right.identityId
      && left.accessToken === right.accessToken
      && left.refreshToken === right.refreshToken
      && left.expiresAt === right.expiresAt
      && left.metadataVersion === right.metadataVersion
  )
}

async function probeNetwork(): Promise<{
  online: boolean
  isConnected: boolean | null
  isInternetReachable: boolean | null
}> {
  const state = await NetInfo.fetch()
  const isConnected = typeof state.isConnected === 'boolean' ? state.isConnected : null
  const isInternetReachable = typeof state.isInternetReachable === 'boolean'
    ? state.isInternetReachable
    : null
  return {
    online: Boolean(state.isConnected && state.isInternetReachable !== false),
    isConnected,
    isInternetReachable,
  }
}

async function hasInternetConnection(): Promise<boolean> {
  return (await probeNetwork()).online
}

function retainPersistedIdentityId(mappedSession: AuthSession, walletAddress: string): AuthSession {
  if (mappedSession.identityId) return mappedSession
  const current = useAuthStore.getState().session
  if (
    !current?.identityId
    || !isSameAccountStorageScope(current.exoAddress, walletAddress)
  ) {
    return mappedSession
  }
  return { ...mappedSession, identityId: current.identityId }
}

async function persistCloudSession(
  session: Session,
  walletAddress: string,
  generation: number,
): Promise<AuthSession | null> {
  const mappedSession = retainPersistedIdentityId(
    mapBackendSession(session, walletAddress),
    walletAddress,
  )
  if (!canCommitRefreshedSession(walletAddress, generation)) {
    const activeWallet = useWalletStore.getState().wallet
    logCloudAuth('persistCloudSession.skipped', {
      reason: authCacheGeneration !== generation
        ? 'generation_changed'
        : activeWallet
          ? 'wallet_mismatch'
          : 'wallet_missing',
      hasActiveWallet: Boolean(activeWallet),
    })
    return null
  }

  if (!isSameCloudSession(useAuthStore.getState().session, mappedSession)) {
    await useAuthStore.getState().setSession(mappedSession)
  }
  lastBootstrapFailureAt = 0
  setAdmissionReady()
  return mappedSession
}

async function restoreStoredSession(
  wallet: EXOWallet,
  storedSession: AuthSession,
  generation: number,
): Promise<AuthSession | null> {
  logCloudAuth('restoreStoredSession.start', {
    expiresInMs: storedSession.expiresAt - Date.now(),
  })
  const authClient = createAuthClient()
  const { data, error } = await authClient.auth.setSession({
    access_token: storedSession.accessToken,
    refresh_token: storedSession.refreshToken,
  })

  if (error || !data.session) {
    if (isCurrentAuthContext(wallet.address, generation) || canCommitRefreshedSession(wallet.address, generation)) {
      lastStoredSessionRefreshInvalid = isRefreshTokenInvalid(error)
      if (error) {
        const failure = classifyAdmissionFailure(error)
        setAdmissionFailure(failure, isRetryableAdmissionFailure(failure))
      }
    }
    logCloudAuth('restoreStoredSession.finish', {
      ok: false,
      ...describeAdmissionError(error),
    })
    return null
  }

  lastStoredSessionRefreshInvalid = false
  const session = await persistCloudSession(data.session, wallet.address, generation)
  logCloudAuth('restoreStoredSession.finish', session
    ? { ok: true }
    : { ok: false, persistSkipped: 'auth_context' })
  return session
}

async function createAnonymousSession(
  wallet: EXOWallet,
  generation: number,
  options: BackendSessionVdfOptions = {},
): Promise<AuthSession | null> {
  const authClient = createAuthClient(options)
  const { data, error } = await authClient.auth.signInAnonymously()

  if (error || !data.session) {
    const failure = error ? classifyAdmissionFailure(error) : 'unknown'
    setAdmissionFailure(failure, isRetryableAdmissionFailure(failure))
    logCloudAuth('createAnonymousSession.failed', { failure })
    return null
  }

  return persistCloudSession(data.session, wallet.address, generation)
}

async function resolveDesiredIdentityId(
  wallet: EXOWallet,
  explicitIdentityId?: string | null,
): Promise<string | null> {
  if (explicitIdentityId !== undefined) {
    return normalizeIdentityId(explicitIdentityId)
  }

  const localIdentity = await loadIdentityByAddress(wallet.address).catch(() => null)
  return localIdentity?.identity.id ?? null
}

function privateIdentityBindingBundle(bundle: PublicKeyBundle): PublicKeyBundle {
  const {
    oneTimePreKeys: _oneTimePreKeys,
    ...bindingBundle
  } = bundle
  return { ...bindingBundle, oneTimePreKeys: [] }
}

type LocalIdentityBindingResult =
  | { bound: true }
  | {
    bound: false
    reason:
      | 'bundle_missing'
      | 'bundle_identity_mismatch'
      | 'bundle_invalid'
      | 'wallet_authorization_invalid'
      | 'wallet_authorization_repair_failed'
      | 'binding_rejected'
  }

async function bindLocalChatIdentity(
  wallet: EXOWallet,
  identityId: string,
  session: AuthSession,
): Promise<LocalIdentityBindingResult> {
  const bundle = await localChatStorage.getPublicKeyBundle(identityId).catch(() => null)
  if (!bundle) {
    return { bound: false, reason: 'bundle_missing' }
  }
  if (bundle.identityId !== identityId) {
    return { bound: false, reason: 'bundle_identity_mismatch' }
  }
  if (!verifyPublicKeyBundle(bundle).valid) {
    return { bound: false, reason: 'bundle_invalid' }
  }
  let authorizedBundle = bundle
  if (!bundle.walletAuthorization) {
    try {
      authorizedBundle = {
        ...bundle,
        walletAuthorization: signPublicKeyBundleWalletAuthorization(
          bundle,
          wallet.address,
          wallet.publicKey,
          wallet.privateKey,
        ),
      }
      if (!verifyPublicKeyBundleWalletAuthorization(authorizedBundle, wallet.address).valid) {
        return { bound: false, reason: 'wallet_authorization_repair_failed' }
      }
      await localChatStorage.storePublicKeyBundle(identityId, authorizedBundle)
    } catch {
      return { bound: false, reason: 'wallet_authorization_repair_failed' }
    }
  } else if (
    !isSameAccountStorageScope(
      bundle.walletAuthorization.payload.walletAddress,
      wallet.address,
    )
    || !verifyPublicKeyBundleWalletAuthorization(bundle, wallet.address).valid
  ) {
    return { bound: false, reason: 'wallet_authorization_invalid' }
  }

  const bound = await bindPrivateChatIdentityWithBackend({
    identityId,
    walletAddress: wallet.address,
    recipientMailboxToken: deriveRecipientMailboxToken(authorizedBundle),
    bundle: privateIdentityBindingBundle(authorizedBundle),
  }, { accessToken: session.accessToken })
  return bound ? { bound: true } : { bound: false, reason: 'binding_rejected' }
}

async function ensureWalletBinding(
  wallet: EXOWallet,
  session: AuthSession,
  generation: number,
  options?: BackendSessionVdfOptions & { identityId?: string | null; force?: boolean },
): Promise<boolean> {
  if (options?.signal?.aborted) {
    return false
  }

  logCloudAuth('ensureWalletBinding.start', {
    hasRequestedIdentity: Boolean(options?.identityId),
    isCloudAuthVerified: useAuthStore.getState().isCloudAuthVerified,
    ...describeSession(session),
  })

  const bindingRequestKey = `${generation}:${wallet.address}:${getVerifiedAccessRequestKey(options?.identityId)}`
  const existingBindingPromise = bindingPromises.get(bindingRequestKey)
  if (existingBindingPromise) {
    logCloudAuth('ensureWalletBinding.reusePromise', {
      hasRequestedIdentity: Boolean(options?.identityId),
    })
    return existingBindingPromise
  }

  if (
    !options?.force &&
    lastBindingFailureAt > 0 &&
    Date.now() - lastBindingFailureAt < BACKEND_BINDING_RETRY_COOLDOWN_MS
  ) {
    logCloudAuth('ensureWalletBinding.cooldown', {
      hasRequestedIdentity: Boolean(options?.identityId),
      retryInMs: BACKEND_BINDING_RETRY_COOLDOWN_MS - (Date.now() - lastBindingFailureAt),
    })
    return false
  }

  const bindingPromise = (async () => {
    try {
      if (!isCurrentAuthContext(wallet.address, generation)) {
        return false
      }

      const desiredIdentityId = await resolveDesiredIdentityId(wallet, options?.identityId)
      if (!isCurrentAuthContext(wallet.address, generation) || options?.signal?.aborted) {
        return false
      }
      if (!desiredIdentityId) {
        lastBindingFailureAt = 0
        if (normalizeIdentityId(session.identityId)) {
          logCloudAuth('ensureWalletBinding.identityUnavailable', {
            hasRequestedIdentity: Boolean(options?.identityId),
          })
          return false
        }
        markWalletVerificationState(wallet.address, {
          exactIdentityBound: false,
        })
        setAdmissionReady()
        return true
      }

      const cachedBindingAgeMs = lastBindingSuccessAt > 0
        ? Date.now() - lastBindingSuccessAt
        : null
      if (
        !options?.force &&
        (
          hasFreshExactIdentityBinding(wallet.address, desiredIdentityId, session)
          || hasPersistedExactIdentityBinding(wallet.address, desiredIdentityId, session)
        )
      ) {
        useAuthStore.getState().setCloudAuthVerified(true)
        useAuthStore.getState().setIdentityBound(true)
        lastBindingFailureAt = 0
        lastBindingSuccessAt = Date.now()
        lastBoundWalletAddress = wallet.address
        lastBoundIdentityId = desiredIdentityId
        setAdmissionReady()
        logCloudAuth('ensureWalletBinding.skipCachedSuccess', {
          hasRequestedIdentity: Boolean(options?.identityId),
          hasDesiredIdentity: Boolean(desiredIdentityId),
          lastBindingAgeMs: cachedBindingAgeMs,
        })
        return true
      }

      const hasInternet = await hasInternetConnection()
      if (options?.signal?.aborted) {
        return false
      }
      if (!hasInternet) {
        lastBindingFailureAt = Date.now()
        setAdmissionFailure('connectivity', true)
        logCloudAuth('ensureWalletBinding.noInternet', {
          hasDesiredIdentity: Boolean(desiredIdentityId),
        })
        return false
      }

      setAdmissionPending('binding')
      const privateIdentityBinding = await bindLocalChatIdentity(
        wallet,
        desiredIdentityId,
        session,
      )
      if (!isCurrentAuthContext(wallet.address, generation)) {
        return false
      }
      if (options?.signal?.aborted) {
        markAdmissionCancelled()
        return false
      }
      if (!privateIdentityBinding.bound) {
        lastBindingFailureAt = Date.now()
        const definiteBindingFailure =
          privateIdentityBinding.reason === 'binding_rejected'
          || privateIdentityBinding.reason === 'bundle_identity_mismatch'
          || privateIdentityBinding.reason === 'bundle_invalid'
          || privateIdentityBinding.reason === 'wallet_authorization_invalid'
        if (definiteBindingFailure) {
          markWalletVerificationState(wallet.address, {
            identityId: desiredIdentityId,
            exactIdentityBound: false,
          })
        }
        setAdmissionFailure('identity_binding', !definiteBindingFailure)
        logCloudAuth('ensureWalletBinding.privateBindingFailed', {
          hasDesiredIdentity: Boolean(desiredIdentityId),
          reason: privateIdentityBinding.reason,
        })
        return false
      }

      if (session.identityId === desiredIdentityId) {
        markWalletVerificationState(wallet.address, {
          identityId: desiredIdentityId,
          exactIdentityBound: true,
          cacheExactBinding: true,
        })
        setAdmissionReady()
        logCloudAuth('ensureWalletBinding.privateBindingConfirmed', {
          hasDesiredIdentity: Boolean(desiredIdentityId),
        })
        return true
      }

      const reboundSession = await createVerifiedBackendSession(wallet, desiredIdentityId, options)
      if (!isCurrentAuthContext(wallet.address, generation)) {
        return false
      }
      if (options?.signal?.aborted) {
        markAdmissionCancelled()
        return false
      }
      if (!reboundSession || reboundSession.identityId !== desiredIdentityId) {
        lastBindingFailureAt = Date.now()
        const failure = lastBackendAdmissionOutcome.failure ?? 'identity_binding'
        if (!isTransientBindingFailure(failure)) {
          markWalletVerificationState(wallet.address, {
            identityId: desiredIdentityId,
            exactIdentityBound: false,
          })
        }
        setAdmissionFailure(failure, isRetryableAdmissionFailure(failure))
        logCloudAuth('ensureWalletBinding.reverificationFailed', {
          hasDesiredIdentity: Boolean(desiredIdentityId),
          failure,
        })
        return false
      }

      if (!isSameCloudSession(useAuthStore.getState().session, reboundSession)) {
        await useAuthStore.getState().setSession(reboundSession)
      }
      markWalletVerificationState(wallet.address, {
        identityId: desiredIdentityId,
        exactIdentityBound: true,
        cacheExactBinding: true,
      })
      setAdmissionReady()
      logCloudAuth('ensureWalletBinding.finish', {
        hasDesiredIdentity: Boolean(desiredIdentityId),
      })
      return true
    } catch (error) {
      const failure = classifyAdmissionFailure(error)
      if (failure === 'cancelled') {
        if (isCurrentAuthContext(wallet.address, generation)) {
          markAdmissionCancelled()
        }
        logCloudAuth('ensureWalletBinding.cancelled', {
          hasRequestedIdentity: Boolean(options?.identityId),
        })
        return false
      }
      if (isCurrentAuthContext(wallet.address, generation)) {
        lastBindingFailureAt = Date.now()
        if (!isTransientBindingFailure(failure)) {
          markWalletVerificationState(wallet.address, {
            identityId: options?.identityId,
            exactIdentityBound: false,
          })
        }
      }
      const admissionFailure = failure === 'unknown' ? 'identity_binding' : failure
      setAdmissionFailure(
        admissionFailure,
        isRetryableAdmissionFailure(admissionFailure),
      )
      logCloudAuth('ensureWalletBinding.exception', {
        hasRequestedIdentity: Boolean(options?.identityId),
        failure,
      })
      return false
    } finally {
      bindingPromises.delete(bindingRequestKey)
    }
  })()
  bindingPromises.set(bindingRequestKey, bindingPromise)

  return bindingPromise
}

export function getCachedBackendAccessToken(): string | null {
  const authState = useAuthStore.getState()
  const activeWallet = useWalletStore.getState().wallet
  return authState.isCloudAuthVerified
    && isSessionFresh(authState.session)
    && activeWallet
    && isSameAccountStorageScope(authState.session.exoAddress, activeWallet.address)
    ? authState.session.accessToken
    : null
}

export function hasVerifiedBackendAccess(): boolean {
  const { enabled, status } = useTorStore.getState()
  const authState = useAuthStore.getState()
  const activeWallet = useWalletStore.getState().wallet

  if (enabled && status !== 'connected' && status !== 'connecting') {
    logVerifiedAccessState({
      result: false,
      reason: 'tor_blocked',
      torEnabled: enabled,
      torStatus: status,
      isCloudAuthVerified: authState.isCloudAuthVerified,
      ...describeSession(authState.session),
    })
    return false
  }

  const result = Boolean(
    authState.isCloudAuthVerified
      && isSessionFresh(authState.session)
      && activeWallet
      && isSameAccountStorageScope(authState.session.exoAddress, activeWallet.address),
  )
  logVerifiedAccessState({
    result,
    reason: result ? 'verified' : 'stale_or_unverified',
    torEnabled: enabled,
    torStatus: status,
    isCloudAuthVerified: authState.isCloudAuthVerified,
    ...describeSession(authState.session),
  })
  return result
}

export function hasBoundBackendAccessForIdentity(identityId?: string | null): boolean {
  const normalizedIdentityId = normalizeIdentityId(identityId)
  const authState = useAuthStore.getState()
  const { enabled, status } = useTorStore.getState()
  const activeWallet = useWalletStore.getState().wallet

  if (!normalizedIdentityId) {
    logBoundBackendAccessState({
      hasRequestedIdentity: false,
      result: false,
      reason: 'missing_identity',
    })
    return false
  }

  if (enabled && status !== 'connected' && status !== 'connecting') {
    logBoundBackendAccessState({
      hasRequestedIdentity: true,
      result: false,
      reason: 'tor_blocked',
      torEnabled: enabled,
      torStatus: status,
      isCloudAuthVerified: authState.isCloudAuthVerified,
      isIdentityBound: authState.isIdentityBound,
      ...describeSession(authState.session),
    })
    return false
  }

  const result = Boolean(
    authState.isCloudAuthVerified
      && authState.isIdentityBound
      && isSessionFresh(authState.session)
      && activeWallet
      && isSameAccountStorageScope(authState.session.exoAddress, activeWallet.address)
      && authState.session.identityId === normalizedIdentityId
      && authState.session?.exoAddress === lastBoundWalletAddress
      && lastBoundIdentityId === normalizedIdentityId
  )

  logBoundBackendAccessState({
    hasRequestedIdentity: true,
    result,
    reason: result ? 'identity_bound' : 'identity_unbound',
    torEnabled: enabled,
    torStatus: status,
    isCloudAuthVerified: authState.isCloudAuthVerified,
    isIdentityBound: authState.isIdentityBound,
    hasCachedBoundIdentity: Boolean(lastBoundIdentityId),
    ...describeSession(authState.session),
  })

  return result
}

export async function ensureBackendSession(
  options: BackendSessionVdfOptions = {},
): Promise<AuthSession | null> {
  if (!canUseLocalCloudBootstrap()) {
    logCloudAuth('ensureBackendSession.blocked', {
      reason: 'not_ready',
      ...bootstrapReadiness(),
    })
    return null
  }

  const generation = authCacheGeneration
  const wallet = useWalletStore.getState().wallet
  if (!wallet) {
    logCloudAuth('ensureBackendSession.blocked', {
      reason: 'not_ready',
      ...bootstrapReadiness(),
    })
    return null
  }

  const storedSession = useAuthStore.getState().session
  if (storedSession && storedSession.exoAddress !== wallet.address) {
    await useAuthStore.getState().clearCloudSession()
  } else if (isSessionFresh(storedSession)) {
    rehydratePersistedBoundIdentityCache(storedSession.identityId)
    if (lastBackendAdmissionOutcome.failure !== 'identity_binding') {
      setAdmissionReady()
    }
    return storedSession
  }

  if (bootstrapPromise) {
    return bootstrapPromise
  }

  if (lastBootstrapFailureAt > 0 && Date.now() - lastBootstrapFailureAt < BOOTSTRAP_RETRY_COOLDOWN_MS) {
    logCloudAuth('ensureBackendSession.blocked', {
      reason: 'cooldown',
      ...bootstrapReadiness(),
    })
    return null
  }

  let promise: Promise<AuthSession | null> | null = null
  promise = (async () => {
    try {
      if (!isCurrentAuthContext(wallet.address, generation)) {
        return null
      }

      const network = await probeNetwork()
      const latestStoredSession = useAuthStore.getState().session
      const canRestoreStoredSession = Boolean(
        latestStoredSession?.refreshToken
        && latestStoredSession.exoAddress === wallet.address
      )

      const blockOffline = () => {
        setAdmissionFailure('connectivity', true)
        logCloudAuth('ensureBackendSession.blocked', {
          reason: 'no_internet',
          isConnected: network.isConnected,
          isInternetReachable: network.isInternetReachable,
          ...bootstrapReadiness(),
        })
        return null
      }

      if (!network.online && !canRestoreStoredSession) {
        if (!isCurrentAuthContext(wallet.address, generation)) {
          return null
        }
        return blockOffline()
      }

      if (canRestoreStoredSession && latestStoredSession) {
        lastStoredSessionRefreshInvalid = false
        const restoredSession = await restoreStoredSession(wallet, latestStoredSession, generation)
        if (restoredSession) {
          return restoredSession
        }
        const retainedSession = useAuthStore.getState().session
        if (
          retainedSession
          && retainedSession.exoAddress === wallet.address
          && !lastStoredSessionRefreshInvalid
        ) {
          if (isSessionFresh(retainedSession)) {
            return retainedSession
          }
          if (!network.online) {
            return blockOffline()
          }
          setAdmissionFailure('connectivity', true)
          return null
        }
      }

      if (!network.online) {
        if (!isCurrentAuthContext(wallet.address, generation)) {
          return null
        }
        return blockOffline()
      }

      const anonymousSession = await createAnonymousSession(wallet, generation, options)
      if (!anonymousSession) {
        if (!isCurrentAuthContext(wallet.address, generation)) {
          return null
        }
        lastBootstrapFailureAt = Date.now()
      }
      return anonymousSession
    } catch (error) {
      if (!isCurrentAuthContext(wallet.address, generation)) return null
      if (isAbortError(error)) {
        markAdmissionCancelled()
        logCloudAuth('ensureBackendSession.cancelled')
        return null
      }
      lastBootstrapFailureAt = Date.now()
      const failure = classifyAdmissionFailure(error)
      setAdmissionFailure(failure, isRetryableAdmissionFailure(failure))
      logCloudAuth('ensureBackendSession.failed', {
        failure,
      })
      return null
    } finally {
      if (bootstrapPromise === promise) {
        bootstrapPromise = null
      }
    }
  })()
  bootstrapPromise = promise

  return promise
}

export async function ensureVerifiedBackendAccess(
  options: BackendSessionVdfOptions = {},
): Promise<AuthSession | null> {
  return ensureVerifiedBackendAccessForIdentity(undefined, options)
}

export async function ensureVerifiedBackendAccessForIdentity(
  identityId?: string | null,
  options: BackendSessionVdfOptions = {},
): Promise<AuthSession | null> {
  const generation = authCacheGeneration
  const requestKey = getVerifiedAccessRequestKey(identityId)
  const existingPromise = verifiedAccessPromises.get(requestKey)
  if (existingPromise) {
    logCloudAuth('ensureVerifiedBackendAccess.reusePromise', {
      hasRequestedIdentity: Boolean(identityId),
    })
    return existingPromise
  }

  const promise = (async () => {
    logCloudAuth('ensureVerifiedBackendAccess.start', {
      hasRequestedIdentity: Boolean(identityId),
    })

    const session = await ensureBackendSession(options)
    if (!isSessionFresh(session)) {
      const activeWallet = useWalletStore.getState().wallet
      if (activeWallet && !isCurrentAuthContext(activeWallet.address, generation)) {
        return null
      }
      if (shouldUnbindOnMissingSession()) {
        markWalletVerificationUnavailable()
      }
      logCloudAuth('ensureVerifiedBackendAccess.noFreshSession', {
        hasRequestedIdentity: Boolean(identityId),
        ...describeSession(session),
      })
      return null
    }

    const wallet = useWalletStore.getState().wallet
    if (!wallet || session.exoAddress !== wallet.address) {
      if (wallet && isCurrentAuthContext(wallet.address, generation)) {
        markWalletVerificationUnavailable()
      }
      logCloudAuth('ensureVerifiedBackendAccess.walletMismatch', {
        hasRequestedIdentity: Boolean(identityId),
        hasActiveWallet: Boolean(wallet),
      })
      return null
    }

    if (!isCurrentAuthContext(wallet.address, generation)) {
      return null
    }

    if (identityId === undefined) {
      const preservesExactBinding = hasCachedExactIdentityBindingForSession(wallet.address, session)
      useAuthStore.getState().setCloudAuthVerified(true)
      useAuthStore.getState().setIdentityBound(preservesExactBinding)
      if (preservesExactBinding) {
        setAdmissionReady()
      } else if (lastBackendAdmissionOutcome.failure !== 'identity_binding') {
        setAdmissionReady()
      }
      return useAuthStore.getState().session
    }

    const verified = await ensureWalletBinding(wallet, session, generation, { identityId, ...options })
    if (!isCurrentAuthContext(wallet.address, generation)) {
      return null
    }
    const verifiedSession = verified ? useAuthStore.getState().session : null
    logCloudAuth('ensureVerifiedBackendAccess.finish', {
      hasRequestedIdentity: Boolean(identityId),
      verified,
      ...describeSession(verifiedSession),
    })
    return verifiedSession
  })()
  verifiedAccessPromises.set(requestKey, promise)

  try {
    return await promise
  } finally {
    verifiedAccessPromises.delete(requestKey)
  }
}

export async function ensureBoundBackendAccessForIdentity(
  identityId?: string | null,
): Promise<AuthSession | null> {
  const normalizedIdentityId = normalizeIdentityId(identityId)
  const session = await ensureVerifiedBackendAccessForIdentity(normalizedIdentityId)
  if (!isSessionFresh(session) || !normalizedIdentityId) {
    return null
  }

  return hasBoundBackendAccessForIdentity(normalizedIdentityId) ? session : null
}

export async function recoverBoundSessionOnForeground(
  identityId?: string | null,
): Promise<AuthSession | null> {
  if (!canUseLocalCloudBootstrap()) {
    logCloudAuth('recoverBoundSessionOnForeground.blocked', {
      reason: 'not_ready',
      ...bootstrapReadiness(),
    })
    return null
  }
  if (foregroundRecoveryPromise) {
    return foregroundRecoveryPromise
  }

  const promise = (async () => {
    lastBootstrapFailureAt = 0
    lastBindingFailureAt = 0
    lastStoredSessionRefreshInvalid = false

    const normalizedIdentityId = normalizeIdentityId(identityId)
    const rehydrated = rehydratePersistedBoundIdentityCache(normalizedIdentityId)
    const storedSession = useAuthStore.getState().session
    if (rehydrated && isSessionFresh(storedSession)) {
      useAuthStore.getState().setSessionExpired(false)
      return storedSession
    }

    const { enabled, status } = useTorStore.getState()
    if (enabled && status !== 'connected') {
      return null
    }

    const refreshBoundSession = async (): Promise<AuthSession | null> => {
      lastBootstrapFailureAt = 0
      lastBindingFailureAt = 0
      const session = await ensureVerifiedBackendAccessForIdentity(normalizedIdentityId)
      if (isSessionFresh(session)) {
        useAuthStore.getState().setSessionExpired(false)
        return session
      }
      return null
    }

    const session = await refreshBoundSession()
    if (session || lastBackendAdmissionOutcome.failure !== 'connectivity') {
      if (!session && !useAuthStore.getState().session) {
        lastBootstrapFailureAt = 0
      }
      return session
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, ADMISSION_TRANSIENT_RETRY_DELAY_MS)
    })
    if (!canUseLocalCloudBootstrap()) {
      return null
    }
    const retried = await refreshBoundSession()
    if (!retried && !useAuthStore.getState().session) {
      lastBootstrapFailureAt = 0
    }
    return retried
  })()

  foregroundRecoveryPromise = promise
  try {
    return await promise
  } finally {
    if (foregroundRecoveryPromise === promise) {
      foregroundRecoveryPromise = null
    }
  }
}

export async function bootstrapBackendCloudSession(): Promise<boolean> {
  const session = await ensureVerifiedBackendAccess()
  return isSessionFresh(session)
}

export async function bindVerifiedBackendIdentity(identityId: string | null): Promise<boolean> {
  const session = await ensureBoundBackendAccessForIdentity(identityId)
  return isSessionFresh(session)
}

export async function repairBackendIdentityBinding(
  identityId?: string | null,
  options: BackendSessionVdfOptions = {},
): Promise<AuthSession | null> {
  if (options.signal?.aborted) return null

  const generation = authCacheGeneration
  const wallet = useWalletStore.getState().wallet
  if (!wallet) return null

  lastBootstrapFailureAt = 0
  lastBindingFailureAt = 0
  const session = await ensureBackendSession(options)
  if (!isSessionFresh(session) || !isCurrentAuthContext(wallet.address, generation)) {
    return null
  }
  const verified = await ensureWalletBinding(wallet, session, generation, {
    ...options,
    identityId,
    force: true,
  })
  if (!verified) {
    const outcome = lastBackendAdmissionOutcome
    if (outcome.failure === 'identity_binding' && !outcome.retryable) {
      useAuthStore.getState().setIdentityBound(false)
    }
    return null
  }
  return useAuthStore.getState().session
}

export async function getValidBackendAccessToken(): Promise<string | null> {
  const cachedAccessToken = getCachedBackendAccessToken()
  if (cachedAccessToken) return cachedAccessToken

  const session = await ensureVerifiedBackendAccess()
  return isSessionFresh(session) ? session.accessToken : null
}

registerBackendIdentityRecovery(async () => {
  const session = await repairBackendIdentityBinding()
  return isSessionFresh(session) ? session.accessToken : null
})
