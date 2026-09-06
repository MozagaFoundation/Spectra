/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

export type BLEDiagnosticStage =
  | 'idle'
  | 'radio_starting'
  | 'radio_active'
  | 'peer_discovered'
  | 'gatt_connecting'
  | 'gatt_ready'
  | 'noise_handshaking'
  | 'noise_secured'
  | 'identity_authenticated'
  | 'contact_admitted'
  | 'route_ready'

export type BLEDiagnosticFailure =
  | 'radio_unavailable'
  | 'advertising_failed'
  | 'scan_failed'
  | 'peer_not_discovered'
  | 'gatt_connection_failed'
  | 'gatt_service_missing'
  | 'gatt_subscription_timeout'
  | 'gatt_timeout'
  | 'gatt_mtu_too_small'
  | 'noise_handshake_failed'
  | 'credential_rejected'
  | 'contact_not_admitted'
  | 'contact_admission_timeout'
  | 'capability_failed'
  | 'route_timeout'
  | 'transport_failed'
  | 'noise_self_test_failed'

export type BLENoiseSelfTestStatus = 'not_run' | 'running' | 'passed' | 'failed'

export type BLEDiagnosticBudgetSource =
  | 'unknown'
  | 'ios_fallback'
  | 'negotiated'
  | 'fallback'
  | 'peripheral_reported'

export type BLEHandshakeProgress =
  | 'not_started'
  | 'step_1_sent'
  | 'step_1_received'
  | 'step_2_sent'
  | 'step_2_received'
  | 'step_3_sent'
  | 'step_3_received'
  | 'transport_keys_ready'
  | 'credential_authenticated'

export type BLEDiagnosticFailureCause =
  | 'handshake_timeout'
  | 'handshake_send_failed'
  | 'handshake_progress_timeout'
  | 'handshake_malformed'
  | 'handshake_noise_failed'
  | 'handshake_unexpected_message'
  | 'handshake_link_closed'
  | 'handshake_init_failed'
  | 'handshake_static_missing'
  | 'handshake_out_of_order'
  | 'credential_verify_failed'
  | 'transport_send_failed'
  | 'transport_decrypt_failed'

export interface BLEDiagnosticSnapshot {
  runId: number
  running: boolean
  startedAt: number | null
  updatedAt: number | null
  currentStage: BLEDiagnosticStage
  furthestStage: BLEDiagnosticStage
  lastFailure: BLEDiagnosticFailure | null
  lastFailureCause: BLEDiagnosticFailureCause | null
  eligibleContactCount: number
  noiseSelfTest: BLENoiseSelfTestStatus
  payloadBudgetSource: BLEDiagnosticBudgetSource
  payloadBudgetBytes: number | null
  handshakeProgress: BLEHandshakeProgress
}

const STAGE_ORDER: Record<BLEDiagnosticStage, number> = {
  idle: 0,
  radio_starting: 1,
  radio_active: 2,
  peer_discovered: 3,
  gatt_connecting: 4,
  gatt_ready: 5,
  noise_handshaking: 6,
  noise_secured: 7,
  identity_authenticated: 8,
  contact_admitted: 9,
  route_ready: 10,
}

const HANDSHAKE_PROGRESS_ORDER: Record<BLEHandshakeProgress, number> = {
  not_started: 0,
  step_1_sent: 1,
  step_1_received: 1,
  step_2_sent: 2,
  step_2_received: 2,
  step_3_sent: 3,
  step_3_received: 3,
  transport_keys_ready: 4,
  credential_authenticated: 5,
}

function maxDiagnosticStage(
  left: BLEDiagnosticStage,
  right: BLEDiagnosticStage,
): BLEDiagnosticStage {
  return STAGE_ORDER[left] >= STAGE_ORDER[right] ? left : right
}

function stageImpliedByHandshakeProgress(
  progress: BLEHandshakeProgress,
): BLEDiagnosticStage {
  if (progress === 'credential_authenticated') return 'identity_authenticated'
  if (progress === 'transport_keys_ready') return 'noise_secured'
  if (progress !== 'not_started') return 'noise_handshaking'
  return 'idle'
}

