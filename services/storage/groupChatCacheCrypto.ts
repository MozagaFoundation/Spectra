/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { ChatMessage, GroupConversation } from '@/lib/types'
import { normalizeAccountStorageScope } from '@/lib/accountScope'
import {
  buildLocalCacheAad,
  openLocalCacheText,
  sealLocalCacheText,
  type LocalCacheCipher,
} from './localCacheCrypto'

type SealedGroupMessageRecord = {
  v: 1
  kind: 'group-message'
  id: string
  conversationId: string
  senderId: string
  timestamp: number
  cipher: LocalCacheCipher
}

type SealedGroupConversationRecord = {
  v: 1
  kind: 'group-conversation'
  id: string
  groupId: string
  createdAt: number
  updatedAt?: number
  cipher: LocalCacheCipher
}

function requireScope(walletAddress: string): string {
  const scope = normalizeAccountStorageScope(walletAddress)
  if (!scope) {
    throw new Error('Group cache wallet scope is required')
  }
  return scope
}

function isCipher(value: unknown): value is LocalCacheCipher {
  if (!value || typeof value !== 'object') return false
  const cipher = value as Partial<LocalCacheCipher>
  return cipher.v === 1
    && cipher.algorithm === 'AES-256-GCM'
    && typeof cipher.ciphertext === 'string'
    && typeof cipher.iv === 'string'
}

export function isSealedGroupMessageRecord(value: unknown): value is SealedGroupMessageRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<SealedGroupMessageRecord>
  return record.v === 1
    && record.kind === 'group-message'
    && typeof record.id === 'string'
    && typeof record.conversationId === 'string'
    && typeof record.senderId === 'string'
    && typeof record.timestamp === 'number'
    && isCipher(record.cipher)
}

export function isSealedGroupConversationRecord(
  value: unknown,
): value is SealedGroupConversationRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<SealedGroupConversationRecord>
  return record.v === 1
    && record.kind === 'group-conversation'
    && typeof record.id === 'string'
    && typeof record.groupId === 'string'
    && typeof record.createdAt === 'number'
    && isCipher(record.cipher)
}

export async function sealGroupMessageRecord(
  walletAddress: string,
  groupId: string,
  message: ChatMessage,
): Promise<SealedGroupMessageRecord> {
  const scope = requireScope(walletAddress)
  const aad = buildLocalCacheAad([
    'spectra',
    'group-message',
    'v1',
    scope,
    groupId,
    message.id,
    message.senderId,
  ])
  return {
    v: 1,
    kind: 'group-message',
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    timestamp: message.timestamp,
    cipher: await sealLocalCacheText(scope, 'group', JSON.stringify(message), aad),
  }
}

export async function openGroupMessageRecord(
  walletAddress: string,
  groupId: string,
  record: SealedGroupMessageRecord,
): Promise<ChatMessage> {
  const scope = requireScope(walletAddress)
  const aad = buildLocalCacheAad([
    'spectra',
    'group-message',
    'v1',
    scope,
    groupId,
    record.id,
    record.senderId,
  ])
  const parsed = JSON.parse(
    await openLocalCacheText(scope, 'group', record.cipher, aad),
  ) as ChatMessage
  if (
    parsed.id !== record.id
    || parsed.conversationId !== record.conversationId
    || parsed.senderId !== record.senderId
    || parsed.timestamp !== record.timestamp
  ) {
    throw new Error('Group message cache metadata mismatch')
  }
  return parsed
}

export async function sealGroupConversationRecord(
  walletAddress: string,
  conversation: GroupConversation,
): Promise<SealedGroupConversationRecord> {
  const scope = requireScope(walletAddress)
  const aad = buildLocalCacheAad([
    'spectra',
    'group-conversation',
    'v1',
    scope,
    conversation.groupId,
  ])
  return {
    v: 1,
    kind: 'group-conversation',
    id: conversation.id,
    groupId: conversation.groupId,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    cipher: await sealLocalCacheText(scope, 'group', JSON.stringify(conversation), aad),
  }
}

export async function openGroupConversationRecord(
  walletAddress: string,
  record: SealedGroupConversationRecord,
): Promise<GroupConversation> {
  const scope = requireScope(walletAddress)
  const aad = buildLocalCacheAad([
    'spectra',
    'group-conversation',
    'v1',
    scope,
    record.groupId,
  ])
  const parsed = JSON.parse(
    await openLocalCacheText(scope, 'group', record.cipher, aad),
  ) as GroupConversation
  if (
    parsed.id !== record.id
    || parsed.groupId !== record.groupId
    || parsed.createdAt !== record.createdAt
  ) {
    throw new Error('Group conversation cache metadata mismatch')
  }
  return parsed
}
