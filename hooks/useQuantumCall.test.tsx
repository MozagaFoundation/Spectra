/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from '@testing-library/react-native'
import { flushPromises, renderHook } from '@/test/hookTestHarness'
import { useQuantumCall } from './useQuantumCall'

const quantumMocks = vi.hoisted(() => {
  type ManagerInstance = {
    callbacks: Record<string, (...args: unknown[]) => void>
    startCall: ReturnType<typeof vi.fn>
    startOutgoingNegotiation: ReturnType<typeof vi.fn>
    answerCall: ReturnType<typeof vi.fn>
    declineCall: ReturnType<typeof vi.fn>
    endCall: ReturnType<typeof vi.fn>
    dispose: ReturnType<typeof vi.fn>
    getSession: ReturnType<typeof vi.fn>
    getDuration: ReturnType<typeof vi.fn>
    toggleMute: ReturnType<typeof vi.fn>
    toggleVideo: ReturnType<typeof vi.fn>
    toggleSpeaker: ReturnType<typeof vi.fn>
    switchCamera: ReturnType<typeof vi.fn>
  }
  type CallServiceInstance = {
    acceptIncomingCall: ReturnType<typeof vi.fn>
    sendRinging: ReturnType<typeof vi.fn>
    endCall: ReturnType<typeof vi.fn>
    declineCall: ReturnType<typeof vi.fn>
    cleanup: ReturnType<typeof vi.fn>
    getSession: ReturnType<typeof vi.fn>
  }

  return {
    spectreState: { enabled: false },
    torEnabled: false,
    appStateListeners: [] as Array<(state: string) => void>,
    managerInstances: [] as ManagerInstance[],
    callServiceInstances: [] as CallServiceInstance[],
    startCallImpl: vi.fn(async (..._args: unknown[]) => ({
      session: { id: 'a1', callType: 'voice' },
      invitationMessage: '[QCALL:a1:voice:key]',
    })),
    startOutgoingNegotiationImpl: vi.fn(async (..._args: unknown[]) => {}),
    answerCallImpl: vi.fn(async (..._args: unknown[]) => {}),
    acceptIncomingCallImpl: vi.fn(async (..._args: unknown[]) => {}),
    sendQuantumMessage: vi.fn(async (..._args: unknown[]): Promise<{ success: boolean; error?: string }> => ({ success: true })),
    getCallSessionSnapshot: vi.fn(async () => null),
    recordCallDiagnostic: vi.fn(),
  }
})

vi.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: vi.fn((_event: string, listener: (state: string) => void) => {
      quantumMocks.appStateListeners.push(listener)
      return { remove: vi.fn() }
    }),
  },
  Platform: {
    OS: 'ios',
  },
  View: 'View',
}))

vi.mock('@/store/spectreStore', () => ({
  useSpectreStore: {
    getState: () => quantumMocks.spectreState,
  },
}))

vi.mock('../services/quantumChat', () => ({
  sendMessage: quantumMocks.sendQuantumMessage,
}))

vi.mock('../services/call/callLifecycleUtils', () => ({
  resolveLocalCallEndReason: (state: string | null, isIncoming: boolean) => (
    state === 'ringing' && isIncoming ? 'declined' : 'completed'
  ),
}))

vi.mock('../services/call', () => {
  function WebRTCManager(this: Record<string, unknown>, callbacks: Record<string, (...args: unknown[]) => void>) {
    const session = { id: 'a1', callType: 'voice' }
    const instance = {
      callbacks,
      startCall: vi.fn((...args: unknown[]) => quantumMocks.startCallImpl(...args)),
      startOutgoingNegotiation: vi.fn(() => quantumMocks.startOutgoingNegotiationImpl()),
      answerCall: vi.fn((...args: unknown[]) => quantumMocks.answerCallImpl(...args)),
      declineCall: vi.fn(async () => {}),
      endCall: vi.fn(async () => {}),
      dispose: vi.fn(),
      getSession: vi.fn(() => session),
      getDuration: vi.fn(() => 1000),
      toggleMute: vi.fn(() => true),
      toggleVideo: vi.fn(async () => true),
      toggleSpeaker: vi.fn(() => true),
      switchCamera: vi.fn(async () => {}),
    }
    quantumMocks.managerInstances.push(instance)
    Object.assign(this, instance)
  }

  function CallService(this: Record<string, unknown>) {
    const instance = {
      acceptIncomingCall: vi.fn((...args: unknown[]) => quantumMocks.acceptIncomingCallImpl(...args)),
      sendRinging: vi.fn(async () => {}),
      endCall: vi.fn(async () => {}),
      declineCall: vi.fn(async () => {}),
      cleanup: vi.fn(),
      getSession: vi.fn(() => ({ id: 'incoming-session' })),
    }
    quantumMocks.callServiceInstances.push(instance)
    Object.assign(this, instance)
  }

  return {
    WebRTCManager,
    CallService,
    getCallSessionSnapshot: quantumMocks.getCallSessionSnapshot,
    isLiveIncomingCallState: (state: string) => ['initiating', 'ringing', 'connecting'].includes(state),
    parseCallInvitation: (message: string) => {
      const match = message.match(/^\[QCALL:([a-f0-9-]+):(voice|video):([A-Za-z0-9+/=]+)\]$/)
      if (!match) return null
      return { sessionId: match[1], callType: match[2], encryptionKey: match[3] }
    },
    isCallInvitation: (message: string) => /^\[QCALL:([a-f0-9-]+):(voice|video):([A-Za-z0-9+/=]+)\]$/.test(message),
    shouldIgnoreCallStateTransition: () => false,
    recordCallDiagnostic: quantumMocks.recordCallDiagnostic,
    describeCallError: (error: unknown) => error instanceof Error ? error.message : String(error),
    getCallAdmissionBlockReason: () => (
      quantumMocks.spectreState.enabled ? 'spectre' : quantumMocks.torEnabled ? 'tor' : null
    ),
    assertCallAdmission: () => {
      if (quantumMocks.spectreState.enabled) {
        throw new Error('Calls are disabled in Spectre Mode.')
      }
      if (quantumMocks.torEnabled) {
        throw new Error('Calls are unavailable while Tor mode is active.')
      }
    },
  }
})

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

