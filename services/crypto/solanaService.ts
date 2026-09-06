/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { ed25519 } from '@noble/curves/ed25519'
import { sha256 } from '@noble/hashes/sha256'
import { base58Decode, base58Encode } from '@/lib/baseEncoding'
import { formatBigIntAmount, parseDecimalToBigInt } from '@/lib/amounts'
import { hexToBytes } from '@/lib/utils'
import { rpcProxyCall } from '@/services/backend/rpcProxy'
import { assertCryptoNetworkAdmission } from './cryptoNetworkAdmission'
import {
  SOLANA_TOKENS,
  formatNetworkTokenAmount,
  parseNetworkTokenAmount,
  type NetworkTokenBalance,
} from './tokenRegistry'

const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111'
const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
const ASSOCIATED_TOKEN_PROGRAM_ID = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'
const PROGRAM_DERIVED_ADDRESS_SEED = new TextEncoder().encode('ProgramDerivedAddress')
const SOL_TX_HASH_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,120}$/

interface SolanaAccountMeta {
  pubkey: string
  isSigner: boolean
  isWritable: boolean
}

interface SolanaInstruction {
  programId: string
  keys: SolanaAccountMeta[]
  data: Uint8Array
}

interface ParsedTokenAccount {
  pubkey: string
  amount: bigint
  decimals: number
}

function normalizePrivateKey(privateKeyHex: string): Uint8Array {
  const normalized = privateKeyHex.startsWith('0x') ? privateKeyHex.slice(2) : privateKeyHex
  if (!/^[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error('Invalid Solana private key')
  }
  return hexToBytes(normalized)
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const result = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

function shortVecLength(length: number): Uint8Array {
  const out: number[] = []
  let remaining = length
  while (true) {
    let elem = remaining & 0x7f
    remaining >>= 7
    if (remaining === 0) {
      out.push(elem)
      break
    }
    elem |= 0x80
    out.push(elem)
  }
  return new Uint8Array(out)
}

function uint32Le(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff])
}

function uint64Le(value: bigint): Uint8Array {
  const bytes = new Uint8Array(8)
  let remaining = value
  for (let i = 0; i < 8; i++) {
    bytes[i] = Number(remaining & 0xffn)
    remaining >>= 8n
  }
  return bytes
}

function isOnEd25519Curve(bytes: Uint8Array): boolean {
  try {
    ed25519.Point.fromHex(bytes)
    return true
  } catch {
    return false
  }
}

function findProgramAddress(seeds: Uint8Array[], programId: string): string {
  const programBytes = base58Decode(programId)
  for (let bump = 255; bump >= 0; bump--) {
    const hash = sha256(concatBytes(...seeds, new Uint8Array([bump]), programBytes, PROGRAM_DERIVED_ADDRESS_SEED))
    if (!isOnEd25519Curve(hash)) {
      return base58Encode(hash)
    }
  }
  throw new Error('Unable to derive Solana program address')
}

export function getAssociatedTokenAddress(owner: string, mint: string): string {
  if (!isValidSolanaAddress(owner) || !isValidSolanaAddress(mint)) {
    throw new Error('Invalid Solana address')
  }
  return findProgramAddress(
    [base58Decode(owner), base58Decode(TOKEN_PROGRAM_ID), base58Decode(mint)],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )
}

