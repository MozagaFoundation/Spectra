import { loadConfig, optionalEnv } from './config.ts'
import { type Database, db } from './db.ts'
import {
  decodeExplorerFeedCursor,
  encodeExplorerFeedCursor,
  type ExplorerFeedRecord,
  fetchExplorerWalletFeed,
  isExplorerWalletFeedConfigured,
} from './explorerWalletFeed.ts'
import { bytesToHex, HttpError, isRecord, sha256Hex } from './http.ts'
import { rpcHeaders, upstreamRPCMethod } from './rpc_auth.ts'
import {
  parseWalletIndexAddressProof,
  verifyWalletIndexAddressProof,
  walletIndexActivationBindingHash,
  type WalletIndexActivationRequest,
} from './walletIndexActivation.ts'
import { VDF_MIN_CHALLENGE_AGE_MS, type VdfProof, type VdfPublicParams, verifyVdf } from './vdf.ts'
import {
  assertTronResponse,
  scanTronBlocks,
  tronBlockHeight,
  TronHistoryError,
  type TronTransactionRecord,
  tronWatchedAddresses,
} from './walletTron.ts'

const chains = ['mozaga', 'ethereum', 'bitcoin', 'solana', 'tron'] as const
export type Chain = typeof chains[number]
const symbols: Record<Chain, string> = {
  mozaga: 'EXO',
  ethereum: 'ETH',
  bitcoin: 'BTC',
  solana: 'SOL',
  tron: 'TRX',
}
const evmTokens = [
  ['0xdAC17F958D2ee523a2206206994597C13D831ec7', 'USDT', 6],
  ['0xA0b86991c6218B36c1D19D4a2e9Eb0cE3606eB48', 'USDC', 6],
  ['0x6B175474E89094C44Da98b954EedeAC495271d0F', 'DAI', 18],
  ['0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', 'WETH', 18],
  ['0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', 'WBTC', 8],
  ['0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', 'UNI', 18],
  ['0x514910771AF9Ca656af840Dff83E8264EcF986CA', 'LINK', 18],
] as const
const solanaToken = {
  standard: 'spl',
  identifier: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  symbol: 'USDT',
  decimals: 6,
} as const
const tronToken = {
  standard: 'trc20',
  identifier: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
  symbol: 'USDT',
  decimals: 6,
} as const
const evmTransferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const rpcMethods: Record<Exclude<Chain, 'tron'>, ReadonlySet<string>> = {
  mozaga: new Set(['eth_getBalance', 'eth_blockNumber', 'eth_getBlockByNumber']),
  ethereum: new Set([
    'eth_getBalance',
    'eth_blockNumber',
    'eth_call',
    'eth_getBlockByNumber',
    'eth_getLogs',
  ]),
  bitcoin: new Set(['getblockcount', 'scantxoutset', 'getblockhash', 'getblock']),
  solana: new Set([
    'getBalance',
    'getSlot',
    'getTokenAccountsByOwner',
    'getSignaturesForAddress',
    'getTransaction',
  ]),
}
const tronPaths = new Set([
  '/wallet/getaccount',
  '/wallet/getnowblock',
  '/wallet/getblockbynum',
])
const normalRPCResponseBytes = 4 * 1024 * 1024
const bitcoinBlockResponseBytes = 16 * 1024 * 1024
const maxRPCRequestBytes = 256 * 1024
const invocationTimeoutMs = 18_000
const chainTimeoutMs = 15_000
const rpcTimeoutMs = 10_000
const lockDurationSeconds = 90
const maxRPCRequestsPerChain = 100
const rpcRetryAttempts = 3
const rpcRetryBaseMs = 250
const maxRetryAfterMs = 5_000
const maxErrors = 5
const edgeBlockLimits: Record<Chain, { live: number; backfill: number }> = {
  mozaga: { live: 24, backfill: 64 },
  ethereum: { live: 24, backfill: 64 },
  bitcoin: { live: 1, backfill: 1 },
  solana: { live: 0, backfill: 0 },
  tron: { live: 80, backfill: 96 },
}
const maxBalanceAddresses: Record<Chain, number> = {
  mozaga: 12,
  ethereum: 6,
  bitcoin: 200,
  solana: 12,
  tron: 12,
}
const maxTransactionAddresses: Record<Chain, number> = {
  mozaga: 200,
  ethereum: 200,
  bitcoin: 200,
  solana: 4,
  tron: 200,
}
const solanaSignaturesPerPage = 16
const solanaInitialLiveWindow = 160
const edgeMetadataKey = 'spectra_wallet_index'
const mozagaExplorerAddressBatch = 12
const mozagaExplorerPageLimit = 100
const activationChallengeTtlMs = 5 * 60 * 1000
const activationLeaseTtlMs = 30 * 24 * 60 * 60 * 1000
const deliveryEventTtlMs = 30 * 24 * 60 * 60 * 1000
const maxDeliveryBatch = 100

export type RunMode = 'balances' | 'transactions' | 'all' | 'backfill'
type RunStatus = 'completed' | 'completed_with_errors' | 'skipped' | 'failed'
type CursorName =
  | 'native_balance'
  | 'transactions'
  | 'transactions_backfill'
  | 'balance_indexer_run'
  | 'transaction_indexer_run'
type TransactionDirection = 'inbound' | 'outbound' | 'self' | 'unknown'
type TransactionStatus = 'pending' | 'confirmed' | 'failed' | 'dropped'

interface WalletPrincipal {
  userId: string
  walletAddress: string
}

interface AddressRow {
  address_hash: string
  address: string
  metadata: unknown
}

interface CursorRow {
  exists: boolean
  lastScanned: number
  lastFinalized: number
}

interface ChainSummary {
  chain: Chain
  scanned: number
  updated: number
  transactions: number
  tokenTransfers: number
  failed: number
  skipped: number
  errors: string[]
}

interface TokenBalance {
  tokenStandard: string
  tokenIdentifier: string
  tokenSymbol: string
  tokenDecimals: number
  amountAtomic: string
}

interface TokenTransfer extends TokenBalance {
  counterpartyAddress: string
}

interface BalanceResult {
  nativeBalanceAtomic: string
  nativeSymbol: string
  tokenBalances: TokenBalance[]
  blockHeight: number
}

interface BalanceSnapshotRow {
  native_balance_atomic: string
  native_symbol: string
  token_balances: unknown
}

function tokenBalanceFingerprint(value: unknown): string | null {
  if (!Array.isArray(value)) return null
  const balances: Array<[string, string, string, number, string]> = []
  for (const entry of value) {
    if (
      !isRecord(entry) ||
      typeof entry.tokenStandard !== 'string' ||
      typeof entry.tokenIdentifier !== 'string' ||
      typeof entry.tokenSymbol !== 'string' ||
      typeof entry.tokenDecimals !== 'number' ||
      !Number.isSafeInteger(entry.tokenDecimals) ||
      typeof entry.amountAtomic !== 'string'
    ) {
      return null
    }
    balances.push([
      entry.tokenStandard,
      entry.tokenIdentifier,
      entry.tokenSymbol,
      entry.tokenDecimals,
      entry.amountAtomic,
    ])
  }
  balances.sort((left, right) => {
    const leftKey = JSON.stringify(left)
    const rightKey = JSON.stringify(right)
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0
  })
  return JSON.stringify(balances)
}

export function hasMeaningfulBalanceChange(
  previous:
    | Pick<
      BalanceSnapshotRow,
      'native_balance_atomic' | 'native_symbol' | 'token_balances'
    >
    | undefined,
  balance: BalanceResult,
): boolean {
  if (!previous) return true
  const previousTokens = tokenBalanceFingerprint(previous.token_balances)
  const currentTokens = tokenBalanceFingerprint(balance.tokenBalances)
  return previous.native_balance_atomic !== balance.nativeBalanceAtomic ||
    previous.native_symbol !== balance.nativeSymbol ||
    previousTokens === null ||
    currentTokens === null ||
    previousTokens !== currentTokens
}

interface TransactionRecord {
  chain: Chain
  addressHash: string
  occurredAt: Date
  txHash: string
  direction: TransactionDirection
  status: TransactionStatus
  blockHeight: number
  nativeAmountAtomic: string
  nativeSymbol: string
  feeAtomic: string
  counterpartyAddress: string
  tokenTransfers: TokenTransfer[]
}

interface ChainBlock {
  chain: Chain
  height: number
  hash: string
  parentHash: string
  timestamp?: Date
}

interface TransactionResult {
  records: TransactionRecord[]
  blocks: ChainBlock[]
  lastScanned: number
  lastFinalized: number
  tokenTransfers: number
  failed: number
  errors: string[]
  addressCursors?: Map<string, number>
  metadataUpdates?: Map<string, Record<string, unknown>>
  processedAddressHashes?: Set<string>
  externalCursors?: Map<string, ExternalHistoryCursorUpdate>
}

interface ExternalHistoryCursorUpdate {
  nextCursor: string | null
  syncComplete: boolean
  latestError: string | null
}

function normalizeChain(value: unknown): Chain {
  if (typeof value !== 'string') throw new HttpError(400, 'invalid_request')
  const normalized = value.trim().toLowerCase()
  if (!chains.includes(normalized as Chain)) throw new HttpError(400, 'invalid_request')
  return normalized as Chain
}

export function normalizeWalletIndexAddress(chain: Chain, value: unknown): string {
  if (typeof value !== 'string') throw new HttpError(400, 'invalid_request')
  let address = value.trim()
  if (chain === 'ethereum') address = address.toLowerCase()
  if (chain === 'bitcoin' && (/^bc1/.test(address) || /^BC1/.test(address))) {
    address = address.toLowerCase()
  }
  if (chain === 'mozaga' && address.length >= 3) {
    address = address.slice(0, 3).toUpperCase() + address.slice(3).toLowerCase()
  }
  const patterns: Record<Chain, RegExp> = {
    mozaga: /^(EXO|EXI)[0-9a-f]{40}$/i,
    ethereum: /^0x[0-9a-f]{40}$/i,
    bitcoin: /^(?:bc1[023456789acdefghjklmnpqrstuvwxyz]{25,87}|[13][1-9A-HJ-NP-Za-km-z]{25,90})$/,
    solana: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
    tron: /^T[1-9A-HJ-NP-Za-km-z]{33}$/,
  }
  if (!patterns[chain].test(address)) throw new HttpError(400, 'invalid_request')
  return address
}

async function addressHash(chain: Chain, address: string): Promise<string> {
  return await sha256Hex(`${chain}\0${address}`)
}

interface WalletIndexActivationChallengeRow {
  activation_id: string
  owner_user_id: string
  owner_wallet_address: string
  chain: Chain
  address: string
  address_hash: string
  activation_nonce: string
  address_proof: unknown
  vdf_challenge_id: string | null
  vdf_nonce_hex: string | null
  vdf_binding_hash: string | null
  vdf_parameter_id: string | null
  vdf_created_at: Date | null
  vdf_expires_at: Date | null
  vdf_consumed_at: Date | null
  expires_at: Date
}

interface WalletIndexDeliveryRow {
  event_id: string
  chain: Chain
  address_hash: string
  lease_generation: number
  event_kind: 'snapshot' | 'transaction' | 'balance'
  payload: unknown
  created_at: Date
  expires_at: Date
}

interface WalletIndexActiveLeaseResponseRow {
  chain: Chain
  address: string
  lease_generation: number
  baseline_height: string
  activated_at: Date
  expires_at: Date
}

function randomHex(bytes: number): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(bytes)))
}

function assertExactFields(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!isRecord(value)) throw new HttpError(400, 'invalid_request')
  const keys = Object.keys(value).sort()
  if (keys.length !== fields.length || keys.some((key, index) => key !== fields[index])) {
    throw new HttpError(400, 'invalid_request')
  }
  return value
}

function parseActivationId(value: unknown): string {
  if (typeof value !== 'string' || !/^wia1\.[0-9a-f]{32}$/.test(value)) {
    throw new HttpError(400, 'invalid_request')
  }
  return value
}

function parseVdfProof(value: unknown): VdfProof {
  const proof = assertExactFields(value, ['algorithm', 'outputHex', 'parameterId', 'proofHex'])
  if (
    typeof proof.algorithm !== 'string' ||
    typeof proof.parameterId !== 'string' ||
    typeof proof.outputHex !== 'string' ||
    typeof proof.proofHex !== 'string'
  ) throw new HttpError(400, 'invalid_request')
  return {
    algorithm: proof.algorithm as VdfProof['algorithm'],
    parameterId: proof.parameterId,
    outputHex: proof.outputHex,
    proofHex: proof.proofHex,
  }
}

function requestForChallenge(
  principal: WalletPrincipal,
  row: WalletIndexActivationChallengeRow,
): WalletIndexActivationRequest {
  return {
    activationId: row.activation_id,
    ownerWalletAddress: principal.walletAddress,
    chain: row.chain,
    address: row.address,
    nonceHex: row.activation_nonce,
    expiresAt: row.expires_at.getTime(),
  }
}

function assertUsableActivationChallenge(
  principal: WalletPrincipal,
  row: WalletIndexActivationChallengeRow | undefined,
): asserts row is WalletIndexActivationChallengeRow {
  if (
    !row ||
    row.owner_user_id !== principal.userId ||
    row.owner_wallet_address !== principal.walletAddress ||
    row.vdf_consumed_at ||
    row.expires_at.getTime() <= Date.now()
  ) {
    throw new HttpError(409, 'wallet_index_activation_expired')
  }
}

function vdfChallengeResponse(
  row: WalletIndexActivationChallengeRow,
  params: VdfPublicParams,
): Record<string, unknown> {
  if (
    !row.vdf_challenge_id ||
    !row.vdf_nonce_hex ||
    !row.vdf_binding_hash ||
    !row.vdf_created_at ||
    !row.vdf_expires_at
  ) {
    throw new HttpError(409, 'wallet_index_activation_expired')
  }
  return {
    activationId: row.activation_id,
    vdfChallenge: {
      challengeId: row.vdf_challenge_id,
      nonceHex: row.vdf_nonce_hex,
      bindingHash: row.vdf_binding_hash,
      expiresAt: row.vdf_expires_at.getTime(),
      notBeforeAt: row.vdf_created_at.getTime() + VDF_MIN_CHALLENGE_AGE_MS,
      params,
    },
  }
}

