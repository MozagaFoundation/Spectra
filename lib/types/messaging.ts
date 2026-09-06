/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { MediaAttachment } from './media'
import type { PublicKeyBundle, TrustState } from '@spectra/core-crypto'

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed'
export type MessageDeliveryStage =
  | 'queued'
  | 'relaying'
  | 'relayed'
  | 'awaiting_recipient'
  | 'delivered'
  | 'read'
  | 'failed'
export type ConversationType = 'direct' | 'group'
export type GroupMemberRole = 'owner' | 'admin' | 'member'
export type MessageSystemEvent = 'screenshot_taken'
export type RemoteAccountState = 'deleted'

export interface MessageReaction {
  emoji: string
  senderId: string
  timestamp: number
}

export interface ReplyReference {
  messageId: string
  previewText: string
  senderName: string
  senderId: string
}

export type OneTimeMessageKind = 'text' | 'image' | 'voice_note'
export type OneTimeMessageState = 'locked' | 'consumed'

export interface OneTimeMessage {
  kind: OneTimeMessageKind
  state: OneTimeMessageState
  requiresReveal?: boolean
  consumedAt?: number
}

export interface OneTimeRevealPayload {
  kind: OneTimeMessageKind
  content: string
  attachments?: MediaAttachment[]
}

export type DisappearingMessageTrigger = 'after_send' | 'after_read'
export type DisappearingMessageExpirySource = 'after_send' | 'after_read' | 'send_fallback'

export interface DisappearingMessageTimer {
  durationMs: number
  trigger: DisappearingMessageTrigger
  fallbackDurationMs?: number
  updatedAt?: number
  updatedBy?: string
}

export interface DisappearingMessageState extends DisappearingMessageTimer {
  armedAt?: number
  expiresAt?: number
  fallbackExpiresAt?: number
  expiresFrom?: DisappearingMessageExpirySource
}

export interface ChatSendOptions {
  oneTime?: {
    kind: OneTimeMessageKind
  }
}

export type MessageSendProgress =
  | {
      stage: 'attachment_upload'
      percentage: number
      completed: number
      total: number
    }
  | {
      stage: 'preparing_message' | 'sending_message' | 'caching_locally' | 'complete'
      percentage: number
    }

export type MessageProvenance =
  | 'verified_peer'
  | 'unverified_peer'
  | 'local_system'

export interface ChatMessage {
  id: string
  conversationId: string
  senderId: string
  localIdentityId?: string
  localWalletAddress?: string
  senderName?: string
  senderAvatarUrl?: string
  content: string
  timestamp: number
  localOrderTimestamp?: number
  status?: MessageStatus
  deliveryStage?: MessageDeliveryStage
  deliveryHint?: string
  signatureVerified?: boolean
  provenance?: MessageProvenance
  relayed?: boolean
  serverSequence?: number
  attachments?: MediaAttachment[]
  replyTo?: ReplyReference
  reactions?: MessageReaction[]
  oneTime?: OneTimeMessage
  disappearing?: DisappearingMessageState
  deleted?: boolean
  systemEvent?: MessageSystemEvent
  conversationType?: ConversationType
  groupId?: string
}

export interface Conversation {
  id: string
  type?: ConversationType
  localIdentityId?: string
  localWalletAddress?: string
  localDisplayName?: string
  remoteIdentityId: string
  remoteWalletAddress?: string
  title?: string
  subtitle?: string
  avatarUrl?: string
  groupId?: string
  memberIds?: string[]
  memberCount?: number
  myRole?: GroupMemberRole
  maxMembers?: number
  distributionId?: string
  revision?: number
  lastMessage?: {
    content: string
    timestamp: number
    isOwn: boolean
  }
  hasVisibleActivity?: boolean
  unreadCount: number
  createdAt: number
  updatedAt?: number
  remoteScreenshotProtection?: boolean
  remoteScreenshotProtectionUpdatedAt?: number
  remoteTorEnabled?: boolean
  remoteTorUpdatedAt?: number
  remoteAccountState?: RemoteAccountState
  remoteAccountStateUpdatedAt?: number
  disappearingTimer?: DisappearingMessageTimer | null
  displayName?: string
}

export interface ChatContact {
  localIdentityId?: string
  localWalletAddress?: string
  identityId: string          // Identity UUID
  walletAddress?: string      // EXO address
  displayName: string
  sharedDisplayName?: string
  publicKeyBundle?: PublicKeyBundle
  addedAt: number
  bundleVersion?: number
  identityVerifiedAt?: number
  trustState?: TrustState
  identityChanged?: boolean
  remoteAccountState?: RemoteAccountState
  remoteAccountStateUpdatedAt?: number
  lastSeenAt?: number
  isOnline?: boolean
  avatarUrl?: string
  isSaved?: boolean
  isHidden?: boolean
}

export type { PublicKeyBundle, TrustState } from '@spectra/core-crypto'