const listeners = new Set<(snapshot: BLEDiagnosticSnapshot) => void>()
let transportEventsActive = false
let candidateKey: string | null = null

function initialSnapshot(runId = 0): BLEDiagnosticSnapshot {
  return {
    runId,
    running: false,
    startedAt: null,
    updatedAt: null,
    currentStage: 'idle',
    furthestStage: 'idle',
    lastFailure: null,
    lastFailureCause: null,
    eligibleContactCount: 0,
    noiseSelfTest: 'not_run',
    payloadBudgetSource: 'unknown',
    payloadBudgetBytes: null,
    handshakeProgress: 'not_started',
  }
}

let snapshot = initialSnapshot()

function publish(next: BLEDiagnosticSnapshot): void {
  snapshot = next
  for (const listener of listeners) {
    try {
      listener({ ...snapshot })
    } catch {
      // Diagnostic observers cannot affect transport.
    }
  }
}

export function getBLEDiagnosticSnapshot(): BLEDiagnosticSnapshot {
  return { ...snapshot }
}

export function beginBLEDiagnostics(
  eligibleContactCount: number,
  now = Date.now(),
): BLEDiagnosticSnapshot {
  transportEventsActive = false
  candidateKey = null
  const next: BLEDiagnosticSnapshot = {
    ...initialSnapshot(snapshot.runId + 1),
    running: true,
    startedAt: now,
    updatedAt: now,
    currentStage: 'radio_starting',
    furthestStage: 'radio_starting',
    eligibleContactCount: Math.max(0, Math.floor(eligibleContactCount)),
  }
  publish(next)
  return { ...next }
}

export function clearBLEDiagnostics(): void {
  transportEventsActive = false
  candidateKey = null
  publish(initialSnapshot())
}

export function activateBLEDiagnosticTransport(): void {
  transportEventsActive = true
}

export function releaseBLEDiagnosticPeer(
  peerKey: string,
  preserveEvidence = false,
): void {
  if (!transportEventsActive || candidateKey !== peerKey) return
  candidateKey = null
  const keepEvidence = preserveEvidence || snapshot.lastFailure !== null
  let baseline = STAGE_ORDER[snapshot.furthestStage] >= STAGE_ORDER.peer_discovered
    ? 'peer_discovered'
    : snapshot.furthestStage
  if (keepEvidence) {
    baseline = maxDiagnosticStage(
      baseline,
      stageImpliedByHandshakeProgress(snapshot.handshakeProgress),
    )
  }
  publish({
    ...snapshot,
    running: true,
    currentStage: baseline,
    furthestStage: baseline,
    updatedAt: Date.now(),
    payloadBudgetSource: keepEvidence
      ? snapshot.payloadBudgetSource
      : 'unknown',
    payloadBudgetBytes: keepEvidence
      ? snapshot.payloadBudgetBytes
      : null,
    handshakeProgress: keepEvidence
      ? snapshot.handshakeProgress
      : 'not_started',
  })
}

export function recordBLEDiagnosticPeerBudget(
  source: BLEDiagnosticBudgetSource,
  bytes: number,
  peerKey: string,
): void {
  if (
    !transportEventsActive
    || !acceptCandidate(peerKey)
    || !Number.isInteger(bytes)
    || bytes < 1
    || bytes > 512
  ) return
  publish({
    ...snapshot,
    payloadBudgetSource: source,
    payloadBudgetBytes: bytes,
    updatedAt: Date.now(),
  })
}

export function recordBLEDiagnosticPeerHandshakeProgress(
  progress: BLEHandshakeProgress,
  peerKey: string,
): void {
  if (!transportEventsActive || !acceptCandidate(peerKey)) return
  if (
    HANDSHAKE_PROGRESS_ORDER[progress]
    < HANDSHAKE_PROGRESS_ORDER[snapshot.handshakeProgress]
  ) return
  publish({
    ...snapshot,
    handshakeProgress: progress,
    updatedAt: Date.now(),
  })
}

