/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 20 }),
}))

vi.mock('lucide-react-native', async () => {
  const { TestChatIcon } = await import('../../test/chatComponentMocks')
  return { MicOff: TestChatIcon, Phone: TestChatIcon, PhoneOff: TestChatIcon, Shield: TestChatIcon, Video: TestChatIcon }
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/components/common', async () => {
  const { TestChatAvatar } = await import('../../test/chatComponentMocks')
  return { Avatar: TestChatAvatar }
})

vi.mock('@/lib/i18n', async () => {
  const { translateForChatTest } = await import('../../test/chatComponentMocks')
  return { translate: translateForChatTest }
})

vi.mock('@/lib/theme', async () => {
  const { chatTestColors } = await import('../../test/chatComponentMocks')
  return { useThemeColors: () => chatTestColors }
})

const { fireEvent, render } = await import('@testing-library/react-native')
const { MinimizedCallBanner } = await import('./MinimizedCallBanner')

function baseProps(overrides = {}) {
  return {
    visible: true,
    callType: 'video' as const,
    callState: 'connected' as const,
    contactName: 'Alice',
    durationMs: 61_000,
    isMuted: false,
    onPress: vi.fn(),
    onEndCall: vi.fn(),
    ...overrides,
  }
}

describe('MinimizedCallBanner', () => {
  it('does not render when hidden', () => {
    const view = render(<MinimizedCallBanner {...baseProps({ visible: false })} />)

    expect(view.root.children).toEqual([])
  })

  it('renders call summary and routes press/end actions', async () => {
    const props = baseProps()
    const view = render(<MinimizedCallBanner {...props} />)

    expect(view.getAllByText('Alice').length).toBeGreaterThan(0)
    expect(view.getByText('1:01')).toBeTruthy()
    expect(view.getByText('Video')).toBeTruthy()

    await fireEvent.press(view.root.findAllByType('Pressable' as any)[0])
    await fireEvent.press(view.root.findAllByType('Pressable' as any)[1])

    expect(props.onPress).toHaveBeenCalled()
    expect(props.onEndCall).toHaveBeenCalled()
  })

  it('renders non-connected status and muted state', () => {
    const view = render(<MinimizedCallBanner {...baseProps({ callState: 'reconnecting', isMuted: true, callType: 'voice' })} />)

    expect(view.getByText('Reconnecting')).toBeTruthy()
    expect(view.getByText('Voice')).toBeTruthy()
  })
})
