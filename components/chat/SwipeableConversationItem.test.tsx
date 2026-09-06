/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { findPressableByText } from '@/test/chatComponentMocks'

vi.mock('react-native-reanimated', async () => {
  const { View } = await import('../../test/react-native')
  return {
    default: { View },
    interpolate: () => 0,
    useAnimatedStyle: () => ({}),
  }
})

vi.mock('react-native-gesture-handler/ReanimatedSwipeable', async () => {
  const ReactActual = await import('react')
  const { View } = await import('../../test/react-native')
  return {
    default: ReactActual.forwardRef((props: any, ref) => {
      ReactActual.useImperativeHandle(ref, () => ({ close: vi.fn() }))
      return ReactActual.createElement(
        View,
        { testID: 'swipeable' },
        props.children,
        props.renderLeftActions?.({ value: 0 }, { value: 150 }),
        props.renderRightActions?.({ value: 0 }, { value: -150 }),
      )
    }),
  }
})

vi.mock('lucide-react-native', async () => {
  const { TestChatIcon } = await import('../../test/chatComponentMocks')
  return {
    Archive: TestChatIcon,
    ArchiveRestore: TestChatIcon,
    MessageCircle: TestChatIcon,
    MoreHorizontal: TestChatIcon,
    Pin: TestChatIcon,
  }
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/lib/i18n', async () => {
  const { translateForChatTest } = await import('../../test/chatComponentMocks')
  return { translate: translateForChatTest }
})

const { fireEvent, render } = await import('@testing-library/react-native')
const { Text } = await import('../../test/react-native')
const { SwipeableConversationItem } = await import('./SwipeableConversationItem')

function renderSwipeable(overrides = {}) {
  return render(
    <SwipeableConversationItem
      conversationId="conversation-1"
      isPinned={false}
      isManuallyUnread={false}
      onArchive={vi.fn()}
      onPin={vi.fn()}
      onToggleUnread={vi.fn()}
      onMore={vi.fn()}
      {...overrides}
    >
      <Text>Conversation child</Text>
    </SwipeableConversationItem>,
  )
}

describe('SwipeableConversationItem', () => {
  it('renders swipe actions and passes the conversation id to callbacks', async () => {
    const onArchive = vi.fn()
    const onPin = vi.fn()
    const onToggleUnread = vi.fn()
    const onMore = vi.fn()
    const view = renderSwipeable({ onArchive, onPin, onToggleUnread, onMore })

    await fireEvent.press(findPressableByText(view.root, 'Archive'))
    await fireEvent.press(findPressableByText(view.root, 'Pin'))
    await fireEvent.press(findPressableByText(view.root, 'Unread'))
    await fireEvent.press(findPressableByText(view.root, 'More'))

    expect(onArchive).toHaveBeenCalledWith('conversation-1')
    expect(onPin).toHaveBeenCalledWith('conversation-1')
    expect(onToggleUnread).toHaveBeenCalledWith('conversation-1')
    expect(onMore).toHaveBeenCalledWith('conversation-1')
  })

  it('uses archived and active labels from props', async () => {
    const onUnarchive = vi.fn()
    const view = renderSwipeable({
      isArchived: true,
      isPinned: true,
      isManuallyUnread: true,
      onUnarchive,
    })

    expect(view.getByText('Unarchive')).toBeTruthy()
    expect(view.getByText('Unpin')).toBeTruthy()
    expect(view.getByText('Read')).toBeTruthy()

    await fireEvent.press(findPressableByText(view.root, 'Unarchive'))

    expect(onUnarchive).toHaveBeenCalledWith('conversation-1')
  })

  it('bypasses swipe actions when disabled', () => {
    const view = renderSwipeable({ disabled: true })

    expect(view.getByText('Conversation child')).toBeTruthy()
    expect(view.queryByTestId('swipeable')).toBeNull()
  })
})
