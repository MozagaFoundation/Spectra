/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

export interface WalletIndexAddressRegistration {
  chain: string
  address: string
}

export interface WalletIndexAddressRegistrationRow {
  chain: string
  address: string
  address_hash: string
}

export interface WalletIndexBalanceSnapshotRow {
  chain: string
  address: string
  address_hash: string
  native_balance_atomic: number | string
  native_symbol: string | null
  token_balances: unknown[]
  block_height: number | string | null
  updated_at: string | null
}

export interface WalletIndexTransactionRow {
  chain: string
  address: string
  tx_hash: string
  direction: 'sent' | 'received' | 'self' | 'unknown'
  status: 'pending' | 'confirmed' | 'failed' | 'orphaned'
  block_height: number | string | null
  native_amount_atomic: number | string
  native_symbol: string | null
  fee_atomic: number | string | null
  counterparty_address: string | null
  occurred_at: string | null
  token_transfers: unknown[]
}

export interface WalletIndexHistoryStatusRow {
  chain: string
  address: string
  is_registered: boolean
  is_owned: boolean
  transaction_count: number
  latest_transaction_at: string | null
  transaction_cursor_height: number | string | null
  backfill_cursor_height: number | string | null
  latest_run_status: string | null
  latest_run_finished_at: string | null
  latest_run_error: string | null
  is_sync_complete: boolean
}
