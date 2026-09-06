/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

/**
 * Sealed relay/control envelopes for metadata-hardened server delivery.
 */

import type {
  ChatIdentity,
  ChatIdentityWithKeys,
  ControlMessage,
  EncryptedMessage,
  OutboundSealedControlRecord,
  OutboundSealedRelayRecord,
  PublicKeyBundle,
  RelayMessageKind,
  SealedControlEnvelope,
  SealedControlPayload,
  SealedEnvelopeSenderCredential,
  SealedRelayEnvelope,
  SealedRelayPayload,
} from '../types/index'
import { CryptoError, ReplayError } from '../types/index'
import { encryptAES, decryptAES } from './aes'
import { canonicalJsonStringify } from './canonicalJson'
import { verifyDilithiumSignatureAsync, signWithDilithiumAsync } from './dilithium'
import { encapsulateAsync as mlkemEncapsulateAsync, decapsulateAsync as mlkemDecapsulateAsync } from './mlkem'
import { PROTOCOL_VERSIONS, assertExactVersion } from './protocolVersion'
import {
  base64ToBytes,
  bytesToBase64,
  bytesToString,
  concatBytes,
  deriveKey,
  generateRandomBytes,
  hash,
  stringToBytes,
} from './utils'
import { generateX25519KeyPair, x25519DH } from './x25519'

type RecipientPublicMaterial = Pick<ChatIdentity, 'id' | 'identityPublicKey' | 'mlkemPublicKey' | 'dilithiumPublicKey'>
type RecipientPrivateMaterial = Pick<ChatIdentityWithKeys, 'identityPrivateKey' | 'mlkemPrivateKey'>
type SenderMaterial = Pick<ChatIdentityWithKeys, 'id' | 'identityPublicKey' | 'mlkemPublicKey' | 'dilithiumPublicKey' | 'dilithiumPrivateKey'>

type SealedEnvelopeType = SealedRelayEnvelope['type'] | SealedControlEnvelope['type']

const MAILBOX_TOKEN_INFO = 'Spectra_RelayMailboxToken_v1'
const SCOPED_MAILBOX_TOKEN_INFO = 'Spectra_ScopedRelayMailboxToken_v1'
const THREAD_TOKEN_INFO = 'Spectra_RelayThreadToken_v1'
const RELAY_ENVELOPE_INFO = 'Spectra_SealedRelayEnvelope_v1'
const CONTROL_ENVELOPE_INFO = 'Spectra_SealedControlEnvelope_v1'
const SENDER_CREDENTIAL_INFO = 'Spectra_SealedSenderCredential_v1'
const ENVELOPE_NONCE_LENGTH = 24
const DELIVERY_TOKEN_LENGTH = 32
const TOKEN_PREFIX = 'smbx1.'
const SCOPED_TOKEN_PREFIX = 'smbx2.'
const DELIVERY_TOKEN_PREFIX = 'sdv1.'

export function isRelayDeliveryToken(value: unknown): value is string {
  if (typeof value !== 'string' || !value.startsWith(DELIVERY_TOKEN_PREFIX)) {
    return false
  }
  try {
    return base64ToBytes(value.slice(DELIVERY_TOKEN_PREFIX.length)).byteLength === DELIVERY_TOKEN_LENGTH
  } catch {
    return false
  }
}

function publicMaterialFromBundle(bundle: PublicKeyBundle): RecipientPublicMaterial {
  return {
    id: bundle.identityId,
    identityPublicKey: bundle.identityKey,
    mlkemPublicKey: bundle.mlkemIdentityKey,
    dilithiumPublicKey: bundle.dilithiumKey,
  }
}

function canonicalBytes(value: unknown): Uint8Array {
  return stringToBytes(canonicalJsonStringify(value))
}

function tokenFromHash(input: unknown, prefix: string = TOKEN_PREFIX): string {
  return `${prefix}${bytesToBase64(hash(canonicalBytes(input)))}`
}

function createEnvelopeAad(type: SealedEnvelopeType, recipientMailboxToken: string): Uint8Array {
  const version = type === 'message'
    ? PROTOCOL_VERSIONS.sealedRelayEnvelope
    : PROTOCOL_VERSIONS.sealedControlEnvelope
  return canonicalBytes({
    type,
    version,
    recipientMailboxToken,
  })
}

