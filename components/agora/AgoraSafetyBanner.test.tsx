/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('lucide-react-native', async () => {
  const { createLucideIconMock } = await import('../../test/componentMocks')
  return createLucideIconMock(['AlertTriangle', 'ChevronRight'])
})
vi.mock('@/lib/i18n', async () => {
  const { createI18nComponentMock } = await import('../../test/componentMocks')
  return createI18nComponentMock()
})
vi.mock('@/lib/theme', async () => {
  const { createThemeComponentMock } = await import('../../test/componentMocks')
  return createThemeComponentMock()
})

const { fireEvent, render, screen } = await import('@testing-library/react-native')
const { AgoraSafetyBanner } = await import('./AgoraSafetyBanner')

describe('AgoraSafetyBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens the safety sheet when tapped', () => {
    const onPress = vi.fn()
    render(<AgoraSafetyBanner onPress={onPress} />)
    fireEvent.press(screen.getByTestId('agora-safety-banner'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})
