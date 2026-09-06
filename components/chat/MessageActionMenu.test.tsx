/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createChatMessage, findPressableByText } from '@/test/chatComponentMocks'

const mockState = vi.hoisted(() => ({
  clipboard: { setStringAsync: vi.fn(async () => undefined) },
  haptics: {
    impactAsync: vi.fn(async () => undefined),
    notificationAsync: vi.fn(async () => undefined),
    ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
    NotificationFeedbackType: { Success: 'success' },
  },
}))

vi.mock('react-native', async () => ({
  ...await import('../../test/react-native'),
  useWindowDimensions: () => ({ width: 390, height: 844 }),
}))

vi.mock('expo-clipboard', () => mockState.clipboard)
vi.mock('expo-haptics', () => mockState.haptics)
vi.mock('lucide-react-native', async () => {
  const { TestChatIcon } = await import('../../test/chatComponentMocks')
  return { Copy: TestChatIcon, Reply: TestChatIcon, RotateCcw: TestChatIcon, Trash2: TestChatIcon }
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/lib/i18n', async () => {
  const { translateForChatTest } = await import('../../test/chatComponentMocks')
  return { translate: translateForChatTest }
})

vi.mock('@/lib/i18n/direction', () => ({
  getDirectionalTextStyle: () => ({}),
  getStartMarginStyle: () => ({}),
  useIsCurrentLanguageRtl: () => false,
}))

vi.mock('@/lib/theme', async () => {
  const { chatTestColors } = await import('../../test/chatComponentMocks')
  return { useThemeColors: () => chatTestColors }
})

vi.mock('@/lib/viewOnce', () => ({
  getChatMessagePreviewText: (message: { content?: string }) => message.content || '',
}))

const { fireEvent, render } = await import('@testing-library/react-native')
const { MessageActionMenu } = await import('./MessageActionMenu')

describe('MessageActionMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('copies regular message content and closes the menu', async () => {
    const onClose = vi.fn()
    const view = render(
      <MessageActionMenu
        visible
        message={createChatMessage({ content: 'copy me' })}
        isOwn={false}
        onClose={onClose}
        onReaction={vi.fn()}
        onReply={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    await fireEvent.press(findPressableByText(view.root, 'Copy'))

    expect(mockState.clipboard.setStringAsync).toHaveBeenCalledWith('copy me')
    expect(onClose).toHaveBeenCalled()
  })

  it('does not expose copy for one-time messages', () => {
    const view = render(
      <MessageActionMenu
        visible
        message={createChatMessage({ oneTime: { kind: 'text', state: 'locked' } })}
        isOwn={false}
        onClose={vi.fn()}
        onReaction={vi.fn()}
        onReply={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    expect(() => view.getByText('Copy')).toThrow()
  })

  it('routes reply, delete, and reactions through callbacks', async () => {
    const onReaction = vi.fn()
    const onReply = vi.fn()
    const onDelete = vi.fn()
    const view = render(
      <MessageActionMenu
        visible
        message={createChatMessage()}
        isOwn
        onClose={vi.fn()}
        onReaction={onReaction}
        onReply={onReply}
        onDelete={onDelete}
      />,
    )

    await fireEvent.press(findPressableByText(view.root, 'Reply'))
    await fireEvent.press(findPressableByText(view.root, 'Delete'))
    await fireEvent.press(findPressableByText(view.root, '👍'))

    expect(onReply).toHaveBeenCalled()
    expect(onDelete).toHaveBeenCalled()
    expect(onReaction).toHaveBeenCalledWith('👍')
  })

  it('shows retry for failed own messages', async () => {
    const onRetry = vi.fn()
    const onClose = vi.fn()
    const view = render(
      <MessageActionMenu
        visible
        message={createChatMessage({ status: 'failed' })}
        isOwn
        onClose={onClose}
        onReaction={vi.fn()}
        onReply={vi.fn()}
        onDelete={vi.fn()}
        onRetry={onRetry}
      />,
    )

    await fireEvent.press(findPressableByText(view.root, 'Retry'))

    expect(onRetry).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('routes retry even when haptics reject', async () => {
    mockState.haptics.impactAsync.mockRejectedValueOnce(new Error('haptics unavailable'))
    const onRetry = vi.fn()
    const view = render(
      <MessageActionMenu
        visible
        message={createChatMessage({ status: 'failed' })}
        isOwn
        onClose={vi.fn()}
        onReaction={vi.fn()}
        onReply={vi.fn()}
        onDelete={vi.fn()}
        onRetry={onRetry}
      />,
    )

    await fireEvent.press(findPressableByText(view.root, 'Retry'))

    expect(onRetry).toHaveBeenCalled()
  })
})
