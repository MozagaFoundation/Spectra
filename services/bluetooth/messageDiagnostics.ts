/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

export type BLEMessageDiagnosticDirection = 'outbound' | 'inbound'

export type BLEMessageDiagnosticStage =
  | 'route_selected'
  | 'route_pair_ready'
  | 'transmitting'
  | 'transmitted'
  | 'awaiting_receipt'
  | 'assembling'
  | 'envelope_verified'
  | 'chat_processing'
  | 'persisted'
  | 'sending_receipt'
  | 'receipt_sent'
  | 'receipt_received'
  | 'failed'

export type BLEMessageDiagnosticFailure =
  | 'route_capability_unavailable'
  | 'receipt_limit_reached'
  | 'route_capability_expiring'
  | 'message_encoding_failed'
  | 'authenticated_link_unavailable'
  | 'message_transmission_failed'
  | 'direct_frame_rejected'
  | 'route_not_recognized'
  | 'envelope_authentication_failed'
  | 'encrypted_message_invalid'
  | 'chat_processing_failed'
  | 'receipt_send_failed'
  | 'receipt_timeout'

export interface BLEMessageDiagnosticSnapshot {
  peerIdentityId: string
  operationId: number
  direction: BLEMessageDiagnosticDirection
  stage: BLEMessageDiagnosticStage
  failure: BLEMessageDiagnosticFailure | null
  startedAt: number
  updatedAt: number
}

const MAX_TRACKED_PEERS = 32
const snapshots = new Map<string, BLEMessageDiagnosticSnapshot>()
const listeners = new Set<(snapshot: BLEMessageDiagnosticSnapshot) => void>()
let nextOperationId = 1
let lifecycleGeneration = 1

function allocateOperationId(): number {
  const operationId = nextOperationId
  nextOperationId = nextOperationId >= Number.MAX_SAFE_INTEGER
    ? 1
    : nextOperationId + 1
  return operationId
}

function publish(snapshot: BLEMessageDiagnosticSnapshot): void {
  const current = snapshots.get(snapshot.peerIdentityId)
  if (
    current
    && current.operationId === snapshot.operationId
    && current.stage === snapshot.stage
    && current.failure === snapshot.failure
  ) return
  snapshots.delete(snapshot.peerIdentityId)
  snapshots.set(snapshot.peerIdentityId, snapshot)
  while (snapshots.size > MAX_TRACKED_PEERS) {
    const oldest = snapshots.keys().next().value
    if (typeof oldest !== 'string') break
    snapshots.delete(oldest)
  }
  for (const listener of listeners) {
    try {
      listener({ ...snapshot })
    } catch {
      // Diagnostic observers cannot affect transport.
    }
  }
}

export function beginBLEMessageDiagnostics(
  peerIdentityId: string,
  direction: BLEMessageDiagnosticDirection,
  stage: BLEMessageDiagnosticStage,
  now = Date.now(),
  generation = lifecycleGeneration,
): number {
  if (!peerIdentityId || generation !== lifecycleGeneration) return 0
  const operationId = allocateOperationId()
  publish({
    peerIdentityId,
    operationId,
    direction,
    stage,
    failure: null,
    startedAt: now,
    updatedAt: now,
  })
  return operationId
}

export function recordBLEMessageDiagnosticStage(
  peerIdentityId: string,
  direction: BLEMessageDiagnosticDirection,
  stage: BLEMessageDiagnosticStage,
  operationId?: number,
  now = Date.now(),
): void {
  const current = snapshots.get(peerIdentityId)
  if (operationId != null && current?.operationId !== operationId) return
  if (!current || current.direction !== direction) {
    beginBLEMessageDiagnostics(peerIdentityId, direction, stage, now)
    return
  }
  publish({
    ...current,
    stage,
    failure: null,
    updatedAt: now,
  })
}

export function recordBLEMessageDiagnosticFailure(
  peerIdentityId: string,
  direction: BLEMessageDiagnosticDirection,
  failure: BLEMessageDiagnosticFailure,
  operationId?: number,
  now = Date.now(),
): void {
  const current = snapshots.get(peerIdentityId)
  if (operationId != null && current?.operationId !== operationId) return
  const activeOperationId = current?.direction === direction
    ? current.operationId
    : allocateOperationId()
  publish({
    peerIdentityId,
    operationId: activeOperationId,
    direction,
    stage: 'failed',
    failure,
    startedAt: current?.direction === direction ? current.startedAt : now,
    updatedAt: now,
  })
}

export function getBLEMessageDiagnosticSnapshot(
  peerIdentityId: string,
): BLEMessageDiagnosticSnapshot | null {
  const snapshot = snapshots.get(peerIdentityId)
  return snapshot ? { ...snapshot } : null
}

export function onBLEMessageDiagnosticsChanged(
  listener: (snapshot: BLEMessageDiagnosticSnapshot) => void,
): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function clearBLEMessageDiagnostics(): void {
  snapshots.clear()
  lifecycleGeneration = lifecycleGeneration >= Number.MAX_SAFE_INTEGER
    ? 1
    : lifecycleGeneration + 1
}

export function getBLEMessageDiagnosticGeneration(): number {
  return lifecycleGeneration
}
