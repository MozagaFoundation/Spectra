import { assertEquals, assertThrows } from '../../tests/assert.ts'
import {
  assertTronResponse,
  scanTronBlocks,
  tronBlockHeight,
  tronWatchedAddresses,
} from './walletTron.ts'

const token = {
  standard: 'trc20',
  identifier: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
  symbol: 'USDT',
  decimals: 6,
}
const recipientHex = `41${'11'.repeat(20)}`
const senderHex = `41${'22'.repeat(20)}`

Deno.test('Tron direct scanner indexes an inbound native transfer for a Base58 address', async () => {
  const recipient = await tronAddress(recipientHex)
  const result = await scanTronBlocks({
    range: { from: 100, to: 100, descending: false },
    watched: await tronWatchedAddresses([{
      addressHash: 'a'.repeat(64),
      address: recipient,
    }]),
    token,
    fetchBlock: (height) =>
      Promise.resolve(tronBlock(height, [{
        type: 'TransferContract',
        parameter: {
          value: {
            owner_address: senderHex,
            to_address: recipientHex,
            amount: 1_500_000,
          },
        },
      }])),
    errorCode,
  })

  assertEquals(result.failed, 0)
  assertEquals(result.records.length, 1)
  assertEquals(result.records[0]?.direction, 'inbound')
  assertEquals(result.records[0]?.addressHash, 'a'.repeat(64))
  assertEquals(result.records[0]?.nativeAmountAtomic, '1500000')
  assertEquals(result.records[0]?.counterpartyAddress, senderHex)
})

Deno.test('Tron direct scanner indexes an inbound USDT transfer', async () => {
  const recipient = await tronAddress(recipientHex)
  const transferData = [
    'a9059cbb',
    '0'.repeat(24),
    recipientHex.slice(2),
    (2_500_000n).toString(16).padStart(64, '0'),
  ].join('')
  const result = await scanTronBlocks({
    range: { from: 101, to: 101, descending: false },
    watched: await tronWatchedAddresses([{
      addressHash: 'b'.repeat(64),
      address: recipient,
    }]),
    token,
    fetchBlock: (height) =>
      Promise.resolve(tronBlock(height, [{
        type: 'TriggerSmartContract',
        parameter: {
          value: {
            owner_address: senderHex,
            contract_address: token.identifier,
            data: transferData,
          },
        },
      }])),
    errorCode,
  })

  assertEquals(result.failed, 0)
  assertEquals(result.records.length, 1)
  assertEquals(result.records[0]?.direction, 'inbound')
  assertEquals(result.records[0]?.nativeAmountAtomic, '0')
  assertEquals(result.records[0]?.tokenTransfers, [{
    tokenStandard: 'trc20',
    tokenIdentifier: token.identifier,
    tokenSymbol: 'USDT',
    tokenDecimals: 6,
    amountAtomic: '2500000',
    counterpartyAddress: senderHex,
  }])
})

Deno.test('Tron error envelopes fail closed without exposing provider content', () => {
  const error = assertThrows(
    () => assertTronResponse({ Error: 'provider detail must not reach logs' }),
    /tron_rpc_rejected/,
  )

  assertEquals(error.message, 'tron_rpc_rejected')
  assertEquals(
    assertThrows(
      () => assertTronResponse({ result: false, code: 'FAILURE', message: 'provider detail' }),
      /tron_rpc_rejected/,
    ).message,
    'tron_rpc_rejected',
  )
})

Deno.test('Tron scanner accepts a result-wrapped block with omitted transactions', async () => {
  const block = tronBlock(150, [])
  delete block.transactions
  const result = await scanTronBlocks({
    range: { from: 150, to: 150, descending: false },
    watched: new Map(),
    token,
    fetchBlock: () => Promise.resolve({ result: block }),
    errorCode,
  })

  assertEquals(result.failed, 0)
  assertEquals(result.blocks.map((entry) => entry.height), [150])
  assertEquals(tronBlockHeight({ result: block }), 150)
})

Deno.test('Tron scanner accepts a data-wrapped protobuf JSON block', async () => {
  const block = {
    blockId: 'e'.repeat(64),
    blockHeader: {
      rawData: {
        number: '151',
        timestamp: '1700000000000',
        parentHash: 'd'.repeat(64),
      },
    },
    transactions: null,
  }
  const result = await scanTronBlocks({
    range: { from: 151, to: 151, descending: false },
    watched: new Map(),
    token,
    fetchBlock: () => Promise.resolve({ data: [block] }),
    errorCode,
  })

  assertEquals(result.failed, 0)
  assertEquals(result.blocks[0]?.height, 151)
  assertEquals(result.blocks[0]?.hash, 'e'.repeat(64))
  assertEquals(result.blocks[0]?.parentHash, 'd'.repeat(64))
  assertEquals(result.blocks[0]?.timestamp?.getTime(), 1_700_000_000_000)
  assertEquals(tronBlockHeight({ data: block }), 151)
})

