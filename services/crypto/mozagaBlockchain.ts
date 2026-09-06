/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

// Direct Mozaga RPC calls with local ML-DSA transaction signing.

import { Dilithium, hexToBytes as dilithiumHexToBytes } from '@spectra/identity-vault'
import { translate } from '@/lib/i18n'
import { MOZAGA_RPC_URL } from '@/lib/constants'
import { parseDecimalToBigInt } from '@/lib/amounts'
import { torAwareFetch } from '@/services/tor/torFetch'
import { rpcProxyCall } from '@/services/backend/rpcProxy'
import {
  MOZAGA_KNOWN_ASSET_SYMBOLS,
  formatNetworkTokenAmount,
  type NetworkTokenBalance,
} from './tokenRegistry'
import { assertCryptoNetworkAdmission } from './cryptoNetworkAdmission'

// RPC configuration
const RPC_URL = MOZAGA_RPC_URL
export const MOZAGA_MAINNET_CHAIN_ID = 27_182_818n
const CHAIN_ID = MOZAGA_MAINNET_CHAIN_ID
const TX_ENCODING_VERSION_SPONSORED = 0x02
const ALLOWED_RPC_METHODS = new Set([
  'eth_getBalance',
  'eth_getTransactionCount',
  'eth_blockNumber',
  'eth_chainId',
  'eth_sendRawTransaction',
  'eth_getTransactionReceipt',
  'asset_getAssetInfo',
  'asset_balanceOf',
  'asset_getTotalAssets',
  'asset_getActiveAssets',
  'asset_getAssetAtIndex',
  'asset_getAssetsBySymbol',
  'identity_getAccountIdentity',
])

// Gas constants
export const MIN_GAS_EXO = BigInt(216_500) // ML-DSA-65 signing minimum
export const MIN_GAS_PRICE = BigInt(1_000_000_000) // 1 Gwei
const GAS_PER_ZERO_BYTE = BigInt(4)
const GAS_PER_NON_ZERO_BYTE = BigInt(16)

// Asset state address
const ASSET_STATE_ADDR = '0xA555555555555555555555555555555555555555'
const ASSET_RPC_CONCURRENCY = 4

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return []

  const results = new Array<R>(items.length)
  let nextIndex = 0
  const workerCount = Math.min(concurrency, items.length)

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex
      nextIndex += 1
      results[currentIndex] = await mapper(items[currentIndex])
    }
  }))

  return results
}

function calculateGasWithData(data: Uint8Array, baseGas: bigint = MIN_GAS_EXO): bigint {
  let gas = baseGas
  for (const byte of data) {
    gas += byte === 0 ? GAS_PER_ZERO_BYTE : GAS_PER_NON_ZERO_BYTE
  }
  return gas
}

// ML-DSA-65 signer (legacy module name)
let dilithiumInstance: Dilithium | null = null

async function getDilithium(): Promise<Dilithium> {
  if (!dilithiumInstance) {
    dilithiumInstance = await Dilithium.init()
  }
  return dilithiumInstance
}

// RPC utilities

interface RPCResponse<T = any> {
  jsonrpc: string
  result?: T
  error?: {
    code: number
    message: string
  }
  id: number
}

/** Make a JSON-RPC call to the Mozaga node. */
async function rpcCall<T = any>(
  method: string,
  params: any[] = [],
  options?: { suppressErrors?: boolean },
  networkId: 'mozaga' = 'mozaga',
): Promise<T> {
  if (!ALLOWED_RPC_METHODS.has(method)) {
    throw new Error('Unsupported blockchain RPC method')
  }
  assertCryptoNetworkAdmission(networkId)

  try {
    try {
      return await rpcProxyCall<T>('mozaga', method, params)
    } catch (proxyError) {
      if (!RPC_URL) throw proxyError
    }

    const response = await torAwareFetch(RPC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method,
        params,
        id: Date.now()
      })
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    
    const data: RPCResponse<T> = await response.json()
    
    if (data.error) {
      if (__DEV__ && !options?.suppressErrors) console.error(`RPC error (${method}):`, data.error)
      throw new Error(method === 'eth_sendRawTransaction' ? 'Transaction broadcast failed' : 'Blockchain request failed')
    }
    
    return data.result as T
  } catch (error) {
    if (__DEV__ && !options?.suppressErrors) console.error(`RPC call failed: ${method}`, error)
    throw error instanceof Error ? error : new Error('Blockchain request failed')
  }
}

