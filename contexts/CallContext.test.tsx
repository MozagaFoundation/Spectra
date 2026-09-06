/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from '@testing-library/react-native'
import { flushPromises, renderHook } from '@/test/hookTestHarness'
import { CallProvider, useCall, useCallPresentation } from './CallContext'

const callMocks = vi.hoisted(() => {
  const chatState = {
    messages: [] as Array<{
      id: string
      senderId: string
      senderName?: string
      senderAvatarUrl?: string | null
      content: string
      conversationId: string
      timestamp: number
    }>,
    contacts: [] as Array<{ identityId: string; displayName?: string; avatarUrl?: string | null }>,
    conversations: [] as Array<{ id: string; title?: string; avatarUrl?: string | null }>,
    isInitialized: true,
    isInitializing: false,
  }
  const subscribers = new Set<() => void>()
  const callRegistrySubscribers = new Set<() => void>()

  return {
    alert: vi.fn(),
    addAppStateListener: vi.fn(() => ({ remove: vi.fn() })),
    chatState,
    notifyChatSubscribers: () => {
      for (const subscriber of subscribers) subscriber()
    },
    subscribeToChat: vi.fn((subscriber: () => void) => {
      subscribers.add(subscriber)
      return () => subscribers.delete(subscriber)
    }),
    notifyCallRegistrySubscribers: () => {
      for (const subscriber of callRegistrySubscribers) subscriber()
    },
    clearCallRegistrySubscribers: () => {
      callRegistrySubscribers.clear()
    },
    subscribeToIncomingCallSessionChanges: vi.fn((subscriber: () => void) => {
      callRegistrySubscribers.add(subscriber)
      return () => callRegistrySubscribers.delete(subscriber)
    }),
    identity: { id: 'me' } as { id: string } | null,
    authState: { isAuthenticated: true, exoAddress: 'EXO_ROOT' as string | null },
    walletState: { isVaultUnlocked: true },
    spectreState: { enabled: false },
    torState: { enabled: false },
    quantum: {
      callState: null as null | string,
      localStream: null,
      remoteStream: null,
      remoteStreamVersion: 0,
      session: null as null | { id: string; callType?: 'voice' | 'video' },
      effectiveCallType: 'voice' as 'voice' | 'video',
      duration: 0,
      isMuted: false,
      isVideoEnabled: false,
      isSpeakerOn: false,
      error: null as Error | null,
      isIncoming: false,
      incomingCallInfo: null as null | { sessionId: string; callType: 'voice' | 'video' },
    },
    quantumStartCall: vi.fn(async () => '[QCALL:a1:voice:key]'),
    quantumHandleCallInvitation: vi.fn(() => true),
    answerCall: vi.fn(async () => {}),
    declineCall: vi.fn(async () => {}),
    endCall: vi.fn(async () => {}),
    toggleMute: vi.fn(),
    toggleVideo: vi.fn(async () => {}),
    toggleSpeaker: vi.fn(),
    switchCamera: vi.fn(async () => {}),
    snapshots: {} as Record<string, { calleeIdentityId?: string; state: string; updatedAt?: number } | null>,
    pendingIncoming: null as null | {
      callSessionId: string
      callerName?: string
      source?: string
      notificationScopeId?: string
    },
    pendingBySession: {} as Record<string, unknown>,
    getCallSessionSnapshot: vi.fn(async (sessionId: string) => callMocks.snapshots[sessionId] ?? null),
    getPendingIncomingCallSession: vi.fn(async (sessionId?: string) => (
      sessionId ? callMocks.pendingBySession[sessionId] ?? null : callMocks.pendingIncoming
    )),
    getPendingIncomingCallSessions: vi.fn(async () =>
      callMocks.pendingIncoming ? [callMocks.pendingIncoming] : []
    ),
    notificationScopes: new Map<string, string>(),
    rememberIncomingCallSession: vi.fn(async () => {}),
    markCallSessionHandled: vi.fn(async () => {}),
    setCallActivity: vi.fn(),
    recordCallDiagnostic: vi.fn(),
    dismissCallNotifications: vi.fn(async () => {}),
    reconcileQuantumChat: vi.fn(async () => {}),
  }
})

