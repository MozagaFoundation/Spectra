/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'
import {
  HandshakeFrameAssembler,
  decodeHandshakeFrame,
  encodeHandshakeFrames,
} from '../link/handshakeFrames'

describe('BLE v2 handshake frames', () => {
  const handshakeId = new Uint8Array(8).fill(7)

  it('reassembles a bounded handshake in any fragment order', () => {
    const message = new Uint8Array(3_800).map((_, index) => index % 251)
    const frames = encodeHandshakeFrames({
      handshakeId,
      step: 2,
      message,
      mtu: 185,
    })
    const assembler = new HandshakeFrameAssembler()
    let complete: Uint8Array | null = null

    for (const frame of [...frames].reverse()) {
      complete = assembler.accept('peer-a', frame) ?? complete
    }

    expect(complete).toEqual(message)
    expect(frames.every((frame) => frame.length <= 185)).toBe(true)
  })

  it('rejects oversized, malformed, and inconsistent handshakes', () => {
    expect(() => encodeHandshakeFrames({
      handshakeId,
      step: 1,
      message: new Uint8Array(8 * 1024 + 1),
      mtu: 185,
    })).toThrow('length is invalid')

    const frame = encodeHandshakeFrames({
      handshakeId,
      step: 1,
      message: new Uint8Array(300).fill(2),
      mtu: 185,
    })[0]
    const malformed = frame.slice()
    malformed[2] = 1
    expect(() => decodeHandshakeFrame(malformed)).toThrow('Invalid BLE handshake frame')
  })

  it('rejects duplicate-fragment substitution and drops the assembly', () => {
    const frames = encodeHandshakeFrames({
      handshakeId,
      step: 3,
      message: new Uint8Array(300).fill(5),
      mtu: 185,
    })
    const assembler = new HandshakeFrameAssembler()
    expect(assembler.accept('peer-a', frames[0])).toBeNull()

    const substituted = frames[0].slice()
    substituted[substituted.length - 1] ^= 1
    expect(() => assembler.accept('peer-a', substituted)).toThrow(
      'duplicate fragment mismatch',
    )
  })

  it('keeps peer assemblies separate and expires partial work', () => {
    const frame = encodeHandshakeFrames({
      handshakeId,
      step: 1,
      message: new Uint8Array(300).fill(1),
      mtu: 185,
    })[0]
    const assembler = new HandshakeFrameAssembler()
    assembler.accept('peer-a', frame, 1)
    assembler.accept('peer-b', frame, 1)

    expect(assembler.cleanup(20_000)).toBe(2)
  })

  it('bounds partial assemblies per peer and releases them on removal', () => {
    const assembler = new HandshakeFrameAssembler()
    const partialFrame = (id: number) => encodeHandshakeFrames({
      handshakeId: new Uint8Array(8).fill(id),
      step: 1,
      message: new Uint8Array(300).fill(id),
      mtu: 185,
    })[0]

    for (let id = 1; id <= 4; id += 1) {
      expect(assembler.accept('peer-a', partialFrame(id))).toBeNull()
    }
    expect(() => assembler.accept('peer-a', partialFrame(5))).toThrow(
      'assembly limit reached',
    )

    assembler.removePeer('peer-a')
    expect(assembler.accept('peer-a', partialFrame(5))).toBeNull()
  })
})
