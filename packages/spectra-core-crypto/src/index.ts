/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

/**
 * Spectra Core Crypto
 * 
 * End-to-end encrypted chat primitives using:
 * - Hybrid X3DH (X25519 + ML-KEM-768) for key exchange
 * - Double Ratchet for forward secrecy
 * - ML-DSA-65 post-quantum signatures for authentication (via @noble/post-quantum)
 * - Multi-session management for concurrent and out-of-order delivery
 * - Encryption at rest for local storage
 * 
 * Uses React Native-compatible crypto primitives and optional relay/bundle
 * servers for delivery while keeping message contents end-to-end encrypted.
 * 
 * @example
 * ```typescript
 * import { QuantumChat } from '@spectra/core-crypto'
 * 
 * // Initialize with anonymous identity
 * const chat = await QuantumChat.init({
 *   anonymous: true,
 *   storageEncryptionKey: derivedKey // Optional: encrypt storage
 * })
 * 
 * // Or with blockchain identity
 * const chat = await QuantumChat.init({
 *   identity: {
 *     address: 'EXO00...',
 *     publicKey: '0x...',
 *     privateKey: '0x...'
 *   }
 * })
 * 
 * // Share your public key bundle with contacts
 * const myBundle = await chat.getPublicKeyBundle()
 * 
 * // Add a contact's public key bundle
 * await chat.addContact(theirBundle)
 * 
 * // Start a conversation
 * const conversation = await chat.getOrCreateConversation(recipientId)
 * const { decrypted, encrypted } = await conversation.sendMessage('Hello!')
 * 
 * // The encrypted message can be transmitted via any channel
 * // (QR code, Bluetooth, NFC, etc.)
 * 
 * // Listen for messages
 * conversation.onMessage((message) => {
 *   console.log('Received:', message.content)
 * })
 * 
 * // Listen for security events
 * chat.on('security:warning', (event) => {
 *   console.warn('Security warning:', event.data)
 * })
 * ```
 */

// Main client
export { QuantumChat, ConversationHandle } from './client/chat'
export {
  compactTransportBundleFingerprint,
  createCompactTransportBundle,
  RELAY_SENDER_BUNDLE_REATTACH_AFTER_MS,
  shouldAttachRelaySenderBundle,
} from './client/transportBundle'
export {
  applyRelayReceipt,
  compareMessageStatus,
  completeRelayDeliveryOutbox,
  DELIVERED_STATUS_SYNC_WINDOW_MS,
  hasPendingRelayDelivery,
  nextMessageStatus,
  shouldSyncOutboundStatus,
  stageRelayDeliveryOutbox,
} from './messageLifecycle'
export {
  ensureInboundMailboxScopes,
  listRealtimeMailboxTokens,
  MAILBOX_SCOPE_REGISTRATION_VERSION,
} from './client/mailboxRegistry'
export type {
  MessageLifecycleEvent,
  RelayReceiptStatus,
} from './messageLifecycle'
export type {
  RealtimeMailboxToken,
} from './client/mailboxRegistry'

// BLE v2 protocol and cryptographic foundation
export * from './ble'
export { PROTOCOL_VERSIONS } from './crypto/protocolVersion'

// Identity management
export {
  createAnonymousIdentity,
  createLinkedIdentity,
  loadIdentity,
  loadIdentityByAddress,
  getAllIdentities,
  exportIdentity,
  importIdentity,
  findIdentityByAddress,
  getIdentity,
  getPublicKeyBundle,
  storeContactBundle,
  contactBundleAlreadyStored,
  shouldPersistContactBundle,
} from './client/identity'

// Session management
export {
  establishSessionAsInitiator,
  establishSessionAsResponder,
  establishSessionAndDecrypt,
  getSession,
  getActiveSessionByRemoteIdentity,
  getAllSessionsForRemoteIdentity,
  getAllSessionsIncludingArchived,
  findSessionByFingerprint,
  findSessionForDecryption,
  prepareSessionMessage,
  encryptSessionMessage,
  decryptSessionMessage,
  decryptWithSessionFallback,
  promoteSessionToActive,
  archiveSession,
  markDeviceStale,
  cleanupStaleRecords,
  sessionCanSend,
  sessionCanReceive,
  sessionNeedsReestablishment,
  getSessionFingerprint,
  deleteSession,
  deleteAllSessions,
  cleanupProcessedMessages,
  getSessionStats
} from './client/session'

