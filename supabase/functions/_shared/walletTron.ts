import { isRecord } from './http.ts'

const tronTransferSelector = 'a9059cbb'
const tronTransferFromSelector = '23b872dd'
const tronBase58Alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

export interface TronWatchedAddress {
  addressHash: string
  address: string
}

export interface TronToken {
  standard: string
  identifier: string
  symbol: string
  decimals: number
}

export interface TronTokenTransfer {
  tokenStandard: string
  tokenIdentifier: string
  tokenSymbol: string
  tokenDecimals: number
  amountAtomic: string
  counterpartyAddress: string
}

export interface TronTransactionRecord {
  addressHash: string
  occurredAt: Date
  txHash: string
  direction: 'inbound' | 'outbound'
  status: 'confirmed' | 'failed'
  blockHeight: number
  nativeAmountAtomic: string
  counterpartyAddress: string
  tokenTransfers: TronTokenTransfer[]
}

export interface TronChainBlock {
  height: number
  hash: string
  parentHash: string
  timestamp?: Date
}

export interface TronBlockRange {
  from: number
  to: number
  descending: boolean
}

export interface TronBlockScan {
  records: TronTransactionRecord[]
  blocks: TronChainBlock[]
  lastScanned: number
  lastFinalized: number
  tokenTransfers: number
  failed: number
  errors: string[]
}

export class TronHistoryError extends Error {
  constructor(readonly code: 'tron_rpc_rejected' | 'tron_rpc_response_invalid') {
    super(code)
  }
}

interface ParsedTronContract {
  type: string
  ownerAddress: string
  toAddress: string
  contractAddress: string
  amount: string
  data: string
}

interface ParsedTronTransaction {
  txid: string
  blockNumber: number
  blockTimestamp: number
  rawTimestamp: number
  success: boolean
  contracts: ParsedTronContract[]
}

interface ParsedTronBlock {
  meta: TronChainBlock
  transactions: ParsedTronTransaction[]
}

export function assertTronResponse(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new TronHistoryError('tron_rpc_response_invalid')
  if (
    Object.hasOwn(value, 'Error') || Object.hasOwn(value, 'error') ||
    value.result === false || value.success === false
  ) {
    throw new TronHistoryError('tron_rpc_rejected')
  }
  return value
}

export function tronBlockHeight(value: unknown): number {
  return safeInteger(tronBlockRawHeader(tronBlockResponse(value)).number)
}

export async function tronWatchedAddresses(
  addresses: TronWatchedAddress[],
): Promise<Map<string, TronWatchedAddress>> {
  const watched = new Map<string, TronWatchedAddress>()
  for (const address of addresses) {
    watched.set(address.address, address)
    const hex = await tronAddressHex(address.address)
    if (hex) watched.set(hex, address)
  }
  return watched
}

export async function scanTronBlocks(input: {
  range: TronBlockRange
  watched: Map<string, TronWatchedAddress>
  token: TronToken
  fetchBlock: (height: number) => Promise<unknown>
  errorCode: (error: unknown) => string
}): Promise<TronBlockScan> {
  const tokenHex = await tronAddressHex(input.token.identifier)
  if (!tokenHex) throw new TronHistoryError('tron_rpc_response_invalid')

  const records: TronTransactionRecord[] = []
  const blocks: TronChainBlock[] = []
  let tokenTransfers = 0
  for (const height of heightsForRange(input.range)) {
    try {
      const block = parseTronBlock(await input.fetchBlock(height), height)
      blocks.push(block.meta)
      for (const transaction of block.transactions) {
        const native = await tronNativeRecords(input.watched, transaction)
        const token = await tronTokenRecords(input.watched, transaction, tokenHex, input.token)
        records.push(...native, ...token)
        tokenTransfers += token.length
      }
    } catch (error) {
      const cursor = input.range.descending ? height : Math.max(0, height - 1)
      return {
        records,
        blocks,
        lastScanned: cursor,
        lastFinalized: cursor,
        tokenTransfers,
        failed: 1,
        errors: [input.errorCode(error)],
      }
    }
  }

  return {
    records,
    blocks,
    lastScanned: input.range.to,
    lastFinalized: input.range.to,
    tokenTransfers,
    failed: 0,
    errors: [],
  }
}