function isScopedMailboxToken(token: string): boolean {
  return token.startsWith(SCOPED_TOKEN_PREFIX)
}

function deriveEnvelopeKey(
  type: SealedEnvelopeType,
  x25519SharedSecret: Uint8Array,
  mlkemSharedSecret: Uint8Array,
  senderEphemeralKey: string,
  mlkemCiphertext: string,
  recipientMailboxToken: string,
): Uint8Array {
  const info = stringToBytes(type === 'message' ? RELAY_ENVELOPE_INFO : CONTROL_ENVELOPE_INFO)
  const salt = hash(canonicalBytes({
    type,
    senderEphemeralKey,
    mlkemCiphertext,
    recipientMailboxToken,
  }))
  return deriveKey(concatBytes(x25519SharedSecret, mlkemSharedSecret), salt, info, 32)
}

async function createSenderCredential(sender: SenderMaterial, issuedAt: number): Promise<SealedEnvelopeSenderCredential> {
  const credentialBody = {
    senderIdentityId: sender.id,
    identityPublicKey: sender.identityPublicKey,
    mlkemPublicKey: sender.mlkemPublicKey,
    dilithiumPublicKey: sender.dilithiumPublicKey,
    issuedAt,
  }
  const signedBytes = canonicalBytes({
    purpose: SENDER_CREDENTIAL_INFO,
    credential: credentialBody,
  })
  return {
    ...credentialBody,
    signature: await signWithDilithiumAsync(signedBytes, sender.dilithiumPrivateKey),
  }
}

export async function verifySealedSenderCredential(
  credential: SealedEnvelopeSenderCredential,
  nowMs: number = Date.now(),
): Promise<boolean> {
  if (credential.expiresAt !== undefined && credential.expiresAt < nowMs) {
    return false
  }

  const { signature, ...credentialBody } = credential
  const signedBytes = canonicalBytes({
    purpose: SENDER_CREDENTIAL_INFO,
    credential: credentialBody,
  })
  return verifyDilithiumSignatureAsync(signedBytes, signature, credential.dilithiumPublicKey)
}

export function deriveRecipientMailboxToken(recipient: RecipientPublicMaterial | PublicKeyBundle): string {
  const material = 'identityKey' in recipient ? publicMaterialFromBundle(recipient) : recipient
  return tokenFromHash({
    version: PROTOCOL_VERSIONS.relayMailboxToken,
    purpose: MAILBOX_TOKEN_INFO,
    identityPublicKey: material.identityPublicKey,
    mlkemPublicKey: material.mlkemPublicKey,
    dilithiumPublicKey: material.dilithiumPublicKey,
  })
}

function normalizeMailboxScopeSecret(scopeSecret: Uint8Array | string): Uint8Array {
  const bytes = typeof scopeSecret === 'string'
    ? base64ToBytes(scopeSecret)
    : scopeSecret
  if (bytes.length < 32) {
    throw new CryptoError('Scoped mailbox token secret must be at least 32 bytes')
  }
  return bytes
}

export function deriveScopedRecipientMailboxToken(params: {
  recipient: RecipientPublicMaterial | PublicKeyBundle
  scopeSecret: Uint8Array | string
  scopeId: string
  epoch?: number
}): string {
  if (!params.scopeId.trim()) {
    throw new CryptoError('Scoped mailbox token scopeId is required')
  }
  if (params.epoch !== undefined && (!Number.isInteger(params.epoch) || params.epoch < 0)) {
    throw new CryptoError('Scoped mailbox token epoch is invalid')
  }

  const material = 'identityKey' in params.recipient ? publicMaterialFromBundle(params.recipient) : params.recipient
  const scopeSecretHash = bytesToBase64(hash(normalizeMailboxScopeSecret(params.scopeSecret)))
  return tokenFromHash({
    version: PROTOCOL_VERSIONS.scopedRelayMailboxToken,
    purpose: SCOPED_MAILBOX_TOKEN_INFO,
    identityPublicKey: material.identityPublicKey,
    mlkemPublicKey: material.mlkemPublicKey,
    dilithiumPublicKey: material.dilithiumPublicKey,
    scopeSecretHash,
    scopeId: params.scopeId,
    epoch: params.epoch ?? 0,
  }, SCOPED_TOKEN_PREFIX)
}

