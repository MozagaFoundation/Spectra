/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { generateRandomBytes } from '@spectra/core-crypto'

const MAGIC = new Uint8Array([0x53, 0x42])
const VERSION = 2
const TRANSPORT_FRAME_TYPE = 0x10
const HEADER_BYTES = 20
const RECORD_ID_BYTES = 8
const MAX_TRANSPORT_BYTES = 8 * 1024
const MAX_TRANSPORT_FRAGMENTS = 128
const MAX_ASSEMBLIES = 16
const MAX_ASSEMBLIES_PER_PEER = 4
const ASSEMBLY_TIMEOUT_MS = 10_000

interface TransportFrame {
  recordId: Uint8Array
  index: number
  total: number
  totalLength: number
  chunk: Uint8Array
}

interface Assembly {
  peerId: string
  key: string
  total: number
  totalLength: number
  chunks: Map<number, Uint8Array>
  receivedBytes: number
  createdAt: number
}

function idHex(id: Uint8Array): string {
  return Array.from(id, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function frameKey(peerId: string, id: Uint8Array): string {
  return `${peerId}:${idHex(id)}`
}

export function isTransportFrame(data: Uint8Array): boolean {
  return data.length > HEADER_BYTES
    && data[0] === MAGIC[0]
    && data[1] === MAGIC[1]
    && data[2] === VERSION
    && data[3] === TRANSPORT_FRAME_TYPE
}

export function encodeTransportFrames(options: {
  message: Uint8Array
  maxFrameBytes: number
  recordId?: Uint8Array
}): Uint8Array[] {
  const {
    message,
    maxFrameBytes,
    recordId = generateRandomBytes(RECORD_ID_BYTES),
  } = options
  if (recordId.length !== RECORD_ID_BYTES) {
    throw new Error('BLE transport record ID must be 8 bytes')
  }
  if (message.length === 0 || message.length > MAX_TRANSPORT_BYTES) {
    throw new Error('BLE transport message length is invalid')
  }
  if (!Number.isInteger(maxFrameBytes) || maxFrameBytes <= HEADER_BYTES) {
    throw new Error('BLE transport frame budget is invalid')
  }

  const chunkBytes = maxFrameBytes - HEADER_BYTES
  const total = Math.ceil(message.length / chunkBytes)
  if (total > MAX_TRANSPORT_FRAGMENTS) {
    throw new Error('BLE transport message requires too many fragments')
  }

  return Array.from({ length: total }, (_, index) => {
    const chunk = message.slice(index * chunkBytes, (index + 1) * chunkBytes)
    const frame = new Uint8Array(HEADER_BYTES + chunk.length)
    frame.set(MAGIC, 0)
    frame[2] = VERSION
    frame[3] = TRANSPORT_FRAME_TYPE
    frame.set(recordId, 4)
    const view = new DataView(frame.buffer)
    view.setUint16(12, index, false)
    view.setUint16(14, total, false)
    view.setUint32(16, message.length, false)
    frame.set(chunk, HEADER_BYTES)
    return frame
  })
}

function decodeTransportFrame(data: Uint8Array): TransportFrame {
  if (!isTransportFrame(data)) {
    throw new Error('Invalid BLE transport frame')
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const index = view.getUint16(12, false)
  const total = view.getUint16(14, false)
  const totalLength = view.getUint32(16, false)
  if (
    total === 0
    || total > MAX_TRANSPORT_FRAGMENTS
    || index >= total
    || totalLength === 0
    || totalLength > MAX_TRANSPORT_BYTES
    || data.length - HEADER_BYTES > totalLength
  ) {
    throw new Error('Invalid BLE transport frame metadata')
  }
  return {
    recordId: data.slice(4, 12),
    index,
    total,
    totalLength,
    chunk: data.slice(HEADER_BYTES),
  }
}

export class TransportFrameAssembler {
  private readonly assemblies = new Map<string, Assembly>()

  accept(peerId: string, encoded: Uint8Array, now: number = Date.now()): Uint8Array | null {
    this.cleanup(now)
    const frame = decodeTransportFrame(encoded)
    const key = frameKey(peerId, frame.recordId)
    let assembly = this.assemblies.get(key)
    if (!assembly) {
      let peerAssemblies = 0
      for (const candidate of this.assemblies.values()) {
        if (candidate.peerId === peerId) peerAssemblies += 1
      }
      if (peerAssemblies >= MAX_ASSEMBLIES_PER_PEER) {
        throw new Error('BLE transport peer assembly limit reached')
      }
      if (this.assemblies.size >= MAX_ASSEMBLIES) {
        let oldest: Assembly | null = null
        for (const candidate of this.assemblies.values()) {
          if (!oldest || candidate.createdAt < oldest.createdAt) oldest = candidate
        }
        if (oldest) this.assemblies.delete(oldest.key)
      }
      assembly = {
        peerId,
        key,
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
    ) {
      this.assemblies.delete(key)
      throw new Error('BLE transport fragment metadata mismatch')
    }

    const existing = assembly.chunks.get(frame.index)
    if (existing) {
      if (
        existing.length !== frame.chunk.length
        || existing.some((byte, index) => byte !== frame.chunk[index])
      ) {
        this.assemblies.delete(key)
        throw new Error('BLE transport duplicate fragment mismatch')
      }
      return null
    }
    if (assembly.receivedBytes + frame.chunk.length > assembly.totalLength) {
      this.assemblies.delete(key)
      throw new Error('BLE transport assembly exceeds declared length')
    }

    assembly.chunks.set(frame.index, frame.chunk)
    assembly.receivedBytes += frame.chunk.length
    if (assembly.chunks.size !== assembly.total) return null
    if (assembly.receivedBytes !== assembly.totalLength) {
      this.assemblies.delete(key)
      throw new Error('BLE transport assembly length mismatch')
    }

    const message = new Uint8Array(assembly.totalLength)
    let offset = 0
    for (let index = 0; index < assembly.total; index += 1) {
      const chunk = assembly.chunks.get(index)
      if (!chunk) throw new Error('BLE transport assembly is incomplete')
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

export const BLE_TRANSPORT_HEADER_BYTES = HEADER_BYTES
