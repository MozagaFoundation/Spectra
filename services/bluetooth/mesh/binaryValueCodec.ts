/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

const TAG_NULL = 0
const TAG_FALSE = 1
const TAG_TRUE = 2
const TAG_NUMBER = 3
const TAG_STRING = 4
const TAG_BYTES = 5
const TAG_ARRAY = 6
const TAG_OBJECT = 7

const MAX_WIRE_BYTES = 256 * 1024
const MAX_DEPTH = 16
const MAX_CONTAINER_ENTRIES = 16_384
const MAX_TOTAL_VALUES = 65_536

function concat(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.length, 0)
  if (length > MAX_WIRE_BYTES) throw new Error('BLE binary value exceeds the wire limit')
  const result = new Uint8Array(length)
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

function withLength(tag: number, data: Uint8Array): Uint8Array {
  const encoded = new Uint8Array(5 + data.length)
  encoded[0] = tag
  new DataView(encoded.buffer).setUint32(1, data.length, false)
  encoded.set(data, 5)
  return encoded
}

function encodeValue(value: unknown, depth: number): Uint8Array {
  if (depth > MAX_DEPTH) throw new Error('BLE binary value nesting is too deep')
  if (value === null) return Uint8Array.of(TAG_NULL)
  if (value === false) return Uint8Array.of(TAG_FALSE)
  if (value === true) return Uint8Array.of(TAG_TRUE)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('BLE binary number is invalid')
    const encoded = new Uint8Array(9)
    encoded[0] = TAG_NUMBER
    new DataView(encoded.buffer).setFloat64(1, value, false)
    return encoded
  }
  if (typeof value === 'string') {
    return withLength(TAG_STRING, new TextEncoder().encode(value))
  }
  if (value instanceof Uint8Array) {
    return withLength(TAG_BYTES, value)
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_CONTAINER_ENTRIES) {
      throw new Error('BLE binary array is too large')
    }
    const header = new Uint8Array(5)
    header[0] = TAG_ARRAY
    new DataView(header.buffer).setUint32(1, value.length, false)
    return concat([header, ...value.map((entry) => encodeValue(entry, depth + 1))])
  }
  if (typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error('BLE binary value must be a plain object')
    }
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
    if (entries.length > MAX_CONTAINER_ENTRIES) {
      throw new Error('BLE binary object is too large')
    }
    const header = new Uint8Array(5)
    header[0] = TAG_OBJECT
    new DataView(header.buffer).setUint32(1, entries.length, false)
    const parts: Uint8Array[] = [header]
    for (const [key, entry] of entries) {
      parts.push(withLength(TAG_STRING, new TextEncoder().encode(key)))
      parts.push(encodeValue(entry, depth + 1))
    }
    return concat(parts)
  }
  throw new Error('BLE binary value type is unsupported')
}

class Reader {
  private offset = 0
  private valuesRead = 0

  constructor(private readonly data: Uint8Array) {
    if (data.length === 0 || data.length > MAX_WIRE_BYTES) {
      throw new Error('BLE binary value length is invalid')
    }
  }

  read(depth = 0): unknown {
    if (depth > MAX_DEPTH) throw new Error('BLE binary value nesting is too deep')
    this.valuesRead += 1
    if (this.valuesRead > MAX_TOTAL_VALUES) {
      throw new Error('BLE binary value count exceeds the limit')
    }
    const tag = this.u8()
    if (tag === TAG_NULL) return null
    if (tag === TAG_FALSE) return false
    if (tag === TAG_TRUE) return true
    if (tag === TAG_NUMBER) {
      const bytes = this.bytes(8)
      const value = new DataView(
        bytes.buffer,
        bytes.byteOffset,
        bytes.byteLength,
      ).getFloat64(0, false)
      if (!Number.isFinite(value)) throw new Error('BLE binary number is invalid')
      return value
    }
    if (tag === TAG_STRING) return this.string()
    if (tag === TAG_BYTES) return this.bytes(this.u32())
    if (tag === TAG_ARRAY) {
      const count = this.containerCount()
      return Array.from({ length: count }, () => this.read(depth + 1))
    }
    if (tag === TAG_OBJECT) {
      const count = this.containerCount()
      const result: Record<string, unknown> = Object.create(null)
      for (let index = 0; index < count; index += 1) {
        if (this.u8() !== TAG_STRING) throw new Error('BLE binary object key is invalid')
        const key = this.string()
        if (Object.prototype.hasOwnProperty.call(result, key)) {
          throw new Error('BLE binary object has a duplicate key')
        }
        result[key] = this.read(depth + 1)
      }
      return result
    }
    throw new Error('BLE binary value tag is unsupported')
  }

  finish(): void {
    if (this.offset !== this.data.length) {
      throw new Error('BLE binary value has trailing bytes')
    }
  }

  private containerCount(): number {
    const count = this.u32()
    if (count > MAX_CONTAINER_ENTRIES) {
      throw new Error('BLE binary container is too large')
    }
    return count
  }

  private string(): string {
    return new TextDecoder('utf-8', { fatal: true }).decode(this.bytes(this.u32()))
  }

  private u8(): number {
    if (this.offset >= this.data.length) throw new Error('BLE binary value is truncated')
    return this.data[this.offset++]
  }

  private u32(): number {
    const bytes = this.bytes(4)
    return new DataView(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    ).getUint32(0, false)
  }

  private bytes(length: number): Uint8Array {
    if (!Number.isSafeInteger(length) || length < 0 || this.offset + length > this.data.length) {
      throw new Error('BLE binary value length is invalid')
    }
    const value = this.data.slice(this.offset, this.offset + length)
    this.offset += length
    return value
  }
}

export function encodeBinaryValue(value: unknown): Uint8Array {
  return encodeValue(value, 0)
}

export function decodeBinaryValue(data: Uint8Array): unknown {
  const reader = new Reader(data)
  const value = reader.read()
  reader.finish()
  return value
}