function parseTronBlock(value: unknown, expectedHeight: number): ParsedTronBlock {
  const response = tronBlockResponse(value)
  const rawHeader = tronBlockRawHeader(response)
  const headerHeight = rawHeader.number === undefined
    ? expectedHeight
    : safeInteger(rawHeader.number)
  if (headerHeight !== expectedHeight) throw new TronHistoryError('tron_rpc_response_invalid')
  const blockTimestamp = rawHeader.timestamp === undefined ? 0 : safeInteger(rawHeader.timestamp)
  if (
    response.transactions !== undefined && response.transactions !== null &&
    !Array.isArray(response.transactions)
  ) {
    throw new TronHistoryError('tron_rpc_response_invalid')
  }

  const transactions: ParsedTronTransaction[] = []
  const rawTransactions = Array.isArray(response.transactions) ? response.transactions : []
  for (const raw of rawTransactions) {
    if (!isRecord(raw)) throw new TronHistoryError('tron_rpc_response_invalid')
    const txid = stringField(raw, ['txID', 'txId', 'txid'])
    const rawData = recordField(raw, ['raw_data', 'rawData'])
    if (!txid || !rawData) {
      throw new TronHistoryError('tron_rpc_response_invalid')
    }
    const contracts: ParsedTronContract[] = []
    const rawContracts = rawData.contract
    if (Array.isArray(rawContracts)) {
      for (const contract of rawContracts) {
        if (
          !isRecord(contract) || typeof contract.type !== 'string' ||
          !isRecord(contract.parameter) || !isRecord(contract.parameter.value)
        ) continue
        const item = contract.parameter.value
        contracts.push({
          type: contract.type,
          ownerAddress: stringField(item, ['owner_address', 'ownerAddress']),
          toAddress: stringField(item, ['to_address', 'toAddress']),
          contractAddress: stringField(item, ['contract_address', 'contractAddress']),
          amount: item.amount === undefined ? '0' : nonNegativeInt64Text(item.amount),
          data: typeof item.data === 'string' ? item.data : '',
        })
      }
    }
    const success = !Array.isArray(raw.ret) ||
      raw.ret.every((entry) =>
        !isRecord(entry) || entry.contractRet === undefined || entry.contractRet === '' ||
        entry.contractRet === 'SUCCESS'
      )
    const blockNumber = raw.blockNumber ?? raw.block_number
    const transactionTimestamp = raw.block_timestamp ?? raw.blockTimestamp
    const rawTimestamp = rawData.timestamp
    transactions.push({
      txid,
      blockNumber: blockNumber === undefined ? expectedHeight : safeInteger(blockNumber),
      blockTimestamp: transactionTimestamp === undefined
        ? blockTimestamp
        : safeInteger(transactionTimestamp),
      rawTimestamp: optionalTimestamp(rawTimestamp),
      success,
      contracts,
    })
  }

  const blockHash = stringField(response, ['blockID', 'blockId'])
  return {
    meta: {
      height: expectedHeight,
      hash: blockHash || `tron:${expectedHeight}`,
      parentHash: stringField(rawHeader, ['parentHash', 'parent_hash']),
      timestamp: blockTimestamp > 0 ? new Date(blockTimestamp) : undefined,
    },
    transactions,
  }
}

function tronBlockResponse(value: unknown): Record<string, unknown> {
  const response = assertTronResponse(value)
  if (isRecord(response.result)) return assertTronResponse(response.result)
  if (isRecord(response.data)) return assertTronResponse(response.data)
  if (Array.isArray(response.data) && response.data.length === 1 && isRecord(response.data[0])) {
    return assertTronResponse(response.data[0])
  }
  return response
}

