/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it, vi } from 'vitest'
import { sha256 } from '@noble/hashes/sha256'

import {
  base64ToBytes,
  benchmarkPBKDF2Async,
  bytesToBase64,
  createPinDeviceVaultKeySlot,
  createRecoveryPassphraseVaultKeySlot,
  decrypt,
  decryptVaultWithKey,
  decryptVaultWithVaultKey,
  deriveKeyAndHash,
  deriveKeyAndHashAsync,
  deriveKeyWithIterations,
  deriveKeyWithIterationsAsync,
  deriveKeyWithIterationsMeasuredAsync,
  encrypt,
  encryptVaultWithKey,
  encryptVaultWithVaultKey,
  generateDeviceSecret,
  generateVaultKey,
  getVaultKeySlot,
  isVaultV3,
  unwrapVaultKeyWithPinDeviceSlot,
  unwrapVaultKeyWithRecoveryPassphraseSlot,
  validateRecoveryPassphrase,
  verifyPinAndGetKey,
  verifyPinAndGetKeyAsync,
} from './vaultCrypto'

describe('crypto async helpers', () => {
  const pin = '123456'
  const salt = Uint8Array.from([
    0x10, 0x23, 0x45, 0x67,
    0x89, 0xab, 0xcd, 0xef,
    0x01, 0x12, 0x23, 0x34,
    0x45, 0x56, 0x67, 0x78,
  ])
  const storedSalt = bytesToBase64(salt)

  it('matches the synchronous derived key output', async () => {
    for (const iterations of [1, 512, 4096, 10000]) {
      const syncKey = deriveKeyWithIterations(pin, salt, iterations)
      const asyncKey = await deriveKeyWithIterationsAsync(pin, salt, iterations)
      expect(Array.from(asyncKey)).toEqual(Array.from(syncKey))
    }
  })

  it('rejects invalid persisted KDF iteration counts', async () => {
    expect(() => deriveKeyWithIterations(pin, salt, 0)).toThrow('Invalid PBKDF2 iteration count')
    await expect(deriveKeyWithIterationsAsync(pin, salt, 2_000_001))
      .rejects.toThrow('Invalid PBKDF2 iteration count')
  })

  it('matches synchronous PIN verification for both hash formats', async () => {
    const syncKey = deriveKeyWithIterations(pin, salt, 4096)
    const newFormatHash = bytesToBase64(sha256(syncKey))
    const oldFormatHash = bytesToBase64(syncKey)

    await expect(
      verifyPinAndGetKeyAsync(pin, newFormatHash, storedSalt, 4096)
    ).resolves.toEqual(verifyPinAndGetKey(pin, newFormatHash, storedSalt, 4096))

    await expect(
      verifyPinAndGetKeyAsync(pin, oldFormatHash, storedSalt, 4096)
    ).resolves.toEqual(verifyPinAndGetKey(pin, oldFormatHash, storedSalt, 4096))

    await expect(
      verifyPinAndGetKeyAsync('000000', newFormatHash, storedSalt, 4096)
    ).resolves.toEqual(verifyPinAndGetKey('000000', newFormatHash, storedSalt, 4096))
  })

  it('uses the native PBKDF2 module when available and preserves JS parity', async () => {
    vi.resetModules()
    vi.doMock('react-native', () => ({
      Platform: { OS: 'ios' },
      NativeModules: {
        PBKDF2Module: {
          deriveKey: vi.fn(async (
            nativePin: string,
            nativeSalt: string,
            nativeIterations: number,
          ) => {
            const nativeKey = deriveKeyWithIterations(
              nativePin,
              base64ToBytes(nativeSalt),
              nativeIterations,
            )
            return bytesToBase64(nativeKey)
          }),
        },
      },
    }))

    const freshVaultCrypto = await import('./vaultCrypto')
    const asyncKey = await freshVaultCrypto.deriveKeyWithIterationsAsync(pin, salt, 4096)
    const measured = await freshVaultCrypto.deriveKeyWithIterationsMeasuredAsync(pin, salt, 4096)
    const syncKey = deriveKeyWithIterations(pin, salt, 4096)

    expect(Array.from(asyncKey)).toEqual(Array.from(syncKey))
    expect(Array.from(measured.key)).toEqual(Array.from(syncKey))
    vi.doUnmock('react-native')
  })

  it('reports measured PBKDF2 source and timing', async () => {
    const measured = await deriveKeyWithIterationsMeasuredAsync(pin, salt, 512)
    const syncKey = deriveKeyWithIterations(pin, salt, 512)

    expect(Array.from(measured.key)).toEqual(Array.from(syncKey))
    expect(measured.source).toBe('js')
    expect(measured.iterations).toBe(512)
    expect(measured.elapsedMs).toBeGreaterThanOrEqual(0)
  })

  it('benchmarks PBKDF2 derivation samples', async () => {
    const benchmark = await benchmarkPBKDF2Async({
      pin,
      salt,
      iterations: 16,
      samples: 2,
    })

    expect(benchmark.primitive).toBe('pbkdf2_sha256')
    expect(benchmark.iterations).toBe(16)
    expect(benchmark.samples).toHaveLength(2)
    expect(benchmark.avgMs).toBeGreaterThanOrEqual(0)
  })
})

