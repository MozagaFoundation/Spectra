/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

// Ethereum JSON-RPC helpers for balances and signed transfers.

import { secp256k1 } from '@noble/curves/secp256k1'
import { keccak_256 } from '@noble/hashes/sha3'
import { bytesToHex, hexToBytes } from '@/lib/utils'
import { rpcProxyCall } from '@/services/backend/rpcProxy'
import { assertCryptoNetworkAdmission } from './cryptoNetworkAdmission'

// Configuration

export const ETH_RPC_URL = ''
export const ETH_CHAIN_ID = BigInt(1)
const ETH_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/
const ETH_TX_HASH_REGEX = /^0x[0-9a-fA-F]{64}$/
const DECIMAL_AMOUNT_REGEX = /^(0|[1-9]\d*)(\.\d+)?$/
const ALLOWED_ETH_RPC_METHODS = new Set([
  'eth_getBalance',
  'eth_getTransactionCount',
  'eth_blockNumber',
  'eth_feeHistory',
  'eth_maxPriorityFeePerGas',
  'eth_getBlockByNumber',
  'eth_estimateGas',
  'eth_call',
  'eth_sendRawTransaction',
  'eth_getTransactionReceipt',
])
const DEFAULT_PRIORITY_FEE_WEI = 1_500_000_000n
const DEFAULT_BASE_FEE_WEI = 30_000_000_000n

export type EvmNetworkId = 'ethereum'

export interface EvmChainConfig {
  id: EvmNetworkId
  name: string
  nativeSymbol: string
  chainId: bigint
  rpcUrl: string
}

export interface EvmFeeData {
  maxFeePerGas: bigint
  maxPriorityFeePerGas: bigint
}

export interface EvmSendOptions {
  nonce?: bigint
}

export const EVM_CHAINS: Record<EvmNetworkId, EvmChainConfig> = {
  ethereum: {
    id: 'ethereum',
    name: 'Ethereum',
    nativeSymbol: 'ETH',
    chainId: ETH_CHAIN_ID,
    rpcUrl: ETH_RPC_URL,
  },
}

// ERC-20 token registry

export interface TokenInfo {
  address: string
  symbol: string
  name: string
  decimals: number
  logoColor: string
}