export async function beginWalletIndexActivation(
  principal: WalletPrincipal,
  value: unknown,
): Promise<Record<string, unknown>> {
  const input = assertExactFields(value, ['address', 'chain'])
  const chain = normalizeChain(input.chain)
  const address = normalizeWalletIndexAddress(chain, input.address)
  const hash = await addressHash(chain, address)
  const now = new Date()
  const expiresAt = new Date(now.getTime() + activationChallengeTtlMs)

  return await db().begin(async (sql) => {
    await sql`
      delete from wallet_index_activation_challenges
      where owner_user_id=${principal.userId}
        and chain=${chain}
        and address_hash=${hash}
        and expires_at <= now()
    `
    const existing = await sql<WalletIndexActivationChallengeRow[]>`
      select activation_id, owner_user_id, owner_wallet_address, chain, address, address_hash,
        activation_nonce, address_proof, vdf_challenge_id, vdf_nonce_hex, vdf_binding_hash,
        vdf_parameter_id, vdf_created_at, vdf_expires_at, vdf_consumed_at, expires_at
      from wallet_index_activation_challenges
      where owner_user_id=${principal.userId}
        and chain=${chain}
        and address_hash=${hash}
        and vdf_consumed_at is null
      for update
    `
    const row = existing[0]
    if (row && row.expires_at.getTime() > now.getTime()) {
      return {
        activationId: row.activation_id,
        chain: row.chain,
        address: row.address,
        nonceHex: row.activation_nonce,
        expiresAt: row.expires_at.getTime(),
      }
    }

    const activationId = `wia1.${randomHex(16)}`
    const nonceHex = randomHex(32)
    await sql`
      insert into wallet_index_activation_challenges (
        activation_id, owner_user_id, owner_wallet_address, chain, address, address_hash,
        activation_nonce, expires_at
      ) values (
        ${activationId}, ${principal.userId}, ${principal.walletAddress}, ${chain}, ${address}, ${hash},
        ${nonceHex}, ${expiresAt}
      )
    `
    return { activationId, chain, address, nonceHex, expiresAt: expiresAt.getTime() }
  })
}

export async function issueWalletIndexActivationVdf(
  principal: WalletPrincipal,
  value: unknown,
): Promise<Record<string, unknown>> {
  const input = assertExactFields(value, ['activationId', 'addressProof'])
  const activationId = parseActivationId(input.activationId)
  const proof = parseWalletIndexAddressProof(input.addressProof)
  const params = loadConfig().discoveryVdf
  if (!params) throw new HttpError(503, 'vdf_unavailable')

  return await db().begin(async (sql) => {
    const rows = await sql<WalletIndexActivationChallengeRow[]>`
      select activation_id, owner_user_id, owner_wallet_address, chain, address, address_hash,
        activation_nonce, address_proof, vdf_challenge_id, vdf_nonce_hex, vdf_binding_hash,
        vdf_parameter_id, vdf_created_at, vdf_expires_at, vdf_consumed_at, expires_at
      from wallet_index_activation_challenges
      where activation_id=${activationId}
      for update
    `
    const row = rows[0]
    assertUsableActivationChallenge(principal, row)
    const request = requestForChallenge(principal, row)
    verifyWalletIndexAddressProof(request, proof)
    const bindingHash = walletIndexActivationBindingHash(request, proof)
    if (
      row.vdf_binding_hash === bindingHash &&
      row.vdf_challenge_id &&
      row.vdf_nonce_hex &&
      row.vdf_parameter_id === params.parameterId &&
      row.vdf_created_at &&
      row.vdf_expires_at &&
      row.vdf_expires_at.getTime() > Date.now()
    ) {
      return vdfChallengeResponse(row, params)
    }

    const createdAt = new Date()
    const vdfExpiresAt = new Date(Math.min(
      row.expires_at.getTime(),
      createdAt.getTime() + activationChallengeTtlMs,
    ))
    if (vdfExpiresAt.getTime() <= createdAt.getTime() + VDF_MIN_CHALLENGE_AGE_MS) {
      throw new HttpError(409, 'wallet_index_activation_expired')
    }
    const vdfChallengeId = `vdfc1.${randomHex(16)}`
    const vdfNonceHex = randomHex(32)
    await sql`
      update wallet_index_activation_challenges
      set address_proof=${sql.json(proof)},
          vdf_challenge_id=${vdfChallengeId},
          vdf_nonce_hex=${vdfNonceHex},
          vdf_binding_hash=${bindingHash},
          vdf_parameter_id=${params.parameterId},
          vdf_created_at=${createdAt},
          vdf_expires_at=${vdfExpiresAt}
      where activation_id=${row.activation_id}
    `
    return {
      activationId: row.activation_id,
      vdfChallenge: {
        challengeId: vdfChallengeId,
        nonceHex: vdfNonceHex,
        bindingHash,
        expiresAt: vdfExpiresAt.getTime(),
        notBeforeAt: createdAt.getTime() + VDF_MIN_CHALLENGE_AGE_MS,
        params,
      },
    }
  })
}

function verifyActivationVdf(
  row: WalletIndexActivationChallengeRow,
  params: VdfPublicParams,
  proof: VdfProof,
): void {
  if (
    !row.vdf_challenge_id ||
    !row.vdf_nonce_hex ||
    !row.vdf_binding_hash ||
    !row.vdf_created_at ||
    !row.vdf_expires_at ||
    row.vdf_parameter_id !== params.parameterId ||
    row.vdf_expires_at.getTime() <= Date.now()
  ) throw new HttpError(409, 'wallet_index_activation_expired')

  const remainingMs = row.vdf_created_at.getTime() + VDF_MIN_CHALLENGE_AGE_MS - Date.now()
  if (remainingMs > 0) {
    throw new HttpError(409, 'vdf_too_early', {
      'retry-after': String(Math.max(1, Math.ceil(remainingMs / 1_000))),
    })
  }
  if (
    !verifyVdf(params, {
      challengeId: row.vdf_challenge_id,
      nonceHex: row.vdf_nonce_hex,
      action: 'wallet_index_activation',
      bindingHash: row.vdf_binding_hash,
    }, proof)
  ) {
    throw new HttpError(400, 'invalid_vdf_proof')
  }
}

async function chainTip(chain: Chain): Promise<number> {
  const budget = new RPCBudget(Date.now() + chainTimeoutMs, 3)
  if (chain === 'tron') {
    return tronBlockHeight(await tronRPC('/wallet/getnowblock', {}, budget))
  }
  if (chain === 'bitcoin') {
    return safeInteger(await rpc(chain, 'getblockcount', [], budget), 'rpc_response_invalid')
  }
  if (chain === 'solana') {
    return safeInteger(
      await rpc(chain, 'getSlot', [{ commitment: 'finalized' }], budget),
      'rpc_response_invalid',
    )
  }
  return hexHeight(await rpc(chain, 'eth_blockNumber', [], budget))
}

export async function activateWalletIndex(
  principal: WalletPrincipal,
  value: unknown,
): Promise<Record<string, unknown>> {
  const input = assertExactFields(value, ['activationId', 'vdfProof'])
  const activationId = parseActivationId(input.activationId)
  const vdfProof = parseVdfProof(input.vdfProof)
  const params = loadConfig().discoveryVdf
  if (!params) throw new HttpError(503, 'vdf_unavailable')

  const preflight = await db()<WalletIndexActivationChallengeRow[]>`
    select activation_id, owner_user_id, owner_wallet_address, chain, address, address_hash,
      activation_nonce, address_proof, vdf_challenge_id, vdf_nonce_hex, vdf_binding_hash,
      vdf_parameter_id, vdf_created_at, vdf_expires_at, vdf_consumed_at, expires_at
    from wallet_index_activation_challenges
    where activation_id=${activationId}
  `
  const preflightRow = preflight[0]
  assertUsableActivationChallenge(principal, preflightRow)
  verifyActivationVdf(preflightRow, params, vdfProof)
  const baselineHeight = await chainTip(preflightRow.chain)
  const now = new Date()
  const expiresAt = new Date(now.getTime() + activationLeaseTtlMs)

  return await db().begin(async (sql) => {
    const rows = await sql<WalletIndexActivationChallengeRow[]>`
      select activation_id, owner_user_id, owner_wallet_address, chain, address, address_hash,
        activation_nonce, address_proof, vdf_challenge_id, vdf_nonce_hex, vdf_binding_hash,
        vdf_parameter_id, vdf_created_at, vdf_expires_at, vdf_consumed_at, expires_at
      from wallet_index_activation_challenges
      where activation_id=${activationId}
      for update
    `
    const row = rows[0]
    assertUsableActivationChallenge(principal, row)
    verifyActivationVdf(row, params, vdfProof)
    if (!row.address_proof) throw new HttpError(409, 'wallet_index_activation_expired')

    const proof = parseWalletIndexAddressProof(row.address_proof)
    verifyWalletIndexAddressProof(requestForChallenge(principal, row), proof)
    await sql`
      insert into wallet_index_addresses (
        address_hash, chain, address, metadata, created_at, updated_at
      ) values (
        ${row.address_hash}, ${row.chain}, ${row.address}, ${sql.json({})}, now(), now()
      )
      on conflict (address_hash) do update
      set address=excluded.address, updated_at=now()
    `
    const existingLeases = await sql<{
      lease_id: string
      lease_generation: number
    }[]>`
      select lease_id, lease_generation
      from wallet_index_activation_leases
      where owner_user_id=${principal.userId}
        and chain=${row.chain}
        and address_hash=${row.address_hash}
      for update
    `
    const existingLease = existingLeases[0]
    const hasOtherActiveLease = await sql<{ exists: boolean }[]>`
      select exists(
        select 1
        from wallet_index_activation_leases
        where chain=${row.chain}
          and address_hash=${row.address_hash}
          and expires_at > now()
          ${existingLease ? sql`and lease_id <> ${existingLease.lease_id}` : sql``}
      ) as exists
    `
    if (!hasOtherActiveLease[0]?.exists) {
      await sql`
        delete from wallet_index_external_history_cursors
        where chain=${row.chain} and address_hash=${row.address_hash}
      `
      await sql`
        delete from wallet_index_history_status
        where chain=${row.chain} and address_hash=${row.address_hash}
      `
      await sql`
        delete from wallet_index_balance_snapshots
        where chain=${row.chain} and address_hash=${row.address_hash}
      `
    }
    if (existingLease) {
      await sql`
        delete from wallet_index_delivery_events where lease_id=${existingLease.lease_id}
      `
    }
    const leaseId = existingLease?.lease_id ?? `wil1.${randomHex(16)}`
    const leaseGeneration = (existingLease?.lease_generation ?? 0) + 1
    await sql`
      insert into wallet_index_activation_leases (
        lease_id, owner_user_id, owner_wallet_address, chain, address_hash, address,
        lease_generation, baseline_height, activated_at, last_chain_activity_at,
        expires_at, initial_snapshot_pending, updated_at
      ) values (
        ${leaseId}, ${principal.userId}, ${principal.walletAddress}, ${row.chain}, ${row.address_hash},
        ${row.address}, ${leaseGeneration}, ${baselineHeight}, ${now}, ${now}, ${expiresAt}, true, now()
      )
      on conflict (owner_user_id, chain, address_hash) do update set
        lease_generation=excluded.lease_generation,
        baseline_height=excluded.baseline_height,
        activated_at=excluded.activated_at,
        last_chain_activity_at=excluded.last_chain_activity_at,
        expires_at=excluded.expires_at,
        initial_snapshot_pending=true,
        updated_at=excluded.updated_at
    `
    await sql`
      update wallet_index_activation_challenges
      set vdf_consumed_at=now()
      where activation_id=${row.activation_id} and vdf_consumed_at is null
    `
    return {
      chain: row.chain,
      address: row.address,
      baselineHeight,
      leaseGeneration,
      activatedAt: now.getTime(),
      expiresAt: expiresAt.getTime(),
    }
  })
}

export async function walletIndexDeliveries(
  principal: WalletPrincipal,
  url: URL,
): Promise<Record<string, unknown>> {
  const rawLimit = Number(url.searchParams.get('limit') || String(maxDeliveryBatch))
  const limit = Number.isSafeInteger(rawLimit) && rawLimit > 0
    ? Math.min(rawLimit, maxDeliveryBatch)
    : maxDeliveryBatch
  const [rows, activeLeases] = await Promise.all([
    db()<WalletIndexDeliveryRow[]>`
      select events.event_id, events.chain, events.address_hash, events.lease_generation,
        events.event_kind, events.payload, events.created_at, events.expires_at
      from wallet_index_delivery_events events
      join wallet_index_activation_leases leases on leases.lease_id=events.lease_id
      where events.owner_user_id=${principal.userId}
        and leases.owner_user_id=${principal.userId}
        and leases.expires_at > now()
        and events.expires_at > now()
      order by events.created_at asc, events.event_id asc
      limit ${limit}
    `,
    db()<WalletIndexActiveLeaseResponseRow[]>`
      select chain, address, lease_generation, baseline_height::text, activated_at, expires_at
      from wallet_index_activation_leases
      where owner_user_id=${principal.userId} and expires_at > now()
      order by chain asc, address_hash asc
    `,
  ])
  return {
    events: rows.map((row) => ({
      eventId: row.event_id,
      chain: row.chain,
      addressHash: row.address_hash,
      leaseGeneration: row.lease_generation,
      kind: row.event_kind,
      payload: row.payload,
      createdAt: row.created_at.getTime(),
      expiresAt: row.expires_at.getTime(),
    })),
    activeLeases: activeLeases.map((lease) => ({
      chain: lease.chain,
      address: lease.address,
      leaseGeneration: lease.lease_generation,
      baselineHeight: numericHeight(lease.baseline_height),
      activatedAt: lease.activated_at.getTime(),
      expiresAt: lease.expires_at.getTime(),
    })),
  }
}

export async function acknowledgeWalletIndexDeliveries(
  principal: WalletPrincipal,
  value: unknown,
): Promise<Record<string, unknown>> {
  const input = assertExactFields(value, ['eventIds'])
  if (!Array.isArray(input.eventIds) || input.eventIds.length > maxDeliveryBatch) {
    throw new HttpError(400, 'invalid_request')
  }
  const eventIds = [...new Set(input.eventIds)]
  if (
    eventIds.some((eventId) => typeof eventId !== 'string' || !/^wie1\.[0-9a-f]{32}$/.test(eventId))
  ) throw new HttpError(400, 'invalid_request')
  if (eventIds.length === 0) return { acknowledgedEventIds: [] }
  const rows = await db()<{ event_id: string }[]>`
    delete from wallet_index_delivery_events
    where owner_user_id=${principal.userId} and event_id = any(${eventIds as string[]})
    returning event_id
  `
  return { acknowledgedEventIds: rows.map((row) => row.event_id) }
}

interface RunRequest {
  chains?: unknown
  limit?: unknown
  mode?: unknown
  runId?: unknown
}

export async function runWalletWorker(input: RunRequest): Promise<Record<string, unknown>> {
  await expireWalletIndexState()
  await expireStaleRuns()
  const selected =
    input.chains === undefined || (Array.isArray(input.chains) && input.chains.length === 0)
      ? [...chains]
      : Array.isArray(input.chains) && input.chains.length <= chains.length
      ? [...new Set(input.chains.map(normalizeChain))]
      : (() => {
        throw new HttpError(400, 'invalid_request')
      })()
  const limit = input.limit === undefined
    ? 50
    : Number.isSafeInteger(input.limit)
    ? (input.limit as number) <= 0 ? 50 : Math.min(input.limit as number, 200)
    : (() => {
      throw new HttpError(400, 'invalid_request')
    })()
  const mode = normalizeRunMode(input.mode)
  const runId = typeof input.runId === 'string' ? input.runId.trim() : ''
  if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(runId)) throw new HttpError(400, 'invalid_request')
  if (mode === 'backfill') {
    return {
      summaries: selected.map((chain) => ({ ...emptySummary(chain), skipped: 1 })),
    }
  }
  const deadline = Date.now() + invocationTimeoutMs
  const summaries: ChainSummary[] = []
  for (const chain of selected) {
    if (Date.now() >= deadline) {
      summaries.push(
        await recordUnstartedRun(chain, mode, runId, selected, 'invocation_deadline_exceeded'),
      )
      continue
    }
    summaries.push(await runChain(chain, mode, limit, runId, selected, deadline))
  }
  return { summaries }
}

