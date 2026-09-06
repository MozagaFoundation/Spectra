/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

/**
 * Spectra Core Crypto Type Definitions
 * 
 * Core types for the end-to-end encrypted chat system with hybrid
 * post-quantum initial key establishment.
 * 
 * Security improvements:
 * - Trust-on-First-Use (TOFU) identity tracking
 * - Multi-device support with proper device records
 * - Identity key change detection
 * - Stale record handling for multi-session state
 */

// Identity Types

/**
 * A chat identity can be either anonymous or linked to a blockchain address
 */
export interface ChatIdentity {
  /** Unique identifier for this chat identity */
  id: string
  /** Display name (optional) */
  displayName?: string
  /** Linked blockchain address (optional, for non-anonymous mode) */
  blockchainAddress?: string
  /** X25519 public key for key exchange (base64) */
  identityPublicKey: string
  /** ML-KEM public key for post-quantum key exchange (base64) */
  mlkemPublicKey: string
  /** ML-DSA-65 public key for post-quantum signatures (historical field name; hex) */
  dilithiumPublicKey: string
  /** Creation timestamp */
  createdAt: number
  /** Whether this is an anonymous identity */
  isAnonymous: boolean
  /** Registration ID for session reset detection */
  registrationId?: number
}

/**
 * Full identity with private keys (stored locally only)
 */
export interface ChatIdentityWithKeys extends ChatIdentity {
  /** X25519 private key for key exchange (base64) */
  identityPrivateKey: string
  /** ML-KEM private key for post-quantum key exchange (base64) */
  mlkemPrivateKey: string
  /** ML-DSA-65 private key for post-quantum signatures (historical field name; hex) */
  dilithiumPrivateKey: string
}

/**
 * Trust state for a remote identity (TOFU)
 */
export type TrustState = 
  | 'unknown'      // Never seen before
  | 'trusted'      // First use, auto-trusted
  | 'verified'     // User manually verified (e.g., compared safety numbers)
  | 'changed'      // Identity keys changed - requires user action
  | 'blocked'      // User explicitly blocked

/**
 * Tracked identity record for TOFU
 * Stores history of identity keys to detect changes
 */
export interface TrackedIdentity {
  /** Remote identity ID */
  identityId: string
  /** Current X25519 identity public key */
  currentIdentityKey: string
  /** Current ML-DSA-65 public key (historical field name) */
  currentDilithiumKey: string
  /** Current ML-KEM identity key */
  currentMlkemKey: string
  /** Trust state */
  trustState: TrustState
  /** First time this identity was seen */
  firstSeenAt: number
  /** Last time identity keys were updated */
  lastUpdatedAt: number
  /** Last time user verified this identity */
  lastVerifiedAt?: number
  /** Previous identity keys (for detecting changes) */
  previousKeys: Array<{
    identityKey: string
    dilithiumKey: string
    mlkemKey: string
    replacedAt: number
    reason: 'key_change' | 'rotation' | 'manual_reset'
  }>
  /** Hash of the identity for quick comparison */
  identityHash: string
}

/**
 * Identity key change event for user notification
 */
export interface IdentityKeyChangeEvent {
  /** Remote identity ID */
  identityId: string
  /** Previous identity key */
  previousIdentityKey: string
  /** New identity key */
  newIdentityKey: string
  /** Whether this appears to be a legitimate rotation or potential attack */
  severity: 'low' | 'medium' | 'high' | 'critical'
  /** Timestamp of the change */
  detectedAt: number
  /** Whether the user has acknowledged this change */
  acknowledged: boolean
}

// DEVICE TYPES (Multi-device support)

/**
 * Device record for multi-device session management
 */
export interface DeviceRecord {
  /** Device ID */
  deviceId: string
  /** Parent identity ID */
  identityId: string
  /** Device's public keys */
  deviceKey: string
  /** Device ML-DSA-65 public key (historical field name) */
  deviceDilithiumKey: string
  /** Registration ID */
  registrationId: number
  /** Active session ID for this device */
  activeSessionId: string | null
  /** Inactive sessions for this device */
  inactiveSessionIds: string[]
  /** Whether this device record is stale */
  isStale: boolean
  /** Timestamp when marked stale */
  staleAt?: number
  /** Last activity timestamp */
  lastActivityAt: number
  /** Created timestamp */
  createdAt: number
}

// Key Bundle Types (X3DH)

/**
 * Hybrid pre-key for X3DH key exchange (X25519 + ML-KEM)
 */
export interface HybridPreKey {
  id: number
  x25519PublicKey: string // X25519 public key (base64)
  mlkemPublicKey: string  // ML-KEM public key (base64)
}

/**
 * Signed pre-key (medium-term key) - Hybrid version
 */
export interface SignedPreKey extends HybridPreKey {
  /** ML-DSA-65 signature of both public keys plus timestamp (hex) */
  signature: string
  timestamp: number
  /** Expiration timestamp (for rotation) */
  expiresAt?: number
}

export interface WalletBundleAuthorizationPayload {
  purpose: 'Spectra chat identity authorization'
  version: 1
  walletAddress: string
  walletPublicKey: string
  identityId: string
  identityKey: string
  mlkemIdentityKey: string
  dilithiumKey: string
  signedPreKey: SignedPreKey
  bundleSignature: string
  bundleVersion: number
  bundleTimestamp: number
  signedAt: number
}

export interface WalletBundleAuthorization {
  payload: WalletBundleAuthorizationPayload
  signature: string
}

export interface BundleMetadataCapabilities {
  version: 1
  mailboxTokens: Array<'legacy_v1' | 'scoped_v2'>
  sealedControl: Array<'mailbox_scope_v1'>
  publishedAt: number
}

export interface ContactProfilePayload {
  version: 1
  identityId: string
  revision: number
  displayName?: string
  avatarDataUri?: string
}

export interface SignedContactProfile extends ContactProfilePayload {
  signature: string
}

export interface ContactCardProfileCapsule {
  version: 1
  ciphertext: string
  nonce: string
  tag: string
}

/**
 * Public key bundle for hybrid X3DH key exchange
 * Uses both X25519 (classical) and ML-KEM (post-quantum) for key agreement
 */
