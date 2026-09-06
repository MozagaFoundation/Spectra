/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

/** Types for the BLE mesh transport layer. */

import type { EncryptedMessage, PublicKeyBundle } from '@spectra/core-crypto'

// BLE service UUIDs

export const BLE_SERVICE_UUID = '7E57A100-2F5A-4E10-9C6B-61D4D8A2C001'
export const BLE_CHARACTERISTIC_WRITE_UUID = '7E57A100-2F5A-4E10-9C6B-61D4D8A2C002'
export const BLE_CHARACTERISTIC_NOTIFY_UUID = '7E57A100-2F5A-4E10-9C6B-61D4D8A2C003'

// BLE v2 transport constants

export const PROTOCOL_VERSION = 2
export const DEFAULT_TTL = 5
export const MAX_TTL = 7
export const BLE_IOS_COMPAT_MTU = 185
export const BLE_FALLBACK_VALUE_BYTES = 182
export const BLE_FRAGMENT_SPACING_MS = 20
export const BLE_IDLE_SCAN_DUTY_MS = 5_000
export const BLE_IDLE_SCAN_PAUSE_MS = 10_000

// Peers

export type BLEPeerConnectionState = 'discovered' | 'connecting' | 'connected' | 'disconnected'

export interface BLEPeer {
  deviceId: string
  displayName: string | null
  connectionState: BLEPeerConnectionState
  rssi: number
  lastSeenAt: number
  discoveredAt: number
  isPeripheral: boolean
  isCentral: boolean
  messagesSent: number
  messagesReceived: number
}

// Transport manager

export type TransportRoute = 'internet' | 'ble' | 'ble-nearby'

export type BLEMeshStatus =
  | 'disabled'
  | 'initializing'
  | 'scanning'
  | 'advertising'
  | 'active' // scanning + advertising
  | 'error'
  | 'permission_denied'
  | 'bluetooth_off'

export interface TransportDecision {
  route: TransportRoute
  reason: string
  bleAvailable: boolean
  internetAvailable: boolean
  peerNearby: boolean
}

export interface BLEMeshConfig {
  enabled: boolean
  maxTTL: number
  scanDutyMs: number
  scanPauseMs: number
  storeForwardEnabled: boolean
  storeForwardMaxMessages: number
  storeForwardTTLMs: number
  relayEnabled: boolean
  maxConcurrentConnections: number
}

export const DEFAULT_BLE_MESH_CONFIG: BLEMeshConfig = {
  enabled: false,
  maxTTL: DEFAULT_TTL,
  scanDutyMs: BLE_IDLE_SCAN_DUTY_MS,
  scanPauseMs: BLE_IDLE_SCAN_PAUSE_MS,
  storeForwardEnabled: false,
  storeForwardMaxMessages: 128,
  storeForwardTTLMs: 24 * 60 * 60 * 1000, // 24 hours
  relayEnabled: false,
  maxConcurrentConnections: 6,
}

// Events

export type BLEMeshEventType =
  | 'peer:discovered'
  | 'peer:connected'
  | 'peer:disconnected'
  | 'peer:lost'
  | 'message:received'
  | 'message:delivery'
  | 'mesh:status_changed'
  | 'mesh:error'
  | 'internet:changed'
  | 'bundle:received'
  | 'bundle:requested'

export interface BLEMeshEvent<T = unknown> {
  type: BLEMeshEventType
  data: T
  timestamp: number
}

export interface MessageReceivedData {
  senderId: string
  encryptedMessage: EncryptedMessage
  viaMesh: boolean
  hopCount: number
}

export interface PeerDiscoveredData {
  peer: BLEPeer
}

export interface BundleReceivedData {
  fromIdentityId: string
  bundle: PublicKeyBundle
}

export type BLEOutboundDeliveryState =
  | 'pending'
  | 'stored'
  | 'delivered'
  | 'failed'

export type BLEOutboundDeliveryFailureReason =
  | 'interrupted'
  | 'expired'
  | 'max_attempts'
  | 'queue_full'
  | 'transmission_failed'
  | 'receipt_timeout'

export interface BLEOutboundDeliveryEvent {
  localMessageId: string
  state: BLEOutboundDeliveryState
  failureReason: BLEOutboundDeliveryFailureReason | null
  attempts: number
  expiresAt: number
  updatedAt: number
  sequence: number
}

// Callbacks

export type BLEMeshEventCallback = (event: BLEMeshEvent) => void
