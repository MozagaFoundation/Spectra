/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { Dilithium, hexToBytes as dilithiumHexToBytes } from '@spectra/identity-vault'
import {
  getNonce,
  getChainId,
  MIN_GAS_EXO,
  MIN_GAS_PRICE,
  RPC_URL,
} from './mozagaBlockchain'
import { torAwareFetch } from '@/services/tor/torFetch'
import { rpcProxyCall } from '@/services/backend/rpcProxy'
import { keccak256 } from './encoding'
import type { SpectreCryptoNetworkId } from '@/lib/spectrePolicy'
import { assertCryptoNetworkAdmission } from './cryptoNetworkAdmission'

export {
  concatBytes,
  isNativeAssetId,
  keccak256,
  writeAddress,
  writeBigInt,
  writeBool,
  writeBytes32,
  writeEntityId,
  writeString,
  writeUint8,
  writeUint16,
  writeUint64,
} from './encoding'

// Constants

const GAS_PER_ZERO_BYTE = BigInt(4)
const GAS_PER_NON_ZERO_BYTE = BigInt(16)
const TX_ENCODING_VERSION_SPONSORED = 0x02

// Types

export interface SignAndSendParams {
  privateKeyHex: string
  publicKeyHex: string
  fromAddress: string
  toAddress: string
  txData: Uint8Array
  value?: bigint
  gas?: bigint
  networkId?: 'mozaga'
}

export interface TransactionFields {
  nonce: bigint
  gasPrice: bigint
  gas: bigint
  to: string
  value: bigint
  data: Uint8Array
  chainId: bigint
}

export interface SignedTransactionFields {
  transaction: TransactionFields
  signatureType: number // ML-DSA-65
  signature: Uint8Array
  publicKey: Uint8Array
  from: string
  hash: string
}

// RPC

interface RPCResponse<T = any> {
  jsonrpc: string
  result?: T
  error?: { code: number; message: string }
  id: number
}

