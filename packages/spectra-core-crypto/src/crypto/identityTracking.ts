/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

/**
 * Identity Tracking (TOFU - Trust on First Use)
 * 
 * Tracks identity keys and alerts users when they change unexpectedly.
 * 
 * Security features:
 * - Stores history of identity keys
 * - Detects key changes and alerts users
 * - Supports manual verification
 * - Generates safety numbers for out-of-band verification
 */

import type {
  TrackedIdentity,
  IdentityKeyChangeEvent,
  PublicKeyBundle
} from '../types/index'
import {
  hash,
  concatBytes,
  base64ToBytes,
  bytesToBase64,
  stringToBytes,
  now
} from './utils'

// Identity Hash

/**
 * Create a hash of identity keys for quick comparison
 */
export function createIdentityHash(
  identityKey: string,
  dilithiumKey: string,
  mlkemKey: string
): string {
  const combined = concatBytes(
    base64ToBytes(identityKey),
    stringToBytes(dilithiumKey), // ML-DSA-65 key is hex (legacy field name)
    base64ToBytes(mlkemKey)
  )
  return bytesToBase64(hash(combined))
}

/**
 * Compare identity hashes in constant time.
 */
export function identityHashesMatch(hash1: string, hash2: string): boolean {
  const bytes1 = base64ToBytes(hash1)
  const bytes2 = base64ToBytes(hash2)
  
  if (bytes1.length !== bytes2.length) {
    return false
  }
  
  // Constant-time comparison
  let result = 0
  for (let i = 0; i < bytes1.length; i++) {
    result |= bytes1[i] ^ bytes2[i]
  }
  
  return result === 0
}

// Tracked Identity Operations

/**
 * Create a new tracked identity record
 */
export function createTrackedIdentity(
  identityId: string,
  identityKey: string,
  dilithiumKey: string,
  mlkemKey: string
): TrackedIdentity {
  const timestamp = now()
  return {
    identityId,
    currentIdentityKey: identityKey,
    currentDilithiumKey: dilithiumKey,
    currentMlkemKey: mlkemKey,
    trustState: 'trusted', // Auto-trust on first use (TOFU)
    firstSeenAt: timestamp,
    lastUpdatedAt: timestamp,
    previousKeys: [],
    identityHash: createIdentityHash(identityKey, dilithiumKey, mlkemKey)
  }
}

/**
 * Create tracked identity from a public key bundle
 */
export function createTrackedIdentityFromBundle(bundle: PublicKeyBundle): TrackedIdentity {
  return createTrackedIdentity(
    bundle.identityId,
    bundle.identityKey,
    bundle.dilithiumKey,
    bundle.mlkemIdentityKey
  )
}

/**
 * Check if identity keys have changed
 */
export function hasIdentityChanged(
  tracked: TrackedIdentity,
  newIdentityKey: string,
  newDilithiumKey: string,
  newMlkemKey: string
): boolean {
  const newHash = createIdentityHash(newIdentityKey, newDilithiumKey, newMlkemKey)
  return !identityHashesMatch(tracked.identityHash, newHash)
}

/**
 * Check if identity keys match a bundle
 */
export function identityMatchesBundle(
  tracked: TrackedIdentity,
  bundle: PublicKeyBundle
): boolean {
  return !hasIdentityChanged(
    tracked,
    bundle.identityKey,
    bundle.dilithiumKey,
    bundle.mlkemIdentityKey
  )
}

/**
 * Update tracked identity with new keys (when change is acknowledged)
 * Returns an identity key change event for notification
 */
