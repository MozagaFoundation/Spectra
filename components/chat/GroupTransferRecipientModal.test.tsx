/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { findPressableByText } from '@/test/chatComponentMocks'

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}))

vi.mock('lucide-react-native', async () => {
  const { TestChatIcon } = await import('../../test/chatComponentMocks')
  return { ArrowRight: TestChatIcon, Search: TestChatIcon, X: TestChatIcon }
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

vi.mock('@/lib/utils', () => ({
  formatAddress: (value: string) => value,
}))

const { fireEvent, render } = await import('@testing-library/react-native')
const { GroupTransferRecipientModal } = await import('./GroupTransferRecipientModal')

const recipients = [
  { identityId: 'identity-alice', name: 'Alice', walletAddress: 'EXO_ALICE' },
  { identityId: 'identity-bob', name: 'Bob', walletAddress: 'EXO_BOB' },
]

describe('GroupTransferRecipientModal', () => {
  it('filters group recipients and returns the selected member', async () => {
    const onSelect = vi.fn()
    const view = render(
      <GroupTransferRecipientModal
        visible
        recipients={recipients}
        onClose={vi.fn()}
        onSelect={onSelect}
      />,
    )

    await fireEvent.changeText(view.root.findByType('TextInput' as any), 'bob')

    expect(view.getAllByText('Bob').length).toBeGreaterThan(0)
    expect(() => view.getByText('Alice')).toThrow()

    await fireEvent.press(findPressableByText(view.root, 'Bob'))

    expect(onSelect).toHaveBeenCalledWith(recipients[1])
  })

  it('resets the search query after close and reopen', async () => {
    const view = render(
      <GroupTransferRecipientModal
        visible
        recipients={recipients}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />,
    )

    await fireEvent.changeText(view.root.findByType('TextInput' as any), 'bob')
    expect(() => view.getByText('Alice')).toThrow()

    view.update(
      <GroupTransferRecipientModal
        visible={false}
        recipients={recipients}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />,
    )
    view.update(
      <GroupTransferRecipientModal
        visible
        recipients={recipients}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />,
    )

    expect(view.getAllByText('Alice').length).toBeGreaterThan(0)
    expect(view.getAllByText('Bob').length).toBeGreaterThan(0)
  })
})