function compileSolanaMessage(params: {
  feePayer: string
  recentBlockhash: string
  instructions: SolanaInstruction[]
}): Uint8Array {
  const accountMap = new Map<string, { isSigner: boolean; isWritable: boolean }>()
  const ensureAccount = (pubkey: string, isSigner: boolean, isWritable: boolean) => {
    const existing = accountMap.get(pubkey)
    accountMap.set(pubkey, {
      isSigner: existing?.isSigner || isSigner,
      isWritable: existing?.isWritable || isWritable,
    })
  }

  ensureAccount(params.feePayer, true, true)
  for (const instruction of params.instructions) {
    for (const key of instruction.keys) {
      ensureAccount(key.pubkey, key.isSigner, key.isWritable)
    }
    ensureAccount(instruction.programId, false, false)
  }

  const accounts = Array.from(accountMap.entries()).map(([pubkey, meta]) => ({ pubkey, ...meta }))
  const feePayer = accounts.find((account) => account.pubkey === params.feePayer)
  if (!feePayer) throw new Error('Missing Solana fee payer')

  const otherAccounts = accounts.filter((account) => account.pubkey !== params.feePayer)
  const accountKeys = [
    feePayer,
    ...otherAccounts.filter((account) => account.isSigner && account.isWritable),
    ...otherAccounts.filter((account) => account.isSigner && !account.isWritable),
    ...otherAccounts.filter((account) => !account.isSigner && account.isWritable),
    ...otherAccounts.filter((account) => !account.isSigner && !account.isWritable),
  ]
  const keyIndex = new Map(accountKeys.map((account, index) => [account.pubkey, index]))
  const signedAccounts = accountKeys.filter((account) => account.isSigner)

  const header = new Uint8Array([
    signedAccounts.length,
    signedAccounts.filter((account) => !account.isWritable).length,
    accountKeys.filter((account) => !account.isSigner && !account.isWritable).length,
  ])

  const compiledInstructions = params.instructions.map((instruction) => {
    const programIdIndex = keyIndex.get(instruction.programId)
    if (programIdIndex === undefined) throw new Error('Missing Solana program account')
    const accountIndexes = instruction.keys.map((key) => {
      const accountIndex = keyIndex.get(key.pubkey)
      if (accountIndex === undefined) throw new Error('Missing Solana instruction account')
      return accountIndex
    })

    return concatBytes(
      new Uint8Array([programIdIndex]),
      shortVecLength(accountIndexes.length),
      new Uint8Array(accountIndexes),
      shortVecLength(instruction.data.length),
      instruction.data,
    )
  })

  return concatBytes(
    header,
    shortVecLength(accountKeys.length),
    ...accountKeys.map((account) => base58Decode(account.pubkey)),
    base58Decode(params.recentBlockhash),
    shortVecLength(compiledInstructions.length),
    ...compiledInstructions,
  )
}

async function rpcCall<T>(method: string, params: unknown[] = []): Promise<T> {
  assertCryptoNetworkAdmission('solana')

  try {
    return await rpcProxyCall<T>('solana', method, params)
  } catch (error) {
    if (__DEV__) console.error(`Solana RPC error (${method}):`, error)
    throw new Error('Solana request failed')
  }
}

export function isValidSolanaAddress(address: string): boolean {
  try {
    return base58Decode(address.trim()).length === 32
  } catch {
    return false
  }
}

export function parseSol(amount: string): bigint {
  const parsed = parseDecimalToBigInt(amount, 9)
  if (!parsed || parsed <= 0n) {
    throw new Error('Invalid SOL amount')
  }
  return parsed
}

export function formatSol(lamports: bigint | string): string {
  return formatBigIntAmount(lamports, 9, 6, true)
}

export async function getSolanaBalance(address: string): Promise<string> {
  if (!isValidSolanaAddress(address)) {
    throw new Error('Invalid Solana address')
  }
  const result = await rpcCall<{ value: number }>('getBalance', [address])
  return formatSol(BigInt(result.value))
}

export function parseSplTokenAccountsResponse(response: {
  value?: Array<{
    pubkey: string
    account?: {
      data?: {
        parsed?: {
          info?: {
            tokenAmount?: {
              amount?: string
              decimals?: number
            }
          }
        }
      }
    }
  }>
}): ParsedTokenAccount[] {
  return (response.value || [])
    .map((entry) => {
      const tokenAmount = entry.account?.data?.parsed?.info?.tokenAmount
      if (!tokenAmount?.amount || !Number.isInteger(tokenAmount.decimals)) return null
      return {
        pubkey: entry.pubkey,
        amount: BigInt(tokenAmount.amount),
        decimals: tokenAmount.decimals,
      }
    })
    .filter((entry): entry is ParsedTokenAccount => entry !== null)
}

