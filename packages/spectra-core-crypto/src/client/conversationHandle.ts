/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

/**
 * ConversationHandle - Per-conversation API for sending, receiving, and managing messages.
 *
 * Extracted from chat.ts to reduce file size and clarify boundaries.
 */

import type {
  ChatIdentity,
  ChatIdentityWithKeys,
  PrivateKeyBundle,
  PublicKeyBundle,
  Conversation,
  Session,
  Message,
  DecryptedMessage,
  EncryptedMessage,
  RelayedMessage,
  OutboundSealedRelayRecord,
  SealedRelayedMessage,
  SafetyNumber,
  MessageReceivedEvent,
  StoredDisappearingMessageState,
  StoredOneTimeMetadata,
} from '../types/index'
import { localChatStorage } from '../storage/local'
import { now, createMessageHash } from '../crypto/utils'
import { sealRelayEnvelope } from '../crypto/sealedEnvelope'
import {
  establishSessionAsInitiator,
  getActiveSessionByRemoteIdentity,
  prepareSessionMessage,
  sessionNeedsReestablishment,
} from './session'
import {
  compactTransportBundleFingerprint,
  createCompactTransportBundle,
  shouldAttachRelaySenderBundle,
} from './transportBundle'
import {
  ATTACHMENT_PIPELINE_EVENT_NAME,
  buildAttachmentPipelineFields,
  tagAttachmentPipelineError,
  type AttachmentPipelineTraceContext,
} from './attachmentDiagnostics'
import { BundleServerRequestError } from '../server/index'
import { stageRelayDeliveryOutbox } from '../messageLifecycle'
import type { QuantumChat } from './chat'

const VIEW_ONCE_PREVIEW_TEXT = 'One-time message'
const sendQueuesByConversationId = new Map<string, Promise<void>>()

type BundleServerLikeSendSealedMessage = (record: OutboundSealedRelayRecord) => Promise<SealedRelayedMessage>
type OutboundMessageOptions = {
  messageKind?: 'text' | 'view_once' | 'call_invitation' | 'hidden_control'
  localOrderTimestamp?: number
  disappearing?: StoredDisappearingMessageState
}
type PreparedOutboundMessage = {
  session: Session
  decrypted: DecryptedMessage
  encrypted: EncryptedMessage
  message: Message
  conversationUpdate: Partial<Conversation>
}
type PreparedMessageTransform = (
  prepared: PreparedOutboundMessage,
) => Promise<PreparedOutboundMessage> | PreparedOutboundMessage

async function enqueueConversationSend<T>(
  conversationId: string,
  task: () => Promise<T>,
): Promise<T> {
  const previous = sendQueuesByConversationId.get(conversationId) ?? Promise.resolve()
  const run = previous.catch(() => undefined).then(task)
  const tail = run.then(() => undefined, () => undefined)

  sendQueuesByConversationId.set(conversationId, tail)

  try {
    return await run
  } finally {
    if (sendQueuesByConversationId.get(conversationId) === tail) {
      sendQueuesByConversationId.delete(conversationId)
    }
  }
}

function isViewOnceRelayMessage(
  messageKind?: 'text' | 'view_once' | 'call_invitation' | 'hidden_control',
  content?: string,
): boolean {
  if (messageKind === 'view_once') {
    return true
  }

  if (!content?.startsWith('{')) {
    return false
  }

  try {
    const parsed = JSON.parse(content)
    return parsed?.v === 2 && parsed?.type === 'view_once'
  } catch {
    return false
  }
}

function createStoredLockedViewOnce(): StoredOneTimeMetadata {
  return {
    state: 'locked',
    requiresReveal: true,
  }
}

export function shouldSyncRelayReadForMessage(message: Message): boolean {
  if (
    message.messageKind === 'call_invitation'
    || message.messageKind === 'hidden_control'
  ) {
    return false
  }
  if (message.messageKind === 'view_once' && message.oneTime?.state === 'locked') {
    return false
  }

  const content = message.content
  if (!content) return true
  if (content.startsWith('[QCALL:')) return false
  if (!content.startsWith('{')) return true

  try {
    const parsed = JSON.parse(content)
    return !(parsed?.v === 2 && parsed.type && parsed.type !== 'text')
  } catch {
    return true
  }
}

