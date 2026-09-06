/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import {
  generateMnemonic as generateBip39Mnemonic,
  validateMnemonic as validateBip39Mnemonic,
} from '@scure/bip39'
import { wordlist as englishWordlist } from '@scure/bip39/wordlists/english.js'
import { sha256 } from '@noble/hashes/sha256'
import { Dilithium, bytesToHex as dilithiumBytesToHex } from './dilithium'
import { deriveChainAccounts } from './chainKeyDerivation'
import { generateId, hexToBytes } from './hex'
import { normalizeMnemonicPhrase } from './mnemonic'
import type { EXOWallet } from './types'

const SPECTRE_DISPLAY_NAME = 'Spectre Account'
const TRANSPARENT_EXO_ACCOUNT_COUNT = 5
export const DEFAULT_SIGN_MESSAGE_DOMAIN = 'Spectra.IdentityVault.SignMessage.v1'
export const DEFAULT_TRANSPARENT_EXO_ACCOUNT_COUNT = TRANSPARENT_EXO_ACCOUNT_COUNT
export const DETERMINISTIC_EXO_WALLET_BUNDLE_SIZE = TRANSPARENT_EXO_ACCOUNT_COUNT + 2
export { getEnglishBip39PrefixSuggestions } from './mnemonic'

export const MNEMONIC_VALIDATION_ERROR_CODES = {
  invalidWordCount: 'mnemonic_invalid_word_count',
  invalidWord: 'mnemonic_invalid_word',
  invalidChecksum: 'mnemonic_invalid_checksum',
} as const

export type MnemonicValidationErrorCode =
  (typeof MNEMONIC_VALIDATION_ERROR_CODES)[keyof typeof MNEMONIC_VALIDATION_ERROR_CODES]

export type MnemonicValidationFailure =
  | {
      valid: false
      code: typeof MNEMONIC_VALIDATION_ERROR_CODES.invalidWordCount
      params?: undefined
    }
  | {
      valid: false
      code: typeof MNEMONIC_VALIDATION_ERROR_CODES.invalidWord
      params: { word: string }
    }
  | {
      valid: false
      code: typeof MNEMONIC_VALIDATION_ERROR_CODES.invalidChecksum
      params?: undefined
    }

export type MnemonicValidationResult =
  | { valid: true }
  | MnemonicValidationFailure

export class MnemonicValidationError extends Error {
  readonly code: MnemonicValidationErrorCode
  readonly params: Record<string, string> | undefined

  constructor(
    code: MnemonicValidationErrorCode,
    params?: Record<string, string>,
  ) {
    super(code)
    this.name = 'MnemonicValidationError'
    this.code = code
    this.params = params
  }
}

export type DeterministicEXOWalletBundleDerivationStage =
  | 'root'
  | 'transparent'
  | 'spectre'

export interface DeterministicEXOWalletBundleProgress {
  completed: number
  total: number
  stage: DeterministicEXOWalletBundleDerivationStage
  transparentIndex?: number
}

export interface DeterministicEXOWalletBundleOptions {
  rootDisplayName?: string
  spectreDisplayName?: string
  transparentDisplayName?: (index: number) => string
  onProgress?: (progress: DeterministicEXOWalletBundleProgress) => void
  yieldToEventLoop?: (progress: DeterministicEXOWalletBundleProgress) => Promise<void>
}

let dilithiumInstance: Dilithium | null = null
const BIP39_WORD_SET = new Set(englishWordlist)

async function getDilithium(): Promise<Dilithium> {
  if (!dilithiumInstance) {
    dilithiumInstance = await Dilithium.init()
  }
  return dilithiumInstance
}

export function generateMnemonic(): string {
  return generateBip39Mnemonic(englishWordlist, 256)
}

export function validateMnemonic(mnemonic: string): MnemonicValidationResult {
  const words = normalizeMnemonicPhrase(mnemonic).split(/\s+/)

  if (words.length !== 24 && words.length !== 12) {
    return {
      valid: false,
      code: MNEMONIC_VALIDATION_ERROR_CODES.invalidWordCount,
    }
  }

  for (const word of words) {
    if (!BIP39_WORD_SET.has(word)) {
      return {
        valid: false,
        code: MNEMONIC_VALIDATION_ERROR_CODES.invalidWord,
        params: { word },
      }
    }
  }

  if (!validateBip39Mnemonic(words.join(' '), englishWordlist)) {
    return {
      valid: false,
      code: MNEMONIC_VALIDATION_ERROR_CODES.invalidChecksum,
    }
  }

  return { valid: true }
}