async function expireWalletIndexState(): Promise<void> {
  await db().begin(async (sql) => {
    await sql`delete from wallet_index_delivery_events where expires_at <= now()`
    await sql`delete from wallet_index_activation_leases where expires_at <= now()`
    await sql`delete from wallet_index_activation_challenges where expires_at <= now()`
    await sql`
      delete from wallet_index_wakeup_throttles throttles
      where not exists (
        select 1
        from wallet_index_activation_leases leases
        where leases.owner_user_id=throttles.owner_user_id
          and leases.expires_at > now()
      )
    `
    await sql`
      delete from wallet_index_addresses addresses
      where not exists (
        select 1
        from wallet_index_activation_leases leases
        where leases.chain=addresses.chain
          and leases.address_hash=addresses.address_hash
          and leases.address=addresses.address
      )
    `
  })
}

function normalizeRunMode(value: unknown): RunMode {
  if (value === 'balances' || value === 'transactions' || value === 'all' || value === 'backfill') {
    return value
  }
  throw new HttpError(400, 'invalid_request')
}

function emptySummary(chain: Chain): ChainSummary {
  return {
    chain,
    scanned: 0,
    updated: 0,
    transactions: 0,
    tokenTransfers: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  }
}

function runStatus(summary: ChainSummary, fatal = false): RunStatus {
  if (fatal) return 'failed'
  if (summary.skipped > 0 && summary.scanned === 0 && summary.failed === 0) return 'skipped'
  if (summary.failed > 0 || summary.errors.length > 0) return 'completed_with_errors'
  return 'completed'
}

function addError(summary: ChainSummary, code: string): void {
  if (summary.errors.length < maxErrors && !summary.errors.includes(code)) summary.errors.push(code)
}

function safeErrorCode(error: unknown): string {
  if (error instanceof SafeWorkerError) return error.code
  if (error instanceof TronHistoryError) return error.code
  if (error instanceof HttpError) return error.code
  if (rpcRequestTimedOut(error)) return 'rpc_timeout'
  return 'wallet_index_failed'
}

async function recordUnstartedRun(
  chain: Chain,
  mode: RunMode,
  runId: string,
  requestedChains: Chain[],
  code: string,
): Promise<ChainSummary> {
  const summary = emptySummary(chain)
  summary.failed = 1
  addError(summary, code)
  await persistRunStart(chain, mode, runId, requestedChains)
  await persistRunFinish(runId, summary, 'failed')
  return summary
}

async function runChain(
  chain: Chain,
  mode: RunMode,
  requestedLimit: number,
  runId: string,
  requestedChains: Chain[],
  invocationDeadline: number,
): Promise<ChainSummary> {
  const summary = emptySummary(chain)
  await persistRunStart(chain, mode, runId, requestedChains)
  const lockCursor: CursorName = mode === 'balances'
    ? 'balance_indexer_run'
    : 'transaction_indexer_run'
  const locked = await db()`
    insert into wallet_index_cursors
      (chain, cursor_name, run_id, locked_at, lock_expires_at, updated_at)
    values (
      ${chain}, ${lockCursor}, ${runId}, now(),
      now() + (${lockDurationSeconds} * interval '1 second'), now()
    )
    on conflict (chain, cursor_name) do update set
      run_id=excluded.run_id, locked_at=excluded.locked_at,
      lock_expires_at=excluded.lock_expires_at, updated_at=now()
    where wallet_index_cursors.locked_at is null
      or wallet_index_cursors.lock_expires_at is null
      or wallet_index_cursors.lock_expires_at <= now()
    returning chain, run_id
  `
  if (!locked[0]) {
    summary.skipped = 1
    await persistRunFinish(runId, summary, 'skipped')
    return summary
  }

  let fatal = false
  try {
    const chainDeadline = Math.min(invocationDeadline, Date.now() + chainTimeoutMs)
    const budget = new RPCBudget(chainDeadline, maxRPCRequestsPerChain)
    const effectiveLimit = Math.min(
      requestedLimit,
      mode === 'all'
        ? Math.min(maxBalanceAddresses[chain], maxTransactionAddresses[chain])
        : mode === 'balances'
        ? maxBalanceAddresses[chain]
        : maxTransactionAddresses[chain],
      chain === 'mozaga' && mode !== 'balances'
        ? mozagaExplorerAddressBatch
        : Number.MAX_SAFE_INTEGER,
    )
    const rows = await listIndexAddresses(chain, effectiveLimit, mode)
    summary.scanned = rows.length
    if (mode === 'balances') {
      await runBalances(chain, rows, budget, summary)
    } else if (mode === 'transactions' || mode === 'backfill') {
      await runTransactions(chain, rows, mode, budget, summary, true)
    } else {
      const reportBalanceFailure = (error: unknown) => {
        summary.failed++
        addError(summary, safeErrorCode(error))
      }
      if (chain === 'bitcoin') {
        await runBitcoinAllModeWork(
          () => runTransactions(chain, rows, mode, budget, summary, false),
          () => runBalances(chain, rows, budget, summary),
          reportBalanceFailure,
        )
      } else {
        await runAllModeWork(
          () => runBalances(chain, rows, budget, summary),
          () => runTransactions(chain, rows, mode, budget, summary, false),
          reportBalanceFailure,
        )
      }
    }
  } catch (error) {
    fatal = true
    summary.failed++
    addError(summary, safeErrorCode(error))
  } finally {
    const status = runStatus(summary, fatal)
    const firstError = summary.errors[0] ?? null
    try {
      await releaseCursor(chain, lockCursor, runId, status, firstError)
    } catch (error) {
      fatal = true
      summary.failed++
      addError(summary, safeErrorCode(error))
    }
    await persistRunFinish(runId, summary, runStatus(summary, fatal))
  }
  return summary
}

export async function runAllModeWork(
  runBalances: () => Promise<void>,
  runTransactions: () => Promise<void>,
  onBalanceFailure: (error: unknown) => void,
): Promise<void> {
  try {
    await runBalances()
  } catch (error) {
    onBalanceFailure(error)
  }
  await runTransactions()
}

export async function runBitcoinAllModeWork(
  runTransactions: () => Promise<void>,
  runBalances: () => Promise<void>,
  onBalanceFailure: (error: unknown) => void,
): Promise<void> {
  await runTransactions()
  try {
    await runBalances()
  } catch (error) {
    onBalanceFailure(error)
  }
}

async function persistRunStart(
  chain: Chain,
  mode: RunMode,
  runId: string,
  requestedChains: Chain[],
): Promise<void> {
  const existing = await db()<{
    mode: string
    requested_chains: string[]
  }[]>`
    select mode, requested_chains
    from wallet_indexer_runs
    where run_id=${runId} and chain=${chain}
  `
  if (
    existing[0] &&
    (existing[0].mode !== mode ||
      existing[0].requested_chains.join('\0') !== requestedChains.join('\0'))
  ) throw new HttpError(409, 'wallet_index_run_conflict')
  await db()`
    insert into wallet_indexer_runs (
      run_id, chain, mode, requested_chains, started_at, status
    ) values (
      ${runId}, ${chain}, ${mode}, ${requestedChains}, now(), 'running'
    )
    on conflict (run_id, chain) do update set
      finished_at=null,
      status='running',
      scanned=0,
      updated=0,
      transactions=0,
      token_transfers=0,
      failed=0,
      skipped=0,
      error=null
  `
}

async function expireStaleRuns(): Promise<void> {
  await db()`
    update wallet_indexer_runs run
    set
      finished_at=now(),
      status='failed',
      failed=greatest(run.failed, 1),
      error=coalesce(run.error, 'invocation_deadline_exceeded')
    where run.status='running'
      and run.started_at < now() - (${lockDurationSeconds} * interval '2 seconds')
      and not exists (
        select 1
        from wallet_index_cursors cursor
        where cursor.chain=run.chain
          and cursor.run_id=run.run_id
          and cursor.lock_expires_at > now()
      )
  `
}

async function persistRunFinish(
  runId: string,
  summary: ChainSummary,
  status: RunStatus,
): Promise<void> {
  await db()`
    update wallet_indexer_runs set
      finished_at=now(),
      status=${status},
      scanned=${summary.scanned},
      updated=${summary.updated},
      transactions=${summary.transactions},
      token_transfers=${summary.tokenTransfers},
      failed=${summary.failed},
      skipped=${summary.skipped},
      error=${summary.errors[0] ?? null}
    where run_id=${runId} and chain=${summary.chain}
  `
}

async function releaseCursor(
  chain: Chain,
  cursor: CursorName,
  runId: string,
  status: RunStatus,
  error: string | null,
): Promise<void> {
  const released = await db()`
    update wallet_index_cursors set
      run_id=null,
      locked_at=null,
      lock_expires_at=null,
      latest_status=${status},
      latest_error=${error},
      updated_at=now()
    where chain=${chain} and cursor_name=${cursor} and run_id=${runId}
      and locked_at is not null
    returning chain
  `
  if (!released[0]) throw new SafeWorkerError('wallet_index_lock_lost')
}

async function listIndexAddresses(
  chain: Chain,
  limit: number,
  _mode: RunMode,
): Promise<AddressRow[]> {
  return await db()<AddressRow[]>`
    select addresses.address_hash, addresses.address, addresses.metadata
    from wallet_index_addresses addresses
    where addresses.chain=${chain}
      and exists (
        select 1
        from wallet_index_activation_leases leases
        where leases.chain=addresses.chain
          and leases.address_hash=addresses.address_hash
          and leases.address=addresses.address
          and leases.expires_at > now()
      )
    order by addresses.last_indexed_at asc nulls first, addresses.updated_at asc, addresses.address_hash asc
    limit ${limit}
  `
}

class SafeWorkerError extends Error {
  constructor(readonly code: string) {
    super(code)
  }
}

class RPCBudget {
  private requests = 0
  private nextRequestAt = 0

  constructor(
    readonly deadline: number,
    private readonly maxRequests: number,
  ) {}

  async beforeRequest(): Promise<void> {
    if (Date.now() >= this.deadline) throw new SafeWorkerError('chain_deadline_exceeded')
    if (++this.requests > this.maxRequests) throw new SafeWorkerError('rpc_budget_exhausted')
    const wait = this.nextRequestAt - Date.now()
    this.nextRequestAt = Math.max(Date.now(), this.nextRequestAt) + 50
    if (wait > 0) await this.sleep(wait)
  }

  remainingMs(): number {
    return Math.max(0, this.deadline - Date.now())
  }

  remainingRequests(): number {
    return Math.max(0, this.maxRequests - this.requests)
  }

  async sleep(ms: number): Promise<void> {
    const bounded = Math.min(ms, this.remainingMs())
    if (bounded <= 0) throw new SafeWorkerError('chain_deadline_exceeded')
    await new Promise((resolve) => setTimeout(resolve, bounded))
    if (Date.now() >= this.deadline) throw new SafeWorkerError('chain_deadline_exceeded')
  }
}

function rpcEndpoint(chain: Chain): URL {
  const names: Record<Chain, string> = {
    mozaga: 'MOZAGA_RPC_URL',
    ethereum: 'ETH_RPC_URL',
    bitcoin: 'BITCOIN_RPC_URL',
    solana: 'SOLANA_RPC_URL',
    tron: 'TRON_RPC_URL',
  }
  const value = optionalEnv(names[chain])
  if (!value) throw new HttpError(503, 'wallet_index_not_configured')
  let endpoint: URL
  try {
    endpoint = new URL(value)
  } catch {
    throw new HttpError(503, 'invalid_configuration')
  }
  if (
    endpoint.username || endpoint.password || endpoint.search || endpoint.hash ||
    (endpoint.protocol !== 'https:' &&
      !(endpoint.protocol === 'http:' && isPrivateOrLocalHost(endpoint.hostname)))
  ) throw new HttpError(503, 'invalid_configuration')
  if (
    !isPrivateOrLocalHost(endpoint.hostname) &&
    optionalEnv('SPECTRA_WALLET_INDEX_TRUSTED_BALANCE_RPC') !== 'true'
  ) throw new HttpError(503, 'wallet_index_rpc_not_trusted')
  if (chain === 'tron') return tronBaseURL(endpoint)
  return endpoint
}

function isPrivateOrLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return true
  if (
    host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')
  ) {
    return true
  }
  const parts = host.split('.')
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return false
  const octets = parts.map(Number)
  if (octets.some((part) => part > 255)) return false
  return octets[0] === 10 || octets[0] === 127 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1]! >= 16 && octets[1]! <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
}

export function tronBaseURL(endpoint: URL): URL {
  const normalized = new URL(endpoint)
  normalized.pathname = normalized.pathname
    .replace(/\/(?:walletsolidity|wallet)\/[^/]+\/?$/i, '')
    .replace(/\/(walletsolidity|wallet|jsonrpc)\/?$/i, '')
  normalized.pathname = normalized.pathname.replace(/\/+$/, '')
  return normalized
}

async function rpc(
  chain: Exclude<Chain, 'tron'>,
  method: string,
  params: unknown[],
  budget: RPCBudget,
  maxResponseBytes = normalRPCResponseBytes,
): Promise<unknown> {
  if (!rpcMethods[chain].has(method)) throw new SafeWorkerError('rpc_method_not_allowed')
  const endpoint = rpcEndpoint(chain)
  return await postRPC(
    chain,
    endpoint,
    { jsonrpc: '2.0', id: 1, method: upstreamRPCMethod(chain, method), params },
    budget,
    maxResponseBytes,
    true,
    chain === 'solana',
  )
}

async function tronRPC(
  path: string,
  body: unknown,
  budget: RPCBudget,
): Promise<unknown> {
  if (!tronPaths.has(path)) throw new SafeWorkerError('rpc_method_not_allowed')
  const endpoint = rpcEndpoint('tron')
  endpoint.pathname = `${endpoint.pathname}${path}`
  return assertTronResponse(
    await postRPC('tron', endpoint, body, budget, normalRPCResponseBytes, false, true),
  )
}