vi.mock('react-native', () => ({
  Alert: { alert: callMocks.alert },
  AppState: {
    currentState: 'active',
    addEventListener: callMocks.addAppStateListener,
  },
  View: 'View',
}))

vi.mock('@/hooks/useQuantumCall', () => ({
  useQuantumCall: () => ({
    ...callMocks.quantum,
    startCall: callMocks.quantumStartCall,
    handleCallInvitation: callMocks.quantumHandleCallInvitation,
    answerCall: callMocks.answerCall,
    declineCall: callMocks.declineCall,
    endCall: callMocks.endCall,
    toggleMute: callMocks.toggleMute,
    toggleVideo: callMocks.toggleVideo,
    toggleSpeaker: callMocks.toggleSpeaker,
    switchCamera: callMocks.switchCamera,
  }),
}))

vi.mock('@/store/chatStore', () => ({
  useChatStore: Object.assign(
    (selector: (state: typeof callMocks.chatState) => unknown) => selector(callMocks.chatState),
    {
      getState: () => callMocks.chatState,
      subscribe: callMocks.subscribeToChat,
    },
  ),
}))

vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector: (state: typeof callMocks.authState) => unknown) => selector(callMocks.authState),
}))

vi.mock('@/store/walletStore', () => ({
  useWalletStore: (selector: (state: typeof callMocks.walletState) => unknown) => selector(callMocks.walletState),
}))

vi.mock('@/store/spectreStore', () => ({
  useSpectreStore: Object.assign(
    (selector: (state: typeof callMocks.spectreState) => unknown) => selector(callMocks.spectreState),
    { getState: () => callMocks.spectreState },
  ),
}))

vi.mock('@/services/tor/torStore', () => ({
  useTorStore: Object.assign(
    (selector: (state: typeof callMocks.torState) => unknown) => selector(callMocks.torState),
    { getState: () => callMocks.torState },
  ),
}))

vi.mock('@/services/tor/torEgressPolicy', () => ({
  registerClearnetOperation: vi.fn(() => () => {}),
}))

vi.mock('@/services/chat', () => ({
  getIdentity: () => callMocks.identity,
}))

vi.mock('@/lib/i18n', () => ({
  translate: (key: string) => key,
}))

vi.mock('@/lib/callPresentation', () => ({
  canMinimizeCallUi: (state: string | null, isIncoming: boolean) => state === 'connected' && !isIncoming,
  shouldShowFullScreenCall: (state: string | null, _isIncoming: boolean, mode: string) => Boolean(state) && mode === 'fullscreen',
  shouldShowMinimizedCallBanner: (state: string | null, _isIncoming: boolean, mode: string) => Boolean(state) && mode === 'minimized',
}))

vi.mock('@/services/notifications/pushService', () => ({
  dismissCallNotifications: callMocks.dismissCallNotifications,
}))

vi.mock('@/services/quantumChat', () => ({
  reconcileQuantumChat: callMocks.reconcileQuantumChat,
}))

vi.mock('@/services/notifications/notificationScope', () => ({
  resolveNotificationScopeWallet: vi.fn(async (scopeId: string) =>
    callMocks.notificationScopes.get(scopeId) ?? null
  ),
}))

vi.mock('@/lib/accountScope', () => ({
  isSameAccountStorageScope: (left?: string | null, right?: string | null) =>
    Boolean(left && right && left.trim().toLowerCase() === right.trim().toLowerCase()),
}))