describe('useQuantumCall', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.useRealTimers()
    quantumMocks.spectreState.enabled = false
    quantumMocks.torEnabled = false
    quantumMocks.appStateListeners = []
    quantumMocks.managerInstances = []
    quantumMocks.callServiceInstances = []
    quantumMocks.startCallImpl.mockResolvedValue({
      session: { id: 'a1', callType: 'voice' },
      invitationMessage: '[QCALL:a1:voice:key]',
    })
    quantumMocks.startOutgoingNegotiationImpl.mockResolvedValue(undefined)
    quantumMocks.answerCallImpl.mockResolvedValue(undefined)
    quantumMocks.acceptIncomingCallImpl.mockResolvedValue(undefined)
    quantumMocks.sendQuantumMessage.mockResolvedValue({ success: true })
    quantumMocks.getCallSessionSnapshot.mockResolvedValue(null)
    const { Platform } = await import('react-native')
    ;(Platform as { OS: string }).OS = 'ios'
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('rejects outgoing calls while Spectre Mode is enabled', async () => {
    quantumMocks.spectreState.enabled = true
    const harness = renderHook(() => useQuantumCall())

    await act(async () => {
      await expect(harness.result.startCall('me', 'peer', 'conv-1', 'voice')).rejects.toThrow(
        'Calls are disabled in Spectre Mode.',
      )
    })

    expect(harness.result.error?.message).toBe('Calls are disabled in Spectre Mode.')
    expect(quantumMocks.managerInstances).toHaveLength(0)
  })

  it('rejects outgoing calls while Tor is active', async () => {
    quantumMocks.torEnabled = true
    const harness = renderHook(() => useQuantumCall())

    await act(async () => {
      await expect(harness.result.startCall('me', 'peer', 'conv-1', 'voice')).rejects.toThrow(
        'Calls are unavailable while Tor mode is active.',
      )
    })

    expect(quantumMocks.managerInstances).toHaveLength(0)
  })

  it('cleans up outgoing setup when sending the invitation fails', async () => {
    quantumMocks.sendQuantumMessage.mockResolvedValue({ success: false, error: 'network failed' })
    const harness = renderHook(() => useQuantumCall())

    await act(async () => {
      await expect(harness.result.startCall('me', 'peer', 'conv-1', 'voice')).rejects.toThrow('network failed')
    })

    const manager = quantumMocks.managerInstances[0]
    expect(manager.endCall).toHaveBeenCalledWith('network_error')
    expect(harness.result.callState).toBeNull()
    expect(harness.result.session).toBeNull()
    expect(harness.result.error?.message).toBe('network failed')
  })

  it('starts outgoing calls on iOS through the existing negotiation path', async () => {
    const harness = renderHook(() => useQuantumCall())

    await act(async () => {
      await expect(harness.result.startCall('me', 'peer', 'conv-1', 'video')).resolves.toBe('[QCALL:a1:voice:key]')
    })

    const manager = quantumMocks.managerInstances[0]
    expect(manager.startCall).toHaveBeenCalledWith('me', 'peer', 'conv-1', 'video')
    expect(quantumMocks.sendQuantumMessage).toHaveBeenCalledWith('peer', '[QCALL:a1:voice:key]')
    expect(manager.startOutgoingNegotiation).toHaveBeenCalledTimes(1)
    expect(harness.result.session).toEqual({ id: 'a1', callType: 'voice' })
  })

  it('reports a controlled error if outgoing setup is cleaned before negotiation', async () => {
    quantumMocks.sendQuantumMessage.mockImplementation(async () => {
      quantumMocks.managerInstances[0].callbacks.onCallEnded('cancelled')
      return { success: true }
    })
    const harness = renderHook(() => useQuantumCall())

    await act(async () => {
      await expect(harness.result.startCall('me', 'peer', 'conv-1', 'voice')).rejects.toThrow(
        'Call setup was interrupted. Please try again.',
      )
    })

    const manager = quantumMocks.managerInstances[0]
    expect(manager.startOutgoingNegotiation).not.toHaveBeenCalled()
    expect(manager.dispose).toHaveBeenCalled()
    expect(harness.result.callState).toBeNull()
    expect(harness.result.error?.message).toBe('Call setup was interrupted. Please try again.')
  })

  it('keeps Android outgoing setup alive during transient background before negotiation', async () => {
    const { Platform } = await import('react-native')
    ;(Platform as { OS: string }).OS = 'android'
    const pendingInvitation = deferred()
    quantumMocks.sendQuantumMessage.mockReturnValue(pendingInvitation.promise.then(() => ({ success: true })))
    const harness = renderHook(() => useQuantumCall())

    let callPromise!: Promise<string>
    await act(async () => {
      callPromise = harness.result.startCall('me', 'peer', 'conv-1', 'voice')
      await flushPromises()
    })

    const manager = quantumMocks.managerInstances[0]
    act(() => {
      quantumMocks.appStateListeners.forEach((listener) => listener('background'))
    })

    expect(manager.endCall).not.toHaveBeenCalledWith('cancelled')

    pendingInvitation.resolve()
    await act(async () => {
      await expect(callPromise).resolves.toBe('[QCALL:a1:voice:key]')
    })

    expect(manager.startOutgoingNegotiation).toHaveBeenCalledTimes(1)
    expect(harness.result.session).toEqual({ id: 'a1', callType: 'voice' })
  })

  it('rejects non-call and malformed incoming invitations', () => {
    const harness = renderHook(() => useQuantumCall())

    expect(harness.result.handleCallInvitation('hello', 'me', 'conv-1', 'peer')).toBe(false)
    expect(harness.result.handleCallInvitation('[QCALL:]', 'me', 'conv-1', 'peer')).toBe(false)
    expect(quantumMocks.callServiceInstances).toHaveLength(0)
  })

  it('marks unanswered incoming calls as missed after the ringing timeout', async () => {
    vi.useFakeTimers()
    const harness = renderHook(() => useQuantumCall())

    act(() => {
      expect(harness.result.handleCallInvitation('[QCALL:b1:voice:key]', 'me', 'conv-1', 'peer')).toBe(true)
    })
    await flushPromises()

    const service = quantumMocks.callServiceInstances[0]
    act(() => {
      vi.advanceTimersByTime(45_000)
    })

    expect(service.endCall).toHaveBeenCalledWith('missed')
    expect(harness.result.callState).toBeNull()
  })

  it('terminalizes an incoming session when preparation completes after the ringing deadline', async () => {
    vi.useFakeTimers()
    try {
      const pendingAccept = deferred()
      quantumMocks.acceptIncomingCallImpl.mockReturnValue(pendingAccept.promise)
      const harness = renderHook(() => useQuantumCall())

      act(() => {
        harness.result.handleCallInvitation('[QCALL:b1:voice:key]', 'me', 'conv-1', 'peer')
      })
      const service = quantumMocks.callServiceInstances[0]

      act(() => {
        vi.advanceTimersByTime(45_000)
      })
      expect(harness.result.callState).toBeNull()

      pendingAccept.resolve()
      await flushPromises()

      expect(service.endCall).toHaveBeenCalledWith('missed')
      expect(service.sendRinging).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not start a second answer while an answer is already in flight', async () => {
    const pendingAnswer = deferred()
    quantumMocks.answerCallImpl.mockReturnValue(pendingAnswer.promise)
    const harness = renderHook(() => useQuantumCall())

    act(() => {
      harness.result.handleCallInvitation('[QCALL:b1:voice:key]', 'me', 'conv-1', 'peer')
    })
    await flushPromises()

    let first!: Promise<void>
    let second!: Promise<void>
    await act(async () => {
      first = harness.result.answerCall()
      second = harness.result.answerCall()
    })

    expect(quantumMocks.managerInstances[0].answerCall).toHaveBeenCalledTimes(1)
    pendingAnswer.resolve()
    await act(async () => {
      await Promise.all([first, second])
    })
  })

  it('does not resurrect a prepared incoming service after decline cleanup', async () => {
    const pendingAccept = deferred()
    quantumMocks.acceptIncomingCallImpl.mockReturnValue(pendingAccept.promise)
    const harness = renderHook(() => useQuantumCall())

    act(() => {
      harness.result.handleCallInvitation('[QCALL:b1:voice:key]', 'me', 'conv-1', 'peer')
    })
    const service = quantumMocks.callServiceInstances[0]

    await act(async () => {
      await harness.result.declineCall()
    })

    pendingAccept.resolve()
    await flushPromises()

    expect(service.endCall).toHaveBeenCalledWith('declined')
    expect(service.sendRinging).not.toHaveBeenCalled()
    expect(service.cleanup).toHaveBeenCalled()
    expect(harness.result.callState).toBeNull()
  })
})