export function setBLEDiagnosticEligibleContacts(count: number): void {
  publish({
    ...snapshot,
    eligibleContactCount: Math.max(0, Math.floor(count)),
    updatedAt: Date.now(),
  })
}

export function recordBLEDiagnosticStage(
  stage: BLEDiagnosticStage,
  now = Date.now(),
): void {
  if (!transportEventsActive) return
  recordStage(stage, now)
}

export function recordBLEDiagnosticPeerStage(
  stage: BLEDiagnosticStage,
  peerKey: string,
  now = Date.now(),
): void {
  if (!transportEventsActive || !acceptCandidate(peerKey)) return
  recordStage(stage, now)
}

function recordStage(stage: BLEDiagnosticStage, now: number): void {
  const advanced = STAGE_ORDER[stage] > STAGE_ORDER[snapshot.furthestStage]
  const furthestStage = advanced
    ? stage
    : snapshot.furthestStage
  publish({
    ...snapshot,
    running: furthestStage !== 'route_ready',
    startedAt: snapshot.startedAt ?? now,
    updatedAt: now,
    currentStage: stage,
    furthestStage,
    handshakeProgress: stage === 'noise_handshaking'
      ? 'not_started'
      : snapshot.handshakeProgress,
    lastFailure: advanced && !isStickySessionFailure(snapshot.lastFailure)
      ? null
      : snapshot.lastFailure,
    lastFailureCause: advanced && !isStickySessionFailure(snapshot.lastFailure)
      ? null
      : snapshot.lastFailureCause,
  })
  if (stage === 'route_ready') transportEventsActive = false
}

export function recordBLEDiagnosticFailure(
  failure: BLEDiagnosticFailure,
  now = Date.now(),
): void {
  if (!transportEventsActive) return
  recordFailure(failure, now, true)
}

export function clearBLEDiagnosticFailure(now = Date.now()): void {
  if (snapshot.lastFailure === null) return
  publish({
    ...snapshot,
    lastFailure: null,
    lastFailureCause: null,
    updatedAt: now,
  })
}

export function recordBLEDiagnosticPeerFailure(
  failure: BLEDiagnosticFailure,
  peerKey: string,
  now = Date.now(),
  cause: BLEDiagnosticFailureCause | null = null,
): void {
  if (!transportEventsActive) return
  if (
    isRadioDropFailure(failure)
    && isStickySessionFailure(snapshot.lastFailure)
  ) {
    return
  }
  if (!acceptCandidate(peerKey)) return
  recordFailure(failure, now, false, cause)
}

export function finalizeBLEDiagnosticPeerFailure(
  failure: BLEDiagnosticFailure,
  peerKey: string,
  evidence: {
    stage?: BLEDiagnosticStage
    handshakeProgress?: BLEHandshakeProgress
  } = {},
  now = Date.now(),
): void {
  if (!transportEventsActive) return
  if (candidateKey !== peerKey) {
    candidateKey = peerKey
    const baseline = STAGE_ORDER[snapshot.furthestStage] >= STAGE_ORDER.peer_discovered
      ? 'peer_discovered'
      : snapshot.furthestStage
    publish({
      ...snapshot,
      currentStage: baseline,
      furthestStage: baseline,
      lastFailure: null,
      lastFailureCause: null,
      payloadBudgetSource: 'unknown',
      payloadBudgetBytes: null,
      handshakeProgress: 'not_started',
      updatedAt: now,
    })
  }
  if (evidence.stage) recordStage(evidence.stage, now)
  if (
    evidence.handshakeProgress
    && HANDSHAKE_PROGRESS_ORDER[evidence.handshakeProgress]
      > HANDSHAKE_PROGRESS_ORDER[snapshot.handshakeProgress]
  ) {
    publish({
      ...snapshot,
      handshakeProgress: evidence.handshakeProgress,
      updatedAt: now,
    })
  }
  recordFailure(failure, now, true)
}

export function finalizeBLEDiagnostics(
  failure: BLEDiagnosticFailure,
  now = Date.now(),
): void {
  recordFailure(failure, now, true)
}

