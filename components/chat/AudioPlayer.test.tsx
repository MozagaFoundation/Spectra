/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  haptics: {
    impactAsync: vi.fn(async () => undefined),
    ImpactFeedbackStyle: { Light: 'light' },
  },
  sound: {
    getStatusAsync: vi.fn(async () => ({ isLoaded: true, isPlaying: false, positionMillis: 0, durationMillis: 1000 })),
    pauseAsync: vi.fn(async () => undefined),
    playAsync: vi.fn(async () => undefined),
    setPositionAsync: vi.fn(async () => undefined),
    unloadAsync: vi.fn(async () => undefined),
  },
  createAsync: vi.fn(),
  setAudioModeAsync: vi.fn(async () => undefined),
}))

vi.mock('expo-haptics', () => mockState.haptics)
vi.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: mockState.setAudioModeAsync,
    Sound: {
      createAsync: mockState.createAsync,
    },
  },
}))

vi.mock('lucide-react-native', async () => {
  const { TestChatIcon } = await import('../../test/chatComponentMocks')
  return { Pause: TestChatIcon, Play: TestChatIcon }
})

vi.mock('@/lib/theme', async () => {
  const { chatTestColors } = await import('../../test/chatComponentMocks')
  return { useThemeColors: () => chatTestColors }
})

const { act, fireEvent, render } = await import('@testing-library/react-native')
const { AudioPlayer } = await import('./AudioPlayer')

function getRenderedBarHeights(root: ReturnType<typeof render>['root']): number[] {
  return root
    .findAll((node) => typeof node.props?.style?.height === 'number')
    .map((node) => node.props.style.height)
}

describe('AudioPlayer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.sound.getStatusAsync.mockResolvedValue({ isLoaded: true, isPlaying: false, positionMillis: 0, durationMillis: 1000 })
    mockState.createAsync.mockResolvedValue({
      sound: mockState.sound,
      status: { isLoaded: true, durationMillis: 1000 },
    })
  })

  it('loads and plays a voice note on press', async () => {
    const view = render(<AudioPlayer uri="file:///voice.m4a" durationMs={1000} waveform={[0.4, 0.8]} />)

    await fireEvent.press(view.root.findByProps({ accessibilityLabel: 'Play voice note' }))

    expect(mockState.createAsync).toHaveBeenCalledWith(
      { uri: 'file:///voice.m4a' },
      { shouldPlay: false },
      expect.any(Function),
    )
    expect(mockState.setAudioModeAsync).toHaveBeenCalledWith(expect.objectContaining({
      playsInSilentModeIOS: true,
      playThroughEarpieceAndroid: false,
      shouldDuckAndroid: true,
    }))
    expect(mockState.sound.playAsync).toHaveBeenCalled()
  })

  it('plays even when haptics reject', async () => {
    mockState.haptics.impactAsync.mockRejectedValueOnce(new Error('haptics unavailable'))
    const view = render(<AudioPlayer uri="file:///voice.m4a" durationMs={1000} />)

    await fireEvent.press(view.root.findByProps({ accessibilityLabel: 'Play voice note' }))

    expect(mockState.sound.playAsync).toHaveBeenCalled()
  })

  it('pauses an already playing sound', async () => {
    mockState.sound.getStatusAsync.mockResolvedValueOnce({ isLoaded: true, isPlaying: true, positionMillis: 100, durationMillis: 1000 })
    const view = render(<AudioPlayer uri="file:///voice.m4a" durationMs={1000} />)

    await fireEvent.press(view.root.findByProps({ accessibilityLabel: 'Play voice note' }))

    expect(mockState.sound.pauseAsync).toHaveBeenCalled()
  })

  it('auto plays only once for a uri', async () => {
    render(<AudioPlayer uri="file:///voice.m4a" durationMs={1000} autoPlay />)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockState.createAsync).toHaveBeenCalledTimes(1)
  })

  it('uses a deterministic generic fallback when waveform data is missing', () => {
    const first = render(<AudioPlayer uri="file:///first.m4a" durationMs={1000} />)
    const firstHeights = getRenderedBarHeights(first.root)
    first.unmount()

    const second = render(<AudioPlayer uri="file:///second.m4a" durationMs={1000} />)
    const secondHeights = getRenderedBarHeights(second.root)

    expect(firstHeights).toHaveLength(30)
    expect(firstHeights).toEqual(secondHeights)
    expect(new Set(firstHeights).size).toBeGreaterThan(1)
  })
})
