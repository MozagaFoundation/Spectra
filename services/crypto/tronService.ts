/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { secp256k1 } from '@noble/curves/secp256k1'
import { sha256 } from '@noble/hashes/sha256'
import { base58CheckDecode } from '@/lib/baseEncoding'
import { formatBigIntAmount, parseDecimalToBigInt } from '@/lib/amounts'
import { bytesToHex, hexToBytes } from '@/lib/utils'
import { tronProxyCall } from '@/services/backend/rpcProxy'
import { assertCryptoNetworkAdmission } from './cryptoNetworkAdmission'
import {
  TRON_TOKENS,
  formatNetworkTokenAmount,
  parseNetworkTokenAmount,
  type NetworkTokenBalance,
} from './tokenRegistry'

const TRON_TX_HASH_REGEX = /^[0-9a-fA-F]{64}$/

function normalizePrivateKey(privateKeyHex: string): string {
  const normalized = privateKeyHex.startsWith('0x') ? privateKeyHex.slice(2) : privateKeyHex
  if (!/^[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error('Invalid Tron private key')
  }
  return normalized
}

function tronAddressToHex(address: string): string {
  const payload = base58CheckDecode(address.trim())
  if (payload.length !== 21 || payload[0] !== 0x41) {
    throw new Error('Invalid Tron address')
  }
  return bytesToHex(payload)
}

function decodeTronRpcMessage(message?: string): string | undefined {
  if (!message || !/^[0-9a-fA-F]+$/.test(message)) return undefined
  try {
    return new TextDecoder().decode(hexToBytes(message))
  } catch {
    return undefined
  }
}

function signTronTransaction<T extends { raw_data_hex?: string }>(tx: T, privateKeyHex: string): T & { signature: string[] } {
  if (!tx.raw_data_hex) {
    throw new Error('Failed to create Tron transaction')
  }

  const digest = sha256(hexToBytes(tx.raw_data_hex))
  const signature = secp256k1.sign(digest, normalizePrivateKey(privateKeyHex))
  const r = signature.r.toString(16).padStart(64, '0')
  const s = signature.s.toString(16).padStart(64, '0')
  const recovery = signature.recovery?.toString(16).padStart(2, '0') ?? '00'
  return {
    ...tx,
    signature: [`${r}${s}${recovery}`],
  }
}

async function tronPost<T>(path: string, body: unknown): Promise<T> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Invalid Tron RPC body')
  }
  assertCryptoNetworkAdmission('tron')
  return tronProxyCall<T>(path, body as Record<string, unknown>)
}

export function isValidTronAddress(address: string): boolean {
  try {
    tronAddressToHex(address)
    return true
  } catch {
    return false
  }
}

export function parseTrx(amount: string): bigint {
  const parsed = parseDecimalToBigInt(amount, 6)
  if (!parsed || parsed <= 0n) {
    throw new Error('Invalid TRX amount')
  }
  return parsed
}

export function formatTrx(sun: bigint | string): string {
  return formatBigIntAmount(sun, 6, 6, true)
}

function tronAddressHexToAbiParameter(addressHex: string): string {
  const normalized = addressHex.toLowerCase()
  if (!/^41[0-9a-f]{40}$/.test(normalized)) {
    throw new Error('Invalid Tron address')
  }
  return normalized.slice(2).padStart(64, '0')
}

function uint256ToAbiParameter(value: bigint): string {
  if (value < 0n) {
    throw new Error('Invalid token amount')
  }
  return value.toString(16).padStart(64, '0')
}

export function buildTrc20BalanceOfParameter(ownerAddress: string): string {
  return tronAddressHexToAbiParameter(tronAddressToHex(ownerAddress))
}

export function buildTrc20TransferParameter(toAddress: string, amount: bigint): string {
  return `${tronAddressHexToAbiParameter(tronAddressToHex(toAddress))}${uint256ToAbiParameter(amount)}`
}

export async function getTronBalance(address: string): Promise<string> {
  const addressHex = tronAddressToHex(address)
  const account = await tronPost<{ balance?: number }>('/wallet/getaccount', {
    address: addressHex,
    visible: false,
  })
  return formatTrx(BigInt(account.balance || 0))
}

