/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { expect } from 'vitest'
import type {
  ChatIdentityWithKeys,
  Conversation,
  DecryptedMessage,
  InboundMessageCommit,
  Message,
  OutboundMessageCommit,
  PrivateKeyBundle,
  ProcessedMessageRecord,
  PublicKeyBundle,
  RelayReceiptJob,
  RetryRequestRecord,
  Session,
  SessionRecord,
  TrackedIdentity,
  MailboxScopeState,
  RelaySenderBundleAttachState,
} from '../../types'
import type { LocalStorage } from '../../storage/local'
import { generateDilithiumKeyPair } from '../../crypto/dilithium'
import { generateMLKEMKeyPair } from '../../crypto/mlkem'
import { generateX25519KeyPair } from '../../crypto/x25519'
import { createPublicKeyBundle } from '../../crypto/x3dh'
import { bytesToBase64, generateUUID } from '../../crypto/utils'
import { completeRelayDeliveryOutbox, hasPendingRelayDelivery } from '../../messageLifecycle'

export interface TestIdentityMaterial {
  identity: ChatIdentityWithKeys
  bundle: PublicKeyBundle
  privateBundle: PrivateKeyBundle
}

export function makeIdentityMaterial(label: string, preKeyCount = 6): TestIdentityMaterial {
  const x25519 = generateX25519KeyPair()
  const mlkem = generateMLKEMKeyPair()
  const dilithium = generateDilithiumKeyPair()
  const id = `${label}-${generateUUID()}`

  const identity: ChatIdentityWithKeys = {
    id,
    displayName: label,
    identityPublicKey: x25519.publicKey,
    identityPrivateKey: x25519.privateKey,
    mlkemPublicKey: mlkem.publicKey,
    mlkemPrivateKey: mlkem.privateKey,
    dilithiumPublicKey: dilithium.publicKey,
    dilithiumPrivateKey: dilithium.privateKey,
    createdAt: Date.now(),
    isAnonymous: true,
  }

  const { bundle, privateBundle } = createPublicKeyBundle(
    id,
    x25519.publicKey,
    dilithium.publicKey,
    dilithium.privateKey,
    x25519.privateKey,
    mlkem,
    preKeyCount,
  )

  return { identity, bundle, privateBundle }
}

export function makeIdentityPair(preKeyCount = 6): {
  alice: TestIdentityMaterial
  bob: TestIdentityMaterial
} {
  return {
    alice: makeIdentityMaterial('alice', preKeyCount),
    bob: makeIdentityMaterial('bob', preKeyCount),
  }
}

export function tamperBase64(value: string): string {
  const bytes = Buffer.from(value, 'base64')
  if (bytes.length === 0) {
    return bytesToBase64(new Uint8Array([1]))
  }
  bytes[0] ^= 0x01
  return bytes.toString('base64')
}

export function tamperHex(value: string): string {
  const prefixed = value.startsWith('0x')
  const clean = prefixed ? value.slice(2) : value
  if (clean.length === 0) return prefixed ? '0x01' : '01'
  const first = clean[0] === '0' ? '1' : '0'
  return `${prefixed ? '0x' : ''}${first}${clean.slice(1)}`
}

export async function expectCryptoRejects(action: () => unknown | Promise<unknown>): Promise<void> {
  let rejected = false
  try {
    await action()
  } catch {
    rejected = true
  }
  expect(rejected).toBe(true)
}

export function int32LE(value: number): Uint8Array {
  const bytes = new Uint8Array(4)
  new DataView(bytes.buffer).setInt32(0, value, true)
  return bytes
}

export function int64LE(value: bigint): Uint8Array {
  const bytes = new Uint8Array(8)
  new DataView(bytes.buffer).setBigInt64(0, value, true)
  return bytes
}

