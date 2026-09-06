/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { formatBigIntAmount, parseDecimalToBigInt } from '@/lib/amounts'
import { translate } from '@/lib/i18n'
import {
  concatBytes,
  writeBigInt,
  writeEntityId,
  writeUint16,
  writeUint64,
  writeUint8,
} from './encoding'
import { rpcCall, signAndSendTransaction } from './shared'

const CAMPAIGN_STATE_ADDR = '0x0000000000000000000000000000000000000007'

const CAMPAIGN_TX_TYPE = {
  CREATE_CAMPAIGN: 0x56,
  CONTRIBUTE: 0x57,
  FINALIZE_CAMPAIGN: 0x58,
  CLAIM_REFUND: 0x59,
} as const

export enum CampaignStatus { Active = 0, Succeeded = 1, Failed = 2, Finalizing = 3 }

export interface CampaignInfo {
  campaignId: string; marketId: string; creator: string; title: string;
  descriptionHash: string; fundingGoal: string; flexibleGoal: string;
  startTime: number; endTime: number; raisedAmount: string;
  contributorCount: number; status: number; createdAt: number;
  maxPerContributor: string;
}

export interface CampaignListItem {
  campaignId: string; marketId: string; creator: string; title: string;
  fundingGoal: string; flexibleGoal: string; raisedAmount: string;
  contributorCount: number; status: number; endTime: number; percentFunded: number;
}

export interface CampaignStats {
  totalCampaigns: number; activeCampaigns: number; succeededCount: number;
  failedCount: number; totalRaised: string; totalContributors: number;
}

export interface ContributorInfo { contributor: string; amount: string; refunded: boolean }

export interface UserContribution {
  campaignId: string; campaignTitle: string; amount: string;
  status: number; refunded: boolean; endTime: number;
}

export interface RefundableCampaign { campaignId: string; campaignTitle: string; amount: string }

export interface CanContributeResponse {
  canContribute: boolean; reason?: string; maxAllowed?: string;
  currentContribution?: string; remainingAllowance?: string;
}

export interface CanFinalizeResponse {
  canFinalize: boolean; reason?: string; willSucceed?: boolean;
  timeRemaining?: number; raisedAmount?: string; flexibleGoal?: string;
}

// RPC reads

export async function getCampaign(campaignId: string): Promise<CampaignInfo | null> {
  try {
    return await rpcCall<CampaignInfo>('campaign_getCampaign', [campaignId])
  } catch (error: any) {
    if (!error?.message?.includes('not found')) console.error('Error fetching campaign:', error)
    return null
  }
}

export async function getCampaignsByMarket(
  marketId: string,
  offset: number = 0,
  limit: number = 50,
): Promise<CampaignListItem[]> {
  try {
    return (await rpcCall<CampaignListItem[]>('campaign_getCampaignsByMarket', [marketId, offset, limit])) || []
  } catch (error) {
    console.error('Error fetching campaigns by market:', error)
    return []
  }
}

export async function getActiveCampaigns(
  offset: number = 0,
  limit: number = 50,
): Promise<CampaignListItem[]> {
  try {
    return (await rpcCall<CampaignListItem[]>('campaign_getActiveCampaigns', [offset, limit])) || []
  } catch (error) {
    console.error('Error fetching active campaigns:', error)
    return []
  }
}

export async function getCampaignContributors(
  campaignId: string,
  offset: number = 0,
  limit: number = 50,
): Promise<ContributorInfo[]> {
  try {
    return (await rpcCall<ContributorInfo[]>('campaign_getCampaignContributors', [campaignId, offset, limit])) || []
  } catch (error) {
    console.error('Error fetching campaign contributors:', error)
    return []
  }
}

export async function getCampaignStats(): Promise<CampaignStats | null> {
  try {
    return await rpcCall<CampaignStats>('campaign_getStats', [])
  } catch (error) {
    console.error('Error fetching campaign stats:', error)
    return null
  }
}

export async function getUserContributions(
  address: string,
  marketId?: string,
  offset: number = 0,
  limit: number = 50,
): Promise<UserContribution[]> {
  try {
    return (await rpcCall<UserContribution[]>('campaign_getUserContributions', [address, marketId ?? null, offset, limit])) || []
  } catch (error) {
    console.error('Error fetching user contributions:', error)
    return []
  }
}

