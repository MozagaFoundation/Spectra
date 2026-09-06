/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { bytesToBase64, generateRandomBytes, generateUUID } from '@spectra/core-crypto'
import {
  clearPendingGroupEpoch,
  listPendingGroupEpochs,
  storeGroupEpochKey,
  storePendingGroupEpoch,
} from './epochKeyringStorage'
import type { PendingGroupEpochSecret } from '@/services/storage/groupEpochKeyringCrypto'

type SendControlEnvelope = (recipientIdentityId: string, envelope: string) => Promise<void>
type BuildEnvelope = (
  recipientIdentityId: string,
  pending: PendingGroupEpochSecret,
  includeKey: boolean,
) => string

let currentIdentityId: string | null = null
let sendControlEnvelope: SendControlEnvelope | null = null
const transitionExecutions = new Map<string, Promise<PendingGroupEpochSecret>>()

export function configureGroupEpochTransitions(
  identityId: string | null,
  sender: SendControlEnvelope | null,
): void {
  currentIdentityId = identityId
  sendControlEnvelope = sender
  if (!identityId || !sender) {
    transitionExecutions.clear()
  }
}

function requireConfiguration(): {
  identityId: string
  sender: SendControlEnvelope
} {
  if (!currentIdentityId || !sendControlEnvelope) {
    throw new Error('Group epoch transitions are not configured')
  }
  return { identityId: currentIdentityId, sender: sendControlEnvelope }
}

export async function beginLocalEpochDistribution(params: {
  groupId: string
  epoch: number
  rosterHash: string
  title: string
  description?: string | null
  avatarUrl?: string | null
  disappearingTimerMs?: number | null
  createdAtIso: string
  members: NonNullable<PendingGroupEpochSecret['members']>
  recipientIdentityIds: string[]
  removedIdentityIds?: string[]
}): Promise<PendingGroupEpochSecret> {
  const { identityId } = requireConfiguration()
  const now = Date.now()
  const pending: PendingGroupEpochSecret = {
    schemaVersion: 1,
    transitionId: generateUUID(),
    groupId: params.groupId,
    epoch: params.epoch,
    distributionId: generateUUID(),
    keyBase64: bytesToBase64(generateRandomBytes(32)),
    rosterHash: params.rosterHash,
    recipientIdentityIds: [...params.recipientIdentityIds].filter((id) => id !== identityId).sort(),
    deliveredIdentityIds: [],
    removedIdentityIds: [...(params.removedIdentityIds ?? [])].sort(),
    title: params.title,
    description: params.description ?? null,
    avatarUrl: params.avatarUrl ?? null,
    disappearingTimerMs: params.disappearingTimerMs ?? null,
    createdAtIso: params.createdAtIso,
    members: params.members,
    createdAt: now,
    updatedAt: now,
  }
  await storePendingGroupEpoch(pending)
  await storeGroupEpochKey({
    schemaVersion: 1,
    groupId: pending.groupId,
    epoch: pending.epoch,
    distributionId: pending.distributionId,
    keyBase64: pending.keyBase64,
    transitionId: pending.transitionId,
    rosterHash: pending.rosterHash,
    createdAt: pending.createdAt,
  })
  return pending
}

export async function distributeLocalEpochPackages(params: {
  groupId: string
  epoch: number
  rosterHash: string
  title: string
  description?: string | null
  avatarUrl?: string | null
  disappearingTimerMs?: number | null
  createdAtIso: string
  members: NonNullable<PendingGroupEpochSecret['members']>
  recipientIdentityIds: string[]
  removedIdentityIds?: string[]
  buildEnvelope: BuildEnvelope
}): Promise<PendingGroupEpochSecret> {
  const pending = await beginLocalEpochDistribution(params)
  return executeLocalEpochDistribution(pending, params.buildEnvelope)
}

export function executeLocalEpochDistribution(
  pending: PendingGroupEpochSecret,
  buildEnvelope: BuildEnvelope,
): Promise<PendingGroupEpochSecret> {
  const existing = transitionExecutions.get(pending.transitionId)
  if (existing) return existing
  const execution = deliverPendingPackages(pending, buildEnvelope).finally(() => {
    transitionExecutions.delete(pending.transitionId)
  })
  transitionExecutions.set(pending.transitionId, execution)
  return execution
}

async function deliverPendingPackages(
  pending: PendingGroupEpochSecret,
  buildEnvelope: BuildEnvelope,
): Promise<PendingGroupEpochSecret> {
  const { sender } = requireConfiguration()
  const delivered = new Set(pending.deliveredIdentityIds)
  const keyRecipients = pending.recipientIdentityIds.filter((id) => !delivered.has(id))
  for (const recipientIdentityId of keyRecipients) {
    await sender(recipientIdentityId, buildEnvelope(recipientIdentityId, pending, true))
    delivered.add(recipientIdentityId)
    pending = {
      ...pending,
      deliveredIdentityIds: [...delivered].sort(),
      updatedAt: Date.now(),
    }
    await storePendingGroupEpoch(pending)
  }
  for (const recipientIdentityId of pending.removedIdentityIds ?? []) {
    if (delivered.has(`removed:${recipientIdentityId}`)) continue
    await sender(recipientIdentityId, buildEnvelope(recipientIdentityId, pending, false))
    delivered.add(`removed:${recipientIdentityId}`)
    pending = {
      ...pending,
      deliveredIdentityIds: [...delivered].sort(),
      updatedAt: Date.now(),
    }
    await storePendingGroupEpoch(pending)
  }
  await clearPendingGroupEpoch(pending.groupId, pending.transitionId)
  return pending
}

export async function resumePendingGroupEpochTransitions(
  buildEnvelope: BuildEnvelope,
): Promise<void> {
  requireConfiguration()
  const pending = await listPendingGroupEpochs()
  for (const entry of pending) {
    if (!entry.members?.length) {
      await clearPendingGroupEpoch(entry.groupId, entry.transitionId)
      continue
    }
    await executeLocalEpochDistribution(entry, buildEnvelope)
  }
}