async function postRPC(
  chain: Chain,
  endpoint: URL,
  payload: unknown,
  budget: RPCBudget,
  maxResponseBytes: number,
  envelope: boolean,
  preserveUnsafeIntegers: boolean,
): Promise<unknown> {
  const encoded = JSON.stringify(payload)
  if (new TextEncoder().encode(encoded).byteLength > maxRPCRequestBytes) {
    throw new SafeWorkerError('rpc_request_too_large')
  }
  for (let attempt = 0; attempt <= rpcRetryAttempts; attempt++) {
    await budget.beforeRequest()
    const timeout = Math.min(rpcTimeoutMs, budget.remainingMs())
    if (timeout <= 0) throw new SafeWorkerError('chain_deadline_exceeded')
    const startedAt = Date.now()
    let response: Response
    try {
      const controller = new AbortController()
      response = await settleBeforeDeadline(
        fetch(endpoint, {
          method: 'POST',
          headers: rpcHeaders(chain),
          body: encoded,
          redirect: 'error',
          signal: controller.signal,
        }),
        timeout,
        () => controller.abort(),
      )
    } catch (error) {
      if (attempt < rpcRetryAttempts && !rpcRequestTimedOut(error)) {
        await budget.sleep(retryDelay(null, attempt))
        continue
      }
      throw new SafeWorkerError(
        chain === 'bitcoin' ? rpcTransportErrorCode(error) : 'rpc_request_failed',
      )
    }
    if (response.status === 429 && attempt < rpcRetryAttempts) {
      await discardLimited(response, 512, Math.min(1_000, budget.remainingMs()))
      await budget.sleep(retryDelay(response.headers.get('retry-after'), attempt))
      continue
    }
    if (!response.ok) {
      await discardLimited(response, 512, Math.min(1_000, budget.remainingMs()))
      if (response.status >= 500 && response.status <= 599 && attempt < rpcRetryAttempts) {
        await budget.sleep(retryDelay(null, attempt))
        continue
      }
      throw new SafeWorkerError(
        chain === 'bitcoin' ? rpcHTTPErrorCode(response.status) : 'rpc_request_failed',
      )
    }
    let bytes: Uint8Array
    try {
      bytes = await readBoundedBody(
        response,
        maxResponseBytes,
        Math.min(budget.remainingMs(), Math.max(0, timeout - (Date.now() - startedAt))),
      )
    } catch (error) {
      if (error instanceof SafeWorkerError) throw error
      if (chain === 'bitcoin') throw new SafeWorkerError(rpcTransportErrorCode(error))
      throw error
    }
    let value: unknown
    try {
      let text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      if (preserveUnsafeIntegers) text = quoteUnsafeJSONIntegers(text)
      value = JSON.parse(text)
    } catch {
      throw new SafeWorkerError('rpc_response_invalid')
    }
    if (!envelope) return value
    return parseRPCEnvelope(chain, value)
  }
  throw new SafeWorkerError('rpc_request_failed')
}

export async function settleBeforeDeadline<T>(
  operation: Promise<T>,
  timeoutMs: number,
  cancel: () => void,
): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      cancel()
      reject(new DOMException('RPC request timed out', 'TimeoutError'))
    }, timeoutMs)
    void operation.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

export function parseRPCEnvelope(
  chain: Chain,
  value: unknown,
): unknown {
  if (!isRecord(value)) throw new SafeWorkerError('rpc_response_invalid')
  const allowed = new Set(['jsonrpc', 'id', 'result', 'error'])
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new SafeWorkerError('rpc_response_invalid')
  }
  if (
    chain === 'bitcoin' &&
    ((value.jsonrpc !== undefined && value.jsonrpc !== '2.0') || value.id !== 1)
  ) throw new SafeWorkerError('rpc_response_invalid')
  if (value.error !== undefined && value.error !== null) {
    if (chain === 'bitcoin' && !isRecord(value.error)) {
      throw new SafeWorkerError('rpc_response_invalid')
    }
    throw new SafeWorkerError(rpcErrorCode(value.error))
  }
  if (!Object.hasOwn(value, 'result')) throw new SafeWorkerError('rpc_response_invalid')
  return value.result
}

export function rpcHTTPErrorCode(status: number): string {
  if (status === 401 || status === 403) return 'rpc_unauthorized'
  if (status === 408 || status === 504) return 'rpc_timeout'
  if (status === 429) return 'rpc_rate_limited'
  if (status >= 500 && status <= 599) return 'rpc_upstream_unavailable'
  return 'rpc_request_rejected'
}

function rpcTransportErrorCode(error: unknown): string {
  return rpcRequestTimedOut(error) ? 'rpc_timeout' : 'rpc_request_failed'
}

function rpcRequestTimedOut(error: unknown): boolean {
  return error instanceof DOMException &&
    (error.name === 'AbortError' || error.name === 'TimeoutError')
}

function quoteUnsafeJSONIntegers(value: string): string {
  const chunks: string[] = []
  let copiedThrough = 0
  let inString = false
  let escaped = false
  for (let index = 0; index < value.length; index++) {
    const character = value[index]!
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (character === '\\') {
        escaped = true
      } else if (character === '"') {
        inString = false
      }
      continue
    }
    if (character === '"') {
      inString = true
      continue
    }
    const negative = character === '-' && index + 1 < value.length &&
      value.charCodeAt(index + 1) >= 48 && value.charCodeAt(index + 1) <= 57
    const digit = value.charCodeAt(index) >= 48 && value.charCodeAt(index) <= 57
    if (!digit && !negative) continue
    const start = index
    if (negative) index++
    while (
      index + 1 < value.length &&
      value.charCodeAt(index + 1) >= 48 &&
      value.charCodeAt(index + 1) <= 57
    ) index++
    const end = index + 1
    if (end < value.length && (value[end] === '.' || value[end] === 'e' || value[end] === 'E')) {
      let numericEnd = end
      if (value[numericEnd] === '.') {
        numericEnd++
        while (
          numericEnd < value.length &&
          value.charCodeAt(numericEnd) >= 48 &&
          value.charCodeAt(numericEnd) <= 57
        ) numericEnd++
      }
      if (value[numericEnd] === 'e' || value[numericEnd] === 'E') {
        numericEnd++
        if (value[numericEnd] === '+' || value[numericEnd] === '-') numericEnd++
        while (
          numericEnd < value.length &&
          value.charCodeAt(numericEnd) >= 48 &&
          value.charCodeAt(numericEnd) <= 57
        ) numericEnd++
      }
      index = numericEnd - 1
      continue
    }
    const rawUnsigned = value.slice(negative ? start + 1 : start, end)
    if (rawUnsigned.length > 1 && rawUnsigned[0] === '0') continue
    const unsigned = rawUnsigned
    if (
      unsigned.length < 16 ||
      (unsigned.length === 16 && unsigned <= String(Number.MAX_SAFE_INTEGER))
    ) continue
    chunks.push(value.slice(copiedThrough, start), `"${value.slice(start, end)}"`)
    copiedThrough = end
  }
  if (chunks.length === 0) return value
  chunks.push(value.slice(copiedThrough))
  return chunks.join('')
}

function rpcErrorCode(value: unknown): string {
  if (
    isRecord(value) && value.code === -8 && typeof value.message === 'string' &&
    value.message.toLowerCase().includes('scan already in progress')
  ) return 'bitcoin_scan_in_progress'
  return 'rpc_response_error'
}

export async function readBoundedBody(
  response: Response,
  maxBytes: number,
  timeoutMs = rpcTimeoutMs,
): Promise<Uint8Array> {
  const declared = response.headers.get('content-length')
  if (declared !== null) {
    const size = Number(declared)
    if (!Number.isSafeInteger(size) || size < 0 || size > maxBytes) {
      throw new SafeWorkerError('rpc_response_too_large')
    }
  }
  const reader = response.body?.getReader()
  if (!reader) return new Uint8Array()
  const chunks: Uint8Array[] = []
  let total = 0
  const deadline = Date.now() + timeoutMs
  try {
    while (true) {
      const remaining = deadline - Date.now()
      if (remaining <= 0) {
        void reader.cancel().catch(() => {})
        throw new DOMException('RPC response timed out', 'TimeoutError')
      }
      const { done, value } = await settleBeforeDeadline(
        reader.read(),
        remaining,
        () => {
          void reader.cancel().catch(() => {})
        },
      )
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        throw new SafeWorkerError('rpc_response_too_large')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

async function discardLimited(
  response: Response,
  maxBytes: number,
  timeoutMs: number,
): Promise<void> {
  try {
    await readBoundedBody(response, maxBytes, timeoutMs)
  } catch {
    try {
      await response.body?.cancel()
    } catch {
      // Deliberately discard all upstream details.
    }
  }
}

function retryDelay(value: string | null, attempt: number): number {
  if (value) {
    const seconds = Number(value)
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, maxRetryAfterMs)
    const at = Date.parse(value)
    if (Number.isFinite(at)) return Math.max(0, Math.min(at - Date.now(), maxRetryAfterMs))
  }
  return Math.min(rpcRetryBaseMs * 2 ** attempt, maxRetryAfterMs)
}

async function runBalances(
  chain: Chain,
  rows: AddressRow[],
  budget: RPCBudget,
  summary: ChainSummary,
): Promise<void> {
  if (rows.length === 0) return
  if (chain === 'bitcoin') {
    try {
      const balances = await bitcoinBalances(rows, budget)
      for (const row of rows) {
        const balance = balances.get(row.address_hash)
        if (!balance) throw new SafeWorkerError('balance_response_incomplete')
        await saveBalance(chain, row, balance)
        summary.updated++
      }
    } catch (error) {
      summary.failed += rows.length
      addError(summary, safeErrorCode(error))
      await saveBalanceFailures(chain, rows, safeErrorCode(error))
    }
    return
  }
  let sharedHeight: number | undefined
  if (chain === 'solana') {
    sharedHeight = safeInteger(
      await rpc('solana', 'getSlot', [{ commitment: 'finalized' }], budget),
      'rpc_response_invalid',
    )
  } else if (chain === 'tron') {
    sharedHeight = tronBlockHeight(await tronRPC('/wallet/getnowblock', {}, budget))
  }
  for (const row of rows) {
    try {
      const balance = await fetchBalance(chain, row.address, budget, sharedHeight)
      await saveBalance(chain, row, balance)
      summary.updated++
    } catch (error) {
      summary.failed++
      const code = safeErrorCode(error)
      addError(summary, code)
      await saveBalanceFailures(chain, [row], code)
    }
  }
}

interface ActiveLeaseRow {
  lease_id: string
  owner_user_id: string
  owner_wallet_address: string
  lease_generation: number
  baseline_height: string
  activated_at: Date
  expires_at: Date
  initial_snapshot_pending: boolean
}

async function activeLeasesForAddress(
  sql: Database,
  chain: Chain,
  addressHash: string,
): Promise<ActiveLeaseRow[]> {
  return await sql<ActiveLeaseRow[]>`
    select lease_id, owner_user_id, owner_wallet_address, lease_generation,
      baseline_height::text, activated_at, expires_at, initial_snapshot_pending
    from wallet_index_activation_leases
    where chain=${chain} and address_hash=${addressHash} and expires_at > now()
    for update
  `
}

async function enqueueWalletIndexWakeup(
  sql: Database,
  ownerUserId: string,
  ownerWalletAddress: string,
): Promise<void> {
  await sql`
    select pgmq.send(
      'wallet_index_wakeups',
      ${sql.json({ version: 1, ownerUserId, ownerWalletAddress })}
    )
  `
}

async function insertWalletIndexDeliveryEvent(
  sql: Database,
  lease: Pick<
    ActiveLeaseRow,
    'lease_id' | 'owner_user_id' | 'owner_wallet_address' | 'lease_generation'
  >,
  chain: Chain,
  addressHash: string,
  kind: 'snapshot' | 'transaction' | 'balance',
  eventKey: string,
  payload: Record<string, unknown>,
  notify = false,
): Promise<void> {
  const expiresAt = new Date(Date.now() + deliveryEventTtlMs)
  const inserted = await sql<{ event_id: string }[]>`
    insert into wallet_index_delivery_events (
      event_id, lease_id, owner_user_id, chain, address_hash, lease_generation,
      event_kind, event_key, payload, expires_at
    ) values (
      ${`wie1.${
    randomHex(16)
  }`}, ${lease.lease_id}, ${lease.owner_user_id}, ${chain}, ${addressHash},
      ${lease.lease_generation}, ${kind}, ${eventKey}, ${sql.json(payload)}, ${expiresAt}
    )
    on conflict (lease_id, lease_generation, event_key) do nothing
    returning event_id
  `
  if (inserted[0] && notify) {
    await enqueueWalletIndexWakeup(sql, lease.owner_user_id, lease.owner_wallet_address)
  }
}

async function replacePendingBalanceDelivery(
  sql: Database,
  lease: Pick<
    ActiveLeaseRow,
    'lease_id' | 'owner_user_id' | 'owner_wallet_address' | 'lease_generation'
  >,
  chain: Chain,
  addressHash: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await sql`
    delete from wallet_index_delivery_events
    where lease_id=${lease.lease_id}
      and lease_generation=${lease.lease_generation}
      and event_kind='balance'
  `
  await insertWalletIndexDeliveryEvent(
    sql,
    lease,
    chain,
    addressHash,
    'balance',
    `balance:${lease.lease_generation}`,
    payload,
  )
}

function balancePayload(
  chain: Chain,
  address: string,
  balance: BalanceResult,
  expiresAt: Date,
): Record<string, unknown> {
  return {
    chain,
    address,
    balance: {
      nativeBalanceAtomic: balance.nativeBalanceAtomic,
      nativeSymbol: balance.nativeSymbol,
      tokenBalances: balance.tokenBalances,
      blockHeight: balance.blockHeight,
      updatedAt: Date.now(),
    },
    leaseExpiresAt: expiresAt.getTime(),
  }
}

async function saveBalance(
  chain: Chain,
  row: AddressRow,
  balance: BalanceResult,
): Promise<void> {
  await db().begin(async (sql) => {
    const leases = await activeLeasesForAddress(sql, chain, row.address_hash)
    const previous = await sql<BalanceSnapshotRow[]>`
      select native_balance_atomic, native_symbol, token_balances
      from wallet_index_balance_snapshots
      where chain=${chain} and address_hash=${row.address_hash}
      for update
    `
    const balanceChanged = hasMeaningfulBalanceChange(previous[0], balance)
    await sql`
      insert into wallet_index_balance_snapshots (
        chain, address_hash, updated_at, native_balance_atomic, native_symbol,
        token_balances, block_height
      ) values (
        ${chain}, ${row.address_hash}, now(),
        ${balance.nativeBalanceAtomic}, ${balance.nativeSymbol},
        ${sql.json(balance.tokenBalances)}, ${balance.blockHeight}
      )
      on conflict (chain, address_hash) do update set
        updated_at=excluded.updated_at,
        native_balance_atomic=excluded.native_balance_atomic,
        native_symbol=excluded.native_symbol,
        token_balances=excluded.token_balances,
        block_height=excluded.block_height
    `
    await sql`
      insert into wallet_index_history_status (
        chain, address_hash, latest_run_status, latest_run_finished_at
      ) values (
        ${chain}, ${row.address_hash}, 'completed', now()
      )
      on conflict (chain, address_hash) do update set
        latest_run_status='completed',
        latest_run_finished_at=excluded.latest_run_finished_at,
        latest_run_error=null
    `
    await sql`
      update wallet_index_addresses
      set last_indexed_at=now(), updated_at=now()
      where address_hash=${row.address_hash}
    `
    for (const lease of leases) {
      const payload = balancePayload(chain, row.address, balance, lease.expires_at)
      if (lease.initial_snapshot_pending) {
        await insertWalletIndexDeliveryEvent(
          sql,
          lease,
          chain,
          row.address_hash,
          'snapshot',
          `snapshot:${lease.lease_generation}`,
          payload,
        )
        await sql`
          update wallet_index_activation_leases
          set initial_snapshot_pending=false
          where lease_id=${lease.lease_id}
        `
      } else if (balanceChanged) {
        await replacePendingBalanceDelivery(
          sql,
          lease,
          chain,
          row.address_hash,
          payload,
        )
      }
    }
  })
}

async function saveBalanceFailures(
  chain: Chain,
  rows: AddressRow[],
  code: string,
): Promise<void> {
  for (const row of rows) {
    await db()`
      insert into wallet_index_history_status (
        chain, address_hash, latest_run_status, latest_run_finished_at, latest_run_error
      ) values (
        ${chain}, ${row.address_hash}, 'failed', now(), ${code}
      )
      on conflict (chain, address_hash) do update set
        latest_run_status='failed',
        latest_run_finished_at=excluded.latest_run_finished_at,
        latest_run_error=excluded.latest_run_error
    `
  }
}

async function fetchBalance(
  chain: Exclude<Chain, 'bitcoin'>,
  address: string,
  budget: RPCBudget,
  sharedHeight?: number,
): Promise<BalanceResult> {
  if (chain === 'ethereum' || chain === 'mozaga') {
    const rpcAddress = evmRPCAddress(chain, address)
    const amount = hexQuantity(
      await rpc(chain, 'eth_getBalance', [rpcAddress, 'latest'], budget),
    )
    const height = hexHeight(await rpc(chain, 'eth_blockNumber', [], budget))
    const tokenBalances: TokenBalance[] = []
    if (chain === 'ethereum') {
      for (const [identifier, symbol, decimals] of evmTokens) {
        try {
          const result = await rpc(chain, 'eth_call', [{
            to: identifier,
            data: erc20BalanceOfCallData(rpcAddress),
          }, 'latest'], budget)
          tokenBalances.push({
            tokenStandard: 'erc20',
            tokenIdentifier: identifier,
            tokenSymbol: symbol,
            tokenDecimals: decimals,
            amountAtomic: hexQuantity(result),
          })
        } catch {
          // Optional token failures do not discard native state.
        }
      }
    }
    return {
      nativeBalanceAtomic: amount,
      nativeSymbol: symbols[chain],
      tokenBalances,
      blockHeight: height,
    }
  }
  if (chain === 'solana') {
    const balance = await rpc(
      'solana',
      'getBalance',
      [address, { commitment: 'finalized' }],
      budget,
    )
    if (!isRecord(balance)) throw new SafeWorkerError('rpc_response_invalid')
    const lamports = nonNegativeUint64Text(balance.value, 'rpc_response_invalid')
    const tokenBalances: TokenBalance[] = []
    try {
      const tokenResponse = await rpc('solana', 'getTokenAccountsByOwner', [
        address,
        { mint: solanaToken.identifier },
        { encoding: 'jsonParsed' },
      ], budget)
      tokenBalances.push({
        tokenStandard: solanaToken.standard,
        tokenIdentifier: solanaToken.identifier,
        tokenSymbol: solanaToken.symbol,
        tokenDecimals: solanaToken.decimals,
        amountAtomic: solanaTokenAccountTotal(tokenResponse),
      })
    } catch {
      // Optional token failures do not discard native state.
    }
    return {
      nativeBalanceAtomic: lamports,
      nativeSymbol: symbols.solana,
      tokenBalances,
      blockHeight: safeInteger(sharedHeight, 'rpc_response_invalid'),
    }
  }
  const account = await tronRPC('/wallet/getaccount', { address, visible: true }, budget)
  if (!isRecord(account)) throw new SafeWorkerError('rpc_response_invalid')
  const amount = account.balance === undefined
    ? '0'
    : nonNegativeInt64Text(account.balance, 'rpc_response_invalid')
  return {
    nativeBalanceAtomic: amount,
    nativeSymbol: symbols.tron,
    tokenBalances: [],
    blockHeight: safeInteger(sharedHeight, 'rpc_response_invalid'),
  }
}

async function bitcoinBalances(
  rows: AddressRow[],
  budget: RPCBudget,
): Promise<Map<string, BalanceResult>> {
  const height = safeInteger(
    await rpc('bitcoin', 'getblockcount', [], budget),
    'rpc_response_invalid',
  )
  const descriptors = rows.map((row) => `addr(${row.address})`)
  let scan: unknown
  try {
    scan = await rpc('bitcoin', 'scantxoutset', ['start', descriptors], budget)
  } catch (error) {
    if (!(error instanceof SafeWorkerError) || error.code !== 'bitcoin_scan_in_progress') {
      throw error
    }
    await rpc('bitcoin', 'scantxoutset', ['abort'], budget)
    scan = await rpc('bitcoin', 'scantxoutset', ['start', descriptors], budget)
  }
  if (!isRecord(scan) || !Array.isArray(scan.unspents)) {
    throw new SafeWorkerError('rpc_response_invalid')
  }
  const rowByAddress = new Map(rows.map((row) => [row.address, row]))
  const totals = new Map(rows.map((row) => [row.address_hash, 0n]))
  for (const value of scan.unspents) {
    if (!isRecord(value) || typeof value.desc !== 'string') continue
    const row = rowByAddress.get(bitcoinDescriptorAddress(value.desc))
    if (!row) continue
    totals.set(row.address_hash, totals.get(row.address_hash)! + btcAmountToSats(value.amount))
  }
  return new Map(rows.map((row) => [
    row.address_hash,
    {
      nativeBalanceAtomic: totals.get(row.address_hash)!.toString(),
      nativeSymbol: symbols.bitcoin,
      tokenBalances: [],
      blockHeight: height,
    },
  ]))
}

function solanaTokenAccountTotal(value: unknown): string {
  if (!isRecord(value) || !Array.isArray(value.value)) {
    throw new SafeWorkerError('rpc_response_invalid')
  }
  let total = 0n
  for (const entry of value.value) {
    if (!isRecord(entry) || !isRecord(entry.account) || !isRecord(entry.account.data)) continue
    const data = entry.account.data
    if (
      !isRecord(data.parsed) || !isRecord(data.parsed.info) ||
      !isRecord(data.parsed.info.tokenAmount)
    ) {
      continue
    }
    const amount = data.parsed.info.tokenAmount.amount
    if (typeof amount === 'string' && /^\d{1,20}$/.test(amount)) total += BigInt(amount)
  }
  return total.toString()
}

function erc20BalanceOfCallData(address: string): string {
  const clean = address.toLowerCase().replace(/^0x/, '')
  if (!/^[0-9a-f]{40}$/.test(clean)) throw new SafeWorkerError('rpc_response_invalid')
  return `0x70a08231000000000000000000000000${clean}`
}

function evmRPCAddress(chain: Chain, address: string): string {
  if (chain === 'mozaga' && /^EX[OI][0-9a-f]{40}$/i.test(address)) {
    return `0x${address.slice(3)}`
  }
  return address
}

function hexQuantity(value: unknown): string {
  if (
    typeof value !== 'string' || !/^0x[0-9a-f]+$/i.test(value) ||
    value.length > 66
  ) {
    throw new SafeWorkerError('rpc_response_invalid')
  }
  return BigInt(value).toString()
}

function hexHeight(value: unknown): number {
  const amount = BigInt(hexQuantity(value))
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) throw new SafeWorkerError('rpc_response_invalid')
  return Number(amount)
}

function safeInteger(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new SafeWorkerError(code)
  return value as number
}

function nonNegativeInt64Text(value: unknown, code: string): string {
  return boundedUnsignedIntegerText(value, '9223372036854775807', code)
}

function nonNegativeUint64Text(value: unknown, code: string): string {
  return boundedUnsignedIntegerText(value, '18446744073709551615', code)
}

function boundedUnsignedIntegerText(value: unknown, maximum: string, code: string): string {
  const text = typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? String(value)
    : typeof value === 'string' && /^\d+$/.test(value)
    ? value
    : ''
  if (!text) throw new SafeWorkerError(code)
  const normalized = text.replace(/^0+(?=\d)/, '')
  if (
    normalized.length > maximum.length ||
    (normalized.length === maximum.length && normalized > maximum)
  ) throw new SafeWorkerError(code)
  return normalized
}

function bitcoinDescriptorAddress(descriptor: string): string {
  const match = descriptor.match(/addr\(([^)]+)\)/)
  return match?.[1] ?? ''
}

