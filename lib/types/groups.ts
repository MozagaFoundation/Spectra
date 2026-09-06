/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { GroupMemberRole, Conversation } from './messaging'

export interface GroupConversation extends Conversation {
  type: 'group'
  groupId: string
  title: string
  memberIds: string[]
  memberCount: number
  myRole: GroupMemberRole
  maxMembers: number
  revision: number
  distributionId: string
  epoch: number
  protocolVersion: 2
  rotationRequired: boolean
  pendingTransitionId?: string
}

export interface GroupChatMember {
  groupId: string
  identityId: string
  walletAddress?: string
  displayName?: string
  role: GroupMemberRole
  joinedEpoch: number
  leftEpoch?: number
  joinedAt: number
  updatedAt: number
}
