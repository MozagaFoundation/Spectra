/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type {
  FetchBundleResult,
  ContactCardProfileCapsule,
  HybridPreKey,
  OutboundSealedControlRecord,
  OutboundSealedRelayRecord,
  PublicKeyBundle,
  PublishBundleResult,
  RelayStatusQuery,
  RelayStatusUpdate,
  SealedRelayedMessage,
  TelemetryConfig,
} from '../types/index'
import { deriveRecipientMailboxToken } from '../crypto/sealedEnvelope'
import { verifyPublicKeyBundleWalletAuthorization } from '../crypto/walletAuthorization'
import { verifyPublicKeyBundle } from '../crypto/x3dh'
import { BundleServerRequestError, type BundleServer } from './index'

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
type RequestTimeoutSource = number | (() => number | undefined)
type BundleFetchResponse = {
  bundle?: PublicKeyBundle
  allocatedOPK?: HybridPreKey
  allocatedOPKId?: number
  profileCapsule?: ContactCardProfileCapsule
}

const MAX_RETRY_AFTER_MS = 15 * 60 * 1_000
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000

function parseRetryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  const delayMs = Number.isFinite(seconds)
    ? seconds * 1_000
    : Date.parse(value) - Date.now()
  if (!Number.isFinite(delayMs) || delayMs <= 0) return undefined
  return Math.min(Math.ceil(delayMs), MAX_RETRY_AFTER_MS)
}

function isIdentityBindingError(error: unknown): boolean {
  if (!(error instanceof BundleServerRequestError) || error.statusCode !== 403) return false
  try {
    return (JSON.parse(error.message) as { error?: unknown }).error ===
      'identity_binding_required'
  } catch {
    return false
  }
}

function validateFetchedBundle(
  result: BundleFetchResponse,
  expectedIdentityId?: string,
  expectedWalletAddress?: string,
): FetchBundleResult {
  if (!result.bundle) return { bundle: null, error: 'Bundle not found' }
  if (expectedIdentityId && result.bundle.identityId !== expectedIdentityId) {
    return { bundle: null, error: 'Bundle identity does not match requested identity' }
  }
  const hasAllocatedOPK = result.allocatedOPK !== undefined
  const hasAllocatedOPKId = Number.isInteger(result.allocatedOPKId) && (result.allocatedOPKId ?? -1) >= 0
  if (hasAllocatedOPK !== hasAllocatedOPKId ||
    (result.allocatedOPK && result.allocatedOPK.id !== result.allocatedOPKId)) {
    return { bundle: null, error: 'Allocated one-time pre-key metadata is inconsistent' }
  }
  const bundle = {
    ...result.bundle,
    oneTimePreKeys: result.allocatedOPK ? [result.allocatedOPK] : [],
  }
  const verification = verifyPublicKeyBundle(bundle)
  if (!verification.valid) {
    return { bundle: null, error: verification.error }
  }
  const walletAuthorization = verifyPublicKeyBundleWalletAuthorization(bundle, expectedWalletAddress)
  if (!walletAuthorization.valid) {
    return { bundle: null, error: walletAuthorization.error }
  }
  return {
    bundle,
    allocatedOPKId: result.allocatedOPKId,
    ...(result.profileCapsule ? { profileCapsule: result.profileCapsule } : {}),
  }
}

export class BackendBundleServer implements BundleServer {
  private accessToken: string | null = null
  private tokenGetter: (() => string | null) | null = null
  private identityRecoveryHandler: (() => Promise<string | null>) | null = null
  private telemetry?: TelemetryConfig
  private readonly requestTimeoutSource: RequestTimeoutSource

  constructor(
    private readonly baseUrl: string,
    customFetch: FetchFn,
    requestTimeoutMs: RequestTimeoutSource = DEFAULT_REQUEST_TIMEOUT_MS,
  ) {
    this.fetchFn = customFetch
    this.requestTimeoutSource = requestTimeoutMs
  }

  private readonly fetchFn: FetchFn

