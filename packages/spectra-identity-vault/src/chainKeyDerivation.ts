/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { HDKey } from '@scure/bip32'
import { mnemonicToSeedSync } from '@scure/bip39'
import { secp256k1 } from '@noble/curves/secp256k1'
import { ed25519 } from '@noble/curves/ed25519'
import { hmac } from '@noble/hashes/hmac'
import { ripemd160 } from '@noble/hashes/ripemd160'
import { sha256 } from '@noble/hashes/sha256'
import { sha512 } from '@noble/hashes/sha512'
import { keccak_256 } from '@noble/hashes/sha3'
import { base58CheckEncode, base58Encode, encodeSegwitAddress } from './baseEncoding'
import { bytesToHex, hexToBytes } from './hex'
import { normalizeMnemonicPhrase } from './mnemonic'
import type { ChainAccounts, DerivedChainAccount } from './types'

const HARDENED_OFFSET = 0x80000000

function getSeed(mnemonic: string): Uint8Array {
  return mnemonicToSeedSync(normalizeMnemonicPhrase(mnemonic))
}

function deriveBip32PrivateKey(mnemonic: string, path: string): Uint8Array {
  const key = HDKey.fromMasterSeed(getSeed(mnemonic)).derive(path)
  if (!key.privateKey) {
    throw new Error(`Failed to derive private key for ${path}`)
  }
  return key.privateKey
}

function hash160(bytes: Uint8Array): Uint8Array {
  return ripemd160(sha256(bytes))
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0)
  const result = new Uint8Array(length)
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

function uint32Be(value: number): Uint8Array {
  return new Uint8Array([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ])
}

function deriveSlip10Ed25519PrivateKey(mnemonic: string, path: string, indexes: number[]): Uint8Array {
  const seed = getSeed(mnemonic)
  let digest = hmac(sha512, new TextEncoder().encode('ed25519 seed'), seed)
  let key = digest.slice(0, 32)
  let chainCode = digest.slice(32)

  for (const index of indexes) {
    const hardenedIndex = index >= HARDENED_OFFSET ? index : index + HARDENED_OFFSET
    digest = hmac(sha512, chainCode, concatBytes(new Uint8Array([0]), key, uint32Be(hardenedIndex)))
    key = digest.slice(0, 32)
    chainCode = digest.slice(32)
  }

  if (key.length !== 32) {
    throw new Error(`Failed to derive ed25519 private key for ${path}`)
  }

  return key
}

export function deriveEvmAccount(
  mnemonic: string,
  options?: { accountIndex?: number },
): DerivedChainAccount {
  const accountIndex = Number.isInteger(options?.accountIndex) && (options?.accountIndex ?? 0) >= 0
    ? Number(options?.accountIndex)
    : 0
  const derivationPath = `m/44'/60'/0'/0/${accountIndex}`
  const privateKey = deriveBip32PrivateKey(mnemonic, derivationPath)
  const publicKeyUncompressed = secp256k1.getPublicKey(privateKey, false)
  const publicKeyNoPrefix = publicKeyUncompressed.slice(1)
  const hash = keccak_256(publicKeyNoPrefix)
  const addressBytes = hash.slice(-20)
  const lowerAddress = '0x' + bytesToHex(addressBytes)

  return {
    address: toChecksumAddress(lowerAddress),
    privateKey: '0x' + bytesToHex(privateKey),
    publicKey: '0x' + bytesToHex(publicKeyUncompressed),
    derivationPath,
  }
}

export function deriveBitcoinAccount(
  mnemonic: string,
  options?: { accountIndex?: number; network?: 'mainnet' | 'testnet' },
): DerivedChainAccount {
  const accountIndex = Number.isInteger(options?.accountIndex) && (options?.accountIndex ?? 0) >= 0
    ? Number(options?.accountIndex)
    : 0
  const coinType = options?.network === 'testnet' ? 1 : 0
  const derivationPath = `m/84'/${coinType}'/0'/0/${accountIndex}`
  const privateKey = deriveBip32PrivateKey(mnemonic, derivationPath)
  const publicKey = secp256k1.getPublicKey(privateKey, true)
  const address = deriveBitcoinP2wpkhAddressFromPublicKey(publicKey, options)

  return {
    address,
    privateKey: '0x' + bytesToHex(privateKey),
    publicKey: '0x' + bytesToHex(publicKey),
    derivationPath,
  }
}

