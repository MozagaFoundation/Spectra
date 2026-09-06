/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { ReactTestInstance } from 'react-test-renderer'
import type { ChatContact } from '@/lib/types'

vi.mock('lucide-react-native', async () => {
  const { createLucideIconMock } = await import('../../test/componentMocks')
  return createLucideIconMock(['Search', 'Check', 'X', 'Users'])
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/components/common', async () => {
  const { TestAvatar } = await import('../../test/componentMocks')
  return { Avatar: TestAvatar }
})

vi.mock('@/components/ui', async () => {
  const { TestButton } = await import('../../test/componentMocks')
  return { Button: TestButton }
})

vi.mock('@/lib/i18n', async () => {
  const { createI18nComponentMock } = await import('../../test/componentMocks')
  return createI18nComponentMock()
})

vi.mock('@/lib/theme', async () => {
  const { createThemeComponentMock } = await import('../../test/componentMocks')
  return createThemeComponentMock()
})

const { fireEvent, render, screen } = await import('@testing-library/react-native')
const { RecipientSelector } = await import('./RecipientSelector')

function textContent(node: ReactTestInstance): string {
  return node.children.map((child) => (
    typeof child === 'string' ? child : textContent(child)
  )).join('')
}

function pressableWithText(root: ReactTestInstance, text: string): ReactTestInstance {
  return root.findAll((node) => String(node.type) === 'Pressable' && textContent(node).includes(text))[0]
}

function createContacts(): ChatContact[] {
  return [
    {
      identityId: 'identity-alice',
      displayName: 'Alice Ada',
      walletAddress: 'EXO00abcdefabcdefabcdefabcdefabcdefabcdef12',
      addedAt: 1,
    },
    {
      identityId: 'identity-bob',
      displayName: 'Bob Byron',
      walletAddress: 'EXO0012345612345612345612345612345612345678',
      addedAt: 2,
    },
    {
      identityId: 'identity-carol',
      displayName: 'Carol Chen',
      addedAt: 3,
    },
  ]
}

describe('RecipientSelector', () => {
  it('shows contact rows alphabetically by display name', () => {
    const contacts = [
      createContacts()[2],
      createContacts()[1],
      createContacts()[0],
    ]
    const view = render(
      <RecipientSelector
        contacts={contacts}
        selectedIds={[]}
        onSelectionChange={vi.fn()}
        onDone={vi.fn()}
      />,
    )

    const rows = view.root
      .findAll((node) => String(node.type) === 'Pressable')
      .map(textContent)
      .filter((text) => /Alice Ada|Bob Byron|Carol Chen/.test(text))

    expect(rows).toEqual([
      expect.stringContaining('Alice Ada'),
      expect.stringContaining('Bob Byron'),
      expect.stringContaining('Carol Chen'),
    ])
  })

  it('filters contacts by name, identity id, and wallet address without losing selected chips', async () => {
    const onSelectionChange = vi.fn()
    const view = render(
      <RecipientSelector
        contacts={createContacts()}
        selectedIds={['identity-alice']}
        onSelectionChange={onSelectionChange}
        onDone={vi.fn()}
      />,
    )

    expect(screen.getByText('1 selected')).toBeTruthy()
    expect(screen.getAllByText('Alice Ada').length).toBeGreaterThan(0)

    await fireEvent.changeText(view.root.findByType('TextInput' as any), '123456')

    expect(screen.getAllByText('Bob Byron').length).toBeGreaterThan(0)
    expect(() => screen.getByText('Carol Chen')).toThrow()
    expect(screen.getAllByText('Alice Ada').length).toBeGreaterThan(0)
  })

  it('adds and removes contacts while enforcing the selection limit', async () => {
    const onSelectionChange = vi.fn()
    const contacts = createContacts()

    const view = render(
      <RecipientSelector
        contacts={contacts}
        selectedIds={['identity-alice']}
        onSelectionChange={onSelectionChange}
        onDone={vi.fn()}
        selectionLimit={1}
        selectionLimitMessage="Only one recipient allowed"
      />,
    )

    expect(screen.getByText('Only one recipient allowed')).toBeTruthy()

    await fireEvent.press(pressableWithText(view.root, 'Bob Byron'))
    expect(onSelectionChange).not.toHaveBeenCalled()

    await fireEvent.press(pressableWithText(view.root, 'Alice Ada'))
    expect(onSelectionChange).toHaveBeenCalledWith([])
  })

  it('disables Done until at least one recipient is selected', () => {
    render(
      <RecipientSelector
        contacts={createContacts()}
        selectedIds={[]}
        onSelectionChange={vi.fn()}
        onDone={vi.fn()}
      />,
    )

    expect(screen.getByText('Done (0)')).toBeTruthy()
    expect(screen.getByText('disabled')).toBeTruthy()
  })

  it('allows parent screens to hold Done in a loading state', () => {
    render(
      <RecipientSelector
        contacts={createContacts()}
        selectedIds={['identity-alice']}
        onSelectionChange={vi.fn()}
        onDone={vi.fn()}
        doneDisabled
        doneLoading
        doneLabel="Creating encrypted group"
      />,
    )

    expect(screen.getByText('Creating encrypted group')).toBeTruthy()
    expect(screen.getByText('disabled')).toBeTruthy()
  })
})
