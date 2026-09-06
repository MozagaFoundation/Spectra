/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md
 */

import {
  createVdfProofFromNativeResult,
  deriveVdfNativeProofPrime,
  prepareVdfNativeEvaluation,
  solveVdf,
  type VdfInput,
  type VdfProgress,
  type VdfProof,
  type VdfPublicParams,
  type VdfSolveOptions,
} from '@spectra/privacy-protocol'
import {
  DeviceEventEmitter,
  NativeEventEmitter,
  NativeModules,
  Platform,
} from 'react-native'

const PROGRESS_EVENT = 'SpectraVdfProgress'

interface NativeVdfProgress {
  jobId: string
  phase: VdfProgress['phase']
  completedIterations: number
  totalIterations: number
}

interface NativeVdfModule {
  addListener(eventName: string): void
  removeListeners(count: number): void
  evaluate(
    jobId: string,
    modulusHex: string,
    baseHex: string,
    iterations: number,
  ): Promise<string>
  prove(
    jobId: string,
    modulusHex: string,
    baseHex: string,
    primeHex: string,
    iterations: number,
  ): Promise<string>
  cancel(jobId: string): void
}

let testModule: NativeVdfModule | null | undefined

export function __setNativeVdfModuleForTests(module: NativeVdfModule | null | undefined): void {
  testModule = module
}

function getNativeVdfModule(): NativeVdfModule | null {
  if (testModule !== undefined) return testModule
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null
  return (NativeModules.VdfModule as NativeVdfModule | undefined) ?? null
}

function nativeSolverUnavailable(): Error & { code: 'ERR_VDF_UNAVAILABLE' } {
  const error = new Error('Native VDF solver is unavailable in this app build') as Error & {
    code: 'ERR_VDF_UNAVAILABLE'
  }
  error.code = 'ERR_VDF_UNAVAILABLE'
  return error
}

function abortError(): Error {
  const error = new Error('VDF solving was cancelled')
  error.name = 'AbortError'
  return error
}

function randomJobId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return `nvdf1.${Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')}`
}

function isCancellation(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ERR_VDF_CANCELLED',
  )
}

function subscribeToProgress(
  nativeModule: NativeVdfModule,
  jobId: string,
  onProgress: VdfSolveOptions['onProgress'],
) {
  if (!onProgress) return null
  const listener = (event: NativeVdfProgress) => {
    if (
      event?.jobId !== jobId ||
      (event.phase !== 'evaluate' && event.phase !== 'prove') ||
      !Number.isSafeInteger(event.completedIterations) ||
      !Number.isSafeInteger(event.totalIterations)
    ) {
      return
    }
    onProgress({
      phase: event.phase,
      completedIterations: event.completedIterations,
      totalIterations: event.totalIterations,
    })
  }
  return Platform.OS === 'android'
    ? DeviceEventEmitter.addListener(PROGRESS_EVENT, listener)
    : new NativeEventEmitter(nativeModule).addListener(PROGRESS_EVENT, listener)
}

export async function solveVdfOnDevice(
  params: VdfPublicParams,
  input: VdfInput,
  options: Pick<VdfSolveOptions, 'signal' | 'onProgress'> = {},
): Promise<VdfProof> {
  const nativeModule = getNativeVdfModule()
  if (!nativeModule) {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
      return await solveVdf(params, input, options)
    }
    throw nativeSolverUnavailable()
  }
  if (options.signal?.aborted) throw abortError()

  const prepared = prepareVdfNativeEvaluation(params, input)
  const jobId = randomJobId()
  const subscription = subscribeToProgress(nativeModule, jobId, options.onProgress)
  const cancel = () => nativeModule.cancel(jobId)
  options.signal?.addEventListener('abort', cancel, { once: true })

  try {
    const outputHex = await nativeModule.evaluate(
      jobId,
      prepared.modulusHex,
      prepared.groupElementHex,
      prepared.iterations,
    )
    if (options.signal?.aborted) throw abortError()
    const primeHex = deriveVdfNativeProofPrime(params, input, outputHex)
    const proofHex = await nativeModule.prove(
      jobId,
      prepared.modulusHex,
      prepared.groupElementHex,
      primeHex,
      prepared.iterations,
    )
    if (options.signal?.aborted) throw abortError()
    return createVdfProofFromNativeResult(params, outputHex, proofHex)
  } catch (error) {
    if (options.signal?.aborted || isCancellation(error)) throw abortError()
    throw error
  } finally {
    options.signal?.removeEventListener('abort', cancel)
    subscription?.remove()
  }
}

