/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { Alert } from 'react-native'

describe('patchReactNativeAlerts', () => {
  beforeEach(() => {
    vi.resetModules()
    Alert.alert = vi.fn()
  })

  it('passes already-translated alert strings through unchanged', async () => {
    const originalAlert = Alert.alert as unknown as Mock
    const { patchReactNativeAlerts } = await import('./native')

    patchReactNativeAlerts()
    Alert.alert('Translated error', 'Translated message', [{ text: 'Translated cancel' }])

    expect(originalAlert).toHaveBeenCalledWith(
      'Translated error',
      'Translated message',
      [{ text: 'Translated cancel' }],
    )
  })

  it('patches alerts at most once', async () => {
    const originalAlert = Alert.alert as unknown as Mock
    const { patchReactNativeAlerts } = await import('./native')

    patchReactNativeAlerts()
    const patchedAlert = Alert.alert
    patchReactNativeAlerts()
    Alert.alert('Title')

    expect(Alert.alert).toBe(patchedAlert)
    expect(originalAlert).toHaveBeenCalledTimes(1)
  })
})