export class InMemoryChatStorage implements LocalStorage {
  identities = new Map<string, ChatIdentityWithKeys>()
  sessions = new Map<string, Session>()
  sessionRecords = new Map<string, SessionRecord>()
  privateBundles = new Map<string, PrivateKeyBundle>()
  publicBundles = new Map<string, PublicKeyBundle>()
  conversations = new Map<string, Conversation>()
  messages = new Map<string, Message>()
  decryptedMessages = new Map<string, DecryptedMessage>()
  processedMessages = new Map<string, ProcessedMessageRecord>()
  relayReceiptJobs = new Map<string, RelayReceiptJob>()
  retryRequests = new Map<string, RetryRequestRecord>()
  retryRequestsByRelay = new Map<string, string>()
  trackedIdentities = new Map<string, TrackedIdentity>()
  mailboxScopes = new Map<string, MailboxScopeState>()
  relayMailboxCursors = new Map<string, number>()
  relaySenderBundleAttach = new Map<string, RelaySenderBundleAttachState>()

  async storeIdentity(identity: ChatIdentityWithKeys): Promise<void> {
    this.identities.set(identity.id, identity)
  }

  async getIdentity(id: string): Promise<ChatIdentityWithKeys | null> {
    return this.identities.get(id) ?? null
  }

  async getIdentityByAddress(address: string): Promise<ChatIdentityWithKeys | null> {
    return Array.from(this.identities.values()).find(i => i.blockchainAddress === address) ?? null
  }

  async getAllIdentities(): Promise<ChatIdentityWithKeys[]> {
    return Array.from(this.identities.values())
  }

  async storeSession(session: Session): Promise<void> {
    this.sessions.set(session.id, session)
  }

  async getSession(id: string): Promise<Session | null> {
    return this.sessions.get(id) ?? null
  }

  async deleteSession(id: string): Promise<void> {
    this.sessions.delete(id)
  }

  async storeSessionRecord(record: SessionRecord): Promise<void> {
    this.sessionRecords.set(record.remoteIdentityId, record)
  }

  async getSessionRecord(remoteIdentityId: string): Promise<SessionRecord | null> {
    return this.sessionRecords.get(remoteIdentityId) ?? null
  }

  async getActiveSession(remoteIdentityId: string): Promise<Session | null> {
    const record = this.sessionRecords.get(remoteIdentityId)
    return record?.activeSessionId ? this.getSession(record.activeSessionId) : null
  }

  async getAllSessions(remoteIdentityId: string): Promise<Session[]> {
    return Array.from(this.sessions.values()).filter(s => s.remoteIdentityId === remoteIdentityId)
  }

  async setActiveSession(remoteIdentityId: string, sessionId: string): Promise<void> {
    const record = this.sessionRecords.get(remoteIdentityId)
    if (record) {
      record.activeSessionId = sessionId
      this.sessionRecords.set(remoteIdentityId, record)
    }
  }

  async storePrivateKeyBundle(identityId: string, bundle: PrivateKeyBundle): Promise<void> {
    this.privateBundles.set(identityId, bundle)
  }

  async getPrivateKeyBundle(identityId: string): Promise<PrivateKeyBundle | null> {
    return this.privateBundles.get(identityId) ?? null
  }

  async storePublicKeyBundle(identityId: string, bundle: PublicKeyBundle): Promise<void> {
    this.publicBundles.set(identityId, bundle)
  }

  async getPublicKeyBundle(identityId: string): Promise<PublicKeyBundle | null> {
    return this.publicBundles.get(identityId) ?? null
  }

  async storeConversation(conversation: Conversation): Promise<void> {
    this.conversations.set(conversation.id, conversation)
  }

  async getConversation(id: string): Promise<Conversation | null> {
    return this.conversations.get(id) ?? null
  }

  async getConversationByParticipants(localId: string, remoteId: string): Promise<Conversation | null> {
    return Array.from(this.conversations.values()).find(
      c => c.localIdentityId === localId && c.remoteIdentityId === remoteId,
    ) ?? null
  }

  async getConversations(identityId: string): Promise<Conversation[]> {
    return Array.from(this.conversations.values()).filter(c => c.localIdentityId === identityId)
  }

  async updateConversation(id: string, updates: Partial<Conversation>): Promise<void> {
    const existing = this.conversations.get(id)
    if (existing) this.conversations.set(id, { ...existing, ...updates })
  }

