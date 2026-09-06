/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { findPressableByText } from '@/test/chatComponentMocks'
import type { ForwardConversationTarget } from './ForwardConversationModal'

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}))

vi.mock('lucide-react-native', async () => {
  const { TestChatIcon } = await import('../../test/chatComponentMocks')
  return { ArrowRight: TestChatIcon, Search: TestChatIcon, Users: TestChatIcon, X: TestChatIcon }
})

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
const { ForwardConversationModal } = await import('./ForwardConversationModal')

const targets: ForwardConversationTarget[] = [
  { id: 'direct-1', type: 'direct', title: 'Alice', subtitle: 'Direct chat', routeAddress: 'EXO_ALICE' },
  { id: 'group-1', type: 'group', title: 'Auditors', subtitle: 'Group chat', groupId: 'group-1' },
]

describe('ForwardConversationModal', () => {
  it('filters targets and selects the requested conversation', async () => {
    const onSelect = vi.fn()
    const view = render(
      <ForwardConversationModal
        visible
        targets={targets}
        onClose={vi.fn()}
        onSelect={onSelect}
      />,
    )

    await fireEvent.changeText(view.root.findByType('TextInput' as any), 'audit')

    expect(view.getAllByText('Auditors').length).toBeGreaterThan(0)
    expect(() => view.getByText('Alice')).toThrow()

    await fireEvent.press(findPressableByText(view.root, 'Auditors'))

    expect(onSelect).toHaveBeenCalledWith(targets[1])
  })

  it('resets query when hidden', async () => {
    const view = render(
      <ForwardConversationModal
        visible
        targets={targets}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />,
    )

    await fireEvent.changeText(view.root.findByType('TextInput' as any), 'audit')
    expect(() => view.getByText('Alice')).toThrow()

    view.update(
      <ForwardConversationModal
        visible={false}
        targets={targets}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />,
    )
    view.update(
      <ForwardConversationModal
        visible
        targets={targets}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />,
    )

    expect(view.getAllByText('Alice').length).toBeGreaterThan(0)
    expect(view.getAllByText('Auditors').length).toBeGreaterThan(0)
  })
})