export async function getUserCreatedCampaigns(
  address: string,
  marketId?: string,
  offset: number = 0,
  limit: number = 50,
): Promise<CampaignListItem[]> {
  try {
    return (await rpcCall<CampaignListItem[]>('campaign_getUserCreatedCampaigns', [address, marketId ?? null, offset, limit])) || []
  } catch (error) {
    console.error('Error fetching user created campaigns:', error)
    return []
  }
}

export async function getRefundableCampaigns(
  address: string,
  marketId?: string,
): Promise<RefundableCampaign[]> {
  try {
    return (await rpcCall<RefundableCampaign[]>('campaign_getRefundableCampaigns', [address, marketId ?? null])) || []
  } catch (error) {
    console.error('Error fetching refundable campaigns:', error)
    return []
  }
}

export async function canContribute(
  campaignId: string,
  address: string,
  amount: string,
): Promise<CanContributeResponse> {
  try {
    return await rpcCall<CanContributeResponse>('campaign_canContribute', [campaignId, address, amount])
  } catch (error) {
    console.error('Error checking can contribute:', error)
    return { canContribute: false, reason: 'Unable to check eligibility' }
  }
}

export async function canFinalize(campaignId: string): Promise<CanFinalizeResponse> {
  try {
    return await rpcCall<CanFinalizeResponse>('campaign_canFinalize', [campaignId])
  } catch (error) {
    console.error('Error checking can finalize:', error)
    return { canFinalize: false, reason: 'Unable to check finalization status' }
  }
}

async function signAndSendCampaignTransaction(
  privateKeyHex: string,
  publicKeyHex: string,
  fromAddress: string,
  txData: Uint8Array,
  value: bigint = 0n,
): Promise<{ txHash: string; from: string }> {
  return signAndSendTransaction({
    privateKeyHex,
    publicKeyHex,
    fromAddress,
    toAddress: CAMPAIGN_STATE_ADDR,
    txData,
    value,
  })
}

// Transactions

export async function createCampaign(
  privateKey: string,
  publicKey: string,
  fromAddress: string,
  marketId: string,
  title: string,
  descriptionHash: string,
  fundingGoal: bigint,
  flexibleGoal: bigint,
  startTime: number,
  endTime: number,
  maxPerContributor: bigint,
): Promise<{ txHash: string; from: string }> {
  const titleBytes = new TextEncoder().encode(title)
  const data = concatBytes(
    writeUint8(CAMPAIGN_TX_TYPE.CREATE_CAMPAIGN),
    writeEntityId(marketId),
    writeUint16(titleBytes.length),
    titleBytes,
    writeEntityId(descriptionHash),
    writeBigInt(fundingGoal),
    writeBigInt(flexibleGoal),
    writeUint64(BigInt(startTime)),
    writeUint64(BigInt(endTime)),
    writeBigInt(maxPerContributor),
  )
  return signAndSendCampaignTransaction(privateKey, publicKey, fromAddress, data)
}

export async function contributeToCampaign(
  privateKey: string,
  publicKey: string,
  fromAddress: string,
  campaignId: string,
  amount: bigint,
): Promise<{ txHash: string; from: string }> {
  const data = concatBytes(
    writeUint8(CAMPAIGN_TX_TYPE.CONTRIBUTE),
    writeEntityId(campaignId),
  )
  return signAndSendCampaignTransaction(privateKey, publicKey, fromAddress, data, amount)
}

export async function finalizeCampaign(
  privateKey: string,
  publicKey: string,
  fromAddress: string,
  campaignId: string,
): Promise<{ txHash: string; from: string }> {
  const data = concatBytes(
    writeUint8(CAMPAIGN_TX_TYPE.FINALIZE_CAMPAIGN),
    writeEntityId(campaignId),
  )
  return signAndSendCampaignTransaction(privateKey, publicKey, fromAddress, data)
}