// Address utilities

/** Convert EXO address to 0x format for RPC calls. */
export function exoToEthAddress(address: string): string {
  if (address.startsWith('0x')) return address
  
  // Strip EXO/EXI prefix.
  if (address.startsWith('EXO') || address.startsWith('exo') ||
      address.startsWith('EXI') || address.startsWith('exi')) {
    return '0x' + address.slice(3)
  }
  
  return '0x' + address
}

/** Convert 0x address to EXO format. */
export function ethToExoAddress(address: string, type: 'EXO' | 'EXI' = 'EXO'): string {
  if (address.startsWith('EXO') || address.startsWith('EXI')) return address
  
  const cleanAddr = address.startsWith('0x') ? address.slice(2) : address
  return type + cleanAddr
}

/** Validate EXO address format. */
export function isValidExoAddress(address: string): boolean {
  if (!address) return false
  
  const hasValidPrefix = address.startsWith('EXO') || address.startsWith('EXI') ||
                         address.startsWith('exo') || address.startsWith('exi')
  
  if (!hasValidPrefix) return false
  
  if (address.length !== 43) return false
  
  // Type byte: 00 for EXO, 01 for EXI.
  const typeByte = address.slice(3, 5)
  if (typeByte !== '00' && typeByte !== '01') return false
  
  const hexPart = address.slice(5)
  return /^[0-9a-fA-F]{38}$/.test(hexPart)
}

// Blockchain queries

/** Get formatted EXO balance for an address. */
export async function getBalance(address: string): Promise<string> {
  try {
    const ethAddress = exoToEthAddress(address)
    const balanceHex = await rpcCall<string>('eth_getBalance', [ethAddress, 'latest'])
    
    // Use BigInt to preserve large balances.
    const balanceWei = BigInt(balanceHex)

    const divisor = BigInt(10 ** 18)
    const wholePart = balanceWei / divisor
    const fractionWei = balanceWei % divisor
    // Show up to 4 decimal places.
    const fractionStr = fractionWei.toString().padStart(18, '0').slice(0, 4)
    
    return `${wholePart}.${fractionStr}`
  } catch (error) {
    if (__DEV__) console.error('Error fetching balance:', error)
    return '0.0000'
  }
}

/** Get transaction count for an address. */
export async function getNonce(
  address: string,
  networkId: 'mozaga' = 'mozaga',
): Promise<bigint> {
  const ethAddress = exoToEthAddress(address)
  const nonceHex = await rpcCall<string>(
    'eth_getTransactionCount',
    [ethAddress, 'latest'],
    undefined,
    networkId,
  )
  return BigInt(nonceHex)
}

/** Get current block number. */
export async function getBlockNumber(networkId: 'mozaga' = 'mozaga'): Promise<number> {
  try {
    const blockHex = await rpcCall<string>('eth_blockNumber', [], undefined, networkId)
    return parseInt(blockHex, 16)
  } catch (error) {
    console.error('Error fetching block number:', error)
    return 0
  }
}

/** Get chain ID. */
export async function getChainId(networkId: 'mozaga' = 'mozaga'): Promise<bigint> {
  const chainIdHex = await rpcCall<string>('eth_chainId', [], undefined, networkId)
  return BigInt(chainIdHex)
}

// Keccak-256