export async function rpcCall<T = any>(
  method: string,
  params: any[] = [],
  networkId: SpectreCryptoNetworkId = 'mozaga',
): Promise<T> {
  assertCryptoNetworkAdmission(networkId)

  try {
    return await rpcProxyCall<T>('mozaga', method, params)
  } catch (proxyError) {
    if (!RPC_URL) throw proxyError
  }

  const response = await torAwareFetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: Date.now() }),
  })

  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`)

  const data: RPCResponse<T> = await response.json()
  if (data.error) {
    if (__DEV__) console.error(`RPC error (${method}):`, data.error)
    throw new Error(data.error.message || 'RPC call failed')
  }
  return data.result as T
}

// Gas calculation

export function calculateGas(txData: Uint8Array): bigint {
  let dataGas = BigInt(0)
  for (const byte of txData) {
    dataGas += byte === 0 ? GAS_PER_ZERO_BYTE : GAS_PER_NON_ZERO_BYTE
  }
  return MIN_GAS_EXO + dataGas
}

// Transaction encoding

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

function normalizeAddress(address: string): Uint8Array {
  let hexAddr = address
  if (hexAddr.startsWith('EXO') || hexAddr.startsWith('exo') ||
      hexAddr.startsWith('EXI') || hexAddr.startsWith('exi')) {
    hexAddr = '0x' + hexAddr.slice(3)
  } else if (!hexAddr.startsWith('0x') && !hexAddr.startsWith('0X')) {
    hexAddr = '0x' + hexAddr
  }
  const cleanHex = hexAddr.slice(2)
  const bytes = new Uint8Array(cleanHex.length / 2)
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16)
  }
  if (bytes.length === 21 && (bytes[0] === 0x00 || bytes[0] === 0x01)) return bytes.slice(1)
  if (bytes.length > 20) return bytes.slice(-20)
  const result = new Uint8Array(20)
  result.set(bytes, 20 - bytes.length)
  return result
}

function encodeTransaction(tx: TransactionFields): Uint8Array {
  const buffers: Uint8Array[] = []

  // Version: 0x02 with optional sponsor.
  buffers.push(new Uint8Array([TX_ENCODING_VERSION_SPONSORED]))

  // Nonce: 8 bytes.
  const nonceBuf = new Uint8Array(8)
  new DataView(nonceBuf.buffer).setBigUint64(0, tx.nonce, false)
  buffers.push(nonceBuf)

  // Gas price: 32 bytes.
  const gasPriceBytes = bigIntToBytes(tx.gasPrice)
  const gasPriceBuf = new Uint8Array(32)
  gasPriceBuf.set(gasPriceBytes, 32 - gasPriceBytes.length)
  buffers.push(gasPriceBuf)

  // Gas: 8 bytes.
  const gasBuf = new Uint8Array(8)
  new DataView(gasBuf.buffer).setBigUint64(0, tx.gas, false)
  buffers.push(gasBuf)

  // Recipient: 20 bytes.
  const toBuf = new Uint8Array(20)
  if (tx.to) toBuf.set(normalizeAddress(tx.to))
  buffers.push(toBuf)

  // Value: 32 bytes.
  const valueBytes = bigIntToBytes(tx.value)
  const valueBuf = new Uint8Array(32)
  valueBuf.set(valueBytes, 32 - valueBytes.length)
  buffers.push(valueBuf)

  // Sponsor flag: 0x00.
  buffers.push(new Uint8Array([0x00]))

  // Data length: 4 bytes.
  const dataLenBuf = new Uint8Array(4)
  new DataView(dataLenBuf.buffer).setUint32(0, tx.data.length, false)
  buffers.push(dataLenBuf)

  // Data payload.
  if (tx.data.length > 0) buffers.push(tx.data)

  // Chain ID: 32 bytes.
  const chainIdBytes = bigIntToBytes(tx.chainId)
  const chainIdBuf = new Uint8Array(32)
  chainIdBuf.set(chainIdBytes, 32 - chainIdBytes.length)
  buffers.push(chainIdBuf)

  const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const buf of buffers) { result.set(buf, offset); offset += buf.length }
  return result
}

function encodeSignedTransaction(
  txBytes: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array,
): string {
  const totalLength = txBytes.length + 1 + 4 + publicKey.length + 4 + signature.length
  const result = new Uint8Array(totalLength)
  let offset = 0

  result.set(txBytes, offset); offset += txBytes.length

  // Signature type: ML-DSA-65.
  result.set([0x00], offset); offset += 1

  const pubKeyLen = new Uint8Array(4)
  new DataView(pubKeyLen.buffer).setUint32(0, publicKey.length, false)
  result.set(pubKeyLen, offset); offset += 4
  result.set(publicKey, offset); offset += publicKey.length

  const sigLen = new Uint8Array(4)
  new DataView(sigLen.buffer).setUint32(0, signature.length, false)
  result.set(sigLen, offset); offset += 4
  result.set(signature, offset)

  return '0x' + Array.from(result).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Sign and send

let dilithiumInstance: Dilithium | null = null

async function getDilithium(): Promise<Dilithium> {
  if (!dilithiumInstance) {
    dilithiumInstance = await Dilithium.init()
  }
  return dilithiumInstance
}

export async function signAndSendTransaction(
  params: SignAndSendParams,
): Promise<{ txHash: string; from: string }> {
  const {
    privateKeyHex,
    publicKeyHex,
    fromAddress,
    toAddress,
    txData,
    value = 0n,
    gas,
    networkId = 'mozaga',
  } = params

  const nonce = await getNonce(fromAddress, networkId)
  const chainId = await getChainId(networkId)

  const tx: TransactionFields = {
    nonce,
    gasPrice: MIN_GAS_PRICE,
    gas: gas ?? calculateGas(txData),
    to: toAddress,
    value,
    data: txData,
    chainId,
  }

  const encoded = encodeTransaction(tx)
  const hash = keccak256(encoded)

  const dilithium = await getDilithium()
  const privateKey = dilithiumHexToBytes(privateKeyHex)
  const publicKey = dilithiumHexToBytes(publicKeyHex)
  const signature = dilithium.sign(hash, privateKey)

  const signedHex = encodeSignedTransaction(encoded, signature, publicKey)
  const txHash = await rpcCall<string>('eth_sendRawTransaction', [signedHex], networkId)

  return { txHash, from: fromAddress }
}