function btcAmountToSats(value: unknown): bigint {
  let text: string
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    text = value.toFixed(8)
  } else if (typeof value === 'string') {
    text = value.trim()
  } else {
    return 0n
  }
  if (!/^\d+(?:\.\d{1,8})?$/.test(text)) return 0n
  const [whole, fraction = ''] = text.split('.')
  if (whole!.length > 20) return 0n
  return BigInt(whole!) * 100_000_000n + BigInt((fraction + '00000000').slice(0, 8))
}

async function runTransactions(
  chain: Chain,
  rows: AddressRow[],
  mode: RunMode,
  budget: RPCBudget,
  summary: ChainSummary,
  countUpdated: boolean,
): Promise<void> {
  if (rows.length === 0) return
  const cursorName: CursorName = mode === 'backfill' ? 'transactions_backfill' : 'transactions'
  const cursor = await loadCursor(chain, cursorName)
  const addressCursors = mode === 'backfill'
    ? (chain === 'solana' ? await loadBackfillCursors(chain, rows) : new Map<string, number>())
    : await loadAddressCursors(chain, rows)
  let result: TransactionResult
  if (chain === 'mozaga') {
    result = await syncMozagaTransactions(rows, mode, cursor, addressCursors, budget)
  } else if (chain === 'ethereum') {
    result = await syncEVMTransactions(chain, rows, mode, cursor, addressCursors, budget)
  } else if (chain === 'bitcoin') {
    result = await syncBitcoinTransactions(rows, mode, cursor, addressCursors, budget)
  } else if (chain === 'solana') {
    result = await syncSolanaTransactions(rows, mode, cursor, addressCursors, budget)
  } else {
    result = await syncTronTransactions(rows, mode, cursor, addressCursors, budget)
  }
  result.records = mergeTransactionRecords(result.records)
  const processedRows = result.processedAddressHashes
    ? rows.filter((row) => result.processedAddressHashes!.has(row.address_hash))
    : rows
  const status: RunStatus = result.failed > 0 || result.errors.length > 0 ||
      summary.failed > 0 || summary.errors.length > 0
    ? 'completed_with_errors'
    : 'completed'
  const error = result.errors[0] ?? summary.errors[0] ?? null
  await saveTransactionResult(chain, processedRows, cursorName, result, status, error)
  summary.transactions += result.records.length
  summary.tokenTransfers += result.tokenTransfers
  summary.failed += result.failed
  for (const error of result.errors) addError(summary, error)
  if (countUpdated) summary.updated += result.records.length
  await markAddressesIndexed(processedRows)
}

async function loadCursor(chain: Chain, name: CursorName): Promise<CursorRow> {
  const rows = await db()<{
    last_scanned_height: string
    last_finalized_height: string
  }[]>`
    select
      coalesce(last_scanned_height, 0)::text as last_scanned_height,
      coalesce(last_finalized_height, 0)::text as last_finalized_height
    from wallet_index_cursors
    where chain=${chain} and cursor_name=${name}
  `
  if (!rows[0]) return { exists: false, lastScanned: 0, lastFinalized: 0 }
  return {
    exists: true,
    lastScanned: numericHeight(rows[0].last_scanned_height),
    lastFinalized: numericHeight(rows[0].last_finalized_height),
  }
}

async function loadAddressCursors(
  chain: Chain,
  rows: AddressRow[],
): Promise<Map<string, number>> {
  const cursors = new Map(rows.map((row) => [row.address_hash, 0]))
  if (rows.length === 0) return cursors
  const hashes = rows.map((row) => row.address_hash)
  const statuses = await db()<{
    address_hash: string
    transaction_cursor_height: string
  }[]>`
    select address_hash, transaction_cursor_height::text
    from wallet_index_history_status
    where chain=${chain} and address_hash = any(${hashes})
  `
  for (const status of statuses) {
    if (cursors.has(status.address_hash)) {
      cursors.set(status.address_hash, numericHeight(status.transaction_cursor_height))
    }
  }
  return cursors
}

async function loadBackfillCursors(
  chain: Chain,
  rows: AddressRow[],
): Promise<Map<string, number>> {
  const cursors = new Map(rows.map((row) => [row.address_hash, 0]))
  if (rows.length === 0) return cursors
  const hashes = rows.map((row) => row.address_hash)
  const statuses = await db()<{
    address_hash: string
    backfill_cursor_height: string
  }[]>`
    select address_hash, backfill_cursor_height::text
    from wallet_index_history_status
    where chain=${chain} and address_hash = any(${hashes})
  `
  for (const status of statuses) {
    if (cursors.has(status.address_hash)) {
      cursors.set(status.address_hash, numericHeight(status.backfill_cursor_height))
    }
  }
  return cursors
}

function numericHeight(value: string | number): number {
  const text = String(value)
  if (!/^\d+$/.test(text)) throw new SafeWorkerError('database_state_invalid')
  const parsed = Number(text)
  if (!Number.isSafeInteger(parsed)) throw new SafeWorkerError('database_state_invalid')
  return parsed
}

function requestCursorHeight(
  cursor: CursorRow,
  rows: AddressRow[],
  addressCursors: Map<string, number>,
  mode: RunMode,
): number {
  if (mode === 'backfill' || rows.length === 0 || addressCursors.size === 0) {
    return cursor.lastScanned
  }
  return Math.min(...rows.map((row) => addressCursors.get(row.address_hash) ?? 0))
}

export function blockRange(
  mode: RunMode,
  lastScanned: number,
  latest: number,
  maxBlocks: number,
): { from: number; to: number; descending: boolean } | undefined {
  if (latest < 0) return undefined
  if (mode === 'backfill') {
    const from = lastScanned <= 0 || lastScanned > latest ? latest : lastScanned
    return { from, to: Math.max(0, from - maxBlocks + 1), descending: true }
  }
  let from = lastScanned + 1
  if (lastScanned <= 0 || from > latest) from = Math.max(0, latest - maxBlocks + 1)
  return { from, to: Math.min(latest, from + maxBlocks - 1), descending: false }
}