function keccak256(data: Uint8Array): Uint8Array {
  const RC = [
    0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
    0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
    0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
    0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
    0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
    0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n
  ]
  
  const ROTC = [
    [0, 36, 3, 41, 18], [1, 44, 10, 45, 2], [62, 6, 43, 15, 61],
    [28, 55, 25, 21, 56], [27, 20, 39, 8, 14]
  ]
  
  const rate = 136
  const paddedLen = Math.ceil((data.length + 1) / rate) * rate
  const padded = new Uint8Array(paddedLen)
  padded.set(data)
  padded[data.length] = 0x01
  padded[paddedLen - 1] |= 0x80
  
  const state: bigint[][] = Array(5).fill(null).map(() => Array(5).fill(0n))
  
  for (let blockStart = 0; blockStart < paddedLen; blockStart += rate) {
    for (let i = 0; i < rate && blockStart + i < paddedLen; i += 8) {
      const x = Math.floor(i / 8) % 5
      const y = Math.floor(Math.floor(i / 8) / 5)
      if (y < 5) {
        let val = 0n
        for (let j = 0; j < 8 && blockStart + i + j < paddedLen; j++) {
          val |= BigInt(padded[blockStart + i + j]) << BigInt(j * 8)
        }
        state[x][y] ^= val
      }
    }
    
    for (let round = 0; round < 24; round++) {
      const C: bigint[] = Array(5).fill(0n)
      for (let x = 0; x < 5; x++) {
        C[x] = state[x][0] ^ state[x][1] ^ state[x][2] ^ state[x][3] ^ state[x][4]
      }
      
      const D: bigint[] = Array(5).fill(0n)
      for (let x = 0; x < 5; x++) {
        const rot1 = ((C[(x + 1) % 5] << 1n) | (C[(x + 1) % 5] >> 63n)) & ((1n << 64n) - 1n)
        D[x] = C[(x + 4) % 5] ^ rot1
      }
      
      for (let x = 0; x < 5; x++) {
        for (let y = 0; y < 5; y++) {
          state[x][y] ^= D[x]
        }
      }
      
      const B: bigint[][] = Array(5).fill(null).map(() => Array(5).fill(0n))
      for (let x = 0; x < 5; x++) {
        for (let y = 0; y < 5; y++) {
          const rot = ROTC[x][y]
          const val = state[x][y]
          const rotated = rot === 0 ? val : ((val << BigInt(rot)) | (val >> BigInt(64 - rot))) & ((1n << 64n) - 1n)
          B[y][(2 * x + 3 * y) % 5] = rotated
        }
      }
      
      for (let x = 0; x < 5; x++) {
        for (let y = 0; y < 5; y++) {
          state[x][y] = B[x][y] ^ ((~B[(x + 1) % 5][y]) & B[(x + 2) % 5][y])
        }
      }
      
      state[0][0] ^= RC[round]
    }
  }
  
  const output = new Uint8Array(32)
  let outIdx = 0
  for (let y = 0; y < 5 && outIdx < 32; y++) {
    for (let x = 0; x < 5 && outIdx < 32; x++) {
      const val = state[x][y]
      for (let j = 0; j < 8 && outIdx < 32; j++) {
        output[outIdx++] = Number((val >> BigInt(j * 8)) & 0xFFn)
      }
    }
  }
  
  return output
}

// Transaction types

export interface EXOTransaction {
  nonce: bigint
  gasPrice: bigint
  gas: bigint
  to: string | null
  value: bigint
  data: Uint8Array
  chainId: bigint
}

export interface SignedEXOTransaction {
  transaction: EXOTransaction
  signatureType: number // ML-DSA-65
  signature: Uint8Array
  publicKey: Uint8Array
  from: string
  hash: string
}

// Transaction encoding

/** Convert BigInt to big-endian bytes. */
function bigIntToBytes(value: bigint): Uint8Array {
  if (value === 0n) return new Uint8Array([0])
  
  const hex = value.toString(16)
  const paddedHex = hex.length % 2 === 0 ? hex : '0' + hex
  const bytes = new Uint8Array(paddedHex.length / 2)
  for (let i = 0; i < paddedHex.length; i += 2) {
    bytes[i / 2] = parseInt(paddedHex.substring(i, i + 2), 16)
  }
  return bytes
}

/** Normalize address to 20 bytes. */
function normalizeAddress(address: string): Uint8Array {
  let hexAddr = address
  
  // Strip EXO/EXI/0x prefix.
  if (hexAddr.startsWith('EXO') || hexAddr.startsWith('exo') || 
      hexAddr.startsWith('EXI') || hexAddr.startsWith('exi')) {
    hexAddr = '0x' + hexAddr.slice(3)
  } else if (!hexAddr.startsWith('0x')) {
    hexAddr = '0x' + hexAddr
  }
  
  const cleanHex = hexAddr.slice(2)
  const bytes = new Uint8Array(cleanHex.length / 2)
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16)
  }
  
  // Skip optional type byte.
  if (bytes.length === 21 && (bytes[0] === 0x00 || bytes[0] === 0x01)) {
    return bytes.slice(1)
  }
  
  if (bytes.length > 20) {
    return bytes.slice(-20)
  }
  
  const result = new Uint8Array(20)
  result.set(bytes, 20 - bytes.length)
  return result
}

