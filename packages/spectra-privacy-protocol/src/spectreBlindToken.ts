/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { sha256 } from '@noble/hashes/sha256'

import type {
  AccountBlindTokenPurpose,
  SpectreBlindActivationToken,
  SpectreBlindPublicParams,
} from './types'

const BLIND_TOKEN_ALGORITHM = 'rsa-fdh-v1'
const HASH_DOMAIN = 'spectra.mobile.spectre.activate.fdh.v1'
const BLIND_TOKEN_DOMAIN_PREFIX = 'spectra.mobile.account-ticket.v1'
const MIN_RSA_MODULUS_BYTES = 256
const SUPPORTED_PUBLIC_EXPONENT = 65537n

const encoder = new TextEncoder()

export interface PreparedSpectreBlindRequest {
  blindedMessageHex: string
  blindingFactorHex: string
  token: Omit<SpectreBlindActivationToken, 'signatureHex'>
}

function normalizeHex(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/^0x/, '')
  if (normalized.length === 0 || normalized.length % 2 !== 0 || !/^[0-9a-f]+$/.test(normalized)) {
    throw new Error('Invalid hexadecimal payload')
  }

  return normalized
}

function normalizeWalletAddress(walletAddress: string): string {
  const trimmed = walletAddress.trim()
  if (!/^exo00[0-9a-f]{38}$/i.test(trimmed)) {
    throw new Error('Invalid Spectre wallet address')
  }

  return `EXO00${trimmed.slice(5).toLowerCase()}`
}

function domainForPurpose(purpose: AccountBlindTokenPurpose): string {
  return `${BLIND_TOKEN_DOMAIN_PREFIX}.${purpose}`
}

function assertPurposeMatchesMode(
  purpose: AccountBlindTokenPurpose,
  isEphemeral: boolean,
): void {
  if (purpose !== 'spectre_ephemeral' || !isEphemeral) {
    throw new Error('Ephemeral Spectre tickets must be marked ephemeral')
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function hexToBytes(hex: string): Uint8Array {
  const normalized = normalizeHex(hex)
  const bytes = new Uint8Array(normalized.length / 2)
  for (let index = 0; index < normalized.length; index += 2) {
    bytes[index / 2] = Number.parseInt(normalized.slice(index, index + 2), 16)
  }
  return bytes
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  return BigInt(`0x${bytesToHex(bytes)}`)
}

function bigIntToBytes(value: bigint, byteLength?: number): Uint8Array {
  if (value < 0n) {
    throw new Error('Negative bigint values are not supported')
  }

  let hex = value.toString(16)
  if (hex.length % 2 !== 0) {
    hex = `0${hex}`
  }

  const bytes = hex.length > 0 ? hexToBytes(hex) : new Uint8Array()
  if (byteLength === undefined) {
    return bytes
  }

  if (bytes.length > byteLength) {
    throw new Error('Bigint does not fit in the requested byte length')
  }

  const padded = new Uint8Array(byteLength)
  padded.set(bytes, byteLength - bytes.length)
  return padded
}

function bigIntToHex(value: bigint, byteLength?: number): string {
  return bytesToHex(bigIntToBytes(value, byteLength))
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0)
  const joined = new Uint8Array(totalLength)
  let offset = 0
  for (const part of parts) {
    joined.set(part, offset)
    offset += part.length
  }
  return joined
}

function createCounterBytes(counter: number): Uint8Array {
  const bytes = new Uint8Array(4)
  bytes[0] = (counter >>> 24) & 0xff
  bytes[1] = (counter >>> 16) & 0xff
  bytes[2] = (counter >>> 8) & 0xff
  bytes[3] = counter & 0xff
  return bytes
}

function gcd(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left
  let b = right < 0n ? -right : right

  while (b !== 0n) {
    const next = a % b
    a = b
    b = next
  }

  return a
}

function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  if (modulus <= 0n) {
    throw new Error('RSA modulus must be positive')
  }

  let result = 1n
  let value = base % modulus
  let power = exponent

  while (power > 0n) {
    if ((power & 1n) === 1n) {
      result = (result * value) % modulus
    }
    power >>= 1n
    value = (value * value) % modulus
  }

  return result
}

