/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'
import {
  DirectFrameAssembler,
  decodeDirectDataFrame,
  encodeDirectDataFrames,
} from '../mesh/directFrames'

describe('BLE v2 direct frames', () => {
  const messageId = new Uint8Array(16).fill(9)

  it('reassembles out-of-order frames under the secure link payload limit', () => {
    const message = new Uint8Array(12_000).map((_, index) => index % 251)
    const frames = encodeDirectDataFrames({
      messageId,
      message,
      maxFramePayload: 157,
    })
    const assembler = new DirectFrameAssembler()
    let complete: Uint8Array | null = null

    for (const frame of [...frames].reverse()) {
      complete = assembler.accept('peer-a', frame)?.message ?? complete
    }

    expect(frames.every((frame) => frame.length <= 157)).toBe(true)
    expect(complete).toEqual(message)
  })

  it('rejects protocol v1 frames', () => {
    const frame = encodeDirectDataFrames({
      messageId,
      message: new Uint8Array([1]),
      maxFramePayload: 157,
    })[0]
    frame[2] = 1
    expect(() => decodeDirectDataFrame(frame)).toThrow('Invalid BLE direct data frame')
  })

  it('rejects fragment substitution and resource exhaustion attempts', () => {
    const frames = encodeDirectDataFrames({
      messageId,
      message: new Uint8Array(1_000).fill(3),
      maxFramePayload: 157,
    })
    const assembler = new DirectFrameAssembler()
    assembler.accept('peer-a', frames[0])
    const substituted = frames[0].slice()
    substituted[substituted.length - 1] ^= 1
    expect(() => assembler.accept('peer-a', substituted)).toThrow(
      'duplicate fragment mismatch',
    )

    for (let index = 0; index < 2; index += 1) {
      const id = new Uint8Array(16).fill(index + 1)
      const partial = encodeDirectDataFrames({
        messageId: id,
        message: new Uint8Array(1_000),
        maxFramePayload: 157,
      })[0]
      assembler.accept('malicious-peer', partial)
    }
    const overflow = encodeDirectDataFrames({
      messageId: new Uint8Array(16).fill(8),
      message: new Uint8Array(1_000),
      maxFramePayload: 157,
    })[0]
    expect(() => assembler.accept('malicious-peer', overflow)).toThrow(
      'resource limit reached',
    )
  })

  it('rejects oversized direct messages', () => {
    expect(() => encodeDirectDataFrames({
      messageId,
      message: new Uint8Array(256 * 1024 + 1),
      maxFramePayload: 157,
    })).toThrow('length is invalid')
  })
})