export function deriveThreadToken(params: {
  conversationId: string
  senderIdentityId: string
  recipientIdentityId: string
  sessionId?: string
}): string {
  const participantIds = [params.senderIdentityId, params.recipientIdentityId].sort()
  return tokenFromHash({
    version: PROTOCOL_VERSIONS.relayMailboxToken,
    purpose: THREAD_TOKEN_INFO,
    conversationId: params.conversationId,
    participantIds,
    sessionId: params.sessionId,
  })
}

export class SealedEnvelopeReplayCache {
  private readonly seen = new Set<string>()

  check(nonce: string): void {
    if (this.seen.has(nonce)) {
      throw new ReplayError('Sealed envelope replay detected')
    }
  }

  accept(nonce: string): void {
    this.check(nonce)
    this.seen.add(nonce)
  }
}

async function sealPayload(params: {
  type: SealedEnvelopeType
  recipient: RecipientPublicMaterial | PublicKeyBundle
  payload: SealedRelayPayload | SealedControlPayload
  recipientMailboxToken?: string
}): Promise<{ recipientMailboxToken: string; envelope: SealedRelayEnvelope | SealedControlEnvelope }> {
  const recipient = 'identityKey' in params.recipient ? publicMaterialFromBundle(params.recipient) : params.recipient
  const recipientMailboxToken = params.recipientMailboxToken ?? deriveRecipientMailboxToken(recipient)
  const senderEphemeral = generateX25519KeyPair()
  const x25519SharedSecret = x25519DH(senderEphemeral.privateKey, recipient.identityPublicKey)
  const mlkem = await mlkemEncapsulateAsync(recipient.mlkemPublicKey)
  const key = deriveEnvelopeKey(
    params.type,
    x25519SharedSecret,
    mlkem.sharedSecret,
    senderEphemeral.publicKey,
    mlkem.ciphertext,
    recipientMailboxToken,
  )
  const aad = createEnvelopeAad(params.type, recipientMailboxToken)
  const encrypted = encryptAES(key, canonicalBytes(params.payload), aad)
  const version = params.type === 'message'
    ? PROTOCOL_VERSIONS.sealedRelayEnvelope
    : PROTOCOL_VERSIONS.sealedControlEnvelope

  return {
    recipientMailboxToken,
    envelope: {
      version,
      type: params.type,
      senderEphemeralKey: senderEphemeral.publicKey,
      mlkemCiphertext: mlkem.ciphertext,
      ...encrypted,
    },
  }
}

async function openPayload(params: {
  recipient: RecipientPrivateMaterial & RecipientPublicMaterial
  recipientMailboxToken: string
  envelope: SealedRelayEnvelope | SealedControlEnvelope
  replayCache?: SealedEnvelopeReplayCache
}): Promise<SealedRelayPayload | SealedControlPayload> {
  const { envelope } = params
  if (envelope.type === 'message') {
    assertExactVersion('Sealed relay envelope', envelope.version, PROTOCOL_VERSIONS.sealedRelayEnvelope)
  } else {
    assertExactVersion('Sealed control envelope', envelope.version, PROTOCOL_VERSIONS.sealedControlEnvelope)
  }

  const expectedMailboxToken = deriveRecipientMailboxToken(params.recipient)
  if (params.recipientMailboxToken !== expectedMailboxToken && !isScopedMailboxToken(params.recipientMailboxToken)) {
    throw new CryptoError('Sealed envelope mailbox token does not match recipient')
  }

  const x25519SharedSecret = x25519DH(params.recipient.identityPrivateKey, envelope.senderEphemeralKey)
  const mlkemSharedSecret = await mlkemDecapsulateAsync(envelope.mlkemCiphertext, params.recipient.mlkemPrivateKey)
  const key = deriveEnvelopeKey(
    envelope.type,
    x25519SharedSecret,
    mlkemSharedSecret,
    envelope.senderEphemeralKey,
    envelope.mlkemCiphertext,
    params.recipientMailboxToken,
  )
  const aad = createEnvelopeAad(envelope.type, params.recipientMailboxToken)
  const plaintext = decryptAES(key, envelope.ciphertext, envelope.nonce, envelope.tag, aad)
  const parsed = JSON.parse(bytesToString(plaintext)) as SealedRelayPayload | SealedControlPayload

  if (!await verifySealedSenderCredential(parsed.senderCredential)) {
    throw new CryptoError('Invalid sealed sender credential')
  }
  params.replayCache?.accept(parsed.envelopeNonce)
  return parsed
}

