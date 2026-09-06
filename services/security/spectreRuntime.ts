/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { useSpectreStore } from '@/store/spectreStore'
import {
  clearChatDiagnosticEvents,
  disableChatDiagnosticRecording,
  enableChatDiagnosticRecording,
} from '@/services/chat/chatDiagnostics'
import {
  clearChatLatencyEvents,
  disableChatLatencyRecording,
  enableChatLatencyRecording,
} from '@/services/chat/chatLatency'
import {
  clearCallDiagnosticEvents,
  clearCallLatencyEvents,
  disableCallDiagnosticRecording,
  enableCallDiagnosticRecording,
} from '@/services/call/callDiagnostics'
import {
  clearTorDiagnosticEvents,
  clearTorLatencyEvents,
  disableTorDiagnosticRecording,
  enableTorDiagnosticRecording,
} from '@/services/tor/torDiagnostics'

export function setSpectreDiagnosticsRecordingEnabled(enabled: boolean): void {
  if (enabled) {
    enableChatDiagnosticRecording()
    enableChatLatencyRecording()
    enableCallDiagnosticRecording()
    enableTorDiagnosticRecording()
    return
  }

  disableChatDiagnosticRecording()
  disableChatLatencyRecording()
  disableCallDiagnosticRecording()
  disableTorDiagnosticRecording()
}

export function clearSpectreDiagnosticsBuffers(): void {
  clearChatDiagnosticEvents()
  clearChatLatencyEvents()
  clearCallDiagnosticEvents()
  clearCallLatencyEvents()
  clearTorDiagnosticEvents()
  clearTorLatencyEvents()
}

export function initializeSpectreRuntime(): void {
  if (useSpectreStore.getState().enabled) {
    clearSpectreDiagnosticsBuffers()
    setSpectreDiagnosticsRecordingEnabled(false)
    return
  }

  setSpectreDiagnosticsRecordingEnabled(true)
}