export function deriveBitcoinP2wpkhAddressFromPublicKey(
  publicKey: Uint8Array,
  options?: { network?: 'mainnet' | 'testnet' },
): string {
  if (publicKey.length !== 33) throw new Error('Bitcoin public key must be compressed')
  const hrp = options?.network === 'testnet' ? 'tb' : 'bc'
  return encodeSegwitAddress(hrp, 0, hash160(publicKey))
}

export function deriveBitcoinP2wpkhAddressFromPrivateKey(
  privateKeyHex: string,
  options?: { network?: 'mainnet' | 'testnet' },
): string {
  const privateKey = hexToBytes(privateKeyHex)
  if (privateKey.length !== 32) throw new Error('Bitcoin private key must be 32 bytes')
  return deriveBitcoinP2wpkhAddressFromPublicKey(secp256k1.getPublicKey(privateKey, true), options)
}

export function deriveSolanaAccount(
  mnemonic: string,
  options?: { accountIndex?: number },
): DerivedChainAccount {
  const accountIndex = Number.isInteger(options?.accountIndex) && (options?.accountIndex ?? 0) >= 0
    ? Number(options?.accountIndex)
    : 0
  const derivationPath = `m/44'/501'/${accountIndex}'/0'`
  const privateKey = deriveSlip10Ed25519PrivateKey(mnemonic, derivationPath, [44, 501, accountIndex, 0])
  const publicKey = ed25519.getPublicKey(privateKey)

  return {
    address: base58Encode(publicKey),
    privateKey: '0x' + bytesToHex(privateKey),
    publicKey: '0x' + bytesToHex(publicKey),
    derivationPath,
  }
}

export function deriveTronAccount(
  mnemonic: string,
  options?: { accountIndex?: number },
): DerivedChainAccount {
  const accountIndex = Number.isInteger(options?.accountIndex) && (options?.accountIndex ?? 0) >= 0
    ? Number(options?.accountIndex)
    : 0
  const derivationPath = `m/44'/195'/0'/0/${accountIndex}`
  const privateKey = deriveBip32PrivateKey(mnemonic, derivationPath)
  const publicKeyUncompressed = secp256k1.getPublicKey(privateKey, false)
  const hash = keccak_256(publicKeyUncompressed.slice(1))
  const payload = new Uint8Array(21)
  payload[0] = 0x41
  payload.set(hash.slice(-20), 1)

  return {
    address: base58CheckEncode(payload),
    privateKey: '0x' + bytesToHex(privateKey),
    publicKey: '0x' + bytesToHex(publicKeyUncompressed),
    derivationPath,
  }
}

export function deriveChainAccounts(
  mnemonic: string,
  options?: { accountIndex?: number },
): ChainAccounts {
  const accountIndex = options?.accountIndex ?? 0
  return {
    evm: deriveEvmAccount(mnemonic, { accountIndex }),
    bitcoin: deriveBitcoinAccount(mnemonic, { accountIndex }),
    solana: deriveSolanaAccount(mnemonic, { accountIndex }),
    tron: deriveTronAccount(mnemonic, { accountIndex }),
  }
}

function toChecksumAddress(address: string): string {
  const addr = address.toLowerCase().replace('0x', '')
  const hashBytes = keccak_256(new TextEncoder().encode(addr))
  const hashHex = bytesToHex(hashBytes)

  let checksummed = '0x'
  for (let i = 0; i < 40; i++) {
    const nibble = parseInt(hashHex[i], 16)
    checksummed += nibble >= 8 ? addr[i].toUpperCase() : addr[i]
  }
  return checksummed
}
