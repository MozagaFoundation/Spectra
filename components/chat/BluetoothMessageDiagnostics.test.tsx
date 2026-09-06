/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BLEMessageDiagnosticSnapshot } from '@/services/bluetooth/messageDiagnostics'

const mockState = vi.hoisted(() => ({
  diagnostics: null as BLEMessageDiagnosticSnapshot | null,
  lastFailure: null as null | 'transport_failed' | 'peer_not_discovered' | 'noise_handshake_failed',
  lastFailureCause: null as null | 'handshake_timeout' | 'handshake_send_failed',
  handshakeProgress: 'not_started' as 'not_started' | 'step_1_sent',
  furthestStage: 'idle' as 'idle' | 'gatt_ready' | 'noise_handshaking',
  enabled: false,
  nearbyContacts: [] as Array<{ identityId: string }>,
}))

vi.mock('lucide-react-native', async () => {
  const { TestChatIcon } = await import('../../test/chatComponentMocks')
  return {
    AlertTriangle: TestChatIcon,
    Bluetooth: TestChatIcon,
    CheckCircle2: TestChatIcon,
  }
})

vi.mock('@/lib/i18n', () => ({ translate: (key: string) => key }))

vi.mock('@/lib/theme', async () => {
  const { chatTestColors } = await import('../../test/chatComponentMocks')
  return { useThemeColors: () => chatTestColors }
})

vi.mock('@/store/bluetoothStore', () => ({
  useBluetoothStore: (
    selector: (state: {
      messageDiagnostics: Record<string, BLEMessageDiagnosticSnapshot>
      diagnostics: {
        lastFailure: typeof mockState.lastFailure
        lastFailureCause: typeof mockState.lastFailureCause
        handshakeProgress: typeof mockState.handshakeProgress
        furthestStage: typeof mockState.furthestStage
      }
      config: { enabled: boolean }
      nearbyContacts: Array<{ identityId: string }>
    }) => unknown,
  ) => selector({
    messageDiagnostics: mockState.diagnostics
      ? { [mockState.diagnostics.peerIdentityId]: mockState.diagnostics }
      : {},
    diagnostics: {
      lastFailure: mockState.lastFailure,
      lastFailureCause: mockState.lastFailureCause,
      handshakeProgress: mockState.handshakeProgress,
      furthestStage: mockState.furthestStage,
    },
    config: { enabled: mockState.enabled },
    nearbyContacts: mockState.nearbyContacts,
  }),
}))

const { act, render } = await import('@testing-library/react-native')
const { BluetoothMessageDiagnostics } = await import('./BluetoothMessageDiagnostics')

describe('BluetoothMessageDiagnostics', () => {
  beforeEach(() => {
    mockState.diagnostics = null
    mockState.lastFailure = null
    mockState.lastFailureCause = null
    mockState.handshakeProgress = 'not_started'
    mockState.furthestStage = 'idle'
    mockState.enabled = false
    mockState.nearbyContacts = []
  })

  it('shows the outbound halt point without exposing peer identifiers', () => {
    mockState.diagnostics = {
      peerIdentityId: 'private-identity',
      operationId: 1,
      direction: 'outbound',
      stage: 'failed',
      failure: 'receipt_timeout',
      startedAt: Date.now(),
      updatedAt: Date.now(),
    }
    const view = render(
      <BluetoothMessageDiagnostics
        peerIdentityId="private-identity"
        active
      />,
    )

    expect(view.getByText('Bluetooth message halted')).toBeTruthy()
    expect(view.getByText('Outbound')).toBeTruthy()
    expect(view.getByText(
      'The message was transmitted, but no authenticated receipt returned within 20 seconds.',
    )).toBeTruthy()
    expect(() => view.getByText('private-identity')).toThrow()
  })

  it('shows receiver-side persistence and receipt completion', () => {
    mockState.diagnostics = {
      peerIdentityId: 'private-identity',
      operationId: 1,
      direction: 'inbound',
      stage: 'receipt_sent',
      failure: null,
      startedAt: Date.now(),
      updatedAt: Date.now(),
    }
    const view = render(
      <BluetoothMessageDiagnostics
        peerIdentityId="private-identity"
        active
      />,
    )

    expect(view.getByText('Authenticated receipt sent')).toBeTruthy()
    expect(view.getByText('Inbound')).toBeTruthy()
  })

  it('hides stale diagnostics outside an active Bluetooth route', () => {
    mockState.diagnostics = {
      peerIdentityId: 'private-identity',
      operationId: 1,
      direction: 'outbound',
      stage: 'failed',
      failure: 'receipt_timeout',
      startedAt: Date.now(),
      updatedAt: Date.now(),
    }
    const view = render(
      <BluetoothMessageDiagnostics
        peerIdentityId="private-identity"
        active={false}
      />,
    )

    expect(view.root.children).toEqual([])
  })

  it('shows the radio failure that dropped the nearby session', () => {
    mockState.enabled = true
    mockState.lastFailure = 'transport_failed'

    const view = render(
      <BluetoothMessageDiagnostics
        peerIdentityId="private-identity"
        active={false}
      />,
    )

    expect(view.getByText('Nearby Bluetooth session is down.')).toBeTruthy()
    expect(view.getByText('The authenticated Bluetooth session was interrupted.')).toBeTruthy()
    expect(() => view.getByText('private-identity')).toThrow()
  })

  it('shows the handshake stall point without exposing peer identifiers', () => {
    mockState.enabled = true
    mockState.lastFailure = 'noise_handshake_failed'
    mockState.lastFailureCause = 'handshake_timeout'
    mockState.handshakeProgress = 'step_1_sent'
    mockState.furthestStage = 'noise_handshaking'

    const view = render(
      <BluetoothMessageDiagnostics
        peerIdentityId="private-identity"
        active={false}
      />,
    )

    expect(view.getByText('Nearby Bluetooth session is down.')).toBeTruthy()
    expect(view.getByText(
      'This phone sent Noise step 1, but the other phone never answered.',
    )).toBeTruthy()
    expect(view.getByText(
      'Stopped at the Noise handshake. Noise step 1 was sent.',
    )).toBeTruthy()
    expect(() => view.getByText('private-identity')).toThrow()
  })

  it('hides the radio failure once that contact is nearby', () => {
    mockState.enabled = true
    mockState.lastFailure = 'transport_failed'
    mockState.nearbyContacts = [{ identityId: 'private-identity' }]

    const view = render(
      <BluetoothMessageDiagnostics
        peerIdentityId="private-identity"
        active={false}
      />,
    )

    expect(view.root.children).toEqual([])
  })

  it('expires an idle diagnostic banner after five minutes', async () => {
    vi.useFakeTimers()
    try {
      mockState.diagnostics = {
        peerIdentityId: 'private-identity',
        operationId: 1,
        direction: 'outbound',
        stage: 'awaiting_receipt',
        failure: null,
        startedAt: Date.now(),
        updatedAt: Date.now(),
      }
      const view = render(
        <BluetoothMessageDiagnostics
          peerIdentityId="private-identity"
          active
        />,
      )
      expect(view.getByText('Waiting for receiver receipt')).toBeTruthy()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5 * 60_000 + 2)
      })

      expect(view.root.children).toEqual([])
    } finally {
      vi.clearAllTimers()
      vi.useRealTimers()
    }
  })
})