function tronBlockRawHeader(response: Record<string, unknown>): Record<string, unknown> {
  const header = recordField(response, ['block_header', 'blockHeader'])
  const rawHeader = header && recordField(header, ['raw_data', 'rawData'])
  if (!rawHeader) throw new TronHistoryError('tron_rpc_response_invalid')
  return rawHeader
}

function recordField(
  value: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> | undefined {
  for (const key of keys) {
    if (isRecord(value[key])) return value[key]
  }
  return undefined
}

function stringField(value: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    if (typeof value[key] === 'string') return value[key]
  }
  return ''
}

async function tronNativeRecords(
  watched: Map<string, TronWatchedAddress>,
  transaction: ParsedTronTransaction,
): Promise<TronTransactionRecord[]> {
  const records: TronTransactionRecord[] = []
  for (const contract of transaction.contracts) {
    if (contract.type !== 'TransferContract') continue
    const from = await tronAddressKey(contract.ownerAddress)
    const to = await tronAddressKey(contract.toAddress)
    const fromAddress = watched.get(from)
    const toAddress = watched.get(to)
    if (!fromAddress && !toAddress) continue
    const occurredAt = tronTransactionTime(transaction)
    if (fromAddress) {
      records.push({
        addressHash: fromAddress.addressHash,
        occurredAt,
        txHash: transaction.txid,
        direction: 'outbound',
        status: transaction.success ? 'confirmed' : 'failed',
        blockHeight: transaction.blockNumber,
        nativeAmountAtomic: contract.amount,
        counterpartyAddress: contract.toAddress,
        tokenTransfers: [],
      })
    }
    if (toAddress && toAddress.addressHash !== fromAddress?.addressHash) {
      records.push({
        addressHash: toAddress.addressHash,
        occurredAt,
        txHash: transaction.txid,
        direction: 'inbound',
        status: transaction.success ? 'confirmed' : 'failed',
        blockHeight: transaction.blockNumber,
        nativeAmountAtomic: contract.amount,
        counterpartyAddress: contract.ownerAddress,
        tokenTransfers: [],
      })
    }
  }
  return records
}

async function tronTokenRecords(
  watched: Map<string, TronWatchedAddress>,
  transaction: ParsedTronTransaction,
  tokenHex: string,
  token: TronToken,
): Promise<TronTransactionRecord[]> {
  const records: TronTransactionRecord[] = []
  for (const contract of transaction.contracts) {
    if (
      contract.type !== 'TriggerSmartContract' ||
      await tronAddressHex(contract.contractAddress) !== tokenHex
    ) continue
    const transfer = await tronTransferCall(contract.ownerAddress, contract.data)
    if (!transfer) continue
    const fromAddress = watched.get(transfer.from)
    const toAddress = watched.get(transfer.to)
    if (!fromAddress && !toAddress) continue
    const occurredAt = tronTransactionTime(transaction)
    const transferBase = {
      tokenStandard: token.standard,
      tokenIdentifier: token.identifier,
      tokenSymbol: token.symbol,
      tokenDecimals: token.decimals,
      amountAtomic: transfer.amount,
    }
    if (fromAddress) {
      records.push({
        addressHash: fromAddress.addressHash,
        occurredAt,
        txHash: transaction.txid,
        direction: 'outbound',
        status: transaction.success ? 'confirmed' : 'failed',
        blockHeight: transaction.blockNumber,
        nativeAmountAtomic: '0',
        counterpartyAddress: transfer.to,
        tokenTransfers: [{ ...transferBase, counterpartyAddress: transfer.to }],
      })
    }
    if (toAddress && toAddress.addressHash !== fromAddress?.addressHash) {
      records.push({
        addressHash: toAddress.addressHash,
        occurredAt,
        txHash: transaction.txid,
        direction: 'inbound',
        status: transaction.success ? 'confirmed' : 'failed',
        blockHeight: transaction.blockNumber,
        nativeAmountAtomic: '0',
        counterpartyAddress: transfer.from,
        tokenTransfers: [{ ...transferBase, counterpartyAddress: transfer.from }],
      })
    }
  }
  return records
}