export interface PublicKeyBundle {
  identityId: string
  /** X25519 identity public key (base64) */
  identityKey: string
  /** ML-KEM identity public key for post-quantum key exchange (base64) */
  mlkemIdentityKey: string
  /** ML-DSA-65 public key for signature verification (historical field name; hex) */
  dilithiumKey: string
  /** Hybrid signed pre-key */
  signedPreKey: SignedPreKey
  /** Hybrid one-time pre-keys */
  oneTimePreKeys: HybridPreKey[]
  /** Bundle version for freshness checking */
  version: number
  /** Timestamp when bundle was created/updated */
  timestamp: number
  /** Bundle signature covering static identity fields and the signed pre-key. */
  bundleSignature?: string
  /** Optional separately signed metadata capabilities. Not covered by bundleSignature for legacy compatibility. */
  metadataCapabilities?: BundleMetadataCapabilities
  /** ML-DSA signature over metadataCapabilities plus static identity keys. */
  capabilitiesSignature?: string
  /**
   * Wallet authorization proves that the EXO wallet owner authorized this chat
   * identity bundle. It prevents the directory from mapping a wallet address to
   * an attacker-controlled bundle.
   */
  walletAuthorization?: WalletBundleAuthorization
}

/**
 * Private key bundle stored locally
 */
export interface PrivateKeyBundle {
  /** X25519 identity private key */
  identityPrivateKey: string
  /** ML-KEM identity private key */
  mlkemIdentityPrivateKey: string
  /** ML-DSA-65 private key for signing (historical field name) */
  dilithiumPrivateKey: string
  /** X25519 signed pre-key private */
  signedPreKeyPrivate: string
  /** ML-KEM signed pre-key private */
  mlkemSignedPreKeyPrivate: string
  /** X25519 one-time pre-key privates */
  oneTimePreKeyPrivates: Map<number, string>
  /** ML-KEM one-time pre-key privates */
  mlkemOneTimePreKeyPrivates: Map<number, string>
  /** Previous signed pre-keys (for in-flight messages during rotation) */
  previousSignedPreKeys?: Array<{
    id: number
    x25519Private: string
    mlkemPrivate: string
    expiresAt: number
  }>
  /** Next one-time pre-key ID to generate */
  nextPreKeyId: number
  /** Signed pre-key rotation timestamp */
  signedPreKeyRotatedAt?: number
}

// SESSION TYPES (Double Ratchet with Sesame)

/**
 * Ratchet chain key state
 */
export interface ChainKey {
  key: Uint8Array
  index: number
}

/**
 * Skipped message key with metadata for proper management
 */
export interface SkippedMessageKey {
  /** The message key */
  key: Uint8Array
  /** Message index */
  index: number
  /** Ratchet public key this key belongs to */
  ratchetKey: string
  /** When this key was stored */
  storedAt: number
  /** Expiration time */
  expiresAt: number
}

/**
 * Double ratchet session state
 * 
 * Includes separate header key chains that advance with the DH ratchet
 * rather than the symmetric ratchet.
 */
export interface SessionState {
  /** Remote party's current ratchet public key */
  remoteRatchetKey: string | null
  /** Our current ratchet key pair */
  localRatchetKeyPair: {
    publicKey: string
    privateKey: string
  } | null
  /** Root key for deriving chain keys */
  rootKey: Uint8Array
  /** Sending chain key */
  sendingChainKey: ChainKey | null
  /** Receiving chain key */
  receivingChainKey: ChainKey | null
  /** Previous sending chain length (for header encryption) */
  previousSendingChainLength: number
  /** Skipped message keys (for out-of-order messages) - Map<keyId, SkippedMessageKey> */
  skippedMessageKeys: Map<string, SkippedMessageKey>
  /** Message counter for sent messages (Ns) */
  sentMessageCount: number
  /** Message counter for received messages (Nr) */
  receivedMessageCount: number
  /** Whether we've received any message in this session */
  receivedFirstMessage: boolean
  /** Session creation timestamp */
  createdAt: number
  /** Last activity timestamp */
  lastActivityAt: number
  
  // These are derived during DH ratchet steps, not from chain keys.
  // - HKs (sendingHeaderKey): Current key for encrypting outgoing message headers
  // - HKr (receivingHeaderKey): Current key for decrypting incoming message headers  
  // - NHKs (nextSendingHeaderKey): Derived from receiving DH, becomes HKs after ratchet
  // - NHKr (nextReceivingHeaderKey): Derived from sending DH, becomes HKr after ratchet
  
  /** Current header key for sending - HKs (derived during DH ratchet) */
  sendingHeaderKey: Uint8Array | null
  /** Current header key for receiving - HKr (derived during DH ratchet) */
  receivingHeaderKey: Uint8Array | null
  /** Next sending header key - NHKs (becomes HKs after DH ratchet) */
  nextSendingHeaderKey: Uint8Array | null
  /** Next receiving header key - NHKr (becomes HKr after DH ratchet) */
  nextReceivingHeaderKey: Uint8Array | null
  /** Previous receiving header key (for decrypting out-of-order messages) */
  previousReceivingHeaderKey: Uint8Array | null
}

/**
 * Session status for multi-session management
 * - active: Currently used session for sending/receiving
 * - inactive: Valid session but not currently active
 * - archived: Session kept for decrypting old/out-of-order messages
 * - pending: Session being established
 * - expired: Session that should no longer be used
 */
export type SessionStatus = 'active' | 'inactive' | 'archived' | 'pending' | 'expired'

/**
 * Complete session with a remote party
 */
export interface Session {
  id: string
  localIdentityId: string
  remoteIdentityId: string
  /** Device ID for multi-device support */
  remoteDeviceId: string
  /** Remote's registration ID for session reset detection */
  remoteRegistrationId?: number
  state: SessionState
  /** Session status for multi-session management */
  status: SessionStatus
  /** Base key fingerprint for session identification */
  baseKeyFingerprint: string
  /** Identity key bound to this session at creation */
  boundIdentityKey: string
  /** ML-DSA-65 key bound to this session at creation (historical field name) */
  boundDilithiumKey: string
  /** X3DH associated data for AEAD session binding (base64) */
  boundAssociatedData?: string
  createdAt: number
  updatedAt: number
  /** Last message timestamp for this session */
  lastMessageAt?: number
  /** Last message sent timestamp */
  lastSentAt?: number
  /** Last message received timestamp */
  lastReceivedAt?: number
  /** X3DH data to include in messages (until we receive a response) */
  pendingX3DHData?: X3DHInitialData
  /** Number of messages sent without response */
  unansweredMessages: number
  /** Maximum unanswered messages before requiring re-establishment */
  maxUnansweredMessages: number
  /** Timestamp when session was archived (for archived sessions) */
  archivedAt?: number
  /** Reason the session was archived */
  archiveReason?: 'superseded' | 'manual' | 'expired' | 'error' | 'stale'
  /** Whether this session is stale */
  isStale: boolean
  /** Timestamp when marked stale */
  staleAt?: number
  /** Timestamp after which session should be deleted if stale */
  deleteAfter?: number
}

