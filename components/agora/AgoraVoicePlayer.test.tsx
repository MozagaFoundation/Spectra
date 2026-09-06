/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { componentTestColors } from '../../test/componentMocks'

vi.mock('lucide-react-native', async () => {
  const { createLucideIconMock } = await import('../../test/componentMocks')
  return createLucideIconMock(['Pause', 'Play'])
})
vi.mock('@/lib/i18n', async () => {
  const { createI18nComponentMock } = await import('../../test/componentMocks')
  return createI18nComponentMock()
})
vi.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: async () => undefined,
    Sound: { createAsync: async () => ({ sound: null, status: { isLoaded: false } }) },
  },
}))

const { render, screen } = await import('@testing-library/react-native')
const { AgoraVoicePlayer } = await import('./AgoraVoicePlayer')

describe('AgoraVoicePlayer', () => {
  it('uses dark controls on a sent bubble', () => {
    render(
      <AgoraVoicePlayer
        uri="file://voice.m4a"
        durationMs={2000}
        colors={componentTestColors as never}
        isOwn
      />,
    )
    const play = screen.queryByTestId('agora-voice-play')
    expect(play?.props.style.backgroundColor).toBe(`${componentTestColors.textOnPrimary}33`)
  })

  it('keeps primary controls on a received bubble', () => {
    render(
      <AgoraVoicePlayer
        uri="file://voice.m4a"
        durationMs={2000}
        colors={componentTestColors as never}
      />,
    )
    const play = screen.queryByTestId('agora-voice-play')
    expect(play?.props.style.backgroundColor).toBe(`${componentTestColors.primary}33`)
  })
})
