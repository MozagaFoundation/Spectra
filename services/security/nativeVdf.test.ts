/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  hashVdfBinding,
  solveVdf,
  VDF_ALGORITHM,
  VDF_DOMAIN,
  type VdfInput,
  type VdfPublicParams,
} from '@spectra/privacy-protocol'

import { __setNativeVdfModuleForTests, solveVdfOnDevice } from './nativeVdf'

const params: VdfPublicParams = {
  algorithm: VDF_ALGORITHM,
  domain: VDF_DOMAIN,
  parameterId: 'native-test-v1',
  modulusHex: 'd0a80ef6e324476f2f29099c7c9064e2562684e1c6470c74b79811d37d487f9ced83cdd7933f9680e3d84629183cc2077cadb35eb5d73e523a7137a03f9ce6fbd3ca46ecf7dd07781e8b5c3686bf97d7054a264a6e90cc22619df047c4b4713ee9a3f91620f9e26a28d14823db16262347065ab808727efebbd6b6618c2fc38057a57ab02a6289855357a3c55bdd19b843c5793ee9c1f997b804a3a5432865ef364667aebac969feda94aa908db44112c94b3cb4917a341f80945bd25faad00e87fc1561fdc2cc73ddb172befe2fb83033bd140b0c3f7f8348f3a8c1ca83a3a219ea28469f2a64be087df3744981b5e821bbc7af12e74b937c2b4696c3225de3',
  iterations: 48,
}

const input: VdfInput = {
  challengeId: `vdfc1.${'a'.repeat(32)}`,
  nonceHex: 'b'.repeat(64),
  action: 'public_discovery',
  bindingHash: hashVdfBinding({
    identityId: 'identity-alice-123',
    recipientMailboxToken: 'smbx1.abcdefghijklmnop',
  }),
}

afterEach(() => {
  __setNativeVdfModuleForTests(undefined)
})

describe('native VDF adapter', () => {
  it('fails closed when a mobile build lacks its native worker', async () => {
    __setNativeVdfModuleForTests(null)

    await expect(solveVdfOnDevice(params, input)).rejects.toMatchObject({
      code: 'ERR_VDF_UNAVAILABLE',
    })
  })

  it('accepts a native result only after protocol validation', async () => {
    const proof = await solveVdf(params, input, { yieldControl: async () => {} })
    const nativeModule = {
      addListener: vi.fn(),
      removeListeners: vi.fn(),
      evaluate: vi.fn().mockResolvedValue(proof.outputHex),
      prove: vi.fn().mockResolvedValue(proof.proofHex),
      cancel: vi.fn(),
    }
    __setNativeVdfModuleForTests(nativeModule)

    await expect(solveVdfOnDevice(params, input)).resolves.toEqual(proof)
    expect(nativeModule.evaluate).toHaveBeenCalledTimes(1)
    expect(nativeModule.prove).toHaveBeenCalledTimes(1)
  })

  it('cancels an active native solve', async () => {
    let rejectEvaluation: (reason?: unknown) => void = () => {}
    const nativeModule = {
      addListener: vi.fn(),
      removeListeners: vi.fn(),
      evaluate: vi.fn(() => new Promise<string>((_resolve, reject) => {
        rejectEvaluation = reject
      })),
      prove: vi.fn(),
      cancel: vi.fn(() => rejectEvaluation({ code: 'ERR_VDF_CANCELLED' })),
    }
    __setNativeVdfModuleForTests(nativeModule)
    const controller = new AbortController()
    const solving = solveVdfOnDevice(params, input, { signal: controller.signal })

    controller.abort()

    await expect(solving).rejects.toMatchObject({ name: 'AbortError' })
    expect(nativeModule.cancel).toHaveBeenCalledTimes(1)
  })
})