/**
 * Session record for managing multiple sessions per remote identity
 * Enhanced for multi-device support
 */
export interface SessionRecord {
  /** Remote identity ID */
  remoteIdentityId: string
  /** Device records for this identity, keyed by device ID */
  deviceRecords: Map<string, DeviceRecord>
  /** All sessions with this remote identity, keyed by session ID */
  sessions: Map<string, Session>
  /** Default active session ID (for single-device fallback) */
  activeSessionId: string | null
  /** Whether this entire user record is stale */
  isStale: boolean
  /** Timestamp when marked stale */
  staleAt?: number
  /** Timestamp of last update */
  updatedAt: number
}

// Message Types

/**
 * Message header (for Double Ratchet)
 */
export interface MessageHeader {
  /** Sender's current ratchet public key */
  ratchetKey: string
  /** Message number in the sending chain */
  messageNumber: number
  /** Previous chain length */
  previousChainLength: number
  /** Session fingerprint for session matching */
  sessionFingerprint?: string
}

/**
 * Encrypted message header (for header encryption)
 */
export interface EncryptedHeader {
  /** Encrypted header ciphertext */
  ciphertext: string
  /** Header encryption nonce */
  nonce: string
  /** Header encryption tag */
  tag: string
}

/**
 * X3DH initial message data (included in first message to establish session)
 */
export interface X3DHInitialData {
  /** Initiator's X25519 identity public key (base64) */
  initiatorIdentityKey: string
  /** Ephemeral X25519 public key used for this exchange (base64) */
  ephemeralKey: string
  /** ML-KEM ciphertext (base64) */
  mlkemCiphertext: string
  /** ID of the one-time pre-key used (if any) */
  usedOneTimePreKeyId?: number
  /** Initiator's ML-DSA-65 public key (historical field name; hex) */
  initiatorDilithiumKey: string
  /** ID of the signed pre-key used */
  usedSignedPreKeyId: number
  /** Timestamp of the initiator's bundle */
  bundleTimestamp?: number
}

/**
 * Message metadata for replay protection and context
 */
export interface MessageMetadata {
  /** Unique message ID for deduplication */
  messageId: string
  /** Sender's identity ID */
  senderId: string
  /** Recipient's identity ID */
  recipientId: string
  /** Session ID this message belongs to */
  sessionId: string
  /** Message timestamp */
  timestamp: number
  /** Sequence number within the session */
  sequenceNumber: number
  /** Previous message hash for chaining */
  previousMessageHash?: string
}

/**
 * Encrypted message payload
 */
export interface EncryptedMessage {
  /** Message header (may be encrypted) */
  header: MessageHeader
  /** Encrypted header (if header encryption enabled) */
  encryptedHeader?: EncryptedHeader
  /** Encrypted content (base64) */
  ciphertext: string
  /** Authentication tag (base64) */
  tag: string
  /** Nonce/IV (base64) */
  nonce: string
  /** ML-DSA-65 signature of the entire message including metadata (hex) */
  signature: string
  /** Message metadata for replay protection */
  metadata: MessageMetadata
  /** X3DH data for initial message (only present on first message to establish session) */
  x3dhData?: X3DHInitialData
  /** Protocol version */
  version: number
}

export type RelayMessageKind = 'text' | 'view_once' | 'call_invitation' | 'hidden_control'
export type RelayDeliveryClass = 'message' | 'control'

export interface RelayMailboxToken {
  /** Mailbox token format version */
  version: number
  /** Opaque recipient-scoped token used for relay routing */
  token: string
}

export interface SealedEnvelopeSenderCredential {
  /** Sender identity ID, encrypted inside the sealed envelope */
  senderIdentityId: string
  /** Sender X25519 identity public key */
  identityPublicKey: string
  /** Sender ML-KEM public key */
  mlkemPublicKey: string
  /** Sender ML-DSA public key */
  dilithiumPublicKey: string
  /** Credential issue timestamp */
  issuedAt: number
  /** Optional credential expiry timestamp */
  expiresAt?: number
  /** ML-DSA signature over the credential body */
  signature: string
}

export interface SealedRelayPayload {
  /** Sender credential authenticated after envelope decryption */
  senderCredential: SealedEnvelopeSenderCredential
  /** Pairwise/thread token kept hidden from the relay */
  threadToken: string
  /** Message classification kept hidden from the relay */
  messageKind: RelayMessageKind
  /** Inner end-to-end encrypted message */
  encryptedMessage: EncryptedMessage
  /** Optional sender bundle for session/bootstrap handling */
  senderBundle?: PublicKeyBundle
  /** Random replay nonce for sealed-envelope deduplication */
  envelopeNonce: string
  /** Envelope creation timestamp */
  timestamp: number
}

export interface SealedControlPayload {
  /** Sender credential authenticated after envelope decryption */
  senderCredential: SealedEnvelopeSenderCredential
  /** Inner signed control message */
  controlMessage: ControlMessage
  /** Random replay nonce for sealed-control deduplication */
  envelopeNonce: string
  /** Envelope creation timestamp */
  timestamp: number
}

export interface SealedRelayEnvelope {
  /** Envelope wire version */
  version: number
  /** Envelope payload type */
  type: 'message'
  /** Sender ephemeral X25519 public key */
  senderEphemeralKey: string
  /** ML-KEM ciphertext for the recipient identity KEM key */
  mlkemCiphertext: string
  /** AES-GCM ciphertext of SealedRelayPayload */
  ciphertext: string
  /** AES-GCM nonce */
  nonce: string
  /** AES-GCM authentication tag */
  tag: string
}

export interface SealedControlEnvelope {
  /** Envelope wire version */
  version: number
  /** Envelope payload type */
  type: 'control'
  /** Sender ephemeral X25519 public key */
  senderEphemeralKey: string
  /** ML-KEM ciphertext for the recipient identity KEM key */
  mlkemCiphertext: string
  /** AES-GCM ciphertext of SealedControlPayload */
  ciphertext: string
  /** AES-GCM nonce */
  nonce: string
  /** AES-GCM authentication tag */
  tag: string
}

export interface OutboundSealedRelayRecord {
  /** Opaque mailbox token for recipient-side relay fetch */
  recipientMailboxToken: string
  /** Optional authorization/rate-limit token; not a sender identity */
  deliveryToken?: string
  /** Coarse server-visible delivery class */
  deliveryClass: RelayDeliveryClass
  /** Server-visible opt-in for user-visible push notifications */
  pushNotificationEnabled?: boolean
  /** Sealed message envelope */
  sealedEnvelope: SealedRelayEnvelope
}