export async function sealRelayEnvelope(params: {
  sender: SenderMaterial
  recipient: RecipientPublicMaterial | PublicKeyBundle
  encryptedMessage: EncryptedMessage
  conversationId: string
  messageKind?: RelayMessageKind
  senderBundle?: PublicKeyBundle
  timestamp?: number
  recipientMailboxToken?: string
  deliveryToken?: string
}): Promise<OutboundSealedRelayRecord> {
  const timestamp = params.timestamp ?? Date.now()
  const messageKind = params.messageKind ?? 'text'
  const payload: SealedRelayPayload = {
    senderCredential: await createSenderCredential(params.sender, timestamp),
    threadToken: deriveThreadToken({
      conversationId: params.conversationId,
      senderIdentityId: params.sender.id,
      recipientIdentityId: 'identityId' in params.recipient ? params.recipient.identityId : params.recipient.id,
      sessionId: params.encryptedMessage.metadata?.sessionId,
    }),
    messageKind,
    encryptedMessage: params.encryptedMessage,
    senderBundle: params.senderBundle,
    envelopeNonce: bytesToBase64(generateRandomBytes(ENVELOPE_NONCE_LENGTH)),
    timestamp,
  }
  const sealed = await sealPayload({
    type: 'message',
    recipient: params.recipient,
    payload,
    recipientMailboxToken: params.recipientMailboxToken,
  })
  const deliveryToken = params.deliveryToken
    ?? `${DELIVERY_TOKEN_PREFIX}${bytesToBase64(generateRandomBytes(DELIVERY_TOKEN_LENGTH))}`
  if (!isRelayDeliveryToken(deliveryToken)) {
    throw new CryptoError('Invalid relay delivery token')
  }
  return {
    recipientMailboxToken: sealed.recipientMailboxToken,
    deliveryToken,
    deliveryClass: 'message',
    pushNotificationEnabled: messageKind === 'text' || messageKind === 'view_once',
    sealedEnvelope: sealed.envelope as SealedRelayEnvelope,
  }
}

export async function openRelayEnvelope(params: {
  recipient: RecipientPrivateMaterial & RecipientPublicMaterial
  recipientMailboxToken: string
  envelope: SealedRelayEnvelope
  replayCache?: SealedEnvelopeReplayCache
}): Promise<SealedRelayPayload> {
  const payload = await openPayload(params)
  if (!('encryptedMessage' in payload)) {
    throw new CryptoError('Sealed envelope did not contain a relay message')
  }
  return payload
}

export async function sealControlEnvelope(params: {
  sender: SenderMaterial
  recipient: RecipientPublicMaterial | PublicKeyBundle
  controlMessage: ControlMessage
  timestamp?: number
  recipientMailboxToken?: string
}): Promise<OutboundSealedControlRecord> {
  const timestamp = params.timestamp ?? Date.now()
  const payload: SealedControlPayload = {
    senderCredential: await createSenderCredential(params.sender, timestamp),
    controlMessage: params.controlMessage,
    envelopeNonce: bytesToBase64(generateRandomBytes(ENVELOPE_NONCE_LENGTH)),
    timestamp,
  }
  const sealed = await sealPayload({
    type: 'control',
    recipient: params.recipient,
    payload,
    recipientMailboxToken: params.recipientMailboxToken,
  })
  return {
    recipientMailboxToken: sealed.recipientMailboxToken,
    deliveryClass: 'control',
    sealedEnvelope: sealed.envelope as SealedControlEnvelope,
  }
}

export async function openControlEnvelope(params: {
  recipient: RecipientPrivateMaterial & RecipientPublicMaterial
  recipientMailboxToken: string
  envelope: SealedControlEnvelope
  replayCache?: SealedEnvelopeReplayCache
}): Promise<SealedControlPayload> {
  const payload = await openPayload(params)
  if (!('controlMessage' in payload)) {
    throw new CryptoError('Sealed envelope did not contain a control message')
  }
  return payload
}
