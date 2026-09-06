/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  haptics: {
    impactAsync: vi.fn(async () => undefined),
    notificationAsync: vi.fn(async () => undefined),
    selectionAsync: vi.fn(async () => undefined),
    ImpactFeedbackStyle: { Light: 'light' },
    NotificationFeedbackType: { Success: 'success' },
  },
}))

vi.mock('expo-haptics', () => mockState.haptics)

const SafeHaptics = await import('./safeHaptics')

describe('safeHaptics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('runs haptics without surfacing native rejections', async () => {
    mockState.haptics.impactAsync.mockRejectedValueOnce(new Error('haptics unavailable'))
    mockState.haptics.notificationAsync.mockRejectedValueOnce(new Error('haptics unavailable'))
    mockState.haptics.selectionAsync.mockRejectedValueOnce(new Error('haptics unavailable'))

    expect(() => SafeHaptics.impactAsync(SafeHaptics.Haptics.ImpactFeedbackStyle.Light)).not.toThrow()
    expect(() => SafeHaptics.notificationAsync(SafeHaptics.Haptics.NotificationFeedbackType.Success)).not.toThrow()
    expect(() => SafeHaptics.selectionAsync()).not.toThrow()
    await Promise.resolve()

    expect(mockState.haptics.impactAsync).toHaveBeenCalledWith('light')
    expect(mockState.haptics.notificationAsync).toHaveBeenCalledWith('success')
    expect(mockState.haptics.selectionAsync).toHaveBeenCalled()
  })
})
