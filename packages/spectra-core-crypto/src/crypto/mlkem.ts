/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

/**
 * ML-KEM-768 Post-Quantum Key Encapsulation
 *
 * `@noble/post-quantum` remains the JS oracle. iOS/Android keygen, encaps, and
 * decaps offload to PQClean ML-KEM-768 on a native worker. Decaps copies the
 * ML-KEM secret key for the call, then wipes native buffers.
 */

// @ts-ignore - @noble/post-quantum has correct exports but TS may not resolve them
import { ml_kem768 } from '@noble/post-quantum/ml-kem.js'
import { bytesToBase64, base64ToBytes } from './utils'
import { CryptoError } from '../types/index'

export const MLKEM_PUBLIC_KEY_SIZE = 1184
export const MLKEM_SECRET_KEY_SIZE = 2400
export const MLKEM_CIPHERTEXT_SIZE = 1088
export const MLKEM_SHARED_SECRET_SIZE = 32

export interface MLKEMKeyPair {
  publicKey: string  // base64 encoded
  privateKey: string // base64 encoded
}

export interface MLKEMEncapsulation {
  ciphertext: string   // base64 encoded
  sharedSecret: Uint8Array // 32 bytes
}

interface NativeMlKemModule {
  generateKeyPair?(): Promise<{ publicKey?: string; privateKey?: string }>
  encapsulate(publicKeyBase64: string): Promise<{ ciphertext?: string; sharedSecret?: string }>
  decapsulate(ciphertextBase64: string, secretKeyBase64: string): Promise<string>
}

let nativeMlKemModule: NativeMlKemModule | null | undefined

export function __setNativeMlKemModuleForTests(module: NativeMlKemModule | null | undefined): void {
  if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'test') {
    return
  }
  nativeMlKemModule = module
}

function getNativeMlKemModule(): NativeMlKemModule | null {
  if (nativeMlKemModule !== undefined) {
    return nativeMlKemModule
  }
  try {
    const { NativeModules } = require('react-native')
    nativeMlKemModule = (NativeModules.MlKemModule as NativeMlKemModule | undefined) ?? null
  } catch {
    nativeMlKemModule = null
  }
  return nativeMlKemModule
}

export function generateMLKEMKeyPair(): MLKEMKeyPair {
  const keyPair = ml_kem768.keygen()
  return {
    publicKey: bytesToBase64(keyPair.publicKey),
    privateKey: bytesToBase64(keyPair.secretKey)
  }
}

export async function generateMLKEMKeyPairAsync(): Promise<MLKEMKeyPair> {
  const native = getNativeMlKemModule()
  if (native?.generateKeyPair) {
    const result = await native.generateKeyPair()
    let publicKeyBytes: Uint8Array
    let privateKeyBytes: Uint8Array
    try {
      publicKeyBytes = base64ToBytes(result?.publicKey ?? '')
      privateKeyBytes = base64ToBytes(result?.privateKey ?? '')
    } catch {
      throw new CryptoError('native ML-KEM-768 keygen returned invalid encoding')
    }
    try {
      if (
        publicKeyBytes.length !== MLKEM_PUBLIC_KEY_SIZE
        || privateKeyBytes.length !== MLKEM_SECRET_KEY_SIZE
      ) {
        throw new CryptoError('native ML-KEM-768 keygen returned invalid sizes')
      }
      return {
        publicKey: bytesToBase64(publicKeyBytes),
        privateKey: bytesToBase64(privateKeyBytes),
      }
    } finally {
      privateKeyBytes.fill(0)
    }
  }

  return generateMLKEMKeyPair()
}

export function encapsulate(publicKey: string): MLKEMEncapsulation {
  const publicKeyBytes = base64ToBytes(publicKey)
  if (publicKeyBytes.length !== MLKEM_PUBLIC_KEY_SIZE) {
    throw new CryptoError(`Invalid ML-KEM public key size: expected ${MLKEM_PUBLIC_KEY_SIZE}, got ${publicKeyBytes.length}`)
  }

  const result = ml_kem768.encapsulate(publicKeyBytes)
  return {
    ciphertext: bytesToBase64(result.cipherText),
    sharedSecret: result.sharedSecret
  }
}

