/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { bytesToHex } from '../crypto/utils'
import {
  BLE_V2_ENVELOPE_ID_BYTES,
  BLE_V2_MAX_REPLAY_IDS,
} from './constants'
import {
  assertByteLength,
  assertNonZeroBytes,
  assertSafeTimestamp,
} from './binary'

export class BleEnvelopeReplayCache {
  private readonly entries = new Map<string, number>()

  constructor(private readonly maxEntries: number = BLE_V2_MAX_REPLAY_IDS) {
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 1
      || maxEntries > BLE_V2_MAX_REPLAY_IDS) {
      throw new Error('BLE replay cache capacity is invalid')
    }
  }

  checkAndRecord(
    envelopeId: Uint8Array,
    expiresAt: number,
    now: number = Date.now(),
  ): boolean {
    assertByteLength(envelopeId, BLE_V2_ENVELOPE_ID_BYTES, 'BLE envelope ID')
    assertNonZeroBytes(envelopeId, 'BLE envelope ID')
    assertSafeTimestamp(expiresAt, 'BLE replay expiry')
    assertSafeTimestamp(now, 'Current time')
    this.prune(now)
    if (expiresAt <= now) {
      return false
    }
    const key = bytesToHex(envelopeId)
    if (this.entries.has(key) || this.entries.size >= this.maxEntries) {
      return false
    }
    this.entries.set(key, expiresAt)
    return true
  }

  has(envelopeId: Uint8Array, now: number = Date.now()): boolean {
    assertByteLength(envelopeId, BLE_V2_ENVELOPE_ID_BYTES, 'BLE envelope ID')
    assertNonZeroBytes(envelopeId, 'BLE envelope ID')
    assertSafeTimestamp(now, 'Current time')
    this.prune(now)
    return this.entries.has(bytesToHex(envelopeId))
  }

  clear(): void {
    this.entries.clear()
  }

  get size(): number {
    return this.entries.size
  }

  private prune(now: number): void {
    for (const [key, expiresAt] of this.entries) {
      if (expiresAt <= now) {
        this.entries.delete(key)
      }
    }
  }
}