export interface RelayDeliveryOutbox {
  record: OutboundSealedRelayRecord
  attemptCount: number
  createdAt: number
  lastAttemptAt: number
}

export interface OutboundSealedControlRecord {
  /** Opaque mailbox token for recipient-side control fetch */
  recipientMailboxToken: string
  /** Optional authorization/rate-limit token; not a sender identity */
  deliveryToken?: string
  /** Coarse server-visible delivery class */
  deliveryClass: 'control'
  /** Sealed control envelope */
  sealedEnvelope: SealedControlEnvelope
}

export interface StoredOneTimeMetadata {
  state: 'locked' | 'consumed'
  kind?: 'text' | 'image' | 'voice_note'
  requiresReveal?: boolean
  consumedAt?: number
}

export type StoredDisappearingMessageTrigger = 'after_send' | 'after_read'
export type StoredDisappearingMessageExpirySource = 'after_send' | 'after_read' | 'send_fallback'

export interface StoredDisappearingMessageTimer {
  durationMs: number
  trigger: StoredDisappearingMessageTrigger
  fallbackDurationMs?: number
  updatedAt?: number
  updatedBy?: string
}

export interface StoredDisappearingMessageState extends StoredDisappearingMessageTimer {
  armedAt?: number
  expiresAt?: number
  fallbackExpiresAt?: number
  expiresFrom?: StoredDisappearingMessageExpirySource
}

/**
 * Decrypted message content
 */
export interface DecryptedMessage {
  id: string
  conversationId: string
  senderId: string
  content: string
  timestamp: number
  /** Device-local ordering key used to preserve optimistic UI order across restarts */
  localOrderTimestamp?: number
  /** Whether the signature was verified */
  signatureVerified: boolean
  /** Sequence number for ordering */
  sequenceNumber?: number
  /** Server-assigned global sequence (set by fetchPendingMessages) */
  serverSequence?: number
  /** Relay row ID for receipt updates when projected into the app */
  relayMessageId?: string
  /** Persisted delivery status so ticks survive reloads */
  status?: MessageStatus
  /** Relay-level kind used when content is intentionally unavailable locally */
  messageKind?: RelayMessageKind
  /** Local view-once lifecycle metadata for placeholder/tombstone rendering */
  oneTime?: StoredOneTimeMetadata
  /** Local disappearing-message lifecycle metadata for expiry sweeps */
  disappearing?: StoredDisappearingMessageState
}

/**
 * Message status
 */
export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed'

export interface MessageStatusUpdateOptions {
  relayReadReceiptEligible?: boolean
}

/**
 * Full message record
 */
export interface Message {
  id: string
  conversationId: string
  senderId: string
  senderIdentityId: string
  recipientIdentityId: string
  /** Set only after the inbound cryptographic signature has been verified */
  signatureVerified?: boolean
  /** Relay row ID for sender status sync and recipient read updates */
  relayMessageId?: string
  /** Opaque sender-held capability for receipt status fetches */
  relayDeliveryToken?: string
  /** Durable sealed relay submission retained until the relay acknowledges it */
  relayDeliveryOutbox?: RelayDeliveryOutbox
  /** Encrypted message data */
  encryptedData: EncryptedMessage
  /** Decrypted content (only available locally after decryption) */
  content?: string
  /** Device-local encrypted content capsule used when plaintext caches are cleared */
  localContentCipher?: {
    v: 1
    algorithm: 'AES-256-GCM'
    ciphertext: string
    iv: string
  }
  /** Relay-level kind used for notification routing and placeholder storage */
  messageKind?: RelayMessageKind
  /** Local view-once lifecycle metadata for placeholder/tombstone rendering */
  oneTime?: StoredOneTimeMetadata
  /** Local disappearing-message lifecycle metadata for expiry sweeps */
  disappearing?: StoredDisappearingMessageState
  status: MessageStatus
  createdAt: number
  /** Device-local ordering key used to preserve optimistic UI order across restarts */
  localOrderTimestamp?: number
  deliveredAt?: number
  readAt?: number
  /** Whether the local read transition consented to a relay read receipt */
  relayReadReceiptEligible?: boolean
  /** Durable local evidence that the relay accepted the delivered receipt */
  relayDeliveredReceiptAcknowledgedAt?: number
  /** Durable local evidence that the relay accepted the read receipt */
  relayReadReceiptAcknowledgedAt?: number
  /** Hash for message chaining */
  messageHash?: string
}

export interface OutboundMessageCommit {
  session: Session
  message: Message
  conversationUpdate: Partial<Conversation>
}

/** Atomically persists inbound state before receipts or relay cleanup. */
export interface InboundMessageCommit {
  session: Session
  sessionRecord?: SessionRecord
  privateKeyBundle?: {
    identityId: string
    bundle: PrivateKeyBundle
  }
  publicKeyBundle?: {
    identityId: string
    bundle: PublicKeyBundle
  }
  processedMessage: ProcessedMessageRecord
  message: Message
  decryptedMessage: DecryptedMessage
  conversationUpdate: Partial<Conversation>
}

/**
 * Processed message IDs for deduplication
 */
export interface ProcessedMessageRecord {
  /** Message ID */
  messageId: string
  /** Session ID */
  sessionId: string
  /** Timestamp when processed */
  processedAt: number
  /** Message hash for verification */
  messageHash: string
}

export type RetryRequestRecordStatus = 'pending' | 'resolved'

export type RetryRequestResolution =
  | 'relay_deleted'
  | 'message_decrypted'
  | 'retry_response_received'

export type RelayRepairAction =
  | 'message_retry'
  | 'bundle_refresh'

export type RelayRepairOutcome =
  | 'retry_requested'
  | 'bundle_refresh_requested'
  | 'repair_unavailable'

/**
 * Durable record for retry-request suppression/backoff.
 * Keyed by sender + logical message ID so duplicate relay polls can
 * be suppressed across app restarts without leaking into the UI layer.
 */
export interface RetryRequestRecord {
  /** Stable retry identity, e.g. sender + message ID */
  key: string
  /** Original logical message ID that triggered retry */
  messageId: string
  /** Remote sender whose message could not be decrypted */
  senderIdentityId: string
  /** Most recent relay row observed for this logical failure */
  relayMessageId?: string
  /** Number of retry-request attempts made for this logical failure */
  attemptCount: number
  /** Latest time we evaluated/saw this failure */
  lastSeenAt: number
  /** Latest time we attempted to emit a retry request */
  lastAttemptAt: number
  /** Latest time a retry request was successfully sent */
  lastRequestedAt?: number
  /** Repair path being attempted for the relayed message */
  repairAction?: RelayRepairAction
  /** Latest durable repair outcome for this relayed message */
  lastOutcome?: RelayRepairOutcome
  /** Most recent relay sequence observed for this failure */
  serverSequence?: number
  /** Latest concrete failure reason from the repair send path */
  lastFailureReason?: string
  /** Whether this retry flow is still active or has been superseded */
  status: RetryRequestRecordStatus
  /** How the record was resolved once no more retry traffic is needed */
  resolution?: RetryRequestResolution
  /** Resolution timestamp, when applicable */
  resolvedAt?: number
}

