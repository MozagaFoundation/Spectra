/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'
import type { BLEOutboundDeliveryEvent } from '../bluetooth/types'
import { projectBLEOutboundDelivery } from './bleDeliveryProjection'

function event(
  state: BLEOutboundDeliveryEvent['state'],
  failureReason: BLEOutboundDeliveryEvent['failureReason'] = null,
): BLEOutboundDeliveryEvent {
  return {
    localMessageId: 'message-1',
    state,
    failureReason,
    attempts: 1,
    expiresAt: Date.now() + 60_000,
    updatedAt: Date.now(),
    sequence: 1,
  }
}

describe('BLE delivery projection', () => {
  it('maps pending and stored delivery without claiming recipient delivery', () => {
    expect(projectBLEOutboundDelivery(event('pending'), 'sent')).toEqual({
      status: 'sending',
      deliveryStage: 'relaying',
      deliveryHint: 'Sending nearby',
    })
    expect(projectBLEOutboundDelivery(event('stored'), 'sent')).toEqual({
      status: 'sending',
      deliveryStage: 'queued',
      deliveryHint: 'Queued nearby',
    })
  })

  it('maps authenticated delivery to delivered', () => {
    expect(projectBLEOutboundDelivery(event('delivered'), 'failed')).toEqual({
      status: 'delivered',
      deliveryStage: 'delivered',
      deliveryHint: 'Delivered',
    })
  })

  it('preserves terminal recipient states from later lower-rank events', () => {
    expect(projectBLEOutboundDelivery(event('failed', 'expired'), 'delivered')).toBeNull()
    expect(projectBLEOutboundDelivery(event('stored'), 'read')).toBeNull()
  })

  it('uses specific failure hints', () => {
    expect(projectBLEOutboundDelivery(event('failed', 'receipt_timeout'), 'sending')).toEqual({
      status: 'failed',
      deliveryStage: 'failed',
      deliveryHint: 'Nearby receipt timed out',
    })
  })
})
