/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { sha256 } from '@noble/hashes/sha256'

export const VDF_ALGORITHM = 'wesolowski-rsa-v1' as const
export const VDF_DOMAIN = 'spectra.discovery.vdf.v1'

const MIN_RSA_MODULUS_BYTES = 256
const MAX_RSA_MODULUS_BYTES = 1024
const MAX_VDF_ITERATIONS = 20_000_000
const PRIME_BITS = 128
const PRIME_ROUNDS = 24
const encoder = new TextEncoder()

export type VdfAction =
  | 'wallet_admission'
  | 'public_discovery'
  | 'extend_public_discovery'
  | 'claim_session_opk'
  | 'contact_card'
  | 'wallet_index_activation'

export interface VdfPublicParams {
  algorithm: typeof VDF_ALGORITHM
  domain: typeof VDF_DOMAIN
  parameterId: string
  modulusHex: string
  iterations: number
}

export interface VdfInput {
  challengeId: string
  nonceHex: string
  action: VdfAction
  bindingHash: string
}

export interface VdfProof {
  algorithm: typeof VDF_ALGORITHM
  parameterId: string
  outputHex: string
  proofHex: string
}

export interface VdfProgress {
  phase: 'evaluate' | 'prove'
  completedIterations: number
  totalIterations: number
}

export interface VdfSolveOptions {
  signal?: AbortSignal
  onProgress?: (progress: VdfProgress) => void
  yieldEveryIterations?: number
  yieldControl?: () => Promise<void>
}

export interface VdfNativeEvaluation {
  modulusHex: string
  groupElementHex: string
  iterations: number
}

interface ParsedVdfParams {
  params: VdfPublicParams
  modulus: bigint
  byteLength: number
}

function normalizeHex(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/^0x/, '')
  if (
    normalized.length === 0 ||
    normalized.length % 2 !== 0 ||
    !/^[0-9a-f]+$/.test(normalized)
  ) {
    throw new Error('Invalid hexadecimal payload')
  }
  return normalized
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

function bigIntToHex(value: bigint, byteLength: number): string {
  if (value < 0n) throw new Error('Negative bigint values are not supported')
  let hex = value.toString(16)
  if (hex.length % 2 !== 0) hex = `0${hex}`
  if (hex.length > byteLength * 2) {
    throw new Error('Bigint does not fit in the requested byte length')
  }
  return hex.padStart(byteLength * 2, '0')
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce((total, part) => total + part.length, 0)
  const joined = new Uint8Array(totalLength)
  let offset = 0
  for (const part of parts) {
    joined.set(part, offset)
    offset += part.length
  }
  return joined
}

function counterBytes(counter: number): Uint8Array {
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
  let result = 1n
  let value = base % modulus
  let power = exponent
  while (power > 0n) {
    if ((power & 1n) === 1n) result = (result * value) % modulus
    power >>= 1n
    value = (value * value) % modulus
  }
  return result
}

function expandHash(seed: Uint8Array, outputLength: number): Uint8Array {
  const output = new Uint8Array(outputLength)
  let offset = 0
  for (let counter = 0; offset < output.length; counter += 1) {
    const block = sha256(concatBytes(seed, counterBytes(counter)))
    output.set(block.slice(0, Math.min(block.length, output.length - offset)), offset)
    offset += block.length
  }
  return output
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('VDF binding contains a non-finite number')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => entry === undefined ? 'null' : canonicalize(entry)).join(',')}]`
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort().map((key) => (
      `${JSON.stringify(key)}:${canonicalize(record[key])}`
    )).join(',')}}`
  }
  throw new Error('VDF binding contains an unsupported value')
}

export function hashVdfBinding(value: unknown): string {
  return bytesToHex(sha256(concatBytes(
    encoder.encode(`${VDF_DOMAIN}.binding\0`),
    encoder.encode(canonicalize(value)),
  )))
}

function parseVdfParams(params: VdfPublicParams): ParsedVdfParams {
  if (
    params.algorithm !== VDF_ALGORITHM ||
    params.domain !== VDF_DOMAIN ||
    !/^[A-Za-z0-9_.-]{1,64}$/.test(params.parameterId) ||
    !Number.isSafeInteger(params.iterations) ||
    params.iterations < 1 ||
    params.iterations > MAX_VDF_ITERATIONS
  ) {
    throw new Error('Invalid VDF public parameters')
  }
  const modulusHex = normalizeHex(params.modulusHex)
  const byteLength = modulusHex.length / 2
  if (byteLength < MIN_RSA_MODULUS_BYTES || byteLength > MAX_RSA_MODULUS_BYTES) {
    throw new Error('VDF modulus has an unsupported size')
  }
  const modulus = BigInt(`0x${modulusHex}`)
  if (modulus <= 3n || (modulus & 1n) !== 1n) {
    throw new Error('VDF modulus must be an odd integer')
  }
  return {
    params: {
      ...params,
      modulusHex,
    },
    modulus,
    byteLength,
  }
}

