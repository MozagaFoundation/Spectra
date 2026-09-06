/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

/**
 * Cryptographic Module Exports
 * 
 * This module exports Spectra cryptographic primitives:
 * - X25519 key exchange (classical)
 * - ML-KEM key encapsulation (post-quantum)
 * - AES-256-GCM encryption (messages, media, documents)
 * - Binary/media encryption with chunking support
 * - ML-DSA-65 post-quantum signatures (via @noble/post-quantum)
 * - Hybrid X3DH key agreement (X25519 + ML-KEM)
 * - Double Ratchet protocol
 * - Voice/Video call encryption (SRTP-like)
 */

// Utilities
export * from './utils'

// X25519 key exchange (classical)
export * from './x25519'

// ML-KEM key encapsulation (post-quantum)
export * from './mlkem'

// AES encryption (messages + binary/media)
export * from './aes'

// ML-DSA-65 signatures (React Native compatible via @noble/post-quantum)
export * from './dilithium'

// Hybrid X3DH key agreement
export * from './x3dh'

// Double Ratchet
export * from './ratchet'

// Safety Number generation
export * from './safetyNumber'

// Voice/Video Call Encryption
export {
  // Key derivation
  deriveCallKeyMaterial,
  rotateCallKeys,
  shouldRotateKeys,
  disposeCallKeyMaterial,
  // RTP packet encryption
  encryptRTPPacket,
  decryptRTPPacket,
  // Call signaling
  encryptCallSignal,
  decryptCallSignal,
  // Call session management
  createCallSession,
  initializeCallKeys,
  updateCallState,
  endCallSession,
  getNextSignalSequence,
  // Replay protection
  ReplayWindow
} from './call'

// Metadata-hardened sealed relay/control envelopes
export * from './sealedEnvelope'

// Signed metadata capability advertisements
export * from './bundleCapabilities'

// Signed contact-only profile snapshots
export * from './contactProfile'

// Wallet authorization for directory-published identity bundles
export * from './walletAuthorization'

// Identity Tracking (TOFU)
export {
  createIdentityHash,
  identityHashesMatch,
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
} from './identityTracking'