export async function markConversationReadState(
  client: Pick<QuantumChat, 'areReadReceiptsEnabled' | 'markRelayMessageRead'>,
  conversationId: string,
  remoteIdentityId: string,
  syncRelayReadState: boolean = true,
): Promise<void> {
  const rawMessages = await localChatStorage.getMessages(conversationId)
  const messagesToMarkRead = rawMessages.filter((message) =>
    message.senderIdentityId === remoteIdentityId && message.status !== 'read'
  )
  if (messagesToMarkRead.length > 0) {
    await localChatStorage.updateConversation(conversationId, {
      unreadProjectionDirty: true,
    })
  }

  const readReceiptsEnabled = syncRelayReadState && client.areReadReceiptsEnabled()
  const newlyEligibleMessageIds = new Set<string>()
  for (const message of messagesToMarkRead) {
    const relayReadReceiptEligible =
      readReceiptsEnabled && shouldSyncRelayReadForMessage(message)
    await localChatStorage.updateMessageStatus(message.id, 'read', {
      relayReadReceiptEligible,
    })
    if (relayReadReceiptEligible) {
      newlyEligibleMessageIds.add(message.id)
    }
  }

  if (!readReceiptsEnabled) return

  const messagesNeedingRelaySync = rawMessages
    .filter((message) =>
      message.senderIdentityId === remoteIdentityId
      && Boolean(message.relayMessageId)
      && shouldSyncRelayReadForMessage(message)
      && (
        message.relayReadReceiptEligible === true
        || newlyEligibleMessageIds.has(message.id)
      )
    )
    .sort((left, right) => left.createdAt - right.createdAt)

  const batchSize = 5
  for (let index = 0; index < messagesNeedingRelaySync.length; index += batchSize) {
    const batch = messagesNeedingRelaySync.slice(index, index + batchSize)
    await Promise.allSettled(
      batch.map((message) => client.markRelayMessageRead(message.relayMessageId!))
    )
  }
}

export class ConversationHandle {
  private client: QuantumChat
  private conversation: Conversation
  private sessionId: string
  private localIdentity: ChatIdentityWithKeys
  private privateBundle: PrivateKeyBundle
  private remoteIdentity: ChatIdentity
  private messageCallbacks: Set<(message: DecryptedMessage) => void> = new Set()
  private lastMessageHash: string | undefined
  private nextOutgoingSequenceNumber: number | undefined

  private async decideRelaySenderBundle(
    encrypted: EncryptedMessage,
    ourBundle: PublicKeyBundle,
  ): Promise<{ senderBundle?: PublicKeyBundle; persistFingerprint?: string }> {
    const compact = createCompactTransportBundle(ourBundle)
    const fingerprint = compactTransportBundleFingerprint(compact)
    const last = await localChatStorage.getRelaySenderBundleAttachState(
      this.localIdentity.id,
      this.remoteIdentity.id,
    )
    if (!shouldAttachRelaySenderBundle({
      hasX3DH: Boolean(encrypted.x3dhData),
      fingerprint,
      last,
      now: now(),
    })) {
      return {}
    }
    return { senderBundle: compact, persistFingerprint: fingerprint }
  }

  private async rememberRelaySenderBundleAttachment(fingerprint: string): Promise<void> {
    try {
      await localChatStorage.storeRelaySenderBundleAttachState(
        this.localIdentity.id,
        this.remoteIdentity.id,
        { fingerprint, attachedAt: now() },
      )
    } catch {
      // Next send reattaches if persist failed.
    }
  }