export type RelayReceiptJobStatus = 'delivered' | 'read'

export interface RelayReceiptJob {
  key: string
  relayMessageId: string
  status: RelayReceiptJobStatus
  localIdentityId: string
  attemptCount: number
  createdAt: number
  updatedAt: number
  nextAttemptAt: number
  lastAttemptAt?: number
  lastFailureReason?: string
}

export interface PendingMessageFetchResult {
  /** Decrypted messages ready for the orchestration/UI layer */
  messages: Array<DecryptedMessage & {
    /** Bundle authenticated during relay decryption */
    authenticatedSenderBundle?: PublicKeyBundle
  }>
  /** Number of relay rows fetched from the server */
  pendingCount: number
  /** Highest relay sequence observed in this batch */
  highestSeenSequence: number
  /**
   * Highest contiguous relay sequence that is safe for the poll cursor
   * to advance to without re-reading quarantined rows on every poll.
   */
  advanceSequence: number
  /** Relay rows skipped because a durable repair record is already in flight */
  quarantinedCount: number
  /** Relay rows that still block cursor advancement because repair is unavailable */
  blockedCount: number
  /** Scoped mailbox tokens observed in owned relay rows */
  mailboxTokens?: string[]
  /** Highest observed sequence for each owned mailbox */
  mailboxSequences?: Map<string, number>
}

export interface PendingMessageFetchOptions {
  fastPath?: boolean
  signal?: AbortSignal
  /** Host may project a message as soon as it is stored. Must not reject decrypt. */
  onDecryptedMessage?: (
    message: PendingMessageFetchResult['messages'][number],
    cursor: { advanceSequence: number },
  ) => void | Promise<void>
}

// MEDIA / ATTACHMENT TYPES

/**
 * Supported media types for encryption
 */
export type MediaType = 
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'sticker'
  | 'voice_note'
  | 'gif'

/**
 * MIME type string supplied by platform media/document pickers.
 */
export type MimeType = string

/**
 * Metadata for media attachments (encrypted alongside the content)
 */
export interface MediaMetadata {
  /** Original filename */
  fileName: string
  /** MIME type of the file */
  mimeType: MimeType
  /** File size in bytes (original, unencrypted) */
  fileSize: number
  /** Media type classification */
  mediaType: MediaType
  /** Width in pixels (for images/videos) */
  width?: number
  /** Height in pixels (for images/videos) */
  height?: number
  /** Duration in milliseconds (for audio/video) */
  durationMs?: number
  /** Thumbnail data (base64, for preview) */
  thumbnail?: string
  /** Thumbnail width */
  thumbnailWidth?: number
  /** Thumbnail height */
  thumbnailHeight?: number
  /** Waveform data for audio (normalized 0-1 values) */
  waveform?: number[]
  /** SHA-256 hash of original file (for integrity verification) */
  contentHash: string
  /** Creation timestamp */
  createdAt: number
  /** Caption/description (optional) */
  caption?: string
}

/**
 * Encrypted media chunk (for large file streaming encryption)
 */
export interface EncryptedChunk {
  /** Chunk index (0-based) */
  index: number
  /** Encrypted chunk data (base64) */
  ciphertext: string
  /** Chunk nonce (base64) */
  nonce: string
  /** Chunk authentication tag (base64) */
  tag: string
  /** Chunk size before encryption */
  originalSize: number
  /** Whether this is the final chunk */
  isFinal: boolean
}

/**
 * Encrypted media attachment
 * Uses AES-256-GCM with caller-supplied attachment keys.
 */
export interface EncryptedMedia {
  /** Unique attachment ID */
  id: string
  /** Media type */
  mediaType: MediaType
  /** Encrypted metadata (JSON string encrypted with message key) */
  encryptedMetadata: {
    ciphertext: string
    nonce: string
    tag: string
  }
  /** 
   * Encrypted content - either single blob or chunks for large files
   * For small files (< 5MB): single EncryptedPayload
   * For large files: array of EncryptedChunk
   */
  encryptedContent: {
    ciphertext: string
    nonce: string
    tag: string
  } | EncryptedChunk[]
  /** Whether content is chunked */
  isChunked: boolean
  /** Total number of chunks (if chunked) */
  totalChunks?: number
  /** Total encrypted size in bytes */
  encryptedSize: number
  /** Protocol version */
  version: number
}

/**
 * Decrypted media attachment
 */
export interface DecryptedMedia {
  /** Attachment ID */
  id: string
  /** Decrypted binary content */
  content: Uint8Array
  /** Decrypted metadata */
  metadata: MediaMetadata
  /** Whether integrity was verified (hash match) */
  integrityVerified: boolean
}

/**
 * Media encryption options
 */
export interface MediaEncryptionOptions {
  /** Chunk size for large files (default: 1MB) */
  chunkSize?: number
  /** Whether to generate thumbnail for images/videos */
  generateThumbnail?: boolean
  /** Maximum thumbnail dimension (default: 200px) */
  maxThumbnailSize?: number
  /** Associated data for AEAD (bound to session context) */
  associatedData?: Uint8Array
  /** Precomputed SHA-256 hash of the plaintext content */
  contentHash?: string
  /** Progress callback for large files */
  onProgress?: (progress: { bytesProcessed: number; totalBytes: number; chunksComplete: number; totalChunks: number }) => void
}

// REAL-TIME CALL TYPES

/**
 * Call type
 */
export type CallType = 'voice' | 'video'

/**
 * Call state
 */
export type CallState = 
  | 'initiating'    // Call being set up
  | 'ringing'       // Waiting for answer
  | 'connecting'    // Establishing secure connection
  | 'connected'     // Call active
  | 'reconnecting'  // Temporarily lost connection
  | 'ended'         // Call terminated
  | 'failed'        // Call failed

/**
 * Call end reason
 */
export type CallEndReason = 
  | 'completed'     // Normal end
  | 'declined'      // Recipient declined
  | 'busy'          // Recipient busy
  | 'timeout'       // No answer
  | 'network_error' // Network failure
  | 'crypto_error'  // Encryption failure
  | 'cancelled'     // Caller cancelled
  | 'missed'        // Missed call

