/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'

import {
  assertVdfPublicParams,
  createVdfProofFromNativeResult,
  deriveVdfNativeProofPrime,
  hashVdfBinding,
  prepareVdfNativeEvaluation,
  solveVdf,
  verifyVdf,
  VDF_ALGORITHM,
  VDF_DOMAIN,
  type VdfInput,
  type VdfPublicParams,
} from './vdf'
import { verifyVdf as verifyEdgeVdf } from '../../../supabase/functions/_shared/vdf'

const TEST_PARAMS: VdfPublicParams = {
  algorithm: VDF_ALGORITHM,
  domain: VDF_DOMAIN,
  parameterId: 'test-v1',
  modulusHex: 'd0a80ef6e324476f2f29099c7c9064e2562684e1c6470c74b79811d37d487f9ced83cdd7933f9680e3d84629183cc2077cadb35eb5d73e523a7137a03f9ce6fbd3ca46ecf7dd07781e8b5c3686bf97d7054a264a6e90cc22619df047c4b4713ee9a3f91620f9e26a28d14823db16262347065ab808727efebbd6b6618c2fc38057a57ab02a6289855357a3c55bdd19b843c5793ee9c1f997b804a3a5432865ef364667aebac969feda94aa908db44112c94b3cb4917a341f80945bd25faad00e87fc1561fdc2cc73ddb172befe2fb83033bd140b0c3f7f8348f3a8c1ca83a3a219ea28469f2a64be087df3744981b5e821bbc7af12e74b937c2b4696c3225de3',
  iterations: 48,
}

const TEST_INPUT: VdfInput = {
  challengeId: `vdfc1.${'a'.repeat(32)}`,
  nonceHex: 'b'.repeat(64),
  action: 'public_discovery',
  bindingHash: hashVdfBinding({
    identityId: 'identity-alice-123',
    recipientMailboxToken: 'smbx1.abcdefghijklmnop',
  }),
}

describe('wesolowski VDF', () => {
  it('binds JSON-equivalent optional fields identically', () => {
    expect(hashVdfBinding({
      identityId: 'identity-alice-123',
      recipientMailboxToken: undefined,
    })).toBe(hashVdfBinding({
      identityId: 'identity-alice-123',
    }))
  })

  it('solves and verifies a bound proof', async () => {
    const progress: number[] = []
    const proof = await solveVdf(TEST_PARAMS, TEST_INPUT, {
      yieldEveryIterations: 8,
      yieldControl: async () => {},
      onProgress: ({ completedIterations }) => progress.push(completedIterations),
    })

    expect(proof.outputHex).toMatch(/^[0-9a-f]{512}$/)
    expect(proof.proofHex).toMatch(/^[0-9a-f]{512}$/)
    expect(progress.length).toBeGreaterThan(1)
    expect(verifyVdf(TEST_PARAMS, TEST_INPUT, proof)).toBe(true)
    expect(verifyEdgeVdf(TEST_PARAMS, TEST_INPUT, proof)).toBe(true)
  })

  it('keeps Edge verification aligned for every supported action', async () => {
    const actions: VdfInput['action'][] = [
      'wallet_admission',
      'public_discovery',
      'extend_public_discovery',
      'claim_session_opk',
      'contact_card',
      'wallet_index_activation',
    ]
    await Promise.all(actions.map(async (action) => {
      const input = { ...TEST_INPUT, action }
      const proof = await solveVdf(TEST_PARAMS, input, {
        yieldControl: async () => {},
      })
      expect(verifyEdgeVdf(TEST_PARAMS, input, proof)).toBe(true)
    }))
  })

  it('prepares and validates the native solver contract', async () => {
    const prepared = prepareVdfNativeEvaluation(TEST_PARAMS, TEST_INPUT)
    const proof = await solveVdf(TEST_PARAMS, TEST_INPUT, {
      yieldControl: async () => {},
    })

    expect(prepared.modulusHex).toBe(TEST_PARAMS.modulusHex)
    expect(prepared.groupElementHex).toMatch(/^[0-9a-f]{512}$/)
    expect(deriveVdfNativeProofPrime(TEST_PARAMS, TEST_INPUT, proof.outputHex)).toMatch(
      /^[0-9a-f]{32}$/,
    )
    expect(createVdfProofFromNativeResult(
      TEST_PARAMS,
      proof.outputHex,
      proof.proofHex,
    )).toEqual(proof)
  })

  it('rejects replay across an action or resource binding', async () => {
    const proof = await solveVdf(TEST_PARAMS, TEST_INPUT, {
      yieldControl: async () => {},
    })

    expect(verifyVdf(TEST_PARAMS, {
      ...TEST_INPUT,
      action: 'contact_card',
    }, proof)).toBe(false)
    expect(verifyVdf(TEST_PARAMS, {
      ...TEST_INPUT,
      bindingHash: hashVdfBinding({ identityId: 'identity-mallory-123' }),
    }, proof)).toBe(false)
  })

  it('rejects malformed parameters and altered witnesses', async () => {
    expect(() => assertVdfPublicParams({
      ...TEST_PARAMS,
      modulusHex: 'cafe',
    })).toThrow('size')

    const proof = await solveVdf(TEST_PARAMS, TEST_INPUT, {
      yieldControl: async () => {},
    })
    expect(verifyVdf(TEST_PARAMS, TEST_INPUT, {
      ...proof,
      proofHex: `${proof.proofHex.slice(0, -1)}${proof.proofHex.endsWith('0') ? '1' : '0'}`,
    })).toBe(false)
  })
})
