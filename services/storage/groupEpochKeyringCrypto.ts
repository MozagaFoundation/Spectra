/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { LocalCacheCipher } from './localCacheCrypto'
import {
  buildLocalCacheAad,
  openLocalCacheText,
  sealLocalCacheText,
} from './localCacheCrypto'

export interface GroupEpochKeyEntry {
  schemaVersion: 1
  groupId: string
  epoch: number
  distributionId: string
  keyBase64: string
  transitionId?: string
  rosterHash?: string
  createdAt: number
}

export interface PendingGroupEpochMember {
  identityId: string
  role: 'owner' | 'admin' | 'member'
  walletAddress?: string | null
  displayName?: string | null
  joinedEpoch: number
}

export interface PendingGroupEpochSecret {
  schemaVersion: 1
  transitionId: string
  groupId: string
  epoch: number
  distributionId: string
  keyBase64: string
  rosterHash: string
  recipientIdentityIds: string[]
  deliveredIdentityIds: string[]
  removedIdentityIds?: string[]
  title?: string
  description?: string | null
  avatarUrl?: string | null
  disappearingTimerMs?: number | null
  createdAtIso?: string
  members?: PendingGroupEpochMember[]
  createdAt: number
  updatedAt: number
}

interface SealedGroupEpochRecord {
  schemaVersion: 1
  cipher: LocalCacheCipher
}

function epochAad(scope: string, groupId: string, epoch: number): Uint8Array {
  return buildLocalCacheAad([
    'spectra',
    'group-epoch-key',
    'v1',
    scope,
    groupId,
    String(epoch),
  ])
}

function pendingAad(scope: string, groupId: string, transitionId: string): Uint8Array {
  return buildLocalCacheAad([
    'spectra',
    'group-epoch-pending',
    'v1',
    scope,
    groupId,
    transitionId,
  ])
}

export async function sealGroupEpochKey(
  scope: string,
  entry: GroupEpochKeyEntry,
): Promise<string> {
  const cipher = await sealLocalCacheText(
    scope,
    'chat-secret',
    JSON.stringify(entry),
    epochAad(scope, entry.groupId, entry.epoch),
  )
  return JSON.stringify({ schemaVersion: 1, cipher } satisfies SealedGroupEpochRecord)
}

export async function openGroupEpochKey(
  scope: string,
  groupId: string,
  epoch: number,
  raw: string,
): Promise<GroupEpochKeyEntry> {
  const sealed = JSON.parse(raw) as SealedGroupEpochRecord
  if (sealed.schemaVersion !== 1 || !sealed.cipher) {
    throw new Error('Unsupported group epoch key record')
  }
  const plaintext = await openLocalCacheText(
    scope,
    'chat-secret',
    sealed.cipher,
    epochAad(scope, groupId, epoch),
  )
  const entry = JSON.parse(plaintext) as GroupEpochKeyEntry
  if (
    entry.schemaVersion !== 1
    || entry.groupId !== groupId
    || entry.epoch !== epoch
    || !entry.distributionId
    || !entry.keyBase64
  ) {
    throw new Error('Invalid group epoch key record')
  }
  return entry
}

export async function sealPendingGroupEpoch(
  scope: string,
  pending: PendingGroupEpochSecret,
): Promise<string> {
  const cipher = await sealLocalCacheText(
    scope,
    'chat-secret',
    JSON.stringify(pending),
    pendingAad(scope, pending.groupId, pending.transitionId),
  )
  return JSON.stringify({ schemaVersion: 1, cipher } satisfies SealedGroupEpochRecord)
}

export async function openPendingGroupEpoch(
  scope: string,
  groupId: string,
  transitionId: string,
  raw: string,
): Promise<PendingGroupEpochSecret> {
  const sealed = JSON.parse(raw) as SealedGroupEpochRecord
  if (sealed.schemaVersion !== 1 || !sealed.cipher) {
    throw new Error('Unsupported pending group epoch record')
  }
  const plaintext = await openLocalCacheText(
    scope,
    'chat-secret',
    sealed.cipher,
    pendingAad(scope, groupId, transitionId),
  )
  const pending = JSON.parse(plaintext) as PendingGroupEpochSecret
  if (
    pending.schemaVersion !== 1
    || pending.groupId !== groupId
    || pending.transitionId !== transitionId
    || pending.epoch < 1
    || !pending.keyBase64
  ) {
    throw new Error('Invalid pending group epoch record')
  }
  return pending
}