  constructor(
    client: QuantumChat,
    conversation: Conversation,
    sessionId: string,
    localIdentity: ChatIdentityWithKeys,
    privateBundle: PrivateKeyBundle,
    remoteIdentity: ChatIdentity
  ) {
    this.client = client
    this.conversation = conversation
    this.sessionId = sessionId
    this.localIdentity = localIdentity
    this.privateBundle = privateBundle
    this.remoteIdentity = remoteIdentity

    this.client.on('message:received', (event) => {
      const data = event.data as MessageReceivedEvent['data']
      if (data.message.conversationId === this.conversation.id) {
        this.messageCallbacks.forEach(cb => cb(data.message))
      }
    })
  }

  getId(): string {
    return this.conversation.id
  }

  getRemoteIdentity(): ChatIdentity {
    return this.remoteIdentity
  }

  async getSessionFingerprint(): Promise<string | null> {
    const session = await getActiveSessionByRemoteIdentity(this.remoteIdentity.id)
    return session?.baseKeyFingerprint ?? null
  }

  async getSessionKey(): Promise<Uint8Array | null> {
    const session = await getActiveSessionByRemoteIdentity(this.remoteIdentity.id)
    
    if (!session || !session.state || !session.state.rootKey) {
      try {
        const result = await establishSessionAsInitiator(
          this.localIdentity,
          this.privateBundle,
          this.remoteIdentity.id,
          { trackedIdentity: this.client.getTrackedIdentity(this.remoteIdentity.id) || undefined }
        )
        if (result.session && result.session.state && result.session.state.rootKey) {
          const { deriveKey, stringToBytes } = await import('../crypto/utils')
          const info = stringToBytes('QuantumChat_MediaKey_v1')
          const salt = stringToBytes(this.conversation.id)
          return deriveKey(result.session.state.rootKey, salt, info, 32)
        }
      } catch (error) {
        console.error('Failed to establish session for media key:', error)
        return null
      }
      return null
    }
    
    const { deriveKey, stringToBytes } = await import('../crypto/utils')
    const info = stringToBytes('QuantumChat_MediaKey_v1')
    const salt = stringToBytes(this.conversation.id)
    return deriveKey(session.state.rootKey, salt, info, 32)
  }

  async sendMessage(
    content: string,
    options?: OutboundMessageOptions,
  ): Promise<{ decrypted: DecryptedMessage; encrypted: EncryptedMessage }> {
    const prepared = await this.prepareAndPersistMessage(content, options)
    return {
      decrypted: prepared.decrypted,
      encrypted: prepared.encrypted,
    }
  }

  private async prepareAndPersistMessage(
    content: string,
    options?: OutboundMessageOptions,
    transform?: PreparedMessageTransform,
  ): Promise<PreparedOutboundMessage> {
    return enqueueConversationSend(
      this.conversation.id,
      async () => {
        try {
          const prepared = await this.prepareMessageNow(content, options)
          const persistable = transform ? await transform(prepared) : prepared
          await this.persistPreparedMessage(persistable)
          return persistable
        } catch (error) {
          this.nextOutgoingSequenceNumber = undefined
          throw error
        }
      },
    )
  }

  private async nextSequenceNumber(): Promise<number> {
    if (this.nextOutgoingSequenceNumber === undefined) {
      const currentConversation = await localChatStorage.getConversation(this.conversation.id)
      this.nextOutgoingSequenceNumber = currentConversation?.outgoingSequenceNumber ?? 0
    }
    const sequenceNumber = this.nextOutgoingSequenceNumber
    this.nextOutgoingSequenceNumber += 1
    return sequenceNumber
  }

