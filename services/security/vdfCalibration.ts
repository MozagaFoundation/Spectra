/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md
 */

import {
  solveVdfOnDevice,
} from './nativeVdf'
import {
  VDF_ALGORITHM,
  VDF_DOMAIN,
  type VdfInput,
  type VdfPublicParams,
} from '@spectra/privacy-protocol'

const TARGET_COMPUTE_MS = 12_000
const SAMPLE_ITERATIONS = 250_000
const MAX_ITERATIONS = 20_000_000

export interface VdfCalibrationResult {
  sampleIterations: number
  elapsedMs: number
  iterationsPerSecond: number
  candidateIterations: number
}

export function isVdfCalibrationBuild(): boolean {
  return (
    typeof __DEV__ !== 'undefined' &&
    !__DEV__ &&
    process.env.EXPO_PUBLIC_VDF_CALIBRATION === 'true'
  )
}

export function getVdfCalibrationModulus(): string | null {
  const modulusHex = process.env.EXPO_PUBLIC_VDF_CALIBRATION_MODULUS_HEX
    ?.trim()
    .toLowerCase()
    .replace(/^0x/, '')
  if (
    !modulusHex ||
    modulusHex.length % 2 !== 0 ||
    modulusHex.length < 512 ||
    modulusHex.length > 2048 ||
    !/^[0-9a-f]+$/.test(modulusHex) ||
    Number.parseInt(modulusHex.at(-1)!, 16) % 2 !== 1
  ) {
    return null
  }
  return modulusHex
}

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

function candidateIterations(elapsedMs: number): number {
  const raw = Math.round((SAMPLE_ITERATIONS * TARGET_COMPUTE_MS) / elapsedMs / 1_000) * 1_000
  return Math.min(MAX_ITERATIONS, Math.max(1_000, raw))
}

export async function calibrateVdfOnDevice(
  modulusHex: string,
  signal?: AbortSignal,
): Promise<VdfCalibrationResult> {
  const params: VdfPublicParams = {
    algorithm: VDF_ALGORITHM,
    domain: VDF_DOMAIN,
    parameterId: 'calibration-v1',
    modulusHex,
    iterations: SAMPLE_ITERATIONS,
  }
  const input: VdfInput = {
    challengeId: `vdfc1.${'0'.repeat(32)}`,
    nonceHex: '0'.repeat(64),
    action: 'contact_card',
    bindingHash: '0'.repeat(64),
  }
  const startedAt = nowMs()
  await solveVdfOnDevice(params, input, { signal })
  const elapsedMs = Math.max(1, nowMs() - startedAt)
  return {
    sampleIterations: SAMPLE_ITERATIONS,
    elapsedMs,
    iterationsPerSecond: (SAMPLE_ITERATIONS * 1_000) / elapsedMs,
    candidateIterations: candidateIterations(elapsedMs),
  }
}
