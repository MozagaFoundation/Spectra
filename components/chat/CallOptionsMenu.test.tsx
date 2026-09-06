/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { findPressableByText } from '@/test/chatComponentMocks'

const mockState = vi.hoisted(() => ({
  haptics: {
    impactAsync: vi.fn(async () => undefined),
    ImpactFeedbackStyle: { Medium: 'medium' },
  },
}))

vi.mock('expo-haptics', () => mockState.haptics)
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}))

vi.mock('lucide-react-native', async () => {
  const { TestChatIcon } = await import('../../test/chatComponentMocks')
  return { Phone: TestChatIcon, Shield: TestChatIcon, Video: TestChatIcon, X: TestChatIcon }
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/lib/i18n', async () => {
  const { translateForChatTest } = await import('../../test/chatComponentMocks')
  return { translate: translateForChatTest }
})

vi.mock('@/lib/theme', async () => {
  const { chatTestColors } = await import('../../test/chatComponentMocks')
  return { useThemeColors: () => chatTestColors }
})

const { fireEvent, render } = await import('@testing-library/react-native')
const { CallOptionsMenu } = await import('./CallOptionsMenu')

describe('CallOptionsMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('starts voice and video calls and closes the menu', async () => {
    const onClose = vi.fn()
    const onStartCall = vi.fn()
    const view = render(
      <CallOptionsMenu
        visible
        contactName="Alice"
        onClose={onClose}
        onStartCall={onStartCall}
      />,
    )

    await fireEvent.press(findPressableByText(view.root, 'Voice Call'))
    await fireEvent.press(findPressableByText(view.root, 'Video Call'))

    expect(onStartCall).toHaveBeenCalledWith('voice')
    expect(onStartCall).toHaveBeenCalledWith('video')
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('starts calls even when haptics reject', async () => {
    mockState.haptics.impactAsync.mockRejectedValueOnce(new Error('haptics unavailable'))
    const onClose = vi.fn()
    const onStartCall = vi.fn()
    const view = render(
      <CallOptionsMenu
        visible
        contactName="Alice"
        onClose={onClose}
        onStartCall={onStartCall}
      />,
    )

    await fireEvent.press(findPressableByText(view.root, 'Voice Call'))

    expect(onStartCall).toHaveBeenCalledWith('voice')
    expect(onClose).toHaveBeenCalled()
  })

  it('does not start calls when disabled and displays the disabled reason', async () => {
    const onStartCall = vi.fn()
    const view = render(
      <CallOptionsMenu
        visible
        contactName="Alice"
        onClose={vi.fn()}
        onStartCall={onStartCall}
        disabled
        disabledReason="Peer is on Tor"
      />,
    )

    await fireEvent.press(findPressableByText(view.root, 'Voice Call'))

    expect(onStartCall).not.toHaveBeenCalled()
    expect(view.getByText('Peer is on Tor')).toBeTruthy()
  })
})