Deno.test('Tron scanner uses the block timestamp for unusable transaction timestamps', async () => {
  const result = await scanTronBlocks({
    range: { from: 152, to: 152, descending: false },
    watched: new Map(),
    token,
    fetchBlock: () =>
      Promise.resolve({
        blockID: 'f'.repeat(64),
        block_header: {
          raw_data: {
            number: 152,
            timestamp: 1_700_000_000_000,
          },
        },
        transactions: [{
          txID: 'a'.repeat(64),
          blockNumber: null,
          block_timestamp: null,
          raw_data: {
            timestamp: null,
            contract: [],
          },
        }, {
          txID: 'b'.repeat(64),
          raw_data: {
            timestamp: 1_785_341_038_000_000_000,
            contract: [],
          },
        }],
      }),
    errorCode,
  })

  assertEquals(result.failed, 0)
  assertEquals(result.blocks[0]?.timestamp?.getTime(), 1_700_000_000_000)
})

Deno.test('Tron direct scanner retains the failed block for a retry', async () => {
  const recipient = await tronAddress(recipientHex)
  const fetched: number[] = []
  const result = await scanTronBlocks({
    range: { from: 200, to: 202, descending: false },
    watched: await tronWatchedAddresses([{
      addressHash: 'c'.repeat(64),
      address: recipient,
    }]),
    token,
    fetchBlock: (height) => {
      fetched.push(height)
      if (height === 201) return Promise.resolve({ Error: 'provider failure' })
      return Promise.resolve(tronBlock(height, []))
    },
    errorCode,
  })

  assertEquals(fetched, [200, 201])
  assertEquals(result.blocks.map((block) => block.height), [200])
  assertEquals(result.lastScanned, 200)
  assertEquals(result.lastFinalized, 200)
  assertEquals(result.failed, 1)
  assertEquals(result.errors, ['tron_rpc_rejected'])
})

Deno.test('Tron backfill retries the rejected height without a gap', async () => {
  const recipient = await tronAddress(recipientHex)
  const fetched: number[] = []
  const result = await scanTronBlocks({
    range: { from: 202, to: 200, descending: true },
    watched: await tronWatchedAddresses([{
      addressHash: 'd'.repeat(64),
      address: recipient,
    }]),
    token,
    fetchBlock: (height) => {
      fetched.push(height)
      if (height === 201) return Promise.resolve({ Error: 'provider failure' })
      return Promise.resolve(tronBlock(height, []))
    },
    errorCode,
  })

  assertEquals(fetched, [202, 201])
  assertEquals(result.blocks.map((block) => block.height), [202])
  assertEquals(result.lastScanned, 201)
  assertEquals(result.lastFinalized, 201)
  assertEquals(result.failed, 1)
  assertEquals(result.errors, ['tron_rpc_rejected'])
})

function errorCode(error: unknown): string {
  return error instanceof Error ? error.message : 'wallet_index_failed'
}

function tronBlock(height: number, contracts: unknown[]): Record<string, unknown> {
  return {
    blockID: height.toString(16).padStart(64, '0'),
    block_header: {
      raw_data: {
        number: height,
        timestamp: 1_700_000_000_000,
      },
    },
    transactions: contracts.length === 0 ? [] : [{
      txID: 'd'.repeat(64),
      blockNumber: height,
      block_timestamp: 1_700_000_000_000,
      ret: [{ contractRet: 'SUCCESS' }],
      raw_data: {
        timestamp: 1_700_000_000_000,
        contract: contracts,
      },
    }],
  }
}

async function tronAddress(hex: string): Promise<string> {
  const body = hexBytes(hex)
  const digestBody = new Uint8Array(body.byteLength)
  digestBody.set(body)
  const first = new Uint8Array(await crypto.subtle.digest('SHA-256', digestBody))
  const second = new Uint8Array(await crypto.subtle.digest('SHA-256', first))
  return base58Encode(new Uint8Array([...body, ...second.slice(0, 4)]))
}

function hexBytes(value: string): Uint8Array {
  const bytes: number[] = []
  for (let index = 0; index < value.length; index += 2) {
    bytes.push(Number.parseInt(value.slice(index, index + 2), 16))
  }
  return Uint8Array.from(bytes)
}

function base58Encode(bytes: Uint8Array): string {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  let value = 0n
  for (const byte of bytes) value = (value << 8n) + BigInt(byte)
  let encoded = ''
  while (value > 0n) {
    encoded = alphabet[Number(value % 58n)]! + encoded
    value /= 58n
  }
  for (const byte of bytes) {
    if (byte !== 0) break
    encoded = `1${encoded}`
  }
  return encoded || '1'
}