/**
 * RTP-style call key material.
 * Derived from a caller-supplied session root key; this type does not establish
 * a call transport or confer a post-quantum property by itself.
 */
export interface CallKeyMaterial {
  /** Master secret (32 bytes, derived from session) */
  masterSecret: Uint8Array
  /** SRTP master key (16 bytes for AES-128 or 32 bytes for AES-256) */
  srtpMasterKey: Uint8Array
  /** SRTP master salt (14 bytes per SRTP spec) */
  srtpMasterSalt: Uint8Array
  /** Authentication key for RTCP (32 bytes) */
  rtcpAuthKey: Uint8Array
  /** Key derivation timestamp */
  derivedAt: number
  /** Key rotation interval in milliseconds */
  rotationInterval: number
  /** Current key index (for rotation tracking) */
  keyIndex: number
}

/**
 * Encrypted call signaling message
 * Used for call setup, ICE candidates, etc.
 */
export interface EncryptedCallSignal {
  /** Wire format version */
  version?: number
  /** Signal type */
  type: 'offer' | 'answer' | 'ice_candidate' | 'key_rotation' | 'end'
  /** Encrypted payload (base64) */
  ciphertext: string
  /** Nonce (base64) */
  nonce: string
  /** Authentication tag (base64) */
  tag: string
  /** ML-DSA-65 signature of the signal (hex) */
  signature: string
  /** Timestamp */
  timestamp: number
  /** Sequence number for replay protection */
  sequenceNumber: number
}

export interface CallRTPReplayStreamState {
  windowBase: number
  roc: number
  bitmap: string
  highestSequence: number
}

export interface CallReplayState {
  rtp: Record<string, CallRTPReplayStreamState>
  lastSignalSequence?: number
}

/**
 * Call session information
 */
export interface CallSession {
  /** Unique call ID */
  id: string
  /** Chat session ID this call is bound to */
  chatSessionId: string
  /** Local identity ID */
  localIdentityId: string
  /** Remote identity ID */
  remoteIdentityId: string
  /** Call type */
  type: CallType
  /** Current state */
  state: CallState
  /** Whether we initiated the call */
  isInitiator: boolean
  /** Call key material */
  keyMaterial: CallKeyMaterial | null
  /** Persisted replay state for RTP and signaling */
  replayState?: CallReplayState
  /** Start time (when connected) */
  startedAt?: number
  /** End time */
  endedAt?: number
  /** End reason */
  endReason?: CallEndReason
  /** Duration in milliseconds */
  durationMs?: number
  /** Signal sequence counter (for replay protection) */
  signalSequence: number
  /** Last key rotation timestamp */
  lastKeyRotation?: number
  /** Creation timestamp */
  createdAt: number
}

/**
 * SRTP packet header (for voice/video streams)
 * Encrypted using derived SRTP keys
 */
export interface SRTPHeader {
  /** Version (2 bits, always 2) */
  version: number
  /** Padding flag */
  padding: boolean
  /** Extension flag */
  extension: boolean
  /** CSRC count */
  csrcCount: number
  /** Marker bit */
  marker: boolean
  /** Payload type */
  payloadType: number
  /** Sequence number */
  sequenceNumber: number
  /** Timestamp */
  timestamp: number
  /** Synchronization source */
  ssrc: number
}

/**
 * Encrypted RTP packet
 */
export interface EncryptedRTPPacket {
  /** SRTP header */
  header: SRTPHeader
  /** Encrypted payload (base64) */
  encryptedPayload: string
  /** Authentication tag (base64) */
  authTag: string
  /** ROC (rollover counter) for extended sequence number */
  roc: number
}

/**
 * Call encryption options
 */
export interface CallEncryptionOptions {
  /** Key rotation interval in milliseconds (default: 60000 = 1 minute) */
  keyRotationInterval?: number
  /** Use AES-256 instead of AES-128 for SRTP (default: true for stronger symmetric protection) */
  useAes256?: boolean
  /** Enable RTCP encryption (default: true) */
  encryptRtcp?: boolean
  /** Associated data for AEAD */
  associatedData?: Uint8Array
}

// Conversation Types

/**
 * Conversation between two parties
 */
export interface Conversation {
  id: string
  /** Local user's identity ID */
  localIdentityId: string
  /** Remote party's identity ID */
  remoteIdentityId: string
  /** Remote party's identity info */
  remoteIdentity?: ChatIdentity
  /** Session record ID for encryption */
  sessionRecordId: string
  /** Last message preview */
  lastMessage?: {
    content: string
    timestamp: number
    senderId: string
  }
  /** Whether product UI should expose this cryptographic conversation */
  hasVisibleActivity?: boolean
  /** Unread message count */
  unreadCount: number
  /** App-owned durable unread projection schema version */
  unreadProjectionVersion?: number
  /** Set before durable message mutations that may change unread state */
  unreadProjectionDirty?: boolean
  /** Creation timestamp */
  createdAt: number
  /** Last activity timestamp */
  updatedAt: number
  /** Last known remote screenshot-protection preference, updated by hidden control messages */
  remoteScreenshotProtection?: boolean
  remoteScreenshotProtectionUpdatedAt?: number
  /** Last known remote Tor preference, updated by hidden control messages */
  remoteTorEnabled?: boolean
  remoteTorUpdatedAt?: number
  /** Next expected sequence number from remote */
  expectedSequenceNumber: number
  /** Our next outgoing sequence number */
  outgoingSequenceNumber: number
  /** Conversation-level disappearing-message policy snapshot */
  disappearingTimer?: StoredDisappearingMessageTimer | null
}

// Configuration Types

/**
 * Security configuration
 * 
 * Security comes from proactive key rotation on the owner's side and the
 * Double Ratchet providing forward secrecy from the first reply onward,
 * not from recipients rejecting aged bundles.
 */
export interface SecurityConfig {
  /** Maximum skipped message keys to store */
  maxSkippedKeys: number
  /** Maximum messages to skip */
  maxSkip: number
  /** Skipped key expiration time in milliseconds */
  skippedKeyExpiration: number
  /** How often to rotate signed pre-keys (proactive refresh interval) */
  signedPreKeyRotationInterval: number
  /**
   * Maximum allowed signed pre-key age before blocking OUR OWN sends.
   * This is a self-check: if our keys are this old, force rotation before sending.
   */
  maximumAllowedSignedPreKeyAge: number
  /** Maximum unanswered messages before session re-establishment */
  maxUnansweredMessages: number
  /** Enable header encryption */
  enableHeaderEncryption: boolean
  /** Message timestamp tolerance window in milliseconds */
  timestampTolerance: number
  /** Processed message retention time in milliseconds */
  processedMessageRetention: number
}

