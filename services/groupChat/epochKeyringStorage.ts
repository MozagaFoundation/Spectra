/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { getAppKeyValueStorage } from '@/services/storage/keyValueStorage'
import { base64ToBytes } from '@spectra/identity-vault'
import {
  openGroupEpochKey,
  openPendingGroupEpoch,
  sealGroupEpochKey,
  sealPendingGroupEpoch,
  type GroupEpochKeyEntry,
  type PendingGroupEpochSecret,
} from '@/services/storage/groupEpochKeyringCrypto'
import {
  buildScopedGroupStorageKey,
  clearGroupSenderKeyState,
  getActiveGroupStorageScope,
  getGroupSenderKeyState,
} from './storage'

function epochKey(groupId: string, epoch: number): string {
  return buildScopedGroupStorageKey(`epoch_key_${encodeURIComponent(groupId)}_${epoch}`)
}

function epochPrefix(groupId: string): string {
  return buildScopedGroupStorageKey(`epoch_key_${encodeURIComponent(groupId)}_`)
}

function pendingKey(groupId: string, transitionId: string): string {
  return buildScopedGroupStorageKey(
    `epoch_pending_${encodeURIComponent(groupId)}_${encodeURIComponent(transitionId)}`,
  )
}

function pendingPrefix(groupId: string): string {
  return buildScopedGroupStorageKey(`epoch_pending_${encodeURIComponent(groupId)}_`)
}

function validateKeyBase64(keyBase64: string): void {
  const key = base64ToBytes(keyBase64)
  try {
    if (key.byteLength !== 32) {
      throw new Error('Group epoch key must be 32 bytes')
    }
  } finally {
    key.fill(0)
  }
}

export async function storeGroupEpochKey(entry: GroupEpochKeyEntry): Promise<void> {
  if (entry.epoch < 1 || !Number.isInteger(entry.epoch)) {
    throw new Error('Group epoch must be a positive integer')
  }
  validateKeyBase64(entry.keyBase64)
  const scope = getActiveGroupStorageScope()
  await getAppKeyValueStorage().setItem(epochKey(entry.groupId, entry.epoch), await sealGroupEpochKey(scope, entry))
}

export async function getGroupEpochKey(
  groupId: string,
  epoch: number,
): Promise<GroupEpochKeyEntry | null> {
  const scope = getActiveGroupStorageScope()
  const raw = await getAppKeyValueStorage().getItem(epochKey(groupId, epoch))
  if (raw) {
    const entry = await openGroupEpochKey(scope, groupId, epoch, raw)
    validateKeyBase64(entry.keyBase64)
    return entry
  }

  const pending = await recoverPendingEpochKey(groupId, epoch)
  if (pending) {
    return pending
  }

  const legacy = await getGroupSenderKeyState(groupId)
  if (!legacy || legacy.rotationRevision !== epoch) {
    return null
  }
  const migrated: GroupEpochKeyEntry = {
    schemaVersion: 1,
    groupId,
    epoch,
    distributionId: legacy.distributionId,
    keyBase64: legacy.keyBase64,
    createdAt: legacy.updatedAt,
  }
  await storeGroupEpochKey(migrated)
  await clearGroupSenderKeyState(groupId)
  return migrated
}

async function recoverPendingEpochKey(
  groupId: string,
  epoch: number,
): Promise<GroupEpochKeyEntry | null> {
  const scope = getActiveGroupStorageScope()
  const prefix = pendingPrefix(groupId)
  const keys = (await getAppKeyValueStorage().getAllKeys()).filter((key) => key.startsWith(prefix))
  for (const key of keys) {
    const encodedTransitionId = key.slice(prefix.length)
    if (!encodedTransitionId) continue
    const transitionId = decodeURIComponent(encodedTransitionId)
    const raw = await getAppKeyValueStorage().getItem(key)
    if (!raw) continue
    const pending = await openPendingGroupEpoch(scope, groupId, transitionId, raw)
    if (pending.epoch !== epoch) continue
    const entry: GroupEpochKeyEntry = {
      schemaVersion: 1,
      groupId,
      epoch,
      distributionId: pending.distributionId,
      keyBase64: pending.keyBase64,
      transitionId,
      rosterHash: pending.rosterHash,
      createdAt: pending.createdAt,
    }
    await storeGroupEpochKey(entry)
    await getAppKeyValueStorage().removeItem(key)
    return entry
  }
  return null
}

export async function storePendingGroupEpoch(
  pending: PendingGroupEpochSecret,
): Promise<void> {
  validateKeyBase64(pending.keyBase64)
  const scope = getActiveGroupStorageScope()
  await getAppKeyValueStorage().setItem(
    pendingKey(pending.groupId, pending.transitionId),
    await sealPendingGroupEpoch(scope, pending),
  )
}

export async function getPendingGroupEpoch(
  groupId: string,
  transitionId: string,
): Promise<PendingGroupEpochSecret | null> {
  const scope = getActiveGroupStorageScope()
  const raw = await getAppKeyValueStorage().getItem(pendingKey(groupId, transitionId))
  if (!raw) return null
  const pending = await openPendingGroupEpoch(scope, groupId, transitionId, raw)
  validateKeyBase64(pending.keyBase64)
  return pending
}

export async function listPendingGroupEpochs(): Promise<PendingGroupEpochSecret[]> {
  const scope = getActiveGroupStorageScope()
  const prefix = buildScopedGroupStorageKey('epoch_pending_')
  const keys = (await getAppKeyValueStorage().getAllKeys()).filter((key) => key.startsWith(prefix))
  const pending: PendingGroupEpochSecret[] = []
  for (const key of keys) {
    const encoded = key.slice(prefix.length)
    const separator = encoded.lastIndexOf('_')
    if (separator <= 0) continue
    const groupId = decodeURIComponent(encoded.slice(0, separator))
    const transitionId = decodeURIComponent(encoded.slice(separator + 1))
    const raw = await getAppKeyValueStorage().getItem(key)
    if (!raw) continue
    const entry = await openPendingGroupEpoch(scope, groupId, transitionId, raw)
    validateKeyBase64(entry.keyBase64)
    pending.push(entry)
  }
  return pending
}

export async function clearPendingGroupEpoch(
  groupId: string,
  transitionId: string,
): Promise<void> {
  await getAppKeyValueStorage().removeItem(pendingKey(groupId, transitionId))
}

export async function clearGroupEpochSecrets(groupId: string): Promise<void> {
  const keys = await getAppKeyValueStorage().getAllKeys()
  const keyPrefix = epochPrefix(groupId)
  const transitionPrefix = pendingPrefix(groupId)
  const matching = keys.filter((key) => (
    key.startsWith(keyPrefix) || key.startsWith(transitionPrefix)
  ))
  if (matching.length > 0) {
    await getAppKeyValueStorage().multiRemove(matching)
  }
  await clearGroupSenderKeyState(groupId)
}
