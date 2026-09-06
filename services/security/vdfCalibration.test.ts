/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { solveVdfOnDevice } = vi.hoisted(() => ({
  solveVdfOnDevice: vi.fn(),
}))

vi.mock('./nativeVdf', () => ({ solveVdfOnDevice }))

import {
  calibrateVdfOnDevice,
  getVdfCalibrationModulus,
} from './vdfCalibration'

const modulusHex = `${'a'.repeat(511)}b`

describe('VDF calibration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('EXPO_PUBLIC_VDF_CALIBRATION_MODULUS_HEX', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('accepts a normalized supported modulus', () => {
    vi.stubEnv('EXPO_PUBLIC_VDF_CALIBRATION_MODULUS_HEX', ` 0x${modulusHex.toUpperCase()} `)

    expect(getVdfCalibrationModulus()).toBe(modulusHex)
  })

  it('rejects unsupported calibration moduli', () => {
    vi.stubEnv('EXPO_PUBLIC_VDF_CALIBRATION_MODULUS_HEX', `${'a'.repeat(511)}c`)
    expect(getVdfCalibrationModulus()).toBeNull()

    vi.stubEnv('EXPO_PUBLIC_VDF_CALIBRATION_MODULUS_HEX', 'a'.repeat(510))
    expect(getVdfCalibrationModulus()).toBeNull()
  })

  it('benchmarks a complete native solve and scales its iterations', async () => {
    solveVdfOnDevice.mockResolvedValue({})
    vi.spyOn(performance, 'now')
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(5_100)

    await expect(calibrateVdfOnDevice(modulusHex)).resolves.toEqual({
      sampleIterations: 250_000,
      elapsedMs: 5_000,
      iterationsPerSecond: 50_000,
      candidateIterations: 600_000,
    })
    expect(solveVdfOnDevice).toHaveBeenCalledWith(
      expect.objectContaining({
        parameterId: 'calibration-v1',
        modulusHex,
        iterations: 250_000,
      }),
      expect.objectContaining({
        action: 'contact_card',
        nonceHex: '0'.repeat(64),
      }),
      { signal: undefined },
    )
  })
})