  isAvailable(): boolean {
    return this.baseUrl.trim().length > 0
  }

  setAccessToken(token: string | null): void {
    this.accessToken = token
  }

  setTokenGetter(getter: (() => string | null) | null): void {
    this.tokenGetter = getter
  }

  setIdentityRecoveryHandler(handler: (() => Promise<string | null>) | null): void {
    this.identityRecoveryHandler = handler
  }

  setTelemetry(telemetry: TelemetryConfig | undefined): void {
    this.telemetry = telemetry
  }

  private getAccessToken(): string {
    const token = this.tokenGetter?.() || this.accessToken
    if (!token) throw new Error('Backend bundle server requires an access token')
    return token
  }

  private getRequestTimeoutMs(): number {
    const configured = typeof this.requestTimeoutSource === 'function'
      ? this.requestTimeoutSource()
      : this.requestTimeoutSource
    return typeof configured === 'number' && Number.isFinite(configured) && configured > 0
      ? configured
      : DEFAULT_REQUEST_TIMEOUT_MS
  }

  private async request<T>(
    path: string,
    method: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    try {
      return await this.requestOnce<T>(path, method, body, signal)
    } catch (error) {
      if (!this.identityRecoveryHandler || !isIdentityBindingError(error)) throw error
      const accessToken = await this.identityRecoveryHandler()
      if (!accessToken) throw error
      this.accessToken = accessToken
      return this.requestOnce<T>(path, method, body, signal)
    }
  }

