/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'

import {
  finalizeSpectreBlindToken,
  hashSpectreBlindTokenNullifier,
  prepareSpectreBlindTokenRequest,
  verifySpectreBlindToken,
} from './spectreBlindToken'

const TEST_PARAMS = {
  algorithm: 'rsa-fdh-v1' as const,
  domain: 'spectra.mobile.account-ticket.v1.spectre_ephemeral',
  issueIntervalHours: 24,
  keyId: 'test-key',
  purpose: 'spectre_ephemeral' as const,
  modulusHex: 'd0a80ef6e324476f2f29099c7c9064e2562684e1c6470c74b79811d37d487f9ced83cdd7933f9680e3d84629183cc2077cadb35eb5d73e523a7137a03f9ce6fbd3ca46ecf7dd07781e8b5c3686bf97d7054a264a6e90cc22619df047c4b4713ee9a3f91620f9e26a28d14823db16262347065ab808727efebbd6b6618c2fc38057a57ab02a6289855357a3c55bdd19b843c5793ee9c1f997b804a3a5432865ef364667aebac969feda94aa908db44112c94b3cb4917a341f80945bd25faad00e87fc1561fdc2cc73ddb172befe2fb83033bd140b0c3f7f8348f3a8c1ca83a3a219ea28469f2a64be087df3744981b5e821bbc7af12e74b937c2b4696c3225de3',
  publicExponentHex: '010001',
}

const TEST_PRIVATE_EXPONENT = BigInt('0x51d8f291c6d4c6cea6cdaeaefb2fbadb0bd72d3dd104b2aea00bdf4639f933d1af5b89e59ba590587bc7acf1d6c79286d451e0aff09d7f9d4abe7986fb1d058057fa1b2b3e292e1260cce2bda2cac9f976e238b5eebc0ecf17c297ebd70dbef4623ac76cf63f7f208c6557aa74f8b1ba19d4b4c646cdfee1d675e971c7473f24c6190e63cc2c86b2afec78102ea439a6bdfb44cdbfa267c59483a0d25733cedd5e3094b1bcb34e02b9fe296cc2a52d9a6cf54aed2de4813afa475aa17623dc72f47a807587aef6b9efb5384026867007ee42106edc0f1e67f2908725743782c91d26c8079eeaa2453faa13d2f6cb28c26b8e54e749d0e944408da594b0cd8a71')
const TEST_WALLET_ADDRESS = 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const TEST_NULLIFIER = `${'11'.repeat(32)}`

function hexToBigInt(hex: string): bigint {
  return BigInt(`0x${hex}`)
}

function bigIntToHex(value: bigint, byteLength: number): string {
  let hex = value.toString(16)
  if (hex.length % 2 !== 0) {
    hex = `0${hex}`
  }

  const minimumLength = byteLength * 2
  if (hex.length < minimumLength) {
    hex = hex.padStart(minimumLength, '0')
  }

  return hex
}

function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
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

function signPreparedRequest(prepared: ReturnType<typeof prepareSpectreBlindTokenRequest>): string {
  const modulus = hexToBigInt(TEST_PARAMS.modulusHex)
  const blindedMessage = hexToBigInt(prepared.blindedMessageHex)
  return bigIntToHex(
    modPow(blindedMessage, TEST_PRIVATE_EXPONENT, modulus),
    TEST_PARAMS.modulusHex.length / 2,
  )
}

function issueTestToken() {
  const prepared = prepareSpectreBlindTokenRequest(
    TEST_PARAMS,
    TEST_WALLET_ADDRESS.toLowerCase(),
    true,
  )
  return finalizeSpectreBlindToken(
    TEST_PARAMS,
    prepared,
    signPreparedRequest(prepared),
  )
}

