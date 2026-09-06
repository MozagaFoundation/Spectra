/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

/** Public API for the BLE mesh transport layer. */

export {
  initialize,
  shutdown,
  sendViaBLE,
  getRoute,
  getStatus,
  getStats,
  getConfig,
  updateConfig,
  isContactNearby,
  isInternetAvailable,
  setInternetAvailable,
  isInitialized,
  isBLEEnabled,
  addEventListener,
  onNearbyContactsChanged,
  getNearbyContacts,
  updateKnownContacts,
  ensureRouteCapability,
  acceptRouteCapability,
  runSecureBLEDiagnostics,
  type BLETransportKnownIdentity,
  type BLEEnsuredRouteCapability,
} from './transportManager'

export {
  type BLEMeshConfig,
  type BLEMeshStatus,
  type TransportRoute,
  type TransportDecision,
  type BLEMeshEvent,
  type BLEMeshEventCallback,
  type BLEOutboundDeliveryEvent,
  type BLEOutboundDeliveryFailureReason,
  type BLEOutboundDeliveryState,
  type MessageReceivedData,
  DEFAULT_BLE_MESH_CONFIG,
} from './types'

export {
  type NearbyContact,
} from './peerRegistry'

export {
  describeBLEDiagnosticCause,
  describeBLEDiagnosticFailure,
  describeBLEDiagnosticStopStage,
  describeBLEHandshakeProgressLabel,
  formatBLEDiagnosticReport,
  getBLEDiagnosticSnapshot,
  hasReachedBLEDiagnosticStage,
  isBLESessionDiagnosticFailure,
  onBLEDiagnosticsChanged,
  type BLEDiagnosticFailure,
  type BLEDiagnosticFailureCause,
  type BLEDiagnosticBudgetSource,
  type BLEDiagnosticSnapshot,
  type BLEDiagnosticStage,
  type BLEHandshakeProgress,
  type BLENoiseSelfTestStatus,
} from './diagnostics'

export {
  getBLEMessageDiagnosticSnapshot,
  onBLEMessageDiagnosticsChanged,
  type BLEMessageDiagnosticDirection,
  type BLEMessageDiagnosticFailure,
  type BLEMessageDiagnosticSnapshot,
  type BLEMessageDiagnosticStage,
} from './messageDiagnostics'
