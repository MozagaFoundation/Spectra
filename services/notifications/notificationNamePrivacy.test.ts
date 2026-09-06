/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  translateMessage: vi.fn(),
}))

vi.mock('@/lib/i18n/messages', () => ({
  translateMessage: mockState.translateMessage,
}))

describe('notification name privacy copy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.translateMessage.mockImplementation((key: string) => `localized:${key}`)
  })

  it('always uses generic direct notification copy', async () => {
    const { buildDirectLocalNotificationCopy } = await import('./notificationNamePrivacy')

    await expect(buildDirectLocalNotificationCopy('recipient-1', 'sender-1')).resolves.toEqual({
      title: 'Spectra',
      body: 'localized:New message',
    })
  })

  it('always uses generic group notification copy', async () => {
    const { buildGroupLocalNotificationBody } = await import('./notificationNamePrivacy')

    await expect(buildGroupLocalNotificationBody('recipient-1', 'sender-1'))
      .resolves.toBe('localized:New group message')
  })
})