  private async prepareMessageNow(
    content: string,
    options?: OutboundMessageOptions,
  ): Promise<PreparedOutboundMessage> {
    let session = await getActiveSessionByRemoteIdentity(this.remoteIdentity.id)
    
    if (!session) {
      const result = await establishSessionAsInitiator(
        this.localIdentity,
        this.privateBundle,
        this.remoteIdentity.id,
        { trackedIdentity: this.client.getTrackedIdentity(this.remoteIdentity.id) || undefined }
      )
      session = result.session
      this.sessionId = session.id
      
      this.client.emit('session:established', {
        session,
        isInitiator: true,
        fingerprint: session.baseKeyFingerprint
      })
    } else if (sessionNeedsReestablishment(session)) {
      const result = await establishSessionAsInitiator(
        this.localIdentity,
        this.privateBundle,
        this.remoteIdentity.id,
        { trackedIdentity: this.client.getTrackedIdentity(this.remoteIdentity.id) || undefined }
      )
      session = result.session
      const previousSessionId = this.sessionId
      this.sessionId = session.id
      
      this.client.emit('session:switched', {
        previousSessionId,
        newSessionId: session.id,
        reason: 'too_many_unanswered'
      })
    }

    const sequenceNumber = await this.nextSequenceNumber()

    const encrypted = await prepareSessionMessage(
      session,
      content,
      this.localIdentity.dilithiumPrivateKey,
      sequenceNumber,
      this.lastMessageHash
    )

    const timestamp = now()
    const messageId = encrypted.metadata.messageId

    const messageHash = createMessageHash(
      this.localIdentity.id,
      this.remoteIdentity.id,
      session.id,
      sequenceNumber,
      timestamp,
      encrypted.ciphertext
    )
    this.lastMessageHash = messageHash

    const messageKind = isViewOnceRelayMessage(options?.messageKind, content) ? 'view_once' : options?.messageKind
    const oneTime = messageKind === 'view_once' ? createStoredLockedViewOnce() : undefined
    const persistedContent = messageKind === 'view_once' ? '' : content

    const decrypted: DecryptedMessage = {
      id: messageId,
      conversationId: this.conversation.id,
      senderId: this.localIdentity.id,
      content: persistedContent,
      timestamp,
      signatureVerified: true,
      sequenceNumber,
      status: 'sent',
      messageKind,
      oneTime,
      localOrderTimestamp: options?.localOrderTimestamp,
      disappearing: options?.disappearing,
    }

    const message: Message = {
      id: messageId,
      conversationId: this.conversation.id,
      senderId: this.localIdentity.id,
      senderIdentityId: this.localIdentity.id,
      recipientIdentityId: this.remoteIdentity.id,
      encryptedData: encrypted,
      content: messageKind === 'view_once' ? undefined : content,
      messageKind,
      oneTime,
      localOrderTimestamp: options?.localOrderTimestamp,
      disappearing: options?.disappearing,
      status: 'sent',
      createdAt: timestamp,
      messageHash
    }

    const conversationUpdate: Partial<Conversation> = {
      outgoingSequenceNumber: sequenceNumber + 1,
    }
    if (messageKind !== 'hidden_control') {
      conversationUpdate.hasVisibleActivity = true
      conversationUpdate.lastMessage = {
        content: messageKind === 'view_once' ? VIEW_ONCE_PREVIEW_TEXT : content.substring(0, 100),
        timestamp,
        senderId: this.localIdentity.id,
      }
    }

    return {
      session,
      decrypted,
      encrypted,
      message,
      conversationUpdate,
    }
  }

  private async persistPreparedMessage(prepared: PreparedOutboundMessage): Promise<void> {
    await localChatStorage.commitOutboundMessage({
      session: prepared.session,
      message: prepared.message,
      conversationUpdate: prepared.conversationUpdate,
    })
    void localChatStorage.storeDecryptedMessage(prepared.decrypted).catch(() => undefined)

    this.client.emit('message:sent', {
      message: prepared.decrypted,
      encrypted: prepared.encrypted,
    })
  }

