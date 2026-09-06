/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { GroupMemberRole } from '@/lib/types'

export const GROUP_INVITE_MAX_MEMBERS = 50
const MAX_IDENTITY_CHARS = 256
const MAX_TITLE_CHARS = 320
const MAX_DESCRIPTION_CHARS = 960
const GROUP_KEY_BYTES = 32

export interface GroupInviteMember {
  identityId: string
  role: GroupMemberRole
  walletAddress?: string | null
  displayName?: string | null
  joinedEpoch: number
}

export interface GroupInviteEnvelope {
  v: 2
  type: 'group_sender_key_distribution'
  groupId: string
  recipientIdentityId: string
  distributionId: string
  keyVersion: number
  rotationRevision: number
  keyBase64?: string
  title: string
  description?: string | null
  avatarUrl?: string | null
  disappearingTimerMs?: number | null
  createdAt: string
  members: GroupInviteMember[]
}

export interface GroupCiphertextPayload {
  id: string
  senderIdentityId: string
  distributionId: string
  keyVersion: number
  groupRevision: number
  contentType: 'text' | 'reaction' | 'deletion'
  ciphertext: string
  nonce: string
  tag: string
  signature: string
  createdAt: string
  disappearingDurationMs?: number | null
  disappearingTrigger?: 'after_send' | 'after_read' | null
}

export interface GroupCiphertextEnvelope {
  v: 2
  type: 'group_ciphertext'
  groupId: string
  recipientIdentityId: string
  payload: GroupCiphertextPayload
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNonEmptyString(value: unknown, max = MAX_IDENTITY_CHARS): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function isMemberRole(value: unknown): value is GroupMemberRole {
  return value === 'owner' || value === 'admin' || value === 'member'
}

export function isGroupInviteMember(value: unknown): value is GroupInviteMember {
  if (!isRecord(value) || !isNonEmptyString(value.identityId) || !isMemberRole(value.role)) {
    return false
  }
  if (value.walletAddress != null && typeof value.walletAddress !== 'string') {
    return false
  }
  if (value.displayName != null && typeof value.displayName !== 'string') {
    return false
  }
  return isPositiveInteger(value.joinedEpoch)
}

export function isGroupInviteEnvelope(value: unknown): value is GroupInviteEnvelope {
  if (!isRecord(value) || value.v !== 2 || value.type !== 'group_sender_key_distribution') {
    return false
  }
  if (
    !isNonEmptyString(value.groupId)
    || !isNonEmptyString(value.recipientIdentityId)
    || !isNonEmptyString(value.distributionId)
    || !isPositiveInteger(value.keyVersion)
    || !isPositiveInteger(value.rotationRevision)
    || !isNonEmptyString(value.title, MAX_TITLE_CHARS)
    || !isNonEmptyString(value.createdAt)
    || !Array.isArray(value.members)
    || value.members.length > GROUP_INVITE_MAX_MEMBERS
    || !value.members.every(isGroupInviteMember)
  ) {
    return false
  }
  const identities = value.members.map((member) => member.identityId)
  if (new Set(identities).size !== identities.length) {
    return false
  }
  if (value.keyBase64 != null && !isNonEmptyString(value.keyBase64, 128)) {
    return false
  }
  if (value.description != null && typeof value.description !== 'string') {
    return false
  }
  if (value.description && value.description.length > MAX_DESCRIPTION_CHARS) {
    return false
  }
  if (value.avatarUrl != null && typeof value.avatarUrl !== 'string') {
    return false
  }
  if (value.disappearingTimerMs != null && !isPositiveInteger(value.disappearingTimerMs)) {
    return false
  }
  return true
}

export function isGroupCiphertextEnvelope(value: unknown): value is GroupCiphertextEnvelope {
  if (!isRecord(value) || value.v !== 2 || value.type !== 'group_ciphertext') {
    return false
  }
  if (
    !isNonEmptyString(value.groupId)
    || !isNonEmptyString(value.recipientIdentityId)
    || !isRecord(value.payload)
  ) {
    return false
  }
  const payload = value.payload
  return (
    isNonEmptyString(payload.id)
    && isNonEmptyString(payload.senderIdentityId)
    && isNonEmptyString(payload.distributionId)
    && isPositiveInteger(payload.keyVersion)
    && isPositiveInteger(payload.groupRevision)
    && (payload.contentType === 'text'
      || payload.contentType === 'reaction'
      || payload.contentType === 'deletion')
    && isNonEmptyString(payload.ciphertext, 96 * 1024)
    && isNonEmptyString(payload.nonce, 64)
    && isNonEmptyString(payload.tag, 64)
    && isNonEmptyString(payload.signature, 16 * 1024)
    && isNonEmptyString(payload.createdAt)
    && (payload.disappearingDurationMs == null || isPositiveInteger(payload.disappearingDurationMs))
    && (payload.disappearingTrigger == null
      || payload.disappearingTrigger === 'after_send'
      || payload.disappearingTrigger === 'after_read')
  )
}

export function isGroupEpochKeyBytes(key: Uint8Array): boolean {
  return key.byteLength === GROUP_KEY_BYTES
}