function throwMnemonicValidationError(validation: MnemonicValidationFailure): never {
  throw new MnemonicValidationError(validation.code, validation.params)
}

function mnemonicToSeed(mnemonic: string): Uint8Array {
  const mnemonicBytes = new TextEncoder().encode(normalizeMnemonicPhrase(mnemonic))
  return sha256(mnemonicBytes)
}

function mnemonicToSpectreSeed(mnemonic: string): Uint8Array {
  const domainSeparatedMnemonic = new TextEncoder().encode(`spectre:${normalizeMnemonicPhrase(mnemonic)}`)
  return sha256(domainSeparatedMnemonic)
}

function normalizeTransparentIndex(index: number): number {
  if (!Number.isInteger(index) || index < 1 || index > TRANSPARENT_EXO_ACCOUNT_COUNT) {
    throw new Error(`Transparent EXO account index must be between 1 and ${TRANSPARENT_EXO_ACCOUNT_COUNT}`)
  }
  return index
}

function transparentChainAccountIndex(transparentIndex: number): number {
  return transparentIndex + 1
}

function mnemonicToTransparentSeed(mnemonic: string, transparentIndex: number): Uint8Array {
  const index = normalizeTransparentIndex(transparentIndex)
  const domainSeparatedMnemonic = new TextEncoder().encode(`normal:${index}:${normalizeMnemonicPhrase(mnemonic)}`)
  return sha256(domainSeparatedMnemonic)
}

async function buildWalletFromSeed(
  seed: Uint8Array,
  options: {
    mnemonic: string
    displayName: string
    spectreMode?: boolean
    transparentMode?: boolean
    accountIndex?: number
  },
): Promise<EXOWallet> {
  const { publicKey, privateKey, address } = await generateKeyPairFromSeed(seed)
  const chainAccounts = deriveChainAccounts(options.mnemonic, {
    accountIndex: options.accountIndex,
  })
  const evmAccount = chainAccounts.evm

  return {
    id: generateId(),
    address,
    publicKey,
    privateKey,
    displayName: options.displayName,
    ...(options.spectreMode ? { spectreMode: true } : {}),
    ...(options.transparentMode ? { transparentMode: true } : {}),
    createdAt: Date.now(),
    ethereumAddress: evmAccount?.address,
    ethereumPublicKey: evmAccount?.publicKey,
    ethereumPrivateKey: evmAccount?.privateKey,
    chainAccounts,
  }
}

export async function generateEXOWallet(displayName?: string): Promise<{
  wallet: EXOWallet
  mnemonic: string
}> {
  const mnemonic = generateMnemonic()
  const wallet = await buildWalletFromSeed(mnemonicToSeed(mnemonic), {
    mnemonic,
    displayName: displayName || 'Post-Quantum Account',
  })

  return { wallet, mnemonic }
}

export async function importWalletFromMnemonic(
  mnemonic: string,
  displayName?: string
): Promise<EXOWallet> {
  const validation = validateMnemonic(mnemonic)
  if (!validation.valid) {
    throwMnemonicValidationError(validation)
  }

  const normalizedMnemonic = normalizeMnemonicPhrase(mnemonic)
  return buildWalletFromSeed(mnemonicToSeed(normalizedMnemonic), {
    mnemonic: normalizedMnemonic,
    displayName: displayName || 'Post-Quantum Account',
  })
}

export async function deriveSpectreWallet(
  mnemonic: string,
  displayName: string = SPECTRE_DISPLAY_NAME,
): Promise<EXOWallet> {
  const validation = validateMnemonic(mnemonic)
  if (!validation.valid) {
    throwMnemonicValidationError(validation)
  }

  const normalizedMnemonic = normalizeMnemonicPhrase(mnemonic)
  return buildWalletFromSeed(mnemonicToSpectreSeed(normalizedMnemonic), {
    mnemonic: normalizedMnemonic,
    displayName,
    spectreMode: true,
    accountIndex: 1,
  })
}

