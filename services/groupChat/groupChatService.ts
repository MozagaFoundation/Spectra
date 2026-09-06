/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { AppState } from 'react-native'
import { getValidBackendAccessToken } from '@/services/backend/session'
import { isSpectraBackendConfigured } from '@/services/backend/client'
import { uploadObjectWithBackend } from '@/services/backend/objectStorage'
import { useChatStore } from '@/store/chatStore'
import { useGroupChatStore } from '@/store/groupChatStore'
import { useSpectreStore } from '@/store/spectreStore'
import { useWalletStore } from '@/store/walletStore'
import { useTorStore } from '@/services/tor/torStore'
import type {
  ChatMessage,
  DisappearingMessageTimer,
  GroupChatMember,
  GroupConversation,
  GroupMemberRole,
  MediaAttachment,
  MessageSendProgress,
  ReplyReference,
} from '@/lib/types'
import {
  buildGroupDisappearingTimer,
  createMessageDisappearingState,
  getDisappearingMessageExpiryTimestamp,
  hasDisappearingMessageExpired,
  isDisappearingTimerEnabled,
  normalizeDisappearingTimer,
} from '@/lib/disappearingMessages'
import { SPECTRE_GROUP_DISAPPEARING_MS } from '@/lib/constants'
import { canManageGroupDisappearingTimer } from '@/lib/groupChatPermissions'
import { isSameAccountStorageScope } from '@/lib/accountScope'
import { mapWithConcurrency, mapWithConcurrencySettled } from '@/lib/utils'
import {
  base64ToBytes,
  decryptMessage as decryptGroupPayload,
  dilithiumSignAsync,
  dilithiumVerifyAsync,
  encryptMessage as encryptGroupPayload,
  generateUUID,
  localChatStorage,
  loadIdentityByAddress,
  sha256Hash,
} from '@spectra/core-crypto'
import {
  clearStoredGroupMessages,
  getStoredGroupUnreadProjection,
  prepareGroupStorageScope,
  getStoredGroup,
  getStoredGroupMembers,
  getStoredGroupMessage,
  getStoredGroupMessages,
  getStoredGroupMessagesPage,
  getStoredGroupMessageIds,
  listStoredGroups,
  removeStoredGroup,
  deleteStoredGroupMessage,
  setStoredGroupUnreadProjection,
  setActiveGroupStorageScope,
  storeGroup,
  storeGroupMembers,
  storeGroupMessage,
  storePendingGroupCiphertext,
  takePendingGroupCiphertexts,
  updateStoredGroupMessage,
  type GroupSenderKeyState,
  type PendingGroupCiphertextRow,
} from './storage'
import {
  clearGroupEpochSecrets,
  getGroupEpochKey,
  storeGroupEpochKey,
} from './epochKeyringStorage'
import {
  beginLocalEpochDistribution,
  configureGroupEpochTransitions,
  executeLocalEpochDistribution,
  resumePendingGroupEpochTransitions,
} from './epochTransition'
import type { PendingGroupEpochSecret } from '@/services/storage/groupEpochKeyringCrypto'
import {
  isGroupCiphertextEnvelope,
  isGroupEpochKeyBytes,
  isGroupInviteEnvelope,
  type GroupCiphertextEnvelope,
  type GroupCiphertextPayload,
  type GroupInviteEnvelope,
  type GroupInviteMember,
} from './groupInvite'
import {
  scheduleGlobalBadgeSync,
  sendLocalNotification,
} from '@/services/notifications/pushService'
import { buildGroupLocalNotificationBody } from '@/services/notifications/notificationNamePrivacy'
import { deriveGroupUnreadProjection, GROUP_UNREAD_PROJECTION_VERSION } from './groupUnreadState'
import {
  cacheMediaFromFile,
  deleteCachedMediaForMessage,
  deleteConversationMedia,
  initializeMediaCache,
} from '@/services/media/localMediaCache'
import { hydrateMessageAttachments, shouldAutoHydrateAttachment } from '@/services/media/attachmentHydration'
import { uploadEncryptedMedia } from '@/services/media/mediaService'
import {
  buildQMediaReferences,
  parseMediaFromContent,
  type ParsedAttachment,
} from '@/services/media/qmediaProtocol'
import * as FileSystem from 'expo-file-system/legacy'
import {
  canReceiveMediaInSpectre,
  getSpectreChatRestrictionMessage,
  isSpectrePolicyActive,
  SPECTRE_BLOCKED_MEDIA_SOURCE,
} from '@/lib/spectrePolicy'
import {
  applyCryptoPaymentRequestUpdateToContent,
  getCryptoPaymentRequestDisplayText,
  parseCryptoPaymentRequest,
  type CryptoPaymentRequestUpdate,
} from '@/services/shared/cryptoPaymentRequest'

const GROUP_ROUTE_PREFIX = 'group:'
const GROUP_MESSAGE_VERSION = 1
export const MAX_GROUP_CHAT_MEMBERS = 50
const GROUP_FANOUT_CONCURRENCY = 4
const GROUP_CONVERSATION_SYNC_TTL_MS = 60_000
const GROUP_MEDIA_UPLOAD_CONCURRENCY = 2
const GROUP_EXPIRY_SWEEP_MIN_DELAY_MS = 1_000
const GROUP_EXPIRY_SWEEP_MAX_DELAY_MS = 60_000
const GROUP_EXPIRY_SWEEP_IDLE_DELAY_MS = 5 * 60_000
const GROUP_EXPIRY_SCAN_PAGE_SIZE = 80
const GROUP_UNREAD_BOOTSTRAP_MESSAGE_LIMIT = 200

let lastGroupConversationSyncAt = 0
let groupConversationSyncGeneration = 0
let groupConversationSyncPromise: Promise<GroupConversation[]> | null = null
let groupExpirySweepTimer: ReturnType<typeof setTimeout> | null = null
let groupExpirySweepActive = false
let groupExpirySweepInFlight = false
const knownGroupMessageIds = new Map<string, Set<string>>()

type GroupExpirySweepResult = {
  groupsScanned: number
  messagesScanned: number
  expiredMessagesRemoved: number
  touchedGroups: number
  nextExpiryAt: number | null
}

async function getKnownGroupMessageIds(groupId: string): Promise<Set<string>> {
  const cached = knownGroupMessageIds.get(groupId)
  if (cached) return cached
  const known = new Set(await getStoredGroupMessageIds(groupId))
  knownGroupMessageIds.set(groupId, known)
  return known
}

function startGroupMediaHydration(
  groupId: string,
  messageId: string,
  attachments: MediaAttachment[],
): void {
  downloadGroupMediaAttachments(
    groupId,
    messageId,
    attachments,
    'groupChat.processIncomingGroupMessage',
  )
    .then(async (localAttachments) => {
      useGroupChatStore.getState().updateMessage(groupId, messageId, { attachments: localAttachments })
      await updateStoredGroupMessage(groupId, messageId, { attachments: localAttachments })
    })
    .catch((error) => {
      console.warn('[GroupChat] Failed to resolve group media attachments:', error)
    })
}

function getCurrentSpectrePolicyState() {
  const spectreState = useSpectreStore.getState()
  const wallet = useWalletStore.getState().wallet
  return {
    enabled: spectreState.enabled,
    accountMode: spectreState.spectreAccountMode,
    walletIsSpectre: wallet?.spectreMode === true,
  }
}

function shouldBlockIncomingGroupMediaInSpectre(): boolean {
  const state = getCurrentSpectrePolicyState()
  return isSpectrePolicyActive(state) && !canReceiveMediaInSpectre(state)
}

function createSpectreBlockedMediaAttachments(
  attachments: MediaAttachment[] | undefined,
): MediaAttachment[] | undefined {
  if (!attachments?.length) {
    return attachments
  }

  return attachments.map((attachment) => ({
    ...attachment,
    uri: '',
    source: SPECTRE_BLOCKED_MEDIA_SOURCE,
    thumbnail: undefined,
    isEncrypted: false,
  }))
}

type GroupPayloadEnvelope =
  | {
      v: 1
      type: 'text'
      text: string
      replyTo?: ReplyReference
      disappearing?: DisappearingMessageTimer
    }
  | { v: 1; type: 'reaction'; reaction: { targetMessageId: string; emoji: string } }
  | { v: 1; type: 'deletion'; deletionTarget: string }
  | { v: 1; type: 'crypto_payment_request_update'; update: CryptoPaymentRequestUpdate }

type DirectGroupControlEnvelope =
  | {
      v: 2
      type: 'group_sender_key_distribution'
      groupId: string
      recipientIdentityId: string
      distributionId: string
      keyVersion: number
      rotationRevision: number
      keyBase64: string
    }
  | {
      v: 2
      type: 'group_sender_key_request'
      groupId: string
      requesterId: string
    }
  | {
      v: 2
      type: 'group_tor_state'
      groupId: string
      enabled: boolean
      updatedAt?: number
    }
  | GroupInviteEnvelope
  | GroupCiphertextEnvelope

interface GroupServiceInitOptions {
  identityId: string
  walletAddress: string
  allowLegacyMigration?: boolean
  whenIdle?: () => Promise<void>
  sendDirectControlEnvelope: (recipientIdentityId: string, envelope: string) => Promise<void>
}

interface GroupRow {
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
  _rotation_required?: boolean
  _pending_transition_id?: string | null
}

interface GroupMemberRow {
  group_id: string
  user_identity_id: string
  wallet_address: string | null
  display_name: string | null
  role: GroupMemberRole
  is_active: boolean
  joined_epoch: number
  left_epoch: number | null
  joined_at: string
  updated_at: string
}

type GroupMessageRow = {
  id: string
  group_id: string
  sender_identity_id: string
  distribution_id: string
  key_version: number
  group_revision: number
  content_type: GroupCiphertextPayload['contentType']
  ciphertext: string
  nonce: string
  tag: string
  signature: string
  created_at: string
  server_sequence?: number
  expires_at?: string | null
  disappearing_duration_ms?: number | null
  disappearing_trigger?: 'after_send' | 'after_read' | null
}

let currentIdentityId: string | null = null
let currentWalletAddress: string | null = null
let sendDirectControlEnvelope: GroupServiceInitOptions['sendDirectControlEnvelope'] | null = null

type SenderKeyDistributionEnvelope = Extract<
  DirectGroupControlEnvelope,
  { v: 2; type: 'group_sender_key_distribution' }
>
type SenderKeyRequestEnvelope = Extract<
  DirectGroupControlEnvelope,
  { type: 'group_sender_key_request' }
>

function utf8Bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