async function saveTransactionResult(
  chain: Chain,
  rows: AddressRow[],
  cursorName: CursorName,
  result: TransactionResult,
  status: RunStatus,
  error: string | null,
): Promise<void> {
  const records = result.records
  for (const block of result.blocks) validateChainBlock(chain, block)
  await reconcileParentContinuity(chain, result.blocks)
  await db().begin(async (sql) => {
    if (result.blocks.length > 0) {
      const ordered = [...result.blocks].sort((left, right) => left.height - right.height)
      for (let index = 1; index < ordered.length; index++) {
        const previous = ordered[index - 1]!
        const current = ordered[index]!
        if (
          current.height === previous.height + 1 &&
          current.parentHash && current.parentHash !== previous.hash
        ) throw new SafeWorkerError('rpc_chain_discontinuity')
      }
      const heights = result.blocks.map((block) => block.height)
      const existing = await sql<{ block_height: string; block_hash: string }[]>`
        select block_height::text, block_hash
        from wallet_index_chain_blocks
        where chain=${chain} and block_height = any(${heights})
      `
      let mismatch: number | undefined
      const incoming = new Map(result.blocks.map((block) => [block.height, block.hash]))
      for (const block of existing) {
        const height = numericHeight(block.block_height)
        if (incoming.get(height) !== block.block_hash) {
          mismatch = mismatch === undefined ? height : Math.min(mismatch, height)
        }
      }
      if (mismatch !== undefined) await rollbackFromHeight(sql, chain, mismatch)
      for (const block of result.blocks) {
        await sql`
          insert into wallet_index_chain_blocks (
            chain, block_height, block_hash, parent_hash, block_timestamp, indexed_at
          ) values (
            ${chain}, ${block.height}, ${block.hash}, ${block.parentHash || null},
            ${block.timestamp ?? null}, now()
          )
          on conflict (chain, block_height) do update set
            block_hash=excluded.block_hash,
            parent_hash=excluded.parent_hash,
            block_timestamp=excluded.block_timestamp,
            indexed_at=excluded.indexed_at
        `
      }
    }
    const addressesByHash = new Map(rows.map((row) => [row.address_hash, row.address]))
    for (const record of records) {
      const leases = await activeLeasesForAddress(sql, chain, record.addressHash)
      const eligibleLeases = leases.filter((lease) =>
        record.blockHeight > numericHeight(lease.baseline_height) ||
        (
          record.status === 'pending' &&
          record.occurredAt.getTime() > lease.activated_at.getTime()
        )
      )
      if (eligibleLeases.length === 0) continue
      const activityAt = new Date(Math.min(record.occurredAt.getTime(), Date.now()))
      for (const lease of eligibleLeases) {
        const updatedLeases = await sql<{ expires_at: Date }[]>`
          update wallet_index_activation_leases
          set last_chain_activity_at=greatest(last_chain_activity_at, ${activityAt}),
              expires_at=greatest(
                expires_at,
                greatest(last_chain_activity_at, ${activityAt}) + interval '30 days'
              )
          where lease_id=${lease.lease_id}
          returning expires_at
        `
        const updatedLease = updatedLeases[0]
        if (!updatedLease) throw new SafeWorkerError('wallet_index_lease_lost')
        const address = addressesByHash.get(record.addressHash)
        if (!address) throw new SafeWorkerError('database_state_invalid')
        await insertWalletIndexDeliveryEvent(
          sql,
          lease,
          chain,
          record.addressHash,
          'transaction',
          `transaction:${record.txHash}:${record.status}`,
          {
            chain,
            address,
            transaction: {
              txHash: record.txHash,
              occurredAt: record.occurredAt.getTime(),
              direction: record.direction,
              status: record.status,
              blockHeight: record.blockHeight,
              nativeAmountAtomic: record.nativeAmountAtomic,
              nativeSymbol: record.nativeSymbol,
              feeAtomic: record.feeAtomic,
              counterpartyAddress: record.counterpartyAddress,
              tokenTransfers: record.tokenTransfers,
            },
            leaseExpiresAt: updatedLease.expires_at.getTime(),
          },
          record.status === 'confirmed',
        )
      }
    }
    await sql`
      insert into wallet_index_cursors (
        chain, cursor_name, last_scanned_height, last_finalized_height,
        latest_status, latest_error, updated_at
      ) values (
        ${chain}, ${cursorName}, ${result.lastScanned}, ${result.lastFinalized},
        ${status}, ${error}, now()
      )
      on conflict (chain, cursor_name) do update set
        last_scanned_height=excluded.last_scanned_height,
        last_finalized_height=excluded.last_finalized_height,
        latest_status=excluded.latest_status,
        latest_error=excluded.latest_error,
        updated_at=excluded.updated_at
    `
    for (const row of rows) {
      const cursor = result.addressCursors?.get(row.address_hash) ?? result.lastScanned
      await sql`
        insert into wallet_index_history_status (
          chain, address_hash, transaction_cursor_height, backfill_cursor_height,
          latest_run_status, latest_run_finished_at, latest_run_error
        ) values (
          ${chain}, ${row.address_hash},
          ${cursorName === 'transactions' ? cursor : 0},
          ${cursorName === 'transactions_backfill' ? cursor : 0},
          ${status}, now(), ${error}
        )
        on conflict (chain, address_hash) do update set
          transaction_cursor_height=case
            when ${cursorName}='transactions'
              then greatest(wallet_index_history_status.transaction_cursor_height, excluded.transaction_cursor_height)
            else wallet_index_history_status.transaction_cursor_height
          end,
          backfill_cursor_height=case
            when ${cursorName}='transactions_backfill'
              then excluded.backfill_cursor_height
            else wallet_index_history_status.backfill_cursor_height
          end,
          latest_transaction_at=null,
          transaction_count=0,
          latest_run_status=excluded.latest_run_status,
          latest_run_finished_at=excluded.latest_run_finished_at,
          latest_run_error=excluded.latest_run_error
      `
      const metadata = result.metadataUpdates?.get(row.address_hash)
      if (metadata) {
        await sql`
          update wallet_index_addresses
          set metadata=jsonb_set(
            coalesce(metadata, '{}'::jsonb),
            array[${edgeMetadataKey}],
            ${sql.json(metadata)},
            true
          )
          where chain=${chain} and address_hash=${row.address_hash}
        `
      }
    }
    if (chain === 'mozaga' && result.externalCursors) {
      const selected = new Set(rows.map((row) => row.address_hash))
      for (const [addressHash, externalCursor] of result.externalCursors) {
        if (!selected.has(addressHash)) throw new SafeWorkerError('database_state_invalid')
        await sql`
          insert into wallet_index_external_history_cursors (
            chain, address_hash, next_cursor, sync_complete, last_synced_at, latest_error, updated_at
          ) values (
            ${chain}, ${addressHash}, ${externalCursor.nextCursor},
            ${externalCursor.syncComplete}, now(), ${externalCursor.latestError}, now()
          )
          on conflict (chain, address_hash) do update set
            next_cursor=excluded.next_cursor,
            sync_complete=excluded.sync_complete,
            last_synced_at=excluded.last_synced_at,
            latest_error=excluded.latest_error,
            updated_at=excluded.updated_at
        `
      }
    }
  })
}

async function reconcileParentContinuity(
  chain: Chain,
  blocks: ChainBlock[],
): Promise<void> {
  if (blocks.length === 0) return
  const first = [...blocks].sort((left, right) => left.height - right.height)[0]!
  if (first.height <= 0 || !first.parentHash) return
  const previous = await db()<{
    block_hash: string
  }[]>`
    select block_hash from wallet_index_chain_blocks
    where chain=${chain} and block_height=${first.height - 1}
  `
  if (!previous[0] || previous[0].block_hash === first.parentHash) return
  await db().begin(async (sql) => {
    await rollbackFromHeight(sql, chain, first.height - 1)
  })
  throw new SafeWorkerError('chain_reorg_rewound')
}

async function rollbackFromHeight(
  sql: Database,
  chain: Chain,
  height: number,
): Promise<void> {
  await sql`
    delete from wallet_index_chain_blocks
    where chain=${chain} and block_height >= ${height}
  `
  const ancestor = Math.max(0, height - 1)
  await sql`
    update wallet_index_cursors set
      last_scanned_height=least(coalesce(last_scanned_height, ${ancestor}), ${ancestor}),
      last_finalized_height=least(coalesce(last_finalized_height, ${ancestor}), ${ancestor}),
      updated_at=now()
    where chain=${chain} and cursor_name in ('transactions', 'transactions_backfill')
  `
  await sql`
    update wallet_index_history_status set
      transaction_cursor_height=least(transaction_cursor_height, ${ancestor}),
      backfill_cursor_height=least(backfill_cursor_height, ${ancestor})
    where chain=${chain}
  `
  if (chain === 'mozaga') {
    await sql`
      update wallet_index_external_history_cursors
      set next_cursor=null,
          sync_complete=false,
          latest_error=null,
          updated_at=now()
      where chain=${chain}
    `
  }
}

async function markAddressesIndexed(rows: AddressRow[]): Promise<void> {
  if (rows.length === 0) return
  await db()`
    update wallet_index_addresses
    set last_indexed_at=now(), updated_at=now()
    where address_hash = any(${rows.map((row) => row.address_hash)})
  `
}

async function syncMozagaTransactions(
  rows: AddressRow[],
  mode: RunMode,
  cursor: CursorRow,
  addressCursors: Map<string, number>,
  budget: RPCBudget,
): Promise<TransactionResult> {
  const selectedRows = rows.slice(0, mozagaExplorerAddressBatch)
  if (selectedRows.length === 0) {
    return emptyTransactionResult(cursor.lastScanned, cursor.lastFinalized)
  }
  if (!isExplorerWalletFeedConfigured()) {
    const fallback = await syncEVMTransactions(
      'mozaga',
      selectedRows,
      mode,
      cursor,
      addressCursors,
      budget,
    )
    return {
      ...fallback,
      errors: uniqueErrors([...fallback.errors, 'mozaga_explorer_feed_unavailable']),
      processedAddressHashes: new Set(selectedRows.map((row) => row.address_hash)),
      externalCursors: new Map(selectedRows.map((row) => [row.address_hash, {
        nextCursor: null,
        syncComplete: false,
        latestError: 'mozaga_explorer_feed_unavailable',
      }])),
    }
  }

  const persistedCursors = await loadExternalHistoryCursors(selectedRows)
  try {
    const records: TransactionRecord[] = []
    const externalCursors = new Map<string, ExternalHistoryCursorUpdate>()
    for (const row of selectedRows) {
      const persistedCursor = persistedCursors.get(row.address_hash) ?? null
      const feedCursor = decodeExplorerFeedCursor(persistedCursor)
      const response = await fetchExplorerWalletFeed({
        addresses: [row.address],
        cursor: feedCursor,
        limit: mozagaExplorerPageLimit,
      })
      const addressKey = mozagaAddressKey(row.address)
      for (const record of response.records) {
        if (record.addressKey !== addressKey) {
          throw new SafeWorkerError('mozaga_explorer_feed_invalid')
        }
        records.push(explorerFeedRecord(row, record))
      }
      const latest = response.records.at(-1)
      const nextCursor = response.nextCursor ??
        (latest ? { height: latest.blockHeight, txHash: latest.txHash } : feedCursor)
      externalCursors.set(row.address_hash, {
        nextCursor: nextCursor.height >= 0 ? encodeExplorerFeedCursor(nextCursor) : null,
        syncComplete: response.syncComplete,
        latestError: null,
      })
    }
    return {
      records,
      blocks: [],
      lastScanned: cursor.lastScanned,
      lastFinalized: cursor.lastFinalized,
      tokenTransfers: records.reduce((total, record) => total + record.tokenTransfers.length, 0),
      failed: 0,
      errors: [],
      addressCursors: new Map(
        selectedRows.map((row) => [row.address_hash, addressCursors.get(row.address_hash) ?? 0]),
      ),
      processedAddressHashes: new Set(selectedRows.map((row) => row.address_hash)),
      externalCursors,
    }
  } catch (error) {
    const code = safeErrorCode(error)
    const fallback = await syncEVMTransactions(
      'mozaga',
      selectedRows,
      mode,
      cursor,
      addressCursors,
      budget,
    )
    return {
      ...fallback,
      errors: uniqueErrors([...fallback.errors, code]),
      processedAddressHashes: new Set(selectedRows.map((row) => row.address_hash)),
      externalCursors: new Map(selectedRows.map((row) => [row.address_hash, {
        nextCursor: persistedCursors.get(row.address_hash) ?? null,
        syncComplete: false,
        latestError: code,
      }])),
    }
  }
}

async function loadExternalHistoryCursors(rows: AddressRow[]): Promise<Map<string, string | null>> {
  if (rows.length === 0) return new Map()
  const stored = await db()<{
    address_hash: string
    next_cursor: string | null
  }[]>`
    select address_hash, next_cursor
    from wallet_index_external_history_cursors
    where chain='mozaga' and address_hash = any(${rows.map((row) => row.address_hash)})
  `
  return new Map(stored.map((entry) => [entry.address_hash, entry.next_cursor]))
}

function mozagaAddressKey(address: string): string {
  if (!/^(?:EXO|EXI)[0-9a-f]{40}$/i.test(address)) {
    throw new SafeWorkerError('mozaga_explorer_feed_invalid')
  }
  return address.slice(-40).toLowerCase()
}

function explorerFeedRecord(row: AddressRow, record: ExplorerFeedRecord): TransactionRecord {
  return {
    chain: 'mozaga',
    addressHash: row.address_hash,
    occurredAt: record.occurredAt,
    txHash: record.txHash,
    direction: record.direction,
    status: record.status,
    blockHeight: record.blockHeight,
    nativeAmountAtomic: record.nativeAmountAtomic,
    nativeSymbol: record.nativeSymbol,
    feeAtomic: record.feeAtomic,
    counterpartyAddress: record.counterpartyAddress,
    tokenTransfers: record.tokenTransfers,
  }
}

function uniqueErrors(errors: string[]): string[] {
  return [...new Set(errors)].slice(0, maxErrors)
}

async function syncEVMTransactions(
  chain: 'ethereum' | 'mozaga',
  rows: AddressRow[],
  mode: RunMode,
  cursor: CursorRow,
  addressCursors: Map<string, number>,
  budget: RPCBudget,
): Promise<TransactionResult> {
  if (rows.length === 0) {
    return emptyTransactionResult(cursor.lastScanned, cursor.lastFinalized)
  }
  const latest = hexHeight(await rpc(chain, 'eth_blockNumber', [], budget))
  const range = blockRange(
    mode,
    requestCursorHeight(cursor, rows, addressCursors, mode),
    latest,
    mode === 'backfill' ? edgeBlockLimits[chain].backfill : edgeBlockLimits[chain].live,
  )
  if (!range) return emptyTransactionResult(cursor.lastScanned, cursor.lastFinalized)
  const watched = new Map<string, AddressRow>()
  for (const row of rows) watched.set(evmRPCAddress(chain, row.address).toLowerCase(), row)
  const blocks: ChainBlock[] = []
  const blockTimes = new Map<number, Date>()
  const records: TransactionRecord[] = []
  for (const height of heightsForRange(range)) {
    const raw = await rpc(chain, 'eth_getBlockByNumber', [
      toHexQuantity(height),
      true,
    ], budget)
    const block = parseEVMBlock(chain, raw, height)
    blocks.push(block.meta)
    blockTimes.set(height, block.meta.timestamp!)
    for (const transaction of block.transactions) {
      records.push(...evmNativeRecords(chain, watched, transaction, height, block.meta.timestamp!))
    }
  }
  let tokenTransfers = 0
  if (chain === 'ethereum') {
    const [from, to] = orderedRange(range.from, range.to)
    for (const [identifier, symbol, decimals] of evmTokens) {
      let rawLogs: unknown
      try {
        rawLogs = await rpc('ethereum', 'eth_getLogs', [{
          fromBlock: toHexQuantity(from),
          toBlock: toHexQuantity(to),
          address: identifier,
          topics: [evmTransferTopic],
        }], budget)
      } catch (error) {
        if (
          error instanceof SafeWorkerError &&
          (error.code === 'rpc_budget_exhausted' || error.code === 'chain_deadline_exceeded')
        ) throw error
        continue
      }
      if (!Array.isArray(rawLogs)) throw new SafeWorkerError('rpc_response_invalid')
      for (const rawLog of rawLogs) {
        const mapped = evmTokenRecords(
          watched,
          rawLog,
          blockTimes,
          { identifier, symbol, decimals },
        )
        tokenTransfers += mapped.length
        records.push(...mapped)
      }
    }
  }
  return {
    records,
    blocks,
    lastScanned: range.to,
    lastFinalized: range.to,
    tokenTransfers,
    failed: 0,
    errors: [],
    metadataUpdates: chain === 'ethereum'
      ? completedBackfillMetadata(mode, rows, range.to)
      : undefined,
  }
}