describe('vault encryption', () => {
  const pin = '654321'
  const contents = {
    wallets: [
      {
        id: 'wallet-a',
        address: 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        publicKey: '0xpublic',
        privateKey: '0xprivate',
        createdAt: 1,
      },
    ],
    activeWalletId: 'wallet-a',
    version: 3,
  }

  it('encrypts and decrypts arbitrary plaintext with AES-GCM', () => {
    const { key } = deriveKeyAndHash(pin, undefined, 4096)
    const encrypted = encrypt('audit plaintext', key)

    expect(encrypted.iv).toBeTruthy()
    expect(encrypted.ciphertext).toBeTruthy()
    expect(decrypt(encrypted.ciphertext, encrypted.iv, key)).toBe('audit plaintext')
  })

  it('encrypts and decrypts vault contents with KDF metadata', () => {
    const { key, salt, iterations } = deriveKeyAndHash(pin, undefined, 4096)
    const encryptedVault = encryptVaultWithKey(contents, key, salt, iterations)

    expect(encryptedVault.salt).toBe(salt)
    expect(encryptedVault.kdfIterations).toBe(iterations)
    expect(encryptedVault.version).toBe(2)
    expect(decryptVaultWithKey<typeof contents>(encryptedVault, key)).toEqual(contents)
  })

  it('rejects vault ciphertext tampering', () => {
    const { key, salt, iterations } = deriveKeyAndHash(pin, undefined, 4096)
    const encryptedVault = encryptVaultWithKey(contents, key, salt, iterations)
    const tamperedData = encryptedVault.data.slice(0, -2) + 'AA'

    expect(() => decryptVaultWithKey({ ...encryptedVault, data: tamperedData }, key))
      .toThrow('Invalid PIN')
  })

  it('rejects IV tampering and wrong keys', () => {
    const { key, salt, iterations } = deriveKeyAndHash(pin, undefined, 4096)
    const { key: wrongKey } = deriveKeyAndHash('000000', salt, 4096)
    const encryptedVault = encryptVaultWithKey(contents, key, salt, iterations)
    const tamperedIv = encryptedVault.iv.slice(0, -2) + 'AA'

    expect(() => decryptVaultWithKey({ ...encryptedVault, iv: tamperedIv }, key))
      .toThrow('Invalid PIN')
    expect(() => decryptVaultWithKey(encryptedVault, wrongKey))
      .toThrow('Invalid PIN')
  })

  it('binds v2 vault metadata as AES-GCM associated data', () => {
    const { key, salt, iterations } = deriveKeyAndHash(pin, undefined, 4096)
    const encryptedVault = encryptVaultWithKey(contents, key, salt, iterations)

    expect(() => decryptVaultWithKey({
      ...encryptedVault,
      salt: bytesToBase64(new Uint8Array(16).fill(1)),
    }, key)).toThrow('Invalid PIN')
    expect(() => decryptVaultWithKey({
      ...encryptedVault,
      kdfIterations: iterations + 1,
    }, key)).toThrow('Invalid PIN')
    expect(() => decryptVaultWithKey({
      ...encryptedVault,
      version: 1,
    }, key)).toThrow('Invalid PIN')
  })

  it('preserves decryption compatibility for legacy v1 vault ciphertexts', () => {
    const { key, salt, iterations } = deriveKeyAndHash(pin, undefined, 4096)
    const encrypted = encrypt(JSON.stringify(contents), key)

    expect(decryptVaultWithKey<typeof contents>({
      data: encrypted.ciphertext,
      iv: encrypted.iv,
      salt,
      version: 1,
      kdfIterations: iterations,
    }, key)).toEqual(contents)
  })

  it('rejects decrypted plaintext that is not JSON', () => {
    const { key, salt, iterations } = deriveKeyAndHash(pin, undefined, 4096)
    const encrypted = encrypt('not-json', key)

    expect(() => decryptVaultWithKey({
      data: encrypted.ciphertext,
      iv: encrypted.iv,
      salt,
      version: 1,
      kdfIterations: iterations,
    }, key)).toThrow('Invalid PIN')
  })

  it('rejects dangerous object keys in decrypted vault JSON', () => {
    const { key, salt, iterations } = deriveKeyAndHash(pin, undefined, 4096)
    const encrypted = encrypt(
      '{"wallets":[],"activeWalletId":null,"version":3,"__proto__":{"polluted":true}}',
      key,
    )

    expect(() => decryptVaultWithKey({
      data: encrypted.ciphertext,
      iv: encrypted.iv,
      salt,
      version: 1,
      kdfIterations: iterations,
    }, key)).toThrow('Invalid PIN')
  })

  it('rejects unsupported future direct-key vault versions before decrypt', () => {
    const { key, salt, iterations } = deriveKeyAndHash(pin, undefined, 4096)
    const encryptedVault = encryptVaultWithKey(contents, key, salt, iterations)

    expect(() => decryptVaultWithKey({
      ...encryptedVault,
      version: 5,
    }, key)).toThrow('Unsupported vault version')
  })

  it('rejects malformed Base64 inputs', () => {
    const { key } = deriveKeyAndHash(pin, undefined, 4096)

    expect(() => decrypt('%%%', bytesToBase64(new Uint8Array(12)), key)).toThrow()
    expect(() => decrypt(bytesToBase64(new Uint8Array(32)), '%%%', key)).toThrow()
    expect(() => base64ToBytes('%%%')).toThrow()
  })
})

