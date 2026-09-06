/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { gcm } from '@noble/ciphers/aes'
import { sha256 } from '@noble/hashes/sha256'
import { describe, expect, it } from 'vitest'
import {
  __setNativeMediaCryptoModuleForTests,
  computeContentHashMeasuredAsync,
  decryptBinary,
  decryptBinaryChunked,
  decryptChunk,
  decryptMedia,
  decryptMediaMeasuredAsync,
  decryptMessage,
  decryptMetadata,
  encryptBinary,
  encryptBinaryChunked,
  encryptChunk,
  encryptMedia,
  encryptMediaMeasuredAsync,
  encryptMessage,
  encryptMetadata,
  verifyContentIntegrity,
} from './aes'
import { generateRandomBytes, stringToBytes } from './utils'
import type { EncryptedChunk, MediaMetadata } from '../types'
import { expectCryptoRejects, tamperBase64 } from '../__tests__/helpers/cryptoTestHelpers'

const key = new Uint8Array(32).fill(7)
const aad = stringToBytes('conversation:alice:bob')

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(Buffer.from(value, 'base64'))
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

describe('AES-GCM message and binary encryption', () => {
  it('round-trips text messages with associated data', () => {
    const encrypted = encryptMessage(key, 'hello quantum world', aad)

    expect(decryptMessage(key, encrypted.ciphertext, encrypted.nonce, encrypted.tag, aad))
      .toBe('hello quantum world')
  })

  it('round-trips empty and binary plaintexts', () => {
    const empty = encryptBinary(key, new Uint8Array(), aad)
    expect(decryptBinary(key, empty.ciphertext, empty.nonce, empty.tag, aad)).toEqual(new Uint8Array())

    const payload = generateRandomBytes(4096)
    const encrypted = encryptBinary(key, payload, aad)
    expect(decryptBinary(key, encrypted.ciphertext, encrypted.nonce, encrypted.tag, aad)).toEqual(payload)
  })

  it('rejects tampered ciphertext, nonce, tag, key, and associated data', async () => {
    const encrypted = encryptMessage(key, 'authenticated', aad)

    await expectCryptoRejects(() => decryptMessage(key, tamperBase64(encrypted.ciphertext), encrypted.nonce, encrypted.tag, aad))
    await expectCryptoRejects(() => decryptMessage(key, encrypted.ciphertext, tamperBase64(encrypted.nonce), encrypted.tag, aad))
    await expectCryptoRejects(() => decryptMessage(key, encrypted.ciphertext, encrypted.nonce, tamperBase64(encrypted.tag), aad))
    await expectCryptoRejects(() => decryptMessage(new Uint8Array(32).fill(8), encrypted.ciphertext, encrypted.nonce, encrypted.tag, aad))
    await expectCryptoRejects(() => decryptMessage(key, encrypted.ciphertext, encrypted.nonce, encrypted.tag, stringToBytes('wrong-ad')))
  })

  it('requires 32-byte AES keys', () => {
    expect(() => encryptMessage(new Uint8Array(31), 'nope')).toThrow()
    expect(() => decryptMessage(new Uint8Array(31), '', '', '')).toThrow()
  })
})

