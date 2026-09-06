/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  taskHandler: null as null | ((event: { data: Record<string, unknown>; error?: Error | null }) => Promise<void>),
  isTaskDefined: vi.fn(() => false),
  defineTask: vi.fn((_name: string, handler: (event: { data: Record<string, unknown>; error?: Error | null }) => Promise<void>) => {
    mockState.taskHandler = handler
  }),
  isTaskRegisteredAsync: vi.fn(async () => false),
  registerTaskAsync: vi.fn(async () => {}),
  unregisterTaskAsync: vi.fn(async () => {}),
  isAuthorizedCallNotificationPayload: vi.fn(async () => true),
  getPresentedNotificationsAsync: vi.fn(async () => [] as Array<{ request: { identifier: string; content: { data?: Record<string, unknown> } } }>),
  dismissNotificationAsync: vi.fn(async () => {}),
  normalizeIncomingCallPushPayload: vi.fn((raw: Record<string, unknown> | null | undefined) => {
    if (
      raw
      && (raw.type === 'call' || raw.type === 'call_end')
      && typeof raw.callSessionId === 'string'
    ) {
      return {
        type: raw.type,
        callSessionId: raw.callSessionId,
        callType: raw.callType ?? 'voice',
        notificationScopeId: raw.notificationScopeId,
        callerIdentityId: raw.callerIdentityId ?? raw.remoteIdentityId,
        endReason: raw.endReason,
      }
    }
    return null
  }),
  rememberIncomingCallSession: vi.fn(async () => true),
  clearPendingIncomingCallSession: vi.fn(async () => {}),
  markCallSessionHandled: vi.fn(async () => {}),
  recordCallDiagnostic: vi.fn(),
  appState: { currentState: 'active' },
  platform: { OS: 'ios' },
  spectreState: { enabled: false },
  enqueueMessagingPush: vi.fn(async () => false),
}))

vi.mock('expo-task-manager', () => ({
  isTaskDefined: mockState.isTaskDefined,
  defineTask: mockState.defineTask,
  isTaskRegisteredAsync: mockState.isTaskRegisteredAsync,
}))

vi.mock('expo-notifications', () => ({
  registerTaskAsync: mockState.registerTaskAsync,
  unregisterTaskAsync: mockState.unregisterTaskAsync,
  getPresentedNotificationsAsync: mockState.getPresentedNotificationsAsync,
  dismissNotificationAsync: mockState.dismissNotificationAsync,
}))

vi.mock('react-native', () => ({
  AppState: mockState.appState,
  Platform: mockState.platform,
}))

vi.mock('../call/callSessionRegistry', () => ({
  normalizeIncomingCallPushPayload: mockState.normalizeIncomingCallPushPayload,
  rememberIncomingCallSession: mockState.rememberIncomingCallSession,
  clearPendingIncomingCallSession: mockState.clearPendingIncomingCallSession,
  markCallSessionHandled: mockState.markCallSessionHandled,
}))

vi.mock('../call/callDiagnostics', () => ({
  describeCallError: (error: unknown) => error instanceof Error ? error.message : String(error),
  recordCallDiagnostic: mockState.recordCallDiagnostic,
}))

vi.mock('@/store/spectreStore', () => ({
  useSpectreStore: {
    getState: () => mockState.spectreState,
  },
}))

vi.mock('./notificationCoordinator', () => ({
  enqueueMessagingPush: mockState.enqueueMessagingPush,
}))

vi.mock('./callNotificationAuthorization', () => ({
  isAuthorizedCallNotificationPayload: mockState.isAuthorizedCallNotificationPayload,
}))

async function importCallNotificationTask() {
  vi.resetModules()
  return import('./callNotificationTask')
}