describe('spectreBlindToken', () => {
  it('round-trips a blinded Spectre activation token with production-sized RSA parameters', () => {
    const prepared = prepareSpectreBlindTokenRequest(
      TEST_PARAMS,
      TEST_WALLET_ADDRESS.toLowerCase(),
      true,
    )

    const token = finalizeSpectreBlindToken(
      TEST_PARAMS,
      prepared,
      signPreparedRequest(prepared),
    )

    expect(token.walletAddress).toBe(TEST_WALLET_ADDRESS)
    expect(token.purpose).toBe('spectre_ephemeral')
    expect(token.isEphemeral).toBe(true)
    expect(prepared.blindedMessageHex).toMatch(/^[0-9a-f]{512}$/)
    expect(prepared.blindingFactorHex).toMatch(/^[0-9a-f]{512}$/)
    expect(token.signatureHex).toMatch(/^[0-9a-f]{512}$/)
    expect(token.nullifierHex).toMatch(/^[0-9a-f]{64}$/)
    expect(verifySpectreBlindToken(TEST_PARAMS, token)).toBe(true)
  })

  it('rejects tampered token fields without throwing', () => {
    const token = issueTestToken()

    expect(verifySpectreBlindToken(TEST_PARAMS, {
      ...token,
      walletAddress: 'EXO00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    })).toBe(false)
    expect(verifySpectreBlindToken(TEST_PARAMS, {
      ...token,
      purpose: 'unexpected_purpose' as 'spectre_ephemeral',
      isEphemeral: false,
    })).toBe(false)
    expect(verifySpectreBlindToken(TEST_PARAMS, {
      ...token,
      nullifierHex: `${'22'.repeat(32)}`,
    })).toBe(false)
    expect(verifySpectreBlindToken(TEST_PARAMS, {
      ...token,
      signatureHex: `${token.signatureHex.slice(0, -1)}${token.signatureHex.endsWith('0') ? '1' : '0'}`,
    })).toBe(false)
    expect(verifySpectreBlindToken(TEST_PARAMS, {
      ...token,
      keyId: 'other-key',
    })).toBe(false)
    expect(verifySpectreBlindToken(TEST_PARAMS, {
      ...token,
      signatureHex: 'not-hex',
    })).toBe(false)
    expect(verifySpectreBlindToken(TEST_PARAMS, {
      ...token,
      walletAddress: 'not-a-wallet',
    })).toBe(false)
    expect(verifySpectreBlindToken(TEST_PARAMS, {
      ...token,
      nullifierHex: 'abc',
    })).toBe(false)
    expect(verifySpectreBlindToken(TEST_PARAMS, {
      ...token,
      signatureHex: '00'.repeat(256),
    })).toBe(false)
  })

  it('throws when public parameters are unsupported or unsafe', () => {
    expect(() => prepareSpectreBlindTokenRequest({
      ...TEST_PARAMS,
      algorithm: 'other' as 'rsa-fdh-v1',
    }, TEST_WALLET_ADDRESS, true)).toThrow('Unsupported Spectre blind token algorithm')
    expect(() => prepareSpectreBlindTokenRequest({
      ...TEST_PARAMS,
      domain: 'wrong-domain',
    }, TEST_WALLET_ADDRESS, true)).toThrow('Unexpected Spectre blind token domain')
    expect(() => prepareSpectreBlindTokenRequest({
      ...TEST_PARAMS,
      keyId: ' ',
    }, TEST_WALLET_ADDRESS, true)).toThrow('key id')
    expect(() => prepareSpectreBlindTokenRequest({
      ...TEST_PARAMS,
      modulusHex: '0ca1',
    }, TEST_WALLET_ADDRESS, true)).toThrow('modulus is too small')
    expect(() => prepareSpectreBlindTokenRequest({
      ...TEST_PARAMS,
      modulusHex: `${TEST_PARAMS.modulusHex.slice(0, -1)}2`,
    }, TEST_WALLET_ADDRESS, true)).toThrow('must be an odd integer')
    expect(() => prepareSpectreBlindTokenRequest({
      ...TEST_PARAMS,
      publicExponentHex: '03',
    }, TEST_WALLET_ADDRESS, true)).toThrow('public exponent')
  })

  it('rejects mismatched blind signatures during finalization', () => {
    const prepared = prepareSpectreBlindTokenRequest(TEST_PARAMS, TEST_WALLET_ADDRESS, true)
    expect(() => finalizeSpectreBlindToken(
      TEST_PARAMS,
      prepared,
      '01'.padStart(TEST_PARAMS.modulusHex.length, '0'),
    )).toThrow('Blind activation signature verification failed')
  })

  it('hashes nullifiers with a stable domain-separated digest', () => {
    expect(hashSpectreBlindTokenNullifier(TEST_NULLIFIER)).toMatch(/^[0-9a-f]{64}$/)
    expect(hashSpectreBlindTokenNullifier(TEST_NULLIFIER)).toBe(
      hashSpectreBlindTokenNullifier(TEST_NULLIFIER.toUpperCase()),
    )
    expect(hashSpectreBlindTokenNullifier(TEST_NULLIFIER)).not.toBe(
      hashSpectreBlindTokenNullifier(`${'22'.repeat(32)}`),
    )
    expect(() => hashSpectreBlindTokenNullifier('abc')).toThrow('Invalid hexadecimal payload')
  })
})