export function updateTrackedIdentity(
  tracked: TrackedIdentity,
  newIdentityKey: string,
  newDilithiumKey: string,
  newMlkemKey: string,
  reason: 'key_change' | 'rotation' | 'manual_reset' = 'key_change'
): { updated: TrackedIdentity; event: IdentityKeyChangeEvent } {
  const timestamp = now()
  
  // Store the old keys in history
  const previousKey = {
    identityKey: tracked.currentIdentityKey,
    dilithiumKey: tracked.currentDilithiumKey,
    mlkemKey: tracked.currentMlkemKey,
    replacedAt: timestamp,
    reason
  }
  
  // Determine severity based on circumstances
  let severity: 'low' | 'medium' | 'high' | 'critical' = 'medium'
  
  // If the identity was verified and keys changed, this is more concerning
  if (tracked.trustState === 'verified') {
    severity = 'high'
  }
  
  // If keys changed very recently, this is suspicious
  const timeSinceLastUpdate = timestamp - tracked.lastUpdatedAt
  if (timeSinceLastUpdate < 24 * 60 * 60 * 1000) { // Less than 24 hours
    severity = severity === 'high' ? 'critical' : 'high'
  }
  
  const event: IdentityKeyChangeEvent = {
    identityId: tracked.identityId,
    previousIdentityKey: tracked.currentIdentityKey,
    newIdentityKey,
    severity,
    detectedAt: timestamp,
    acknowledged: false
  }
  
  const updated: TrackedIdentity = {
    ...tracked,
    currentIdentityKey: newIdentityKey,
    currentDilithiumKey: newDilithiumKey,
    currentMlkemKey: newMlkemKey,
    trustState: 'changed', // Mark as changed until user acknowledges
    lastUpdatedAt: timestamp,
    previousKeys: [...tracked.previousKeys, previousKey].slice(-10), // Keep last 10
    identityHash: createIdentityHash(newIdentityKey, newDilithiumKey, newMlkemKey)
  }
  
  return { updated, event }
}

/**
 * Mark an identity as verified by the user
 */
export function verifyIdentity(tracked: TrackedIdentity): TrackedIdentity {
  return {
    ...tracked,
    trustState: 'verified',
    lastVerifiedAt: now()
  }
}

/**
 * Mark an identity as blocked
 */
export function blockIdentity(tracked: TrackedIdentity): TrackedIdentity {
  return {
    ...tracked,
    trustState: 'blocked',
    lastUpdatedAt: now()
  }
}

/**
 * Acknowledge a key change (accept the new keys)
 */
export function acknowledgeKeyChange(tracked: TrackedIdentity): TrackedIdentity {
  if (tracked.trustState !== 'changed') {
    return tracked
  }
  
  return {
    ...tracked,
    trustState: 'trusted', // Back to trusted after acknowledgement
    lastUpdatedAt: now()
  }
}

/**
 * Check if communication should be allowed based on trust state
 */
export function isCommunicationAllowed(tracked: TrackedIdentity): {
  allowed: boolean
  requiresUserAction: boolean
  reason?: string
} {
  switch (tracked.trustState) {
    case 'unknown':
      return { 
        allowed: false, 
        requiresUserAction: true,
        reason: 'Identity has not been seen before'
      }
    case 'trusted':
    case 'verified':
      return { allowed: true, requiresUserAction: false }
    case 'changed':
      return { 
        allowed: false, 
        requiresUserAction: true,
        reason: 'Identity keys have changed. Please verify this contact.'
      }
    case 'blocked':
      return { 
        allowed: false, 
        requiresUserAction: false,
        reason: 'This identity has been blocked'
      }
    default:
      return { 
        allowed: false, 
        requiresUserAction: true,
        reason: 'Unknown trust state'
      }
  }
}

// Key Verification Helpers

/**
 * Verify that session keys match tracked identity
 * This should be called before encrypting/decrypting messages
 */
export function verifySessionIdentity(
  tracked: TrackedIdentity,
  boundIdentityKey: string,
  boundDilithiumKey: string
): { valid: boolean; reason?: string } {
  // Check if the session's bound keys match the current tracked identity
  if (tracked.currentIdentityKey !== boundIdentityKey) {
    return {
      valid: false,
      reason: 'Session identity key does not match current tracked identity key'
    }
  }
  
  if (tracked.currentDilithiumKey !== boundDilithiumKey) {
    return {
      valid: false,
      reason: 'Session ML-DSA-65 key does not match current tracked ML-DSA-65 key'
    }
  }
  
  // Check trust state
  const { allowed, reason } = isCommunicationAllowed(tracked)
  if (!allowed) {
    return { valid: false, reason }
  }
  
  return { valid: true }
}