  async sendMessageViaRelay(
    content: string,
    options?: {
      messageKind?: 'text' | 'view_once' | 'call_invitation' | 'hidden_control'
      localOrderTimestamp?: number
      disappearing?: StoredDisappearingMessageState
      attachmentTrace?: AttachmentPipelineTraceContext
      onRelayNetworkStart?: (message: DecryptedMessage) => void
    },
  ): Promise<{ 
    decrypted: DecryptedMessage; 
    encrypted: EncryptedMessage;
    relayAccepted: boolean;
    relayed?: RelayedMessage | SealedRelayedMessage;
    relayError?: string;
    relayFailureReason?: string;
    relayStatusCode?: number;
    relayTransient?: boolean;
  }> {
    const attachmentTrace = options?.attachmentTrace?.attachmentSendId
      ? {
          ...options.attachmentTrace,
          conversationId: options.attachmentTrace.conversationId ?? this.conversation.id,
        }
      : null
    if (attachmentTrace) {
      this.client.recordDiagnostic(
        'send',
        ATTACHMENT_PIPELINE_EVENT_NAME,
        buildAttachmentPipelineFields('relay_encrypt_started', attachmentTrace, {
          messageKind: options?.messageKind ?? 'text',
        }),
      )
    }

    const bundleServer = this.client.getBundleServer()
    const sealedSend = (bundleServer as {
      sendSealedMessage?: BundleServerLikeSendSealedMessage
    } | null | undefined)?.sendSealedMessage
    let stagedRecord: OutboundSealedRelayRecord | undefined
    let recipientMailboxToken: string | undefined
    let relayPreparationError: unknown
    let decrypted: DecryptedMessage
    let encrypted: EncryptedMessage
    try {
      const sendResult = await this.prepareAndPersistMessage(
        content,
        { messageKind: options?.messageKind },
        async (prepared) => {
          if (!bundleServer?.isAvailable() || !sealedSend) {
            return prepared
          }
          try {
            const [ourBundle, remoteBundle] = await Promise.all([
              this.client.getPublicKeyBundle(),
              localChatStorage.getPublicKeyBundle(this.remoteIdentity.id),
            ])
            const senderBundleDecision = ourBundle
              ? await this.decideRelaySenderBundle(prepared.encrypted, ourBundle)
              : {}
            recipientMailboxToken = remoteBundle
              ? await this.client.getScopedMailboxTokenForRecipient(remoteBundle)
              : undefined
            const sealedRecord = await sealRelayEnvelope({
              sender: this.localIdentity,
              recipient: this.remoteIdentity,
              encryptedMessage: prepared.encrypted,
              conversationId: this.conversation.id,
              messageKind: prepared.message.messageKind ?? 'text',
              senderBundle: senderBundleDecision.senderBundle,
              recipientMailboxToken,
            })
            if (senderBundleDecision.persistFingerprint) {
              await this.rememberRelaySenderBundleAttachment(senderBundleDecision.persistFingerprint)
            }
            const staged = stageRelayDeliveryOutbox(prepared.message, sealedRecord)
            stagedRecord = staged.record
            return {
              ...prepared,
              message: staged.message,
            }
          } catch (error) {
            relayPreparationError = error
            return prepared
          }
        },
      )
      decrypted = sendResult.decrypted
      encrypted = sendResult.encrypted
    } catch (error) {
      throw attachmentTrace
        ? tagAttachmentPipelineError(error, {
            failureStage: 'relay_encrypt_started',
            lastSuccessfulStage: 'chat_media_insert_succeeded',
          })
        : error
    }

    if (attachmentTrace) {
      this.client.recordDiagnostic(
        'send',
        ATTACHMENT_PIPELINE_EVENT_NAME,
        buildAttachmentPipelineFields(
          'relay_encrypt_succeeded',
          {
            ...attachmentTrace,
            messageId: decrypted.id,
          },
          {
            messageKind: options?.messageKind ?? 'text',
          },
        ),
      )
    }
    this.client.recordDiagnostic('send', 'relay_send_attempt', {
      messageId: decrypted.id,
      conversationId: this.conversation.id,
      recipientIdentityId: this.remoteIdentity.id,
      messageKind: options?.messageKind ?? 'text',
      torEnabled: this.client.isTorEnabled(),
    })
    const relayAcceptSpan = this.client.startSpan('send', 'relay_accept', {
      conversationId: this.conversation.id,
      recipientIdentityId: this.remoteIdentity.id,
      torEnabled: this.client.isTorEnabled(),
      messageKind: options?.messageKind ?? 'text',
    })
    if (attachmentTrace) {
      this.client.recordDiagnostic(
        'send',
        ATTACHMENT_PIPELINE_EVENT_NAME,
        buildAttachmentPipelineFields(
          'relay_accept_started',
          {
            ...attachmentTrace,
            messageId: decrypted.id,
          },
          {
            messageKind: options?.messageKind ?? 'text',
          },
        ),
      )
    }

    if (bundleServer?.isAvailable()) {
      try {
        if (!sealedSend) {
          throw new Error('Sealed relay is required for direct messages')
        }
        if (relayPreparationError) {
          throw relayPreparationError
        }
        if (!stagedRecord) {
          throw new Error('Sealed relay delivery capability is missing')
        }
        options?.onRelayNetworkStart?.(decrypted)
        const relayResponse = await sealedSend.call(bundleServer, stagedRecord)
        const relayed = {
          ...relayResponse,
          deliveryToken: stagedRecord.deliveryToken,
        }
        relayAcceptSpan.end({
          messageId: decrypted.id,
          relayed: true,
          serverSequence: relayed.serverSequence,
        })
        this.client.recordDiagnostic('send', 'relay_send_success', {
          messageId: decrypted.id,
          relayId: relayed.id,
          conversationId: this.conversation.id,
          recipientIdentityId: this.remoteIdentity.id,
          messageKind: options?.messageKind ?? 'text',
          serverSequence: relayed.serverSequence,
          scopedMailbox: Boolean(recipientMailboxToken),
        })
        await this.client.linkLocalMessageToRelay(decrypted.id, relayed.id, relayed.deliveryToken)

        return {
          decrypted,
          encrypted,
          relayAccepted: true,
          relayed,
        }
      } catch (error) {
        relayAcceptSpan.end({
          messageId: decrypted.id,
          relayed: false,
          error: true,
        })
        this.client.recordDiagnostic('send', 'relay_send_failed', {
          messageId: decrypted.id,
          conversationId: this.conversation.id,
          recipientIdentityId: this.remoteIdentity.id,
          messageKind: options?.messageKind ?? 'text',
          error: error instanceof Error ? error.message : String(error),
          failureReason: error instanceof BundleServerRequestError ? error.reason : undefined,
          statusCode: error instanceof BundleServerRequestError ? error.statusCode : undefined,
          transient: error instanceof BundleServerRequestError ? error.transient : undefined,
        })
        if (attachmentTrace) {
          this.client.recordDiagnostic(
            'send',
            ATTACHMENT_PIPELINE_EVENT_NAME,
            buildAttachmentPipelineFields(
              'relay_accept_failed',
              {
                ...attachmentTrace,
                messageId: decrypted.id,
              },
              {
                messageKind: options?.messageKind ?? 'text',
                failureReason: error instanceof BundleServerRequestError
                  ? error.reason
                  : error instanceof Error
                    ? error.message
                    : String(error),
                statusCode: error instanceof BundleServerRequestError ? error.statusCode : undefined,
                transient: error instanceof BundleServerRequestError ? error.transient : undefined,
              },
            ),
          )
        }
        return {
          decrypted,
          encrypted,
          relayAccepted: false,
          relayError: error instanceof Error ? error.message : String(error),
          relayFailureReason: error instanceof BundleServerRequestError ? error.reason : undefined,
          relayStatusCode: error instanceof BundleServerRequestError ? error.statusCode : undefined,
          relayTransient: error instanceof BundleServerRequestError ? error.transient : undefined,
        }
      }
    } else {
      relayAcceptSpan.end({
        messageId: decrypted.id,
        relayed: false,
        unavailable: true,
      })
      this.client.recordDiagnostic('send', 'relay_send_unavailable', {
        messageId: decrypted.id,
        conversationId: this.conversation.id,
        recipientIdentityId: this.remoteIdentity.id,
        messageKind: options?.messageKind ?? 'text',
      })
      if (attachmentTrace) {
        this.client.recordDiagnostic(
          'send',
          ATTACHMENT_PIPELINE_EVENT_NAME,
          buildAttachmentPipelineFields(
            'relay_accept_failed',
            {
              ...attachmentTrace,
              messageId: decrypted.id,
            },
            {
              messageKind: options?.messageKind ?? 'text',
              failureReason: 'bundle_server_unavailable',
            },
          ),
        )
      }
      return {
        decrypted,
        encrypted,
        relayAccepted: false,
        relayError: 'Bundle server not available',
        relayFailureReason: 'bundle_server_unavailable',
      }
    }
  }

