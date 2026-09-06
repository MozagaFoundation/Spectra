/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 */

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/constants', () => ({
  BITCOIN_EXPLORER_URL: 'https://btc.example/',
  ETH_EXPLORER_URL: 'https://etherscan.example/',
  EXPLORER_URL: 'https://mozaga-explorer.example/',
  SOLANA_EXPLORER_URL: 'https://solscan.example/',
  TRON_EXPLORER_URL: 'https://tronscan.example/',
}))

import {
  getEthExplorerAddressUrl,
  getEthExplorerTxUrl,
  getMozagaExplorerAddressUrl,
  getMozagaExplorerTxUrl,
  mapLocalWalletIndexTransaction,
} from './transactionHistory'

const EXO_ADDRESS = 'EXO0000000000000000000000000000000000000000'
const ETH_ADDRESS = `0x${'11'.repeat(20)}`
const TX_HASH = `0x${'ab'.repeat(32)}`

describe('transactionHistory', () => {
  it('normalizes explorer URLs and rejects invalid EVM-style hashes or addresses', () => {
    expect(getMozagaExplorerTxUrl(TX_HASH)).toBe(`https://mozaga-explorer.example/tx/${TX_HASH}`)
    expect(getMozagaExplorerAddressUrl(EXO_ADDRESS)).toBe(`https://mozaga-explorer.example/address/0x${'0'.repeat(40)}`)
    expect(getEthExplorerTxUrl(TX_HASH)).toBe(`https://etherscan.example/tx/${TX_HASH}`)
    expect(getEthExplorerAddressUrl(ETH_ADDRESS)).toBe(`https://etherscan.example/address/${ETH_ADDRESS}`)
    expect(() => getMozagaExplorerTxUrl('not-a-hash')).toThrow('Invalid transaction hash')
    expect(() => getEthExplorerAddressUrl('0x123')).toThrow('Invalid Ethereum address')
  })

  it('maps an encrypted local native transfer without a backend history request', () => {
    expect(mapLocalWalletIndexTransaction({
      chain: 'ethereum',
      address: ETH_ADDRESS,
      blockHeight: 20,
      counterpartyAddress: `0x${'22'.repeat(20)}`,
      direction: 'outbound',
      feeAtomic: '100',
      nativeAmountAtomic: '1000000000000000000',
      nativeSymbol: 'ETH',
      occurredAt: 1_700_000_000_000,
      status: 'confirmed',
      tokenTransfers: [],
      txHash: TX_HASH,
    })).toMatchObject({
      hash: TX_HASH,
      value: '1',
      direction: 'sent',
      status: 'success',
      category: 'transfer',
      typeName: 'ETH Transfer',
      network: 'ethereum',
    })
  })

  it('maps local token transfers with their token amount and symbol', () => {
    expect(mapLocalWalletIndexTransaction({
      chain: 'mozaga',
      address: EXO_ADDRESS,
      blockHeight: 21,
      counterpartyAddress: `EXO00${'1'.repeat(38)}`,
      direction: 'inbound',
      feeAtomic: '0',
      nativeAmountAtomic: '0',
      nativeSymbol: 'EXO',
      occurredAt: 1_700_000_000_000,
      status: 'confirmed',
      tokenTransfers: [{
        tokenStandard: 'mozaga-asset',
        tokenIdentifier: 'USDT',
        tokenSymbol: 'USDT',
        tokenDecimals: 6,
        amountAtomic: '1234500',
      }],
      txHash: TX_HASH,
    })).toMatchObject({
      direction: 'received',
      value: '1.2345 USDT',
      typeName: 'USDT Transfer',
      category: 'token_transfer',
    })
  })
})