/** Encode a Mozaga V2 transaction. */
function encodeTransaction(tx: EXOTransaction): Uint8Array {
  const buffers: Uint8Array[] = []

  // Version: 0x02 with optional sponsor.
  buffers.push(new Uint8Array([TX_ENCODING_VERSION_SPONSORED]))
  
  // Nonce: 8 bytes.
  const nonceBuffer = new Uint8Array(8)
  const nonceView = new DataView(nonceBuffer.buffer)
  nonceView.setBigUint64(0, tx.nonce, false)
  buffers.push(nonceBuffer)
  
  // Gas price: 32 bytes.
  const gasPriceBytes = bigIntToBytes(tx.gasPrice)
  const gasPriceBuffer = new Uint8Array(32)
  gasPriceBuffer.set(gasPriceBytes, 32 - gasPriceBytes.length)
  buffers.push(gasPriceBuffer)
  
  // Gas: 8 bytes.
  const gasBuffer = new Uint8Array(8)
  const gasView = new DataView(gasBuffer.buffer)
  gasView.setBigUint64(0, tx.gas, false)
  buffers.push(gasBuffer)
  
  // Recipient: 20 bytes.
  const toBuffer = new Uint8Array(20)
  if (tx.to) {
    const toBytes = normalizeAddress(tx.to)
    toBuffer.set(toBytes)
  }
  buffers.push(toBuffer)
  
  // Value: 32 bytes.
  const valueBytes = bigIntToBytes(tx.value)
  const valueBuffer = new Uint8Array(32)
  valueBuffer.set(valueBytes, 32 - valueBytes.length)
  buffers.push(valueBuffer)

  // Sponsor flag: 0x00.
  buffers.push(new Uint8Array([0x00]))
  
  // Data length: 4 bytes.
  const dataLenBuffer = new Uint8Array(4)
  const dataLenView = new DataView(dataLenBuffer.buffer)
  dataLenView.setUint32(0, tx.data.length, false)
  buffers.push(dataLenBuffer)
  
  // Data payload.
  if (tx.data.length > 0) {
    buffers.push(tx.data)
  }
  
  // Chain ID: 32 bytes.
  const chainIdBytes = bigIntToBytes(tx.chainId)
  const chainIdBuffer = new Uint8Array(32)
  chainIdBuffer.set(chainIdBytes, 32 - chainIdBytes.length)
  buffers.push(chainIdBuffer)
  
  const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const buf of buffers) {
    result.set(buf, offset)
    offset += buf.length
  }
  
  return result
}