describe('v3 vault envelope key slots', () => {
  const contents = {
    wallets: [
      {
        id: 'wallet-a',
        address: 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        publicKey: '0xpublic',
        privateKey: '0xprivate',
        createdAt: 1,
      },
    ],
    activeWalletId: 'wallet-a',
    version: 3,
  }

  it('encrypts vault contents with a random vault key wrapped by a PIN plus device secret slot', async () => {
    const vaultKey = generateVaultKey()
    const deviceSecret = generateDeviceSecret()
    const pinSlot = await createPinDeviceVaultKeySlot('123456', deviceSecret, vaultKey, {
      iterations: 32,
      createdAt: 1,
    })
    const encryptedVault = encryptVaultWithVaultKey(contents, vaultKey, [pinSlot])

    expect(isVaultV3(encryptedVault)).toBe(true)
    expect(encryptedVault.version).toBe(4)
    expect(getVaultKeySlot(encryptedVault, 'pin_device')).toBe(pinSlot)

    const unwrappedKey = await unwrapVaultKeyWithPinDeviceSlot('123456', deviceSecret, pinSlot)
    expect(Array.from(unwrappedKey)).toEqual(Array.from(vaultKey))
    expect(decryptVaultWithVaultKey<typeof contents>(encryptedVault, unwrappedKey)).toEqual(contents)
  })

  it('does not allow vault-blob-only PIN checks without the device secret', async () => {
    const vaultKey = generateVaultKey()
    const deviceSecret = generateDeviceSecret()
    const pinSlot = await createPinDeviceVaultKeySlot('123456', deviceSecret, vaultKey, {
      iterations: 32,
      createdAt: 1,
    })

    await expect(
      unwrapVaultKeyWithPinDeviceSlot('123456', generateDeviceSecret(), pinSlot)
    ).rejects.toThrow()
  })

  it('rejects slot and vault tampering', async () => {
    const vaultKey = generateVaultKey()
    const deviceSecret = generateDeviceSecret()
    const pinSlot = await createPinDeviceVaultKeySlot('123456', deviceSecret, vaultKey, {
      iterations: 32,
      createdAt: 1,
    })
    const encryptedVault = encryptVaultWithVaultKey(contents, vaultKey, [pinSlot])

    await expect(
      unwrapVaultKeyWithPinDeviceSlot('123456', deviceSecret, {
        ...pinSlot,
        iterations: pinSlot.iterations + 1,
      })
    ).rejects.toThrow()

    expect(() => decryptVaultWithVaultKey({
      ...encryptedVault,
      version: 5,
    }, vaultKey)).toThrow('Unsupported vault version')
  })

  it('binds current vault ciphertexts to their key-slot set', async () => {
    const vaultKey = generateVaultKey()
    const deviceSecret = generateDeviceSecret()
    const pinSlot = await createPinDeviceVaultKeySlot('123456', deviceSecret, vaultKey, {
      iterations: 32,
      createdAt: 1,
    })
    const recoverySlot = await createRecoveryPassphraseVaultKeySlot(
      'correct horse battery staple with more entropy',
      vaultKey,
      {
        iterations: 32,
        createdAt: 2,
      },
    )
    const encryptedVault = encryptVaultWithVaultKey(contents, vaultKey, [pinSlot, recoverySlot])

    expect(decryptVaultWithVaultKey<typeof contents>({
      ...encryptedVault,
      keySlots: [recoverySlot, pinSlot],
    }, vaultKey)).toEqual(contents)
    expect(() => decryptVaultWithVaultKey({
      ...encryptedVault,
      keySlots: [recoverySlot],
    }, vaultKey)).toThrow('Invalid vault key')
  })

  it('preserves read compatibility for legacy v3 vault envelopes', async () => {
    const vaultKey = generateVaultKey()
    const deviceSecret = generateDeviceSecret()
    const pinSlot = await createPinDeviceVaultKeySlot('123456', deviceSecret, vaultKey, {
      iterations: 32,
      createdAt: 1,
    })
    const encrypted = encrypt(
      JSON.stringify(contents),
      vaultKey,
      new TextEncoder().encode(JSON.stringify({ version: 3 })),
    )

    expect(decryptVaultWithVaultKey<typeof contents>({
      data: encrypted.ciphertext,
      iv: encrypted.iv,
      salt: '',
      version: 3,
      keySlots: [pinSlot],
    }, vaultKey)).toEqual(contents)
  })

  it('supports high-entropy recovery passphrase slots', async () => {
    const vaultKey = generateVaultKey()
    expect(validateRecoveryPassphrase('correct horse battery staple with more entropy'))
      .toMatchObject({ valid: true })
    const recoverySlot = await createRecoveryPassphraseVaultKeySlot(
      'correct horse battery staple with more entropy',
      vaultKey,
      {
        iterations: 32,
        createdAt: 1,
      },
    )

    const unwrappedKey = await unwrapVaultKeyWithRecoveryPassphraseSlot(
      'correct horse battery staple with more entropy',
      recoverySlot,
    )
    expect(Array.from(unwrappedKey)).toEqual(Array.from(vaultKey))
    await expect(
      unwrapVaultKeyWithRecoveryPassphraseSlot('wrong passphrase', recoverySlot)
    ).rejects.toThrow()
  })

  it('rejects low-entropy recovery passphrases for new slots', async () => {
    const vaultKey = generateVaultKey()

    expect(validateRecoveryPassphrase('123456')).toMatchObject({ valid: false })
    await expect(createRecoveryPassphraseVaultKeySlot('123456', vaultKey, {
      iterations: 32,
      createdAt: 1,
    })).rejects.toThrow('Recovery passphrase must be at least 16 characters')
  })
})

