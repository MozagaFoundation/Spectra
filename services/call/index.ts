/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

export {
  CallService,
  createCallInvitationMessage,
  parseCallInvitation,
  isCallInvitation,
  describeCallInvitation,
  getCallSessionSnapshot,
  isLiveIncomingCallState,
} from './callService'
export type {
  CallSession,
  CallSessionSnapshot,
  CallSignal,
  SignalPayload,
  RTCIceCandidate,
} from './callService'

export { WebRTCManager, isWebRTCAvailable } from './webrtcManager'
export type { WebRTCManagerCallbacks } from './webrtcManager'

export {
  clearCallDiagnosticEvents,
  clearCallLatencyEvents,
  describeCallError,
  getRecentCallDiagnosticEvents,
  getRecentCallLatencyEvents,
  recordCallDiagnostic,
  recordCallLatency,
  startCallLatencySpan,
} from './callDiagnostics'

export {
  assertCallAdmission,
  canAdmitCalls,
  getCallAdmissionBlockReason,
  SPECTRE_CALL_DISABLED_ERROR,
  TOR_CALL_DISABLED_ERROR,
} from './callAdmission'
export type { CallAdmissionBlockReason } from './callAdmission'

export {
  normalizeIncomingCallPushPayload,
  rememberIncomingCallSession,
  getPendingIncomingCallSession,
  getPendingIncomingCallSessions,
  clearPendingIncomingCallSession,
  markCallSessionHandled,
  subscribeToIncomingCallSessionChanges,
} from './callSessionRegistry'
export type { IncomingCallPushPayload } from './callSessionRegistry'

export { hasActiveCallActivity, setCallActivity } from './callActivityGate'

export { shouldIgnoreCallStateTransition } from './callLifecycleUtils'