export const ETHEREUM_TOKENS: TokenInfo[] = [
  { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT',  name: 'Tether USD',    decimals: 6,  logoColor: '#26A17B' },
  { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC',  name: 'USD Coin',      decimals: 6,  logoColor: '#2775CA' },
  { address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', symbol: 'DAI',   name: 'Dai',           decimals: 18, logoColor: '#F5AC37' },
  { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', symbol: 'WETH',  name: 'Wrapped Ether', decimals: 18, logoColor: '#627EEA' },
  { address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', symbol: 'WBTC',  name: 'Wrapped BTC',   decimals: 8,  logoColor: '#F7931A' },
  { address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', symbol: 'UNI',   name: 'Uniswap',       decimals: 18, logoColor: '#FF007A' },
  { address: '0x514910771AF9Ca656af840dff83E8264EcF986CA', symbol: 'LINK',  name: 'Chainlink',     decimals: 18, logoColor: '#2A5ADA' },
]

// ERC-20 selectors
const BALANCE_OF_SELECTOR = '70a08231'
const TRANSFER_SELECTOR = 'a9059cbb'

// RPC utilities

function getEvmChainConfig(network: EvmNetworkId = 'ethereum'): EvmChainConfig {
  return EVM_CHAINS[network]
}

function normalizeEthAddress(address: string, fieldName: string): string {
  const trimmed = address.trim()
  if (!ETH_ADDRESS_REGEX.test(trimmed)) {
    throw new Error(`Invalid ${fieldName}`)
  }

  return trimmed
}

function normalizePrivateKey(privateKeyHex: string): string {
  const normalized = privateKeyHex.startsWith('0x') ? privateKeyHex.slice(2) : privateKeyHex
  if (!/^[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error('Invalid private key')
  }

  return normalized
}

async function rpcCall<T = any>(
  method: string,
  params: any[] = [],
  network: EvmNetworkId = 'ethereum',
): Promise<T> {
  if (!ALLOWED_ETH_RPC_METHODS.has(method)) {
    throw new Error('Unsupported Ethereum RPC method')
  }
  assertCryptoNetworkAdmission(network)

  try {
    return await rpcProxyCall<T>(network, method, params)
  } catch (error) {
    const chainName = getEvmChainConfig(network).name
    if (__DEV__) console.error(`${chainName} RPC error (${method}):`, error)
    throw new Error(method === 'eth_sendRawTransaction' ? `${chainName} transaction broadcast failed` : `${chainName} request failed`)
  }
}

// ETH balances and queries

export async function getEthBalance(address: string): Promise<string> {
  const hex: string = await rpcCall('eth_getBalance', [normalizeEthAddress(address, 'wallet address'), 'latest'])
  return formatEth(hex)
}

export async function getEvmNativeBalance(network: EvmNetworkId, address: string): Promise<string> {
  const hex: string = await rpcCall('eth_getBalance', [normalizeEthAddress(address, 'wallet address'), 'latest'], network)
  return formatEth(hex)
}

export async function getEthNonce(address: string): Promise<bigint> {
  const hex: string = await rpcCall('eth_getTransactionCount', [normalizeEthAddress(address, 'wallet address'), 'latest'])
  return BigInt(hex)
}

export async function getEvmNonce(network: EvmNetworkId, address: string): Promise<bigint> {
  const hex: string = await rpcCall('eth_getTransactionCount', [normalizeEthAddress(address, 'wallet address'), 'latest'], network)
  return BigInt(hex)
}

export async function getEthBlockNumber(): Promise<bigint> {
  const hex: string = await rpcCall('eth_blockNumber')
  return BigInt(hex)
}

export async function getGasPrice(): Promise<bigint> {
  return (await getEvmFeeData('ethereum')).maxFeePerGas
}

export async function getEvmGasPrice(network: EvmNetworkId): Promise<bigint> {
  return (await getEvmFeeData(network)).maxFeePerGas
}

export async function getEvmFeeData(network: EvmNetworkId = 'ethereum'): Promise<EvmFeeData> {
  try {
    const history = await rpcCall<{
      baseFeePerGas?: string[]
      reward?: string[][]
    }>('eth_feeHistory', ['0x5', 'pending', [50]], network)
    const baseFee = lastPositiveHexQuantity(history.baseFeePerGas) ?? DEFAULT_BASE_FEE_WEI
    const reward = lastPositiveHexQuantity(history.reward?.map((entry) => entry[0] || '0x0'))
    const maxPriorityFeePerGas = reward && reward > 0n ? reward : DEFAULT_PRIORITY_FEE_WEI
    return {
      maxPriorityFeePerGas,
      maxFeePerGas: (baseFee * 2n) + maxPriorityFeePerGas,
    }
  } catch {
    const [priorityFee, block] = await Promise.allSettled([
      rpcCall<string>('eth_maxPriorityFeePerGas', [], network),
      rpcCall<{ baseFeePerGas?: string }>('eth_getBlockByNumber', ['pending', false], network),
    ])
    const maxPriorityFeePerGas = priorityFee.status === 'fulfilled'
      ? parsePositiveHexQuantity(priorityFee.value) ?? DEFAULT_PRIORITY_FEE_WEI
      : DEFAULT_PRIORITY_FEE_WEI
    const baseFee = block.status === 'fulfilled'
      ? parsePositiveHexQuantity(block.value?.baseFeePerGas) ?? DEFAULT_BASE_FEE_WEI
      : DEFAULT_BASE_FEE_WEI
    return {
      maxPriorityFeePerGas,
      maxFeePerGas: (baseFee * 2n) + maxPriorityFeePerGas,
    }
  }
}

export async function estimateGas(tx: {
  from: string
  to: string
  value?: string
  data?: string
}): Promise<bigint> {
  const hex: string = await rpcCall('eth_estimateGas', [{
    ...tx,
    from: normalizeEthAddress(tx.from, 'sender address'),
    to: normalizeEthAddress(tx.to, 'recipient address'),
  }])
  return BigInt(hex)
}

export async function estimateEvmGas(network: EvmNetworkId, tx: {
  from: string
  to: string
  value?: string
  data?: string
}): Promise<bigint> {
  const hex: string = await rpcCall('eth_estimateGas', [{
    ...tx,
    from: normalizeEthAddress(tx.from, 'sender address'),
    to: normalizeEthAddress(tx.to, 'recipient address'),
  }], network)
  return BigInt(hex)
}

// ERC-20 token balances

export async function getTokenBalance(tokenAddress: string, walletAddress: string): Promise<string> {
  const paddedAddress = normalizeEthAddress(walletAddress, 'wallet address').toLowerCase().replace('0x', '').padStart(64, '0')
  const data = '0x' + BALANCE_OF_SELECTOR + paddedAddress

  const result: string = await rpcCall('eth_call', [
    { to: normalizeEthAddress(tokenAddress, 'token address'), data },
    'latest',
  ])

  return result
}

export interface TokenBalance {
  address: string
  symbol: string
  name: string
  decimals: number
  balance: string
  balanceRaw: string
  logoColor: string
}

export async function getAllTokenBalances(walletAddress: string): Promise<TokenBalance[]> {
  const normalizedWalletAddress = normalizeEthAddress(walletAddress, 'wallet address')
  const results = await Promise.allSettled(
    ETHEREUM_TOKENS.map(async (token) => {
      const rawHex = await getTokenBalance(token.address, normalizedWalletAddress)
      const rawBigInt = BigInt(rawHex)

      if (rawBigInt === 0n) return null

      return {
        address: token.address,
        symbol: token.symbol,
        name: token.name,
        decimals: token.decimals,
        balance: formatTokenAmount(rawBigInt, token.decimals),
        balanceRaw: rawHex,
        logoColor: token.logoColor,
      }
    })
  )

  return results
    .filter((r): r is PromiseFulfilledResult<TokenBalance | null> => r.status === 'fulfilled')
    .map(r => r.value)
    .filter((t): t is TokenBalance => t !== null)
}

// Transaction building and signing

/** Send an ETH transfer. */
export async function sendEthTransfer(
  privateKeyHex: string,
  from: string,
  to: string,
  amountEth: string,
  options: EvmSendOptions = {},
): Promise<{ txHash: string }> {
  const senderAddress = normalizeEthAddress(from, 'sender address')
  const recipientAddress = normalizeEthAddress(to, 'recipient address')
  const normalizedPrivateKey = normalizePrivateKey(privateKeyHex)
  const nonce = options.nonce ?? await getEthNonce(senderAddress)
  const feeData = await getEvmFeeData('ethereum')
  const gasLimit = BigInt(21000)
  const value = parseEth(amountEth)

  const rawTx = signEip1559Transaction(
    {
      nonce,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
      maxFeePerGas: feeData.maxFeePerGas,
      gasLimit,
      to: recipientAddress,
      value,
      data: new Uint8Array(0),
      chainId: ETH_CHAIN_ID,
    },
    normalizedPrivateKey,
  )

  const txHash: string = await rpcCall('eth_sendRawTransaction', ['0x' + bytesToHex(rawTx)])
  return { txHash }
}

export async function sendEvmNativeTransfer(
  network: EvmNetworkId,
  privateKeyHex: string,
  from: string,
  to: string,
  amount: string,
  options: EvmSendOptions = {},
): Promise<{ txHash: string }> {
  const config = getEvmChainConfig(network)
  const senderAddress = normalizeEthAddress(from, 'sender address')
  const recipientAddress = normalizeEthAddress(to, 'recipient address')
  const normalizedPrivateKey = normalizePrivateKey(privateKeyHex)
  const nonce = options.nonce ?? await getEvmNonce(network, senderAddress)
  const feeData = await getEvmFeeData(network)
  const gasLimit = BigInt(21000)
  const value = parseEth(amount)

  const rawTx = signEip1559Transaction(
    {
      nonce,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
      maxFeePerGas: feeData.maxFeePerGas,
      gasLimit,
      to: recipientAddress,
      value,
      data: new Uint8Array(0),
      chainId: config.chainId,
    },
    normalizedPrivateKey,
  )

  const txHash: string = await rpcCall('eth_sendRawTransaction', ['0x' + bytesToHex(rawTx)], network)
  return { txHash }
}

/** Send an ERC-20 token transfer. */
export async function sendERC20Transfer(
  privateKeyHex: string,
  from: string,
  tokenAddress: string,
  to: string,
  amount: string,
  decimals: number,
  options: EvmSendOptions = {},
): Promise<{ txHash: string }> {
  const senderAddress = normalizeEthAddress(from, 'sender address')
  const contractAddress = normalizeEthAddress(tokenAddress, 'token address')
  const recipientAddress = normalizeEthAddress(to, 'recipient address')
  const normalizedPrivateKey = normalizePrivateKey(privateKeyHex)
  const nonce = options.nonce ?? await getEthNonce(senderAddress)
  const feeData = await getEvmFeeData('ethereum')

  const parsedAmount = parseTokenAmount(amount, decimals)
  const calldata = buildERC20TransferData(recipientAddress, parsedAmount)

  const estimatedGas = await estimateGas({
    from: senderAddress,
    to: contractAddress,
    data: '0x' + bytesToHex(calldata),
  })
  const gasLimit = (estimatedGas * 120n) / 100n

  const rawTx = signEip1559Transaction(
    {
      nonce,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
      maxFeePerGas: feeData.maxFeePerGas,
      gasLimit,
      to: contractAddress,
      value: 0n,
      data: calldata,
      chainId: ETH_CHAIN_ID,
    },
    normalizedPrivateKey,
  )

  const txHash: string = await rpcCall('eth_sendRawTransaction', ['0x' + bytesToHex(rawTx)])
  return { txHash }
}

export function signEthereumPersonalMessage(privateKeyHex: string, message: string): string {
  const normalizedPrivateKey = normalizePrivateKey(privateKeyHex)
  const encoded = new TextEncoder().encode(message)
  const prefix = new TextEncoder().encode(`\x19Ethereum Signed Message:\n${encoded.length}`)
  const payload = new Uint8Array(prefix.length + encoded.length)
  payload.set(prefix, 0)
  payload.set(encoded, prefix.length)
  const digest = keccak_256(payload)
  const signature = secp256k1.sign(digest, normalizedPrivateKey)
  const recovery = signature.recovery ?? 0
  const r = signature.r.toString(16).padStart(64, '0')
  const s = signature.s.toString(16).padStart(64, '0')
  return `0x${r}${s}${(recovery + 27).toString(16).padStart(2, '0')}`
}

/** Build ERC-20 transfer calldata. */
function buildERC20TransferData(to: string, amount: bigint): Uint8Array {
  const toAddr = normalizeEthAddress(to, 'recipient address').toLowerCase().replace('0x', '').padStart(64, '0')
  const amountHex = amount.toString(16).padStart(64, '0')
  const hex = TRANSFER_SELECTOR + toAddr + amountHex
  return hexToBytes(hex)
}

// Transaction confirmation

export async function waitForEthTransaction(
  txHash: string,
  maxAttempts: number = 30,
  intervalMs: number = 3000,
): Promise<{ status: 'confirmed' | 'failed' | 'pending'; blockNumber?: string }> {
  if (!ETH_TX_HASH_REGEX.test(txHash.trim())) {
    throw new Error('Invalid transaction hash')
  }

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const receipt = await rpcCall<{
        status: string
        blockNumber: string
      } | null>('eth_getTransactionReceipt', [txHash])

      if (receipt) {
        return {
          status: receipt.status === '0x1' ? 'confirmed' : 'failed',
          blockNumber: receipt.blockNumber,
        }
      }
    } catch {
      // Receipt pending.
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }

  return { status: 'pending' }
}

export async function waitForEvmTransaction(
  network: EvmNetworkId,
  txHash: string,
  maxAttempts: number = 30,
  intervalMs: number = 3000,
): Promise<{ status: 'confirmed' | 'failed' | 'pending'; blockNumber?: string }> {
  if (!ETH_TX_HASH_REGEX.test(txHash.trim())) {
    throw new Error('Invalid transaction hash')
  }

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const receipt = await rpcCall<{
        status: string
        blockNumber: string
      } | null>('eth_getTransactionReceipt', [txHash], network)

      if (receipt) {
        return {
          status: receipt.status === '0x1' ? 'confirmed' : 'failed',
          blockNumber: receipt.blockNumber,
        }
      }
    } catch {
      // Receipt pending.
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }

  return { status: 'pending' }
}

// EIP-155 transaction signing

interface UnsignedTx {
  nonce: bigint
  gasPrice: bigint
  gasLimit: bigint
  to: string
  value: bigint
  data: Uint8Array
  chainId: bigint
}

interface UnsignedEip1559Tx {
  nonce: bigint
  maxPriorityFeePerGas: bigint
  maxFeePerGas: bigint
  gasLimit: bigint
  to: string
  value: bigint
  data: Uint8Array
  chainId: bigint
}

function signTransaction(tx: UnsignedTx, privateKeyHex: string): Uint8Array {
  const toBytes = hexToBytes(normalizeEthAddress(tx.to, 'recipient address').replace('0x', ''))

  // EIP-155 signs [nonce, gasPrice, gasLimit, to, value, data, chainId, 0, 0].
  const unsignedItems = [
    bigintToRlpBytes(tx.nonce),
    bigintToRlpBytes(tx.gasPrice),
    bigintToRlpBytes(tx.gasLimit),
    toBytes,
    bigintToRlpBytes(tx.value),
    tx.data,
    bigintToRlpBytes(tx.chainId),
    new Uint8Array(0),
    new Uint8Array(0),
  ]

  const unsignedEncoded = rlpEncode(unsignedItems)
  const msgHash = keccak_256(unsignedEncoded)

  const privKey = normalizePrivateKey(privateKeyHex)
  const sig = secp256k1.sign(msgHash, privKey)

  const v = sig.recovery + 35 + Number(tx.chainId) * 2

  const signedItems = [
    bigintToRlpBytes(tx.nonce),
    bigintToRlpBytes(tx.gasPrice),
    bigintToRlpBytes(tx.gasLimit),
    toBytes,
    bigintToRlpBytes(tx.value),
    tx.data,
    bigintToRlpBytes(BigInt(v)),
    bigintToMinBytes(sig.r),
    bigintToMinBytes(sig.s),
  ]

  return rlpEncode(signedItems)
}

function signEip1559Transaction(tx: UnsignedEip1559Tx, privateKeyHex: string): Uint8Array {
  const toBytes = hexToBytes(normalizeEthAddress(tx.to, 'recipient address').replace('0x', ''))
  const unsignedItems: RlpItem[] = [
    bigintToRlpBytes(tx.chainId),
    bigintToRlpBytes(tx.nonce),
    bigintToRlpBytes(tx.maxPriorityFeePerGas),
    bigintToRlpBytes(tx.maxFeePerGas),
    bigintToRlpBytes(tx.gasLimit),
    toBytes,
    bigintToRlpBytes(tx.value),
    tx.data,
    [],
  ]
  const unsignedPayload = rlpEncode(unsignedItems)
  const signingPayload = concatBytes(new Uint8Array([0x02]), unsignedPayload)
  const msgHash = keccak_256(signingPayload)
  const privKey = normalizePrivateKey(privateKeyHex)
  const sig = secp256k1.sign(msgHash, privKey)
  const signedItems: RlpItem[] = [
    ...unsignedItems,
    bigintToRlpBytes(BigInt(sig.recovery)),
    bigintToMinBytes(sig.r),
    bigintToMinBytes(sig.s),
  ]

  return concatBytes(new Uint8Array([0x02]), rlpEncode(signedItems))
}

// RLP encoding

type RlpItem = Uint8Array | RlpItem[]

function rlpEncode(item: RlpItem): Uint8Array {
  if (!Array.isArray(item)) return rlpEncodeBytes(item)

  const encoded = item.map(rlpEncode)
  const totalLength = encoded.reduce((sum, e) => sum + e.length, 0)

  let header: Uint8Array
  if (totalLength < 56) {
    header = new Uint8Array([0xc0 + totalLength])
  } else {
    const lengthBytes = bigintToMinBytes(BigInt(totalLength))
    header = new Uint8Array(1 + lengthBytes.length)
    header[0] = 0xf7 + lengthBytes.length
    header.set(lengthBytes, 1)
  }

  const result = new Uint8Array(header.length + totalLength)
  result.set(header, 0)
  let offset = header.length
  for (const enc of encoded) {
    result.set(enc, offset)
    offset += enc.length
  }
  return result
}

function rlpEncodeBytes(data: Uint8Array): Uint8Array {
  if (data.length === 1 && data[0] < 0x80) {
    return data
  }

  if (data.length === 0) {
    return new Uint8Array([0x80])
  }

  if (data.length < 56) {
    const result = new Uint8Array(1 + data.length)
    result[0] = 0x80 + data.length
    result.set(data, 1)
    return result
  }

  const lengthBytes = bigintToMinBytes(BigInt(data.length))
  const result = new Uint8Array(1 + lengthBytes.length + data.length)
  result[0] = 0xb7 + lengthBytes.length
  result.set(lengthBytes, 1)
  result.set(data, 1 + lengthBytes.length)
  return result
}

// Formatting and validation

export function formatEth(weiHex: string): string {
  const wei = BigInt(weiHex)
  const whole = wei / 10n ** 18n
  const fraction = wei % 10n ** 18n
  const fractionStr = fraction.toString().padStart(18, '0').slice(0, 6)
  const result = `${whole}.${fractionStr}`
  return trimTrailingZeros(result)
}

export function parseEth(ethString: string): bigint {
  const normalized = ethString.trim()
  if (!DECIMAL_AMOUNT_REGEX.test(normalized)) {
    throw new Error('Invalid ETH amount')
  }

  const parts = normalized.split('.')
  if ((parts[1] || '').length > 18) {
    throw new Error('ETH amount has too many decimal places')
  }

  const whole = BigInt(parts[0] || '0')
  const fractionStr = (parts[1] || '').padEnd(18, '0').slice(0, 18)
  const fraction = BigInt(fractionStr)
  const value = whole * 10n ** 18n + fraction
  if (value <= 0n) {
    throw new Error('ETH amount must be greater than zero')
  }

  return value
}

export function formatTokenAmount(raw: bigint, decimals: number): string {
  if (raw === 0n) return '0'
  const divisor = 10n ** BigInt(decimals)
  const whole = raw / divisor
  const fraction = raw % divisor
  if (fraction === 0n) return whole.toString()
  const fractionStr = fraction.toString().padStart(decimals, '0')
  const trimmed = fractionStr.replace(/0+$/, '')
  const display = trimmed.slice(0, 6)
  return `${whole}.${display}`
}

function parseTokenAmount(amountStr: string, decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new Error('Invalid token decimals')
  }

  const normalized = amountStr.trim()
  if (!DECIMAL_AMOUNT_REGEX.test(normalized)) {
    throw new Error('Invalid token amount')
  }

  const parts = normalized.split('.')
  if ((parts[1] || '').length > decimals) {
    throw new Error('Token amount has too many decimal places')
  }

  const whole = BigInt(parts[0] || '0')
  const fractionStr = (parts[1] || '').padEnd(decimals, '0').slice(0, decimals)
  const fraction = BigInt(fractionStr)
  const value = whole * 10n ** BigInt(decimals) + fraction
  if (value <= 0n) {
    throw new Error('Token amount must be greater than zero')
  }

  return value
}

export function isValidEthAddress(address: string): boolean {
  if (!address) return false
  return ETH_ADDRESS_REGEX.test(address.trim())
}

export function formatEthAddress(address: string, chars: number = 6): string {
  if (!address || address.length < chars * 2 + 2) return address
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`
}

// Internal helpers

function bigintToRlpBytes(value: bigint): Uint8Array {
  if (value === 0n) return new Uint8Array(0)
  return bigintToMinBytes(value)
}

function bigintToMinBytes(value: bigint): Uint8Array {
  if (value === 0n) return new Uint8Array(0)
  let hex = value.toString(16)
  if (hex.length % 2 !== 0) hex = '0' + hex
  return hexToBytes(hex)
}

function parsePositiveHexQuantity(value: string | null | undefined): bigint | null {
  if (!value || typeof value !== 'string') return null
  try {
    const parsed = BigInt(value)
    return parsed > 0n ? parsed : null
  } catch {
    return null
  }
}

function lastPositiveHexQuantity(values: string[] | null | undefined): bigint | null {
  if (!values?.length) return null
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const parsed = parsePositiveHexQuantity(values[index])
    if (parsed) return parsed
  }
  return null
}

function concatBytes(first: Uint8Array, second: Uint8Array): Uint8Array {
  const result = new Uint8Array(first.length + second.length)
  result.set(first, 0)
  result.set(second, first.length)
  return result
}

function trimTrailingZeros(s: string): string {
  if (!s.includes('.')) return s
  let trimmed = s.replace(/0+$/, '')
  if (trimmed.endsWith('.')) trimmed += '0'
  return trimmed
}
