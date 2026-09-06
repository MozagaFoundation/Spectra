/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'
import type { SRTPHeader } from '../types'
import {
  createCallReplayState,
  decryptCallSignal,
  decryptCallSignalWithReplay,
  decryptRTPPacket,
  decryptRTPPacketWithReplay,
  deriveCallKeyMaterial,
  encryptCallSignal,
  encryptRTPPacket,
  ReplayWindow,
} from './call'
import { stringToBytes } from './utils'
import { makeIdentityPair, tamperBase64, tamperHex } from '../__tests__/helpers/cryptoTestHelpers'

const rootKey = new Uint8Array(32).fill(42)
const header: SRTPHeader = {
  version: 2,
  padding: false,
  extension: false,
  csrcCount: 0,
  marker: false,
  payloadType: 111,
  sequenceNumber: 7,
  timestamp: 12_345,
  ssrc: 0x10203040,
}

describe('call key derivation and RTP encryption', () => {
  it('derives deterministic key material per call id and key index', () => {
    const first = deriveCallKeyMaterial(rootKey, 'call-1', 0)
    const again = deriveCallKeyMaterial(rootKey, 'call-1', 0)
    const rotated = deriveCallKeyMaterial(rootKey, 'call-1', 1)

    expect(again.masterSecret).toEqual(first.masterSecret)
    expect(again.srtpMasterKey).toEqual(first.srtpMasterKey)
    expect(rotated.masterSecret).not.toEqual(first.masterSecret)
    expect(() => deriveCallKeyMaterial(new Uint8Array(31), 'call-1')).toThrow()
  })

  it('round-trips RTP packets with authenticated headers', () => {
    const keyMaterial = deriveCallKeyMaterial(rootKey, 'call-1')
    const payload = stringToBytes('voice frame')
    const encrypted = encryptRTPPacket(keyMaterial, header, payload, 0)

    expect(decryptRTPPacket(keyMaterial, encrypted)).toEqual(payload)
  })

  it('rejects tampered RTP payload, auth tag, header, SSRC, sequence number, and ROC', () => {
    const keyMaterial = deriveCallKeyMaterial(rootKey, 'call-1')
    const encrypted = encryptRTPPacket(keyMaterial, header, stringToBytes('voice frame'), 0)

    expect(() => decryptRTPPacket(keyMaterial, { ...encrypted, encryptedPayload: tamperBase64(encrypted.encryptedPayload) })).toThrow()
    expect(() => decryptRTPPacket(keyMaterial, { ...encrypted, authTag: tamperBase64(encrypted.authTag) })).toThrow()
    expect(() => decryptRTPPacket(keyMaterial, { ...encrypted, header: { ...encrypted.header, payloadType: 96 } })).toThrow()
    expect(() => decryptRTPPacket(keyMaterial, { ...encrypted, header: { ...encrypted.header, ssrc: 0x50607080 } })).toThrow()
    expect(() => decryptRTPPacket(keyMaterial, { ...encrypted, header: { ...encrypted.header, sequenceNumber: 8 } })).toThrow()
    expect(() => decryptRTPPacket(keyMaterial, { ...encrypted, roc: 1 })).toThrow()
  })

  it('rejects RTP sequence and rollover values that would truncate in AAD', () => {
    const keyMaterial = deriveCallKeyMaterial(rootKey, 'call-ranges')
    expect(() => encryptRTPPacket(keyMaterial, { ...header, sequenceNumber: 65_536 }, stringToBytes('voice frame'), 0)).toThrow()
    expect(() => encryptRTPPacket(keyMaterial, header, stringToBytes('voice frame'), 0x1_0000_0000)).toThrow()
    expect(() => new ReplayWindow().checkAndUpdate(65_536)).toThrow()
  })

  it('detects duplicate packets, old packets outside the window, and ROC rollover', () => {
    const window = new ReplayWindow()

    expect(window.checkAndUpdate(1)).toEqual({ isReplay: false, roc: 0 })
    expect(window.checkAndUpdate(1).isReplay).toBe(true)
    expect(window.checkAndUpdate(200).isReplay).toBe(false)
    expect(window.checkAndUpdate(0).isReplay).toBe(true)

    const rollover = new ReplayWindow()
    expect(rollover.checkAndUpdate(65_535).roc).toBe(0)
    const afterWrap = rollover.checkAndUpdate(0)
    expect(afterWrap.isReplay).toBe(false)
    expect(afterWrap.roc).toBe(1)
  })

  it('enforces RTP replay protection during decrypt by default', () => {
    const keyMaterial = deriveCallKeyMaterial(rootKey, 'call-1')
    const encrypted = encryptRTPPacket(keyMaterial, header, stringToBytes('voice frame'), 0)

    decryptRTPPacket(keyMaterial, encrypted)
    expect(() => decryptRTPPacket(keyMaterial, encrypted)).toThrow()
  })

  it('persists RTP replay state across rehydration', () => {
    const keyMaterial = deriveCallKeyMaterial(rootKey, 'call-persisted-rtp')
    const replayState = createCallReplayState()
    const encrypted = encryptRTPPacket(keyMaterial, header, stringToBytes('voice frame'), 0)

    expect(decryptRTPPacketWithReplay(keyMaterial, encrypted, replayState)).toEqual(stringToBytes('voice frame'))

    const restored = JSON.parse(JSON.stringify(replayState))
    expect(() => decryptRTPPacketWithReplay(keyMaterial, encrypted, restored)).toThrow()
  })
})

