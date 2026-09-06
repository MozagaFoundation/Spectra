/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { secp256k1 } from '@noble/curves/secp256k1'
import { sha256 } from '@noble/hashes/sha256'
import { decodeSegwitAddress } from '@/lib/baseEncoding'
import { formatBigIntAmount, parseDecimalToBigInt } from '@/lib/amounts'
import { bytesToHex, hexToBytes } from '@/lib/utils'
import { rpcProxyCall } from '@/services/backend/rpcProxy'
import { assertCryptoNetworkAdmission } from './cryptoNetworkAdmission'

const BTC_TX_HASH_REGEX = /^[0-9a-fA-F]{64}$/
const DUST_LIMIT_SATS = 546n

interface BitcoinUtxo {
  txid: string
  vout: number
  value: number
}

interface BitcoinScanTxOutsetResult {
  success?: boolean
  unspents?: Array<{
    txid: string
    vout: number
    amount: number | string
  }>
}

interface BitcoinFeeEstimateResult {
  feerate?: number
}

interface BitcoinTransferOutput {
  address: string
  amountSats: bigint
}

interface BitcoinRawTransactionVerbose {
  txid?: string
  confirmations?: number
}

function sha256d(bytes: Uint8Array): Uint8Array {
  return sha256(sha256(bytes))
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

function varInt(value: number): Uint8Array {
  if (value < 0xfd) return new Uint8Array([value])
  if (value <= 0xffff) return new Uint8Array([0xfd, value & 0xff, (value >> 8) & 0xff])
  return concatBytes(new Uint8Array([0xfe]), uint32Le(value))
}

function reverseBytes(bytes: Uint8Array): Uint8Array {
  return Uint8Array.from(bytes).reverse()
}

function scriptPubKeyForAddress(address: string): Uint8Array {
  const decoded = decodeSegwitAddress(address)
  if (decoded.hrp !== 'bc' || decoded.witnessVersion !== 0 || decoded.witnessProgram.length !== 20) {
    throw new Error('Only Bitcoin mainnet native SegWit addresses are supported')
  }
  return concatBytes(new Uint8Array([0x00, 0x14]), decoded.witnessProgram)
}

function p2wpkhScriptCode(publicKeyHash: Uint8Array): Uint8Array {
  return concatBytes(new Uint8Array([0x19, 0x76, 0xa9, 0x14]), publicKeyHash, new Uint8Array([0x88, 0xac]))
}

function publicKeyHashFromAddress(address: string): Uint8Array {
  const decoded = decodeSegwitAddress(address)
  if (decoded.hrp !== 'bc' || decoded.witnessVersion !== 0 || decoded.witnessProgram.length !== 20) {
    throw new Error('Invalid Bitcoin native SegWit address')
  }
  return decoded.witnessProgram
}

function derEncodeInteger(value: bigint): Uint8Array {
  let hex = value.toString(16)
  if (hex.length % 2) hex = `0${hex}`
  let bytes = hexToBytes(hex)
  if (bytes[0] & 0x80) bytes = concatBytes(new Uint8Array([0]), bytes)
  return concatBytes(new Uint8Array([0x02, bytes.length]), bytes)
}

function derEncodeSignature(r: bigint, s: bigint): Uint8Array {
  const encodedR = derEncodeInteger(r)
  const encodedS = derEncodeInteger(s)
  return concatBytes(new Uint8Array([0x30, encodedR.length + encodedS.length]), encodedR, encodedS)
}

function normalizePrivateKey(privateKeyHex: string): string {
  const normalized = privateKeyHex.startsWith('0x') ? privateKeyHex.slice(2) : privateKeyHex
  if (!/^[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error('Invalid Bitcoin private key')
  }
  return normalized
}

async function bitcoinRpc<T>(method: string, params: unknown[] = []): Promise<T> {
  assertCryptoNetworkAdmission('bitcoin')

  try {
    return await rpcProxyCall<T>('bitcoin', method, params)
  } catch (error) {
    if (__DEV__) console.warn(`Bitcoin RPC error (${method}):`, error)
    throw new Error('Bitcoin request failed')
  }
}

function btcAmountToSats(amount: number | string): number {
  return Number(parseDecimalToBigInt(String(amount), 8) ?? 0n)
}

async function getAddressUtxosViaRpc(address: string): Promise<BitcoinUtxo[]> {
  const result = await bitcoinRpc<BitcoinScanTxOutsetResult>('scantxoutset', [
    'start',
    [`addr(${address})`],
  ])

  if (!result.success) return []

  return (result.unspents || [])
    .filter((utxo) => BTC_TX_HASH_REGEX.test(utxo.txid))
    .map((utxo) => ({
      txid: utxo.txid,
      vout: utxo.vout,
      value: btcAmountToSats(utxo.amount),
    }))
}

async function getAddressUtxos(address: string): Promise<BitcoinUtxo[]> {
  return getAddressUtxosViaRpc(address)
}

export function isValidBitcoinAddress(address: string): boolean {
  try {
    publicKeyHashFromAddress(address.trim())
    return true
  } catch {
    return false
  }
}

export function formatBitcoin(sats: bigint | string): string {
  return formatBigIntAmount(sats, 8, 8, true)
}

export function parseBitcoin(amount: string): bigint {
  const parsed = parseDecimalToBigInt(amount, 8)
  if (!parsed || parsed <= 0n) {
    throw new Error('Invalid BTC amount')
  }
  return parsed
}

export async function getBitcoinBalance(address: string): Promise<string> {
  if (!isValidBitcoinAddress(address)) {
    throw new Error('Invalid Bitcoin address')
  }
  const utxos = await getAddressUtxos(address)
  const total = utxos.reduce((sum, utxo) => sum + BigInt(utxo.value), 0n)
  return formatBitcoin(total)
}

async function getRecommendedFeeRate(): Promise<number> {
  try {
    const estimate = await bitcoinRpc<BitcoinFeeEstimateResult>('estimatesmartfee', [3])
    if (!estimate.feerate || estimate.feerate <= 0) return 2
    // Bitcoin Core returns BTC per kvB. Convert to sats/vB.
    return Math.max(1, Math.ceil((estimate.feerate * 100_000_000) / 1000))
  } catch {
    return 2
  }
}

function estimateP2wpkhVbytes(inputCount: number, outputCount: number): number {
  return 11 + inputCount * 68 + outputCount * 31
}

function buildUnsignedOutput(address: string, value: bigint): Uint8Array {
  const script = scriptPubKeyForAddress(address)
  return concatBytes(uint64Le(value), varInt(script.length), script)
}

function buildSignedTransaction(params: {
  privateKeyHex: string
  fromAddress: string
  outputs: BitcoinTransferOutput[]
  feeSats: bigint
  utxos: BitcoinUtxo[]
}): Uint8Array {
  const privateKey = normalizePrivateKey(params.privateKeyHex)
  const publicKey = secp256k1.getPublicKey(privateKey, true)
  const fromPubKeyHash = publicKeyHashFromAddress(params.fromAddress)
  const totalInput = params.utxos.reduce((sum, utxo) => sum + BigInt(utxo.value), 0n)
  const outputTotal = params.outputs.reduce((sum, output) => sum + output.amountSats, 0n)
  const change = totalInput - outputTotal - params.feeSats
  if (change < 0n) throw new Error('Insufficient BTC balance')

  const outputs = params.outputs.map((output) => buildUnsignedOutput(output.address, output.amountSats))
  if (change >= DUST_LIMIT_SATS) {
    outputs.push(buildUnsignedOutput(params.fromAddress, change))
  }

  const prevouts = concatBytes(...params.utxos.map((utxo) => concatBytes(reverseBytes(hexToBytes(utxo.txid)), uint32Le(utxo.vout))))
  const sequences = concatBytes(...params.utxos.map(() => new Uint8Array([0xff, 0xff, 0xff, 0xff])))
  const serializedOutputs = concatBytes(...outputs)
  const hashPrevouts = sha256d(prevouts)
  const hashSequence = sha256d(sequences)
  const hashOutputs = sha256d(serializedOutputs)
  const scriptCode = p2wpkhScriptCode(fromPubKeyHash)

  const signedInputs = params.utxos.map((utxo, index) => {
    const outpoint = concatBytes(reverseBytes(hexToBytes(utxo.txid)), uint32Le(utxo.vout))
    const preimage = concatBytes(
      uint32Le(2),
      hashPrevouts,
      hashSequence,
      outpoint,
      scriptCode,
      uint64Le(BigInt(utxo.value)),
      new Uint8Array([0xff, 0xff, 0xff, 0xff]),
      hashOutputs,
      uint32Le(0),
      uint32Le(1),
    )
    const sigHash = sha256d(preimage)
    const sig = secp256k1.sign(sigHash, privateKey)
    const derSig = concatBytes(derEncodeSignature(sig.r, sig.s), new Uint8Array([0x01]))
    return {
      input: concatBytes(outpoint, new Uint8Array([0x00]), new Uint8Array([0xff, 0xff, 0xff, 0xff])),
      witness: concatBytes(
        new Uint8Array([0x02]),
        varInt(derSig.length),
        derSig,
        varInt(publicKey.length),
        publicKey,
      ),
      index,
    }
  })

  return concatBytes(
    uint32Le(2),
    new Uint8Array([0x00, 0x01]),
    varInt(params.utxos.length),
    ...signedInputs.map((input) => input.input),
    varInt(outputs.length),
    serializedOutputs,
    ...signedInputs.map((input) => input.witness),
    uint32Le(0),
  )
}

export async function sendBitcoinTransfer(
  privateKeyHex: string,
  from: string,
  to: string,
  amountBtc: string,
  options: { donation?: { to: string; amount: string } } = {},
): Promise<{ txHash: string }> {
  if (
    !isValidBitcoinAddress(from)
    || !isValidBitcoinAddress(to)
    || (options.donation && !isValidBitcoinAddress(options.donation.to))
  ) {
    throw new Error('Invalid Bitcoin address')
  }

  const amountSats = parseBitcoin(amountBtc)
  const donationSats = options.donation ? parseBitcoin(options.donation.amount) : 0n
  const outputs: BitcoinTransferOutput[] = [
    { address: to, amountSats },
    ...(options.donation ? [{ address: options.donation.to, amountSats: donationSats }] : []),
  ]
  const allUtxos = await getAddressUtxos(from)
  const feeRate = await getRecommendedFeeRate()
  const selected: BitcoinUtxo[] = []
  let total = 0n
  let fee = 0n
  const outputTotal = amountSats + donationSats

  for (const utxo of allUtxos.sort((a, b) => b.value - a.value)) {
    if (!BTC_TX_HASH_REGEX.test(utxo.txid)) continue
    selected.push(utxo)
    total += BigInt(utxo.value)
    fee = BigInt(Math.ceil(estimateP2wpkhVbytes(selected.length, outputs.length + 1) * feeRate))
    if (total >= outputTotal + fee) break
  }

  if (total < outputTotal + fee) {
    throw new Error('Insufficient BTC balance')
  }

  const rawTx = buildSignedTransaction({
    privateKeyHex,
    fromAddress: from,
    outputs,
    feeSats: fee,
    utxos: selected,
  })

  const txHash = await bitcoinRpc<string>('sendrawtransaction', [bytesToHex(rawTx)])
  return { txHash }
}

export async function waitForBitcoinTransaction(txHash: string): Promise<{ status: 'confirmed' | 'pending' }> {
  if (!BTC_TX_HASH_REGEX.test(txHash.trim())) {
    throw new Error('Invalid Bitcoin transaction hash')
  }
  try {
    const tx = await bitcoinRpc<BitcoinRawTransactionVerbose>('getrawtransaction', [txHash, true])
    return { status: (tx.confirmations || 0) > 0 ? 'confirmed' : 'pending' }
  } catch {
    return { status: 'pending' }
  }
}