export async function getTrc20TokenBalance(contractAddress: string, walletAddress: string): Promise<bigint> {
  const ownerAddress = tronAddressToHex(walletAddress)
  const contractAddressHex = tronAddressToHex(contractAddress)
  const response = await tronPost<{
    result?: { result?: boolean; code?: string; message?: string }
    constant_result?: string[]
  }>('/wallet/triggerconstantcontract', {
    owner_address: ownerAddress,
    contract_address: contractAddressHex,
    function_selector: 'balanceOf(address)',
    parameter: buildTrc20BalanceOfParameter(walletAddress),
    visible: false,
  })

  if (response.result && response.result.result === false) {
    throw new Error(decodeTronRpcMessage(response.result.message) || 'TRC-20 balance request failed')
  }

  const raw = response.constant_result?.[0]
  if (!raw) return 0n
  return BigInt(`0x${raw.replace(/^0x/i, '')}`)
}

export async function getAllTronTokenBalances(walletAddress: string): Promise<NetworkTokenBalance[]> {
  const results = await Promise.allSettled(
    TRON_TOKENS.map(async (token) => {
      if (!token.contractAddress) return null
      const rawBalance = await getTrc20TokenBalance(token.contractAddress, walletAddress)
      if (rawBalance === 0n) return null

      return {
        ...token,
        identifier: token.contractAddress,
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

export async function sendTronTransfer(
  privateKeyHex: string,
  from: string,
  to: string,
  amountTrx: string,
): Promise<{ txHash: string }> {
  const ownerAddress = tronAddressToHex(from)
  const toAddress = tronAddressToHex(to)
  const amount = parseTrx(amountTrx)
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('TRX amount is too large')
  }

  const tx = await tronPost<{
    txID?: string
    raw_data_hex?: string
    Error?: string
  }>('/wallet/createtransaction', {
    owner_address: ownerAddress,
    to_address: toAddress,
    amount: Number(amount),
    visible: false,
  })

  if (!tx.txID || !tx.raw_data_hex || tx.Error) {
    throw new Error('Failed to create Tron transaction')
  }

  const signedTx = signTronTransaction(tx, privateKeyHex)
  const result = await tronPost<{ result?: boolean; txid?: string; message?: string }>('/wallet/broadcasttransaction', signedTx)
  if (!result.result) {
    throw new Error('Tron transaction broadcast failed')
  }

  return { txHash: result.txid || tx.txID }
}

export async function sendTrc20Transfer(
  privateKeyHex: string,
  from: string,
  contractAddress: string,
  to: string,
  amount: string,
  decimals: number,
): Promise<{ txHash: string }> {
  const ownerAddress = tronAddressToHex(from)
  const contractAddressHex = tronAddressToHex(contractAddress)
  const parsedAmount = parseNetworkTokenAmount(amount, decimals)

  const trigger = await tronPost<{
    result?: { result?: boolean; code?: string; message?: string }
    transaction?: { txID?: string; raw_data_hex?: string; Error?: string }
  }>('/wallet/triggersmartcontract', {
    owner_address: ownerAddress,
    contract_address: contractAddressHex,
    function_selector: 'transfer(address,uint256)',
    parameter: buildTrc20TransferParameter(to, parsedAmount),
    fee_limit: 100_000_000,
    call_value: 0,
    visible: false,
  })

  if (trigger.result && trigger.result.result === false) {
    throw new Error(decodeTronRpcMessage(trigger.result.message) || 'TRC-20 transfer request failed')
  }
  if (!trigger.transaction?.txID || !trigger.transaction.raw_data_hex || trigger.transaction.Error) {
    throw new Error('Failed to create TRC-20 transaction')
  }

  const signedTx = signTronTransaction(trigger.transaction, privateKeyHex)
  const result = await tronPost<{ result?: boolean; txid?: string; message?: string }>('/wallet/broadcasttransaction', signedTx)
  if (!result.result) {
    throw new Error(decodeTronRpcMessage(result.message) || 'TRC-20 transaction broadcast failed')
  }

  return { txHash: result.txid || trigger.transaction.txID }
}

export async function waitForTronTransaction(txHash: string): Promise<{ status: 'confirmed' | 'failed' | 'pending' }> {
  if (!TRON_TX_HASH_REGEX.test(txHash.trim())) {
    throw new Error('Invalid Tron transaction hash')
  }

  try {
    const info = await tronPost<{ id?: string; receipt?: { result?: string } }>('/wallet/gettransactioninfobyid', {
      value: txHash,
      visible: false,
    })
    if (!info.id) return { status: 'pending' }
    if (info.receipt?.result && info.receipt.result !== 'SUCCESS') return { status: 'failed' }
    return { status: 'confirmed' }
  } catch {
    return { status: 'pending' }
  }
}
