/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'
import {
  TransportFrameAssembler,
  encodeTransportFrames,
} from '../link/transportFrames'

describe('BLE transport frames', () => {
  it.each([64, 160, 182, 244])(
    'round-trips a production-size credential with a %i-byte budget',
    (maxFrameBytes) => {
      const message = Uint8Array.from(
        { length: 3_500 },
        (_, index) => index % 251,
      )
      const frames = encodeTransportFrames({ message, maxFrameBytes })
      const assembler = new TransportFrameAssembler()
      let assembled: Uint8Array | null = null

      for (const frame of [...frames].reverse()) {
        expect(frame.length).toBeLessThanOrEqual(maxFrameBytes)
        assembled = assembler.accept('peer', frame) ?? assembled
      }

      expect(assembled).toEqual(message)
    },
  )

  it('accepts an identical duplicate without double-counting bytes', () => {
    const frames = encodeTransportFrames({
      message: new Uint8Array(300).fill(7),
      maxFrameBytes: 64,
    })
    const assembler = new TransportFrameAssembler()

    expect(assembler.accept('peer', frames[0])).toBeNull()
    expect(assembler.accept('peer', frames[0])).toBeNull()
    let assembled: Uint8Array | null = null
    for (const frame of frames.slice(1)) {
      assembled = assembler.accept('peer', frame) ?? assembled
    }

    expect(assembled).toEqual(new Uint8Array(300).fill(7))
  })

  it('rejects conflicting duplicate fragments', () => {
    const frames = encodeTransportFrames({
      message: new Uint8Array(300).fill(7),
      maxFrameBytes: 64,
    })
    const assembler = new TransportFrameAssembler()
    const changed = frames[0].slice()
    changed[changed.length - 1] ^= 1

    assembler.accept('peer', frames[0])
    expect(() => assembler.accept('peer', changed)).toThrow(
      'duplicate fragment mismatch',
    )
  })

  it('expires incomplete assemblies', () => {
    const frames = encodeTransportFrames({
      message: new Uint8Array(300),
      maxFrameBytes: 64,
    })
    const assembler = new TransportFrameAssembler()

    assembler.accept('peer', frames[0], 1)

    expect(assembler.cleanup(10_002)).toBe(1)
  })

  it('keeps identical record IDs isolated by peer', () => {
    const recordId = new Uint8Array(8).fill(9)
    const left = encodeTransportFrames({
      message: new Uint8Array(80).fill(1),
      maxFrameBytes: 64,
      recordId,
    })
    const right = encodeTransportFrames({
      message: new Uint8Array(80).fill(2),
      maxFrameBytes: 64,
      recordId,
    })
    const assembler = new TransportFrameAssembler()

    expect(assembler.accept('left', left[0])).toBeNull()
    expect(assembler.accept('right', right[0])).toBeNull()
    expect(assembler.accept('left', left[1])).toEqual(new Uint8Array(80).fill(1))
    expect(assembler.accept('right', right[1])).toEqual(new Uint8Array(80).fill(2))
  })

  it('bounds concurrent incomplete records', () => {
    const assembler = new TransportFrameAssembler()
    for (let index = 0; index < 4; index += 1) {
      const frames = encodeTransportFrames({
        message: new Uint8Array(100),
        maxFrameBytes: 64,
        recordId: new Uint8Array(8).fill(index),
      })
      expect(assembler.accept('peer', frames[0])).toBeNull()
    }
    const overflow = encodeTransportFrames({
      message: new Uint8Array(100),
      maxFrameBytes: 64,
      recordId: new Uint8Array(8).fill(4),
    })

    expect(() => assembler.accept('peer', overflow[0])).toThrow(
      'peer assembly limit reached',
    )
  })

  it('does not fail a new peer when global capacity is occupied', () => {
    const assembler = new TransportFrameAssembler()
    for (let index = 0; index < 17; index += 1) {
      const frames = encodeTransportFrames({
        message: new Uint8Array(100),
        maxFrameBytes: 64,
        recordId: new Uint8Array(8).fill(index),
      })
      expect(assembler.accept(`peer-${index}`, frames[0], index)).toBeNull()
    }
  })
})