vi.mock('@/services/call', () => ({
  isCallInvitation: (message: string) => /^\[QCALL:([a-f0-9-]+):(voice|video):([A-Za-z0-9+/=]+)\]$/.test(message),
  parseCallInvitation: (message: string) => {
    const match = message.match(/^\[QCALL:([a-f0-9-]+):(voice|video):([A-Za-z0-9+/=]+)\]$/)
    if (!match) return null
    return { sessionId: match[1], callType: match[2], encryptionKey: match[3] }
  },
  getCallSessionSnapshot: callMocks.getCallSessionSnapshot,
  getPendingIncomingCallSession: callMocks.getPendingIncomingCallSession,
  getPendingIncomingCallSessions: callMocks.getPendingIncomingCallSessions,
  isLiveIncomingCallState: (state: string) => ['initiating', 'ringing', 'connecting'].includes(state),
  rememberIncomingCallSession: callMocks.rememberIncomingCallSession,
  markCallSessionHandled: callMocks.markCallSessionHandled,
  subscribeToIncomingCallSessionChanges: callMocks.subscribeToIncomingCallSessionChanges,
  setCallActivity: callMocks.setCallActivity,
  recordCallDiagnostic: callMocks.recordCallDiagnostic,
  describeCallError: (error: unknown) => error instanceof Error ? error.message : String(error),
  getCallAdmissionBlockReason: () => (
    callMocks.spectreState.enabled ? 'spectre' : callMocks.torState.enabled ? 'tor' : null
  ),
  assertCallAdmission: () => {
    if (callMocks.spectreState.enabled) {
      throw new Error('Calls are disabled in Spectre Mode.')
    }
    if (callMocks.torState.enabled) {
      throw new Error('Calls are unavailable while Tor mode is active.')
    }
  },
}))

function withCallProvider({ children }: { children: React.ReactNode }) {
  return <CallProvider>{children}</CallProvider>
}