function modInverse(value: bigint, modulus: bigint): bigint {
  let t = 0n
  let newT = 1n
  let r = modulus
  let newR = value % modulus

  while (newR !== 0n) {
    const quotient = r / newR
    ;[t, newT] = [newT, t - quotient * newT]
    ;[r, newR] = [newR, r - quotient * newR]
  }

  if (r !== 1n) {
    throw new Error('Blinding factor is not invertible')
  }

  if (t < 0n) {
    t += modulus
  }

  return t
}

function randomBigInt(byteLength: number): bigint {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return bytesToBigInt(bytes)
}

function randomBigIntBelow(exclusiveUpperBound: bigint): bigint {
  if (exclusiveUpperBound <= 0n) {
    throw new Error('Random upper bound must be positive')
  }

  const byteLength = Math.ceil(exclusiveUpperBound.toString(16).length / 2)
  for (;;) {
    const candidate = randomBigInt(byteLength)
    if (candidate < exclusiveUpperBound) {
      return candidate
    }
  }
}

function getModulusByteLength(params: SpectreBlindPublicParams): number {
  return normalizeHex(params.modulusHex).length / 2
}

function getModulus(params: SpectreBlindPublicParams): bigint {
  return bytesToBigInt(hexToBytes(params.modulusHex))
}

function getPublicExponent(params: SpectreBlindPublicParams): bigint {
  return bytesToBigInt(hexToBytes(params.publicExponentHex))
}

function assertSupportedPublicParams(params: SpectreBlindPublicParams): void {
  if (params.algorithm !== BLIND_TOKEN_ALGORITHM) {
    throw new Error('Unsupported Spectre blind token algorithm')
  }

  if (params.purpose !== 'spectre_ephemeral' || params.domain !== domainForPurpose('spectre_ephemeral')) {
    throw new Error('Unexpected Spectre blind token domain')
  }

  if (params.keyId.trim().length === 0) {
    throw new Error('Spectre blind token key id is required')
  }

  const modulusByteLength = getModulusByteLength(params)
  const modulus = getModulus(params)
  if (modulusByteLength < MIN_RSA_MODULUS_BYTES) {
    throw new Error('Spectre blind token RSA modulus is too small')
  }

  if (modulus <= 3n || (modulus & 1n) !== 1n) {
    throw new Error('Spectre blind token RSA modulus must be an odd integer greater than 3')
  }

  const publicExponent = getPublicExponent(params)
  if (publicExponent !== SUPPORTED_PUBLIC_EXPONENT || publicExponent >= modulus) {
    throw new Error('Unsupported Spectre blind token RSA public exponent')
  }
}

function buildBlindTokenMessageBytes(
  params: SpectreBlindPublicParams,
  walletAddress: string,
  purpose: AccountBlindTokenPurpose,
  isEphemeral: boolean,
  nullifierHex: string,
): Uint8Array {
  assertPurposeMatchesMode(purpose, isEphemeral)

  return encoder.encode([
    params.domain,
    `key_id:${params.keyId}`,
    `purpose:${purpose}`,
    `wallet:${normalizeWalletAddress(walletAddress)}`,
    `ephemeral:${isEphemeral ? '1' : '0'}`,
    `nullifier:${normalizeHex(nullifierHex)}`,
  ].join('\n'))
}

function hashToRepresentative(
  params: SpectreBlindPublicParams,
  walletAddress: string,
  purpose: AccountBlindTokenPurpose,
  isEphemeral: boolean,
  nullifierHex: string,
): bigint {
  const modulus = getModulus(params)
  const modulusByteLength = getModulusByteLength(params)
  const message = buildBlindTokenMessageBytes(params, walletAddress, purpose, isEphemeral, nullifierHex)
  const output = new Uint8Array(modulusByteLength)

  let offset = 0
  let counter = 0
  while (offset < output.length) {
    const chunk = sha256(concatBytes(
      encoder.encode(HASH_DOMAIN),
      createCounterBytes(counter),
      message,
    ))
    output.set(chunk.slice(0, Math.min(chunk.length, output.length - offset)), offset)
    offset += Math.min(chunk.length, output.length - offset)
    counter += 1
  }

  return (bytesToBigInt(output) % (modulus - 1n)) + 1n
}