function ensureConfigured(): void {
  if (!isSpectraBackendConfigured()) {
    throw new Error('Backend is not configured')
  }
  if (!currentIdentityId || !currentWalletAddress || !sendDirectControlEnvelope) {
    throw new Error('Group chat service is not initialized')
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getDirectGroupControlEnvelopeType(envelope: unknown): string | null {
  if (!isRecord(envelope) || typeof envelope.type !== 'string') {
    return null
  }

  return envelope.type
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function isSenderKeyDistributionEnvelope(
  envelope: unknown,
): envelope is SenderKeyDistributionEnvelope {
  if (!isRecord(envelope)) {
    return false
  }

  return (
    envelope.v === 2
    && envelope.type === 'group_sender_key_distribution'
    && isNonEmptyString(envelope.groupId)
    && isNonEmptyString(envelope.recipientIdentityId)
    && isNonEmptyString(envelope.distributionId)
    && isPositiveInteger(envelope.keyVersion)
    && isPositiveInteger(envelope.rotationRevision)
    && isNonEmptyString(envelope.keyBase64)
  )
}

function isSenderKeyRequestEnvelope(
  envelope: unknown,
): envelope is SenderKeyRequestEnvelope {
  if (!isRecord(envelope)) {
    return false
  }

  return (
    envelope.v === 2
    && envelope.type === 'group_sender_key_request'
    && isNonEmptyString(envelope.groupId)
    && isNonEmptyString(envelope.requesterId)
  )
}

function isActiveMember(members: GroupChatMember[], identityId: string): boolean {
  return members.some((member) => member.identityId === identityId)
}

function senderKeyDistributionMatchesGroup(
  envelope: SenderKeyDistributionEnvelope,
  group: GroupConversation,
): boolean {
  return (
    envelope.groupId === group.groupId
    && envelope.distributionId === group.distributionId
    && envelope.rotationRevision === group.revision
  )
}

function createConversationId(groupId: string): string {
  return `${GROUP_ROUTE_PREFIX}${groupId}`
}

function makePreview(content: string): string {
  const trimmed = content.trim()
  return trimmed.length > 100 ? `${trimmed.slice(0, 97)}...` : trimmed
}

function serializePayloadAAD(message: {
  groupId: string
  senderId: string
  distributionId: string
  keyVersion: number
  revision: number
  contentType: GroupMessageRow['content_type']
  messageId: string
}): string {
  return JSON.stringify(message)
}

function serializeSignedPayload(aad: string, ciphertext: string, nonce: string, tag: string): Uint8Array {
  return utf8Bytes(`${aad}.${ciphertext}.${nonce}.${tag}`)
}

async function publishGroupCiphertext(params: {
  messageId: string
  groupId: string
  distributionId: string
  keyVersion: number
  revision: number
  contentType: GroupCiphertextPayload['contentType']
  ciphertext: string
  nonce: string
  tag: string
  signature: string
  recipientIdentityIds: string[]
  disappearingDurationMs?: number | null
  disappearingTrigger?: 'after_send' | 'after_read' | null
}): Promise<void> {
  const createdAt = new Date().toISOString()
  const payload: GroupCiphertextPayload = {
    id: params.messageId,
    senderIdentityId: currentIdentityId!,
    distributionId: params.distributionId,
    keyVersion: params.keyVersion,
    groupRevision: params.revision,
    contentType: params.contentType,
    ciphertext: params.ciphertext,
    nonce: params.nonce,
    tag: params.tag,
    signature: params.signature,
    createdAt,
    ...(params.disappearingDurationMs
      ? { disappearingDurationMs: params.disappearingDurationMs }
      : {}),
    ...(params.disappearingTrigger
      ? { disappearingTrigger: params.disappearingTrigger }
      : {}),
  }
  await fanOutControlEnvelope(params.recipientIdentityIds, (recipientIdentityId) =>
    JSON.stringify({
      v: 2,
      type: 'group_ciphertext',
      groupId: params.groupId,
      recipientIdentityId,
      payload,
    } satisfies GroupCiphertextEnvelope),
  )
}

function uniqueIdentityIds(identityIds: string[]): string[] {
  return [...new Set(identityIds.filter(Boolean))]
}

async function fanOutControlEnvelope(
  recipientIdentityIds: string[],
  envelopeFor: (recipientIdentityId: string) => string,
): Promise<void> {
  const recipients = uniqueIdentityIds(
    recipientIdentityIds.filter((identityId) => identityId !== currentIdentityId),
  )
  if (recipients.length === 0) return
  await mapWithConcurrency(
    recipients,
    GROUP_FANOUT_CONCURRENCY,
    async (recipientIdentityId) => {
      await sendDirectControlEnvelope!(recipientIdentityId, envelopeFor(recipientIdentityId))
    },
  )
}

function rosterHashFor(identityIds: string[]): string {
  return sha256Hash(utf8Bytes(uniqueIdentityIds(identityIds).sort().join('\0')))
}

function toInviteMembers(members: GroupChatMember[]): GroupInviteMember[] {
  return members.map((member) => ({
    identityId: member.identityId,
    role: member.role,
    walletAddress: member.walletAddress ?? null,
    displayName: member.displayName ?? null,
    joinedEpoch: member.joinedEpoch || 1,
  }))
}

function fromInviteMembers(groupId: string, members: GroupInviteMember[], timestamp: number): GroupChatMember[] {
  return members.map((member) => ({
    groupId,
    identityId: member.identityId,
    walletAddress: member.walletAddress || undefined,
    displayName: member.displayName || undefined,
    role: member.role,
    joinedEpoch: member.joinedEpoch,
    joinedAt: timestamp,
    updatedAt: timestamp,
  }))
}

function buildInviteEnvelope(
  recipientIdentityId: string,
  pending: PendingGroupEpochSecret,
  includeKey: boolean,
): string {
  return JSON.stringify({
    v: 2,
    type: 'group_sender_key_distribution',
    groupId: pending.groupId,
    recipientIdentityId,
    distributionId: pending.distributionId,
    keyVersion: pending.epoch,
    rotationRevision: pending.epoch,
    ...(includeKey ? { keyBase64: pending.keyBase64 } : {}),
    title: pending.title || 'Group',
    description: pending.description ?? null,
    avatarUrl: pending.avatarUrl ?? null,
    disappearingTimerMs: pending.disappearingTimerMs ?? null,
    createdAt: pending.createdAtIso || new Date(pending.createdAt).toISOString(),
    members: includeKey ? (pending.members ?? []) : [],
  } satisfies GroupInviteEnvelope)
}

interface UploadedGroupAttachment {
  id: string
  encryptionKey: string
  type: MediaAttachment['type']
  fileName: string
  mimeType: string
  fileSize: number
  width?: number
  height?: number
  durationMs?: number
  waveform?: number[]
}

function formatAttachmentLabel(attachment: Pick<MediaAttachment, 'type'>): string {
  switch (attachment.type) {
    case 'voice_note':
      return 'Voice message'
    case 'image':
      return 'Photo'
    case 'video':
      return 'Video'
    case 'document':
      return 'Document'
    case 'audio':
      return 'Audio'
    default:
      return 'Attachment'
  }
}

function buildAttachmentPreview(content: string, attachments?: MediaAttachment[]): string {
  const trimmed = content.trim()
  if (trimmed.length > 0) {
    const request = parseCryptoPaymentRequest(trimmed)
    if (request) {
      return makePreview(getCryptoPaymentRequestDisplayText(request))
    }
    return makePreview(trimmed)
  }

  if (attachments && attachments.length > 0) {
    return `📎 ${formatAttachmentLabel(attachments[0])}`
  }

  return ''
}

export async function applyGroupCryptoPaymentRequestUpdate(
  groupId: string,
  update: CryptoPaymentRequestUpdate,
): Promise<boolean> {
  const store = useGroupChatStore.getState()
  const inMemoryMessages = store.messages[groupId] || []
  const inMemoryCandidateSets = update.requestMessageId
    ? [
        inMemoryMessages.filter((message) => message.id === update.requestMessageId),
        inMemoryMessages.filter((message) => message.id !== update.requestMessageId),
      ]
    : [inMemoryMessages]

  for (const candidates of inMemoryCandidateSets) {
    for (const message of candidates) {
      const nextContent = applyCryptoPaymentRequestUpdateToContent(message.content || '', update)
      if (!nextContent) continue

      store.updateMessage(groupId, message.id, { content: nextContent })
      await updateStoredGroupMessage(groupId, message.id, { content: nextContent })
      await refreshGroupLastMessage(groupId)
      return true
    }
  }

  const storedMessages = await getStoredGroupMessages(groupId)
  const storedCandidateSets = update.requestMessageId
    ? [
        storedMessages.filter((message) => message.id === update.requestMessageId),
        storedMessages.filter((message) => message.id !== update.requestMessageId),
      ]
    : [storedMessages]

  for (const candidates of storedCandidateSets) {
    for (const message of candidates) {
      const nextContent = applyCryptoPaymentRequestUpdateToContent(message.content || '', update)
      if (!nextContent) continue

      await updateStoredGroupMessage(groupId, message.id, { content: nextContent })
      await refreshGroupLastMessage(groupId)
      return true
    }
  }

  return false
}

function sanitizeStorageName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'group-avatar'
}

function getLatestVisibleGroupMessage(messages: ChatMessage[]): ChatMessage | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.deleted) continue
    if (hasDisappearingMessageExpired(message.disappearing)) continue
    const preview = buildAttachmentPreview(message.content || '', message.attachments)
    if (preview) return message
  }
  return null
}

async function cacheSentGroupAttachments(
  groupId: string,
  messageId: string,
  attachments: MediaAttachment[],
  uploadedMedia: UploadedGroupAttachment[]
): Promise<MediaAttachment[]> {
  await initializeMediaCache()
  const conversationId = createConversationId(groupId)
  const localAttachments: MediaAttachment[] = []

  for (let index = 0; index < attachments.length; index++) {
    const attachment = attachments[index]
    const uploaded = uploadedMedia[index]
    let finalUri = attachment.uri

    try {
      const cached = await cacheMediaFromFile(
        uploaded.id,
        messageId,
        conversationId,
        attachment
      )

      const fileInfo = await FileSystem.getInfoAsync(cached.localUri)
      if (fileInfo.exists) {
        finalUri = cached.localUri
      }
    } catch (cacheError) {
      console.warn('[GroupChat] Failed to cache sent attachment locally:', cacheError)
    }

    localAttachments.push({
      id: uploaded.id,
      type: attachment.type,
      uri: finalUri,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      fileSize: attachment.fileSize,
      width: attachment.width,
      height: attachment.height,
      durationMs: attachment.durationMs,
      waveform: attachment.waveform,
      isEncrypted: false,
    })
  }

  return localAttachments
}

async function downloadGroupMediaAttachments(
  groupId: string,
  messageId: string,
  attachments: ParsedAttachment[],
  source: string,
): Promise<MediaAttachment[]> {
  const conversationId = createConversationId(groupId)
  return hydrateMessageAttachments(messageId, conversationId, attachments, {
    backgroundOnly: true,
    diagnostics: {
      source,
      messageId,
      conversationId,
    },
  })
}

function buildGroupConversation(row: GroupRow, myRole: GroupMemberRole, members: GroupChatMember[], existing?: GroupConversation | null): GroupConversation {
  if (row.protocol_version !== 2 || row.epoch < 1) {
    throw new Error('This group requires a Spectra upgrade')
  }
  const disappearingTimer = row.disappearing_timer_ms
    ? buildGroupDisappearingTimer(row.disappearing_timer_ms, {
        updatedAt: row.disappearing_timer_updated_at
          ? new Date(row.disappearing_timer_updated_at).getTime()
          : undefined,
        updatedBy: row.disappearing_timer_updated_by || undefined,
      })
    : null

  return {
    id: createConversationId(row.id),
    type: 'group',
    groupId: row.id,
    title: row.title,
    subtitle: row.description || undefined,
    avatarUrl: row.avatar_url || existing?.avatarUrl,
    localWalletAddress: currentWalletAddress || existing?.localWalletAddress,
    remoteIdentityId: row.id,
    memberIds: members.map((member) => member.identityId),
    memberCount: row.member_count,
    myRole,
    maxMembers: row.max_members,
    revision: row.revision,
    distributionId: row.distribution_id,
    epoch: row.epoch,
    protocolVersion: 2,
    rotationRequired: row._rotation_required === true,
    pendingTransitionId: row._pending_transition_id || undefined,
    unreadCount: existing?.unreadCount || 0,
    lastMessage: existing?.lastMessage,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    disappearingTimer,
  }
}

