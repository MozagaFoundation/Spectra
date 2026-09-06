/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

/**
 * Bundle Server Interface
 * 
 * Provides server-side bundle management for atomic OPK consumption
 * and message relay functionality.
 * 
 * This abstraction supports multiple delivery modes:
 * - Backend (built-in support)
 * - Local-only (no server, for testing)
 * 
 * Key features:
 * - Atomic OPK consumption (prevents reuse across initiators)
 * - Bundle distribution and freshness management
 * - Message relay for offline delivery
 */

import type {
  PublicKeyBundle,
  HybridPreKey,
  BundleServerConfig,
  TelemetryConfig,
  FetchBundleResult,
  PublishBundleResult,
  RelayStatusUpdate,
  RelayStatusQuery,
  OutboundSealedRelayRecord,
  OutboundSealedControlRecord,
  SealedRelayedMessage
} from '../types/index'

type AuthAwareBundleServer = BundleServer & {
  setAccessToken?: (token: string | null) => void
  setTokenGetter?: (getter: (() => string | null) | null) => void
  setTelemetry?: (telemetry: TelemetryConfig | undefined) => void
}

export type BundleServerRequestFailureReason =
  | 'timeout'
  | 'network'
  | 'rate_limited'
  | 'unauthorized'
  | 'recipient_unavailable'
  | 'rejected'
  | 'unknown'

export class BundleServerRequestError extends Error {
  readonly reason: BundleServerRequestFailureReason
  readonly statusCode?: number
  readonly transient: boolean
  readonly retryAfterMs?: number

  constructor(
    message: string,
    options: {
      reason: BundleServerRequestFailureReason
      statusCode?: number
      transient?: boolean
      retryAfterMs?: number
      cause?: unknown
    },
  ) {
    super(message)
    this.name = 'BundleServerRequestError'
    this.reason = options.reason
    this.statusCode = options.statusCode
    this.retryAfterMs = options.retryAfterMs
    this.transient = options.transient ?? (
      options.reason === 'timeout'
      || options.reason === 'network'
      || options.reason === 'rate_limited'
    )
    if (options.cause !== undefined) {
      ;(this as Error & { cause?: unknown }).cause = options.cause
    }
  }
}

// Bundle Server Interface

/**
 * Interface for bundle server implementations
 * Handles server-side key management and message relay
 */
export interface BundleServer {
  /**
   * Check if server is configured and available
   */
  isAvailable(): boolean


  /**
   * Publish our bundle to the server
   * This uploads the identity keys and all OPKs
   * 
   * @param identityId - Our identity ID
   * @param bundle - Our public key bundle
   * @param walletAddress - Wallet address that authorizes the bundle
   * @returns Result with OPK count stored
   */
  publishBundle(
    identityId: string,
    bundle: PublicKeyBundle,
    walletAddress?: string,
  ): Promise<PublishBundleResult>

  /**
   * Fetch a contact's bundle with atomic OPK consumption
   * The server will allocate exactly one OPK to the requestor
   * 
   * @param identityId - Contact's identity ID
   * @param requestorId - Our identity ID (for atomic OPK allocation)
   * @param inviteCapability - Opaque capability shared by the contact
   * @returns Bundle with at most one OPK (the allocated one)
   */
  fetchBundle(
    identityId: string,
    requestorId: string,
    inviteCapability: string,
    signal?: AbortSignal,
  ): Promise<FetchBundleResult>

  fetchDiscoverableBundle?(
    walletAddress: string,
    requestorId: string,
    signal?: AbortSignal,
  ): Promise<FetchBundleResult>

  fetchOneTimeContactCard?(
    cardId: string,
    cardCapability: string,
    signal?: AbortSignal,
  ): Promise<FetchBundleResult>

  /**
   * Get current OPK count for an identity
   * Used to determine when to replenish
   * 
   * @param identityId - Identity to check
   * @returns Number of available (unconsumed) OPKs
   */
  getOPKCount(identityId: string): Promise<number>

  /**
   * Replenish OPKs on the server
   * Called when OPK count is low
   * 
   * @param identityId - Our identity ID
   * @param newOPKs - New OPKs to add
   * @returns Number of OPKs now available
   */
  replenishOPKs(
    identityId: string,
    newOPKs: HybridPreKey[]
  ): Promise<number>

  /**
   * Update signed pre-key bundle material on the server.
   * The bundle must include the matching signature/version/timestamp.
   * 
   * @param identityId - Our identity ID
   * @param bundle - Bundle carrying the new signed pre-key and signatures
   */
  updateSignedPreKey(
    identityId: string,
    bundle: PublicKeyBundle
  ): Promise<void>

  /**
   * Send a metadata-hardened sealed message through the relay.
   * The server-visible record must not include plaintext sender or conversation IDs.
   */
  sendSealedMessage(record: OutboundSealedRelayRecord): Promise<SealedRelayedMessage>

  /**
   * Fetch pending sealed messages for every mailbox owned by the authenticated identity.
   */
  fetchOwnedSealedMessages(
    afterSequence?: number,
    signal?: AbortSignal,
  ): Promise<SealedRelayedMessage[]>

  /**
   * Mark a message as delivered
   * 
   * @param messageId - Message ID to mark
   */
  markDelivered(messageId: string): Promise<void>