/**
 * Default security configuration
 */
export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  maxSkippedKeys: 2000,
  maxSkip: 2000,
  skippedKeyExpiration: 30 * 24 * 60 * 60 * 1000,                // 30 days
  signedPreKeyRotationInterval: 2 * 24 * 60 * 60 * 1000,         // 2 days
  maximumAllowedSignedPreKeyAge: 14 * 24 * 60 * 60 * 1000,       // 14 days
  maxUnansweredMessages: 100,
  enableHeaderEncryption: true,
  timestampTolerance: 5 * 60 * 1000,                              // 5 minutes
  processedMessageRetention: 30 * 24 * 60 * 60 * 1000,           // 30 days
}

/**
 * Multi-session timing parameters
 */
export const SESAME_TIMING = {
  /** Max time a session can be used for sending after last received message */
  maxSend: 30 * 24 * 60 * 60 * 1000, // 30 days
  /** Max time a session can be used for receiving */
  maxRecv: 30 * 24 * 60 * 60 * 1000, // 30 days
  /** Max latency allowed for message delivery before session cleanup */
  maxLatency: 7 * 24 * 60 * 60 * 1000, // 7 days
  /** Time to keep stale records before deletion */
  staleRetention: 7 * 24 * 60 * 60 * 1000, // 7 days
}

/**
 * Primitive field values accepted by telemetry sinks.
 */
export type TelemetryFieldValue = string | number | boolean | null | undefined

/**
 * Telemetry span handle returned by startSpan
 */
export interface TelemetrySpan {
  end: (extraFields?: Record<string, TelemetryFieldValue>) => void
}

/**
 * Telemetry hooks for latency tracking (injected from app layer).
 * When not provided, all telemetry is silently skipped.
 */
export interface TelemetryConfig {
  recordLatency: (
    scope: string,
    name: string,
    elapsedMs: number,
    fields?: Record<string, TelemetryFieldValue>,
  ) => void
  startSpan: (
    scope: string,
    name: string,
    fields?: Record<string, TelemetryFieldValue>,
  ) => TelemetrySpan
  recordDiagnostic?: (
    scope: string,
    name: string,
    fields?: Record<string, TelemetryFieldValue>,
  ) => void
}

export type CooperativeYieldStage = 'sealed_open' | 'message_decrypt' | 'message_store' | 'opk_generate'

export interface CooperativeScheduler {
  yieldToHost: (
    stage: CooperativeYieldStage,
    progress: {
      processed: number
      remaining: number
      priority?: 'realtime' | 'background'
    },
  ) => Promise<void>
}

/**
 * Chat client configuration (local-only, no server required)
 */
export interface ChatConfig {
  /** Optional: Link to existing blockchain identity */
  identity?: {
    address: string
    publicKey: string // ML-DSA-65 public key (hex)
    privateKey: string // ML-DSA-65 private key (hex)
  }
  /** Create anonymous identity if true */
  anonymous?: boolean
  /** Custom display name */
  displayName?: string
  preKeyCount?: number
  /** Security configuration */
  security?: Partial<SecurityConfig>
  /** Storage encryption key (derived from user password/pin) */
  storageEncryptionKey?: Uint8Array
  /** 
   * Bundle server configuration for server-side OPK management and message relay
   * If not provided, operates in local-only mode (manual bundle exchange)
   */
  server?: BundleServerConfig
  /**
   * Minimum OPK count before triggering replenishment
   * Server will be checked/replenished when below this threshold
   * @default 20
   */
  minOPKCount?: number
  /**
   * Enable automatic bundle publishing to server
   * If true, bundle is uploaded to server on creation and after refresh
   * @default true when server is configured
   */
  autoPublishBundle?: boolean
  /**
   * Returns whether Tor transport is currently enabled.
   * Used to adjust poll intervals and skip WebSocket paths.
   * Defaults to () => false when not provided.
   */
  isTorEnabled?: () => boolean
  /**
   * Returns whether the configured bundle transport can currently make requests.
   * Defaults to true when not provided.
   */
  isRemoteTransportAvailable?: () => boolean
  /**
   * Solve a requestor VDF and claim a session OPK for a live directory bundle.
   * Lookup itself never consumes OPKs.
   */
  prepareSessionOpkClaim?: (input: {
    identityId: string
    signal?: AbortSignal
  }) => Promise<PublicKeyBundle | null>
  /**
   * Returns the current delivery/read receipt policy.
   * Defaults to both enabled when not provided.
   */
  getReceiptPolicy?: () => ReceiptPolicy
  /**
   * Telemetry hooks for latency tracking.
   * When not provided, all telemetry is silently skipped.
   */
  telemetry?: TelemetryConfig
  /**
   * Host scheduler used to yield between expensive receive operations.
   */
  cooperativeScheduler?: CooperativeScheduler
}

export interface ReceiptPolicy {
  deliveryReceiptsEnabled: boolean
  readReceiptsEnabled: boolean
}

// Event Types

/**
 * Chat events
 */
export type ChatEventType = 
  | 'message:received'
  | 'message:sent'
  | 'message:delivered'
  | 'message:read'
  | 'message:duplicate'
  | 'message:retry_requested'  // Sesame retry: we requested sender to resend
  | 'message:retry_sent'       // Sesame retry: we re-encrypted and sent a message
  | 'conversation:created'
  | 'conversation:updated'
  | 'identity:updated'
  | 'identity:key_changed'
  | 'identity:verified'
  | 'session:established'
  | 'session:expired'
  | 'session:switched'
  | 'session:promoted'
  | 'device:added'
  | 'device:removed'
  | 'bundle:rotated'
  | 'bundle:published'
  | 'bundle:refreshed'
  | 'bundle:opk_replenished'
  | 'mailbox_scope:registered'
  | 'profile:requested'
  | 'profile:received'
  | 'security:warning'

export interface ChatEvent<T = unknown> {
  type: ChatEventType
  data: T
  timestamp: number
}

export type MessageReceivedEvent = ChatEvent<{
  message: DecryptedMessage
  conversation: Conversation
  authenticatedSenderBundle?: PublicKeyBundle
}>

export type SecurityWarningEvent = ChatEvent<{
  type: 'replay_attempt' | 'timestamp_mismatch' | 'session_desync' | 'bundle_stale' | 'identity_key_changed' | 'untrusted_identity' | 'key_mismatch'
  details: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  /** Identity ID if relevant */
  identityId?: string
  /** Whether user action is required */
  requiresAction?: boolean
}>