  async rekeyConversation(sourceConversationId: string, targetConversationId: string): Promise<void> {
    const conversation = this.conversations.get(sourceConversationId)
    if (conversation) {
      this.conversations.set(targetConversationId, { ...conversation, id: targetConversationId })
      this.conversations.delete(sourceConversationId)
    }
  }

  async storeMessage(message: Message): Promise<void> {
    this.messages.set(message.id, message)
  }

  async commitOutboundMessage(commit: OutboundMessageCommit): Promise<void> {
    const conversation = this.conversations.get(commit.message.conversationId)
    if (!conversation) {
      throw new Error('Conversation is not available for outbound commit')
    }
    this.sessions.set(commit.session.id, commit.session)
    this.messages.set(commit.message.id, commit.message)
    this.conversations.set(conversation.id, {
      ...conversation,
      ...commit.conversationUpdate,
    })
  }

  async commitInboundMessage(commit: InboundMessageCommit): Promise<void> {
    const conversation = this.conversations.get(commit.message.conversationId)
    if (!conversation) {
      throw new Error('Conversation is not available for inbound commit')
    }
    this.sessions.set(commit.session.id, commit.session)
    if (commit.sessionRecord) {
      this.sessionRecords.set(commit.sessionRecord.remoteIdentityId, commit.sessionRecord)
    }
    if (commit.privateKeyBundle) {
      this.privateBundles.set(
        commit.privateKeyBundle.identityId,
        commit.privateKeyBundle.bundle,
      )
    }
    if (commit.publicKeyBundle) {
      this.publicBundles.set(
        commit.publicKeyBundle.identityId,
        commit.publicKeyBundle.bundle,
      )
    }
    this.processedMessages.set(commit.processedMessage.messageId, commit.processedMessage)
    this.messages.set(commit.message.id, commit.message)
    this.decryptedMessages.set(commit.decryptedMessage.id, commit.decryptedMessage)
    this.conversations.set(conversation.id, {
      ...conversation,
      ...commit.conversationUpdate,
    })
  }

  async getMessage(id: string): Promise<Message | null> {
    return this.messages.get(id) ?? null
  }

  async getMessageByRelayId(relayMessageId: string): Promise<Message | null> {
    return Array.from(this.messages.values()).find(m => m.relayMessageId === relayMessageId) ?? null
  }

  async getMessages(conversationId: string): Promise<Message[]> {
    return Array.from(this.messages.values()).filter(m => m.conversationId === conversationId)
  }

  async getMessagesNeedingStatusSync(senderIdentityId: string): Promise<Message[]> {
    return Array.from(this.messages.values()).filter((message) => (
      message.senderIdentityId === senderIdentityId
      && !!message.relayMessageId
      && (
        message.status === 'sending'
        || message.status === 'sent'
        || (message.status === 'delivered' && typeof message.deliveredAt === 'number')
      )
    ))
  }

  async getPendingRelayDeliveries(senderIdentityId: string): Promise<Message[]> {
    return Array.from(this.messages.values())
      .filter((message) => hasPendingRelayDelivery(message, senderIdentityId))
  }

  async linkRelayMessage(
    messageId: string,
    relayMessageId: string,
    relayDeliveryToken?: string,
  ): Promise<Message | null> {
    const message = this.messages.get(messageId)
    if (!message) return null
    const completed = completeRelayDeliveryOutbox(message, relayMessageId, relayDeliveryToken)
    this.messages.set(messageId, completed)
    return completed
  }

  async updateMessageStatus(id: string, status: Message['status']): Promise<void> {
    const message = this.messages.get(id)
    if (!message) return
    this.messages.set(id, {
      ...message,
      status,
      ...(status === 'delivered' ? { deliveredAt: Date.now() } : {}),
      ...(status === 'read' ? { readAt: Date.now() } : {}),
    })
  }

  async deleteMessage(id: string): Promise<void> {
    this.messages.delete(id)
  }

  async storeDecryptedMessage(message: DecryptedMessage): Promise<void> {
    this.decryptedMessages.set(message.id, message)
  }

