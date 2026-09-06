/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  beginBLEMessageDiagnostics,
  clearBLEMessageDiagnostics,
  getBLEMessageDiagnosticSnapshot,
  getBLEMessageDiagnosticGeneration,
  onBLEMessageDiagnosticsChanged,
  recordBLEMessageDiagnosticFailure,
  recordBLEMessageDiagnosticStage,
} from '../messageDiagnostics'

describe('BLE message diagnostics', () => {
  beforeEach(() => {
    clearBLEMessageDiagnostics()
  })

  it('tracks the message halt point per peer without payload data', () => {
    const listener = vi.fn()
    const unsubscribe = onBLEMessageDiagnosticsChanged(listener)

    const operationId = beginBLEMessageDiagnostics(
      'peer-a',
      'outbound',
      'route_selected',
      10,
    )
    recordBLEMessageDiagnosticStage(
      'peer-a',
      'outbound',
      'transmitting',
      operationId,
      20,
    )
    recordBLEMessageDiagnosticFailure(
      'peer-a',
      'outbound',
      'receipt_timeout',
      operationId,
      30,
    )

    expect(getBLEMessageDiagnosticSnapshot('peer-a')).toEqual({
      peerIdentityId: 'peer-a',
      operationId,
      direction: 'outbound',
      stage: 'failed',
      failure: 'receipt_timeout',
      startedAt: 10,
      updatedAt: 30,
    })
    expect(listener).toHaveBeenCalledTimes(3)
    unsubscribe()
  })

  it('starts a new run when message direction changes', () => {
    beginBLEMessageDiagnostics('peer-a', 'outbound', 'transmitting', 10)
    recordBLEMessageDiagnosticStage(
      'peer-a',
      'inbound',
      'assembling',
      undefined,
      50,
    )

    expect(getBLEMessageDiagnosticSnapshot('peer-a')).toEqual(
      expect.objectContaining({
        direction: 'inbound',
        stage: 'assembling',
        startedAt: 50,
      }),
    )
  })

  it('ignores late updates from an older operation', () => {
    const older = beginBLEMessageDiagnostics(
      'peer-a',
      'outbound',
      'transmitting',
      10,
    )
    const newer = beginBLEMessageDiagnostics(
      'peer-a',
      'outbound',
      'route_selected',
      20,
    )

    recordBLEMessageDiagnosticFailure(
      'peer-a',
      'outbound',
      'receipt_timeout',
      older,
      30,
    )

    expect(getBLEMessageDiagnosticSnapshot('peer-a')).toEqual(
      expect.objectContaining({
        operationId: newer,
        stage: 'route_selected',
        failure: null,
      }),
    )
  })

  it('isolates observer failures from transport updates', () => {
    const unsubscribe = onBLEMessageDiagnosticsChanged(() => {
      throw new Error('observer failed')
    })

    expect(() => {
      beginBLEMessageDiagnostics('peer-a', 'outbound', 'route_selected')
    }).not.toThrow()
    unsubscribe()
  })

  it('does not republish an identical operation state', () => {
    const listener = vi.fn()
    const unsubscribe = onBLEMessageDiagnosticsChanged(listener)
    const operationId = beginBLEMessageDiagnostics(
      'peer-a',
      'outbound',
      'transmitting',
    )

    recordBLEMessageDiagnosticStage(
      'peer-a',
      'outbound',
      'transmitting',
      operationId,
    )

    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  it('rejects operations from a retired account lifecycle', () => {
    const generation = getBLEMessageDiagnosticGeneration()
    clearBLEMessageDiagnostics()

    const operationId = beginBLEMessageDiagnostics(
      'peer-a',
      'outbound',
      'transmitting',
      Date.now(),
      generation,
    )

    expect(operationId).toBe(0)
    expect(getBLEMessageDiagnosticSnapshot('peer-a')).toBeNull()
  })
})