function emptyTransactionResult(lastScanned: number, lastFinalized: number): TransactionResult {
  return {
    records: [],
    blocks: [],
    lastScanned,
    lastFinalized,
    tokenTransfers: 0,
    failed: 0,
    errors: [],
  }
}

function heightsForRange(range: { from: number; to: number; descending: boolean }): number[] {
  const values: number[] = []
  if (range.descending) {
    for (let height = range.from; height >= range.to; height--) values.push(height)
  } else {
    for (let height = range.from; height <= range.to; height++) values.push(height)
  }
  return values
}

function orderedRange(left: number, right: number): [number, number] {
  return left <= right ? [left, right] : [right, left]
}

function toHexQuantity(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) throw new SafeWorkerError('rpc_response_invalid')
  return `0x${value.toString(16)}`
}

interface ParsedEVMTransaction {
  hash: string
  from: string
  to: string
  value: string
}

function parseEVMBlock(
  chain: Chain,
  value: unknown,
  expectedHeight: number,
): { meta: ChainBlock; transactions: ParsedEVMTransaction[] } {
  if (
    !isRecord(value) || typeof value.hash !== 'string' || !value.hash ||
    typeof value.parentHash !== 'string' || !Array.isArray(value.transactions)
  ) throw new SafeWorkerError('rpc_response_invalid')
  if (value.number !== undefined && hexHeight(value.number) !== expectedHeight) {
    throw new SafeWorkerError('rpc_response_invalid')
  }
  const timestamp = new Date(hexHeight(value.timestamp) * 1000)
  if (!Number.isFinite(timestamp.getTime())) throw new SafeWorkerError('rpc_response_invalid')
  const transactions: ParsedEVMTransaction[] = []
  for (const raw of value.transactions) {
    if (
      !isRecord(raw) || typeof raw.hash !== 'string' || !raw.hash ||
      typeof raw.from !== 'string' || typeof raw.value !== 'string'
    ) throw new SafeWorkerError('rpc_response_invalid')
    transactions.push({
      hash: raw.hash,
      from: raw.from,
      to: typeof raw.to === 'string' ? raw.to : '',
      value: raw.value,
    })
  }
  return {
    meta: {
      chain,
      height: expectedHeight,
      hash: value.hash,
      parentHash: value.parentHash,
      timestamp,
    },
    transactions,
  }
}

function evmNativeRecords(
  chain: Chain,
  watched: Map<string, AddressRow>,
  transaction: ParsedEVMTransaction,
  height: number,
  occurredAt: Date,
): TransactionRecord[] {
  const from = transaction.from.toLowerCase()
  const to = transaction.to.toLowerCase()
  const fromRow = watched.get(from)
  const toRow = watched.get(to)
  if (!fromRow && !toRow) return []
  let amount = '0'
  try {
    amount = hexQuantity(transaction.value)
  } catch {
    // Malformed value fields preserve the zero fallback.
  }
  const records: TransactionRecord[] = []
  if (fromRow) {
    const self = toRow?.address_hash === fromRow.address_hash
    records.push(transactionRecord({
      chain,
      row: fromRow,
      occurredAt,
      txHash: transaction.hash,
      direction: self ? 'self' : 'outbound',
      height,
      nativeAmountAtomic: amount,
      counterpartyAddress: self ? transaction.from : transaction.to,
    }))
  }
  if (toRow && toRow.address_hash !== fromRow?.address_hash) {
    records.push(transactionRecord({
      chain,
      row: toRow,
      occurredAt,
      txHash: transaction.hash,
      direction: 'inbound',
      height,
      nativeAmountAtomic: amount,
      counterpartyAddress: transaction.from,
    }))
  }
  return records
}

function evmTokenRecords(
  watched: Map<string, AddressRow>,
  raw: unknown,
  blockTimes: Map<number, Date>,
  token: { identifier: string; symbol: string; decimals: number },
): TransactionRecord[] {
  if (
    !isRecord(raw) || !Array.isArray(raw.topics) || raw.topics.length < 3 ||
    typeof raw.topics[0] !== 'string' ||
    raw.topics[0].toLowerCase() !== evmTransferTopic ||
    typeof raw.topics[1] !== 'string' || typeof raw.topics[2] !== 'string' ||
    typeof raw.transactionHash !== 'string' || !raw.transactionHash ||
    typeof raw.blockNumber !== 'string'
  ) return []
  const from = addressFromEVMTopic(raw.topics[1])
  const to = addressFromEVMTopic(raw.topics[2])
  const fromRow = watched.get(from)
  const toRow = watched.get(to)
  if (!fromRow && !toRow) return []
  const height = hexHeight(raw.blockNumber)
  const occurredAt = blockTimes.get(height) ?? new Date(0)
  let amount = '0'
  try {
    amount = hexQuantity(raw.data)
  } catch {
    // Malformed transfer amounts preserve the zero fallback.
  }
  const base = {
    tokenStandard: 'erc20',
    tokenIdentifier: token.identifier,
    tokenSymbol: token.symbol,
    tokenDecimals: token.decimals,
    amountAtomic: amount,
  }
  const records: TransactionRecord[] = []
  if (fromRow) {
    records.push(transactionRecord({
      chain: 'ethereum',
      row: fromRow,
      occurredAt,
      txHash: raw.transactionHash,
      direction: 'outbound',
      height,
      counterpartyAddress: to,
      tokenTransfers: [{ ...base, counterpartyAddress: to }],
    }))
  }
  if (toRow && toRow.address_hash !== fromRow?.address_hash) {
    records.push(transactionRecord({
      chain: 'ethereum',
      row: toRow,
      occurredAt,
      txHash: raw.transactionHash,
      direction: 'inbound',
      height,
      counterpartyAddress: from,
      tokenTransfers: [{ ...base, counterpartyAddress: from }],
    }))
  }
  return records
}

function addressFromEVMTopic(value: string): string {
  const clean = value.trim().toLowerCase().replace(/^0x/, '')
  return clean.length >= 40 && /^[0-9a-f]+$/.test(clean) ? `0x${clean.slice(-40)}` : ''
}

function transactionRecord(input: {
  chain: Chain
  row: AddressRow
  occurredAt: Date
  txHash: string
  direction: TransactionDirection
  height: number
  nativeAmountAtomic?: string
  counterpartyAddress?: string
  tokenTransfers?: TokenTransfer[]
  status?: TransactionStatus
  feeAtomic?: string
}): TransactionRecord {
  return {
    chain: input.chain,
    addressHash: input.row.address_hash,
    occurredAt: input.occurredAt,
    txHash: input.txHash,
    direction: input.direction,
    status: input.status ?? 'confirmed',
    blockHeight: input.height,
    nativeAmountAtomic: input.nativeAmountAtomic ?? '0',
    nativeSymbol: symbols[input.chain],
    feeAtomic: input.feeAtomic ?? '0',
    counterpartyAddress: input.counterpartyAddress ?? '',
    tokenTransfers: input.tokenTransfers ?? [],
  }
}

async function syncBitcoinTransactions(
  rows: AddressRow[],
  mode: RunMode,
  cursor: CursorRow,
  addressCursors: Map<string, number>,
  budget: RPCBudget,
): Promise<TransactionResult> {
  if (rows.length === 0) {
    return emptyTransactionResult(cursor.lastScanned, cursor.lastFinalized)
  }
  const latest = safeInteger(
    await rpc('bitcoin', 'getblockcount', [], budget),
    'rpc_response_invalid',
  )
  const range = blockRange(
    mode,
    requestCursorHeight(cursor, rows, addressCursors, mode),
    latest,
    mode === 'backfill' ? edgeBlockLimits.bitcoin.backfill : edgeBlockLimits.bitcoin.live,
  )
  if (!range) return emptyTransactionResult(cursor.lastScanned, latest)
  const watched = new Map(rows.map((row) => [row.address, row]))
  const records: TransactionRecord[] = []
  const blocks: ChainBlock[] = []
  for (const height of heightsForRange(range)) {
    const hash = await rpc('bitcoin', 'getblockhash', [height], budget)
    if (typeof hash !== 'string' || !hash) throw new SafeWorkerError('rpc_response_invalid')
    const raw = await bitcoinBlock(hash, budget)
    const block = parseBitcoinBlock(raw, height, hash)
    blocks.push(block.meta)
    for (const transaction of block.transactions) {
      records.push(
        ...bitcoinTransactionRecords(watched, transaction, height, block.meta.timestamp!),
      )
    }
  }
  return {
    records,
    blocks,
    lastScanned: range.to,
    lastFinalized: latest,
    tokenTransfers: 0,
    failed: 0,
    errors: [],
    metadataUpdates: completedBackfillMetadata(mode, rows, range.to),
  }
}

async function bitcoinBlock(hash: string, budget: RPCBudget): Promise<unknown> {
  try {
    return await rpc('bitcoin', 'getblock', [hash, 3], budget, bitcoinBlockResponseBytes)
  } catch (error) {
    if (
      !(error instanceof SafeWorkerError) ||
      !['rpc_response_too_large', 'rpc_timeout'].includes(error.code)
    ) throw error
    return await rpc('bitcoin', 'getblock', [hash, 2], budget, bitcoinBlockResponseBytes)
  }
}

interface ParsedBitcoinTransaction {
  txid: string
  fee: unknown
  vin: Array<{ address: string; value: unknown }>
  vout: Array<{ address: string; value: unknown }>
}

export function parseBitcoinBlock(
  value: unknown,
  expectedHeight: number,
  expectedHash: string,
): { meta: ChainBlock; transactions: ParsedBitcoinTransaction[] } {
  if (
    !isRecord(value) || typeof value.hash !== 'string' || value.hash !== expectedHash ||
    !Array.isArray(value.tx)
  ) throw new SafeWorkerError('rpc_response_invalid')
  if (
    value.height !== undefined &&
    safeInteger(value.height, 'rpc_response_invalid') !== expectedHeight
  ) {
    throw new SafeWorkerError('rpc_response_invalid')
  }
  const timestamp = new Date(safeInteger(value.time, 'rpc_response_invalid') * 1000)
  const transactions: ParsedBitcoinTransaction[] = []
  for (const raw of value.tx) {
    if (!isRecord(raw) || typeof raw.txid !== 'string' || !raw.txid) {
      throw new SafeWorkerError('rpc_response_invalid')
    }
    const vin: ParsedBitcoinTransaction['vin'] = []
    if (Array.isArray(raw.vin)) {
      for (const input of raw.vin) {
        if (!isRecord(input) || !isRecord(input.prevout)) continue
        vin.push({
          address: bitcoinOutputAddress(input.prevout),
          value: input.prevout.value,
        })
      }
    }
    const vout: ParsedBitcoinTransaction['vout'] = []
    if (Array.isArray(raw.vout)) {
      for (const output of raw.vout) {
        if (!isRecord(output)) continue
        vout.push({ address: bitcoinOutputAddress(output), value: output.value })
      }
    }
    transactions.push({ txid: raw.txid, fee: raw.fee, vin, vout })
  }
  return {
    meta: {
      chain: 'bitcoin',
      height: expectedHeight,
      hash: expectedHash,
      parentHash: typeof value.previousblockhash === 'string' ? value.previousblockhash : '',
      timestamp,
    },
    transactions,
  }
}

function bitcoinOutputAddress(value: Record<string, unknown>): string {
  if (typeof value.scriptpubkey_address === 'string') return value.scriptpubkey_address.trim()
  if (isRecord(value.scriptPubKey) && typeof value.scriptPubKey.address === 'string') {
    return value.scriptPubKey.address.trim()
  }
  return ''
}

function bitcoinTransactionRecords(
  watched: Map<string, AddressRow>,
  transaction: ParsedBitcoinTransaction,
  height: number,
  occurredAt: Date,
): TransactionRecord[] {
  const changes = new Map<string, bigint>()
  const counterparties = new Map<string, string>()
  for (const input of transaction.vin) {
    const row = watched.get(input.address)
    if (row) {
      changes.set(
        row.address_hash,
        (changes.get(row.address_hash) ?? 0n) - btcAmountToSats(input.value),
      )
    } else if (input.address) {
      for (const watchedAddress of watched.keys()) {
        if (watchedAddress !== input.address && !counterparties.has(watchedAddress)) {
          counterparties.set(watchedAddress, input.address)
        }
      }
    }
  }
  for (const output of transaction.vout) {
    const row = watched.get(output.address)
    if (row) {
      changes.set(
        row.address_hash,
        (changes.get(row.address_hash) ?? 0n) + btcAmountToSats(output.value),
      )
    } else if (output.address) {
      for (const watchedAddress of watched.keys()) {
        if (watchedAddress !== output.address && !counterparties.has(watchedAddress)) {
          counterparties.set(watchedAddress, output.address)
        }
      }
    }
  }
  const records: TransactionRecord[] = []
  for (const [address, row] of watched) {
    const delta = changes.get(row.address_hash) ?? 0n
    if (delta === 0n) continue
    records.push(transactionRecord({
      chain: 'bitcoin',
      row,
      occurredAt,
      txHash: transaction.txid,
      direction: delta < 0n ? 'outbound' : 'inbound',
      height,
      nativeAmountAtomic: absBigInt(delta).toString(),
      counterpartyAddress: counterparties.get(address) ?? '',
      feeAtomic: btcAmountToSats(transaction.fee).toString(),
    }))
  }
  return records
}

function absBigInt(value: bigint): bigint {
  return value < 0n ? -value : value
}

