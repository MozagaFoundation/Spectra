/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import {
  BLE_V2_ALLOWED_ROUTE_FLAGS,
  BLE_V2_CLOCK_SKEW_MS,
  BLE_V2_MAX_ENVELOPE_LIFETIME_MS,
  BLE_V2_MAX_HOPS,
  BLE_V2_PROTOCOL_VERSION,
  BlePayloadType,
} from './constants'

export class BleBinaryWriter {
  private readonly bytes: Uint8Array
  private readonly view: DataView
  private offset = 0

  constructor(length: number) {
    if (!Number.isSafeInteger(length) || length < 0) {
      throw new Error('Invalid BLE binary length')
    }
    this.bytes = new Uint8Array(length)
    this.view = new DataView(this.bytes.buffer)
  }

  writeU8(value: number): void {
    this.ensure(1)
    this.view.setUint8(this.offset, value)
    this.offset += 1
  }

  writeU16(value: number): void {
    this.ensure(2)
    this.view.setUint16(this.offset, value)
    this.offset += 2
  }

  writeU32(value: number): void {
    this.ensure(4)
    this.view.setUint32(this.offset, value)
    this.offset += 4
  }

  writeU64(value: number): void {
    assertSafeTimestamp(value, 'BLE timestamp')
    this.ensure(8)
    this.view.setBigUint64(this.offset, BigInt(value))
    this.offset += 8
  }

  writeBytes(value: Uint8Array): void {
    this.ensure(value.length)
    this.bytes.set(value, this.offset)
    this.offset += value.length
  }

  finish(): Uint8Array {
    if (this.offset !== this.bytes.length) {
      throw new Error('BLE binary encoding length mismatch')
    }
    return this.bytes
  }

  private ensure(length: number): void {
    if (this.offset + length > this.bytes.length) {
      throw new Error('BLE binary encoding overflow')
    }
  }
}

export class BleBinaryReader {
  private readonly view: DataView
  private offset = 0

  constructor(private readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  }

  readU8(): number {
    this.ensure(1)
    const value = this.view.getUint8(this.offset)
    this.offset += 1
    return value
  }

  readU16(): number {
    this.ensure(2)
    const value = this.view.getUint16(this.offset)
    this.offset += 2
    return value
  }

  readU32(): number {
    this.ensure(4)
    const value = this.view.getUint32(this.offset)
    this.offset += 4
    return value
  }

  readU64(): number {
    this.ensure(8)
    const value = this.view.getBigUint64(this.offset)
    this.offset += 8
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error('BLE timestamp exceeds the safe integer range')
    }
    return Number(value)
  }

  readBytes(length: number): Uint8Array {
    if (!Number.isSafeInteger(length) || length < 0) {
      throw new Error('Invalid BLE field length')
    }
    this.ensure(length)
    const value = this.bytes.slice(this.offset, this.offset + length)
    this.offset += length
    return value
  }

  finish(): void {
    if (this.offset !== this.bytes.length) {
      throw new Error('BLE binary input has trailing bytes')
    }
  }

  private ensure(length: number): void {
    if (this.offset + length > this.bytes.length) {
      throw new Error('BLE binary input is truncated')
    }
  }
}

export function assertByteLength(value: Uint8Array, length: number, label: string): void {
  if (!(value instanceof Uint8Array) || value.length !== length) {
    throw new Error(`${label} must be ${length} bytes`)
  }
}

export function assertNonZeroBytes(value: Uint8Array, label: string): void {
  let aggregate = 0
  for (const byte of value) {
    aggregate |= byte
  }
  if (aggregate === 0) {
    throw new Error(`${label} must not be all zero`)
  }
}

export function assertU32(value: number, label: string, allowZero: boolean = true): void {
  const minimum = allowZero ? 0 : 1
  if (!Number.isSafeInteger(value) || value < minimum || value > 0xffffffff) {
    throw new Error(`${label} is invalid`)
  }
}

export function assertSafeTimestamp(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} is invalid`)
  }
}

export function assertTimeWindow(
  issuedAt: number,
  expiresAt: number,
  maximumLifetimeMs: number,
  label: string,
): void {
  assertSafeTimestamp(issuedAt, `${label} issue time`)
  assertSafeTimestamp(expiresAt, `${label} expiry time`)
  if (expiresAt <= issuedAt || expiresAt - issuedAt > maximumLifetimeMs) {
    throw new Error(`${label} validity window is invalid`)
  }
}

export function assertCurrentlyValid(
  issuedAt: number,
  expiresAt: number,
  now: number,
  label: string,
  clockSkewMs: number = BLE_V2_CLOCK_SKEW_MS,
): void {
  assertSafeTimestamp(now, 'Current time')
  if (!Number.isSafeInteger(clockSkewMs) || clockSkewMs < 0) {
    throw new Error('BLE clock skew is invalid')
  }
  if (issuedAt > now + clockSkewMs || expiresAt <= now) {
    throw new Error(`${label} is not currently valid`)
  }
}

export function assertRouteFields(
  version: number,
  payloadType: number,
  flags: number,
  maxHops: number,
  issuedAt: number,
  expiresAt: number,
): asserts payloadType is BlePayloadType {
  if (version !== BLE_V2_PROTOCOL_VERSION) {
    throw new Error('BLE route version is not supported')
  }
  if (payloadType !== BlePayloadType.ChatCiphertext && payloadType !== BlePayloadType.HiddenControl) {
    throw new Error('BLE payload type is not supported')
  }
  if (!Number.isSafeInteger(flags) || flags < 0 || flags > 0xff
    || (flags & ~BLE_V2_ALLOWED_ROUTE_FLAGS) !== 0) {
    throw new Error('BLE route flags are invalid')
  }
  if (!Number.isSafeInteger(maxHops) || maxHops < 0 || maxHops > BLE_V2_MAX_HOPS) {
    throw new Error('BLE route hop limit is invalid')
  }
  assertTimeWindow(
    issuedAt,
    expiresAt,
    BLE_V2_MAX_ENVELOPE_LIFETIME_MS,
    'BLE route envelope',
  )
}