function recordFailure(
  failure: BLEDiagnosticFailure,
  now: number,
  terminal: boolean,
  cause: BLEDiagnosticFailureCause | null = null,
): void {
  if (!shouldReplaceFailure(snapshot.lastFailure, failure)) {
    if (terminal) {
      transportEventsActive = false
      if (snapshot.running) {
        publish({
          ...snapshot,
          running: false,
          updatedAt: now,
        })
      }
    }
    return
  }
  publish({
    ...snapshot,
    running: !terminal,
    updatedAt: now,
    lastFailure: failure,
    lastFailureCause: cause,
  })
  if (terminal) transportEventsActive = false
}

function shouldReplaceFailure(
  current: BLEDiagnosticFailure | null,
  next: BLEDiagnosticFailure,
): boolean {
  if (!current || current === next) return true
  if (
    (current === 'credential_rejected' || current === 'contact_not_admitted')
    && next === 'noise_handshake_failed'
  ) {
    return false
  }
  if (
    isStickySessionFailure(current)
    && isRadioDropFailure(next)
  ) {
    return false
  }
  return true
}

function isStickySessionFailure(
  failure: BLEDiagnosticFailure | null,
): boolean {
  return failure === 'noise_handshake_failed'
    || failure === 'credential_rejected'
    || failure === 'contact_not_admitted'
    || failure === 'transport_failed'
}

function isRadioDropFailure(failure: BLEDiagnosticFailure): boolean {
  return failure === 'gatt_connection_failed'
    || failure === 'gatt_timeout'
    || failure === 'gatt_subscription_timeout'
    || failure === 'gatt_service_missing'
}

function acceptCandidate(peerKey: string): boolean {
  if (!candidateKey) {
    candidateKey = peerKey
    if (isStickySessionFailure(snapshot.lastFailure)) {
      return true
    }
    if (
      snapshot.lastFailure
      || snapshot.lastFailureCause
      || snapshot.payloadBudgetSource !== 'unknown'
      || snapshot.payloadBudgetBytes !== null
      || snapshot.handshakeProgress !== 'not_started'
    ) {
      publish({
        ...snapshot,
        lastFailure: null,
        lastFailureCause: null,
        payloadBudgetSource: 'unknown',
        payloadBudgetBytes: null,
        handshakeProgress: 'not_started',
        updatedAt: Date.now(),
      })
    }
  }
  return candidateKey === peerKey
}

export function setBLENoiseSelfTestStatus(
  noiseSelfTest: BLENoiseSelfTestStatus,
): void {
  publish({
    ...snapshot,
    noiseSelfTest,
    updatedAt: Date.now(),
  })
}

export function onBLEDiagnosticsChanged(
  listener: (value: BLEDiagnosticSnapshot) => void,
): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function hasReachedBLEDiagnosticStage(
  value: BLEDiagnosticSnapshot,
  stage: BLEDiagnosticStage,
): boolean {
  return STAGE_ORDER[value.furthestStage] >= STAGE_ORDER[stage]
}

const FAILURE_LABELS: Record<BLEDiagnosticFailure, string> = {
  radio_unavailable: 'Bluetooth is off or unavailable on this phone.',
  advertising_failed: 'This phone could not stay discoverable over Bluetooth.',
  scan_failed: 'Bluetooth scanning stopped before the other phone could be found.',
  peer_not_discovered: 'The other phone was not found over Bluetooth.',
  gatt_connection_failed: 'The Bluetooth radio link dropped after connecting.',
  gatt_service_missing: 'The nearby phone is not running Spectra Bluetooth.',
  gatt_subscription_timeout: 'The Bluetooth notify channel never became ready.',
  gatt_timeout: 'The Bluetooth connection stalled before it was usable.',
  gatt_mtu_too_small: 'The Bluetooth packet size is too small for Spectra.',
  noise_handshake_failed: 'The secure Bluetooth handshake did not complete.',
  credential_rejected: 'The nearby phone is not a trusted contact.',
  contact_not_admitted: 'The nearby identity is not in your contacts.',
  contact_admission_timeout: 'Nearby authentication did not finish in time.',
  capability_failed: 'The secure Bluetooth route could not be established.',
  route_timeout: 'The Bluetooth route did not become ready in time.',
  transport_failed: 'The authenticated Bluetooth session was interrupted.',
  noise_self_test_failed: 'Bluetooth encryption self-test failed.',
}

