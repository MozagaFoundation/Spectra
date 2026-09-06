/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  isDarkMode: true,
  spectreThemeActive: false,
}))

vi.mock('@/store/uiStore', () => ({
  useUIStore: (selector: (state: { isDarkMode: boolean }) => unknown) => selector({ isDarkMode: mockState.isDarkMode }),
}))

vi.mock('@/lib/theme', () => ({
  useIsSpectreThemeActive: () => mockState.spectreThemeActive,
}))

vi.mock('expo-image', () => ({
  Image: 'Image',
}))

vi.mock('@/assets/images/spectra/background-cyan-bottomright.png', () => ({ default: 'dark-wallpaper' }))
vi.mock('@/assets/images/spectra/background-light-cyan-bottomright.png', () => ({ default: 'light-wallpaper' }))

const { render } = await import('@testing-library/react-native')
const { SpectraBackdrop } = await import('./SpectraBackdrop')

beforeEach(() => {
  mockState.isDarkMode = true
  mockState.spectreThemeActive = false
})

describe('SpectraBackdrop', () => {
  it('renders non-interactive dark and light backdrop layers', () => {
    const view = render(<SpectraBackdrop />)

    expect(view.root.findAllByProps({ pointerEvents: 'none' })).toHaveLength(2)
    expect(view.root.findByType('Image' as any).props.source).toBe('dark-wallpaper')

    mockState.isDarkMode = false
    view.update(<SpectraBackdrop />)

    expect(view.root.findAllByProps({ pointerEvents: 'none' })).toHaveLength(2)
    expect(view.root.findByType('Image' as any).props.source).toBe('light-wallpaper')
  })

  it('renders nothing in Spectre theme', () => {
    mockState.spectreThemeActive = true
    const view = render(<SpectraBackdrop />)

    expect(view.root.findAllByProps({ pointerEvents: 'none' })).toHaveLength(0)
  })
})
