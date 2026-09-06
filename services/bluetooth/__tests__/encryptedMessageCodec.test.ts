/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'
import type { EncryptedMessage } from '@spectra/core-crypto'
import {
  decodeBLEEncryptedMessage,
  encodeBLEEncryptedMessage,
} from '../mesh/encryptedMessageCodec'

function message(): EncryptedMessage {
  return {
    header: {
      ratchetKey: 'ratchet',
      messageNumber: 1,
      previousChainLength: 0,
    },
    ciphertext: 'ciphertext',
    tag: 'tag',
    nonce: 'nonce',
    signature: 'signature',
    metadata: {
      messageId: 'message-1',
      senderId: 'alice',
      recipientId: 'bob',
      sessionId: 'session-1',
      timestamp: 1,
      sequenceNumber: 1,
    },
    version: 3,
  }
}

describe('BLE encrypted message codec', () => {
  it('accepts the plaintext-header representation', () => {
    const decoded = decodeBLEEncryptedMessage(
      encodeBLEEncryptedMessage(message()),
      'alice',
    )

    expect(decoded.header).toEqual(expect.objectContaining({
      ratchetKey: 'ratchet',
    }))
  })

  it('accepts the production encrypted-header representation', () => {
    const encryptedHeaderMessage = {
      ...message(),
      header: undefined,
      encryptedHeader: {
        ciphertext: 'header-ciphertext',
        nonce: 'header-nonce',
        tag: 'header-tag',
      },
    } as unknown as EncryptedMessage

    const decoded = decodeBLEEncryptedMessage(
      encodeBLEEncryptedMessage(encryptedHeaderMessage),
      'alice',
    )

    expect(decoded.encryptedHeader).toEqual({
      ciphertext: 'header-ciphertext',
      nonce: 'header-nonce',
      tag: 'header-tag',
    })
  })

  it('rejects ambiguous, malformed, and sender-mismatched messages', () => {
    const ambiguous = {
      ...message(),
      encryptedHeader: {
        ciphertext: 'header-ciphertext',
        nonce: 'header-nonce',
        tag: 'header-tag',
      },
    }
    expect(() => decodeBLEEncryptedMessage(
      encodeBLEEncryptedMessage(ambiguous),
      'alice',
    )).toThrow('BLE direct encrypted message is invalid')

    const malformed = {
      ...message(),
      header: undefined,
      encryptedHeader: {
        ciphertext: 'header-ciphertext',
        nonce: 'header-nonce',
      },
    } as unknown as EncryptedMessage
    expect(() => decodeBLEEncryptedMessage(
      encodeBLEEncryptedMessage(malformed),
      'alice',
    )).toThrow('BLE direct encrypted message is invalid')

    expect(() => decodeBLEEncryptedMessage(
      encodeBLEEncryptedMessage(message()),
      'mallory',
    )).toThrow('BLE direct encrypted message is invalid')
  })
})