describe('call signaling encryption', () => {
  it('encrypts, signs, and decrypts call signaling payloads', () => {
    const { alice } = makeIdentityPair()
    const keyMaterial = deriveCallKeyMaterial(rootKey, 'call-1')
    const signal = encryptCallSignal(keyMaterial, alice.identity.dilithiumPrivateKey, 'offer', { sdp: 'v=0' }, 1)

    expect(decryptCallSignal(keyMaterial, alice.identity.dilithiumPublicKey, signal)).toEqual({ sdp: 'v=0' })
  })

  it('rejects duplicated call signaling sequences by default', () => {
    const { alice } = makeIdentityPair()
    const keyMaterial = deriveCallKeyMaterial(rootKey, 'call-replay')
    const signal = encryptCallSignal(keyMaterial, alice.identity.dilithiumPrivateKey, 'offer', { sdp: 'v=0' }, 1)

    expect(decryptCallSignal(keyMaterial, alice.identity.dilithiumPublicKey, signal)).toEqual({ sdp: 'v=0' })
    expect(() => decryptCallSignal(keyMaterial, alice.identity.dilithiumPublicKey, signal)).toThrow()
  })

  it('persists call signal replay state across rehydration', () => {
    const { alice } = makeIdentityPair()
    const keyMaterial = deriveCallKeyMaterial(rootKey, 'call-persisted-signal')
    const replayState = createCallReplayState()
    const signal = encryptCallSignal(keyMaterial, alice.identity.dilithiumPrivateKey, 'offer', { sdp: 'v=0' }, 1)

    expect(decryptCallSignalWithReplay(keyMaterial, alice.identity.dilithiumPublicKey, signal, replayState)).toEqual({ sdp: 'v=0' })

    const restored = JSON.parse(JSON.stringify(replayState))
    expect(() => decryptCallSignalWithReplay(keyMaterial, alice.identity.dilithiumPublicKey, signal, restored)).toThrow()
  })

  it('rejects unsupported future call signal versions', () => {
    const { alice } = makeIdentityPair()
    const keyMaterial = deriveCallKeyMaterial(rootKey, 'call-version')
    const signal = encryptCallSignal(keyMaterial, alice.identity.dilithiumPrivateKey, 'offer', { sdp: 'v=0' }, 1)

    expect(() => decryptCallSignal(keyMaterial, alice.identity.dilithiumPublicKey, {
      ...signal,
      version: 999,
    })).toThrow()
  })

  it('rejects tampered signatures, stale timestamps, and non-increasing sequences', () => {
    const { alice } = makeIdentityPair()
    const keyMaterial = deriveCallKeyMaterial(rootKey, 'call-1')
    const signal = encryptCallSignal(keyMaterial, alice.identity.dilithiumPrivateKey, 'offer', { sdp: 'v=0' }, 2)

    expect(() => decryptCallSignal(keyMaterial, alice.identity.dilithiumPublicKey, {
      ...signal,
      signature: tamperHex(signal.signature),
    })).toThrow()
    expect(() => decryptCallSignal(keyMaterial, alice.identity.dilithiumPublicKey, {
      ...signal,
      timestamp: signal.timestamp - 6 * 60 * 1000,
    })).toThrow()
    expect(() => decryptCallSignal(keyMaterial, alice.identity.dilithiumPublicKey, signal, 2)).toThrow()
  })
})
