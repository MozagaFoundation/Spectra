/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

/**
 * ML-DSA-65 (FIPS 204) signing wrapper.
 * Historical `Dilithium` exports are retained for compatibility.
 */

// @ts-ignore: runtime export exists.
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import { keccak_256 } from '@noble/hashes/sha3'

const PUBLIC_KEY_SIZE = 1952
const PRIVATE_KEY_SIZE = 4032
const SIGNATURE_SIZE = 3309

interface KeyPair {
  publicKey: Uint8Array
  privateKey: Uint8Array
}

class DilithiumError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DilithiumError'
  }
}

export class Dilithium {
  private static instance: Dilithium | null = null

  private constructor() {}

  static async init(): Promise<Dilithium> {
    if (!Dilithium.instance) {
      Dilithium.instance = new Dilithium()
    }
    return Dilithium.instance
  }

  generateKeyPairFromSeed(seed: Uint8Array): KeyPair {
    if (seed.length !== 32) {
      throw new DilithiumError('Seed must be exactly 32 bytes')
    }

    try {
      const { publicKey, secretKey } = ml_dsa65.keygen(seed)
      return {
        publicKey,
        privateKey: secretKey
      }
    } catch (error) {
      throw new DilithiumError(`Key generation from seed failed: ${(error as Error).message}`)
    }
  }

  sign(message: Uint8Array, privateKey: Uint8Array): Uint8Array {
    if (privateKey.length !== PRIVATE_KEY_SIZE) {
      throw new DilithiumError(`Private key must be ${PRIVATE_KEY_SIZE} bytes, got ${privateKey.length}`)
    }

    try {
      return ml_dsa65.sign(message, privateKey)
    } catch (error) {
      throw new DilithiumError(`Signing failed: ${(error as Error).message}`)
    }
  }

  verify(message: Uint8Array, signature: Uint8Array, publicKey: Uint8Array): boolean {
    if (signature.length !== SIGNATURE_SIZE) {
      throw new DilithiumError(`Signature must be ${SIGNATURE_SIZE} bytes, got ${signature.length}`)
    }
    if (publicKey.length !== PUBLIC_KEY_SIZE) {
      throw new DilithiumError(`Public key must be ${PUBLIC_KEY_SIZE} bytes, got ${publicKey.length}`)
    }

    try {
      return ml_dsa65.verify(signature, message, publicKey)
    } catch (error) {
      return false
    }
  }

  deriveAddress(publicKey: Uint8Array): string {
    if (publicKey.length !== PUBLIC_KEY_SIZE) {
      throw new DilithiumError(`Public key must be ${PUBLIC_KEY_SIZE} bytes, got ${publicKey.length}`)
    }

    const addressBytes = this.deriveAddressBytes(publicKey)
    return 'EXO' + bytesToHex(addressBytes).slice(2)
  }

  private deriveAddressBytes(publicKey: Uint8Array): Uint8Array {
    if (publicKey.length !== PUBLIC_KEY_SIZE) {
      throw new DilithiumError(`Public key must be ${PUBLIC_KEY_SIZE} bytes, got ${publicKey.length}`)
    }

    const hash = keccak_256(publicKey)
    const addressPart = hash.slice(-19)
    const addressBytes = new Uint8Array(20)
    addressBytes[0] = 0x00
    addressBytes.set(addressPart, 1)
    
    return addressBytes
  }

}

export function bytesToHex(bytes: Uint8Array): string {
  return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

export function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex
  if (cleanHex.length % 2 !== 0) {
    throw new Error('Invalid hex string length')
  }
  if (!/^[0-9a-fA-F]*$/.test(cleanHex)) {
    throw new Error('Invalid hex string')
  }
  const bytes = new Uint8Array(cleanHex.length / 2)
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16)
  }
  return bytes
}

