/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { backendRequest } from './request'
import { getValidBackendAccessToken } from './session'

export interface GroupRecord {
  id: string
  title: string
  description: string | null
  avatar_url: string | null
  created_by_identity_id: string
  created_by_wallet_address: string | null
  revision: number
  distribution_id: string
  key_version: number
  epoch: number
  protocol_version: number
  member_count: number
  max_members: number
  disappearing_timer_ms: number | null
  disappearing_timer_updated_at: string | null
  disappearing_timer_updated_by: string | null
  created_at: string
  updated_at: string
}

export interface GroupMessageRecord {
  id: string
  group_id: string
  sender_identity_id: string
  distribution_id: string
  key_version: number
  group_revision: number
  content_type: string
  ciphertext: string
  nonce: string
  tag: string
  signature: string
  created_at: string
  server_sequence: number
  expires_at: string | null
  disappearing_duration_ms: number | null
  disappearing_trigger: 'after_send' | 'after_read' | null
}

async function groupWriteRequest<T>(path: string, body: unknown): Promise<T> {
  const accessToken = await getValidBackendAccessToken()
  if (!accessToken) {
    throw new Error('Backend auth token is required')
  }
  return backendRequest<T>(path, { method: 'POST', body }, { accessToken })
}

export function createGroup(request: {
  groupId: string
  actorIdentityId: string
  title: string
  description?: string
  memberIdentityIds: string[]
  distributionId: string
  disappearingTimerMs?: number
}): Promise<GroupRecord> {
  return groupWriteRequest('/v1/groups/create', request)
}

export function updateGroup(request: {
  groupId: string
  actorIdentityId: string
  avatarUrl?: string | null
  disappearingTimerMs?: number | null
}): Promise<GroupRecord> {
  return groupWriteRequest('/v1/groups/update', request)
}

export function insertGroupMessage(request: {
  id: string
  groupId: string
  senderIdentityId: string
  distributionId: string
  keyVersion: number
  groupRevision: number
  contentType: string
  ciphertext: string
  nonce: string
  tag: string
  signature: string
  disappearingDurationMs?: number | null
  disappearingTrigger?: 'after_send' | 'after_read' | null
}): Promise<GroupMessageRecord> {
  return groupWriteRequest('/v1/groups/messages', request)
}