async function getSplTokenAccounts(owner: string, mint: string): Promise<ParsedTokenAccount[]> {
  const response = await rpcCall<{
    value?: Array<{
      pubkey: string
      account?: {
        data?: {
          parsed?: {
            info?: {
              tokenAmount?: {
                amount?: string
                decimals?: number
              }
            }
          }
        }
      }
    }>
  }>('getTokenAccountsByOwner', [
    owner,
    { mint },
    { encoding: 'jsonParsed', commitment: 'confirmed' },
  ])

  return parseSplTokenAccountsResponse(response)
}

export async function getSplTokenBalance(mintAddress: string, walletAddress: string): Promise<bigint> {
  if (!isValidSolanaAddress(mintAddress) || !isValidSolanaAddress(walletAddress)) {
    throw new Error('Invalid Solana address')
  }

  const accounts = await getSplTokenAccounts(walletAddress, mintAddress)
  return accounts.reduce((total, account) => total + account.amount, 0n)
}

export async function getAllSolanaTokenBalances(walletAddress: string): Promise<NetworkTokenBalance[]> {
  if (!isValidSolanaAddress(walletAddress)) {
    throw new Error('Invalid Solana address')
  }

  const results = await Promise.allSettled(
    SOLANA_TOKENS.map(async (token) => {
      if (!token.mintAddress) return null
      const rawBalance = await getSplTokenBalance(token.mintAddress, walletAddress)
      if (rawBalance === 0n) return null

      return {
        ...token,
        identifier: token.mintAddress,
        balance: formatNetworkTokenAmount(rawBalance, token.decimals),
        balanceRaw: rawBalance.toString(),
      }
    }),
  )

  return results
    .filter((result): result is PromiseFulfilledResult<NetworkTokenBalance | null> => result.status === 'fulfilled')
    .map((result) => result.value)
    .filter((token): token is NetworkTokenBalance => token !== null)
}

function buildTransferMessage(params: {
  from: string
  to: string
  lamports: bigint
  recentBlockhash: string
}): Uint8Array {
  const fromKey = base58Decode(params.from)
  const toKey = base58Decode(params.to)
  const systemProgram = base58Decode(SYSTEM_PROGRAM_ID)
  const recentBlockhash = base58Decode(params.recentBlockhash)
  const instructionData = concatBytes(uint32Le(2), uint64Le(params.lamports))

  return concatBytes(
    new Uint8Array([1, 0, 1]),
    shortVecLength(3),
    fromKey,
    toKey,
    systemProgram,
    recentBlockhash,
    shortVecLength(1),
    new Uint8Array([2]),
    shortVecLength(2),
    new Uint8Array([0, 1]),
    shortVecLength(instructionData.length),
    instructionData,
  )
}

export function buildSplTransferCheckedData(amount: bigint, decimals: number): Uint8Array {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255 || amount <= 0n) {
    throw new Error('Invalid SPL token amount')
  }
  return concatBytes(new Uint8Array([12]), uint64Le(amount), new Uint8Array([decimals]))
}

function buildCreateAssociatedTokenAccountInstruction(params: {
  payer: string
  owner: string
  mint: string
  associatedTokenAccount: string
}): SolanaInstruction {
  return {
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: params.payer, isSigner: true, isWritable: true },
      { pubkey: params.associatedTokenAccount, isSigner: false, isWritable: true },
      { pubkey: params.owner, isSigner: false, isWritable: false },
      { pubkey: params.mint, isSigner: false, isWritable: false },
      { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: new Uint8Array(0),
  }
}

function buildSplTransferCheckedInstruction(params: {
  sourceTokenAccount: string
  mint: string
  destinationTokenAccount: string
  owner: string
  amount: bigint
  decimals: number
}): SolanaInstruction {
  return {
    programId: TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: params.sourceTokenAccount, isSigner: false, isWritable: true },
      { pubkey: params.mint, isSigner: false, isWritable: false },
      { pubkey: params.destinationTokenAccount, isSigner: false, isWritable: true },
      { pubkey: params.owner, isSigner: true, isWritable: false },
    ],
    data: buildSplTransferCheckedData(params.amount, params.decimals),
  }
}

