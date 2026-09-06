/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { backendRequest } from './request'
import { getValidBackendAccessToken } from './session'

export type GroupEpochAction = 'add' | 'remove' | 'leave'

export interface GroupEpochTransition {
  transitionId: string
  groupId: string
  action: GroupEpochAction
  actorIdentityId: string
  targetIdentityIds: string[]
  preMemberIdentityIds: string[]
  postMemberIdentityIds: string[]
  rosterHash: string
  fromRevision: number
  toRevision: number
  fromEpoch: number
  toEpoch: number
  rotatorIdentityId?: string
  status: 'pending' | 'activated' | 'cancelled'
  distributionId?: string
  packageRecipientIds?: string[]
  createdAt: string
  expiresAt: string
  activatedAt?: string
}

async function groupEpochRequest<T>(path: string, body: unknown): Promise<T> {
  const accessToken = await getValidBackendAccessToken()
  if (!accessToken) {
    throw new Error('Backend auth token is required')
  }
  return backendRequest<T>(path, { method: 'POST', body }, { accessToken })
}

export function beginGroupEpochTransition(request: {
  groupId: string
  actorIdentityId: string
  action: GroupEpochAction
  targetIdentityIds?: string[]
  expectedRevision: number
}): Promise<GroupEpochTransition> {
  return groupEpochRequest('/v1/groups/epochs/begin', request)
}

export function activateGroupEpochTransition(request: {
  transitionId: string
  actorIdentityId: string
  distributionId: string
  packageRecipientIds: string[]
}): Promise<GroupEpochTransition> {
  return groupEpochRequest('/v1/groups/epochs/activate', request)
}

export function getGroupEpochTransition(
  transitionId: string,
  identityId: string,
): Promise<GroupEpochTransition> {
  return groupEpochRequest('/v1/groups/epochs/status', { transitionId, identityId })
}

export async function listPendingGroupEpochTransitions(
  identityId: string,
): Promise<GroupEpochTransition[]> {
  const response = await groupEpochRequest<{ transitions: GroupEpochTransition[] }>(
    '/v1/groups/epochs/pending',
    { identityId },
  )
  return response.transitions
}

export function claimGroupEpochTransition(
  transitionId: string,
  actorIdentityId: string,
): Promise<GroupEpochTransition> {
  return groupEpochRequest('/v1/groups/epochs/claim', { transitionId, actorIdentityId })
}
