/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'

import { canonicalJsonStringify } from './canonicalJson'

describe('canonicalJsonStringify', () => {
  it('matches JSON undefined semantics while keeping stable key order', () => {
    expect(
      canonicalJsonStringify({
        z: 1,
        skip: undefined,
        nested: {
          keep: 'value',
          drop: undefined,
        },
        list: [1, undefined, { keep: true, drop: undefined }],
      }),
    ).toBe('{"list":[1,null,{"keep":true}],"nested":{"keep":"value"},"z":1}')
  })

  it('survives JSON round-trips for retry response payloads', () => {
    const payload = {
      bundle: {
        identityId: 'local-identity',
        identityKey: 'identity-key',
        mlkemIdentityKey: 'mlkem-identity-key',
        dilithiumKey: 'dilithium-key',
        signedPreKey: {
          signature: 'spk-signature',
          x25519PublicKey: 'spk-x25519',
          mlkemPublicKey: 'spk-mlkem',
          keyId: 9,
          timestamp: 123,
        },
        oneTimePreKeys: [],
        version: 2,
        timestamp: 456,
        bundleSignature: 'bundle-signature',
      },
      encryptedMessage: {
        header: {
          ratchetPublicKey: 'ratchet-key',
          previousChainLength: 0,
          messageNumber: 1,
        },
        encryptedHeader: undefined,
        ciphertext: 'ciphertext',
        tag: 'tag',
        nonce: 'nonce',
        signature: 'message-signature',
        metadata: {
          messageId: 'message-1',
          senderId: 'alice',
          recipientId: 'bob',
          conversationId: 'conversation-1',
          sessionId: 'session-1',
          timestamp: 1_717_171_717_000,
          sequenceNumber: 12,
        },
        x3dhData: undefined,
        version: 1,
      },
    }

    const roundTrippedPayload = JSON.parse(JSON.stringify(payload))

    expect(canonicalJsonStringify(payload)).toBe(canonicalJsonStringify(roundTrippedPayload))
  })
})