async function accountExists(address: string): Promise<boolean> {
  const result = await rpcCall<{ value: unknown | null }>('getAccountInfo', [
    address,
    { encoding: 'base64', commitment: 'confirmed' },
  ])
  return result.value !== null
}

export async function sendSolanaTransfer(
  privateKeyHex: string,
  from: string,
  to: string,
  amountSol: string,
): Promise<{ txHash: string }> {
  if (!isValidSolanaAddress(from) || !isValidSolanaAddress(to)) {
    throw new Error('Invalid Solana address')
  }

  const lamports = parseSol(amountSol)
  const latest = await rpcCall<{ value: { blockhash: string } }>('getLatestBlockhash', [{ commitment: 'finalized' }])
  const message = buildTransferMessage({
    from,
    to,
    lamports,
    recentBlockhash: latest.value.blockhash,
  })
  const signature = ed25519.sign(message, normalizePrivateKey(privateKeyHex))
  const transaction = concatBytes(
    shortVecLength(1),
    signature,
    message,
  )
  const encodedTransaction = base58Encode(transaction)
  const txHash = await rpcCall<string>('sendTransaction', [
    encodedTransaction,
    { encoding: 'base58', skipPreflight: false, preflightCommitment: 'confirmed' },
  ])

  return { txHash }
}

export async function sendSplTokenTransfer(
  privateKeyHex: string,
  from: string,
  mintAddress: string,
  to: string,
  amount: string,
  decimals: number,
): Promise<{ txHash: string }> {
  if (!isValidSolanaAddress(from) || !isValidSolanaAddress(to) || !isValidSolanaAddress(mintAddress)) {
    throw new Error('Invalid Solana address')
  }

  const amountUnits = parseNetworkTokenAmount(amount, decimals)
  const sourceAccounts = await getSplTokenAccounts(from, mintAddress)
  const source = sourceAccounts.find((account) => account.amount >= amountUnits)
  if (!source) {
    throw new Error('Insufficient SPL token balance')
  }

  const destinationTokenAccount = getAssociatedTokenAddress(to, mintAddress)
  const instructions: SolanaInstruction[] = []
  if (!(await accountExists(destinationTokenAccount))) {
    instructions.push(buildCreateAssociatedTokenAccountInstruction({
      payer: from,
      owner: to,
      mint: mintAddress,
      associatedTokenAccount: destinationTokenAccount,
    }))
  }
  instructions.push(buildSplTransferCheckedInstruction({
    sourceTokenAccount: source.pubkey,
    mint: mintAddress,
    destinationTokenAccount,
    owner: from,
    amount: amountUnits,
    decimals,
  }))

  const latest = await rpcCall<{ value: { blockhash: string } }>('getLatestBlockhash', [{ commitment: 'finalized' }])
  const message = compileSolanaMessage({
    feePayer: from,
    recentBlockhash: latest.value.blockhash,
    instructions,
  })
  const signature = ed25519.sign(message, normalizePrivateKey(privateKeyHex))
  const transaction = concatBytes(
    shortVecLength(1),
    signature,
    message,
  )
  const txHash = await rpcCall<string>('sendTransaction', [
    base58Encode(transaction),
    { encoding: 'base58', skipPreflight: false, preflightCommitment: 'confirmed' },
  ])

  return { txHash }
}

export async function waitForSolanaTransaction(
  txHash: string,
): Promise<{ status: 'confirmed' | 'failed' | 'pending' }> {
  if (!SOL_TX_HASH_REGEX.test(txHash.trim())) {
    throw new Error('Invalid Solana transaction signature')
  }

  const result = await rpcCall<{
    value: Array<{ confirmationStatus?: string; err?: unknown } | null>
  }>('getSignatureStatuses', [[txHash], { searchTransactionHistory: true }])
  const status = result.value[0]
  if (!status) return { status: 'pending' }
  if (status.err) return { status: 'failed' }
  return { status: status.confirmationStatus === 'finalized' || status.confirmationStatus === 'confirmed' ? 'confirmed' : 'pending' }
}
