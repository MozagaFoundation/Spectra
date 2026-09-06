/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  clearPending: vi.fn(async () => {}),
  consumePending: vi.fn(async () => true),
  enqueue: vi.fn(async () => true),
  hasPending: vi.fn(async () => true),
}))

vi.mock('./notificationCoordinator', () => ({
  clearPendingMessagingNotificationStorage: mockState.clearPending,
  consumePendingMessagingNotifications: mockState.consumePending,
  enqueueMessagingPush: mockState.enqueue,
  hasPendingMessagingNotifications: mockState.hasPending,
}))

describe('chatNotificationWakeup compatibility facade', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('delegates notification ingress to the coordinator', async () => {
    const wakeup = await import('./chatNotificationWakeup')
    const payload = {
      notificationScopeId: 'nsc1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      notificationEventId: 'nev1.11111111111111111111111111111111',
    }

    await expect(
      wakeup.requestChatWakeupFromNotification(payload, 'background'),
    ).resolves.toBe(true)
    expect(mockState.enqueue).toHaveBeenCalledWith(payload, 'background')
  })

  it('uses the shared pending queue after unlock', async () => {
    const wakeup = await import('./chatNotificationWakeup')

    await expect(wakeup.consumePendingChatWakeupAfterUnlock()).resolves.toBe(true)
    expect(mockState.consumePending).toHaveBeenCalledWith('unlock')
  })

  it('delegates pending state and cleanup', async () => {
    const wakeup = await import('./chatNotificationWakeup')

    await expect(wakeup.hasPendingChatWakeup()).resolves.toBe(true)
    await wakeup.clearPendingChatWakeupStorage()

    expect(mockState.hasPending).toHaveBeenCalled()
    expect(mockState.clearPending).toHaveBeenCalled()
  })
})