function generateBlindingFactor(params: SpectreBlindPublicParams): bigint {
  const modulus = getModulus(params)

  for (;;) {
    const candidate = randomBigIntBelow(modulus - 2n) + 2n
    if (gcd(candidate, modulus) === 1n) {
      return candidate
    }
  }
}

export function prepareSpectreBlindTokenRequest(
  params: SpectreBlindPublicParams,
  walletAddress: string,
  isEphemeral: boolean,
  purpose: AccountBlindTokenPurpose = 'spectre_ephemeral',
): PreparedSpectreBlindRequest {
  assertSupportedPublicParams(params)
  assertPurposeMatchesMode(purpose, isEphemeral)

  const normalizedWalletAddress = normalizeWalletAddress(walletAddress)
  if (params.purpose !== purpose) {
    throw new Error('Spectre blind token purpose does not match public parameters')
  }

  const nullifierBytes = new Uint8Array(32)
  crypto.getRandomValues(nullifierBytes)
  const nullifierHex = bytesToHex(nullifierBytes)
  const representative = hashToRepresentative(
    params,
    normalizedWalletAddress,
    purpose,
    isEphemeral,
    nullifierHex,
  )
  const blindingFactor = generateBlindingFactor(params)
  const modulus = getModulus(params)
  const blindedMessage = (
    representative
    * modPow(blindingFactor, getPublicExponent(params), modulus)
  ) % modulus

  return {
    blindedMessageHex: bigIntToHex(blindedMessage, getModulusByteLength(params)),
    blindingFactorHex: bigIntToHex(blindingFactor, getModulusByteLength(params)),
    token: {
      algorithm: params.algorithm,
      domain: params.domain,
      keyId: params.keyId,
      purpose,
      walletAddress: normalizedWalletAddress,
      isEphemeral,
      nullifierHex,
    },
  }
}

export function finalizeSpectreBlindToken(
  params: SpectreBlindPublicParams,
  prepared: PreparedSpectreBlindRequest,
  blindSignatureHex: string,
): SpectreBlindActivationToken {
  assertSupportedPublicParams(params)

  const modulus = getModulus(params)
  const blindSignature = bytesToBigInt(hexToBytes(blindSignatureHex))
  const blindingFactor = bytesToBigInt(hexToBytes(prepared.blindingFactorHex))
  const signature = (blindSignature * modInverse(blindingFactor, modulus)) % modulus
  const token: SpectreBlindActivationToken = {
    ...prepared.token,
    signatureHex: bigIntToHex(signature, getModulusByteLength(params)),
  }

  if (!verifySpectreBlindToken(params, token)) {
    throw new Error('Blind activation signature verification failed')
  }

  return token
}

export function verifySpectreBlindToken(
  params: SpectreBlindPublicParams,
  token: SpectreBlindActivationToken,
): boolean {
  assertSupportedPublicParams(params)

  if (token.algorithm !== params.algorithm || token.domain !== params.domain || token.keyId !== params.keyId) {
    return false
  }
  if (token.purpose !== params.purpose) {
    return false
  }

  try {
    const modulus = getModulus(params)
    const signature = bytesToBigInt(hexToBytes(token.signatureHex))
    if (signature <= 0n || signature >= modulus) {
      return false
    }

    const representative = hashToRepresentative(
      params,
      token.walletAddress,
      token.purpose,
      token.isEphemeral,
      token.nullifierHex,
    )

    return modPow(signature, getPublicExponent(params), modulus) === representative
  } catch {
    return false
  }
}

export function hashSpectreBlindTokenNullifier(nullifierHex: string): string {
  return bytesToHex(sha256(concatBytes(
    encoder.encode('spectra.mobile.spectre.activate.nullifier.v1'),
    hexToBytes(nullifierHex),
  )))
}