function tronTransactionTime(transaction: ParsedTronTransaction): Date {
  return new Date(transaction.blockTimestamp || transaction.rawTimestamp || 0)
}

async function tronTransferCall(
  ownerAddress: string,
  data: string,
): Promise<{ from: string; to: string; amount: string } | undefined> {
  const clean = data.trim().toLowerCase().replace(/^0x/, '')
  const ownerHex = await tronAddressHex(ownerAddress)
  if (!ownerHex) return undefined
  if (clean.startsWith(tronTransferSelector) && clean.length >= 136) {
    return {
      from: ownerHex,
      to: `41${clean.slice(32, 72)}`,
      amount: hexToDecimal(clean.slice(72, 136)),
    }
  }
  if (clean.startsWith(tronTransferFromSelector) && clean.length >= 200) {
    return {
      from: `41${clean.slice(32, 72)}`,
      to: `41${clean.slice(96, 136)}`,
      amount: hexToDecimal(clean.slice(136, 200)),
    }
  }
  return undefined
}

function heightsForRange(range: TronBlockRange): number[] {
  const heights: number[] = []
  if (range.descending) {
    for (let height = range.from; height >= range.to; height--) heights.push(height)
  } else {
    for (let height = range.from; height <= range.to; height++) heights.push(height)
  }
  return heights
}

function safeInteger(value: unknown): number {
  const text = typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? String(value)
    : typeof value === 'string' && /^\d+$/.test(value)
    ? value
    : ''
  if (!text || !Number.isSafeInteger(Number(text))) {
    throw new TronHistoryError('tron_rpc_response_invalid')
  }
  return Number(text)
}

function optionalTimestamp(value: unknown): number {
  if (value === undefined || value === null) return 0
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number(value)
    if (Number.isSafeInteger(parsed)) return parsed
  }
  return 0
}

function nonNegativeInt64Text(value: unknown): string {
  const text = typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? String(value)
    : typeof value === 'string' && /^\d+$/.test(value)
    ? value
    : ''
  if (!text || BigInt(text) > 9_223_372_036_854_775_807n) {
    throw new TronHistoryError('tron_rpc_response_invalid')
  }
  return text.replace(/^0+(?=\d)/, '')
}

function hexToDecimal(value: string): string {
  if (!/^[0-9a-f]+$/i.test(value)) throw new TronHistoryError('tron_rpc_response_invalid')
  return BigInt(`0x${value}`).toString()
}

async function tronAddressKey(value: string): Promise<string> {
  return await tronAddressHex(value) || value
}

async function tronAddressHex(value: string): Promise<string> {
  const clean = value.trim().toLowerCase().replace(/^0x/, '')
  if (/^41[0-9a-f]{40}$/.test(clean)) return clean
  if (/^[0-9a-f]{40}$/.test(clean)) return `41${clean}`
  if (value.length !== 34) return ''
  const payload = base58Decode(value)
  if (payload.length !== 25 || payload[0] !== 0x41) return ''
  const body = payload.slice(0, 21)
  const checksum = payload.slice(21)
  const first = new Uint8Array(await crypto.subtle.digest('SHA-256', body))
  const second = new Uint8Array(await crypto.subtle.digest('SHA-256', first))
  if (!checksum.every((byte, index) => byte === second[index])) return ''
  return Array.from(body, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function base58Decode(value: string): Uint8Array {
  let result = 0n
  for (const character of value) {
    const index = tronBase58Alphabet.indexOf(character)
    if (index < 0) return new Uint8Array()
    result = result * 58n + BigInt(index)
  }
  const bytes: number[] = []
  while (result > 0n) {
    bytes.push(Number(result & 0xffn))
    result >>= 8n
  }
  bytes.reverse()
  for (const character of value) {
    if (character !== '1') break
    bytes.unshift(0)
  }
  return Uint8Array.from(bytes)
}
