/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { generateRandomBytes } from '@spectra/core-crypto'

const MAGIC = new Uint8Array([0x53, 0x44])
const VERSION = 2
const DATA_TYPE = 0x01
const DATA_HEADER_BYTES = 28
const MESSAGE_ID_BYTES = 16
const MAX_DIRECT_MESSAGE_BYTES = 256 * 1024
const MAX_FRAGMENTS = 2048
const MAX_ASSEMBLIES = 8
const MAX_ASSEMBLIES_PER_PEER = 2
const MAX_BUFFERED_BYTES = 512 * 1024
const ASSEMBLY_TTL_MS = 30_000

export interface DirectDataFragment {
  messageId: Uint8Array
  index: number
  total: number
  totalLength: number
  payload: Uint8Array
}

interface Assembly {
  peerId: string
  messageId: Uint8Array
  total: number
  totalLength: number
  fragments: Map<number, Uint8Array>
  receivedBytes: number
  createdAt: number
}

function messageKey(peerId: string, messageId: Uint8Array): string {
  return `${peerId}:${Array.from(
    messageId,
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('')}`
}

function assertMessageId(messageId: Uint8Array): void {
  if (messageId.length !== MESSAGE_ID_BYTES) {
    throw new Error('BLE direct message ID must be 16 bytes')
  }
}

export function createDirectMessageId(): Uint8Array {
  return generateRandomBytes(MESSAGE_ID_BYTES)
}

export function encodeDirectDataFrames(options: {
  messageId?: Uint8Array
  message: Uint8Array
  maxFramePayload: number
}): Uint8Array[] {
  const messageId = options.messageId ?? createDirectMessageId()
  assertMessageId(messageId)
  if (
    options.message.length === 0
    || options.message.length > MAX_DIRECT_MESSAGE_BYTES
    || options.maxFramePayload <= DATA_HEADER_BYTES
  ) {
    throw new Error('BLE direct message length is invalid')
  }

  const chunkBytes = options.maxFramePayload - DATA_HEADER_BYTES
  const total = Math.ceil(options.message.length / chunkBytes)
  if (total > MAX_FRAGMENTS) throw new Error('BLE direct message is too fragmented')

  return Array.from({ length: total }, (_, index) => {
    const chunk = options.message.slice(index * chunkBytes, (index + 1) * chunkBytes)
    const frame = new Uint8Array(DATA_HEADER_BYTES + chunk.length)
    frame.set(MAGIC, 0)
    frame[2] = VERSION
    frame[3] = DATA_TYPE
    frame.set(messageId, 4)
    const view = new DataView(frame.buffer)
    view.setUint16(20, index, false)
    view.setUint16(22, total, false)
    view.setUint32(24, options.message.length, false)
    frame.set(chunk, DATA_HEADER_BYTES)
    return frame
  })
}

export function decodeDirectDataFrame(frame: Uint8Array): DirectDataFragment {
  if (
    frame.length <= DATA_HEADER_BYTES
    || frame[0] !== MAGIC[0]
    || frame[1] !== MAGIC[1]
    || frame[2] !== VERSION
    || frame[3] !== DATA_TYPE
  ) {
    throw new Error('Invalid BLE direct data frame')
  }
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength)
  const index = view.getUint16(20, false)
  const total = view.getUint16(22, false)
  const totalLength = view.getUint32(24, false)
  if (
    total === 0
    || total > MAX_FRAGMENTS
    || index >= total
    || totalLength === 0
    || totalLength > MAX_DIRECT_MESSAGE_BYTES
    || frame.length - DATA_HEADER_BYTES > totalLength
  ) {
    throw new Error('Invalid BLE direct data metadata')
  }
  return {
    messageId: frame.slice(4, 20),
    index,
    total,
    totalLength,
    payload: frame.slice(DATA_HEADER_BYTES),
  }
}

export function isDirectDataFrame(frame: Uint8Array): boolean {
  return frame.length >= 4 && frame[0] === MAGIC[0] && frame[1] === MAGIC[1]
    && frame[2] === VERSION && frame[3] === DATA_TYPE
}

export class DirectFrameAssembler {
  private readonly assemblies = new Map<string, Assembly>()
  private bufferedBytes = 0

  accept(peerId: string, encoded: Uint8Array, now: number = Date.now()): {
    messageId: Uint8Array
    message: Uint8Array
  } | null {
    this.cleanup(now)
    const frame = decodeDirectDataFrame(encoded)
    const key = messageKey(peerId, frame.messageId)
    let assembly = this.assemblies.get(key)
    if (!assembly) {
      const peerAssemblyCount = [...this.assemblies.values()]
        .filter((entry) => entry.peerId === peerId).length
      if (
        this.assemblies.size >= MAX_ASSEMBLIES
        || peerAssemblyCount >= MAX_ASSEMBLIES_PER_PEER
        || this.bufferedBytes + frame.totalLength > MAX_BUFFERED_BYTES
      ) {
        throw new Error('BLE direct assembly resource limit reached')
      }
      assembly = {
        peerId,
        messageId: frame.messageId,
        total: frame.total,
        totalLength: frame.totalLength,
        fragments: new Map(),
        receivedBytes: 0,
        createdAt: now,
      }
      this.assemblies.set(key, assembly)
      this.bufferedBytes += frame.totalLength
    } else if (
      assembly.total !== frame.total
      || assembly.totalLength !== frame.totalLength
    ) {
      this.remove(key)
      throw new Error('BLE direct fragment metadata mismatch')
    }

    const existing = assembly.fragments.get(frame.index)
    if (existing) {
      if (
        existing.length !== frame.payload.length
        || existing.some((byte, index) => byte !== frame.payload[index])
      ) {
        this.remove(key)
        throw new Error('BLE direct duplicate fragment mismatch')
      }
      return null
    }
    if (assembly.receivedBytes + frame.payload.length > assembly.totalLength) {
      this.remove(key)
      throw new Error('BLE direct assembly exceeds declared length')
    }
    assembly.fragments.set(frame.index, frame.payload)
    assembly.receivedBytes += frame.payload.length
    if (assembly.fragments.size !== assembly.total) return null
    if (assembly.receivedBytes !== assembly.totalLength) {
      this.remove(key)
      throw new Error('BLE direct assembly length mismatch')
    }

    const message = new Uint8Array(assembly.totalLength)
    let offset = 0
    for (let index = 0; index < assembly.total; index += 1) {
      const fragment = assembly.fragments.get(index)
      if (!fragment) throw new Error('BLE direct assembly is incomplete')
      message.set(fragment, offset)
      offset += fragment.length
    }
    const messageId = assembly.messageId.slice()
    this.remove(key)
    return { messageId, message }
  }

  cleanup(now: number = Date.now()): void {
    for (const [key, assembly] of this.assemblies) {
      if (now - assembly.createdAt > ASSEMBLY_TTL_MS) this.remove(key)
    }
  }

  reset(): void {
    this.assemblies.clear()
    this.bufferedBytes = 0
  }

  private remove(key: string): void {
    const assembly = this.assemblies.get(key)
    if (!assembly) return
    this.bufferedBytes = Math.max(0, this.bufferedBytes - assembly.totalLength)
    this.assemblies.delete(key)
  }
}