  async resendMessageViaRelay(
    messageId: string,
  ): Promise<{
    decrypted: DecryptedMessage
    encrypted: EncryptedMessage
    relayAccepted: boolean
    relayed?: SealedRelayedMessage
    relayError?: string
    relayFailureReason?: string
    relayStatusCode?: number
    relayTransient?: boolean
  }> {
    return enqueueConversationSend(this.conversation.id, async () => {
      const storedMessage = await localChatStorage.getMessage(messageId)
      if (!storedMessage) {
        throw new Error('Message is not available for retry')
      }
      if (
        storedMessage.conversationId !== this.conversation.id
        || storedMessage.senderIdentityId !== this.localIdentity.id
        || storedMessage.recipientIdentityId !== this.remoteIdentity.id
      ) {
        throw new Error('Message does not belong to this conversation')
      }

      const encrypted = storedMessage.encryptedData
      const decrypted = await localChatStorage.getDecryptedMessage(messageId) ?? {
        id: storedMessage.id,
        conversationId: storedMessage.conversationId,
        senderId: storedMessage.senderId,
        content: storedMessage.content ?? '',
        timestamp: storedMessage.createdAt,
        signatureVerified: true,
        status: storedMessage.status,
        messageKind: storedMessage.messageKind,
        oneTime: storedMessage.oneTime,
        disappearing: storedMessage.disappearing,
      }

      await localChatStorage.updateMessageStatus(messageId, 'sending')

      const bundleServer = this.client.getBundleServer()
      if (!bundleServer?.isAvailable()) {
        await localChatStorage.updateMessageStatus(messageId, 'failed')
        return {
          decrypted,
          encrypted,
          relayAccepted: false,
          relayError: 'Bundle server not available',
          relayFailureReason: 'bundle_server_unavailable',
        }
      }

      try {
        const sealedSend = (bundleServer as {
          sendSealedMessage?: BundleServerLikeSendSealedMessage
        }).sendSealedMessage
        if (!sealedSend) {
          throw new Error('Sealed relay is required for direct messages')
        }
        let sealedRecord = storedMessage.relayDeliveryOutbox?.record
        if (!sealedRecord) {
          const [ourBundle, remoteBundle] = await Promise.all([
            this.client.getPublicKeyBundle(),
            localChatStorage.getPublicKeyBundle(this.remoteIdentity.id),
          ])
          const senderBundleDecision = ourBundle
            ? await this.decideRelaySenderBundle(encrypted, ourBundle)
            : {}
          const recipientMailboxToken = remoteBundle
            ? await this.client.getScopedMailboxTokenForRecipient(remoteBundle)
            : undefined
          sealedRecord = await sealRelayEnvelope({
            sender: this.localIdentity,
            recipient: this.remoteIdentity,
            encryptedMessage: encrypted,
            conversationId: this.conversation.id,
            messageKind: storedMessage.messageKind ?? 'text',
            senderBundle: senderBundleDecision.senderBundle,
            recipientMailboxToken,
            deliveryToken: storedMessage.relayDeliveryToken,
          })
          if (senderBundleDecision.persistFingerprint) {
            await this.rememberRelaySenderBundleAttachment(senderBundleDecision.persistFingerprint)
          }
        }
        if (!sealedRecord.deliveryToken) {
          throw new Error('Sealed relay delivery capability is missing')
        }
        sealedRecord = await this.client.stageLocalMessageRelayDelivery(
          decrypted.id,
          sealedRecord,
        )
        const relayResponse = await sealedSend.call(bundleServer, sealedRecord)
        const relayed = {
          ...relayResponse,
          deliveryToken: sealedRecord.deliveryToken,
        }
        await this.client.linkLocalMessageToRelay(decrypted.id, relayed.id, relayed.deliveryToken)
        await localChatStorage.updateMessageStatus(messageId, 'sent')

        return {
          decrypted: { ...decrypted, status: 'sent', serverSequence: relayed.serverSequence },
          encrypted,
          relayAccepted: true,
          relayed,
        }
      } catch (error) {
        const relayTransient = error instanceof BundleServerRequestError
          ? error.transient
          : undefined
        await localChatStorage.updateMessageStatus(
          messageId,
          relayTransient ? 'sending' : 'failed',
        )
        return {
          decrypted,
          encrypted,
          relayAccepted: false,
          relayError: error instanceof Error ? error.message : String(error),
          relayFailureReason: error instanceof BundleServerRequestError ? error.reason : undefined,
          relayStatusCode: error instanceof BundleServerRequestError ? error.statusCode : undefined,
          relayTransient,
        }
      }
    })
  }

