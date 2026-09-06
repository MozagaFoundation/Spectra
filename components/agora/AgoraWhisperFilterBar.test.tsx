/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/i18n', async () => {
  const { createI18nComponentMock } = await import('../../test/componentMocks')
  return createI18nComponentMock()
})
vi.mock('@/lib/theme', () => ({
  useThemeColors: () => ({
    gold: '#a7da57',
    surface: '#111111',
    border: '#222222',
    textSecondary: '#cccccc',
  }),
}))

const { fireEvent, render, screen } = await import('@testing-library/react-native')
const { AgoraWhisperFilterBar } = await import('./AgoraWhisperFilterBar')

describe('AgoraWhisperFilterBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders only All, Public, and Whispers chips', async () => {
    const onChange = vi.fn()
    render(<AgoraWhisperFilterBar mode="all" onChange={onChange} />)

    const all = screen.queryByTestId('agora-whisper-filter-all')
    const pub = screen.queryByTestId('agora-whisper-filter-public')
    const whispers = screen.queryByTestId('agora-whisper-filter-whispers')
    expect(all).toBeTruthy()
    expect(pub).toBeTruthy()
    expect(whispers).toBeTruthy()
    expect(screen.queryByTestId('agora-whisper-filter-nick-Pejenegro')).toBeNull()

    await fireEvent.press(whispers!)
    expect(onChange).toHaveBeenCalledWith('whispers')
  })
})