export async function encapsulateAsync(publicKey: string): Promise<MLKEMEncapsulation> {
  const publicKeyBytes = base64ToBytes(publicKey)
  if (publicKeyBytes.length !== MLKEM_PUBLIC_KEY_SIZE) {
    throw new CryptoError(`Invalid ML-KEM public key size: expected ${MLKEM_PUBLIC_KEY_SIZE}, got ${publicKeyBytes.length}`)
  }

  const native = getNativeMlKemModule()
  if (native?.encapsulate) {
    const result = await native.encapsulate(bytesToBase64(publicKeyBytes))
    let ciphertextBytes: Uint8Array
    let sharedSecret: Uint8Array
    try {
      ciphertextBytes = base64ToBytes(result?.ciphertext ?? '')
      sharedSecret = base64ToBytes(result?.sharedSecret ?? '')
    } catch {
      throw new CryptoError('native ML-KEM-768 encaps returned invalid encoding')
    }
    if (
      ciphertextBytes.length !== MLKEM_CIPHERTEXT_SIZE
      || sharedSecret.length !== MLKEM_SHARED_SECRET_SIZE
    ) {
      throw new CryptoError('native ML-KEM-768 encaps returned invalid sizes')
    }
    return {
      ciphertext: bytesToBase64(ciphertextBytes),
      sharedSecret,
    }
  }

  return encapsulate(publicKey)
}

export function decapsulate(ciphertext: string, privateKey: string): Uint8Array {
  const ciphertextBytes = base64ToBytes(ciphertext)
  const privateKeyBytes = base64ToBytes(privateKey)

  if (ciphertextBytes.length !== MLKEM_CIPHERTEXT_SIZE) {
    throw new CryptoError(`Invalid ML-KEM ciphertext size: expected ${MLKEM_CIPHERTEXT_SIZE}, got ${ciphertextBytes.length}`)
  }
  if (privateKeyBytes.length !== MLKEM_SECRET_KEY_SIZE) {
    throw new CryptoError(`Invalid ML-KEM private key size: expected ${MLKEM_SECRET_KEY_SIZE}, got ${privateKeyBytes.length}`)
  }

  return ml_kem768.decapsulate(ciphertextBytes, privateKeyBytes)
}

export async function decapsulateAsync(ciphertext: string, privateKey: string): Promise<Uint8Array> {
  const ciphertextBytes = base64ToBytes(ciphertext)
  const privateKeyBytes = base64ToBytes(privateKey)
  try {
    if (ciphertextBytes.length !== MLKEM_CIPHERTEXT_SIZE) {
      throw new CryptoError(`Invalid ML-KEM ciphertext size: expected ${MLKEM_CIPHERTEXT_SIZE}, got ${ciphertextBytes.length}`)
    }
    if (privateKeyBytes.length !== MLKEM_SECRET_KEY_SIZE) {
      throw new CryptoError(`Invalid ML-KEM private key size: expected ${MLKEM_SECRET_KEY_SIZE}, got ${privateKeyBytes.length}`)
    }

    const native = getNativeMlKemModule()
    if (native?.decapsulate) {
      const sharedSecretBase64 = await native.decapsulate(
        bytesToBase64(ciphertextBytes),
        bytesToBase64(privateKeyBytes),
      )
      let sharedSecret: Uint8Array
      try {
        sharedSecret = base64ToBytes(sharedSecretBase64)
      } catch {
        throw new CryptoError('native ML-KEM-768 decaps returned invalid encoding')
      }
      if (sharedSecret.length !== MLKEM_SHARED_SECRET_SIZE) {
        throw new CryptoError('native ML-KEM-768 decaps returned an invalid shared secret')
      }
      return sharedSecret
    }

    return decapsulate(ciphertext, privateKey)
  } finally {
    privateKeyBytes.fill(0)
  }
}

export function isValidMLKEMPublicKey(publicKey: string): boolean {
  try {
    const keyBytes = base64ToBytes(publicKey)
    return keyBytes.length === MLKEM_PUBLIC_KEY_SIZE
  } catch {
    return false
  }
}
