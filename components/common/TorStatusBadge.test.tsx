/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TorStatus } from '@/services/tor'

const mockState = vi.hoisted(() => ({
  enabled: true,
  status: 'connected' as TorStatus,
}))

vi.mock('@/services/tor', () => ({
  useTorStore: (selector: (state: { enabled: boolean; status: TorStatus }) => unknown) => selector(mockState),
}))

vi.mock('@/lib/i18n', async () => {
  const { createI18nComponentMock } = await import('../../test/componentMocks')
  return createI18nComponentMock()
})

const { fireEvent, render, screen } = await import('@testing-library/react-native')
const { TorStatusBadge } = await import('./TorStatusBadge')

beforeEach(() => {
  mockState.enabled = true
  mockState.status = 'connected'
})

describe('TorStatusBadge', () => {
  it.each([
    ['disconnected', 'Off'],
    ['connecting', 'Connecting to Tor'],
    ['connected', 'Connected to Tor'],
    ['error', 'Tor connection failed'],
  ] as const)('renders %s status label when Tor is enabled', (status, label) => {
    mockState.status = status

    render(<TorStatusBadge />)

    expect(screen.getByText(label)).toBeTruthy()
  })

  it('renders nothing when Tor is disabled', () => {
    mockState.enabled = false
    const view = render(<TorStatusBadge />)

    expect(view.root.findAllByType('Text' as any)).toHaveLength(0)
  })

  it('dispatches presses when used as a navigation affordance', async () => {
    const onPress = vi.fn()
    const view = render(<TorStatusBadge onPress={onPress} />)

    await fireEvent.press(view.root.findByType('Pressable' as any))

    expect(onPress).toHaveBeenCalledTimes(1)
  })
})
