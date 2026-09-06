/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  activateBLEDiagnosticTransport,
  beginBLEDiagnostics,
  clearBLEDiagnosticFailure,
  clearBLEDiagnostics,
  finalizeBLEDiagnosticPeerFailure,
  formatBLEDiagnosticReport,
  getBLEDiagnosticSnapshot,
  hasReachedBLEDiagnosticStage,
  describeBLEDiagnosticCause,
  describeBLEDiagnosticFailure,
  describeBLEDiagnosticStopStage,
  describeBLEHandshakeProgressLabel,
  isBLESessionDiagnosticFailure,
  onBLEDiagnosticsChanged,
  recordBLEDiagnosticFailure,
  recordBLEDiagnosticPeerBudget,
  recordBLEDiagnosticPeerFailure,
  recordBLEDiagnosticPeerHandshakeProgress,
  recordBLEDiagnosticPeerStage,
  recordBLEDiagnosticStage,
  releaseBLEDiagnosticPeer,
  setBLENoiseSelfTestStatus,
} from '../diagnostics'

describe('BLE diagnostics', () => {
  beforeEach(() => {
    clearBLEDiagnostics()
  })

  it('tracks monotonic redacted stages and resets each run', () => {
    beginBLEDiagnostics(2, 1_000)
    activateBLEDiagnosticTransport()
    recordBLEDiagnosticStage('peer_discovered', 1_100)
    recordBLEDiagnosticStage('radio_active', 1_200)
    recordBLEDiagnosticFailure('gatt_connection_failed', 1_300)

    const failed = getBLEDiagnosticSnapshot()
    expect(failed).toEqual(expect.objectContaining({
      eligibleContactCount: 2,
      currentStage: 'radio_active',
      furthestStage: 'peer_discovered',
      lastFailure: 'gatt_connection_failed',
      running: false,
    }))
    expect(hasReachedBLEDiagnosticStage(failed, 'peer_discovered')).toBe(true)
    expect(Object.keys(failed)).not.toContain('deviceId')
    expect(Object.keys(failed)).not.toContain('identityId')

    const reset = beginBLEDiagnostics(1, 2_000)
    expect(reset.runId).toBe(failed.runId + 1)
    expect(reset.lastFailure).toBeNull()
    expect(reset.furthestStage).toBe('radio_starting')
  })

  it('notifies subscribers and emits a privacy-safe report', () => {
    const listener = vi.fn()
    const unsubscribe = onBLEDiagnosticsChanged(listener)
    beginBLEDiagnostics(1, 1_000)
    activateBLEDiagnosticTransport()
    setBLENoiseSelfTestStatus('passed')
    recordBLEDiagnosticStage('noise_secured', 2_000)
    unsubscribe()
    recordBLEDiagnosticStage('route_ready', 3_000)

    expect(listener).toHaveBeenCalledTimes(3)
    const report = formatBLEDiagnosticReport(getBLEDiagnosticSnapshot(), '59')
    expect(report).toContain('Build: 59')
    expect(report).toContain('Furthest stage: route_ready')
    expect(report).not.toMatch(/device|identity|contact name/i)
  })

  it('ignores stale transport events and does not mix peer stages', () => {
    beginBLEDiagnostics(2)
    recordBLEDiagnosticPeerStage('route_ready', 'old-peer')
    expect(getBLEDiagnosticSnapshot().furthestStage).toBe('radio_starting')

    activateBLEDiagnosticTransport()
    recordBLEDiagnosticPeerStage('peer_discovered', 'peer-a')
    recordBLEDiagnosticPeerStage('route_ready', 'peer-b')
    expect(getBLEDiagnosticSnapshot().furthestStage).toBe('peer_discovered')

    recordBLEDiagnosticPeerStage('gatt_ready', 'peer-a')
    expect(getBLEDiagnosticSnapshot().furthestStage).toBe('gatt_ready')
  })

  it('resets candidate progress on failover and keeps terminal runs closed', () => {
    beginBLEDiagnostics(2)
    activateBLEDiagnosticTransport()
    recordBLEDiagnosticPeerStage('noise_secured', 'peer-a')
    recordBLEDiagnosticPeerBudget('ios_fallback', 182, 'peer-a')
    recordBLEDiagnosticPeerHandshakeProgress('step_3_sent', 'peer-a')
    recordBLEDiagnosticPeerFailure('credential_rejected', 'peer-a')
    releaseBLEDiagnosticPeer('peer-a')

    expect(getBLEDiagnosticSnapshot()).toEqual(expect.objectContaining({
      running: true,
      furthestStage: 'noise_handshaking',
      lastFailure: 'credential_rejected',
      lastFailureCause: null,
      payloadBudgetSource: 'ios_fallback',
      payloadBudgetBytes: 182,
      handshakeProgress: 'step_3_sent',
    }))

    recordBLEDiagnosticPeerStage('gatt_ready', 'peer-b')
    expect(getBLEDiagnosticSnapshot()).toEqual(expect.objectContaining({
      furthestStage: 'noise_handshaking',
      lastFailure: 'credential_rejected',
      payloadBudgetSource: 'ios_fallback',
      payloadBudgetBytes: 182,
      handshakeProgress: 'step_3_sent',
    }))
    recordBLEDiagnosticFailure('gatt_timeout')
    recordBLEDiagnosticPeerStage('route_ready', 'peer-b')
    expect(getBLEDiagnosticSnapshot()).toEqual(expect.objectContaining({
      running: false,
      furthestStage: 'noise_handshaking',
      lastFailure: 'credential_rejected',
    }))
  })

  it('keeps a terminal contact-admission failure from being hidden by reconnects', () => {
    beginBLEDiagnostics(1)
    activateBLEDiagnosticTransport()
    recordBLEDiagnosticPeerStage('contact_admitted', 'peer-a')

    finalizeBLEDiagnosticPeerFailure('contact_not_admitted', 'peer-b', {
      stage: 'identity_authenticated',
      handshakeProgress: 'credential_authenticated',
    })
    releaseBLEDiagnosticPeer('peer-b', true)
    recordBLEDiagnosticPeerFailure('gatt_timeout', 'peer-a')

    expect(getBLEDiagnosticSnapshot()).toEqual(expect.objectContaining({
      running: false,
      furthestStage: 'identity_authenticated',
      lastFailure: 'contact_not_admitted',
      handshakeProgress: 'credential_authenticated',
    }))
  })

  it('reports only bounded frame metadata and ordered Noise progress', () => {
    beginBLEDiagnostics(1)
    activateBLEDiagnosticTransport()
    recordBLEDiagnosticPeerBudget('ios_fallback', 182, 'peer-a')
    recordBLEDiagnosticPeerHandshakeProgress('step_2_received', 'peer-a')
    recordBLEDiagnosticPeerHandshakeProgress('step_1_sent', 'peer-a')
    recordBLEDiagnosticPeerBudget('negotiated', 181, 'peer-b')

    const current = getBLEDiagnosticSnapshot()
    expect(current).toEqual(expect.objectContaining({
      payloadBudgetSource: 'ios_fallback',
      payloadBudgetBytes: 182,
      handshakeProgress: 'step_2_received',
    }))
    const report = formatBLEDiagnosticReport(current, '60')
    expect(report).toContain('GATT payload: 182')
    expect(report).toContain('GATT payload source: ios_fallback')
    expect(report).toContain('Noise progress: step_2_received')
    expect(report).toContain('Cause: none')
  })

  it('describes session failures without peer identifiers', () => {
    expect(describeBLEDiagnosticFailure('transport_failed')).toBe(
      'The authenticated Bluetooth session was interrupted.',
    )
    expect(isBLESessionDiagnosticFailure('transport_failed')).toBe(true)
    expect(isBLESessionDiagnosticFailure('credential_rejected')).toBe(true)
    expect(isBLESessionDiagnosticFailure('peer_not_discovered')).toBe(false)
  })

  it('clears a recorded failure after a later contact is admitted', () => {
    beginBLEDiagnostics(1)
    activateBLEDiagnosticTransport()
    recordBLEDiagnosticPeerFailure('noise_handshake_failed', 'peer-a')
    expect(getBLEDiagnosticSnapshot().lastFailure).toBe('noise_handshake_failed')
    clearBLEDiagnosticFailure()
    expect(getBLEDiagnosticSnapshot().lastFailure).toBeNull()
  })

  it('describes handshake failures from bounded cause and progress only', () => {
    beginBLEDiagnostics(1)
    activateBLEDiagnosticTransport()
    recordBLEDiagnosticPeerHandshakeProgress('step_1_sent', 'peer-a')
    recordBLEDiagnosticPeerFailure(
      'noise_handshake_failed',
      'peer-a',
      Date.now(),
      'handshake_timeout',
    )
    const timedOut = getBLEDiagnosticSnapshot()
    expect(describeBLEDiagnosticCause(timedOut)).toBe(
      'This phone sent Noise step 1, but the other phone never answered.',
    )
    expect(timedOut.lastFailureCause).toBe('handshake_timeout')
    expect(Object.keys(timedOut)).not.toContain('deviceId')

    recordBLEDiagnosticPeerFailure(
      'noise_handshake_failed',
      'peer-a',
      Date.now(),
      'handshake_send_failed',
    )
    expect(describeBLEDiagnosticCause(getBLEDiagnosticSnapshot())).toBe(
      'This phone sent Noise step 1, then a later Bluetooth handshake write failed.',
    )
  })

  it('starts a new handshake attempt without keeping the previous Noise step', () => {
    beginBLEDiagnostics(1)
    activateBLEDiagnosticTransport()
    recordBLEDiagnosticPeerHandshakeProgress('step_1_sent', 'peer-a')
    recordBLEDiagnosticPeerStage('noise_handshaking', 'peer-a')
    expect(getBLEDiagnosticSnapshot().handshakeProgress).toBe('not_started')
    recordBLEDiagnosticPeerFailure(
      'noise_handshake_failed',
      'peer-a',
      Date.now(),
      'handshake_send_failed',
    )
    expect(describeBLEDiagnosticCause(getBLEDiagnosticSnapshot())).toBe(
      'This phone could not send Noise handshake step 1 over Bluetooth.',
    )
    expect(describeBLEHandshakeProgressLabel(getBLEDiagnosticSnapshot().handshakeProgress)).toBe(
      'Noise had not started.',
    )
  })

  it('describes a first-message Noise rejection without exposing library errors', () => {
    beginBLEDiagnostics(1)
    activateBLEDiagnosticTransport()
    recordBLEDiagnosticPeerFailure(
      'noise_handshake_failed',
      'peer-a',
      Date.now(),
      'handshake_noise_failed',
    )
    expect(describeBLEDiagnosticCause(getBLEDiagnosticSnapshot())).toBe(
      'Noise rejected the first handshake message before step 1 finished.',
    )

    recordBLEDiagnosticPeerFailure(
      'noise_handshake_failed',
      'peer-a',
      Date.now(),
      'handshake_unexpected_message',
    )
    expect(describeBLEDiagnosticCause(getBLEDiagnosticSnapshot())).toBe(
      'The other phone sent a Noise message this session was not expecting, before step 1 finished.',
    )

    recordBLEDiagnosticPeerFailure(
      'noise_handshake_failed',
      'peer-a',
      Date.now(),
      'handshake_link_closed',
    )
    expect(describeBLEDiagnosticCause(getBLEDiagnosticSnapshot())).toBe(
      'The Noise session closed before the first handshake message finished.',
    )

    recordBLEDiagnosticPeerFailure(
      'noise_handshake_failed',
      'peer-a',
      Date.now(),
      'handshake_init_failed',
    )
    expect(describeBLEDiagnosticCause(getBLEDiagnosticSnapshot())).toBe(
      'This phone could not start the Noise XX session.',
    )

    recordBLEDiagnosticPeerFailure(
      'noise_handshake_failed',
      'peer-a',
      Date.now(),
      'handshake_static_missing',
    )
    expect(describeBLEDiagnosticCause(getBLEDiagnosticSnapshot())).toBe(
      'Noise finished without a remote static key.',
    )

    recordBLEDiagnosticPeerFailure(
      'noise_handshake_failed',
      'peer-a',
      Date.now(),
      'handshake_progress_timeout',
    )
    expect(describeBLEDiagnosticCause(getBLEDiagnosticSnapshot())).toBe(
      'Noise never completed step 1 after the first handshake message arrived.',
    )
  })

  it('names the Noise stop point instead of a catch-all transport-key failure', () => {
    beginBLEDiagnostics(1)
    activateBLEDiagnosticTransport()
    recordBLEDiagnosticPeerStage('noise_secured', 'peer-a')
    recordBLEDiagnosticPeerHandshakeProgress('transport_keys_ready', 'peer-a')
    recordBLEDiagnosticPeerFailure(
      'noise_handshake_failed',
      'peer-a',
      Date.now(),
      'handshake_noise_failed',
    )
    const snapshot = getBLEDiagnosticSnapshot()
    expect(describeBLEDiagnosticCause(snapshot)).toBe(
      'Noise reported transport keys, then rejected the encrypted identity payload.',
    )
    expect(describeBLEDiagnosticStopStage(snapshot.furthestStage)).toBe(
      'Stopped at Noise keys ready.',
    )
    expect(describeBLEHandshakeProgressLabel(snapshot.handshakeProgress)).toBe(
      'Noise transport keys were ready.',
    )
  })

  it('keeps a handshake cause when GATT later drops the radio', () => {
    beginBLEDiagnostics(1)
    activateBLEDiagnosticTransport()
    recordBLEDiagnosticPeerHandshakeProgress('not_started', 'peer-a')
    recordBLEDiagnosticPeerFailure(
      'noise_handshake_failed',
      'peer-a',
      Date.now(),
      'handshake_malformed',
    )
    releaseBLEDiagnosticPeer('peer-a', true)
    recordBLEDiagnosticPeerFailure('gatt_connection_failed', 'peer-b')

    const snapshot = getBLEDiagnosticSnapshot()
    expect(snapshot.lastFailure).toBe('noise_handshake_failed')
    expect(snapshot.lastFailureCause).toBe('handshake_malformed')
    expect(describeBLEDiagnosticCause(snapshot)).toBe(
      'This phone rejected the first Bluetooth handshake frame. It was truncated or mixed with another packet.',
    )
  })

  it('does not hide a credential rejection behind a later handshake timeout', () => {
    beginBLEDiagnostics(1)
    activateBLEDiagnosticTransport()
    recordBLEDiagnosticPeerFailure(
      'credential_rejected',
      'peer-a',
      Date.now(),
      'credential_verify_failed',
    )
    recordBLEDiagnosticPeerFailure(
      'noise_handshake_failed',
      'peer-a',
      Date.now(),
      'handshake_timeout',
    )
    expect(getBLEDiagnosticSnapshot()).toEqual(expect.objectContaining({
      lastFailure: 'credential_rejected',
      lastFailureCause: 'credential_verify_failed',
    }))
  })

  it('keeps identity authentication as the stop point after a post-auth session drop', () => {
    beginBLEDiagnostics(1)
    activateBLEDiagnosticTransport()
    recordBLEDiagnosticPeerStage('identity_authenticated', 'peer-a')
    recordBLEDiagnosticPeerHandshakeProgress('credential_authenticated', 'peer-a')
    recordBLEDiagnosticPeerFailure(
      'transport_failed',
      'peer-a',
      Date.now(),
      'transport_decrypt_failed',
    )
    releaseBLEDiagnosticPeer('peer-a', true)
    recordBLEDiagnosticPeerStage('gatt_ready', 'peer-b')

    const snapshot = getBLEDiagnosticSnapshot()
    expect(snapshot.furthestStage).toBe('identity_authenticated')
    expect(snapshot.lastFailure).toBe('transport_failed')
    expect(describeBLEDiagnosticCause(snapshot)).toBe(
      'The authenticated Bluetooth session was interrupted.',
    )
    expect(describeBLEDiagnosticStopStage(snapshot.furthestStage)).toBe(
      'Stopped at identity authenticated.',
    )
    expect(describeBLEHandshakeProgressLabel(snapshot.handshakeProgress)).toBe(
      'The identity credential had authenticated.',
    )
  })
})
