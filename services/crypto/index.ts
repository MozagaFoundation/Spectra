/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

// Ethereum mainnet

export {
  getEthBalance,
  getEthNonce,
  getEthBlockNumber,
  getGasPrice,
  estimateGas,
  sendEthTransfer,
  sendERC20Transfer,
  signEthereumPersonalMessage,
  getAllTokenBalances,
  getTokenBalance,
  waitForEthTransaction,
  isValidEthAddress,
  formatEth,
  parseEth,
  formatTokenAmount,
  formatEthAddress,
  ETH_RPC_URL,
  ETH_CHAIN_ID,
  EVM_CHAINS,
  getEvmNativeBalance,
  getEvmFeeData,
  getEvmGasPrice,
  estimateEvmGas,
  sendEvmNativeTransfer,
  waitForEvmTransaction,
  ETHEREUM_TOKENS,
} from './ethereumService'

export type { EvmNetworkId, EvmChainConfig, EvmFeeData, EvmSendOptions, TokenInfo, TokenBalance } from './ethereumService'

export {
  CRYPTO_NETWORKS,
  CRYPTO_NETWORK_BY_ID,
  getAvailableNetworks,
  getWalletAddressForNetwork,
  getWalletPrivateKeyForNetwork,
  getWalletPublicKeyForNetwork,
} from './chainRegistry'

export type { CryptoNetworkConfig, CryptoNetworkId } from './chainRegistry'

export {
  getNativeBalanceForNetwork,
  getNativeFeeForNetwork,
  isEvmNetwork,
  isValidAddressForNetwork,
  sendNativeTransferForNetwork,
  waitForNativeTransaction,
} from './nativeChainService'

export type { NativeSendStatus } from './nativeChainService'

export {
  DONATION_RATE_DENOMINATOR,
  getDonationTransferQuote,
  getDonationTreasuryAddress,
} from './donationTransfer'

export type { DonationNetworkId, DonationTransferQuote } from './donationTransfer'

export {
  loadPendingCryptoTransactions,
  mergePendingCryptoTransactions,
  pruneIndexedPendingCryptoTransactions,
  recordPendingCryptoTransaction,
} from './pendingTransactions'

export type { PendingCryptoTransaction, PendingCryptoTransactionInput } from './pendingTransactions'

export {
  getBitcoinBalance,
  isValidBitcoinAddress,
  sendBitcoinTransfer,
  waitForBitcoinTransaction,
  formatBitcoin,
  parseBitcoin,
} from './bitcoinService'

export {
  getAllSolanaTokenBalances,
  getSplTokenBalance,
  sendSplTokenTransfer,
  getAssociatedTokenAddress,
  buildSplTransferCheckedData,
  parseSplTokenAccountsResponse,
  getSolanaBalance,
  isValidSolanaAddress,
  sendSolanaTransfer,
  waitForSolanaTransaction,
  formatSol,
  parseSol,
} from './solanaService'

export {
  getAllTronTokenBalances,
  getTrc20TokenBalance,
  sendTrc20Transfer,
  buildTrc20BalanceOfParameter,
  buildTrc20TransferParameter,
  getTronBalance,
  isValidTronAddress,
  sendTronTransfer,
  waitForTronTransaction,
  formatTrx,
  parseTrx,
} from './tronService'

// Mozaga blockchain

export {
  getBalance,
  getNonce,
  getBlockNumber,
  getChainId,

  sendEXOTransfer,
  waitForTransaction,

  exoToEthAddress,
  ethToExoAddress,
  isValidExoAddress,

  parseEXO,
  formatEXO,

  getAssetInfo,
  getAssetBalance,
  getAssetBySymbol,
  getTotalAssets,
  getUserAssets,
  getKnownAssetBalances,
  transferAsset,
  formatAssetAmount,
  parseAssetAmount,
  getAssetClassName,

  RPC_URL,
  CHAIN_ID,
  MIN_GAS_EXO,
  MIN_GAS_PRICE,
} from './mozagaBlockchain'

export type { AssetInfo, UserAsset } from './mozagaBlockchain'

export {
  TRON_TOKENS,
  SOLANA_TOKENS,
  MOZAGA_KNOWN_ASSET_SYMBOLS,
  formatNetworkTokenAmount,
  parseNetworkTokenAmount,
} from './tokenRegistry'

export type { SupportedToken, NetworkTokenBalance, TokenStandard } from './tokenRegistry'

export {
  loadNativeBalanceForNetwork,
} from './portfolioBalances'

// AMM pools

export {
  getAllPools,
  getMarketPools,

  getAMMPool,
  getSwapQuote,
  getSwapHistory,
  getMarketStats,

  swapAMM,

  calculateSwapOutput,
  calculatePriceImpact,

  formatWeiToEXO,
  parseEXOToWei,
  isNativeAssetId,

  NATIVE_ASSET_ID,
  AMM_SWAP_FEE_BP,
} from './ammPool'

export type {
  AMMPoolInfo,
  SwapQuoteInfo,
  SwapInfo,
  MarketStats,
  MarketPoolsPage,
} from './ammPool'