describe('AES-GCM media and chunked encryption', () => {
  it('round-trips encrypted metadata and media attachments', () => {
    const metadata: MediaMetadata = {
      fileName: 'image.png',
      mimeType: 'image/png',
      fileSize: 5,
      mediaType: 'image',
      contentHash: '',
      createdAt: 1_717_171_717_000,
      caption: 'test',
    }
    const content = stringToBytes('image-bytes')

    const encryptedMetadata = encryptMetadata(key, metadata, aad)
    expect(decryptMetadata(key, encryptedMetadata, aad)).toEqual(metadata)

    const encryptedMedia = encryptMedia(key, content, metadata, { associatedData: aad })
    const decrypted = decryptMedia(key, encryptedMedia, { associatedData: aad })

    expect(decrypted.content).toEqual(content)
    expect(decrypted.metadata.contentHash).toHaveLength(64)
    expect(decrypted.integrityVerified).toBe(true)
  })

  it('round-trips media through the measured JS fallback', async () => {
    const metadata: MediaMetadata = {
      fileName: 'image.png',
      mimeType: 'image/png',
      fileSize: 5,
      mediaType: 'image',
      contentHash: '',
      createdAt: 1_717_171_717_000,
    }
    const content = stringToBytes('image-bytes')

    const result = await encryptMediaMeasuredAsync(key, content, metadata, { associatedData: aad })
    const decrypted = decryptMedia(key, result.encrypted, { associatedData: aad })

    expect(decrypted.content).toEqual(content)
    expect(result.performance.source).toBe('js')
    expect(result.performance.sourceBytes).toBe(content.length)
  })

  it('uses native media crypto when the Android module is available', async () => {
    __setNativeMediaCryptoModuleForTests({
      sha256: async (data: string) => toHex(sha256(fromBase64(data))),
      encryptAesGcm: async (keyBase64: string, plaintextBase64: string, associatedDataBase64?: string | null) => {
        const nonce = new Uint8Array(12).fill(9)
        const ciphertextWithTag = gcm(
          fromBase64(keyBase64),
          nonce,
          associatedDataBase64 ? fromBase64(associatedDataBase64) : undefined,
        ).encrypt(fromBase64(plaintextBase64))
        return {
          ciphertext: toBase64(ciphertextWithTag.slice(0, -16)),
          nonce: toBase64(nonce),
          tag: toBase64(ciphertextWithTag.slice(-16)),
        }
      },
      decryptAesGcm: async (
        keyBase64: string,
        ciphertextBase64: string,
        nonceBase64: string,
        tagBase64: string,
        associatedDataBase64?: string | null,
      ) => {
        const ciphertextWithTag = new Uint8Array([
          ...fromBase64(ciphertextBase64),
          ...fromBase64(tagBase64),
        ])
        const plaintext = gcm(
          fromBase64(keyBase64),
          fromBase64(nonceBase64),
          associatedDataBase64 ? fromBase64(associatedDataBase64) : undefined,
        ).decrypt(ciphertextWithTag)
        return toBase64(plaintext)
      },
    })

    const metadata: MediaMetadata = {
      fileName: 'native.png',
      mimeType: 'image/png',
      fileSize: 5,
      mediaType: 'image',
      contentHash: '',
      createdAt: 1_717_171_717_000,
    }
    const content = stringToBytes('native-image-bytes')
    try {
      const result = await encryptMediaMeasuredAsync(key, content, metadata, { associatedData: aad })
      const decrypted = await decryptMediaMeasuredAsync(key, result.encrypted, { associatedData: aad })
      const hashMetrics = await computeContentHashMeasuredAsync(content)

      expect(decrypted.content).toEqual(content)
      expect(result.performance.source).toBe('native')
      expect(hashMetrics.source).toBe('native')
    } finally {
      __setNativeMediaCryptoModuleForTests(null)
    }
  })

  it('round-trips chunked binary payloads and reports progress', () => {
    const payload = new Uint8Array(5 * 1024 * 1024 + 128)
    for (let i = 0; i < payload.length; i++) payload[i] = i & 0xff
    const progress: number[] = []
    const encrypted = encryptBinaryChunked(key, payload, {
      chunkSize: 1024 * 1024,
      associatedData: aad,
      onProgress: p => progress.push(p.chunksComplete),
    })

    expect(Array.isArray(encrypted)).toBe(true)
    const decrypted = decryptBinaryChunked(key, encrypted as EncryptedChunk[], aad)
    expect(decrypted).toEqual(payload)
    expect(progress.at(-1)).toBe((encrypted as EncryptedChunk[]).length)
  }, 60_000)

  it('rejects missing chunks and a non-final tail chunk', async () => {
    const chunks = [
      encryptChunk(key, stringToBytes('first'), 0, false, aad),
      encryptChunk(key, stringToBytes('second'), 1, true, aad),
    ]

    await expectCryptoRejects(() => decryptBinaryChunked(key, [chunks[1]], aad))
    await expectCryptoRejects(() => decryptBinaryChunked(key, [{ ...chunks[1], isFinal: false }], aad))
  })

  it('detects content integrity mismatches', () => {
    expect(verifyContentIntegrity(stringToBytes('data'), '00'.repeat(32))).toBe(false)
  })

  it('reports measured content hashing metrics', async () => {
    const content = stringToBytes('hash-me')
    const metrics = await computeContentHashMeasuredAsync(content)

    expect(metrics.source).toBe('js')
    expect(metrics.bytes).toBe(content.length)
    expect(metrics.hash).toHaveLength(64)
  })

  it('rejects chunk indexes that collide modulo 65536 in AAD', () => {
    const encrypted = encryptChunk(key, stringToBytes('chunk'), 0, true, aad)

    expect(() => decryptChunk(key, { ...encrypted, index: 65_536 }, aad)).toThrow()
  })

  it('authenticates chunk size and finality metadata before assembly', async () => {
    const encrypted = encryptChunk(key, stringToBytes('chunk'), 0, true, aad)

    await expectCryptoRejects(() => decryptChunk(key, { ...encrypted, originalSize: 1_000_000 }, aad))
    await expectCryptoRejects(() => decryptChunk(key, { ...encrypted, isFinal: false }, aad))
  })
})