export function assertVdfPublicParams(params: VdfPublicParams): void {
  parseVdfParams(params)
}

function assertVdfInput(input: VdfInput): void {
  if (
    !/^vdfc1\.[0-9a-f]{32,128}$/.test(input.challengeId) ||
    !/^[0-9a-f]{64}$/.test(input.nonceHex) ||
    ![
      'wallet_admission',
      'public_discovery',
      'extend_public_discovery',
      'claim_session_opk',
      'contact_card',
      'wallet_index_activation',
    ].includes(input.action) ||
    !/^[0-9a-f]{64}$/.test(input.bindingHash)
  ) {
    throw new Error('Invalid VDF input')
  }
}

function vdfInputBytes(input: VdfInput): Uint8Array {
  assertVdfInput(input)
  return encoder.encode([
    `${VDF_DOMAIN}.input`,
    `challenge:${input.challengeId}`,
    `nonce:${input.nonceHex}`,
    `action:${input.action}`,
    `binding:${input.bindingHash}`,
  ].join('\n'))
}

function mapInputToGroup(parsed: ParsedVdfParams, input: VdfInput): bigint {
  const material = expandHash(
    concatBytes(encoder.encode(`${VDF_DOMAIN}.group\0`), vdfInputBytes(input)),
    parsed.byteLength + 16,
  )
  const candidate = (bytesToBigInt(material) % (parsed.modulus - 3n)) + 2n
  if (gcd(candidate, parsed.modulus) !== 1n) {
    throw new Error('VDF input does not map to the RSA group')
  }
  return candidate
}

export function prepareVdfNativeEvaluation(
  params: VdfPublicParams,
  input: VdfInput,
): VdfNativeEvaluation {
  const parsed = parseVdfParams(params)
  return {
    modulusHex: parsed.params.modulusHex,
    groupElementHex: bigIntToHex(mapInputToGroup(parsed, input), parsed.byteLength),
    iterations: parsed.params.iterations,
  }
}

function hashToPrime(parsed: ParsedVdfParams, input: VdfInput, output: bigint): bigint {
  const seed = sha256(concatBytes(
    encoder.encode(`${VDF_DOMAIN}.prime\0`),
    vdfInputBytes(input),
    hexToBytes(bigIntToHex(output, parsed.byteLength)),
    encoder.encode(parsed.params.parameterId),
    encoder.encode(String(parsed.params.iterations)),
  ))
  const highBit = 1n << BigInt(PRIME_BITS - 1)
  for (let counter = 0; counter < 1_024; counter += 1) {
    const candidate = bytesToBigInt(expandHash(
      concatBytes(seed, counterBytes(counter)),
      PRIME_BITS / 8,
    )) | highBit | 1n
    if (isProbablePrime(candidate, seed)) return candidate
  }
  throw new Error('Unable to derive VDF challenge prime')
}

export function deriveVdfNativeProofPrime(
  params: VdfPublicParams,
  input: VdfInput,
  outputHex: string,
): string {
  const parsed = parseVdfParams(params)
  const output = parseGroupElement(parsed, outputHex)
  return bigIntToHex(hashToPrime(parsed, input, output), PRIME_BITS / 8)
}

export function createVdfProofFromNativeResult(
  params: VdfPublicParams,
  outputHex: string,
  proofHex: string,
): VdfProof {
  const parsed = parseVdfParams(params)
  const { output, witness } = assertProofShape(parsed, {
    algorithm: VDF_ALGORITHM,
    parameterId: parsed.params.parameterId,
    outputHex,
    proofHex,
  })
  return {
    algorithm: VDF_ALGORITHM,
    parameterId: parsed.params.parameterId,
    outputHex: bigIntToHex(output, parsed.byteLength),
    proofHex: bigIntToHex(witness, parsed.byteLength),
  }
}