  async getMessages(options?: { limit?: number; before?: number }): Promise<DecryptedMessage[]> {
    return localChatStorage.getDecryptedMessages(this.conversation.id, options)
  }

  async getEncryptedMessages(options?: { limit?: number; before?: number }): Promise<Message[]> {
    return localChatStorage.getMessages(this.conversation.id, options)
  }

  onMessage(callback: (message: DecryptedMessage) => void): () => void {
    this.messageCallbacks.add(callback)
    return () => {
      this.messageCallbacks.delete(callback)
    }
  }

  async markAsRead(messageId: string, syncRelayReadState: boolean = true): Promise<void> {
    const message = await localChatStorage.getMessage(messageId)
    const relayReadReceiptEligible = message?.status === 'read'
      ? message.relayReadReceiptEligible === true
      : Boolean(
          message
          && message.senderIdentityId === this.remoteIdentity.id
          && syncRelayReadState
          && this.client.areReadReceiptsEnabled()
          && shouldSyncRelayReadForMessage(message)
        )
    await localChatStorage.updateConversation(this.conversation.id, {
      unreadProjectionDirty: true,
    })
    await localChatStorage.updateMessageStatus(messageId, 'read', {
      relayReadReceiptEligible,
    })

    if (syncRelayReadState && relayReadReceiptEligible && message?.relayMessageId) {
      await this.client.markRelayMessageRead(message.relayMessageId)
    }
  }