// Identity tracking (TOFU)
export {
  createIdentityHash,
  createTrackedIdentity,
  createTrackedIdentityFromBundle,
  hasIdentityChanged,
  identityMatchesBundle,
  updateTrackedIdentity,
  verifyIdentity,
  blockIdentity,
  acknowledgeKeyChange,
  isCommunicationAllowed,
  verifySessionIdentity
} from './crypto/identityTracking'

export {
  WALLET_BUNDLE_AUTHORIZATION_PURPOSE,
  buildWalletBundleAuthorizationPayload,
  deriveExoAddressFromWalletPublicKey,
  signPublicKeyBundleWalletAuthorization,
  verifyPublicKeyBundleWalletAuthorization,
  verifyPublicKeyBundleWalletAuthorizationAsync,
} from './crypto/walletAuthorization'
export type { WalletBundleAuthorizationVerification } from './crypto/walletAuthorization'

export {
  attachBundleMetadataCapabilities,
  buildDefaultBundleMetadataCapabilities,
  bundleSupportsScopedMailbox,
  signBundleMetadataCapabilities,
  verifyBundleMetadataCapabilities,
} from './crypto/bundleCapabilities'
export {
  createSignedContactProfile,
  normalizeContactProfileDisplayName,
  openContactCardProfile,
  sealContactCardProfile,
  verifySignedContactProfile,
  MAX_CONTACT_PROFILE_AVATAR_BYTES,
} from './crypto/contactProfile'

// Types
export type {
  // Core types
  ChatConfig,
  ReceiptPolicy,
  ChatIdentity,
  ChatIdentityWithKeys,
  Conversation,
  Message,
  InboundMessageCommit,
  OutboundMessageCommit,
  DecryptedMessage,
  EncryptedMessage,
  MessageHeader,
  EncryptedHeader,
  MessageMetadata,
  MessageStatus,
  MessageStatusUpdateOptions,
  
  // Session types
  Session,
  SessionState,
  SessionRecord,
  SessionStatus,
  DeviceRecord,
  
  // Key types
  PublicKeyBundle,
  PrivateKeyBundle,
  SignedPreKey,
  HybridPreKey,
  WalletBundleAuthorization,
  WalletBundleAuthorizationPayload,
  BundleMetadataCapabilities,
  ContactProfilePayload,
  SignedContactProfile,
  ContactCardProfileCapsule,
  ChainKey,
  SkippedMessageKey,
  
  // X3DH types
  X3DHInitialData,
  
  // Security types
  SecurityConfig,
  ProcessedMessageRecord,
  RetryRequestRecord,
  RetryRequestRecordStatus,
  RetryRequestResolution,
  RelayReceiptJob,
  RelayReceiptJobStatus,
  MailboxScopeState,
  RelaySenderBundleAttachState,
  RelayRepairAction,
  RelayRepairOutcome,
  PendingMessageFetchResult,
  StoredDisappearingMessageState,
  StoredDisappearingMessageTimer,
  
  // Identity tracking types
  TrackedIdentity,
  TrustState,
  IdentityKeyChangeEvent,
  
  // Event types
  ChatEvent,
  ChatEventType,
  MessageReceivedEvent,
  SecurityWarningEvent,
  
  // Telemetry types
  TelemetryFieldValue,
  TelemetrySpan,
  TelemetryConfig,
  
  // Server/Relay types
  BundleServerConfig,
  FetchBundleResult,
  PublishBundleResult,
  RelayedMessage,
  ControlMessage,
  ControlMessageType,
  SafetyNumber,
  
  // Media/Attachment types
  MediaType,
  MimeType,
  MediaMetadata,
  EncryptedChunk,
  EncryptedMedia,
  DecryptedMedia,
  MediaEncryptionOptions,
  
  // Call types
  CallType,
  CallState,
  CallEndReason,
  CallKeyMaterial,
  EncryptedCallSignal,
  CallSession,
  SRTPHeader,
  EncryptedRTPPacket,
  CallEncryptionOptions,

  // Sealed relay/control types
  RelayDeliveryClass,
  RelayMailboxToken,
  SealedEnvelopeSenderCredential,
  SealedRelayPayload,
  SealedControlPayload,
  SealedRelayEnvelope,
  SealedControlEnvelope,
  OutboundSealedRelayRecord,
  OutboundSealedControlRecord,
  SealedRelayedMessage
} from './types/index'
export type { DilithiumVerifier } from './crypto/dilithium'

// Security config default
export { DEFAULT_SECURITY_CONFIG, SESAME_TIMING } from './types/index'

