/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const storageMocks = vi.hoisted(() => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
}))

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: storageMocks.getItem,
    setItem: storageMocks.setItem,
  },
}))

import {
  clearCallDiagnosticEvents,
  getRecentCallDiagnosticEvents,
} from './callDiagnostics'
import {
  CALL_SESSION_REGISTRY_KEY,
  clearPendingIncomingCallSession,
  getPendingIncomingCallSession,
  getPendingIncomingCallSessions,
  markCallSessionHandled,
  normalizeIncomingCallPushPayload,
  rememberIncomingCallSession,
  subscribeToIncomingCallSessionChanges,
} from './callSessionRegistry'

function lastStoredRegistry() {
  const raw = storageMocks.setItem.mock.calls.at(-1)?.[1]
  return raw ? JSON.parse(raw) : null
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-04-18T12:00:00.000Z'))
  storageMocks.getItem.mockReset()
  storageMocks.setItem.mockReset()
  clearCallDiagnosticEvents()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('callSessionRegistry', () => {
  it('recovers from corrupted registry JSON and writes a clean pending session', async () => {
    storageMocks.getItem.mockResolvedValueOnce('{bad json')

    const payload = normalizeIncomingCallPushPayload({
      type: 'call',
      callSessionId: 'session-1',
      callType: 'voice',
      callerIdentityId: 'caller-1',
      notificationScopeId: `nsc1.${'a'.repeat(32)}`,
    }, 'expo')

    await rememberIncomingCallSession(payload!)

    expect(storageMocks.setItem).toHaveBeenCalledWith(
      CALL_SESSION_REGISTRY_KEY,
      expect.any(String),
    )
    expect(lastStoredRegistry()).toMatchObject({
      pending: {
        'session-1': {
          callSessionId: 'session-1',
          callerIdentityId: 'caller-1',
          notificationScopeId: `nsc1.${'a'.repeat(32)}`,
        },
      },
      handled: {},
    })
    expect(getRecentCallDiagnosticEvents().map((event) => event.name)).toEqual(
      expect.arrayContaining(['registry_read_failed']),
    )
  })

  it('prunes expired pending and handled entries when reading', async () => {
    const now = Date.now()
    storageMocks.getItem.mockResolvedValueOnce(JSON.stringify({
      handled: {
        recentHandled: now - 60_000,
        expiredHandled: now - 8 * 24 * 60 * 60 * 1000,
      },
      pending: {
        recentPending: {
          type: 'call',
          callSessionId: 'recentPending',
          callType: 'video',
          receivedAt: now - 60_000,
          source: 'expo',
        },
        expiredPending: {
          type: 'call',
          callSessionId: 'expiredPending',
          callType: 'voice',
          receivedAt: now - 3 * 60 * 60 * 1000,
          source: 'expo',
        },
      },
    }))

    const pending = await getPendingIncomingCallSession('expiredPending')

    expect(pending).toBeNull()
  })

  it('returns the latest pending incoming call when no session id is provided', async () => {
    storageMocks.getItem.mockResolvedValueOnce(JSON.stringify({
      handled: {},
      pending: {
        older: {
          type: 'call',
          callSessionId: 'older',
          callType: 'voice',
          receivedAt: Date.now() - 5_000,
          source: 'expo',
        },
        newer: {
          type: 'call',
          callSessionId: 'newer',
          callType: 'video',
          receivedAt: Date.now() - 1_000,
          source: 'expo',
        },
      },
    }))

    const pending = await getPendingIncomingCallSession()

    expect(pending?.callSessionId).toBe('newer')
  })

  it('keeps valid notification scopes with pending calls for account-bound recovery', async () => {
    const scopeId = `nsc1.${'a'.repeat(32)}`
    storageMocks.getItem.mockResolvedValueOnce(JSON.stringify({
      handled: {},
      pending: {
        scoped: {
          type: 'call',
          callSessionId: 'scoped',
          callType: 'voice',
          notificationScopeId: scopeId,
          receivedAt: Date.now(),
          source: 'expo',
        },
      },
    }))

    const pending = await getPendingIncomingCallSessions()

    expect(pending).toEqual([
      expect.objectContaining({
        callSessionId: 'scoped',
        notificationScopeId: scopeId,
      }),
    ])
  })

  it('clears pending sessions and marks sessions handled with TTL-backed timestamps', async () => {
    const registry = {
      handled: {},
      pending: {
        'session-1': {
          type: 'call',
          callSessionId: 'session-1',
          callType: 'voice',
          receivedAt: Date.now(),
          source: 'expo',
        },
      },
    }

    storageMocks.getItem.mockResolvedValueOnce(JSON.stringify(registry))
    await clearPendingIncomingCallSession('session-1')
    expect(lastStoredRegistry()).toEqual({ handled: {}, pending: {} })

    storageMocks.getItem.mockResolvedValueOnce(JSON.stringify(registry))
    await markCallSessionHandled('session-1')
    expect(lastStoredRegistry()).toEqual({
      handled: { 'session-1': Date.now() },
      pending: {},
    })
  })

  it('normalizes call_end payloads without requiring a call type', () => {
    const payload = normalizeIncomingCallPushPayload({
      type: 'call_end',
      sessionId: 'session-ended',
      reason: 'missed',
      remoteIdentityId: 'caller-1',
    }, 'message')

    expect(payload).toMatchObject({
      type: 'call_end',
      callSessionId: 'session-ended',
      callerIdentityId: 'caller-1',
      endReason: 'missed',
      source: 'message',
    })
  })

  it('does not resurrect a handled session when a delayed call push arrives', async () => {
    storageMocks.getItem.mockResolvedValueOnce(JSON.stringify({
      handled: { 'session-ended': Date.now() },
      pending: {},
    }))

    await expect(rememberIncomingCallSession({
      type: 'call',
      callSessionId: 'session-ended',
      callType: 'voice',
      receivedAt: Date.now(),
      source: 'expo',
    })).resolves.toBe(false)

    expect(storageMocks.setItem).not.toHaveBeenCalled()
    expect(getRecentCallDiagnosticEvents()).toContainEqual(expect.objectContaining({
      name: 'remember_incoming_call_session_skipped',
      fields: expect.objectContaining({
        sessionId: expect.any(String),
        reason: 'already_handled',
      }),
    }))
  })

  it('does not rewrite or re-present a duplicate pending session', async () => {
    storageMocks.getItem.mockResolvedValueOnce(JSON.stringify({
      handled: {},
      pending: {
        'session-pending': {
          type: 'call',
          callSessionId: 'session-pending',
          callType: 'voice',
          receivedAt: Date.now(),
          source: 'expo',
        },
      },
    }))

    await expect(rememberIncomingCallSession({
      type: 'call',
      callSessionId: 'session-pending',
      callType: 'voice',
      receivedAt: Date.now(),
      source: 'expo',
    })).resolves.toBe(false)

    expect(storageMocks.setItem).not.toHaveBeenCalled()
    expect(getRecentCallDiagnosticEvents()).toContainEqual(expect.objectContaining({
      name: 'remember_incoming_call_session_skipped',
      fields: expect.objectContaining({ reason: 'already_pending' }),
    }))
  })

  it('notifies in-memory observers after a pending session is persisted', async () => {
    const listener = vi.fn()
    const unsubscribe = subscribeToIncomingCallSessionChanges(listener)
    try {
      await expect(rememberIncomingCallSession({
        type: 'call',
        callSessionId: 'session-observed',
        callType: 'voice',
        receivedAt: Date.now(),
        source: 'expo',
      })).resolves.toBe(true)

      expect(listener).toHaveBeenCalledOnce()
    } finally {
      unsubscribe()
    }
  })
})