export async function claimCampaignRefund(
  privateKey: string,
  publicKey: string,
  fromAddress: string,
  campaignId: string,
): Promise<{ txHash: string; from: string }> {
  const data = concatBytes(
    writeUint8(CAMPAIGN_TX_TYPE.CLAIM_REFUND),
    writeEntityId(campaignId),
  )
  return signAndSendCampaignTransaction(privateKey, publicKey, fromAddress, data)
}

// Helpers

export function getCampaignStatusName(status: number): string {
  switch (status) {
    case CampaignStatus.Active: return translate('Active', { ns: 'markets' })
    case CampaignStatus.Succeeded: return translate('Succeeded', { ns: 'markets' })
    case CampaignStatus.Failed: return translate('Failed', { ns: 'markets' })
    case CampaignStatus.Finalizing: return translate('Finalizing', { ns: 'markets' })
    default: return translate('Unknown')
  }
}

export function getCampaignStatusColor(status: number): string {
  switch (status) {
    case CampaignStatus.Active: return 'text-blue-500'
    case CampaignStatus.Succeeded: return 'text-green-500'
    case CampaignStatus.Failed: return 'text-red-500'
    case CampaignStatus.Finalizing: return 'text-yellow-500'
    default: return 'text-gray-500'
  }
}

export function getTimeRemaining(endTime: number): string {
  const now = Math.floor(Date.now() / 1000)
  const diff = endTime - now
  if (diff <= 0) return translate('Ended', { ns: 'markets' })
  const days = Math.floor(diff / 86400)
  const hours = Math.floor((diff % 86400) / 3600)
  const minutes = Math.floor((diff % 3600) / 60)
  if (days > 0) {
    return `${translate('duration.days', { count: days })} ${translate('duration.hours', { count: hours })}`
  }
  if (hours > 0) {
    return `${translate('duration.hours', { count: hours })} ${translate('duration.minutes', { count: minutes })}`
  }
  return translate('duration.minutes', { count: minutes })
}

export function hasCampaignEnded(endTime: number): boolean {
  return Math.floor(Date.now() / 1000) >= endTime
}

export function hasCampaignStarted(startTime: number): boolean {
  return Math.floor(Date.now() / 1000) >= startTime
}

export function calculatePercentFunded(raisedAmount: string, fundingGoal: string): number {
  try {
    const raised = BigInt(raisedAmount)
    const goal = BigInt(fundingGoal)
    if (goal === 0n) return 0
    return Number((raised * 10000n) / goal) / 100
  } catch {
    return 0
  }
}

export function formatExoAmount(wei: string, decimals: number = 4): string {
  return formatBigIntAmount(wei, 18, decimals)
}

export function exoToWei(ota: string): bigint {
  return parseDecimalToBigInt(ota, 18) ?? 0n
}

export function validateCampaignParams(
  title: string,
  fundingGoal: bigint,
  flexibleGoal: bigint,
  startTime: number,
  endTime: number,
): { valid: boolean; error?: string } {
  if (!title || title.trim().length === 0)
    return { valid: false, error: translate('Title is required', { ns: 'markets' }) }
  if (title.length > 256)
    return { valid: false, error: translate('Title must be 256 characters or less', { ns: 'markets' }) }
  if (fundingGoal <= 0n)
    return { valid: false, error: translate('Funding goal must be greater than zero', { ns: 'markets' }) }
  if (flexibleGoal < 0n)
    return { valid: false, error: translate('Flexible goal cannot be negative', { ns: 'markets' }) }
  if (flexibleGoal > fundingGoal)
    return { valid: false, error: translate('Flexible goal cannot exceed funding goal', { ns: 'markets' }) }
  const now = Math.floor(Date.now() / 1000)
  if (startTime < now - 60)
    return { valid: false, error: translate('Start time cannot be in the past', { ns: 'markets' }) }
  if (endTime <= startTime)
    return { valid: false, error: translate('End time must be after start time', { ns: 'markets' }) }
  if (endTime - startTime < 86400)
    return { valid: false, error: translate('Campaign must run for at least 1 day', { ns: 'markets' }) }
  if (endTime - startTime > 90 * 86400)
    return { valid: false, error: translate('Campaign cannot run for more than 90 days', { ns: 'markets' }) }
  return { valid: true }
}