describe('PIN verifier formats', () => {
  const pin = '123456'
  const salt = Uint8Array.from([
    0x21, 0x43, 0x65, 0x87,
    0xa9, 0xcb, 0xed, 0x0f,
    0x10, 0x32, 0x54, 0x76,
    0x98, 0xba, 0xdc, 0xfe,
  ])
  const storedSalt = bytesToBase64(salt)

  it('writes only the SHA-256-of-key verifier format', () => {
    const { key, pinHash } = deriveKeyAndHash(pin, storedSalt, 4096)

    expect(pinHash).toBe(bytesToBase64(sha256(key)))
    expect(pinHash).not.toBe(bytesToBase64(key))
  })

  it('keeps async PIN hash derivation equivalent to sync derivation', async () => {
    const syncResult = deriveKeyAndHash(pin, storedSalt, 4096)
    const asyncResult = await deriveKeyAndHashAsync(pin, storedSalt, 4096)

    expect(Array.from(asyncResult.key)).toEqual(Array.from(syncResult.key))
    expect(asyncResult.pinHash).toBe(syncResult.pinHash)
    expect(asyncResult.salt).toBe(syncResult.salt)
    expect(asyncResult.iterations).toBe(syncResult.iterations)
  })

  it('accepts current and legacy verifier formats for migration', () => {
    const key = deriveKeyWithIterations(pin, salt, 4096)
    const currentHash = bytesToBase64(sha256(key))
    const legacyHash = bytesToBase64(key)

    expect(verifyPinAndGetKey(pin, currentHash, storedSalt, 4096)).toMatchObject({
      valid: true,
      hashFormat: 'sha256_key',
    })
    expect(verifyPinAndGetKey(pin, legacyHash, storedSalt, 4096)).toMatchObject({
      valid: true,
      hashFormat: 'raw_pbkdf2',
    })
  })

  it('rejects wrong PINs and malformed verifier material', () => {
    const key = deriveKeyWithIterations(pin, salt, 4096)
    const currentHash = bytesToBase64(sha256(key))

    expect(verifyPinAndGetKey('000000', currentHash, storedSalt, 4096)).toEqual({
      valid: false,
      key: null,
      hashFormat: null,
    })
    expect(verifyPinAndGetKey(pin, '%%%', storedSalt, 4096)).toEqual({
      valid: false,
      key: null,
      hashFormat: null,
    })
    expect(verifyPinAndGetKey(pin, currentHash, '%%%', 4096)).toEqual({
      valid: false,
      key: null,
      hashFormat: null,
    })
  })
})
