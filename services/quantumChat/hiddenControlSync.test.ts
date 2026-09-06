/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  recordChatDiagnostic: vi.fn(),
  getTorState: vi.fn(() => ({ enabled: false })),
}))

vi.mock('react-native', () => ({
  AppState: { currentState: 'active' },
}))

vi.mock('../chat/chatDiagnostics', () => ({
  recordChatDiagnostic: mocks.recordChatDiagnostic,
}))

vi.mock('../tor/torStore', () => ({
  useTorStore: {
    getState: mocks.getTorState,
  },
}))

import { resetTransientState } from './_state'
import {
  syncDirectDisappearingTimerState,
  syncDirectHiddenControlState,
} from './hiddenControlSync'

describe('hidden control sync coordinator', () => {
  beforeEach(() => {
    resetTransientState()
    vi.clearAllMocks()
    mocks.getTorState.mockReturnValue({ enabled: false })
  })

  it('treats same screenshot state for a different peer as a new recipient', async () => {
    const deliver = vi.fn(async () => true)

    await syncDirectHiddenControlState({
      controlType: 'screenshot_protection',
      remoteIdentityId: 'peer-a',
      enabled: true,
      source: 'bootstrap',
      deliver,
    })
    await syncDirectHiddenControlState({
      controlType: 'screenshot_protection',
      remoteIdentityId: 'peer-b',
      enabled: true,
      source: 'bootstrap',
      deliver,
    })

    expect(deliver).toHaveBeenCalledTimes(2)
    expect(mocks.recordChatDiagnostic).toHaveBeenCalledWith(
      'send',
      'hidden_control_sync_sent',
      expect.objectContaining({
        controlType: 'screenshot_protection',
        source: 'bootstrap',
        reason: 'new_recipient',
        recipientIdentityId: 'peer-b',
      }),
    )
  })

  it('suppresses duplicate screenshot syncs for the same peer', async () => {
    const deliver = vi.fn(async () => true)

    await syncDirectHiddenControlState({
      controlType: 'screenshot_protection',
      remoteIdentityId: 'peer-a',
      enabled: true,
      source: 'chat_screen',
      deliver,
    })
    await syncDirectHiddenControlState({
      controlType: 'screenshot_protection',
      remoteIdentityId: 'peer-a',
      enabled: true,
      source: 'chat_screen',
      deliver,
    })

    expect(deliver).toHaveBeenCalledTimes(1)
    expect(mocks.recordChatDiagnostic).toHaveBeenCalledWith(
      'send',
      'hidden_control_sync_skipped',
      expect.objectContaining({
        controlType: 'screenshot_protection',
        source: 'chat_screen',
        reason: 'duplicate_suppressed',
        recipientIdentityId: 'peer-a',
        inFlight: false,
      }),
    )
  })

  it('re-sends screenshot state when the preference changes', async () => {
    const deliver = vi.fn(async () => true)

    await syncDirectHiddenControlState({
      controlType: 'screenshot_protection',
      remoteIdentityId: 'peer-a',
      enabled: false,
      source: 'security_settings',
      deliver,
    })
    await syncDirectHiddenControlState({
      controlType: 'screenshot_protection',
      remoteIdentityId: 'peer-a',
      enabled: true,
      source: 'security_settings',
      deliver,
    })

    expect(deliver).toHaveBeenCalledTimes(2)
    expect(mocks.recordChatDiagnostic).toHaveBeenCalledWith(
      'send',
      'hidden_control_sync_sent',
      expect.objectContaining({
        controlType: 'screenshot_protection',
        source: 'security_settings',
        reason: 'state_changed',
        recipientIdentityId: 'peer-a',
      }),
    )
  })

  it('suppresses concurrent screenshot sync attempts while the first send is in flight', async () => {
    let resolveDelivery: ((value: boolean) => void) | null = null
    const deliver = vi.fn(() => new Promise<boolean>((resolve) => {
      resolveDelivery = resolve
    }))

    const firstAttempt = syncDirectHiddenControlState({
      controlType: 'screenshot_protection',
      remoteIdentityId: 'peer-a',
      enabled: true,
      source: 'bootstrap',
      deliver,
    })
    const secondAttempt = syncDirectHiddenControlState({
      controlType: 'screenshot_protection',
      remoteIdentityId: 'peer-a',
      enabled: true,
      source: 'chat_screen',
      deliver,
    })

    expect(deliver).toHaveBeenCalledTimes(1)
    ;(resolveDelivery as ((value: boolean) => void) | null)?.(true)

    await expect(Promise.all([firstAttempt, secondAttempt])).resolves.toEqual([true, true])
    expect(mocks.recordChatDiagnostic).toHaveBeenCalledWith(
      'send',
      'hidden_control_sync_skipped',
      expect.objectContaining({
        controlType: 'screenshot_protection',
        source: 'chat_screen',
        reason: 'duplicate_suppressed',
        recipientIdentityId: 'peer-a',
        inFlight: true,
      }),
    )
  })

  it('clears screenshot sync cache when transient state resets', async () => {
    const deliver = vi.fn(async () => true)

    await syncDirectHiddenControlState({
      controlType: 'screenshot_protection',
      remoteIdentityId: 'peer-a',
      enabled: true,
      source: 'bootstrap',
      deliver,
    })

    resetTransientState()

    await syncDirectHiddenControlState({
      controlType: 'screenshot_protection',
      remoteIdentityId: 'peer-a',
      enabled: true,
      source: 'bootstrap',
      deliver,
    })

    expect(deliver).toHaveBeenCalledTimes(2)
  })

  it('suppresses duplicate direct disappearing timer syncs for the same peer', async () => {
    const deliver = vi.fn(async () => true)

    await syncDirectDisappearingTimerState({
      remoteIdentityId: 'peer-a',
      timerKey: '{"durationMs":10000}',
      source: 'chat_screen',
      deliver,
    })
    await syncDirectDisappearingTimerState({
      remoteIdentityId: 'peer-a',
      timerKey: '{"durationMs":10000}',
      source: 'chat_screen',
      deliver,
    })

    expect(deliver).toHaveBeenCalledTimes(1)
    expect(mocks.recordChatDiagnostic).toHaveBeenCalledWith(
      'send',
      'hidden_control_sync_skipped',
      expect.objectContaining({
        controlType: 'disappearing_timer',
        source: 'chat_screen',
        reason: 'duplicate_suppressed',
        recipientIdentityId: 'peer-a',
        inFlight: false,
      }),
    )
  })

  it('re-sends direct disappearing timer syncs when the timer changes', async () => {
    const deliver = vi.fn(async () => true)

    await syncDirectDisappearingTimerState({
      remoteIdentityId: 'peer-a',
      timerKey: '{"durationMs":10000}',
      source: 'chat_screen',
      deliver,
    })
    await syncDirectDisappearingTimerState({
      remoteIdentityId: 'peer-a',
      timerKey: '{"durationMs":30000}',
      source: 'chat_screen',
      deliver,
    })

    expect(deliver).toHaveBeenCalledTimes(2)
    expect(mocks.recordChatDiagnostic).toHaveBeenCalledWith(
      'send',
      'hidden_control_sync_sent',
      expect.objectContaining({
        controlType: 'disappearing_timer',
        source: 'chat_screen',
        reason: 'state_changed',
        recipientIdentityId: 'peer-a',
      }),
    )
  })
})
