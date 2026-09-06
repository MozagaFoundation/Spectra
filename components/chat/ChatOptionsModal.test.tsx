/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createConversation, findPressableByText } from '@/test/chatComponentMocks'

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}))

vi.mock('lucide-react-native', async () => {
  const { TestChatIcon } = await import('../../test/chatComponentMocks')
  return {
    Ban: TestChatIcon,
    Bell: TestChatIcon,
    BellOff: TestChatIcon,
    ChevronLeft: TestChatIcon,
    Clock3: TestChatIcon,
    Eraser: TestChatIcon,
    Trash2: TestChatIcon,
    X: TestChatIcon,
  }
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

vi.mock('@/lib/disappearingMessages', () => ({
  formatDisappearingTimerDuration: (durationMs: number) => `${durationMs / 1000}s`,
}))

vi.mock('@/lib/utils', () => ({
  formatAddress: (value: string) => value,
}))

vi.mock('@/store', () => ({
  useChatStore: (selector: (state: any) => unknown) => selector({ contacts: [] }),
}))

const { fireEvent, render } = await import('@testing-library/react-native')
const { ChatOptionsModal } = await import('./ChatOptionsModal')

describe('ChatOptionsModal', () => {
  it('routes direct-chat actions through callbacks', async () => {
    const onMute = vi.fn()
    const onClearChat = vi.fn()
    const onDeleteChat = vi.fn()
    const onBlock = vi.fn()
    const view = render(
      <ChatOptionsModal
        visible
        conversation={createConversation()}
        isMuted={false}
        isBlocked={false}
        onClose={vi.fn()}
        onMute={onMute}
        onClearChat={onClearChat}
        onDeleteChat={onDeleteChat}
        onBlock={onBlock}
      />,
    )

    await fireEvent.press(findPressableByText(view.root, 'Mute'))
    await fireEvent.press(findPressableByText(view.root, 'Clear chat'))
    await fireEvent.press(findPressableByText(view.root, 'Delete chat...'))
    await fireEvent.press(findPressableByText(view.root, 'Block EXO_ALICE_ADDRESS'))

    expect(onMute).toHaveBeenCalled()
    expect(onClearChat).toHaveBeenCalled()
    expect(onDeleteChat).toHaveBeenCalled()
    expect(onBlock).toHaveBeenCalled()
  })

  it('gates peer options for groups', () => {
    const groupView = render(
      <ChatOptionsModal
        visible
        conversation={createConversation({ type: 'group', title: 'Group' })}
        isMuted={false}
        isBlocked={false}
        onClose={vi.fn()}
        onMute={vi.fn()}
        onClearChat={vi.fn()}
        onDeleteChat={vi.fn()}
        onBlock={vi.fn()}
        onSelectDisappearingTimer={vi.fn()}
      />,
    )

    expect(groupView.getByText('Delete chat')).toBeTruthy()
    expect(() => groupView.getByText(/Block/)).toThrow()
    expect(() => groupView.getByText('Disappearing messages')).toThrow()
  })

  it('selects disappearing timer presets and closes', async () => {
    const onSelectDisappearingTimer = vi.fn()
    const onClose = vi.fn()
    const view = render(
      <ChatOptionsModal
        visible
        conversation={createConversation()}
        isMuted={false}
        isBlocked={false}
        onClose={onClose}
        onMute={vi.fn()}
        onClearChat={vi.fn()}
        onDeleteChat={vi.fn()}
        onBlock={vi.fn()}
        disappearingTimerPresets={[60_000]}
        onSelectDisappearingTimer={onSelectDisappearingTimer}
      />,
    )

    await fireEvent.press(findPressableByText(view.root, 'Disappearing messages'))
    await fireEvent.press(findPressableByText(view.root, '60s'))

    expect(onSelectDisappearingTimer).toHaveBeenCalledWith(60_000)
    expect(onClose).toHaveBeenCalled()
  })
})