  async markAllAsRead(syncRelayReadState: boolean = true): Promise<void> {
    await markConversationReadState(
      this.client,
      this.conversation.id,
      this.remoteIdentity.id,
      syncRelayReadState,
    )
  }

  async getSafetyNumber(): Promise<SafetyNumber | null> {
    const localBundle = await this.client.getPublicKeyBundle()
    const remoteBundle = await this.client.getContactBundle(this.remoteIdentity.id)
    
    if (!localBundle || !remoteBundle) {
      return null
    }

    const { generateSafetyNumberFromBundlesAsync } = await import('../crypto/safetyNumber')
    return generateSafetyNumberFromBundlesAsync(localBundle, remoteBundle)
  }

  async getStats(): Promise<{
    messageCount: number
    unreadCount: number
    lastMessageAt: number | null
    sessionFingerprint: string | null
  }> {
    const messages = await this.getMessages()
    const conversation = await localChatStorage.getConversation(this.conversation.id)
    const session = await getActiveSessionByRemoteIdentity(this.remoteIdentity.id)
    
    return {
      messageCount: messages.length,
      unreadCount: conversation?.unreadCount ?? 0,
      lastMessageAt: conversation?.lastMessage?.timestamp ?? null,
      sessionFingerprint: session?.baseKeyFingerprint ?? null
    }
  }
}
