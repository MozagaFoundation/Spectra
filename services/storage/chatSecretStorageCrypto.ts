/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import {
  buildLocalCacheAad,
  openLocalCacheText,
  sealLocalCacheText,
  type LocalCacheCipher,
} from './localCacheCrypto'

export type ChatSecretRecordKind =
  | 'identity'
  | 'mailbox-scope'
  | 'private-bundle'
  | 'session'
  | 'session-record'

export type ChatSecretStorageEnvelope = {
  __chatSecretCipher: true
  v: 1
  cipher: LocalCacheCipher
}

function getAssociatedData(
  scope: string,
  kind: ChatSecretRecordKind,
  storageKey: string,
): Uint8Array {
  return buildLocalCacheAad([
    'spectra',
    'chat-secret',
    'v1',
    scope,
    kind,
    storageKey,
  ])
}

export function isChatSecretStorageEnvelope(
  value: unknown,
): value is ChatSecretStorageEnvelope {
  if (!value || typeof value !== 'object') return false
  const envelope = value as Partial<ChatSecretStorageEnvelope>
  return envelope.__chatSecretCipher === true
    && envelope.v === 1
    && Boolean(envelope.cipher)
}

export async function sealChatSecretRecord(
  scope: string,
  kind: ChatSecretRecordKind,
  storageKey: string,
  value: unknown,
): Promise<ChatSecretStorageEnvelope> {
  const plaintext = JSON.stringify(value)
  if (plaintext === undefined) {
    throw new Error('Chat secret record is not serializable')
  }

  return {
    __chatSecretCipher: true,
    v: 1,
    cipher: await sealLocalCacheText(
      scope,
      'chat-secret',
      plaintext,
      getAssociatedData(scope, kind, storageKey),
    ),
  }
}

export async function openChatSecretRecord<T>(
  scope: string,
  kind: ChatSecretRecordKind,
  storageKey: string,
  envelope: ChatSecretStorageEnvelope,
): Promise<T> {
  const plaintext = await openLocalCacheText(
    scope,
    'chat-secret',
    envelope.cipher,
    getAssociatedData(scope, kind, storageKey),
  )
  return JSON.parse(plaintext) as T
}
