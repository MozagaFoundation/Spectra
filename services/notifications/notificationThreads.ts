/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

type NotificationData = Record<string, unknown> | undefined | null

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

export function getNotificationThreadKey(data: NotificationData): string | null {
  if (!data) return null

  const conversationId = asString(data.conversationId)
  if (conversationId) {
    const localWalletAddress = asString(data.localWalletAddress)
    return localWalletAddress ? `local:${localWalletAddress}:${conversationId}` : conversationId
  }

  const groupId = asString(data.groupId)
  if (groupId) {
    return `group:${groupId}`
  }

  const remoteIdentityId = asString(data.remoteIdentityId)
  if (remoteIdentityId) {
    const localWalletAddress = asString(data.localWalletAddress)
    return localWalletAddress ? `local:${localWalletAddress}:${remoteIdentityId}` : remoteIdentityId
  }

  const remoteWalletAddress = asString(data.remoteWalletAddress)
  if (remoteWalletAddress) {
    const localWalletAddress = asString(data.localWalletAddress)
    return localWalletAddress ? `local:${localWalletAddress}:${remoteWalletAddress}` : remoteWalletAddress
  }

  return null
}

export function matchesNotificationThreadKey(
  threadKey: string,
  data: NotificationData,
): boolean {
  if (!threadKey || !data) return false

  const candidateThreadKey = getNotificationThreadKey(data)
  if (candidateThreadKey === threadKey) {
    return true
  }

  const conversationId = asString(data.conversationId)
  const remoteIdentityId = asString(data.remoteIdentityId)
  const remoteWalletAddress = asString(data.remoteWalletAddress)
  const groupId = asString(data.groupId)
  const localWalletAddress = asString(data.localWalletAddress)
  const scopedConversationId = localWalletAddress && conversationId
    ? `local:${localWalletAddress}:${conversationId}`
    : null
  const scopedRemoteIdentityId = localWalletAddress && remoteIdentityId
    ? `local:${localWalletAddress}:${remoteIdentityId}`
    : null
  const scopedRemoteWalletAddress = localWalletAddress && remoteWalletAddress
    ? `local:${localWalletAddress}:${remoteWalletAddress}`
    : null

  return [
    conversationId,
    scopedConversationId,
    remoteIdentityId,
    scopedRemoteIdentityId,
    remoteWalletAddress,
    scopedRemoteWalletAddress,
    groupId,
    groupId ? `group:${groupId}` : null,
  ].includes(threadKey)
}