/** Encode a signed transaction for eth_sendRawTransaction. */
function encodeSignedTransaction(signedTx: SignedEXOTransaction): string {
  const txBytes = encodeTransaction(signedTx.transaction)
  
  // Layout: transaction, signature type, public key, signature.
  const pubKeyLen = signedTx.publicKey.length
  const sigLen = signedTx.signature.length
  const totalLength = txBytes.length + 1 + 4 + pubKeyLen + 4 + sigLen
  
  const result = new Uint8Array(totalLength)
  let offset = 0
  
  result.set(txBytes, offset)
  offset += txBytes.length
  
  // Signature type: ML-DSA-65.
  result.set([0x00], offset)
  offset += 1
  
  // Public key length: 4 bytes.
  const pubKeyLenBytes = new Uint8Array(4)
  new DataView(pubKeyLenBytes.buffer).setUint32(0, pubKeyLen, false)
  result.set(pubKeyLenBytes, offset)
  offset += 4
  
  result.set(signedTx.publicKey, offset)
  offset += pubKeyLen
  
  // Signature length: 4 bytes.
  const sigLenBytes = new Uint8Array(4)
  new DataView(sigLenBytes.buffer).setUint32(0, sigLen, false)
  result.set(sigLenBytes, offset)
  offset += 4
  
  result.set(signedTx.signature, offset)
  
  return '0x' + Array.from(result).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Transaction signing and sending

/** Sign a transaction locally with ML-DSA-65. */
async function signTransactionDilithium(
  tx: EXOTransaction,
  privateKeyHex: string,
  publicKeyHex: string,
  fromAddress: string
): Promise<SignedEXOTransaction> {
  const dilithium = await getDilithium()

  const encoded = encodeTransaction(tx)
  const hash = keccak256(encoded)
  const hashHex = '0x' + Array.from(hash).map(b => b.toString(16).padStart(2, '0')).join('')

  const privateKey = dilithiumHexToBytes(privateKeyHex)
  const publicKey = dilithiumHexToBytes(publicKeyHex)

  const signature = dilithium.sign(hash, privateKey)
  
  return {
    transaction: tx,
    signatureType: 0x00, // ML-DSA-65
    signature,
    publicKey,
    from: fromAddress,
    hash: hashHex
  }
}

/** Parse EXO amount to wei. */
export function parseEXO(value: string): bigint {
  const parsed = parseDecimalToBigInt(value, 18)
  if (!parsed || parsed <= 0n) {
    throw new Error('Invalid EXO amount')
  }

  return parsed
}

/** Format wei as EXO. */
export function formatEXO(wei: bigint): string {
  const weiStr = wei.toString().padStart(19, '0')
  const intPart = weiStr.slice(0, -18) || '0'
  const decPart = weiStr.slice(-18)
  
  let trimmedDec = decPart.replace(/0+$/, '')
  if (trimmedDec.length === 0) {
    return intPart
  }
  
  // Show up to 4 decimal places.
  trimmedDec = trimmedDec.slice(0, 4)
  
  return `${intPart}.${trimmedDec}`
}

/** Send an EXO transfer with local signing. */
export async function sendEXOTransfer(
  privateKey: string,
  publicKey: string,
  fromAddress: string,
  toAddress: string,
  amount: string // EXO units
): Promise<{ txHash: string; from: string }> {
  try {
    if (!isValidExoAddress(toAddress)) {
      throw new Error('Invalid recipient address')
    }
    
    const nonce = await getNonce(fromAddress)

    const chainId = await getChainId()
    if (chainId !== CHAIN_ID) {
      throw new Error('Unexpected blockchain network')
    }
    
    const tx: EXOTransaction = {
      nonce,
      gasPrice: MIN_GAS_PRICE,
      gas: MIN_GAS_EXO,
      to: toAddress,
      value: parseEXO(amount),
      data: new Uint8Array(0),
      chainId
    }
    
    // Private key stays on device.
    const signed = await signTransactionDilithium(tx, privateKey, publicKey, fromAddress)

    const encodedTx = encodeSignedTransaction(signed)

    const txHash = await rpcCall<string>('eth_sendRawTransaction', [encodedTx])
    
    return {
      txHash,
      from: fromAddress
    }
  } catch (error) {
    console.error('Error sending EXO transfer:', error)
    throw error
  }
}

/** Wait for transaction confirmation. */
export async function waitForTransaction(
  txHash: string,
  maxAttempts: number = 30,
  intervalMs: number = 2000
): Promise<{ status: 'confirmed' | 'pending' | 'failed'; blockNumber?: number }> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const receipt = await rpcCall<any>('eth_getTransactionReceipt', [txHash])
      
      if (receipt) {
        const status = receipt.status === '0x1' ? 'confirmed' : 'failed'
        const blockNumber = receipt.blockNumber ? parseInt(receipt.blockNumber, 16) : undefined
        return { status, blockNumber }
      }
      
      await new Promise(resolve => setTimeout(resolve, intervalMs))
    } catch (error) {
      console.error('Error checking transaction status:', error)
    }
  }
  
  return { status: 'pending' }
}

// Native assets

export interface AssetInfo {
  tokenId: string
  name: string
  symbol: string
  decimals: number
  assetClass: number // Utility, equity, or debt.
  supplyModel: number
  totalSupply: string
  issuer: string
  createdAt: number
}

export interface UserAsset extends AssetInfo {
  balance: string
  balanceFormatted: string
}