// Errors
export {
  ChatError,
  CryptoError,
  SessionError,
  ReplayError,
  BundleError
} from './types/index'

// Storage
export { 
  localChatStorage, 
  createLocalStorage,
  getLocalStorage,
  setStorageInstance,
  isStorageInitialized,
  initStorageEncryption,
  initStorageEncryptionFromPassword,
  disableStorageEncryption,
  isStorageEncryptionEnabled,
  parseRelaySenderBundleAttachState,
} from './storage/local'
export type { LocalStorage } from './storage/local'

// Server/Relay
export { 
  createBundleServer, 
  LocalOnlyBundleServer 
} from './server/index'
export { BackendBundleServer } from './server/backend'
export type { BundleServer } from './server/index'

// X3DH utilities
export {
  verifyPublicKeyBundle,
  verifyPublicKeyBundleAsync,
  bundleNeedsRefresh,
  rotateSignedPreKey,
  rotateSignedPreKeyAsync,
  replenishOneTimePreKeys,
  consumeOneTimePreKey,
  STARTUP_PREKEY_COUNT,
  TARGET_PREKEY_COUNT,
} from './crypto/x3dh'

// Safety Number utilities (for identity verification)
export {
  generateSafetyNumber,
  generateSafetyNumberAsync,
  generateSafetyNumberFromBundles,
  generateSafetyNumberFromBundlesAsync,
  compareSafetyNumbers,
  verifyQRCode,
  verifyQRCodeFromBundles,
  checkIdentityChange,
  formatIdentityForDisplay
} from './crypto/safetyNumber'

// Crypto utilities (for advanced usage)
export {
  // ML-DSA-65 signatures
  generateDilithiumKeyPair,
  signWithDilithium as dilithiumSign,
  signWithDilithiumAsync as dilithiumSignAsync,
  verifyDilithiumSignature as dilithiumVerify,
  verifyDilithiumSignatureAsync as dilithiumVerifyAsync,
  createDilithiumVerifier,
  verifyWithDilithiumVerifierMeasured,
  verifyDilithiumSignatureMeasured,
  benchmarkDilithiumVerify,
  isValidPublicKey as isValidDilithiumPublicKey,
  
  // X25519
  generateX25519KeyPair,
  x25519DH,
  isValidX25519PublicKey,

  generateMLKEMKeyPair,
  generateMLKEMKeyPairAsync,
  
  // AES (text messages)
  encryptMessage,
  decryptMessage,
  
  // AES (binary/media)
  encryptBinary,
  decryptBinary,
  encryptChunk,
  decryptChunk,
  encryptBinaryChunked,
  decryptBinaryChunked,
  computeContentHash,
  computeContentHashMeasuredAsync,
  verifyContentIntegrity,
  encryptMetadata,
  decryptMetadata,
  encryptMedia,
  encryptMediaMeasuredAsync,
  encryptMediaToBlobFileMeasuredAsync,
  canUseNativeMediaFileCrypto,
  NATIVE_MEDIA_FILE_THRESHOLD_BYTES,
  decryptMedia,
  decryptMediaMeasuredAsync,
  decryptMediaFromBlobFileMeasuredAsync,
  
  // RTP-style voice/video call helpers
  deriveCallKeyMaterial,
  rotateCallKeys,
  shouldRotateKeys,
  disposeCallKeyMaterial,
  encryptRTPPacket,
  decryptRTPPacket,
  encryptCallSignal,
  decryptCallSignal,
  createCallSession,
  initializeCallKeys,
  updateCallState,
  endCallSession,
  getNextSignalSequence,
  ReplayWindow,

  // Metadata-hardened relay/control envelopes
  deriveRecipientMailboxToken,
  deriveScopedRecipientMailboxToken,
  deriveThreadToken,
  sealRelayEnvelope,
  openRelayEnvelope,
  sealControlEnvelope,
  openControlEnvelope,
  verifySealedSenderCredential,
  SealedEnvelopeReplayCache,
  
  // Session state serialization (for custom storage adapters)
  serializeSessionState,
  deserializeSessionState,
  
  // Utilities
  bytesToBase64,
  base64ToBytes,
  bytesToHex,
  hexToBytes,
  generateUUID,
  createFingerprint,
  createSessionFingerprint,
  secureZero,
  deriveStorageKey,
  isTimestampValid,
  createMessageHash,
  generateRandomBytes,
  sha256Hash
} from './crypto/index'
