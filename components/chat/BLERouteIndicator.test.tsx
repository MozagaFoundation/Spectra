/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('lucide-react-native', async () => {
  const { TestChatIcon } = await import('../../test/chatComponentMocks')
  return { Bluetooth: TestChatIcon, WifiOff: TestChatIcon }
})

vi.mock('@/lib/i18n', async () => {
  const { translateForChatTest } = await import('../../test/chatComponentMocks')
  return { translate: translateForChatTest }
})

const { render } = await import('@testing-library/react-native')
const { BLERouteIndicator } = await import('./BLERouteIndicator')

describe('BLERouteIndicator', () => {
  it('does not render for internet routes', () => {
    const view = render(<BLERouteIndicator route="internet" internetAvailable />)

    expect(view.root.children).toEqual([])
  })

  it('distinguishes selected BLE from offline fallback', () => {
    const nearby = render(<BLERouteIndicator route="ble-nearby" internetAvailable />)
    expect(nearby.getByText('Sending via Bluetooth')).toBeTruthy()

    const fallback = render(<BLERouteIndicator route="ble" internetAvailable={false} />)
    expect(fallback.getByText('Offline via Bluetooth')).toBeTruthy()
  })
})