/** Get asset info by token ID. */
export async function getAssetInfo(tokenId: string): Promise<AssetInfo | null> {
  try {
    const result = await rpcCall<any>('asset_getAssetInfo', [tokenId])
    if (!result) return null
    
    return {
      tokenId: result.tokenId || tokenId,
      name: result.name || '',
      symbol: result.symbol || '',
      decimals: result.decimals || 18,
      assetClass: result.assetClass || 0,
      supplyModel: result.supplyModel || 0,
      totalSupply: result.totalSupply || '0',
      issuer: result.issuer || '',
      createdAt: result.createdAt || 0,
    }
  } catch (error) {
    console.error('Error fetching asset info:', error)
    return null
  }
}

/** Get asset balance for an address. */
export async function getAssetBalance(tokenId: string, address: string): Promise<string> {
  try {
    const result = await rpcCall<string>('asset_balanceOf', [tokenId, address])
    return result || '0x0'
  } catch (error) {
    console.error('Error fetching asset balance:', error)
    return '0x0'
  }
}

/** Get total created assets. */
export async function getTotalAssets(): Promise<number> {
  try {
    const result = await rpcCall<number>('asset_getTotalAssets', [])
    return result || 0
  } catch (error) {
    console.error('Error fetching total assets:', error)
    return 0
  }
}

/** Get active asset count. */
export async function getActiveAssets(): Promise<number> {
  try {
    const result = await rpcCall<number>('asset_getActiveAssets', [])
    return result || 0
  } catch (error) {
    console.error('Error fetching active assets:', error)
    return 0
  }
}

/** Get token ID at an active asset index. */
export async function getAssetAtIndex(index: number): Promise<string | null> {
  try {
    const result = await rpcCall<string>('asset_getAssetAtIndex', [index])
    return result || null
  } catch (error) {
    console.error(`Error fetching asset at index ${index}:`, error)
    return null
  }
}

/** Resolve a native asset token ID by symbol. */
export async function getAssetBySymbol(symbol: string): Promise<string | null> {
  const normalized = symbol.trim().toUpperCase()
  if (!normalized) return null

  try {
    const result = await rpcCall<string>('asset_getAssetsBySymbol', [normalized], { suppressErrors: true })
    return result || null
  } catch {
    return null
  }
}

/** Format an asset amount. */
export function formatAssetAmount(amount: string, decimals: number = 18): string {
  try {
    const wei = BigInt(amount)
    const divisor = 10n ** BigInt(decimals)
    const whole = wei / divisor
    const fraction = wei % divisor
    
    if (fraction === 0n) {
      return whole.toString()
    }
    
    const fractionStr = fraction.toString().padStart(decimals, '0')
    const trimmedFraction = fractionStr.replace(/0+$/, '').slice(0, 4)
    
    return trimmedFraction ? `${whole}.${trimmedFraction}` : whole.toString()
  } catch {
    return '0'
  }
}

/** Parse an asset amount to base units. */
export function parseAssetAmount(value: string, decimals: number = 18): string {
  const parsed = parseDecimalToBigInt(value, decimals)
  if (!parsed || parsed <= 0n) {
    throw new Error('Invalid asset amount')
  }

  return '0x' + parsed.toString(16)
}

/** Get all assets owned by an address. */
export async function getUserAssets(address: string): Promise<UserAsset[]> {
  try {
    const activeCount = await getActiveAssets()
    const assetIndexes = Array.from({ length: activeCount }, (_, index) => index)

    const assets = await mapWithConcurrency(assetIndexes, ASSET_RPC_CONCURRENCY, async (index): Promise<UserAsset | null> => {
      const tokenId = await getAssetAtIndex(index)
      if (!tokenId) return null

      const balance = await getAssetBalance(tokenId, address)

      if (BigInt(balance) > 0) {
        const assetInfo = await getAssetInfo(tokenId)
        if (assetInfo) {
          return {
            ...assetInfo,
            balance,
            balanceFormatted: formatAssetAmount(balance, assetInfo.decimals),
          }
        }
      }

      return null
    })
    
    return assets.filter((asset): asset is UserAsset => asset !== null)
  } catch (error) {
    console.error('Error fetching user assets:', error)
    return []
  }
}