function buildGroupMessageDisappearingState(
  timer: DisappearingMessageTimer | null,
  sentAt: number,
): ChatMessage['disappearing'] | undefined {
  if (!isDisappearingTimerEnabled(timer)) {
    return undefined
  }

  return createMessageDisappearingState(timer, {
    sentAt,
    startOnSend: true,
  })
}

function buildGroupMember(row: GroupMemberRow): GroupChatMember {
  return {
    groupId: row.group_id,
    identityId: row.user_identity_id,
    walletAddress: row.wallet_address || undefined,
    displayName: row.display_name || undefined,
    role: row.role,
    joinedEpoch: row.joined_epoch || 1,
    leftEpoch: row.left_epoch || undefined,
    joinedAt: new Date(row.joined_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  }
}

async function fetchActiveGroupMembers(groupId: string): Promise<GroupChatMember[]> {
  const stored = useGroupChatStore.getState().members[groupId]
  if (stored && stored.length > 0) {
    return stored
  }
  return getStoredGroupMembers(groupId)
}

async function fetchDilithiumKey(identityId: string): Promise<string | null> {
  const localBundle = await localChatStorage.getPublicKeyBundle(identityId)
  return localBundle?.dilithiumKey ?? null
}

async function getSigningIdentity() {
  ensureConfigured()
  const identity = await loadIdentityByAddress(currentWalletAddress!)
  if (!identity) {
    throw new Error('Could not load local chat identity for group signing')
  }
  return identity.identity
}

async function getGroupConversation(groupId: string): Promise<GroupConversation | null> {
  const fromStore = useGroupChatStore.getState().groups.find((group) => group.groupId === groupId)
  if (fromStore) return fromStore
  return getStoredGroup(groupId)
}

async function pushSenderKeyDistributions(
  recipientIdentityIds: string[],
  group: GroupConversation,
  members: GroupChatMember[],
  keyState: GroupSenderKeyState,
): Promise<void> {
  await fanOutControlEnvelope(recipientIdentityIds, (recipientIdentityId) =>
    JSON.stringify({
      v: 2,
      type: 'group_sender_key_distribution',
      groupId: group.groupId,
      recipientIdentityId,
      distributionId: keyState.distributionId,
      keyVersion: keyState.keyVersion,
      rotationRevision: keyState.rotationRevision,
      keyBase64: keyState.keyBase64,
      title: group.title,
      description: group.subtitle ?? null,
      avatarUrl: group.avatarUrl ?? null,
      disappearingTimerMs: group.disappearingTimer?.durationMs ?? null,
      createdAt: new Date(group.createdAt).toISOString(),
      members: toInviteMembers(members),
    } satisfies GroupInviteEnvelope),
  )
}

async function getKnownGroupMembers(groupId: string): Promise<GroupChatMember[]> {
  const storedMembers = useGroupChatStore.getState().members[groupId] || []
  if (storedMembers.length > 0) {
    return storedMembers
  }

  return fetchActiveGroupMembers(groupId)
}

async function ensureSenderKeyState(group: GroupConversation): Promise<GroupSenderKeyState> {
  const existing = await getGroupEpochKey(group.groupId, group.epoch)
  if (existing && existing.distributionId === group.distributionId) {
    return {
      groupId: group.groupId,
      distributionId: existing.distributionId,
      keyBase64: existing.keyBase64,
      keyVersion: existing.epoch,
      sharedWith: [],
      rotationRevision: existing.epoch,
      updatedBy: currentIdentityId!,
      updatedAt: existing.createdAt,
    }
  }

  throw new Error('Missing current sender key for this group')
}

async function persistGroupLocally(group: GroupConversation, members: GroupChatMember[]): Promise<void> {
  await storeGroup(group)
  await storeGroupMembers(group.groupId, members)
  useGroupChatStore.getState().addGroup(group)
  useGroupChatStore.getState().setMembers(group.groupId, members)
}

async function persistGroupConversation(groupId: string, updates: Partial<GroupConversation>): Promise<GroupConversation | null> {
  const existing = await getGroupConversation(groupId)
  if (!existing) return null

  const next: GroupConversation = {
    ...existing,
    ...updates,
    updatedAt: updates.updatedAt || existing.updatedAt || Date.now(),
  }

  await storeGroup(next)
  useGroupChatStore.getState().updateGroup(groupId, next)
  return next
}

async function reconcileGroupUnreadProjection(
  groupId: string,
  options: {
    addUnreadMessageId?: string
    identityId?: string | null
    markRead?: boolean
    scheduleBadge?: boolean
    walletAddress?: string | null
  } = {},
): Promise<number> {
  const identityId = options.identityId ?? currentIdentityId
  const walletAddress = options.walletAddress ?? currentWalletAddress
  if (!identityId || !walletAddress) {
    return 0
  }

  const store = useGroupChatStore.getState()
  const group = store.groups.find((entry) => (
    entry.groupId === groupId
    && isSameAccountStorageScope(entry.localWalletAddress, walletAddress)
  )) || (await listStoredGroups(walletAddress)).find((entry) => entry.groupId === groupId)
  if (!group) {
    return 0
  }

  const persisted = await getStoredGroupUnreadProjection(groupId, walletAddress)
  let messages: ChatMessage[] = []
  if (options.markRead) {
    messages = []
  } else if (persisted?.version === GROUP_UNREAD_PROJECTION_VERSION) {
    const candidateIds = [...new Set([
      ...persisted.unreadMessageIds,
      ...(options.addUnreadMessageId ? [options.addUnreadMessageId] : []),
    ])]
    const loaded = await Promise.all(
      candidateIds.map((messageId) => getStoredGroupMessage(groupId, messageId, walletAddress)),
    )
    messages = loaded.filter((message): message is ChatMessage => message !== null)
  } else {
    messages = await getStoredGroupMessages(
      groupId,
      GROUP_UNREAD_BOOTSTRAP_MESSAGE_LIMIT,
      walletAddress,
    )
  }
  const projection = deriveGroupUnreadProjection({
    messages,
    localIdentityId: identityId,
    persisted,
    legacyUnreadCount: group.unreadCount,
    addUnreadMessageId: options.addUnreadMessageId,
    markRead: options.markRead,
  })
  const unreadCount = projection.unreadMessageIds.length
  const nextGroup = {
    ...group,
    localWalletAddress: walletAddress,
    unreadCount,
  }

  await Promise.all([
    setStoredGroupUnreadProjection(groupId, projection, walletAddress),
    storeGroup(nextGroup, walletAddress),
  ])
  if (isSameAccountStorageScope(useWalletStore.getState().wallet?.address, walletAddress)) {
    useGroupChatStore.getState().updateGroup(groupId, nextGroup)
  }
  if (options.scheduleBadge !== false) {
    scheduleGlobalBadgeSync()
  }
  return unreadCount
}

async function refreshGroupLastMessage(groupId: string): Promise<void> {
  const storeMessages = useGroupChatStore.getState().messages[groupId]
  const messages = storeMessages && storeMessages.length > 0
    ? storeMessages
    : await getStoredGroupMessages(groupId)
  const latest = getLatestVisibleGroupMessage(messages)

  await persistGroupConversation(groupId, {
    lastMessage: latest
      ? {
          content: buildAttachmentPreview(latest.content || '', latest.attachments),
          timestamp: latest.timestamp,
          isOwn: latest.senderId === currentIdentityId,
        }
      : undefined,
    updatedAt: latest?.timestamp || Date.now(),
  })
}

async function refreshGroupAfterExpiry(
  groupId: string,
): Promise<void> {
  await refreshGroupLastMessage(groupId)
  await reconcileGroupUnreadProjection(groupId, { scheduleBadge: false })
}

function getNextGroupExpirySweepDelayMs(nextExpiryAt: number | null): number {
  if (nextExpiryAt == null) {
    return GROUP_EXPIRY_SWEEP_IDLE_DELAY_MS
  }

  return Math.min(
    Math.max(nextExpiryAt - Date.now(), GROUP_EXPIRY_SWEEP_MIN_DELAY_MS),
    GROUP_EXPIRY_SWEEP_MAX_DELAY_MS,
  )
}

async function sweepExpiredGroupMessages(): Promise<GroupExpirySweepResult> {
  const result: GroupExpirySweepResult = {
    groupsScanned: 0,
    messagesScanned: 0,
    expiredMessagesRemoved: 0,
    touchedGroups: 0,
    nextExpiryAt: null,
  }

  if (!currentIdentityId) {
    return result
  }

  const groups = await listStoredGroups()
  const touchedGroups = new Set<string>()

  for (const group of groups) {
    result.groupsScanned += 1
    let beforeMessageId: string | undefined
    const expiredMessages: ChatMessage[] = []
    while (true) {
      const page = await getStoredGroupMessagesPage(group.groupId, {
        limit: GROUP_EXPIRY_SCAN_PAGE_SIZE,
        beforeMessageId,
      }).catch(() => ({ messages: [] as ChatMessage[], hasMore: false, nextCursor: null }))
      result.messagesScanned += page.messages.length
      for (const message of page.messages) {
        const expiryAt = getDisappearingMessageExpiryTimestamp(message.disappearing)
        if (
          typeof expiryAt === 'number'
          && expiryAt > Date.now()
          && (result.nextExpiryAt == null || expiryAt < result.nextExpiryAt)
        ) {
          result.nextExpiryAt = expiryAt
        }
        if (hasDisappearingMessageExpired(message.disappearing)) {
          expiredMessages.push(message)
        }
      }
      if (!page.hasMore || !page.nextCursor) break
      beforeMessageId = page.nextCursor
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    }
    if (expiredMessages.length === 0) {
      continue
    }

    for (const message of expiredMessages) {
      useGroupChatStore.getState().removeMessage(group.groupId, message.id)
      await Promise.allSettled([
        deleteStoredGroupMessage(group.groupId, message.id),
        deleteCachedMediaForMessage(message.id, createConversationId(group.groupId)),
      ])
      result.expiredMessagesRemoved += 1

      touchedGroups.add(group.groupId)
    }
  }

  if (touchedGroups.size === 0) {
    return result
  }
  result.touchedGroups = touchedGroups.size

  await Promise.allSettled(
    [...touchedGroups].map((groupId) =>
      refreshGroupAfterExpiry(groupId)
    )
  )
  scheduleGlobalBadgeSync()
  return result
}

function startGroupExpirySweep(): void {
  groupExpirySweepActive = true
  if (groupExpirySweepTimer || groupExpirySweepInFlight) {
    return
  }

  scheduleGroupExpirySweep(GROUP_EXPIRY_SWEEP_MIN_DELAY_MS)
}

function scheduleGroupExpirySweep(delayMs: number): void {
  if (groupExpirySweepTimer) {
    clearTimeout(groupExpirySweepTimer)
  }

  groupExpirySweepTimer = setTimeout(() => {
    groupExpirySweepTimer = null
    if (groupExpirySweepInFlight) {
      scheduleGroupExpirySweep(GROUP_EXPIRY_SWEEP_MIN_DELAY_MS)
      return
    }

    groupExpirySweepInFlight = true
    const startedAt = Date.now()
    void sweepExpiredGroupMessages()
      .then((result) => {
        const nextDelayMs = getNextGroupExpirySweepDelayMs(result.nextExpiryAt)
        if (__DEV__) {
          console.log('[GroupChat] expiry sweep metrics', {
            ...result,
            elapsedMs: Date.now() - startedAt,
            nextDelayMs,
          })
        }
        if (groupExpirySweepActive) {
          scheduleGroupExpirySweep(nextDelayMs)
        }
      })
      .catch((error) => {
        console.warn('[GroupChat] Failed to sweep expired group messages:', error)
        if (groupExpirySweepActive) {
          scheduleGroupExpirySweep(GROUP_EXPIRY_SWEEP_MAX_DELAY_MS)
        }
      })
      .finally(() => {
        groupExpirySweepInFlight = false
      })
  }, delayMs)
}

function stopGroupExpirySweep(): void {
  groupExpirySweepActive = false
  if (!groupExpirySweepTimer) {
    return
  }

  clearTimeout(groupExpirySweepTimer)
  groupExpirySweepTimer = null
}

async function hydrateStoredGroupAttachments(groupId: string, messages: ChatMessage[]): Promise<void> {
  const concurrency = useTorStore.getState().enabled ? 2 : 3

  await mapWithConcurrencySettled(
    messages,
    concurrency,
    async (message) => {
      const pendingAttachments = (message.attachments || []).filter(
        (attachment) => !attachment.uri && attachment.isEncrypted,
      )
      if (
        pendingAttachments.length === 0
        || !pendingAttachments.some((attachment) => shouldAutoHydrateAttachment(attachment))
      ) {
        return undefined
      }

      const localAttachments = await downloadGroupMediaAttachments(
        groupId,
        message.id,
        message.attachments as ParsedAttachment[],
        'groupChat.hydrateStoredGroupAttachments',
      )
      useGroupChatStore.getState().updateMessage(groupId, message.id, { attachments: localAttachments })
      await updateStoredGroupMessage(groupId, message.id, { attachments: localAttachments })
      return undefined
    },
    (message, _index, error) => {
      console.warn(`[GroupChat] Failed to hydrate stored attachments for ${message.id}:`, error)
      return undefined
    },
  )
}

async function updateGroupLastMessage(
  groupId: string,
  updates: Partial<NonNullable<GroupConversation['lastMessage']>>,
): Promise<void> {
  const group = await getGroupConversation(groupId)
  if (!group) return
  const nextLastMessage = typeof updates.content === 'string' && typeof updates.timestamp === 'number'
    ? {
        content: updates.content,
        timestamp: updates.timestamp,
        isOwn: updates.isOwn || false,
      }
    : group.lastMessage

  const next: GroupConversation = {
    ...group,
    lastMessage: nextLastMessage,
    updatedAt: typeof updates.timestamp === 'number' ? updates.timestamp : Date.now(),
  }

  await persistGroupConversation(groupId, next)
}

async function processDecryptedGroupEnvelope(
  row: GroupMessageRow,
  group: GroupConversation,
  members: GroupChatMember[],
  envelope: GroupPayloadEnvelope,
): Promise<void> {
  const store = useGroupChatStore.getState()
  const sender = members.find((member) => member.identityId === row.sender_identity_id)
  const senderName = sender?.displayName || useChatStore.getState().contacts.find((contact) => contact.identityId === row.sender_identity_id)?.displayName || 'Unknown member'
  const senderAvatarUrl = useChatStore.getState().contacts.find((contact) => contact.identityId === row.sender_identity_id)?.avatarUrl

  if (envelope.type === 'crypto_payment_request_update') {
    await applyGroupCryptoPaymentRequestUpdate(group.groupId, envelope.update)
    return
  }

  if (envelope.type === 'reaction') {
    if (envelope.reaction?.targetMessageId && envelope.reaction?.emoji) {
      store.addReaction(group.groupId, envelope.reaction.targetMessageId, {
        emoji: envelope.reaction.emoji,
        senderId: row.sender_identity_id,
        timestamp: new Date(row.created_at).getTime(),
      })
      const messages = store.messages[group.groupId] || []
      const target = messages.find((message) => message.id === envelope.reaction.targetMessageId)
      if (target) {
        const reactions = [...(target.reactions || []), {
          emoji: envelope.reaction.emoji,
          senderId: row.sender_identity_id,
          timestamp: new Date(row.created_at).getTime(),
        }]
        await updateStoredGroupMessage(group.groupId, target.id, { reactions })
      }
    }
    await refreshGroupLastMessage(group.groupId)
    return
  }

  if (envelope.type === 'deletion') {
    if (envelope.deletionTarget) {
      const targetMessage =
        (store.messages[group.groupId] || []).find((message) => message.id === envelope.deletionTarget)
        || (await getStoredGroupMessages(group.groupId)).find((message) => message.id === envelope.deletionTarget)

      if (targetMessage?.senderId === row.sender_identity_id) {
        store.updateMessage(group.groupId, envelope.deletionTarget, { deleted: true, content: '' })
        await updateStoredGroupMessage(group.groupId, envelope.deletionTarget, { deleted: true, content: '' })
      }
    }
    await refreshGroupLastMessage(group.groupId)
    await reconcileGroupUnreadProjection(group.groupId)
    return
  }

  const { textContent, attachments } = parseMediaFromContent(envelope.text || '')
  const timestamp = new Date(row.created_at).getTime()
  const isOwn = row.sender_identity_id === currentIdentityId
  const messageAttachments = !isOwn && shouldBlockIncomingGroupMediaInSpectre()
    ? createSpectreBlockedMediaAttachments(attachments)
    : attachments
  const rowDisappearingTimer = row.disappearing_duration_ms
    ? normalizeDisappearingTimer({
        durationMs: row.disappearing_duration_ms,
        trigger: row.disappearing_trigger || 'after_send',
      })
    : null
  const envelopeDisappearingTimer = envelope.type === 'text'
    ? normalizeDisappearingTimer(envelope.disappearing ?? null)
    : null
  const disappearing = buildGroupMessageDisappearingState(
    rowDisappearingTimer ?? envelopeDisappearingTimer,
    timestamp,
  )
  if (disappearing && row.expires_at) {
    disappearing.expiresAt = new Date(row.expires_at).getTime()
  }
  if (hasDisappearingMessageExpired(disappearing)) {
    return
  }

  const message: ChatMessage = {
    id: row.id,
    conversationId: createConversationId(group.groupId),
    conversationType: 'group',
    groupId: group.groupId,
    senderId: row.sender_identity_id,
    senderName,
    senderAvatarUrl,
    content: textContent,
    timestamp,
    status: isOwn ? 'sent' : 'delivered',
    signatureVerified: true,
    serverSequence: row.server_sequence,
    attachments: messageAttachments,
    replyTo: envelope.replyTo,
    disappearing,
  }

  store.addMessage(group.groupId, message)
  await storeGroupMessage(group.groupId, message)

  const shouldHydrateMedia = Boolean(
    messageAttachments
    && messageAttachments.length > 0
    && !shouldBlockIncomingGroupMediaInSpectre()
    && messageAttachments.some((attachment) => shouldAutoHydrateAttachment(attachment))
  )
  if (shouldHydrateMedia && messageAttachments) {
    startGroupMediaHydration(group.groupId, row.id, messageAttachments)
  }

  const isActiveChat = store.activeGroupId === group.groupId
  const shouldIncrementUnread = row.sender_identity_id !== currentIdentityId && (!isActiveChat || AppState.currentState !== 'active')
  await updateGroupLastMessage(group.groupId, {
    content: buildAttachmentPreview(message.content, messageAttachments),
    timestamp,
    isOwn,
  })
  await reconcileGroupUnreadProjection(group.groupId, {
    addUnreadMessageId: shouldIncrementUnread ? message.id : undefined,
    markRead: isActiveChat && AppState.currentState === 'active',
    scheduleBadge: false,
  })
  scheduleGlobalBadgeSync()

  if (shouldIncrementUnread) {
    const groupConvId = createConversationId(group.groupId)
    const isAppForeground = AppState.currentState === 'active'

    if (isAppForeground) {
      const notificationBody = await buildGroupLocalNotificationBody(
        currentIdentityId,
        row.sender_identity_id,
      )
      await sendLocalNotification(group.title, notificationBody, {
        conversationId: groupConvId,
        remoteIdentityId: group.groupId,
        remoteWalletAddress: undefined,
      }).catch(() => {})
    }
  }
}

function toGroupMessageRow(entry: PendingGroupCiphertextRow): GroupMessageRow {
  return {
    id: entry.id,
    group_id: entry.groupId,
    sender_identity_id: entry.senderIdentityId,
    distribution_id: entry.distributionId,
    key_version: entry.keyVersion,
    group_revision: entry.groupRevision,
    content_type: entry.contentType,
    ciphertext: entry.ciphertext,
    nonce: entry.nonce,
    tag: entry.tag,
    signature: entry.signature,
    created_at: entry.createdAt,
    disappearing_duration_ms: entry.disappearingDurationMs ?? null,
    disappearing_trigger: entry.disappearingTrigger ?? null,
  }
}

async function bufferPendingGroupCiphertext(row: GroupMessageRow): Promise<void> {
  await storePendingGroupCiphertext({
    id: row.id,
    groupId: row.group_id,
    senderIdentityId: row.sender_identity_id,
    distributionId: row.distribution_id,
    keyVersion: row.key_version,
    groupRevision: row.group_revision,
    contentType: row.content_type,
    ciphertext: row.ciphertext,
    nonce: row.nonce,
    tag: row.tag,
    signature: row.signature,
    createdAt: row.created_at,
    receivedAt: Date.now(),
    disappearingDurationMs: row.disappearing_duration_ms ?? null,
    disappearingTrigger: row.disappearing_trigger ?? null,
  })
}

async function replayPendingGroupCiphertexts(groupId: string): Promise<void> {
  const pending = await takePendingGroupCiphertexts(groupId)
  for (const entry of pending) {
    try {
      await processIncomingGroupMessage(toGroupMessageRow(entry))
    } catch (error) {
      console.warn('[GroupChat] Failed to apply buffered group ciphertext:', error)
    }
  }
}

async function processIncomingGroupMessage(row: GroupMessageRow): Promise<void> {
  if (row.key_version !== row.group_revision) {
    return
  }
  const group = await getGroupConversation(row.group_id)
  const epochKey = group
    ? await getGroupEpochKey(group.groupId, row.key_version)
    : null
  if (
    !group
    || !epochKey
    || epochKey.distributionId !== row.distribution_id
  ) {
    await bufferPendingGroupCiphertext(row)
    return
  }

  const membershipSnapshot = await fetchActiveGroupMembers(group.groupId)
  const localMembership = membershipSnapshot.find((member) => member.identityId === currentIdentityId)
  if (!localMembership || row.key_version < localMembership.joinedEpoch) {
    return
  }

  const knownMessageIds = await getKnownGroupMessageIds(group.groupId)
  if (knownMessageIds.has(row.id)) {
    return
  }

  const keyState: GroupSenderKeyState = {
    groupId: group.groupId,
    distributionId: epochKey.distributionId,
    keyBase64: epochKey.keyBase64,
    keyVersion: epochKey.epoch,
    sharedWith: [],
    rotationRevision: epochKey.epoch,
    updatedBy: row.sender_identity_id,
    updatedAt: epochKey.createdAt,
  }

  const aad = serializePayloadAAD({
    groupId: row.group_id,
    senderId: row.sender_identity_id,
    distributionId: row.distribution_id,
    keyVersion: row.key_version,
    revision: row.group_revision,
    contentType: row.content_type,
    messageId: row.id,
  })

  const dilithiumKey = await fetchDilithiumKey(row.sender_identity_id)
  const valid = dilithiumKey
    ? await dilithiumVerifyAsync(
        serializeSignedPayload(aad, row.ciphertext, row.nonce, row.tag),
        row.signature,
        dilithiumKey,
      )
    : false
  if (!valid) {
    return
  }

  let envelope: GroupPayloadEnvelope
  try {
    const plaintext = decryptGroupPayload(
      base64ToBytes(keyState.keyBase64),
      row.ciphertext,
      row.nonce,
      row.tag,
      utf8Bytes(aad)
    )
    envelope = JSON.parse(plaintext) as GroupPayloadEnvelope
  } catch {
    return
  }
  const activeMembers = await fetchActiveGroupMembers(group.groupId)
  if (!activeMembers.some((member) => member.identityId === row.sender_identity_id)) {
    return
  }
  useGroupChatStore.getState().setMembers(group.groupId, activeMembers)
  await storeGroupMembers(group.groupId, activeMembers)
  const members = activeMembers.length > 0
    ? activeMembers
    : (useGroupChatStore.getState().members[group.groupId] || await getStoredGroupMembers(group.groupId))
  await processDecryptedGroupEnvelope(row, group, members, envelope)
  knownMessageIds.add(row.id)
}

export function isGroupRouteParam(value?: string | null): boolean {
  return Boolean(value && value.startsWith(GROUP_ROUTE_PREFIX))
}

export function getGroupIdFromRouteParam(value?: string | null): string | null {
  if (!isGroupRouteParam(value)) return null
  return value!.slice(GROUP_ROUTE_PREFIX.length)
}

export function getGroupRouteParam(groupId: string): string {
  return `${GROUP_ROUTE_PREFIX}${groupId}`
}

async function hydrateStoredGroupConversations(walletAddress: string): Promise<GroupConversation[]> {
  const groups = (await listStoredGroups(walletAddress)).map((group) => ({
    ...group,
    localWalletAddress: walletAddress,
  }))
  if (!isSameAccountStorageScope(useWalletStore.getState().wallet?.address, walletAddress)) {
    return []
  }

  useGroupChatStore.getState().setGroups(groups)
  return groups
}

export async function loadCachedGroupConversations(
  walletAddress: string,
  options: { allowLegacyMigration?: boolean } = {},
): Promise<GroupConversation[]> {
  await prepareGroupStorageScope(walletAddress, {
    ...options,
    activate: false,
  })
  return hydrateStoredGroupConversations(walletAddress)
}

export async function initializeGroupChat(options: GroupServiceInitOptions): Promise<void> {
  if (!isSameAccountStorageScope(useWalletStore.getState().wallet?.address, options.walletAddress)) {
    return
  }
  await prepareGroupStorageScope(options.walletAddress, {
    allowLegacyMigration: options.allowLegacyMigration,
    activate: false,
  })
  if (!isSameAccountStorageScope(useWalletStore.getState().wallet?.address, options.walletAddress)) {
    return
  }

  setActiveGroupStorageScope(options.walletAddress)
  currentIdentityId = options.identityId
  currentWalletAddress = options.walletAddress
  sendDirectControlEnvelope = options.sendDirectControlEnvelope
  configureGroupEpochTransitions(options.identityId, options.sendDirectControlEnvelope)

  const groups = await hydrateStoredGroupConversations(options.walletAddress)
  if (!isSameAccountStorageScope(useWalletStore.getState().wallet?.address, options.walletAddress)) {
    cleanupGroupChat()
    return
  }

  for (const group of groups) {
    const members = await getStoredGroupMembers(group.groupId)
    useGroupChatStore.getState().setMembers(group.groupId, members)
    await reconcileGroupUnreadProjection(group.groupId, {
      identityId: options.identityId,
      scheduleBadge: false,
      walletAddress: options.walletAddress,
    })
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    if (!isSameAccountStorageScope(useWalletStore.getState().wallet?.address, options.walletAddress)) {
      return
    }
  }

  if (!isSameAccountStorageScope(useWalletStore.getState().wallet?.address, options.walletAddress)) {
    return
  }
  scheduleGlobalBadgeSync()
  void (async () => {
    if (options.whenIdle) {
      await options.whenIdle()
    }
    if (!isSameAccountStorageScope(useWalletStore.getState().wallet?.address, options.walletAddress)) {
      return
    }
    startGroupExpirySweep()
    void syncGroupConversations(true).catch((error) => {
      console.warn('[GroupChat] Failed to hydrate groups during initialization:', error)
    })
    void resumePendingGroupEpochTransitions(buildInviteEnvelope).catch((error) => {
      console.warn('[GroupChat] Failed to resume group security update:', error)
    })
  })()
}

export function cleanupGroupChat(): void {
  stopGroupExpirySweep()
  currentIdentityId = null
  currentWalletAddress = null
  sendDirectControlEnvelope = null
  configureGroupEpochTransitions(null, null)
  lastGroupConversationSyncAt = 0
  groupConversationSyncGeneration += 1
  groupConversationSyncPromise = null
  knownGroupMessageIds.clear()
  useGroupChatStore.getState().reset()
  scheduleGlobalBadgeSync()
}

export async function syncGroupConversations(_forceServerRefresh: boolean = false): Promise<GroupConversation[]> {
  ensureConfigured()
  const now = Date.now()
  const cachedGroups = useGroupChatStore.getState().groups
  if (
    lastGroupConversationSyncAt > 0 &&
    now - lastGroupConversationSyncAt < GROUP_CONVERSATION_SYNC_TTL_MS
  ) {
    return cachedGroups
  }

  if (groupConversationSyncPromise) {
    return groupConversationSyncPromise
  }

  groupConversationSyncPromise = (async () => {
    const generation = groupConversationSyncGeneration
    const scopedWallet = currentWalletAddress
    const storedGroups = await listStoredGroups()
    if (
      generation !== groupConversationSyncGeneration
      || !isSameAccountStorageScope(useWalletStore.getState().wallet?.address, scopedWallet)
    ) {
      return []
    }
    const nextGroups: GroupConversation[] = []
    for (const group of storedGroups) {
      if (
        generation !== groupConversationSyncGeneration
        || !isSameAccountStorageScope(useWalletStore.getState().wallet?.address, scopedWallet)
      ) {
        return []
      }
      const members = await getStoredGroupMembers(group.groupId)
      if (
        generation !== groupConversationSyncGeneration
        || !isSameAccountStorageScope(useWalletStore.getState().wallet?.address, scopedWallet)
      ) {
        return []
      }
      useGroupChatStore.getState().setMembers(group.groupId, members)
      nextGroups.push(group)
      await reconcileGroupUnreadProjection(group.groupId, { scheduleBadge: false })
    }
    if (
      generation !== groupConversationSyncGeneration
      || !isSameAccountStorageScope(useWalletStore.getState().wallet?.address, scopedWallet)
    ) {
      return []
    }
    useGroupChatStore.getState().setGroups(nextGroups)
    scheduleGlobalBadgeSync()
    lastGroupConversationSyncAt = Date.now()
    void resumePendingGroupEpochTransitions(buildInviteEnvelope).catch(() => undefined)
    return nextGroups
  })()

  try {
    return await groupConversationSyncPromise
  } finally {
    groupConversationSyncPromise = null
  }
}

export async function createEncryptedGroup(params: {
  title: string
  description?: string
  memberIdentityIds: string[]
}): Promise<GroupConversation> {
  ensureConfigured()

  const title = params.title.trim()
  if (!title) {
    throw new Error('Group title is required')
  }

  const memberIdentityIds = uniqueIdentityIds([currentIdentityId!, ...params.memberIdentityIds])
  if (memberIdentityIds.length < 2) {
    throw new Error('Add at least one member to create a group')
  }
  if (memberIdentityIds.length > MAX_GROUP_CHAT_MEMBERS) {
    throw new Error(`Group chats support up to ${MAX_GROUP_CHAT_MEMBERS} members`)
  }

  const groupId = generateUUID()
  const createdAt = new Date().toISOString()
  const spectreDefaultDisappearingTimer = useSpectreStore.getState().enabled
    ? buildGroupDisappearingTimer(SPECTRE_GROUP_DISAPPEARING_MS, {
        updatedAt: Date.now(),
        updatedBy: currentIdentityId!,
      })
    : null

  const contacts = useChatStore.getState().contacts
  const memberRows = memberIdentityIds.map((identityId) => {
    const contact = contacts.find((entry) => entry.identityId === identityId)
    return {
      group_id: groupId,
      user_identity_id: identityId,
      wallet_address: identityId === currentIdentityId ? currentWalletAddress : contact?.walletAddress || null,
      display_name: identityId === currentIdentityId ? 'You' : contact?.displayName || null,
      role: identityId === currentIdentityId ? 'owner' : 'member',
      is_active: true,
      joined_epoch: 1,
      left_epoch: null,
      joined_at: createdAt,
      updated_at: createdAt,
    }
  })

  const members = memberRows.map((row) => buildGroupMember(row as GroupMemberRow))
  const pending = await beginLocalEpochDistribution({
    groupId,
    epoch: 1,
    rosterHash: rosterHashFor(members.map((member) => member.identityId)),
    title,
    description: params.description?.trim() || null,
    createdAtIso: createdAt,
    members: toInviteMembers(members),
    recipientIdentityIds: members.map((member) => member.identityId),
  })
  const group = buildGroupConversation({
    id: groupId,
    title,
    description: params.description?.trim() || null,
    avatar_url: null,
    created_by_identity_id: currentIdentityId!,
    created_by_wallet_address: currentWalletAddress,
    revision: 1,
    distribution_id: pending.distributionId,
    key_version: 1,
    epoch: 1,
    protocol_version: 2,
    member_count: members.length,
    max_members: MAX_GROUP_CHAT_MEMBERS,
    disappearing_timer_ms: spectreDefaultDisappearingTimer?.durationMs ?? null,
    disappearing_timer_updated_at: spectreDefaultDisappearingTimer ? createdAt : null,
    disappearing_timer_updated_by: spectreDefaultDisappearingTimer ? currentIdentityId! : null,
    created_at: createdAt,
    updated_at: createdAt,
  }, 'owner', members)
  await persistGroupLocally(group, members)
  void executeLocalEpochDistribution(pending, buildInviteEnvelope).catch((error) => {
    console.warn('[GroupChat] Failed to deliver group invitations:', error)
  })

  return group
}

async function rotateMembership(params: {
  group: GroupConversation
  members: GroupChatMember[]
  removedIdentityIds?: string[]
}): Promise<GroupConversation> {
  const epoch = params.group.epoch + 1
  const pending = await beginLocalEpochDistribution({
    groupId: params.group.groupId,
    epoch,
    rosterHash: rosterHashFor(params.members.map((member) => member.identityId)),
    title: params.group.title,
    description: params.group.subtitle ?? null,
    avatarUrl: params.group.avatarUrl ?? null,
    disappearingTimerMs: params.group.disappearingTimer?.durationMs ?? null,
    createdAtIso: new Date(params.group.createdAt).toISOString(),
    members: toInviteMembers(params.members),
    recipientIdentityIds: params.members.map((member) => member.identityId),
    removedIdentityIds: params.removedIdentityIds,
  })
  const nextGroup: GroupConversation = {
    ...params.group,
    memberIds: params.members.map((member) => member.identityId),
    memberCount: params.members.length,
    revision: epoch,
    epoch,
    distributionId: pending.distributionId,
    rotationRequired: false,
    pendingTransitionId: undefined,
    updatedAt: Date.now(),
  }
  await persistGroupLocally(nextGroup, params.members)
  void executeLocalEpochDistribution(pending, buildInviteEnvelope).catch((error) => {
    console.warn('[GroupChat] Failed to deliver group security update:', error)
  })
  return nextGroup
}

function withOwnerFallback(members: GroupChatMember[]): GroupChatMember[] {
  if (members.some((member) => member.role === 'owner')) {
    return members
  }
  return members.map((member, index) => (
    index === 0 ? { ...member, role: 'owner' as const } : member
  ))
}

export async function addGroupMembers(groupId: string, memberIdentityIds: string[]): Promise<GroupConversation> {
  ensureConfigured()
  const group = await getGroupConversation(groupId)
  if (!group) {
    throw new Error('Group not found')
  }
  if (group.myRole !== 'owner' && group.myRole !== 'admin') {
    throw new Error('Only group admins can add members')
  }
  if (group.protocolVersion !== 2) {
    throw new Error('This group requires a Spectra upgrade')
  }

  const existingMembers = await getKnownGroupMembers(groupId)
  const currentIds = new Set(existingMembers.map((member) => member.identityId))
  const additions = uniqueIdentityIds(memberIdentityIds).filter((identityId) => !currentIds.has(identityId))
  if (existingMembers.length + additions.length > MAX_GROUP_CHAT_MEMBERS) {
    throw new Error(`Group chats support up to ${MAX_GROUP_CHAT_MEMBERS} members`)
  }
  if (additions.length === 0) {
    return group
  }

  const contacts = useChatStore.getState().contacts
  const now = Date.now()
  const nextEpoch = group.epoch + 1
  const nextMembers = [
    ...existingMembers,
    ...additions.map((identityId) => {
      const contact = contacts.find((entry) => entry.identityId === identityId)
      return {
        groupId,
        identityId,
        walletAddress: contact?.walletAddress,
        displayName: contact?.displayName,
        role: 'member' as const,
        joinedEpoch: nextEpoch,
        joinedAt: now,
        updatedAt: now,
      }
    }),
  ]
  return rotateMembership({ group, members: nextMembers })
}

export async function removeGroupMember(groupId: string, memberIdentityId: string): Promise<GroupConversation> {
  ensureConfigured()
  const group = await getGroupConversation(groupId)
  if (!group) {
    throw new Error('Group not found')
  }
  if (group.myRole !== 'owner' && group.myRole !== 'admin') {
    throw new Error('Only group admins can remove members')
  }
  if (memberIdentityId === currentIdentityId) {
    throw new Error('Use leaveGroup for your own membership')
  }
  if (group.protocolVersion !== 2) {
    throw new Error('This group requires a Spectra upgrade')
  }
  const existingMembers = await getKnownGroupMembers(groupId)
  const nextMembers = withOwnerFallback(
    existingMembers.filter((member) => member.identityId !== memberIdentityId),
  )
  if (nextMembers.length < 1) {
    throw new Error('Group must keep at least one member')
  }
  return rotateMembership({
    group,
    members: nextMembers,
    removedIdentityIds: [memberIdentityId],
  })
}

export async function leaveGroup(groupId: string): Promise<void> {
  ensureConfigured()

  const group = await getGroupConversation(groupId)
  if (!group || group.protocolVersion !== 2) {
    throw new Error('This group requires a Spectra upgrade')
  }
  const existingMembers = await getKnownGroupMembers(groupId)
  const remaining = withOwnerFallback(
    existingMembers.filter((member) => member.identityId !== currentIdentityId),
  )
  if (remaining.length > 0) {
    await rotateMembership({
      group,
      members: remaining,
      removedIdentityIds: [currentIdentityId!],
    })
  }

  await deleteConversationMedia(createConversationId(groupId)).catch(() => {})
  await removeStoredGroup(groupId)
  await clearGroupEpochSecrets(groupId)
  useGroupChatStore.getState().removeGroup(groupId)
  useGroupChatStore.getState().setActiveGroup(null)
  scheduleGlobalBadgeSync()
}

export async function clearGroupChatLocally(groupId: string): Promise<{ error: Error | null }> {
  try {
    const group = await getGroupConversation(groupId)
    if (!group) {
      throw new Error('Group not found')
    }

    await clearStoredGroupMessages(groupId)
    await deleteConversationMedia(createConversationId(groupId)).catch(() => {})
    useGroupChatStore.getState().setMessages(groupId, [])
    await persistGroupConversation(groupId, {
      lastMessage: undefined,
      unreadCount: 0,
      updatedAt: Date.now(),
    })
    await reconcileGroupUnreadProjection(groupId, { markRead: true })

    return { error: null }
  } catch (error) {
    return { error: error as Error }
  }
}

export async function uploadGroupAvatar(
  groupId: string,
  fileUri: string,
  fileType: string,
  fileName: string = 'group-photo'
): Promise<{ url: string | null; error: Error | null }> {
  try {
    ensureConfigured()
    const fileExt = fileType.split('/')[1] || 'jpg'
    const safeName = sanitizeStorageName(fileName.replace(/\.[^.]+$/, ''))
    const storagePath = `groups/${groupId}/${Date.now()}_${safeName}.${fileExt}`
    const uploadCorrelationId = `group-avatar:${storagePath}`

    if (__DEV__) {
      console.log('[GroupAvatarUpload] upload_group_avatar_transport_start', {
        uploadCorrelationId,
        groupId,
        fileType,
        storagePath,
      })
    }

    const accessToken = await getValidBackendAccessToken()
    if (!accessToken) {
      throw new Error('Backend auth token is required')
    }
    const uploadResult = await uploadObjectWithBackend({
      fileUri,
      fileName: `${safeName}.${fileExt}`,
      contentType: fileType,
      diagnostics: {
        caller: 'groupChat.uploadGroupAvatar',
        correlationId: uploadCorrelationId,
      },
    }, { accessToken })

    if (uploadResult.error) {
      throw uploadResult.error
    }

    return { url: uploadResult.objectRef, error: null }
  } catch (error) {
    if (__DEV__) {
      console.error('[GroupAvatarUpload] upload_group_avatar_transport_exception', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
    return { url: null, error: error as Error }
  }
}

export async function updateGroupAvatar(
  groupId: string,
  avatarUrl: string | null
): Promise<{ group: GroupConversation | null; error: Error | null }> {
  try {
    ensureConfigured()
    const group = await getGroupConversation(groupId)
    if (!group) throw new Error('Group not found')
    if (!['owner', 'admin'].includes(group.myRole)) {
      throw new Error('Only group admins can change the group photo')
    }

    const next = await persistGroupConversation(groupId, {
      avatarUrl: avatarUrl || undefined,
      updatedAt: Date.now(),
    })
    if (next) {
      const members = await getKnownGroupMembers(groupId)
      await pushSenderKeyDistributions(
        members.map((member) => member.identityId),
        next,
        members,
        await ensureSenderKeyState(next),
      )
    }

    return { group: next, error: null }
  } catch (error) {
    return { group: null, error: error as Error }
  }
}

export async function loadGroupMessages(groupId: string): Promise<ChatMessage[]> {
  ensureConfigured()
  const stored = await loadCachedGroupMessages(groupId, currentWalletAddress)
  refreshGroupLastMessage(groupId).catch(() => {})
  await reconcileGroupUnreadProjection(groupId)
  void hydrateStoredGroupAttachments(groupId, stored)

  return useGroupChatStore.getState().messages[groupId] || stored
}

export async function loadCachedGroupMessages(
  groupId: string,
  walletAddress?: string | null,
): Promise<ChatMessage[]> {
  const store = useGroupChatStore.getState()
  store.setLoadingMessages(true)

  try {
    const blockIncomingMedia = shouldBlockIncomingGroupMediaInSpectre()
    const stored = (await getStoredGroupMessages(groupId, 50, walletAddress))
      .filter((message) => !hasDisappearingMessageExpired(message.disappearing))
      .map((message) => (
        blockIncomingMedia
        && message.senderId !== currentIdentityId
        && message.attachments?.length
          ? { ...message, attachments: createSpectreBlockedMediaAttachments(message.attachments) }
          : message
      ))
    if (
      walletAddress
      && !isSameAccountStorageScope(useWalletStore.getState().wallet?.address, walletAddress)
    ) {
      return []
    }
    useGroupChatStore.getState().setMessages(groupId, stored)
    return stored
  } catch (error) {
    console.error('Failed to load cached group messages:', error)
    return []
  } finally {
    useGroupChatStore.getState().setLoadingMessages(false)
  }
}

export async function loadOlderGroupMessages(
  groupId: string,
  beforeMessageId: string,
  limit: number = 50,
): Promise<{ messages: ChatMessage[]; hasMore: boolean }> {
  ensureConfigured()
  try {
    const messages: ChatMessage[] = []
    let cursor = beforeMessageId
    let hasMore = true

    while (messages.length < limit && hasMore) {
      const page = await getStoredGroupMessagesPage(groupId, {
        beforeMessageId: cursor,
        limit: limit - messages.length,
      })
      messages.push(
        ...page.messages.filter(
          (message) => !hasDisappearingMessageExpired(message.disappearing),
        ),
      )
      hasMore = page.hasMore
      if (!page.nextCursor || page.nextCursor === cursor) {
        hasMore = false
        break
      }
      cursor = page.nextCursor
    }

    const older = messages.slice(0, limit).sort((a, b) => a.timestamp - b.timestamp)
    if (older.length > 0) {
      useGroupChatStore.getState().mergeMessages(groupId, older)
    }
    return { messages: older, hasMore }
  } catch (error) {
    console.warn('[GroupChat] Failed to load older messages:', error)
    return { messages: [], hasMore: true }
  }
}

export async function updateGroupDisappearingTimer(
  groupId: string,
  durationMs: number | null,
): Promise<{ group: GroupConversation | null; error: Error | null }> {
  try {
    ensureConfigured()
    const group = await getGroupConversation(groupId)
    if (!group) {
      throw new Error('Group not found')
    }
    if (!canManageGroupDisappearingTimer(group.myRole)) {
      throw new Error('Only group admins can change disappearing messages')
    }

    const updatedAtIso = new Date().toISOString()
    const nextTimer = buildGroupDisappearingTimer(durationMs, {
      updatedAt: new Date(updatedAtIso).getTime(),
      updatedBy: currentIdentityId!,
    })

    const members = await getKnownGroupMembers(groupId)
    const nextGroup = {
      ...group,
      disappearingTimer: nextTimer,
      updatedAt: Date.now(),
    }
    await persistGroupLocally(nextGroup, members)
    await pushSenderKeyDistributions(
      members.map((member) => member.identityId),
      nextGroup,
      members,
      await ensureSenderKeyState(nextGroup),
    )
    return { group: nextGroup, error: null }
  } catch (error) {
    return { group: null, error: error as Error }
  }
}

export async function sendGroupMessage(
  groupId: string,
  content: string,
  replyTo?: ReplyReference | null,
  attachments?: MediaAttachment[],
  onProgress?: (progress: MessageSendProgress) => void,
  retryMessage?: ChatMessage | null,
): Promise<{ message: ChatMessage | null; error: Error | null }> {
  const spectreRestriction = getSpectreChatRestrictionMessage(getCurrentSpectrePolicyState(), {
    hasAttachments: Boolean(attachments?.length),
    content,
  })
  if (spectreRestriction) {
    return { message: null, error: new Error(spectreRestriction) }
  }

  let optimisticMessageId: string | null = null
  try {
    ensureConfigured()
    const cachedGroup = useGroupChatStore.getState().groups.find((group) => group.groupId === groupId) ?? null
    const createdAtIso = new Date().toISOString()
    const messageId = retryMessage?.id?.startsWith('local:')
      ? retryMessage.id.slice('local:'.length)
      : generateUUID()
    const conversationId = createConversationId(groupId)
    const timestamp = retryMessage?.timestamp ?? new Date(createdAtIso).getTime()
    const normalizedAttachments = attachments?.filter(Boolean) || []
    const uploadedMedia: UploadedGroupAttachment[] = []
    const optimisticAttachments = normalizedAttachments.length > 0
      ? normalizedAttachments.map((attachment) => ({
          ...attachment,
          isEncrypted: false,
        }))
      : undefined
    const resolveDisappearingState = (group: GroupConversation | null) => {
      const spectreDefaultDisappearingTimer =
        useSpectreStore.getState().enabled && !isDisappearingTimerEnabled(group?.disappearingTimer)
          ? buildGroupDisappearingTimer(SPECTRE_GROUP_DISAPPEARING_MS, {
              updatedAt: timestamp,
              updatedBy: currentIdentityId!,
            })
          : null
      const timer = normalizeDisappearingTimer(
        group?.disappearingTimer ?? spectreDefaultDisappearingTimer ?? null,
      )
      return {
        timer,
        disappearing: buildGroupMessageDisappearingState(timer, timestamp),
      }
    }
    let { timer: disappearingTimer, disappearing } = resolveDisappearingState(cachedGroup)

    optimisticMessageId = retryMessage?.id ?? `local:${messageId}`
    const optimisticMessage: ChatMessage = {
      id: optimisticMessageId,
      conversationId,
      conversationType: 'group',
      groupId,
      senderId: currentIdentityId!,
      senderName: 'You',
      content,
      timestamp,
      status: 'sending',
      signatureVerified: true,
      attachments: optimisticAttachments,
      replyTo: replyTo || undefined,
      disappearing,
      deleted: false,
    }
    const existingOptimistic = useGroupChatStore
      .getState()
      .messages[groupId]
      ?.some((entry) => entry.id === optimisticMessageId)
    if (existingOptimistic) {
      useGroupChatStore.getState().updateMessage(groupId, optimisticMessageId, optimisticMessage)
    } else {
      useGroupChatStore.getState().addMessage(groupId, optimisticMessage)
    }
    await updateGroupLastMessage(groupId, {
      content: buildAttachmentPreview(content, optimisticAttachments),
      timestamp: optimisticMessage.timestamp,
      isOwn: true,
    })

    const group = cachedGroup ?? await getGroupConversation(groupId)
    if (!group) {
      throw new Error('Group not found')
    }
    const resolvedDisappearingState = resolveDisappearingState(group)
    disappearingTimer = resolvedDisappearingState.timer
    disappearing = resolvedDisappearingState.disappearing
    useGroupChatStore.getState().updateMessage(groupId, optimisticMessageId, {
      disappearing,
    })

    const members = await getKnownGroupMembers(groupId)
    const keyState = await ensureSenderKeyState(group)
    const signingIdentity = await getSigningIdentity()

    const uploadedAttachments = await mapWithConcurrencySettled(
      normalizedAttachments,
      GROUP_MEDIA_UPLOAD_CONCURRENCY,
      async (attachment, index): Promise<UploadedGroupAttachment> => {
        onProgress?.({
          stage: 'attachment_upload',
          percentage: Math.floor((index / Math.max(normalizedAttachments.length, 1)) * 80),
          completed: index + 1,
          total: normalizedAttachments.length,
        })

        const uploaded = await uploadEncryptedMedia(
          attachment,
          currentIdentityId!,
          groupId,
          conversationId,
          (mediaProgress) => {
            const baseProgress = (index / Math.max(normalizedAttachments.length, 1)) * 80
            const itemProgress = (mediaProgress.percentage / 100) * (80 / Math.max(normalizedAttachments.length, 1))
            onProgress?.({
              stage: 'attachment_upload',
              percentage: Math.floor(baseProgress + itemProgress),
              completed: index + 1,
              total: normalizedAttachments.length,
            })
          }
        )

        return {
          id: uploaded.id,
          encryptionKey: uploaded.encryptionKey,
          type: attachment.type,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          fileSize: attachment.fileSize,
          width: attachment.width,
          height: attachment.height,
          durationMs: attachment.durationMs,
          waveform: attachment.waveform,
        }
      },
      (_attachment, _index, error) => {
        throw error
      },
    )
    uploadedMedia.push(...uploadedAttachments)

    onProgress?.({ stage: 'sending_message', percentage: normalizedAttachments.length > 0 ? 85 : 50 })
    const contentWithAttachments = normalizedAttachments.length > 0
      ? `${buildQMediaReferences(uploadedMedia)}${content ? `\n${content}` : ''}`
      : content

    const envelope: GroupPayloadEnvelope = {
      v: GROUP_MESSAGE_VERSION,
      type: 'text',
      text: contentWithAttachments,
      ...(replyTo ? { replyTo } : {}),
      ...(disappearingTimer ? { disappearing: disappearingTimer } : {}),
    }

    const aad = serializePayloadAAD({
      groupId,
      senderId: currentIdentityId!,
      distributionId: keyState.distributionId,
      keyVersion: keyState.keyVersion,
      revision: group.revision || keyState.rotationRevision,
      contentType: 'text',
      messageId,
    })
    const encrypted = encryptGroupPayload(
      base64ToBytes(keyState.keyBase64),
      JSON.stringify(envelope),
      utf8Bytes(aad)
    )
    const signature = await dilithiumSignAsync(
      serializeSignedPayload(aad, encrypted.ciphertext, encrypted.nonce, encrypted.tag),
      signingIdentity.dilithiumPrivateKey
    )

    await publishGroupCiphertext({
      messageId,
      groupId,
      distributionId: keyState.distributionId,
      keyVersion: keyState.keyVersion,
      revision: group.revision,
      contentType: 'text',
      ciphertext: encrypted.ciphertext,
      nonce: encrypted.nonce,
      tag: encrypted.tag,
      signature,
      recipientIdentityIds: members.map((member) => member.identityId),
      disappearingDurationMs: disappearingTimer?.durationMs ?? null,
      disappearingTrigger: disappearingTimer?.trigger ?? null,
    })

    onProgress?.({ stage: 'caching_locally', percentage: normalizedAttachments.length > 0 ? 95 : 90 })
    const localAttachments = normalizedAttachments.length > 0
      ? await cacheSentGroupAttachments(groupId, messageId, normalizedAttachments, uploadedMedia)
      : undefined

    const message: ChatMessage = {
      id: messageId,
      conversationId,
      conversationType: 'group',
      groupId,
      senderId: currentIdentityId!,
      senderName: 'You',
      content,
      timestamp,
      status: 'sent',
      signatureVerified: true,
      attachments: localAttachments,
      replyTo: replyTo || undefined,
      disappearing,
    }

    if (optimisticMessageId) {
      useGroupChatStore.getState().removeMessage(groupId, optimisticMessageId)
    }
    useGroupChatStore.getState().addMessage(groupId, message)
    await storeGroupMessage(groupId, message)
    await updateGroupLastMessage(groupId, {
      content: buildAttachmentPreview(content, localAttachments),
      timestamp: message.timestamp,
      isOwn: true,
    })

    onProgress?.({ stage: 'complete', percentage: 100 })

    return { message, error: null }
  } catch (error) {
    if (optimisticMessageId) {
      useGroupChatStore.getState().updateMessage(groupId, optimisticMessageId, {
        status: 'failed',
        deliveryStage: 'failed',
        deliveryHint: 'Failed',
      })
      await refreshGroupLastMessage(groupId)
    }
    return { message: null, error: error as Error }
  }
}

export async function retryFailedGroupMessage(
  groupId: string,
  failedMessage: ChatMessage,
): Promise<{ message: ChatMessage | null; error: Error | null }> {
  if (failedMessage.status !== 'failed') {
    return { message: null, error: new Error('Only failed messages can be retried') }
  }

  return sendGroupMessage(
    groupId,
    failedMessage.content,
    failedMessage.replyTo ?? null,
    failedMessage.attachments,
    undefined,
    failedMessage,
  )
}

export async function sendGroupReaction(
  groupId: string,
  targetMessageId: string,
  emoji: string
): Promise<{ error: Error | null }> {
  try {
    ensureConfigured()
    const group = await getGroupConversation(groupId)
    if (!group) {
      throw new Error('Group not found')
    }
    const keyState = await ensureSenderKeyState(group)
    const signingIdentity = await getSigningIdentity()
    const members = await getKnownGroupMembers(groupId)
    const messageId = generateUUID()
    const envelope: GroupPayloadEnvelope = {
      v: GROUP_MESSAGE_VERSION,
      type: 'reaction',
      reaction: { targetMessageId, emoji },
    }

    const aad = serializePayloadAAD({
      groupId,
      senderId: currentIdentityId!,
      distributionId: keyState.distributionId,
      keyVersion: keyState.keyVersion,
      revision: group.revision,
      contentType: 'reaction',
      messageId,
    })
    const encrypted = encryptGroupPayload(
      base64ToBytes(keyState.keyBase64),
      JSON.stringify(envelope),
      utf8Bytes(aad)
    )
    const signature = await dilithiumSignAsync(
      serializeSignedPayload(aad, encrypted.ciphertext, encrypted.nonce, encrypted.tag),
      signingIdentity.dilithiumPrivateKey
    )

    await publishGroupCiphertext({
      messageId,
      groupId,
      distributionId: keyState.distributionId,
      keyVersion: keyState.keyVersion,
      revision: group.revision,
      contentType: 'reaction',
      ciphertext: encrypted.ciphertext,
      nonce: encrypted.nonce,
      tag: encrypted.tag,
      signature,
      recipientIdentityIds: members.map((member) => member.identityId),
    })

    useGroupChatStore.getState().addReaction(groupId, targetMessageId, {
      emoji,
      senderId: currentIdentityId!,
      timestamp: Date.now(),
    })
    return { error: null }
  } catch (error) {
    return { error: error as Error }
  }
}

export async function sendGroupCryptoPaymentRequestUpdate(
  groupId: string,
  update: CryptoPaymentRequestUpdate,
): Promise<{ error: Error | null }> {
  try {
    const group = await getGroupConversation(groupId)
    if (!group) {
      throw new Error('Group not found')
    }

    const keyState = await ensureSenderKeyState(group)
    const signingIdentity = await getSigningIdentity()
    const members = await getKnownGroupMembers(groupId)
    const messageId = generateUUID()
    const envelope: GroupPayloadEnvelope = {
      v: GROUP_MESSAGE_VERSION,
      type: 'crypto_payment_request_update',
      update,
    }

    const aad = serializePayloadAAD({
      groupId,
      senderId: currentIdentityId!,
      distributionId: keyState.distributionId,
      keyVersion: keyState.keyVersion,
      revision: group.revision,
      contentType: 'text',
      messageId,
    })
    const encrypted = encryptGroupPayload(
      base64ToBytes(keyState.keyBase64),
      JSON.stringify(envelope),
      utf8Bytes(aad)
    )
    const signature = await dilithiumSignAsync(
      serializeSignedPayload(aad, encrypted.ciphertext, encrypted.nonce, encrypted.tag),
      signingIdentity.dilithiumPrivateKey
    )

    await publishGroupCiphertext({
      messageId,
      groupId,
      distributionId: keyState.distributionId,
      keyVersion: keyState.keyVersion,
      revision: group.revision,
      contentType: 'text',
      ciphertext: encrypted.ciphertext,
      nonce: encrypted.nonce,
      tag: encrypted.tag,
      signature,
      recipientIdentityIds: members.map((member) => member.identityId),
    })

    await applyGroupCryptoPaymentRequestUpdate(groupId, update)
    return { error: null }
  } catch (error) {
    return { error: error as Error }
  }
}

export async function deleteGroupMessageForAll(
  groupId: string,
  targetMessageId: string
): Promise<{ error: Error | null }> {
  try {
    ensureConfigured()
    const group = await getGroupConversation(groupId)
    if (!group) {
      throw new Error('Group not found')
    }
    const targetMessage =
      (useGroupChatStore.getState().messages[groupId] || []).find((message) => message.id === targetMessageId)
      || (await getStoredGroupMessages(groupId)).find((message) => message.id === targetMessageId)
    if (!targetMessage || targetMessage.senderId !== currentIdentityId) {
      throw new Error('Only the original sender can delete a group message for everyone')
    }
    const keyState = await ensureSenderKeyState(group)
    const signingIdentity = await getSigningIdentity()
    const members = await getKnownGroupMembers(groupId)
    const messageId = generateUUID()
    const envelope: GroupPayloadEnvelope = {
      v: GROUP_MESSAGE_VERSION,
      type: 'deletion',
      deletionTarget: targetMessageId,
    }

    const aad = serializePayloadAAD({
      groupId,
      senderId: currentIdentityId!,
      distributionId: keyState.distributionId,
      keyVersion: keyState.keyVersion,
      revision: group.revision,
      contentType: 'deletion',
      messageId,
    })
    const encrypted = encryptGroupPayload(
      base64ToBytes(keyState.keyBase64),
      JSON.stringify(envelope),
      utf8Bytes(aad)
    )
    const signature = await dilithiumSignAsync(
      serializeSignedPayload(aad, encrypted.ciphertext, encrypted.nonce, encrypted.tag),
      signingIdentity.dilithiumPrivateKey
    )

    await publishGroupCiphertext({
      messageId,
      groupId,
      distributionId: keyState.distributionId,
      keyVersion: keyState.keyVersion,
      revision: group.revision,
      contentType: 'deletion',
      ciphertext: encrypted.ciphertext,
      nonce: encrypted.nonce,
      tag: encrypted.tag,
      signature,
      recipientIdentityIds: members.map((member) => member.identityId),
    })

    useGroupChatStore.getState().updateMessage(groupId, targetMessageId, { deleted: true, content: '' })
    await updateStoredGroupMessage(groupId, targetMessageId, { deleted: true, content: '' })
    await refreshGroupLastMessage(groupId)
    return { error: null }
  } catch (error) {
    return { error: error as Error }
  }
}

export async function markGroupAsRead(groupId: string): Promise<void> {
  await reconcileGroupUnreadProjection(groupId, { markRead: true })
}

export async function pollForNewGroupMessages(): Promise<void> {}

export async function processDirectGroupControlEnvelope(
  envelope: DirectGroupControlEnvelope,
  senderIdentityId: string
): Promise<boolean> {
  const envelopeType = getDirectGroupControlEnvelopeType(envelope)

  if (envelopeType === 'group_ciphertext') {
    ensureConfigured()
    if (!isGroupCiphertextEnvelope(envelope)) {
      return true
    }
    if (envelope.recipientIdentityId !== currentIdentityId) {
      return true
    }
    const payload = envelope.payload
    if (payload.senderIdentityId !== senderIdentityId) {
      return true
    }
    const row: GroupMessageRow = {
      id: payload.id,
      group_id: envelope.groupId,
      sender_identity_id: payload.senderIdentityId,
      distribution_id: payload.distributionId,
      key_version: payload.keyVersion,
      group_revision: payload.groupRevision,
      content_type: payload.contentType,
      ciphertext: payload.ciphertext,
      nonce: payload.nonce,
      tag: payload.tag,
      signature: payload.signature,
      created_at: payload.createdAt,
      disappearing_duration_ms: payload.disappearingDurationMs ?? null,
      disappearing_trigger: payload.disappearingTrigger ?? null,
    }
    try {
      await processIncomingGroupMessage(row)
    } catch (error) {
      console.warn('[GroupChat] Failed to process group ciphertext:', error)
    }
    return true
  }

  if (envelopeType === 'group_sender_key_distribution') {
    ensureConfigured()
    if (isGroupInviteEnvelope(envelope)) {
      return acceptGroupInviteEnvelope(envelope, senderIdentityId)
    }
    if (!isSenderKeyDistributionEnvelope(envelope)) {
      return true
    }

    const group = await getGroupConversation(envelope.groupId)
    if (
      !group
      || envelope.recipientIdentityId !== currentIdentityId
      || !senderKeyDistributionMatchesGroup(envelope, group)
    ) {
      return true
    }

    const members = await getKnownGroupMembers(envelope.groupId)
    const senderMember = members.find((member) => member.identityId === senderIdentityId)
    if (
      (senderMember?.role !== 'owner' && senderMember?.role !== 'admin')
      || !isActiveMember(members, currentIdentityId!)
    ) {
      return true
    }

    const existingKeyState = await getGroupEpochKey(envelope.groupId, envelope.keyVersion)
    if (
      existingKeyState
      && existingKeyState.distributionId === envelope.distributionId
    ) {
      return true
    }

    await storeGroupEpochKey({
      schemaVersion: 1,
      groupId: envelope.groupId,
      epoch: envelope.keyVersion,
      distributionId: envelope.distributionId,
      keyBase64: envelope.keyBase64,
      createdAt: Date.now(),
    })
    await replayPendingGroupCiphertexts(envelope.groupId)
    return true
  }

  if (envelopeType === 'group_sender_key_request') {
    ensureConfigured()
    if (!isSenderKeyRequestEnvelope(envelope)) {
      return true
    }
    if (envelope.requesterId !== senderIdentityId) {
      return true
    }
    return true
  }

  if (envelopeType === 'group_tor_state') {
    return true
  }

  return false
}

async function acceptGroupInviteEnvelope(
  envelope: GroupInviteEnvelope,
  senderIdentityId: string,
): Promise<boolean> {
  if (envelope.recipientIdentityId !== currentIdentityId) {
    return true
  }

  const recipientListed = envelope.members.some((member) => member.identityId === currentIdentityId)
  const senderMember = envelope.members.find((member) => member.identityId === senderIdentityId)
  const existing = await getGroupConversation(envelope.groupId)

  if (!recipientListed) {
    if (existing) {
      const localMembers = await getKnownGroupMembers(envelope.groupId)
      const localSender = localMembers.find((member) => member.identityId === senderIdentityId)
      if (localSender?.role === 'owner' || localSender?.role === 'admin') {
        await deleteConversationMedia(createConversationId(envelope.groupId)).catch(() => {})
        await removeStoredGroup(envelope.groupId)
        await clearGroupEpochSecrets(envelope.groupId)
        useGroupChatStore.getState().removeGroup(envelope.groupId)
        scheduleGlobalBadgeSync()
      }
    }
    return true
  }

  if (!senderMember || (senderMember.role !== 'owner' && senderMember.role !== 'admin')) {
    return true
  }

  if (existing) {
    const localMembers = await getKnownGroupMembers(envelope.groupId)
    const localSender = localMembers.find((member) => member.identityId === senderIdentityId)
    if (!localSender || (localSender.role !== 'owner' && localSender.role !== 'admin')) {
      return true
    }
    if (envelope.rotationRevision < existing.revision) {
      return true
    }
    if (
      envelope.rotationRevision === existing.revision
      && envelope.distributionId !== existing.distributionId
    ) {
      return true
    }
  }

  if (!envelope.keyBase64) {
    return true
  }
  const keyBytes = base64ToBytes(envelope.keyBase64)
  try {
    if (!isGroupEpochKeyBytes(keyBytes)) {
      return true
    }
  } finally {
    keyBytes.fill(0)
  }
  const existingKey = await getGroupEpochKey(envelope.groupId, envelope.keyVersion)
  if (existingKey && existingKey.distributionId !== envelope.distributionId) {
    return true
  }
  if (!existingKey) {
    await storeGroupEpochKey({
      schemaVersion: 1,
      groupId: envelope.groupId,
      epoch: envelope.keyVersion,
      distributionId: envelope.distributionId,
      keyBase64: envelope.keyBase64,
      createdAt: Date.now(),
    })
  }

  const timestamp = Date.parse(envelope.createdAt)
  const joinedAt = Number.isFinite(timestamp) ? timestamp : Date.now()
  const members = fromInviteMembers(envelope.groupId, envelope.members, joinedAt)
  const myRole = members.find((member) => member.identityId === currentIdentityId)?.role || 'member'
  const group = buildGroupConversation({
    id: envelope.groupId,
    title: envelope.title,
    description: envelope.description ?? null,
    avatar_url: envelope.avatarUrl ?? null,
    created_by_identity_id: senderIdentityId,
    created_by_wallet_address: null,
    revision: envelope.rotationRevision,
    distribution_id: envelope.distributionId,
    key_version: envelope.keyVersion,
    epoch: envelope.keyVersion,
    protocol_version: 2,
    member_count: members.length,
    max_members: MAX_GROUP_CHAT_MEMBERS,
    disappearing_timer_ms: envelope.disappearingTimerMs ?? null,
    disappearing_timer_updated_at: envelope.disappearingTimerMs ? envelope.createdAt : null,
    disappearing_timer_updated_by: envelope.disappearingTimerMs ? senderIdentityId : null,
    created_at: envelope.createdAt,
    updated_at: new Date().toISOString(),
  }, myRole, members, existing)
  await persistGroupLocally(group, members)
  await replayPendingGroupCiphertexts(envelope.groupId)
  return true
}