const SESSION_FAILURES = new Set<BLEDiagnosticFailure>([
  'radio_unavailable',
  'advertising_failed',
  'scan_failed',
  'gatt_connection_failed',
  'gatt_service_missing',
  'gatt_subscription_timeout',
  'gatt_timeout',
  'gatt_mtu_too_small',
  'noise_handshake_failed',
  'credential_rejected',
  'contact_not_admitted',
  'capability_failed',
  'transport_failed',
])

export function describeBLEDiagnosticFailure(
  failure: BLEDiagnosticFailure,
): string {
  return FAILURE_LABELS[failure]
}

export function describeBLEDiagnosticCause(
  value: BLEDiagnosticSnapshot,
): string {
  if (!value.lastFailure) return ''
  if (value.lastFailure === 'noise_handshake_failed') {
    return describeHandshakeFailure(value)
  }
  return FAILURE_LABELS[value.lastFailure]
}

const STOP_STAGE_LABELS: Record<BLEDiagnosticStage, string> = {
  idle: 'Stopped at idle.',
  radio_starting: 'Stopped at radio starting.',
  radio_active: 'Stopped at radio on.',
  peer_discovered: 'Stopped at nearby phone found.',
  gatt_connecting: 'Stopped at Bluetooth connecting.',
  gatt_ready: 'Stopped at Bluetooth connected.',
  noise_handshaking: 'Stopped at the Noise handshake.',
  noise_secured: 'Stopped at Noise keys ready.',
  identity_authenticated: 'Stopped at identity authenticated.',
  contact_admitted: 'Stopped at contact admitted.',
  route_ready: 'Stopped at the secure route.',
}

const STOP_PROGRESS_LABELS: Record<BLEHandshakeProgress, string> = {
  not_started: 'Noise had not started.',
  step_1_sent: 'Noise step 1 was sent.',
  step_1_received: 'Noise step 1 was received.',
  step_2_sent: 'Noise step 2 was sent.',
  step_2_received: 'Noise step 2 was received.',
  step_3_sent: 'Noise step 3 was sent.',
  step_3_received: 'Noise step 3 was received.',
  transport_keys_ready: 'Noise transport keys were ready.',
  credential_authenticated: 'The identity credential had authenticated.',
}

export function describeBLEDiagnosticStopStage(
  stage: BLEDiagnosticStage,
): string {
  return STOP_STAGE_LABELS[stage]
}

export function describeBLEHandshakeProgressLabel(
  progress: BLEHandshakeProgress,
): string {
  return STOP_PROGRESS_LABELS[progress]
}