/** Get balances for known native asset symbols. */
export async function getKnownAssetBalances(
  address: string,
  symbols: string[] = MOZAGA_KNOWN_ASSET_SYMBOLS,
): Promise<NetworkTokenBalance[]> {
  const results = await Promise.allSettled(
    symbols.map(async (symbol) => {
      const tokenId = await getAssetBySymbol(symbol)
      if (!tokenId) return null

      const balance = await getAssetBalance(tokenId, address)
      const rawBalance = BigInt(balance)
      if (rawBalance === 0n) return null

      const assetInfo = await getAssetInfo(tokenId)
      if (!assetInfo) return null

      const knownBalance: NetworkTokenBalance = {
        network: 'mozaga' as const,
        standard: 'mozaga-asset' as const,
        identifier: tokenId,
        tokenId,
        symbol: assetInfo.symbol,
        name: assetInfo.name,
        decimals: assetInfo.decimals,
        logoColor: '#26A17B',
        assetSymbol: assetInfo.symbol,
        balance: formatNetworkTokenAmount(rawBalance, assetInfo.decimals),
        balanceRaw: rawBalance.toString(),
      }
      return knownBalance
    }),
  )

  return results
    .filter((result): result is PromiseFulfilledResult<NetworkTokenBalance | null> => result.status === 'fulfilled')
    .map((result) => result.value)
    .filter((token): token is NetworkTokenBalance => token !== null)
}

/** Get asset class name. */
export function getAssetClassName(assetClass: number): string {
  switch (assetClass) {
    case 0: return translate('Utility', { ns: 'crypto' })
    case 1: return translate('Equity', { ns: 'crypto' })
    case 2: return translate('Debt', { ns: 'crypto' })
    default: return translate('Unknown')
  }
}

/** Transfer a native asset. */
export async function transferAsset(
  privateKey: string,
  publicKey: string,
  fromAddress: string,
  toAddress: string,
  tokenId: string,
  amount: string, // Human-readable units.
  decimals: number = 18,
): Promise<{ txHash: string; from: string }> {
  try {
    if (!isValidExoAddress(toAddress)) {
      throw new Error('Invalid recipient address')
    }

    const amountHex = parseAssetAmount(amount, decimals)
    
    const nonce = await getNonce(fromAddress)

    const chainId = await getChainId()
    if (chainId !== CHAIN_ID) {
      throw new Error('Unexpected blockchain network')
    }
    
    // Asset transfer payload: { tokenId, recipient, amount }.
    const payload = JSON.stringify({
      tokenId,
      recipient: toAddress,
      amount: amountHex
    })
    const dataBytes = new TextEncoder().encode(payload)
    
    // Prefix with transfer marker.
    const data = new Uint8Array(1 + dataBytes.length)
    data[0] = 0xD6
    data.set(dataBytes, 1)
    
    const tx: EXOTransaction = {
      nonce,
      gasPrice: MIN_GAS_PRICE,
      gas: calculateGasWithData(data),
      to: ASSET_STATE_ADDR,
      value: BigInt(0),
      data,
      chainId
    }
    
    // Private key stays on device.
    const signed = await signTransactionDilithium(tx, privateKey, publicKey, fromAddress)

    const encodedTx = encodeSignedTransaction(signed)

    const txHash = await rpcCall<string>('eth_sendRawTransaction', [encodedTx])
    
    return {
      txHash,
      from: fromAddress
    }
  } catch (error) {
    console.error('Error transferring asset:', error)
    throw error
  }
}

// Identity

export interface AccountIdentity {
  name: string
  pseudonym: string
  id: string
  idType: string
  category: string
  recoveryAddr: string
  createdAt: number
  isRegistered: boolean
}

/** Get on-chain account identity for an address. */
export async function getAccountIdentity(address: string): Promise<AccountIdentity | null> {
  try {
    const result = await rpcCall<AccountIdentity>(
      'identity_getAccountIdentity',
      [address, 'latest'],
      { suppressErrors: true }
    )
    return result || null
  } catch (error) {
    // Missing identity is non-fatal.
    return null
  }
}

export { RPC_URL, CHAIN_ID }