describe('CallContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    callMocks.clearCallRegistrySubscribers()
    callMocks.chatState.messages = []
    callMocks.chatState.contacts = []
    callMocks.chatState.conversations = []
    callMocks.chatState.isInitialized = true
    callMocks.chatState.isInitializing = false
    callMocks.identity = { id: 'me' }
    callMocks.authState.isAuthenticated = true
    callMocks.authState.exoAddress = 'EXO_ROOT'
    callMocks.walletState.isVaultUnlocked = true
    callMocks.spectreState.enabled = false
    callMocks.torState.enabled = false
    callMocks.quantum.callState = null
    callMocks.quantum.session = null
    callMocks.quantum.effectiveCallType = 'voice'
    callMocks.quantum.error = null
    callMocks.quantum.isIncoming = false
    callMocks.quantum.incomingCallInfo = null
    callMocks.snapshots = {}
    callMocks.pendingIncoming = null
    callMocks.pendingBySession = {}
    callMocks.notificationScopes.clear()
    callMocks.quantumStartCall.mockResolvedValue('[QCALL:a1:voice:key]')
    callMocks.quantumHandleCallInvitation.mockReturnValue(true)
    callMocks.reconcileQuantumChat.mockResolvedValue(undefined)
  })

  it('throws when useCall is used outside CallProvider', () => {
    expect(() => renderHook(() => useCall())).toThrow('useCall must be used within a CallProvider')
  })

  it('blocks outgoing calls while Spectre Mode is enabled', async () => {
    callMocks.spectreState.enabled = true
    const harness = renderHook(() => useCall(), { wrapper: withCallProvider })

    let result = 'not-called'
    await act(async () => {
      result = await harness.result.startCall('me', 'peer', 'conv-1', 'voice')
    })

    expect(result).toBe('')
    expect(callMocks.quantumStartCall).not.toHaveBeenCalled()
    expect(callMocks.alert).toHaveBeenCalledWith(
      'Calls Disabled in Spectre Mode',
      'Voice and video calls are disabled while Spectre Mode is active.',
      [{ text: 'OK' }],
    )
  })

  it('blocks outgoing calls while Tor Mode is enabled', async () => {
    callMocks.torState.enabled = true
    const harness = renderHook(() => useCall(), { wrapper: withCallProvider })

    let result = 'not-called'
    await act(async () => {
      result = await harness.result.startCall('me', 'peer', 'conv-1', 'video')
    })

    expect(result).toBe('')
    expect(callMocks.quantumStartCall).not.toHaveBeenCalled()
    expect(callMocks.alert).toHaveBeenCalledWith(
      'Calls Unavailable in Tor Mode',
      expect.stringContaining('Settings > Network Privacy.'),
      [{ text: 'OK' }],
    )
  })

  it('ends an active call when Tor Mode is enabled', async () => {
    callMocks.quantum.callState = 'connected'
    callMocks.quantum.session = { id: 'session-tor', callType: 'voice' }
    const harness = renderHook(() => useCallPresentation(), { wrapper: withCallProvider })
    callMocks.endCall.mockClear()

    callMocks.torState.enabled = true
    await act(async () => {
      harness.rerender()
      await flushPromises()
    })
    expect(callMocks.endCall).toHaveBeenCalledTimes(1)
    expect(callMocks.recordCallDiagnostic).toHaveBeenCalledWith(
      'recovery',
      'context_active_call_ended_for_private_transport',
      expect.objectContaining({
        sessionId: 'session-tor',
        torEnabled: true,
      }),
    )
  })

  it('exposes presentation state and can minimize active calls', async () => {
    callMocks.quantum.callState = 'connected'
    callMocks.quantum.session = { id: 'session-1', callType: 'video' }
    callMocks.quantum.effectiveCallType = 'video'
    const harness = renderHook(() => useCallPresentation(), { wrapper: withCallProvider })

    expect(harness.result.showFullScreenCall).toBe(true)
    expect(harness.result.canMinimize).toBe(true)
    expect(harness.result.callType).toBe('video')

    await act(async () => {
      harness.result.minimizeCallUi()
    })

    expect(harness.result.showFullScreenCall).toBe(false)
    expect(harness.result.showMinimizedBanner).toBe(true)
  })

  it('shows incoming ringing in the application', () => {
    callMocks.quantum.callState = 'ringing'
    callMocks.quantum.isIncoming = true
    callMocks.quantum.incomingCallInfo = { sessionId: 'incoming-session', callType: 'voice' }

    const harness = renderHook(() => useCallPresentation(), { wrapper: withCallProvider })

    expect(harness.result.showFullScreenCall).toBe(true)
    expect(harness.result.showMinimizedBanner).toBe(false)
  })

  it('shows pending call recovery while chat bootstrap is still connecting', async () => {
    callMocks.chatState.isInitialized = false
    callMocks.chatState.isInitializing = true
    callMocks.pendingIncoming = {
      callSessionId: 'waiting-session',
      source: 'message',
    }

    const harness = renderHook(() => useCallPresentation(), { wrapper: withCallProvider })
    await flushPromises()

    expect(harness.result.pendingCallRecoveryPhase).toBe('chat')
    expect(harness.result.callState).toBeNull()
  })

  it('ignores self, expired, malformed, and wrong-callee invitations', async () => {
    const now = Date.now()
    callMocks.chatState.messages = [
      { id: 'self', senderId: 'me', content: '[QCALL:a1:voice:key]', conversationId: 'conv-1', timestamp: now },
      { id: 'expired', senderId: 'peer', content: '[QCALL:b2:voice:key]', conversationId: 'conv-1', timestamp: now - 6 * 60 * 1000 },
      { id: 'malformed', senderId: 'peer', content: '[QCALL:]', conversationId: 'conv-1', timestamp: now },
      { id: 'wrong', senderId: 'peer', content: '[QCALL:c3:voice:key]', conversationId: 'conv-1', timestamp: now },
    ]
    callMocks.snapshots.c3 = { calleeIdentityId: 'someone-else', state: 'ringing' }

    renderHook(() => useCall(), { wrapper: withCallProvider })
    await flushPromises()

    expect(callMocks.quantumHandleCallInvitation).not.toHaveBeenCalled()
    expect(callMocks.getCallSessionSnapshot).toHaveBeenCalledWith('c3')
    expect(callMocks.markCallSessionHandled).toHaveBeenCalledWith('c3')
  })

  it('accepts a validated live incoming invitation from chat messages', async () => {
    const now = Date.now()
    callMocks.chatState.messages = [
      { id: 'live', senderId: 'peer', senderName: 'Peer', content: '[QCALL:d4:voice:key]', conversationId: 'conv-1', timestamp: now },
    ]
    callMocks.chatState.contacts = [{ identityId: 'peer', displayName: 'Peer Contact', avatarUrl: 'avatar.png' }]
    callMocks.snapshots.d4 = { calleeIdentityId: 'me', state: 'ringing' }

    renderHook(() => useCall(), { wrapper: withCallProvider })
    await flushPromises()

    expect(callMocks.quantumHandleCallInvitation).toHaveBeenCalledWith(
      '[QCALL:d4:voice:key]',
      'me',
      'conv-1',
      'peer',
    )
    expect(callMocks.rememberIncomingCallSession).toHaveBeenCalledWith(expect.objectContaining({
      callSessionId: 'd4',
      callerIdentityId: 'peer',
      callerName: 'Peer Contact',
      conversationId: 'conv-1',
      source: 'message',
    }))
  })

  it('recovers a pending notification-first incoming session from the matching chat invitation', async () => {
    const scopeId = `nsc1.${'a'.repeat(32)}`
    callMocks.notificationScopes.set(scopeId, 'EXO_ROOT')
    callMocks.pendingIncoming = {
      callSessionId: 'e5',
      callerName: 'Caller',
      source: 'expo',
      notificationScopeId: scopeId,
    }
    callMocks.snapshots.e5 = { calleeIdentityId: 'me', state: 'ringing' }
    callMocks.reconcileQuantumChat.mockImplementation(async () => {
      callMocks.chatState.messages = [
        {
          id: 'pending-message',
          senderId: 'peer',
          content: '[QCALL:e5:video:key]',
          conversationId: 'conv-1',
          timestamp: Date.now(),
        },
      ]
      callMocks.notifyChatSubscribers()
    })

    renderHook(() => useCall(), { wrapper: withCallProvider })
    await flushPromises()

    expect(callMocks.reconcileQuantumChat).toHaveBeenCalledWith({
      fullResync: true,
      restartRealtime: true,
      reason: 'manual_recovery',
    })
    expect(callMocks.quantumHandleCallInvitation).toHaveBeenCalledTimes(1)
    expect(callMocks.quantumHandleCallInvitation).toHaveBeenCalledWith(
      '[QCALL:e5:video:key]',
      'me',
      'conv-1',
      'peer',
    )
  })

  it('starts recovery when a pending notification session arrives after the provider mounts', async () => {
    const scopeId = `nsc1.${'d'.repeat(32)}`
    callMocks.notificationScopes.set(scopeId, 'EXO_ROOT')
    callMocks.snapshots.f1 = { calleeIdentityId: 'me', state: 'ringing' }
    callMocks.reconcileQuantumChat.mockImplementation(async () => {
      callMocks.chatState.messages = [{
        id: 'late-message',
        senderId: 'peer',
        content: '[QCALL:f1:voice:key]',
        conversationId: 'conv-1',
        timestamp: Date.now(),
      }]
      callMocks.notifyChatSubscribers()
    })

    renderHook(() => useCall(), { wrapper: withCallProvider })
    await flushPromises()
    callMocks.reconcileQuantumChat.mockClear()

    await act(async () => {
      callMocks.pendingIncoming = {
        callSessionId: 'f1',
        source: 'expo',
        notificationScopeId: scopeId,
      }
      callMocks.notifyCallRegistrySubscribers()
      await flushPromises()
    })

    expect(callMocks.reconcileQuantumChat).toHaveBeenCalledWith({
      fullResync: true,
      restartRealtime: true,
      reason: 'manual_recovery',
    })
    expect(callMocks.quantumHandleCallInvitation).toHaveBeenCalledWith(
      '[QCALL:f1:voice:key]',
      'me',
      'conv-1',
      'peer',
    )
  })

  it('retries pending recovery when the local identity is temporarily unavailable', async () => {
    vi.useFakeTimers()
    try {
      const scopeId = `nsc1.${'e'.repeat(32)}`
      callMocks.notificationScopes.set(scopeId, 'EXO_ROOT')
      callMocks.identity = null
      callMocks.pendingIncoming = {
        callSessionId: 'identity-pending-session',
        source: 'expo',
        notificationScopeId: scopeId,
      }
      callMocks.snapshots['identity-pending-session'] = {
        calleeIdentityId: 'me',
        state: 'ringing',
      }

      renderHook(() => useCall(), { wrapper: withCallProvider })
      await flushPromises()

      expect(callMocks.recordCallDiagnostic).toHaveBeenCalledWith(
        'recovery',
        'context_pending_incoming_recovery_identity_unavailable',
        expect.objectContaining({ sessionId: 'identity-pending-session' }),
      )
      expect(callMocks.markCallSessionHandled).not.toHaveBeenCalledWith('identity-pending-session')

      callMocks.identity = { id: 'me' }
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_000)
        await flushPromises()
      })

      expect(callMocks.reconcileQuantumChat).toHaveBeenCalledWith({
        fullResync: true,
        restartRealtime: true,
        reason: 'manual_recovery',
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('lets the invitation watcher recover after a pending-session attempt fails', async () => {
    vi.useFakeTimers()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const scopeId = `nsc1.${'f'.repeat(32)}`
      const pendingCall = {
        callSessionId: 'f2',
        source: 'expo',
        notificationScopeId: scopeId,
      }
      callMocks.notificationScopes.set(scopeId, 'EXO_ROOT')
      callMocks.pendingIncoming = pendingCall
      callMocks.pendingBySession.f2 = pendingCall
      callMocks.snapshots.f2 = { calleeIdentityId: 'me', state: 'ringing' }
      callMocks.reconcileQuantumChat.mockRejectedValueOnce(new Error('network unavailable'))

      const harness = renderHook(() => useCall(), { wrapper: withCallProvider })
      await flushPromises()

      callMocks.chatState.messages = [{
        id: 'fallback-message',
        senderId: 'peer',
        content: '[QCALL:f2:voice:key]',
        conversationId: 'conv-1',
        timestamp: Date.now(),
      }]
      await act(async () => {
        harness.rerender()
        await flushPromises()
      })

      expect(callMocks.quantumHandleCallInvitation).toHaveBeenCalledWith(
        '[QCALL:f2:voice:key]',
        'me',
        'conv-1',
        'peer',
      )
    } finally {
      warnSpy.mockRestore()
      vi.clearAllTimers()
      vi.useRealTimers()
    }
  })

  it('does not consume a pending call for another wallet scope', async () => {
    const scopeId = `nsc1.${'c'.repeat(32)}`
    callMocks.notificationScopes.set(scopeId, 'EXO_OTHER')
    callMocks.pendingIncoming = {
      callSessionId: 'other-wallet-session',
      source: 'expo',
      notificationScopeId: scopeId,
    }

    renderHook(() => useCall(), { wrapper: withCallProvider })
    await flushPromises()

    expect(callMocks.getCallSessionSnapshot).not.toHaveBeenCalledWith('other-wallet-session')
    expect(callMocks.quantumHandleCallInvitation).not.toHaveBeenCalled()
    expect(callMocks.markCallSessionHandled).not.toHaveBeenCalledWith('other-wallet-session')
  })

  it('clears local recovery state immediately when an active call ends', async () => {
    callMocks.quantum.callState = 'connected'
    callMocks.quantum.session = { id: 'completed-session', callType: 'voice' }
    const harness = renderHook(() => useCallPresentation(), { wrapper: withCallProvider })

    callMocks.quantum.callState = null
    harness.rerender()
    await flushPromises()

    expect(harness.result.pendingCallRecoveryPhase).toBeNull()
    expect(callMocks.markCallSessionHandled).toHaveBeenCalledWith('completed-session')
    expect(callMocks.dismissCallNotifications).toHaveBeenCalledWith('completed-session')
  })

  it('retries a live pending session when its invitation is delayed', async () => {
    vi.useFakeTimers()
    try {
      const scopeId = `nsc1.${'b'.repeat(32)}`
      callMocks.notificationScopes.set(scopeId, 'EXO_ROOT')
      callMocks.pendingIncoming = {
        callSessionId: 'timed-out-session',
        callerName: 'Caller',
        source: 'expo',
        notificationScopeId: scopeId,
      }
      callMocks.snapshots['timed-out-session'] = { calleeIdentityId: 'me', state: 'ringing' }
      const harness = renderHook(() => useCallPresentation(), { wrapper: withCallProvider })
      await flushPromises()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(12_000)
      })
      await flushPromises()

      expect(harness.result.pendingCallRecoveryPhase).toBe('invitation')
      expect(callMocks.markCallSessionHandled).not.toHaveBeenCalledWith('timed-out-session')
    } finally {
      vi.useRealTimers()
    }
  })

})