  async getDecryptedMessage(id: string): Promise<DecryptedMessage | null> {
    return this.decryptedMessages.get(id) ?? null
  }

  async getDecryptedMessages(conversationId: string): Promise<DecryptedMessage[]> {
    return Array.from(this.decryptedMessages.values()).filter(m => m.conversationId === conversationId)
  }

  async updateDecryptedMessage(id: string, updates: Partial<DecryptedMessage>): Promise<void> {
    const message = this.decryptedMessages.get(id)
    if (message) this.decryptedMessages.set(id, { ...message, ...updates })
  }

  async deleteDecryptedMessage(id: string): Promise<void> {
    this.decryptedMessages.delete(id)
  }

  async storeProcessedMessage(record: ProcessedMessageRecord): Promise<void> {
    this.processedMessages.set(record.messageId, record)
  }

  async getProcessedMessage(messageId: string): Promise<ProcessedMessageRecord | null> {
    return this.processedMessages.get(messageId) ?? null
  }

  async isMessageProcessed(messageId: string): Promise<boolean> {
    return this.processedMessages.has(messageId)
  }

  async cleanupProcessedMessages(maxAgeMs: number): Promise<number> {
    const cutoff = Date.now() - maxAgeMs
    let count = 0
    for (const [id, record] of this.processedMessages.entries()) {
      if (record.processedAt < cutoff) {
        this.processedMessages.delete(id)
        count++
      }
    }
    return count
  }

  async storeRetryRequestRecord(record: RetryRequestRecord): Promise<void> {
    this.retryRequests.set(record.key, record)
    if (record.relayMessageId) this.retryRequestsByRelay.set(record.relayMessageId, record.key)
  }

  async getRetryRequestRecord(key: string): Promise<RetryRequestRecord | null> {
    return this.retryRequests.get(key) ?? null
  }

  async getRetryRequestRecordByRelayId(relayMessageId: string): Promise<RetryRequestRecord | null> {
    const key = this.retryRequestsByRelay.get(relayMessageId)
    return key ? this.getRetryRequestRecord(key) : null
  }

  async cleanupRetryRequestRecords(maxAgeMs: number): Promise<number> {
    const cutoff = Date.now() - maxAgeMs
    let count = 0
    for (const [key, record] of this.retryRequests.entries()) {
      if (record.lastSeenAt < cutoff) {
        this.retryRequests.delete(key)
        if (record.relayMessageId) this.retryRequestsByRelay.delete(record.relayMessageId)
        count++
      }
    }
    return count
  }

  async storeRelayReceiptJob(job: RelayReceiptJob): Promise<void> {
    this.relayReceiptJobs.set(job.key, job)
  }

  async getRelayReceiptJob(key: string): Promise<RelayReceiptJob | null> {
    return this.relayReceiptJobs.get(key) ?? null
  }

  async getPendingRelayReceiptJobs(nowMs: number, limit = 50): Promise<RelayReceiptJob[]> {
    return Array.from(this.relayReceiptJobs.values())
      .filter((job) => job.nextAttemptAt <= nowMs)
      .sort((left, right) => left.nextAttemptAt - right.nextAttemptAt)
      .slice(0, limit)
  }

  async deleteRelayReceiptJob(key: string): Promise<void> {
    this.relayReceiptJobs.delete(key)
  }

  async cleanupRelayReceiptJobs(maxAgeMs: number): Promise<number> {
    const cutoff = Date.now() - maxAgeMs
    let count = 0
    for (const [key, job] of this.relayReceiptJobs.entries()) {
      if (job.updatedAt < cutoff) {
        this.relayReceiptJobs.delete(key)
        count++
      }
    }
    return count
  }

  async storeMailboxScope(scope: MailboxScopeState): Promise<void> {
    this.mailboxScopes.set(`${scope.localIdentityId}:${scope.remoteIdentityId}:${scope.scopeId}`, scope)
  }

