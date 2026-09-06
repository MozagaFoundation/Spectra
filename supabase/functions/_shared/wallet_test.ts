import { assertEquals, assertRejects, assertThrows } from '../../tests/assert.ts'
import {
  blockRange,
  hasMeaningfulBalanceChange,
  normalizeWalletIndexAddress,
  parseBitcoinBlock,
  parseRPCEnvelope,
  readBoundedBody,
  rpcHTTPErrorCode,
  runAllModeWork,
  runBitcoinAllModeWork,
  settleBeforeDeadline,
  tronBaseURL,
} from './wallet.ts'

Deno.test('all-mode wallet work runs transactions after a balance failure', async () => {
  const calls: string[] = []
  const failures: string[] = []

  await runAllModeWork(
    () => {
      calls.push('balances')
      return Promise.reject(new Error('rpc_request_failed'))
    },
    () => {
      calls.push('transactions')
      return Promise.resolve()
    },
    (error) => {
      failures.push(error instanceof Error ? error.message : String(error))
    },
  )

  assertEquals(calls, ['balances', 'transactions'])
  assertEquals(failures, ['rpc_request_failed'])
})

Deno.test('Bitcoin all-mode wallet work prioritizes transactions before balance scans', async () => {
  const calls: string[] = []
  const failures: string[] = []

  await runBitcoinAllModeWork(
    () => {
      calls.push('transactions')
      return Promise.resolve()
    },
    () => {
      calls.push('balances')
      return Promise.reject(new Error('rpc_timeout'))
    },
    (error) => {
      failures.push(error instanceof Error ? error.message : String(error))
    },
  )

  assertEquals(calls, ['transactions', 'balances'])
  assertEquals(failures, ['rpc_timeout'])
})

Deno.test('RPC deadlines settle even when an upstream request ignores aborts', async () => {
  let cancelled = false

  const error = await assertRejects(
    () =>
      settleBeforeDeadline(new Promise<Response>(() => {}), 1, () => {
        cancelled = true
      }),
    /RPC request timed out/,
  )

  assertEquals(error.name, 'TimeoutError')
  assertEquals(cancelled, true)
})

Deno.test('RPC response reads respect the remaining request deadline', async () => {
  const response = new Response(
    new ReadableStream<Uint8Array>({
      start() {},
    }),
  )

  const error = await assertRejects(
    () => readBoundedBody(response, 32, 1),
    /RPC request timed out/,
  )

  assertEquals(error.name, 'TimeoutError')
})

Deno.test('Bitcoin parser accepts compact block transaction responses', () => {
  const block = parseBitcoinBlock(
    {
      hash: 'block-hash',
      height: 42,
      time: 1_700_000_000,
      tx: [{
        txid: 'transaction-id',
        vin: [{ txid: 'previous-transaction', vout: 0 }],
        vout: [{
          value: 0.25,
          scriptPubKey: { address: 'bc1qd8a0f5yvt08ryq8vdgks2uehhc65xjssm7pyzn' },
        }],
      }],
    },
    42,
    'block-hash',
  )

  assertEquals(block.transactions[0]?.vin, [])
  assertEquals(block.transactions[0]?.vout, [{
    address: 'bc1qd8a0f5yvt08ryq8vdgks2uehhc65xjssm7pyzn',
    value: 0.25,
  }])
})

Deno.test('wallet activation canonicalizes uppercase mainnet Bech32 addresses', () => {
  assertEquals(
    normalizeWalletIndexAddress('bitcoin', 'BC1QCR8TE4KR609GCAWUTMRZA0J4XV80JY8Z306FYU'),
    'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu',
  )
})

Deno.test('wallet activation accepts valid lowercase Bech32 characters', () => {
  assertEquals(
    normalizeWalletIndexAddress('bitcoin', 'bc1qq6hag67dl53wl99vzg42z8eyzfz2xlkvxechjp'),
    'bc1qq6hag67dl53wl99vzg42z8eyzfz2xlkvxechjp',
  )
})

Deno.test('unstarted backfill scans from the latest block', () => {
  assertEquals(
    blockRange('backfill', 0, 1_000, 2),
    { from: 1_000, to: 999, descending: true },
  )
})

Deno.test('unstarted live scans retain a bounded initial history window', () => {
  assertEquals(
    blockRange('transactions', 0, 1_000, 4),
    { from: 997, to: 1_000, descending: false },
  )
})

Deno.test('Bitcoin RPC failures retain actionable transport classifications', () => {
  assertEquals(rpcHTTPErrorCode(401), 'rpc_unauthorized')
  assertEquals(rpcHTTPErrorCode(429), 'rpc_rate_limited')
  assertEquals(rpcHTTPErrorCode(503), 'rpc_upstream_unavailable')

  assertEquals(
    parseRPCEnvelope('bitcoin', { id: 1, result: 10, error: null }),
    10,
  )
  assertThrows(
    () => parseRPCEnvelope('bitcoin', { id: 2, result: 10, error: null }),
    /rpc_response_invalid/,
  )
})

Deno.test('Tron endpoint normalization accepts a configured wallet operation URL', () => {
  assertEquals(
    tronBaseURL(new URL('https://api.trongrid.io/wallet/getnowblock')).toString(),
    'https://api.trongrid.io/',
  )
})

Deno.test('wallet balance changes ignore block progress and JSON property order', () => {
  const previous = {
    native_balance_atomic: '100',
    native_symbol: 'TRX',
    token_balances: [{
      amountAtomic: '25',
      tokenDecimals: 6,
      tokenIdentifier: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
      tokenStandard: 'trc20',
      tokenSymbol: 'USDT',
    }],
  }
  const current = {
    nativeBalanceAtomic: '100',
    nativeSymbol: 'TRX',
    tokenBalances: [{
      tokenStandard: 'trc20',
      tokenIdentifier: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
      tokenSymbol: 'USDT',
      tokenDecimals: 6,
      amountAtomic: '25',
    }],
    blockHeight: 12_345,
  }

  assertEquals(hasMeaningfulBalanceChange(previous, current), false)
})

Deno.test('wallet balance changes retain actual value updates', () => {
  const previous = {
    native_balance_atomic: '100',
    native_symbol: 'TRX',
    token_balances: [],
  }
  const current = {
    nativeBalanceAtomic: '101',
    nativeSymbol: 'TRX',
    tokenBalances: [],
    blockHeight: 12_345,
  }

  assertEquals(hasMeaningfulBalanceChange(previous, current), true)
})

Deno.test('wallet balance changes repair malformed snapshot token data', () => {
  const previous = {
    native_balance_atomic: '100',
    native_symbol: 'TRX',
    token_balances: [{}],
  }
  const current = {
    nativeBalanceAtomic: '100',
    nativeSymbol: 'TRX',
    tokenBalances: [],
    blockHeight: 12_345,
  }

  assertEquals(hasMeaningfulBalanceChange(previous, current), true)
})
