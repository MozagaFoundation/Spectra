/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 */

import { secp256k1 } from '@noble/curves/secp256k1'
import { sha256 } from '@noble/hashes/sha256'
import { keccak_256 } from '@noble/hashes/sha3'
import { buildWalletIndexActivationSigningMessage } from '@spectra/privacy-protocol'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  beginActivation: vi.fn(),
  completeActivation: vi.fn(),
  ensureSession: vi.fn(),
  issueChallenge: vi.fn(),
  recordActivation: vi.fn(),
}))

vi.mock('@/services/backend/session', () => ({
  ensureVerifiedBackendAccess: mocks.ensureSession,
}))

vi.mock('@/services/backend/vdfChallengeTiming', () => ({
  retryVdfSubmissionAfterServerFloor: vi.fn(),
  waitForVdfChallengeAge: vi.fn(),
}))

vi.mock('@/services/backend/walletIndex', () => ({
  beginWalletIndexActivationWithBackend: mocks.beginActivation,
  completeWalletIndexActivationWithBackend: mocks.completeActivation,
  issueWalletIndexActivationVdfWithBackend: mocks.issueChallenge,
}))

vi.mock('@/services/security/nativeVdf', () => ({
  solveVdfOnDevice: vi.fn(),
}))

vi.mock('@/services/shared/vdfActivity', () => ({
  beginVdfActivity: vi.fn(),
}))

vi.mock('@/services/storage/walletIndexStorage', () => ({
  recordWalletIndexActivation: mocks.recordActivation,
}))

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function hexBytes(value: string): Uint8Array {
  return Uint8Array.from(value.match(/.{2}/g)!, (byte) => Number.parseInt(byte, 16))
}

function ethereumAddress(privateKey: Uint8Array): string {
  const publicKey = secp256k1.getPublicKey(privateKey, false)
  return `0x${hex(keccak_256(publicKey.slice(1)).slice(-20))}`
}

const ownerWalletAddress = `EXO00${'a'.repeat(38)}`
const activationId = `wia1.${'b'.repeat(32)}`
const nonceHex = 'c'.repeat(64)
const expiresAt = 1_800_000_000_000

describe('wallet index activation proofs', () => {
  it('signs the server-canonical Ethereum address with a derived uncompressed key', async () => {
    const privateKey = Uint8Array.from({ length: 32 }, () => 7)
    const address = ethereumAddress(privateKey)
    const wallet = {
      address: ownerWalletAddress,
      chainAccounts: {
        evm: {
          address: `0x${address.slice(2).toUpperCase()}`,
          publicKey: `0x${hex(secp256k1.getPublicKey(privateKey, true))}`,
          privateKey: `0x${hex(privateKey)}`,
          derivationPath: "m/44'/60'/0'/0/0",
        },
      },
    }
    const { createWalletIndexAddressProof } = await import('./walletIndexActivation')

    const result = await createWalletIndexAddressProof(wallet as any, 'ethereum', {
      activationId,
      address,
      nonceHex,
      expiresAt,
    })

    expect(result.address).toBe(address)
    expect(result.proof.publicKeyHex).toBe(hex(secp256k1.getPublicKey(privateKey, false)))
    expect(
      secp256k1.verify(
        hexBytes(result.proof.signatureHex),
        sha256(new TextEncoder().encode(buildWalletIndexActivationSigningMessage({
          activationId,
          ownerWalletAddress,
          chain: 'ethereum',
          address,
          nonceHex,
          expiresAt,
        }))),
        hexBytes(result.proof.publicKeyHex),
      ),
    ).toBe(true)
  })

  it('derives a compressed Bitcoin proof key instead of trusting a stored key encoding', async () => {
    const privateKey = hexBytes('4604b4b710fe91f584fff084e1a9159fe4f8408fff380596a604948474ce4fa3')
    const address = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu'
    const wallet = {
      address: ownerWalletAddress,
      chainAccounts: {
        bitcoin: {
          address,
          publicKey: `0x${hex(secp256k1.getPublicKey(privateKey, false))}`,
          privateKey: `0x${hex(privateKey)}`,
          derivationPath: "m/84'/0'/0'/0/0",
        },
      },
    }
    const { createWalletIndexAddressProof } = await import('./walletIndexActivation')

    const result = await createWalletIndexAddressProof(wallet as any, 'bitcoin', {
      activationId,
      address,
      nonceHex,
      expiresAt,
    })

    expect(result.proof.publicKeyHex).toBe(hex(secp256k1.getPublicKey(privateKey, true)))
    expect(
      secp256k1.verify(
        hexBytes(result.proof.signatureHex),
        sha256(new TextEncoder().encode(buildWalletIndexActivationSigningMessage({
          activationId,
          ownerWalletAddress,
          chain: 'bitcoin',
          address,
          nonceHex,
          expiresAt,
        }))),
        hexBytes(result.proof.publicKeyHex),
      ),
    ).toBe(true)
  })

  it('derives the Bitcoin activation address instead of using serialized account data', async () => {
    const privateKey = '0x4604b4b710fe91f584fff084e1a9159fe4f8408fff380596a604948474ce4fa3'
    const wallet = {
      address: ownerWalletAddress,
      chainAccounts: {
        bitcoin: {
          address: 'tb1qstaleaccount',
          publicKey: '0x00',
          privateKey,
          derivationPath: "m/84'/0'/0'/0/0",
        },
      },
    }
    const { resolveWalletIndexActivationAddress } = await import('./walletIndexActivation')

    expect(resolveWalletIndexActivationAddress(wallet as any, 'bitcoin'))
      .toBe('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu')
  })
})