  async getMailboxScope(localIdentityId: string, remoteIdentityId: string): Promise<MailboxScopeState | null> {
    const scopes = Array.from(this.mailboxScopes.values())
      .filter((scope) => scope.localIdentityId === localIdentityId && scope.remoteIdentityId === remoteIdentityId)
      .sort((a, b) => {
        const aReady = a.status === 'active' && a.registeredAt && a.acknowledgedAt ? 1 : 0
        const bReady = b.status === 'active' && b.registeredAt && b.acknowledgedAt ? 1 : 0
        if (aReady !== bReady) return bReady - aReady
        return (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt)
      })
    return scopes[0] ?? null
  }

  async getMailboxScopes(localIdentityId: string): Promise<MailboxScopeState[]> {
    return Array.from(this.mailboxScopes.values()).filter((scope) => scope.localIdentityId === localIdentityId)
  }

  async deleteMailboxScope(localIdentityId: string, remoteIdentityId: string): Promise<void> {
    for (const [key, scope] of this.mailboxScopes) {
      if (scope.localIdentityId === localIdentityId && scope.remoteIdentityId === remoteIdentityId) {
        this.mailboxScopes.delete(key)
      }
    }
  }

  async getRelayMailboxCursor(identityId: string): Promise<number> {
    return this.relayMailboxCursors.get(identityId) ?? 0
  }

  async storeRelayMailboxCursor(identityId: string, sequence: number): Promise<void> {
    if (!Number.isSafeInteger(sequence) || sequence <= 0) {
      this.relayMailboxCursors.delete(identityId)
      return
    }
    this.relayMailboxCursors.set(identityId, sequence)
  }

  async getRelaySenderBundleAttachState(
    localIdentityId: string,
    remoteIdentityId: string,
  ): Promise<RelaySenderBundleAttachState | null> {
    return this.relaySenderBundleAttach.get(`${localIdentityId}:${remoteIdentityId}`) ?? null
  }

  async storeRelaySenderBundleAttachState(
    localIdentityId: string,
    remoteIdentityId: string,
    state: RelaySenderBundleAttachState,
  ): Promise<void> {
    this.relaySenderBundleAttach.set(`${localIdentityId}:${remoteIdentityId}`, state)
  }

  async storeTrackedIdentity(tracked: TrackedIdentity): Promise<void> {
    this.trackedIdentities.set(tracked.identityId, tracked)
  }

  async getTrackedIdentity(identityId: string): Promise<TrackedIdentity | null> {
    return this.trackedIdentities.get(identityId) ?? null
  }

  async getAllTrackedIdentities(): Promise<TrackedIdentity[]> {
    return Array.from(this.trackedIdentities.values())
  }

  async deleteTrackedIdentity(identityId: string): Promise<void> {
    this.trackedIdentities.delete(identityId)
  }

  async deleteConversation(id: string): Promise<void> {
    this.conversations.delete(id)
    await this.deleteConversationMessages(id)
  }

  async deleteConversationMessages(conversationId: string): Promise<void> {
    for (const [id, message] of this.messages.entries()) {
      if (message.conversationId === conversationId) this.messages.delete(id)
    }
    for (const [id, message] of this.decryptedMessages.entries()) {
      if (message.conversationId === conversationId) this.decryptedMessages.delete(id)
    }
  }

  async deletePublicKeyBundle(identityId: string): Promise<void> {
    this.publicBundles.delete(identityId)
  }

  async deleteSessionRecord(remoteIdentityId: string): Promise<void> {
    this.sessionRecords.delete(remoteIdentityId)
  }

  async clear(): Promise<void> {
    this.identities.clear()
    this.sessions.clear()
    this.sessionRecords.clear()
    this.privateBundles.clear()
    this.publicBundles.clear()
    this.conversations.clear()
    this.messages.clear()
    this.decryptedMessages.clear()
    this.processedMessages.clear()
    this.relayReceiptJobs.clear()
    this.retryRequests.clear()
    this.retryRequestsByRelay.clear()
    this.trackedIdentities.clear()
    this.mailboxScopes.clear()
    this.relayMailboxCursors.clear()
    this.relaySenderBundleAttach.clear()
  }
}

export function makeInMemoryStorage(): InMemoryChatStorage {
  return new InMemoryChatStorage()
}
