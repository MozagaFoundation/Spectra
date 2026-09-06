/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

/**
 * X25519 Key Exchange Functions
 * 
 * Provides Elliptic Curve Diffie-Hellman key exchange using Curve25519.
 * Uses @noble/curves for pure JavaScript implementation.
 */

import { x25519 } from '@noble/curves/ed25519'
import { generateRandomBytes, bytesToBase64, base64ToBytes } from './utils'
import { CryptoError } from '../types/index'

// X25519 key length
const KEY_LENGTH = 32
const LOW_ORDER_PUBLIC_KEYS_HEX = new Set([
  '0000000000000000000000000000000000000000000000000000000000000000',
  '0100000000000000000000000000000000000000000000000000000000000000',
  'e0eb7a7c3b41b8ae1656e3faf19fc46ada098deb9c32b1fd866205165f49b800',
  '5f9c95bca3508c24b1d0b1559c83ef5b04445c4628dcb2cdeb0f58e2a45f9a3d',
  'ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
  'edffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
  'eeffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
])

export interface X25519KeyPair {
  publicKey: string  // base64 encoded
  privateKey: string // base64 encoded
}

/**
 * Generate a new X25519 key pair
 * 
 * @returns Key pair with base64 encoded public and private keys
 */
export function generateX25519KeyPair(): X25519KeyPair {
  const privateKey = generateRandomBytes(KEY_LENGTH)
  const publicKey = x25519.getPublicKey(privateKey)
  
  return {
    publicKey: bytesToBase64(publicKey),
    privateKey: bytesToBase64(privateKey)
  }
}

/**
 * Derive the X25519 public key for an existing private key.
 */
export function deriveX25519PublicKey(privateKey: string): string {
  const privateKeyBytes = base64ToBytes(privateKey)
  if (privateKeyBytes.length !== KEY_LENGTH) {
    throw new CryptoError(`Private key must be ${KEY_LENGTH} bytes`)
  }
  return bytesToBase64(x25519.getPublicKey(privateKeyBytes))
}

/**
 * Perform X25519 Diffie-Hellman key exchange
 * 
 * @param privateKey Our private key (base64 encoded)
 * @param publicKey Their public key (base64 encoded)
 * @returns Shared secret (Uint8Array, 32 bytes)
 */
export function x25519DH(privateKey: string, publicKey: string): Uint8Array {
  const privateKeyBytes = base64ToBytes(privateKey)
  const publicKeyBytes = base64ToBytes(publicKey)
  
  if (privateKeyBytes.length !== KEY_LENGTH) {
    throw new CryptoError(`Private key must be ${KEY_LENGTH} bytes`)
  }
  
  if (publicKeyBytes.length !== KEY_LENGTH) {
    throw new CryptoError(`Public key must be ${KEY_LENGTH} bytes`)
  }

  if (!isValidX25519PublicKey(publicKey)) {
    throw new CryptoError('Invalid X25519 public key')
  }
  
  return x25519.getSharedSecret(privateKeyBytes, publicKeyBytes)
}

/**
 * Validate an X25519 public key
 * 
 * @param publicKey Base64 encoded public key
 * @returns True if the key is valid
 */
export function isValidX25519PublicKey(publicKey: string): boolean {
  try {
    const keyBytes = base64ToBytes(publicKey)
    
    if (keyBytes.length !== KEY_LENGTH) {
      return false
    }
    
    const keyHex = Array.from(keyBytes).map(b => b.toString(16).padStart(2, '0')).join('')
    if (LOW_ORDER_PUBLIC_KEYS_HEX.has(keyHex)) {
      return false
    }
    
    return true
  } catch {
    return false
  }
}