export async function deriveTransparentEXOWallet(
  mnemonic: string,
  displayName: string,
  transparentIndex: number = 1,
): Promise<EXOWallet> {
  const validation = validateMnemonic(mnemonic)
  if (!validation.valid) {
    throwMnemonicValidationError(validation)
  }

  const normalizedMnemonic = normalizeMnemonicPhrase(mnemonic)
  const normalizedIndex = normalizeTransparentIndex(transparentIndex)
  return buildWalletFromSeed(mnemonicToTransparentSeed(normalizedMnemonic, normalizedIndex), {
    mnemonic: normalizedMnemonic,
    displayName,
    transparentMode: true,
    accountIndex: transparentChainAccountIndex(normalizedIndex),
  })
}

export async function deriveDeterministicEXOWalletBundle(
  mnemonic: string,
  options?: DeterministicEXOWalletBundleOptions,
): Promise<{
  rootWallet: EXOWallet
  transparentWallets: EXOWallet[]
  spectreWallet: EXOWallet
}> {
  const reportProgress = async (
    progress: DeterministicEXOWalletBundleProgress,
  ): Promise<void> => {
    options?.onProgress?.(progress)
    await options?.yieldToEventLoop?.(progress)
  }

  const rootWallet = await importWalletFromMnemonic(mnemonic, options?.rootDisplayName)
  await reportProgress({
    completed: 1,
    total: DETERMINISTIC_EXO_WALLET_BUNDLE_SIZE,
    stage: 'root',
  })

  const transparentWallets: EXOWallet[] = []
  for (let index = 1; index <= TRANSPARENT_EXO_ACCOUNT_COUNT; index += 1) {
    transparentWallets.push(await deriveTransparentEXOWallet(
      mnemonic,
      options?.transparentDisplayName?.(index) || `EXO Account ${index}`,
      index,
    ))
    await reportProgress({
      completed: index + 1,
      total: DETERMINISTIC_EXO_WALLET_BUNDLE_SIZE,
      stage: 'transparent',
      transparentIndex: index,
    })
  }

  const spectreWallet = await deriveSpectreWallet(mnemonic, options?.spectreDisplayName)
  await reportProgress({
    completed: DETERMINISTIC_EXO_WALLET_BUNDLE_SIZE,
    total: DETERMINISTIC_EXO_WALLET_BUNDLE_SIZE,
    stage: 'spectre',
  })

  return {
    rootWallet,
    transparentWallets,
    spectreWallet,
  }
}

async function generateKeyPairFromSeed(seed: Uint8Array): Promise<{
  publicKey: string
  privateKey: string
  address: string
}> {
  const dilithium = await getDilithium()
  const keyPair = dilithium.generateKeyPairFromSeed(seed)
  const address = dilithium.deriveAddress(keyPair.publicKey)
  const publicKeyHex = dilithiumBytesToHex(keyPair.publicKey)
  const privateKeyHex = dilithiumBytesToHex(keyPair.privateKey)
  
  return {
    publicKey: publicKeyHex,
    privateKey: privateKeyHex,
    address,
  }
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(length)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function normalizeSigningDomain(domain: string): string {
  const normalized = domain.normalize('NFKC').trim()
  if (!normalized || normalized.includes('\u0000')) {
    throw new Error('Invalid signing domain')
  }
  return normalized
}

export function createSignedMessagePayload(
  message: string | Uint8Array,
  domain: string = DEFAULT_SIGN_MESSAGE_DOMAIN,
): Uint8Array {
  const messageBytes = typeof message === 'string'
    ? new TextEncoder().encode(message)
    : message
  const domainBytes = new TextEncoder().encode(`${normalizeSigningDomain(domain)}\u0000`)
  return concatBytes(domainBytes, messageBytes)
}

export async function signMessage(
  message: string | Uint8Array,
  privateKeyHex: string,
  options?: { domain?: string },
): Promise<string> {
  const dilithium = await getDilithium()

  const privateKey = hexToBytes(privateKeyHex)
  const signature = dilithium.sign(
    createSignedMessagePayload(message, options?.domain),
    privateKey,
  )

  return dilithiumBytesToHex(signature)
}