async function syncSolanaTransactions(
  rows: AddressRow[],
  mode: RunMode,
  cursor: CursorRow,
  addressCursors: Map<string, number>,
  budget: RPCBudget,
): Promise<TransactionResult> {
  if (rows.length === 0) {
    return emptyTransactionResult(
      mode === 'backfill' ? 0 : cursor.lastScanned,
      cursor.lastFinalized,
    )
  }
  const latest = safeInteger(
    await rpc('solana', 'getSlot', [{ commitment: 'finalized' }], budget),
    'rpc_response_invalid',
  )
  const records: TransactionRecord[] = []
  const metadataUpdates = new Map<string, Record<string, unknown>>()
  const nextCursors = new Map<string, number>()
  let tokenTransfers = 0
  let failed = 0
  const errors: string[] = []
  for (const row of rows) {
    const metadata = edgeMetadata(row.metadata)
    const backfill = mode === 'backfill'
    if (backfill && metadata.backfillComplete === true) {
      nextCursors.set(row.address_hash, addressCursors.get(row.address_hash) ?? 0)
      metadataUpdates.set(row.address_hash, metadata)
      continue
    }
    const before = backfill ? metadata.backfillBefore : metadata.liveBefore
    const targetSlot = backfill
      ? undefined
      : typeof metadata.liveTargetSlot === 'number'
      ? metadata.liveTargetSlot
      : latest
    const options: Record<string, unknown> = {
      limit: solanaSignaturesPerPage,
      commitment: 'finalized',
    }
    if (typeof before === 'string' && before) options.before = before
    const currentCursor = addressCursors.get(row.address_hash) ?? 0
    let signatures: SolanaSignature[]
    try {
      const rawSignatures = await rpc(
        'solana',
        'getSignaturesForAddress',
        [row.address, options],
        budget,
      )
      if (!Array.isArray(rawSignatures)) throw new SafeWorkerError('rpc_response_invalid')
      signatures = rawSignatures.map(parseSolanaSignature)
    } catch (error) {
      if (
        error instanceof SafeWorkerError &&
        (error.code === 'rpc_budget_exhausted' || error.code === 'chain_deadline_exceeded')
      ) throw error
      failed++
      const code = safeErrorCode(error)
      if (errors.length < maxErrors && !errors.includes(code)) errors.push(code)
      nextCursors.set(row.address_hash, currentCursor)
      metadataUpdates.set(row.address_hash, metadata)
      continue
    }
    let liveProcessed = !backfill && currentCursor === 0 &&
        typeof metadata.liveProcessed === 'number'
      ? metadata.liveProcessed
      : 0
    let reachedCursor = false
    let oldestProcessed = currentCursor
    for (const signature of signatures) {
      if (!backfill && signature.slot <= currentCursor) {
        reachedCursor = true
        break
      }
      if (!backfill && currentCursor === 0 && liveProcessed >= solanaInitialLiveWindow) {
        reachedCursor = true
        break
      }
      let record: TransactionRecord | undefined
      try {
        record = await solanaTransactionRecord(row, signature.signature, budget)
      } catch (error) {
        if (
          error instanceof SafeWorkerError &&
          (error.code === 'rpc_budget_exhausted' || error.code === 'chain_deadline_exceeded')
        ) throw error
        record = undefined
      }
      if (record) {
        records.push(record)
        tokenTransfers += record.tokenTransfers.length
      }
      if (!backfill && currentCursor === 0) liveProcessed++
      oldestProcessed = oldestProcessed === 0
        ? signature.slot
        : Math.min(oldestProcessed, signature.slot)
    }
    const initialWindowComplete = !backfill && currentCursor === 0 &&
      liveProcessed >= solanaInitialLiveWindow
    const pageHasMore = signatures.length === solanaSignaturesPerPage &&
      !reachedCursor && !initialWindowComplete
    const lastSignature = signatures.at(-1)?.signature
    if (backfill) {
      if (pageHasMore && lastSignature) {
        metadata.backfillBefore = lastSignature
        delete metadata.backfillComplete
      } else {
        delete metadata.backfillBefore
        metadata.backfillComplete = true
      }
      nextCursors.set(row.address_hash, oldestProcessed)
    } else if (pageHasMore && lastSignature) {
      metadata.liveBefore = lastSignature
      metadata.liveTargetSlot = targetSlot
      if (currentCursor === 0) metadata.liveProcessed = liveProcessed
      nextCursors.set(row.address_hash, currentCursor)
    } else {
      delete metadata.liveBefore
      delete metadata.liveTargetSlot
      delete metadata.liveProcessed
      nextCursors.set(row.address_hash, targetSlot!)
    }
    metadataUpdates.set(row.address_hash, metadata)
  }
  const cursorValues = [...nextCursors.values()]
  const lastScanned = cursorValues.length > 0
    ? (mode === 'backfill'
      ? Math.min(...cursorValues)
      : Math.max(cursor.lastScanned, ...cursorValues))
    : cursor.lastScanned
  return {
    records,
    blocks: [],
    lastScanned,
    lastFinalized: latest,
    tokenTransfers,
    failed,
    errors,
    addressCursors: nextCursors,
    metadataUpdates,
  }
}

function edgeMetadata(value: unknown): Record<string, unknown> {
  if (!isRecord(value) || !isRecord(value[edgeMetadataKey])) return {}
  const source = value[edgeMetadataKey]
  const result: Record<string, unknown> = {}
  for (const key of ['liveBefore', 'backfillBefore']) {
    const candidate = source[key]
    if (typeof candidate === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,128}$/.test(candidate)) {
      result[key] = candidate
    }
  }
  if (
    Number.isSafeInteger(source.liveTargetSlot) &&
    (source.liveTargetSlot as number) >= 0
  ) result.liveTargetSlot = source.liveTargetSlot
  if (
    Number.isSafeInteger(source.liveProcessed) &&
    (source.liveProcessed as number) >= 0 &&
    (source.liveProcessed as number) <= solanaInitialLiveWindow
  ) result.liveProcessed = source.liveProcessed
  if (source.backfillComplete === true) result.backfillComplete = true
  return result
}

function completedBackfillMetadata(
  mode: RunMode,
  rows: AddressRow[],
  lastScanned: number,
  failed = 0,
): Map<string, Record<string, unknown>> | undefined {
  if (mode !== 'backfill' || lastScanned !== 0 || failed > 0) return undefined
  const updates = new Map<string, Record<string, unknown>>()
  for (const row of rows) {
    const metadata = edgeMetadata(row.metadata)
    metadata.backfillComplete = true
    updates.set(row.address_hash, metadata)
  }
  return updates
}

interface SolanaSignature {
  signature: string
  slot: number
}

function parseSolanaSignature(value: unknown): SolanaSignature {
  if (
    !isRecord(value) || typeof value.signature !== 'string' ||
    !/^[1-9A-HJ-NP-Za-km-z]{32,128}$/.test(value.signature)
  ) throw new SafeWorkerError('rpc_response_invalid')
  return {
    signature: value.signature,
    slot: safeInteger(value.slot, 'rpc_response_invalid'),
  }
}

async function solanaTransactionRecord(
  row: AddressRow,
  signature: string,
  budget: RPCBudget,
): Promise<TransactionRecord | undefined> {
  const value = await rpc('solana', 'getTransaction', [
    signature,
    {
      encoding: 'jsonParsed',
      maxSupportedTransactionVersion: 0,
      commitment: 'finalized',
    },
  ], budget)
  if (value === null) return undefined
  if (
    !isRecord(value) || !isRecord(value.transaction) || !isRecord(value.transaction.message) ||
    !Array.isArray(value.transaction.message.accountKeys) || !isRecord(value.meta)
  ) throw new SafeWorkerError('rpc_response_invalid')
  const keys = value.transaction.message.accountKeys.map(solanaAccountKey)
  const index = keys.indexOf(row.address)
  const preBalances = solanaIntegerArray(value.meta.preBalances)
  const postBalances = solanaIntegerArray(value.meta.postBalances)
  let nativeDelta = 0n
  if (index >= 0 && index < preBalances.length && index < postBalances.length) {
    nativeDelta = postBalances[index]! - preBalances[index]!
  }
  const tokenTransfers = solanaTokenTransfers(
    row.address,
    value.meta.preTokenBalances,
    value.meta.postTokenBalances,
  )
  if (nativeDelta === 0n && tokenTransfers.length === 0) return undefined
  const blockTime = value.blockTime === null || value.blockTime === undefined
    ? 0
    : safeInteger(value.blockTime, 'rpc_response_invalid')
  return transactionRecord({
    chain: 'solana',
    row,
    occurredAt: new Date(blockTime * 1000),
    txHash: signature,
    direction: nativeDelta < 0n
      ? 'outbound'
      : nativeDelta > 0n
      ? 'inbound'
      : tokenTransfers.length > 0
      ? 'unknown'
      : 'unknown',
    height: safeInteger(value.slot, 'rpc_response_invalid'),
    nativeAmountAtomic: absBigInt(nativeDelta).toString(),
    tokenTransfers,
    status: value.meta.err === null || value.meta.err === undefined ? 'confirmed' : 'failed',
  })
}

function solanaAccountKey(value: unknown): string {
  if (typeof value === 'string') return value
  if (isRecord(value) && typeof value.pubkey === 'string') return value.pubkey
  throw new SafeWorkerError('rpc_response_invalid')
}

function solanaIntegerArray(value: unknown): bigint[] {
  if (!Array.isArray(value)) return []
  return value.map((entry) => BigInt(nonNegativeInt64Text(entry, 'rpc_response_invalid')))
}

function solanaTokenTransfers(
  address: string,
  preValue: unknown,
  postValue: unknown,
): TokenTransfer[] {
  const before = solanaTokenBalanceMap(address, preValue)
  const after = solanaTokenBalanceMap(address, postValue)
  const delta = (after.get(solanaToken.identifier) ?? 0n) -
    (before.get(solanaToken.identifier) ?? 0n)
  if (delta === 0n) return []
  return [{
    tokenStandard: solanaToken.standard,
    tokenIdentifier: solanaToken.identifier,
    tokenSymbol: solanaToken.symbol,
    tokenDecimals: solanaToken.decimals,
    amountAtomic: absBigInt(delta).toString(),
    counterpartyAddress: '',
  }]
}

function solanaTokenBalanceMap(address: string, value: unknown): Map<string, bigint> {
  const balances = new Map<string, bigint>()
  if (!Array.isArray(value)) return balances
  for (const raw of value) {
    if (
      !isRecord(raw) || raw.owner !== address || typeof raw.mint !== 'string' ||
      !isRecord(raw.uiTokenAmount) || typeof raw.uiTokenAmount.amount !== 'string' ||
      !/^\d{1,20}$/.test(raw.uiTokenAmount.amount)
    ) continue
    balances.set(
      raw.mint,
      (balances.get(raw.mint) ?? 0n) + BigInt(raw.uiTokenAmount.amount),
    )
  }
  return balances
}

async function syncTronTransactions(
  rows: AddressRow[],
  mode: RunMode,
  cursor: CursorRow,
  addressCursors: Map<string, number>,
  budget: RPCBudget,
): Promise<TransactionResult> {
  if (rows.length === 0) {
    return emptyTransactionResult(cursor.lastScanned, cursor.lastFinalized)
  }
  const latestBlock = await tronRPC('/wallet/getnowblock', {}, budget)
  const latest = tronBlockHeight(latestBlock)
  const maxBlocks = Math.min(
    mode === 'backfill' ? edgeBlockLimits.tron.backfill : edgeBlockLimits.tron.live,
    budget.remainingRequests(),
  )
  if (maxBlocks < 1) throw new SafeWorkerError('rpc_budget_exhausted')
  const range = blockRange(
    mode,
    requestCursorHeight(cursor, rows, addressCursors, mode),
    latest,
    maxBlocks,
  )
  if (!range) return emptyTransactionResult(cursor.lastScanned, cursor.lastFinalized)
  const watched = await tronWatchedAddresses(rows.map((row) => ({
    addressHash: row.address_hash,
    address: row.address,
  })))
  const result = await scanTronBlocks({
    range,
    watched,
    token: tronToken,
    fetchBlock: async (height) => await tronRPC('/wallet/getblockbynum', { num: height }, budget),
    errorCode: safeErrorCode,
  })
  return {
    records: result.records.map(tronTransactionRecord),
    blocks: result.blocks.map((block) => ({ ...block, chain: 'tron' })),
    lastScanned: result.lastScanned,
    lastFinalized: result.lastFinalized,
    tokenTransfers: result.tokenTransfers,
    failed: result.failed,
    errors: result.errors,
    metadataUpdates: completedBackfillMetadata(mode, rows, result.lastScanned, result.failed),
  }
}

function tronTransactionRecord(record: TronTransactionRecord): TransactionRecord {
  return {
    chain: 'tron',
    addressHash: record.addressHash,
    occurredAt: record.occurredAt,
    txHash: record.txHash,
    direction: record.direction,
    status: record.status,
    blockHeight: record.blockHeight,
    nativeAmountAtomic: record.nativeAmountAtomic,
    nativeSymbol: symbols.tron,
    feeAtomic: '0',
    counterpartyAddress: record.counterpartyAddress,
    tokenTransfers: record.tokenTransfers,
  }
}

function mergeTransactionRecords(records: TransactionRecord[]): TransactionRecord[] {
  const merged = new Map<string, TransactionRecord>()
  for (const record of records) {
    validateTransactionRecord(record)
    const key = `${record.chain}\0${record.addressHash}\0${record.txHash}`
    const existing = merged.get(key)
    if (!existing) {
      merged.set(key, { ...record, tokenTransfers: [...record.tokenTransfers] })
      continue
    }
    if (existing.nativeAmountAtomic === '0' && record.nativeAmountAtomic !== '0') {
      existing.nativeAmountAtomic = record.nativeAmountAtomic
      existing.feeAtomic = record.feeAtomic
    }
    if (existing.direction === 'unknown' && record.direction !== 'unknown') {
      existing.direction = record.direction
    } else if (existing.direction !== record.direction && record.direction !== 'unknown') {
      existing.direction = existing.direction === 'self' || record.direction === 'self'
        ? 'self'
        : existing.direction
    }
    if (!existing.counterpartyAddress && record.counterpartyAddress) {
      existing.counterpartyAddress = record.counterpartyAddress
    }
    if (record.status === 'failed') existing.status = 'failed'
    existing.blockHeight = record.blockHeight
    existing.occurredAt = record.occurredAt
    existing.tokenTransfers.push(...record.tokenTransfers)
  }
  const values = [...merged.values()]
  for (const record of values) validateTransactionRecord(record)
  return values
}

function validateTransactionRecord(record: TransactionRecord): void {
  if (
    !chains.includes(record.chain) ||
    !/^[0-9a-f]{64}$/.test(record.addressHash) ||
    !record.txHash || record.txHash.length > 256 ||
    !Number.isFinite(record.occurredAt.getTime()) ||
    !Number.isSafeInteger(record.blockHeight) || record.blockHeight < 0 ||
    !/^\d+$/.test(record.nativeAmountAtomic) ||
    !/^\d+$/.test(record.feeAtomic) ||
    record.counterpartyAddress.length > 128 ||
    !['inbound', 'outbound', 'self', 'unknown'].includes(record.direction) ||
    !['pending', 'confirmed', 'failed', 'dropped'].includes(record.status) ||
    record.tokenTransfers.length > 256
  ) throw new SafeWorkerError('rpc_response_invalid')
  for (const transfer of record.tokenTransfers) {
    if (
      !transfer.tokenStandard || !transfer.tokenIdentifier || !transfer.tokenSymbol ||
      !Number.isSafeInteger(transfer.tokenDecimals) || transfer.tokenDecimals < 0 ||
      !/^\d+$/.test(transfer.amountAtomic) ||
      transfer.counterpartyAddress.length > 128
    ) throw new SafeWorkerError('rpc_response_invalid')
  }
}

function validateChainBlock(chain: Chain, block: ChainBlock): void {
  if (
    block.chain !== chain ||
    !Number.isSafeInteger(block.height) || block.height < 0 ||
    !block.hash || block.hash.length > 256 ||
    block.parentHash.length > 256 ||
    (block.timestamp !== undefined && !Number.isFinite(block.timestamp.getTime()))
  ) throw new SafeWorkerError('rpc_response_invalid')
}