  /**
   * Mark a message as read
   * 
   * @param messageId - Message ID to mark
   */
  markRead(messageId: string): Promise<void>

  /**
   * Delete a message from the relay (after successful delivery)
   * 
   * @param messageId - Message ID to delete
   */
  deleteMessage(messageId: string): Promise<number>

  /**
   * Batch-delete messages from the relay in a single round-trip.
   */
  deleteMessages(messageIds: string[]): Promise<number>

  /**
   * Drop delivered/read sealed rows at or below a mailbox cursor without fetching blobs.
   */
  vacuumOwnedSealedMessages(
    beforeSequence: number,
    statuses?: Array<'delivered' | 'read'>,
  ): Promise<number>

  /**
   * Fetch delivery/read state for a batch of relay rows.
   */
  fetchMessageStatuses(messages: RelayStatusQuery[]): Promise<RelayStatusUpdate[]>

  /**
   * Send a metadata-hardened sealed control envelope.
   */
  sendSealedControlMessage(record: OutboundSealedControlRecord): Promise<void>

  /**
   * Fetch pending sealed control envelopes for every mailbox owned by the authenticated identity.
   */
  fetchOwnedSealedControlMessages(): Promise<SealedRelayedMessage[]>


  /**
   * Check whether our bundle exists on the server.
   * Used on every init to ensure the server has our current bundle.
   */
  bundleExistsOnServer(identityId: string): Promise<boolean>

}

// NO-OP SERVER (Local-only fallback)

/**
 * A no-op bundle server for local-only operation
 * All operations succeed but don't actually communicate with a server
 */
export class LocalOnlyBundleServer implements BundleServer {
  isAvailable(): boolean {
    return false // Indicates no server is available
  }

  async publishBundle(
    _identityId: string,
    _bundle: PublicKeyBundle,
    _walletAddress?: string,
  ): Promise<PublishBundleResult> {
    return { success: true, opkCount: 0 }
  }

  async fetchBundle(
    _identityId: string,
    _requestorId: string,
    _inviteCapability: string,
    _signal?: AbortSignal,
  ): Promise<FetchBundleResult> {
    return { bundle: null, error: 'No server configured - use local bundle exchange' }
  }

  async getOPKCount(): Promise<number> {
    return 0
  }

  async replenishOPKs(): Promise<number> {
    return 0
  }

  async updateSignedPreKey(): Promise<void> {
    // No-op
  }

  async sendSealedMessage(record: OutboundSealedRelayRecord): Promise<SealedRelayedMessage> {
    return {
      id: `local-sealed-${Date.now()}`,
      recipientMailboxToken: record.recipientMailboxToken,
      deliveryClass: record.deliveryClass,
      sealedEnvelope: record.sealedEnvelope,
      status: 'pending',
      serverSequence: 0,
      createdAt: Date.now(),
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
      deliveryToken: record.deliveryToken,
    }
  }

  async fetchOwnedSealedMessages(): Promise<SealedRelayedMessage[]> {
    return []
  }

  async markDelivered(): Promise<void> {
    // No-op
  }

  async markRead(): Promise<void> {
    // No-op
  }

  async deleteMessage(): Promise<number> {
    return 0
  }

  async deleteMessages(): Promise<number> {
    return 0
  }

  async vacuumOwnedSealedMessages(): Promise<number> {
    return 0
  }

  async fetchMessageStatuses(_messages: RelayStatusQuery[]): Promise<RelayStatusUpdate[]> {
    return []
  }

  async sendSealedControlMessage(): Promise<void> {
    // No-op
  }

  async fetchOwnedSealedControlMessages(): Promise<SealedRelayedMessage[]> {
    return []
  }

  async bundleExistsOnServer(_identityId: string): Promise<boolean> {
    return false
  }

}

// Factory

/**
 * Create a bundle server based on configuration
 */
export async function createBundleServer(
  config?: BundleServerConfig,
  telemetry?: TelemetryConfig,
): Promise<BundleServer> {
  if (!config) {
    return new LocalOnlyBundleServer()
  }

  switch (config.type) {
    case 'backend': {
      if (!config.backendUrl) {
        console.warn('[BundleServer] Backend config incomplete, using local-only mode')
        return new LocalOnlyBundleServer()
      }
      if (!config.customFetch) {
        throw new Error('Backend bundle server requires an explicit transport')
      }
      // Dynamically import to avoid circular dependencies
      const { BackendBundleServer } = await import('./backend')
      const server = new BackendBundleServer(config.backendUrl, config.customFetch)
      if (config.tokenGetter) {
        ;(server as AuthAwareBundleServer).setTokenGetter?.(config.tokenGetter)
      }
      if (config.accessToken) {
        ;(server as AuthAwareBundleServer).setAccessToken?.(config.accessToken)
      }
      if (telemetry) {
        ;(server as AuthAwareBundleServer).setTelemetry?.(telemetry)
      }
      return server
    }

    default:
      return new LocalOnlyBundleServer()
  }
}

// Re-export types
export type {
  BundleServerConfig,
  FetchBundleResult,
  PublishBundleResult,
  RelayStatusUpdate,
  OutboundSealedRelayRecord,
  OutboundSealedControlRecord,
  SealedRelayedMessage
}