function isProbablePrime(value: bigint, seed: Uint8Array): boolean {
  if (value < 2n) return false
  const smallPrimes = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n]
  for (const prime of smallPrimes) {
    if (value === prime) return true
    if (value % prime === 0n) return false
  }
  let oddPart = value - 1n
  let twoPower = 0
  while ((oddPart & 1n) === 0n) {
    oddPart >>= 1n
    twoPower += 1
  }
  for (let round = 0; round < PRIME_ROUNDS; round += 1) {
    const base = (bytesToBigInt(sha256(concatBytes(
      encoder.encode(`${VDF_DOMAIN}.miller-rabin\0`),
      seed,
      counterBytes(round),
    ))) % (value - 3n)) + 2n
    let witness = modPow(base, oddPart, value)
    if (witness === 1n || witness === value - 1n) continue
    let passed = false
    for (let power = 1; power < twoPower; power += 1) {
      witness = (witness * witness) % value
      if (witness === value - 1n) {
        passed = true
        break
      }
    }
    if (!passed) return false
  }
  return true
}

function parseGroupElement(parsed: ParsedVdfParams, valueHex: string): bigint {
  const normalized = normalizeHex(valueHex)
  if (normalized.length !== parsed.byteLength * 2) {
    throw new Error('Invalid VDF proof length')
  }
  const value = BigInt(`0x${normalized}`)
  if (
    value <= 0n ||
    value >= parsed.modulus ||
    gcd(value, parsed.modulus) !== 1n
  ) {
    throw new Error('Invalid VDF group element')
  }
  return value
}

function assertProofShape(parsed: ParsedVdfParams, proof: VdfProof): {
  output: bigint
  witness: bigint
} {
  if (
    proof.algorithm !== VDF_ALGORITHM ||
    proof.parameterId !== parsed.params.parameterId
  ) {
    throw new Error('Unsupported VDF proof')
  }
  const output = parseGroupElement(parsed, proof.outputHex)
  const witness = parseGroupElement(parsed, proof.proofHex)
  return { output, witness }
}

function shouldYield(iteration: number, every: number): boolean {
  return iteration > 0 && iteration % every === 0
}

async function yieldControl(options: VdfSolveOptions): Promise<void> {
  if (options.signal?.aborted) {
    const error = new Error('VDF solving was cancelled')
    error.name = 'AbortError'
    throw error
  }
  if (options.yieldControl) {
    await options.yieldControl()
    return
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
}

export async function solveVdf(
  params: VdfPublicParams,
  input: VdfInput,
  options: VdfSolveOptions = {},
): Promise<VdfProof> {
  const parsed = parseVdfParams(params)
  const groupElement = mapInputToGroup(parsed, input)
  const yieldEvery = Math.max(1, Math.floor(options.yieldEveryIterations ?? 64))
  const totalIterations = parsed.params.iterations * 2
  let output = groupElement

  for (let iteration = 0; iteration < parsed.params.iterations; iteration += 1) {
    output = (output * output) % parsed.modulus
    if (shouldYield(iteration + 1, yieldEvery) || iteration + 1 === parsed.params.iterations) {
      options.onProgress?.({
        phase: 'evaluate',
        completedIterations: iteration + 1,
        totalIterations,
      })
      await yieldControl(options)
    }
  }

  const prime = hashToPrime(parsed, input, output)
  const exponent = (1n << BigInt(parsed.params.iterations)) / prime
  let witness = 1n
  let base = groupElement
  let power = exponent
  let completed = 0

  while (power > 0n) {
    if ((power & 1n) === 1n) witness = (witness * base) % parsed.modulus
    power >>= 1n
    base = (base * base) % parsed.modulus
    completed += 1
    if (shouldYield(completed, yieldEvery) || power === 0n) {
      options.onProgress?.({
        phase: 'prove',
        completedIterations: parsed.params.iterations + completed,
        totalIterations,
      })
      await yieldControl(options)
    }
  }
  options.onProgress?.({
    phase: 'prove',
    completedIterations: totalIterations,
    totalIterations,
  })

  return {
    algorithm: VDF_ALGORITHM,
    parameterId: parsed.params.parameterId,
    outputHex: bigIntToHex(output, parsed.byteLength),
    proofHex: bigIntToHex(witness, parsed.byteLength),
  }
}

export function verifyVdf(
  params: VdfPublicParams,
  input: VdfInput,
  proof: VdfProof,
): boolean {
  try {
    const parsed = parseVdfParams(params)
    const groupElement = mapInputToGroup(parsed, input)
    const { output, witness } = assertProofShape(parsed, proof)
    const prime = hashToPrime(parsed, input, output)
    const remainder = modPow(2n, BigInt(parsed.params.iterations), prime)
    const expected = (
      modPow(witness, prime, parsed.modulus)
      * modPow(groupElement, remainder, parsed.modulus)
    ) % parsed.modulus
    return expected === output
  } catch {
    return false
  }
}
