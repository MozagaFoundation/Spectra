/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import * as Crypto from 'expo-crypto'
import * as SecureStore from 'expo-secure-store'
import { hkdf } from '@noble/hashes/hkdf'
import { sha256 } from '@noble/hashes/sha256'
import { base64ToBytes, bytesToBase64, decrypt, encrypt } from '@spectra/identity-vault'
import { normalizeAccountStorageScope } from '@/lib/accountScope'
import { SECURE_STORE_OPTIONS, VAULT_SECURITY_KEYS } from '@/lib/constants'
import { isNativeCryptoCancellation } from './nativeCryptoJobs'

export type LocalCacheDomain =
  | 'direct'
  | 'group'
  | 'avatar'
  | 'attachment'
  | 'notification'
  | 'ble'
  | 'chat-secret'
  | 'wallet-index'

export type LocalCacheCipher = {
  v: 1
  algorithm: 'AES-256-GCM'
  ciphertext: string
  iv: string
}

const ROOT_KEY_BYTES = 32
const DERIVED_KEY_BYTES = 32
const GCM_TAG_BYTES = 16
const GCM_NONCE_BYTES = 12
const ROOT_SALT = new TextEncoder().encode('spectra:local-cache-root:v1')
let rootKeyPromise: Promise<Uint8Array> | null = null
let nativeCacheAesJobSeq = 0

interface NativeCacheAesModule {
  encryptAesGcm(
    key: string,
    plaintext: string,
    associatedData?: string | null,
    jobId?: string | null,
  ): Promise<{ ciphertext: string; nonce: string; tag: string }>
  decryptAesGcm(
    key: string,
    ciphertext: string,
    nonce: string,
    tag: string,
    associatedData?: string | null,
    jobId?: string | null,
  ): Promise<string>
}

function nextNativeCacheAesJobId(): string {
  nativeCacheAesJobSeq += 1
  return `cache-aes-${nativeCacheAesJobSeq}`
}

function concatBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  const combined = new Uint8Array(left.length + right.length)
  combined.set(left)
  combined.set(right, left.length)
  return combined
}

function getNativeCacheAesModule(): NativeCacheAesModule | null {
  try {
    const { NativeModules } = require('react-native') as {
      NativeModules?: { MediaCryptoModule?: Partial<NativeCacheAesModule> }
    }
    const native = NativeModules?.MediaCryptoModule
    if (native?.encryptAesGcm && native.decryptAesGcm) {
      return native as NativeCacheAesModule
    }
  } catch {
    return null
  }
  return null
}

async function loadOrCreateRootKey(): Promise<Uint8Array> {
  const stored = await SecureStore.getItemAsync(
    VAULT_SECURITY_KEYS.LOCAL_CACHE_ROOT_KEY,
    SECURE_STORE_OPTIONS,
  )
  if (stored) {
    const key = base64ToBytes(stored)
    if (key.byteLength === ROOT_KEY_BYTES) {
      return key
    }
  }

  const key = await Crypto.getRandomBytesAsync(ROOT_KEY_BYTES)
  await SecureStore.setItemAsync(
    VAULT_SECURITY_KEYS.LOCAL_CACHE_ROOT_KEY,
    bytesToBase64(key),
    SECURE_STORE_OPTIONS,
  )
  return key
}

function getRootKey(): Promise<Uint8Array> {
  if (!rootKeyPromise) {
    rootKeyPromise = loadOrCreateRootKey().catch((error) => {
      rootKeyPromise = null
      throw error
    })
  }
  return rootKeyPromise
}

export function buildLocalCacheAad(parts: string[]): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(parts))
}

export async function getLocalCacheKey(
  walletAddress: string,
  domain: LocalCacheDomain,
): Promise<Uint8Array> {
  const scope = normalizeAccountStorageScope(walletAddress)
  if (!scope) {
    throw new Error('Local cache wallet scope is required')
  }

  const rootKey = await getRootKey()
  const info = new TextEncoder().encode(`spectra:local-cache:v1:${scope}:${domain}`)
  return hkdf(sha256, rootKey, ROOT_SALT, info, DERIVED_KEY_BYTES)
}

export async function sealLocalCacheText(
  walletAddress: string,
  domain: LocalCacheDomain,
  plaintext: string,
  aad: Uint8Array,
): Promise<LocalCacheCipher> {
  const key = await getLocalCacheKey(walletAddress, domain)
  try {
    const native = getNativeCacheAesModule()
    if (native) {
      try {
        const encrypted = await native.encryptAesGcm(
          bytesToBase64(key),
          bytesToBase64(new TextEncoder().encode(plaintext)),
          bytesToBase64(aad),
          nextNativeCacheAesJobId(),
        )
        const nonce = base64ToBytes(encrypted.nonce)
        const tag = base64ToBytes(encrypted.tag)
        if (nonce.byteLength === GCM_NONCE_BYTES && tag.byteLength === GCM_TAG_BYTES) {
          return {
            v: 1,
            algorithm: 'AES-256-GCM',
            ciphertext: bytesToBase64(concatBytes(base64ToBytes(encrypted.ciphertext), tag)),
            iv: encrypted.nonce,
          }
        }
      } catch (error) {
        if (isNativeCryptoCancellation(error)) throw error
      }
    }
    const sealed = encrypt(plaintext, key, aad)
    return {
      v: 1,
      algorithm: 'AES-256-GCM',
      ciphertext: sealed.ciphertext,
      iv: sealed.iv,
    }
  } finally {
    key.fill(0)
  }
}

export async function openLocalCacheText(
  walletAddress: string,
  domain: LocalCacheDomain,
  cipher: LocalCacheCipher,
  aad: Uint8Array,
): Promise<string> {
  if (cipher.v !== 1 || cipher.algorithm !== 'AES-256-GCM') {
    throw new Error('Unsupported local cache cipher')
  }
  const key = await getLocalCacheKey(walletAddress, domain)
  try {
    const native = getNativeCacheAesModule()
    if (native) {
      try {
        const ciphertextWithTag = base64ToBytes(cipher.ciphertext)
        if (ciphertextWithTag.byteLength >= GCM_TAG_BYTES) {
          const ciphertext = ciphertextWithTag.subarray(0, ciphertextWithTag.byteLength - GCM_TAG_BYTES)
          const tag = ciphertextWithTag.subarray(ciphertextWithTag.byteLength - GCM_TAG_BYTES)
          const plaintextBase64 = await native.decryptAesGcm(
            bytesToBase64(key),
            bytesToBase64(ciphertext.slice()),
            cipher.iv,
            bytesToBase64(tag.slice()),
            bytesToBase64(aad),
            nextNativeCacheAesJobId(),
          )
          return new TextDecoder().decode(base64ToBytes(plaintextBase64))
        }
      } catch (error) {
        if (isNativeCryptoCancellation(error)) throw error
      }
    }
    return decrypt(cipher.ciphertext, cipher.iv, key, aad)
  } finally {
    key.fill(0)
  }
}

export function clearLocalCacheKeyMemory(): void {
  const pendingRootKey = rootKeyPromise
  rootKeyPromise = null
  void pendingRootKey?.then((key) => key.fill(0)).catch(() => undefined)
}
