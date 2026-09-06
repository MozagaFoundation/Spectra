/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { ChatMessage } from '@/lib/types'
import type {
  BLEOutboundDeliveryEvent,
  BLEOutboundDeliveryFailureReason,
} from '../bluetooth/types'

export const BLE_DELIVERY_HINT_KEYS = [
  'Sending nearby',
  'Queued nearby',
  'Delivered',
  'Nearby delivery expired',
  'Nearby retry limit reached',
  'Nearby queue full',
  'Nearby delivery interrupted',
  'Nearby receipt timed out',
  'Nearby transmission failed',
  'Nearby delivery failed',
] as const

export type BLEDeliveryHintKey = (typeof BLE_DELIVERY_HINT_KEYS)[number]

export interface BLEDeliveryProjection {
  status: NonNullable<ChatMessage['status']>
  deliveryStage: NonNullable<ChatMessage['deliveryStage']>
  deliveryHint: BLEDeliveryHintKey
}

const failureHints: Record<BLEOutboundDeliveryFailureReason, BLEDeliveryHintKey> = {
  expired: 'Nearby delivery expired',
  max_attempts: 'Nearby retry limit reached',
  queue_full: 'Nearby queue full',
  interrupted: 'Nearby delivery interrupted',
  receipt_timeout: 'Nearby receipt timed out',
  transmission_failed: 'Nearby transmission failed',
}

export function projectBLEOutboundDelivery(
  event: BLEOutboundDeliveryEvent,
  currentStatus: ChatMessage['status'] | undefined,
): BLEDeliveryProjection | null {
  if (currentStatus === 'read') return null
  if (currentStatus === 'delivered' && event.state !== 'delivered') return null

  switch (event.state) {
    case 'pending':
      return {
        status: 'sending',
        deliveryStage: 'relaying',
        deliveryHint: 'Sending nearby',
      }
    case 'stored':
      return {
        status: 'sending',
        deliveryStage: 'queued',
        deliveryHint: 'Queued nearby',
      }
    case 'delivered':
      if (currentStatus === 'delivered') return null
      return {
        status: 'delivered',
        deliveryStage: 'delivered',
        deliveryHint: 'Delivered',
      }
    case 'failed':
      return {
        status: 'failed',
        deliveryStage: 'failed',
        deliveryHint: event.failureReason
          ? failureHints[event.failureReason]
          : 'Nearby delivery failed',
      }
  }
}
