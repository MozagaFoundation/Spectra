/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { generateRandomBytes } from '@spectra/core-crypto'

const MAGIC = new Uint8Array([0x53, 0x42])
const VERSION = 2
const HANDSHAKE_FRAME_TYPE = 0x01
const HEADER_BYTES = 20
const HANDSHAKE_ID_BYTES = 8
const MAX_HANDSHAKE_BYTES = 8 * 1024
const MAX_HANDSHAKE_FRAGMENTS = 64
const MAX_ASSEMBLIES = 16
const MAX_ASSEMBLIES_PER_PEER = 4
const ASSEMBLY_TIMEOUT_MS = 10_000

export interface HandshakeFrame {
  handshakeId: Uint8Array
  step: number
  index: number
  total: number
  totalLength: number
  chunk: Uint8Array
}

interface Assembly {
  peerId: string
  key: string
  step: number
  total: number
  totalLength: number
  chunks: Map<number, Uint8Array>
  receivedBytes: number
  createdAt: number
}

function idHex(id: Uint8Array): string {
  return Array.from(id, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function frameKey(peerId: string, id: Uint8Array, step: number): string {
  return `${peerId}:${idHex(id)}:${step}`
}

export function createHandshakeId(): Uint8Array {
  return generateRandomBytes(HANDSHAKE_ID_BYTES)
}

export function encodeHandshakeFrames(options: {
  handshakeId: Uint8Array
  step: number
  message: Uint8Array
  mtu: number
}): Uint8Array[] {
  const { handshakeId, step, message, mtu } = options
  if (handshakeId.length !== HANDSHAKE_ID_BYTES) {
    throw new Error('BLE handshake ID must be 8 bytes')
  }
  if (!Number.isInteger(step) || step < 1 || step > 3) {
    throw new Error('BLE handshake step is invalid')
  }
  if (message.length === 0 || message.length > MAX_HANDSHAKE_BYTES) {
    throw new Error('BLE handshake message length is invalid')
  }
  if (!Number.isInteger(mtu) || mtu <= HEADER_BYTES) {
    throw new Error('BLE handshake MTU is invalid')
  }

  const chunkBytes = mtu - HEADER_BYTES
  const total = Math.ceil(message.length / chunkBytes)
  if (total > MAX_HANDSHAKE_FRAGMENTS) {
    throw new Error('BLE handshake requires too many fragments')
  }

  return Array.from({ length: total }, (_, index) => {
    const chunk = message.slice(index * chunkBytes, (index + 1) * chunkBytes)
    const frame = new Uint8Array(HEADER_BYTES + chunk.length)
    frame.set(MAGIC, 0)
    frame[2] = VERSION
    frame[3] = HANDSHAKE_FRAME_TYPE
    frame.set(handshakeId, 4)
    frame[12] = step
    frame[13] = index
    frame[14] = total
    frame[15] = 0
    new DataView(frame.buffer).setUint32(16, message.length, false)
    frame.set(chunk, HEADER_BYTES)
    return frame
  })
}

export function decodeHandshakeFrame(data: Uint8Array): HandshakeFrame {
  if (
    data.length <= HEADER_BYTES
    || data[0] !== MAGIC[0]
    || data[1] !== MAGIC[1]
    || data[2] !== VERSION
    || data[3] !== HANDSHAKE_FRAME_TYPE
    || data[15] !== 0
  ) {
    throw new Error('Invalid BLE handshake frame')
  }

  const step = data[12]
  const index = data[13]
  const total = data[14]
  const totalLength = new DataView(
    data.buffer,
    data.byteOffset,
    data.byteLength,
  ).getUint32(16, false)
  if (
    step < 1
    || step > 3
    || total === 0
    || total > MAX_HANDSHAKE_FRAGMENTS
    || index >= total
    || totalLength === 0
    || totalLength > MAX_HANDSHAKE_BYTES
    || data.length - HEADER_BYTES > totalLength
  ) {
    throw new Error('Invalid BLE handshake frame metadata')
  }

  return {
    handshakeId: data.slice(4, 12),
    step,
    index,
    total,
    totalLength,
    chunk: data.slice(HEADER_BYTES),
  }
}

export class HandshakeFrameAssembler {
  private readonly assemblies = new Map<string, Assembly>()

  accept(peerId: string, encoded: Uint8Array, now: number = Date.now()): Uint8Array | null {
    this.cleanup(now)
    const frame = decodeHandshakeFrame(encoded)
    const key = frameKey(peerId, frame.handshakeId, frame.step)
    let assembly = this.assemblies.get(key)
    if (!assembly) {
      const peerAssemblies = [...this.assemblies.values()]
        .filter((candidate) => candidate.peerId === peerId)
        .length
      if (
        this.assemblies.size >= MAX_ASSEMBLIES
        || peerAssemblies >= MAX_ASSEMBLIES_PER_PEER
      ) {
        throw new Error('BLE handshake assembly limit reached')
      }
      assembly = {
        peerId,
        key,
        step: frame.step,
        total: frame.total,
        totalLength: frame.totalLength,
        chunks: new Map(),
        receivedBytes: 0,
        createdAt: now,
      }
      this.assemblies.set(key, assembly)
    } else if (
      assembly.total !== frame.total
      || assembly.totalLength !== frame.totalLength
      || assembly.step !== frame.step
    ) {
      this.assemblies.delete(key)
      throw new Error('BLE handshake fragment metadata mismatch')
    }

    const existing = assembly.chunks.get(frame.index)
    if (existing) {
      if (
        existing.length !== frame.chunk.length
        || existing.some((byte, index) => byte !== frame.chunk[index])
      ) {
        this.assemblies.delete(key)
        throw new Error('BLE handshake duplicate fragment mismatch')
      }
      return null
    }

    if (assembly.receivedBytes + frame.chunk.length > assembly.totalLength) {
      this.assemblies.delete(key)
      throw new Error('BLE handshake assembly exceeds declared length')
    }
    assembly.chunks.set(frame.index, frame.chunk)
    assembly.receivedBytes += frame.chunk.length
    if (assembly.chunks.size !== assembly.total) return null
    if (assembly.receivedBytes !== assembly.totalLength) {
      this.assemblies.delete(key)
      throw new Error('BLE handshake assembly length mismatch')
    }

    const message = new Uint8Array(assembly.totalLength)
    let offset = 0
    for (let index = 0; index < assembly.total; index += 1) {
      const chunk = assembly.chunks.get(index)
      if (!chunk) throw new Error('BLE handshake assembly is incomplete')
      message.set(chunk, offset)
      offset += chunk.length
    }
    this.assemblies.delete(key)
    return message
  }

  cleanup(now: number = Date.now()): number {
    let removed = 0
    for (const [key, assembly] of this.assemblies) {
      if (now - assembly.createdAt > ASSEMBLY_TIMEOUT_MS) {
        this.assemblies.delete(key)
        removed += 1
      }
    }
    return removed
  }

  removePeer(peerId: string): void {
    for (const [key, assembly] of this.assemblies) {
      if (assembly.peerId === peerId) this.assemblies.delete(key)
    }
  }

  reset(): void {
    this.assemblies.clear()
  }
}

export const BLE_HANDSHAKE_HEADER_BYTES = HEADER_BYTES
