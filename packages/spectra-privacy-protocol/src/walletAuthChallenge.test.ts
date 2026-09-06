/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'

import {
  buildWalletAuthChallenge,
  isValidWalletAddress,
  isValidWalletPublicKey,
  isValidWalletSignature,
  normalizeWalletAuthAddress,
  parseWalletAuthChallenge,
} from './walletAuthChallenge'

const TEST_WALLET_ADDRESS = `EXO00${'a'.repeat(38)}`
const TEST_NONCE_HEX = 'ABCDEF0123456789'.repeat(4)

describe('walletAuthChallenge', () => {
  it('builds and parses the wallet auth challenge wire format', () => {
    const challenge = buildWalletAuthChallenge({
      userId: 'user-1',
      walletAddress: TEST_WALLET_ADDRESS.toLowerCase(),
      nonceHex: TEST_NONCE_HEX,
      expiresAt: new Date('2026-05-04T12:00:00.000Z'),
    })

    expect(challenge).toBe([
      'EXO wallet auth',
      'version:1',
      'uid:user-1',
      `wallet:${TEST_WALLET_ADDRESS}`,
      `nonce:${TEST_NONCE_HEX.toLowerCase()}`,
      'expires_at:2026-05-04T12:00:00.000Z',
    ].join('\n'))
    expect(parseWalletAuthChallenge(challenge)).toEqual({
      version: '1',
      userId: 'user-1',
      walletAddress: TEST_WALLET_ADDRESS,
      nonce: TEST_NONCE_HEX.toLowerCase(),
      expiresAt: '2026-05-04T12:00:00.000Z',
    })
  })

  it('validates wallet auth payload shapes', () => {
    expect(isValidWalletAddress(TEST_WALLET_ADDRESS)).toBe(true)
    expect(isValidWalletAddress(TEST_WALLET_ADDRESS.toLowerCase())).toBe(true)
    expect(normalizeWalletAuthAddress(TEST_WALLET_ADDRESS.toUpperCase())).toBe(TEST_WALLET_ADDRESS)
    expect(isValidWalletAddress('EXO00short')).toBe(false)
    expect(() => normalizeWalletAuthAddress('EXO00short')).toThrow('Invalid wallet address')
    expect(isValidWalletPublicKey(`0x${'a'.repeat(3904)}`)).toBe(true)
    expect(isValidWalletPublicKey('0xabc')).toBe(false)
    expect(isValidWalletSignature(`0x${'b'.repeat(6618)}`)).toBe(true)
    expect(isValidWalletSignature('0xabc')).toBe(false)
  })

  it('rejects malformed challenges at the parser boundary', () => {
    const validChallenge = buildWalletAuthChallenge({
      userId: 'user-1',
      walletAddress: TEST_WALLET_ADDRESS,
      nonceHex: TEST_NONCE_HEX,
      expiresAt: '2026-05-04T12:00:00.000Z',
    })

    expect(parseWalletAuthChallenge(`wrong purpose\n${validChallenge}`)).toBeNull()
    expect(parseWalletAuthChallenge(validChallenge.replace('version:1', 'version:2'))).toBeNull()
    expect(parseWalletAuthChallenge(validChallenge.replace(`nonce:${TEST_NONCE_HEX.toLowerCase()}\n`, ''))).toBeNull()
    expect(parseWalletAuthChallenge(`${validChallenge}\nnonce:${'11'.repeat(32)}`)).toBeNull()
    expect(parseWalletAuthChallenge(`${validChallenge}\nunknown:value`)).toBeNull()
    expect(parseWalletAuthChallenge(validChallenge.replace(TEST_WALLET_ADDRESS, TEST_WALLET_ADDRESS.toLowerCase()))).toBeNull()
    expect(parseWalletAuthChallenge(validChallenge.replace(TEST_NONCE_HEX.toLowerCase(), 'abc'))).toBeNull()
    expect(parseWalletAuthChallenge(validChallenge.replace('2026-05-04T12:00:00.000Z', 'not-a-date'))).toBeNull()
    expect(parseWalletAuthChallenge(validChallenge.replace('uid:user-1', 'uid'))).toBeNull()
  })

  it('rejects invalid challenge builder inputs', () => {
    expect(() => buildWalletAuthChallenge({
      userId: 'user-1',
      walletAddress: TEST_WALLET_ADDRESS,
      nonceHex: 'abc',
      expiresAt: '2026-05-04T12:00:00.000Z',
    })).toThrow('nonce')
    expect(() => buildWalletAuthChallenge({
      userId: 'user\n1',
      walletAddress: TEST_WALLET_ADDRESS,
      nonceHex: TEST_NONCE_HEX,
      expiresAt: '2026-05-04T12:00:00.000Z',
    })).toThrow('user id')
    expect(() => buildWalletAuthChallenge({
      userId: 'user-1',
      walletAddress: TEST_WALLET_ADDRESS,
      nonceHex: TEST_NONCE_HEX,
      expiresAt: 'not-a-date',
    })).toThrow('expiration')
  })
})
