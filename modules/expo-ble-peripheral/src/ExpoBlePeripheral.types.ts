/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

export type PeripheralEventType =
  | 'advertisingStarted'
  | 'advertisingStopped'
  | 'bluetoothOff'
  | 'unauthorized'
  | 'unsupported'
  | 'centralConnected'
  | 'centralDisconnected'
  | 'centralSubscribed'
  | 'centralUnsubscribed'
  | 'dataReceived'
  | 'stateChanged'
  | 'error'

export interface PeripheralEventPayload {
  type: PeripheralEventType
  centralId?: string
  data?: string // base64 encoded
  error?: string
  state?: string
  maxPayloadBytes?: number
}