// Transaction history

export {
  mapLocalWalletIndexTransaction,
  getMozagaExplorerTxUrl,
  getMozagaExplorerAddressUrl,
  getEthExplorerTxUrl,
  getEthExplorerAddressUrl,
  getBitcoinExplorerTxUrl,
  getBitcoinExplorerAddressUrl,
  getSolanaExplorerTxUrl,
  getSolanaExplorerAddressUrl,
  getTronExplorerTxUrl,
  getTronExplorerAddressUrl,
} from './transactionHistory'

export type { TxHistoryItem } from './transactionHistory'

// Markets

export {
  getMarket,
  getActiveMarkets,
  getPrimarySale,
  getParticipation,
  getEffectiveSaleStatus,
  getOrderBook,
  getUserOrders,
  getLPPosition,
  getMarketAssets,
  participateInSale,
  claimSaleTokens,
  claimSaleRefund,
  claimSaleProceeds,
  createLimitOrder,
  cancelLimitOrder,
  executeMatch,
  createAMMPool,
  addLiquidity,
  removeLiquidity,
  claimLPFees,
  getDistributionModeName,
  getSaleStatusName,
  getOrderTypeName,
  getOrderStatusName,
  DistributionMode,
  SaleStatus,
  OrderType as MarketOrderType,
  OrderStatus as MarketOrderStatus,
} from './marketService'

export type {
  MarketInfo,
  PrimarySaleInfo,
  ParticipationInfo,
  EffectiveSaleStatus,
  OrderInfo,
  OrderBookInfo,
  ActiveMarketsPage,
  LPPositionInfo,
} from './marketService'

// Prediction markets

export {
  getPredictionMarket,
  listPredictionMarkets,
  getPredictionOrderBook,
  getDetailedOrderBook,
  getPredictionOrder,
  getPosition,
  getAllPositions,
  getResolution,
  getDispute as getPredictionDispute,
  getPredictionPlatformStats,
  getPredictionUserStats,
  getPredictionPrices,
  getPredictionFeeInfo,
  placeOrder,
  cancelPredictionOrder,
  proposeResolution,
  disputeResolution,
  finalizeResolution,
  redeemWinnings,
  executePredictionMatch,
  executeCrossOutcomeMatch,
  getMarketStatusName,
  getMarketTypeName,
  priceToPercent,
  percentToPrice,
  MarketType,
  PredictionMarketStatus,
  PredictionOrderType,
  PredictionOrderStatus,
  MARKET_CATEGORIES,
  PRICE_PRECISION,
} from './predictionService'

export type {
  PredictionMarketInfo,
  PredictionOrderInfo,
  PositionInfo,
  OrderBookEntry,
  OrderBookSnapshot,
  PredictionPlatformStats,
  PredictionUserStats,
  Resolution,
  Dispute,
  PredictionFeeInfo,
} from './predictionService'

// Escrow

export {
  getEscrowOrder,
  listEscrowOrders,
  getArbitrator,
  getReputation,
  getEscrowDispute,
  getEscrowStats,
  checkOrderExpiration,
  createFiatOrder,
  createConditionOrder,
  acceptEscrowOrder,
  confirmPayment,
  buyerConfirm,
  cancelEscrowOrder,
  raiseDispute,
  resolveDispute,
  formatOrderStatus,
  getStatusColor,
  calculateOrderFee,
  formatTimeRemaining,
  validateEscrowOrderParams,
  EscrowOrderType,
  EscrowOrderStatus,
  EscrowDisputeStatus,
  EscrowResolution,
  MIN_ORDER_EXPIRATION_DAYS,
  MAX_ORDER_EXPIRATION_DAYS,
} from './escrowService'

export type {
  EscrowOrder,
  ArbitratorInfo,
  DisputeInfo,
  ReputationInfo,
  EscrowStats,
} from './escrowService'

// Campaigns

export {
  getCampaign,
  getCampaignsByMarket,
  getActiveCampaigns,
  getCampaignContributors,
  getCampaignStats,
  getUserContributions,
  getUserCreatedCampaigns,
  getRefundableCampaigns,
  canContribute,
  canFinalize,
  createCampaign,
  contributeToCampaign,
  finalizeCampaign,
  claimCampaignRefund,
  getCampaignStatusName,
  getCampaignStatusColor,
  getTimeRemaining,
  hasCampaignEnded,
  hasCampaignStarted,
  calculatePercentFunded,
  formatExoAmount,
  exoToWei,
  validateCampaignParams,
  CampaignStatus,
} from './campaignService'

export type {
  CampaignInfo,
  CampaignListItem,
  CampaignStats,
  ContributorInfo,
  UserContribution,
  RefundableCampaign,
  CanContributeResponse,
  CanFinalizeResponse,
} from './campaignService'

// Crypto receipt messages
export {
  createChainCryptoReceiptMessage,
  isCryptoReceipt,
  parseCryptoReceipt,
  resolveCryptoReceiptNetwork,
  isCryptoReceiptNetworkId,
} from './receipts'

export type { CryptoReceipt, CryptoReceiptStatus } from './receipts'