  private async requestOnce<T>(
    path: string,
    method: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    let response: Response
    let text: string
    const abortController = new AbortController()
    let deadlineTimer: ReturnType<typeof setTimeout> | null = null
    let timedOut = false
    let rejectCancellation!: (error: Error) => void
    const cancellation = new Promise<never>((_, reject) => {
      rejectCancellation = reject
    })
    const abortFromCaller = () => {
      abortController.abort()
      rejectCancellation(new Error('request_cancelled'))
    }
    signal?.addEventListener('abort', abortFromCaller, { once: true })
    if (signal?.aborted) abortFromCaller()
    try {
      const request = (async () => {
        const nextResponse = await this.fetchFn(`${this.baseUrl.replace(/\/+$/, '')}${path}`, {
          method,
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${this.getAccessToken()}`,
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          signal: abortController.signal,
        })
        return {
          response: nextResponse,
          text: await nextResponse.text(),
        }
      })()
      const deadline = new Promise<never>((_, reject) => {
        deadlineTimer = setTimeout(() => {
          timedOut = true
          abortController.abort()
          reject(new Error('request_timeout'))
        }, this.getRequestTimeoutMs())
      })
      ;({ response, text } = await Promise.race([request, deadline, cancellation]))
    } catch (error) {
      throw new BundleServerRequestError(
        timedOut
          ? 'Backend bundle request timed out'
          : signal?.aborted
            ? 'Backend bundle request cancelled'
          : 'Backend bundle request failed',
        {
          reason: 'network',
          transient: true,
          cause: error,
        },
      )
    } finally {
      if (deadlineTimer) clearTimeout(deadlineTimer)
      signal?.removeEventListener('abort', abortFromCaller)
    }
    if (!response.ok) {
      const recipientUnavailable = response.status === 410
        && (() => {
          try {
            return (JSON.parse(text) as { error?: unknown }).error === 'recipient_unavailable'
          } catch {
            return false
          }
        })()
      const reason = response.status === 429
        ? 'rate_limited'
        : recipientUnavailable
          ? 'recipient_unavailable'
        : response.status === 401 || response.status === 403
          ? 'unauthorized'
          : response.status >= 400 && response.status < 500
            ? 'rejected'
            : 'unknown'
      throw new BundleServerRequestError(text || `Backend bundle request failed: ${response.status}`, {
        reason,
        statusCode: response.status,
        transient: response.status === 429 || response.status >= 500,
        retryAfterMs: response.status === 429
          ? parseRetryAfterMs(response.headers.get('Retry-After'))
          : undefined,
      })
    }
    return (text ? JSON.parse(text) : null) as T
  }

  async publishBundle(identityId: string, bundle: PublicKeyBundle, walletAddress?: string): Promise<PublishBundleResult> {
    if (walletAddress) {
      const walletAuthorization = verifyPublicKeyBundleWalletAuthorization(bundle, walletAddress)
      if (!walletAuthorization.valid) {
        return { success: false, error: walletAuthorization.error }
      }
    }
    const verification = verifyPublicKeyBundle(bundle)
    if (!verification.valid) {
      return { success: false, error: verification.error }
    }
    const recipientMailboxToken = deriveRecipientMailboxToken(bundle)
    await this.request('/v1/chat/bundles', 'POST', {
      identityId,
      walletAddress: walletAddress ?? null,
      recipientMailboxToken,
      bundle,
    })
    return { success: true, opkCount: await this.getOPKCount(identityId) }
  }

  async fetchBundle(
    identityId: string,
    requestorId: string,
    inviteCapability: string,
    signal?: AbortSignal,
  ): Promise<FetchBundleResult> {
    if (!inviteCapability) {
      return { bundle: null, error: 'Contact invitation is required' }
    }
    const query = new URLSearchParams({
      requestorId,
      inviteCapability,
    })
    const result = await this.request<BundleFetchResponse>(
      `/v1/chat/bundles/${encodeURIComponent(identityId)}?${query.toString()}`,
      'GET',
      undefined,
      signal,
    )
    return validateFetchedBundle(result, identityId)
  }

  async fetchDiscoverableBundle(
    walletAddress: string,
    requestorId: string,
    signal?: AbortSignal,
  ): Promise<FetchBundleResult> {
    const query = new URLSearchParams({ requestorId })
    const result = await this.request<BundleFetchResponse>(
      `/v1/chat/discovery/bundles/${encodeURIComponent(walletAddress)}?${query.toString()}`,
      'GET',
      undefined,
      signal,
    )
    return validateFetchedBundle(result, undefined, walletAddress)
  }

  async fetchOneTimeContactCard(
    cardId: string,
    cardCapability: string,
    signal?: AbortSignal,
  ): Promise<FetchBundleResult> {
    if (!/^scc1\.[0-9a-f]{32}$/.test(cardId) || !/^sccap1\.[A-Za-z0-9_-]{43}$/.test(cardCapability)) {
      return { bundle: null, error: 'Invalid one-time contact card' }
    }
    const result = await this.request<BundleFetchResponse>(
      `/v1/chat/contact-cards/${encodeURIComponent(cardId)}/redeem`,
      'POST',
      { capability: cardCapability },
      signal,
    )
    return validateFetchedBundle(result)
  }

  async getOPKCount(identityId: string): Promise<number> {
    const result = await this.request<{ count: number }>(`/v1/chat/bundles/${encodeURIComponent(identityId)}/opk-count`, 'GET')
    return result.count
  }

  async replenishOPKs(identityId: string, newOPKs: HybridPreKey[]): Promise<number> {
    const result = await this.request<{ availableCount: number }>(`/v1/chat/bundles/${encodeURIComponent(identityId)}/opks`, 'POST', {
      opks: newOPKs,
    })
    return result.availableCount
  }

  async updateSignedPreKey(identityId: string, bundle: PublicKeyBundle): Promise<void> {
    const recipientMailboxToken = deriveRecipientMailboxToken(bundle)
    await this.request(`/v1/chat/bundles/${encodeURIComponent(identityId)}/signed-prekey`, 'PUT', {
      identityId,
      recipientMailboxToken,
      bundle,
      walletAddress: bundle.walletAuthorization?.payload.walletAddress ?? null,
    })
  }

  async bundleExistsOnServer(identityId: string): Promise<boolean> {
    const result = await this.request<{ exists: boolean }>(`/v1/chat/bundles/${encodeURIComponent(identityId)}/exists`, 'GET')
    return result.exists
  }

  async sendSealedMessage(record: OutboundSealedRelayRecord): Promise<SealedRelayedMessage> {
    const accepted = await this.request<{
      id: string
      status: SealedRelayedMessage['status']
      serverSequence: number
      createdAt: number
      expiresAt: number
    }>('/v1/chat/sealed/messages', 'POST', record)
    return {
      ...accepted,
      recipientMailboxToken: record.recipientMailboxToken,
      ...(record.deliveryToken ? { deliveryToken: record.deliveryToken } : {}),
      deliveryClass: record.deliveryClass,
      sealedEnvelope: record.sealedEnvelope,
    }
  }

  async registerMailboxScope(recipientMailboxToken: string): Promise<void> {
    await this.request('/v1/chat/sealed/mailboxes', 'POST', { mailboxTokens: [recipientMailboxToken] })
  }

  async listRegisteredMailboxTokens(): Promise<string[]> {
    const result = await this.request<{ mailboxTokens: string[] }>('/v1/chat/sealed/mailboxes', 'GET')
    return result.mailboxTokens ?? []
  }

  async fetchOwnedSealedMessages(
    afterSequence?: number,
    signal?: AbortSignal,
  ): Promise<SealedRelayedMessage[]> {
    const query = new URLSearchParams({ deliveryClass: 'message' })
    if (afterSequence !== undefined && afterSequence > 0) query.set('afterSequence', String(afterSequence))
    const result = await this.request<{ messages: SealedRelayedMessage[] }>(
      `/v1/chat/sealed/messages?${query.toString()}`,
      'GET',
      undefined,
      signal,
    )
    return result.messages ?? []
  }

  async markDelivered(messageId: string): Promise<void> {
    await this.request('/v1/chat/sealed/messages/delivered', 'POST', { messageId })
  }

  async markRead(messageId: string): Promise<void> {
    await this.request('/v1/chat/sealed/messages/read', 'POST', { messageId })
  }

  async deleteMessage(messageId: string): Promise<number> {
    return this.deleteMessages([messageId])
  }

  async deleteMessages(messageIds: string[]): Promise<number> {
    if (messageIds.length === 0) return 0
    const result = await this.request<{ deletedCount?: number }>('/v1/chat/sealed/messages/delete', 'POST', { messageIds })
    const deletedCount = result.deletedCount
    if (typeof deletedCount !== 'number' || !Number.isSafeInteger(deletedCount) || deletedCount < 0) {
      throw new Error('relay_delete_count_invalid')
    }
    return deletedCount
  }

  async vacuumOwnedSealedMessages(
    beforeSequence: number,
    statuses: Array<'delivered' | 'read'> = ['read'],
  ): Promise<number> {
    if (!Number.isSafeInteger(beforeSequence) || beforeSequence <= 0) return 0
    const result = await this.request<{ deletedCount?: number }>(
      '/v1/chat/sealed/messages/vacuum',
      'POST',
      { beforeSequence, statuses },
    )
    const deletedCount = result.deletedCount
    if (typeof deletedCount !== 'number' || !Number.isSafeInteger(deletedCount) || deletedCount < 0) {
      throw new Error('relay_vacuum_count_invalid')
    }
    return deletedCount
  }

  async fetchMessageStatuses(messages: RelayStatusQuery[]): Promise<RelayStatusUpdate[]> {
    const result = await this.request<{ receipts: RelayStatusUpdate[] }>('/v1/chat/sealed/receipts', 'POST', { messages })
    return result.receipts ?? []
  }

  async sendSealedControlMessage(record: OutboundSealedControlRecord): Promise<void> {
    await this.request('/v1/chat/sealed/messages', 'POST', record)
  }

  async fetchOwnedSealedControlMessages(): Promise<SealedRelayedMessage[]> {
    const query = new URLSearchParams({ deliveryClass: 'control' })
    const result = await this.request<{ messages: SealedRelayedMessage[] }>(`/v1/chat/sealed/messages?${query.toString()}`, 'GET')
    return result.messages ?? []
  }

}