describe('callNotificationTask audit behavior', () => {
  beforeEach(() => {
    mockState.taskHandler = null
    mockState.spectreState.enabled = false
    mockState.appState.currentState = 'active'
    mockState.platform.OS = 'ios'
    vi.clearAllMocks()
    mockState.isTaskDefined.mockReturnValue(false)
    mockState.isTaskRegisteredAsync.mockResolvedValue(false)
    mockState.getPresentedNotificationsAsync.mockResolvedValue([])
    mockState.enqueueMessagingPush.mockResolvedValue(false)
    mockState.isAuthorizedCallNotificationPayload.mockResolvedValue(true)
    mockState.rememberIncomingCallSession.mockResolvedValue(true)
  })

  it('defines the headless task once and parses JSON dataString payloads', async () => {
    mockState.appState.currentState = 'background'
    await importCallNotificationTask()

    expect(mockState.defineTask).toHaveBeenCalledWith(
      'spectra-call-notification-task',
      expect.any(Function),
    )

    await mockState.taskHandler?.({
      data: {
        notification: {},
        data: {
          dataString: JSON.stringify({
            type: 'call',
            callSessionId: 'call-1',
            callType: 'video',
            localWalletAddress: 'EXO_ROOT',
          }),
        },
      },
    })

    expect(mockState.enqueueMessagingPush).toHaveBeenCalledWith({
      type: 'call',
      callSessionId: 'call-1',
      callType: 'video',
      localWalletAddress: 'EXO_ROOT',
    }, 'background')
    expect(mockState.rememberIncomingCallSession).toHaveBeenCalledWith(
      expect.objectContaining({ callSessionId: 'call-1', callType: 'video' }),
    )
  })

  it('records sealed message wakeups from the headless notification task', async () => {
    await importCallNotificationTask()

    await mockState.taskHandler?.({
      data: {
        notification: {},
        data: {
          notificationScopeId: 'nsc1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          notificationEventId: 'nev1.11111111111111111111111111111111',
        },
      },
    })

    expect(mockState.enqueueMessagingPush).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationScopeId: 'nsc1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      }),
      'background',
    )
    expect(mockState.rememberIncomingCallSession).not.toHaveBeenCalled()
  })

  it('falls back to direct task data when dataString is malformed', async () => {
    await importCallNotificationTask()

    await mockState.taskHandler?.({
      data: {
        notification: {},
        data: {
          dataString: '{not-json',
          type: 'call',
          callSessionId: 'call-2',
          callType: 'voice',
        },
      },
    })

    expect(mockState.normalizeIncomingCallPushPayload).toHaveBeenCalledWith(
      expect.objectContaining({
        dataString: '{not-json',
        type: 'call',
        callSessionId: 'call-2',
      }),
      'expo',
    )
    expect(mockState.rememberIncomingCallSession).toHaveBeenCalledWith(
      expect.objectContaining({ callSessionId: 'call-2' }),
    )
  })

  it('records Expo call payloads for notification-first recovery', async () => {
    const { handleIncomingCallNotificationPayload } = await importCallNotificationTask()

    await handleIncomingCallNotificationPayload({
      type: 'call',
      callSessionId: 'call-active',
      callType: 'voice',
      notificationScopeId: `nsc1.${'a'.repeat(32)}`,
    })

    expect(mockState.rememberIncomingCallSession).toHaveBeenCalledWith(
      expect.objectContaining({
        callSessionId: 'call-active',
        notificationScopeId: `nsc1.${'a'.repeat(32)}`,
      }),
    )
  })

  it('records Android background calls for later recovery', async () => {
    mockState.platform.OS = 'android'
    mockState.appState.currentState = 'background'
    const { handleIncomingCallNotificationPayload } = await importCallNotificationTask()

    await handleIncomingCallNotificationPayload({
      type: 'call',
      callSessionId: 'call-background',
      callType: 'voice',
      remoteIdentityId: 'caller-1',
    })

    expect(mockState.rememberIncomingCallSession).toHaveBeenCalledWith(
      expect.objectContaining({ callSessionId: 'call-background' }),
    )
  })

  it('fails closed before JS call presentation when locked storage cannot authorize the scope', async () => {
    mockState.platform.OS = 'android'
    mockState.appState.currentState = 'background'
    mockState.isAuthorizedCallNotificationPayload.mockResolvedValue(false)
    const { handleIncomingCallNotificationPayload } = await importCallNotificationTask()

    const handled = await handleIncomingCallNotificationPayload({
      type: 'call',
      callSessionId: 'call-locked',
      callType: 'voice',
      notificationProtocolVersion: 2,
      notificationScopeId: `nsc1.${'a'.repeat(32)}`,
      calleeIdentityId: 'callee',
    })

    expect(handled).toBe(false)
    expect(mockState.normalizeIncomingCallPushPayload).not.toHaveBeenCalled()
    expect(mockState.rememberIncomingCallSession).not.toHaveBeenCalled()
  })

  it('does not queue chat reconciliation for an unauthorized background call', async () => {
    mockState.platform.OS = 'android'
    mockState.appState.currentState = 'background'
    mockState.isAuthorizedCallNotificationPayload.mockResolvedValue(false)
    await importCallNotificationTask()

    await mockState.taskHandler?.({
      data: {
        notification: {},
        data: {
          type: 'call',
          callSessionId: 'call-untrusted',
          callType: 'voice',
          notificationScopeId: `nsc1.${'a'.repeat(32)}`,
          notificationEventId: `nev1.${'b'.repeat(32)}`,
        },
      },
    })

    expect(mockState.enqueueMessagingPush).not.toHaveBeenCalled()
    expect(mockState.rememberIncomingCallSession).not.toHaveBeenCalled()
  })

  it('does not re-record stale or duplicate sessions', async () => {
    mockState.platform.OS = 'android'
    mockState.appState.currentState = 'background'
    const { handleIncomingCallNotificationPayload } = await importCallNotificationTask()

    mockState.rememberIncomingCallSession.mockResolvedValueOnce(false)
    await handleIncomingCallNotificationPayload({
      type: 'call',
      callSessionId: 'call-duplicate',
      callType: 'voice',
    })

    expect(mockState.rememberIncomingCallSession).toHaveBeenCalledTimes(1)
  })

  it('suppresses incoming call handling while Spectre mode is enabled', async () => {
    mockState.spectreState.enabled = true
    const { handleIncomingCallNotificationPayload } = await importCallNotificationTask()

    await handleIncomingCallNotificationPayload({
      type: 'call',
      callSessionId: 'call-spectre',
      callType: 'voice',
    })

    expect(mockState.normalizeIncomingCallPushPayload).not.toHaveBeenCalled()
    expect(mockState.rememberIncomingCallSession).not.toHaveBeenCalled()
  })

  it('handles call-end payloads by clearing and dismissing notifications', async () => {
    mockState.getPresentedNotificationsAsync.mockResolvedValue([
      {
        request: {
          identifier: 'notification-1',
          content: { data: { type: 'call', callSessionId: 'call-ended' } },
        },
      },
      {
        request: {
          identifier: 'notification-2',
          content: { data: { type: 'call', callSessionId: 'other-call' } },
        },
      },
    ])
    const { handleIncomingCallNotificationPayload } = await importCallNotificationTask()

    await handleIncomingCallNotificationPayload({
      type: 'call_end',
      callSessionId: 'call-ended',
      endReason: 'remote_hangup',
    })

    expect(mockState.clearPendingIncomingCallSession).toHaveBeenCalledWith('call-ended')
    expect(mockState.markCallSessionHandled).toHaveBeenCalledWith('call-ended')
    expect(mockState.dismissNotificationAsync).toHaveBeenCalledWith('notification-1')
    expect(mockState.dismissNotificationAsync).not.toHaveBeenCalledWith('notification-2')
  })

  it('registers the notification task only when not already registered', async () => {
    const { registerCallNotificationTask } = await importCallNotificationTask()

    mockState.isTaskRegisteredAsync.mockResolvedValueOnce(true)
    await registerCallNotificationTask()
    expect(mockState.registerTaskAsync).not.toHaveBeenCalled()

    mockState.isTaskRegisteredAsync.mockResolvedValueOnce(false)
    await registerCallNotificationTask()
    expect(mockState.registerTaskAsync).toHaveBeenCalledWith('spectra-call-notification-task')
  })
})