// Error Types

export class ChatError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: unknown
  ) {
    super(message)
    this.name = 'ChatError'
  }
}

export class CryptoError extends ChatError {
  constructor(message: string, details?: unknown) {
    super(message, 'CRYPTO_ERROR', details)
    this.name = 'CryptoError'
  }
}

export class SessionError extends ChatError {
  constructor(message: string, details?: unknown) {
    super(message, 'SESSION_ERROR', details)
    this.name = 'SessionError'
  }
}

export class ReplayError extends ChatError {
  constructor(message: string, details?: unknown) {
    super(message, 'REPLAY_ERROR', details)
    this.name = 'ReplayError'
  }
}

export class BundleError extends ChatError {
  constructor(message: string, details?: unknown) {
    super(message, 'BUNDLE_ERROR', details)
    this.name = 'BundleError'
  }
}

// Server/Relay Types

/**
 * Configuration for bundle server connection
 */
export interface BundleServerConfig {
  /** Server type */
  type: 'backend'
  /** Backend URL */
  backendUrl?: string
  /** Optional bearer token for authenticated bundle-server requests */
  accessToken?: string | null
  /** Dynamic token getter called on every request (takes priority over accessToken) */
  tokenGetter?: () => string | null
  /** Explicit transport (e.g. torAwareFetch for routing through Tor) */
  customFetch?: typeof globalThis.fetch
}

/**
 * Result of fetching a bundle from the server
 */
export interface FetchBundleResult {
  /** The fetched bundle (may have only one OPK - the one allocated to requestor) */
  bundle: PublicKeyBundle | null
  /** The OPK ID that was atomically allocated to the requestor */
  allocatedOPKId?: number
  /** Opaque profile snapshot returned only by a redeemed contact card. */
  profileCapsule?: ContactCardProfileCapsule
  /** Error message if fetch failed */
  error?: string
}

/**
 * Result of publishing a bundle to the server
 */
export interface PublishBundleResult {
  /** Whether the publish was successful */
  success: boolean
  /** Number of OPKs stored on server */
  opkCount?: number
  /** Error message if publish failed */
  error?: string
}

/**
 * Message relay record (what the server stores)
 */
export interface RelayedMessage {
  /** Unique message ID */
  id: string
  /** Sender's identity ID */
  senderIdentityId: string
  /** Recipient's identity ID */
  recipientIdentityId: string
  /** Conversation ID */
  conversationId: string
  /** Relay-level message classification for notification routing */
  messageKind?: RelayMessageKind
  /** Encrypted message data (server cannot read this) */
  encryptedData: EncryptedMessage
  /** Sender's current public key bundle (for session establishment) */
  senderBundle?: PublicKeyBundle
  /** Message status */
  status: 'pending' | 'delivered' | 'read' | 'expired'
  /** Server-assigned sequence number for ordering */
  serverSequence: number
  /** Creation timestamp */
  createdAt: number
  /** Delivery timestamp */
  deliveredAt?: number
  /** Expiration timestamp */
  expiresAt: number
}

/**
 * Hardened v2 relay record. The relay stores this shape instead of plaintext
 * sender/conversation/message-kind fields.
 */
export interface SealedRelayedMessage {
  /** Server relay row ID */
  id: string
  /** Opaque mailbox token used for recipient fetch */
  recipientMailboxToken: string
  /** Opaque token used by the sender to subscribe to receipt updates */
  deliveryToken?: string
  /** Coarse class for retention/notification routing */
  deliveryClass: RelayDeliveryClass
  /** Sealed message/control envelope */
  sealedEnvelope: SealedRelayEnvelope | SealedControlEnvelope
  /** Message status */
  status: 'pending' | 'delivered' | 'read' | 'expired'
  /** Server-assigned sequence number for ordering */
  serverSequence: number
  /** Creation timestamp */
  createdAt: number
  /** Delivery timestamp */
  deliveredAt?: number
  /** Expiration timestamp */
  expiresAt: number
}

export interface PendingMessageFetchOptions {
  /** Already-fetched sealed relay rows. Decrypt only; do not treat as a transport. */
  prefetchedRows?: SealedRelayedMessage[]
  /** Skip the relay HTTP GET and decrypt `prefetchedRows` only. */
  skipRelayHttp?: boolean
}

/**
 * Minimal relay-status update used to sync sender-side delivery state.
 */
export interface RelayStatusUpdate {
  /** Relay row ID */
  id: string
  /** Relay delivery state */
  status: RelayedMessage['status']
  /** Delivery timestamp, if present */
  deliveredAt?: number
}

export interface RelayStatusQuery {
  /** Relay row ID */
  id: string
  /** Opaque delivery capability returned to the sender at relay accept time */
  deliveryToken: string
}

/**
 * Control message types for protocol coordination
 * Includes retry messages for undecryptable ciphertexts.
 */
export type ControlMessageType = 
  | 'bundle_refresh_request'
  | 'bundle_refresh_response'
  | 'session_reset'
  | 'typing_indicator'
  | 'mailbox_scope_offer'
  | 'mailbox_scope_ack'
  | 'profile_sync_request'
  | 'profile_sync_response'
  | 'message_retry_request'   // Request sender to resend a message (Sesame retry mechanism)
  | 'message_retry_response'  // Response with re-encrypted message

export interface MailboxScopeState {
  localIdentityId: string
  remoteIdentityId: string
  scopeId: string
  scopeSecret: string
  epoch: number
  status: 'pending' | 'active' | 'retired'
  initiatedByLocal?: boolean
  createdAt: number
  updatedAt: number
  registeredAt?: number
  registrationVersion?: number
  acknowledgedAt?: number
}

/** Last compact sender bundle attached on sealed relay for a recipient. */
export interface RelaySenderBundleAttachState {
  fingerprint: string
  attachedAt: number
}

/**
 * Control message (signed but not encrypted)
 */
export interface ControlMessage {
  /** Message type */
  type: ControlMessageType
  /** Reference to related message ID */
  referenceMessageId?: string
  /** Reference to related identity */
  referenceIdentityId?: string
  /** Timestamp */
  timestamp: number
  /** Additional data */
  data?: Record<string, unknown>
  /** ML-DSA-65 signature */
  signature: string
}

/**
 * Safety number for identity verification
 */
export interface SafetyNumber {
  /** Numeric representation (60 digits, 12 groups of 5) */
  numeric: string
  /** QR code data for scanning */
  qrData: string
  /** Short fingerprint for display */
  fingerprint: string
  /** Full hash of combined keys */
  fullHash: string
}