function describeHandshakeFailure(value: BLEDiagnosticSnapshot): string {
  const cause = value.lastFailureCause
  const progress = value.handshakeProgress
  if (cause === 'handshake_send_failed') {
    if (progress === 'step_1_sent') {
      return 'This phone sent Noise step 1, then a later Bluetooth handshake write failed.'
    }
    if (progress === 'step_1_received') {
      return 'This phone received Noise step 1, but could not send step 2.'
    }
    if (progress === 'step_2_sent') {
      return 'This phone sent Noise step 2, then a later Bluetooth handshake write failed.'
    }
    if (progress === 'step_2_received') {
      return 'This phone received Noise step 2, but could not send step 3.'
    }
    if (progress === 'step_3_sent' || progress === 'step_3_received') {
      return 'This phone sent the last Noise handshake message, then a later Bluetooth write failed.'
    }
    return 'This phone could not send Noise handshake step 1 over Bluetooth.'
  }
  if (cause === 'handshake_malformed') {
    if (progress === 'not_started') {
      return 'This phone rejected the first Bluetooth handshake frame. It was truncated or mixed with another packet.'
    }
    return 'The other phone sent a handshake frame this phone rejected.'
  }
  if (cause === 'handshake_out_of_order') {
    return 'Encrypted Bluetooth data arrived before the Noise handshake finished.'
  }
  if (cause === 'handshake_progress_timeout') {
    if (progress === 'not_started') {
      return 'Noise never completed step 1 after the first handshake message arrived.'
    }
  }
  if (cause === 'handshake_link_closed') {
    return 'The Noise session closed before the first handshake message finished.'
  }
  if (cause === 'handshake_init_failed') {
    return 'This phone could not start the Noise XX session.'
  }
  if (cause === 'handshake_static_missing') {
    return 'Noise finished without a remote static key.'
  }
  if (cause === 'handshake_unexpected_message') {
    if (progress === 'not_started') {
      return 'The other phone sent a Noise message this session was not expecting, before step 1 finished.'
    }
    return 'The other phone sent a Noise message this session was not expecting.'
  }
  if (cause === 'handshake_noise_failed') {
    if (progress === 'not_started') {
      return 'Noise rejected the first handshake message before step 1 finished.'
    }
    if (progress === 'step_1_sent' || progress === 'step_1_received') {
      return 'Noise rejected the cryptographic reply to step 1.'
    }
    if (progress === 'step_2_sent' || progress === 'step_2_received') {
      return 'Noise rejected the cryptographic reply to step 2.'
    }
    if (progress === 'step_3_sent' || progress === 'step_3_received') {
      return 'Noise rejected the final handshake message before transport keys were ready.'
    }
    if (progress === 'transport_keys_ready') {
      return 'Noise reported transport keys, then rejected the encrypted identity payload.'
    }
    if (progress === 'credential_authenticated') {
      return FAILURE_LABELS.transport_failed
    }
    return 'Noise rejected a handshake message before transport keys were ready.'
  }
  if (cause === 'credential_verify_failed') {
    return FAILURE_LABELS.credential_rejected
  }
  if (progress === 'step_1_sent') {
    return 'This phone sent Noise step 1, but the other phone never answered.'
  }
  if (progress === 'step_1_received') {
    return 'This phone received Noise step 1, then the handshake stalled.'
  }
  if (progress === 'step_2_sent') {
    return 'This phone sent Noise step 2, but the other phone never answered.'
  }
  if (progress === 'step_2_received') {
    return 'This phone received Noise step 2, then the handshake stalled.'
  }
  if (progress === 'step_3_sent' || progress === 'step_3_received') {
    return 'This phone completed Noise XX, but identity authentication never finished.'
  }
  if (progress === 'transport_keys_ready') {
    return 'Noise transport keys were ready, but the identity credential never authenticated.'
  }
  if (
    cause === 'handshake_timeout'
    || cause === 'handshake_progress_timeout'
    || progress === 'not_started'
  ) {
    return 'The Bluetooth radio connected, but the Noise handshake never started.'
  }
  return FAILURE_LABELS.noise_handshake_failed
}

export function isBLESessionDiagnosticFailure(
  failure: BLEDiagnosticFailure | null,
): failure is BLEDiagnosticFailure {
  return failure != null && SESSION_FAILURES.has(failure)
}

export function formatBLEDiagnosticReport(
  value: BLEDiagnosticSnapshot,
  buildNumber: string,
): string {
  return [
    'Spectra Bluetooth Diagnostics',
    `Build: ${buildNumber || 'unknown'}`,
    `Run: ${value.runId}`,
    `Noise self-test: ${value.noiseSelfTest}`,
    `Current stage: ${value.currentStage}`,
    `Furthest stage: ${value.furthestStage}`,
    `Failure: ${value.lastFailure ?? 'none'}`,
    `Cause: ${value.lastFailureCause ?? 'none'}`,
    `GATT payload: ${value.payloadBudgetBytes ?? 'unknown'}`,
    `GATT payload source: ${value.payloadBudgetSource}`,
    `Noise progress: ${value.handshakeProgress}`,
    `Eligible contacts: ${value.eligibleContactCount}`,
    `Started: ${value.startedAt ? new Date(value.startedAt).toISOString() : 'not started'}`,
    `Updated: ${value.updatedAt ? new Date(value.updatedAt).toISOString() : 'not updated'}`,
  ].join('\n')
}
