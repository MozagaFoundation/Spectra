/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  alert: vi.fn(),
  router: {
    back: vi.fn(),
    replace: vi.fn(),
  },
  contacts: [
    { displayName: 'Alice', identityId: 'alice-id', walletAddress: 'EXOalice' },
    { displayName: 'Bob', identityId: 'bob-id', walletAddress: 'EXObob' },
  ],
  createEncryptedGroup: vi.fn(async () => ({ groupId: 'group-id' })),
}))

vi.mock('react-native', async () => {
  const rn = await import('../../../test/react-native')
  return {
    ...rn,
    Alert: { alert: mockState.alert },
  }
})

vi.mock('react-native-keyboard-controller', async () => {
  const { View } = await import('../../../test/react-native')
  return { KeyboardAvoidingView: View }
})

vi.mock('expo-router', () => ({
  useRouter: () => mockState.router,
}))

vi.mock('react-native-safe-area-context', async () => {
  const { createSafeAreaMock } = await import('../../../test/mainScreenMocks')
  return createSafeAreaMock()
})

vi.mock('lucide-react-native', async () => {
  const { TestIcon } = await import('../../../test/mainScreenMocks')
  return {
    ArrowLeft: TestIcon,
    Shield: TestIcon,
    Users: TestIcon,
  }
})

vi.mock('@/components/ui', async () => {
  const { TestButton } = await import('../../../test/mainScreenMocks')
  return { Button: TestButton }
})

vi.mock('@/components/shared/RecipientSelector', async () => {
  const ReactActual = await import('react')
  const { Pressable, Text, View } = await import('../../../test/react-native')
  return {
    RecipientSelector: ({
      onDone,
      onSelectionChange,
      doneDisabled,
      doneLabel,
      doneLoading,
    }: {
      onDone: () => void
      onSelectionChange: (ids: string[]) => void
      doneDisabled?: boolean
      doneLabel?: string
      doneLoading?: boolean
    }) => ReactActual.createElement(
      View,
      null,
      ReactActual.createElement(Pressable, {
        onPress: () => onSelectionChange(['alice-id', 'bob-id']),
        testID: 'select-members',
      }, ReactActual.createElement(Text, null, 'Select mocked members')),
      ReactActual.createElement(Pressable, {
        disabled: doneDisabled,
        onPress: onDone,
        testID: 'done-members',
      }, ReactActual.createElement(
        Text,
        null,
        doneLoading ? 'Creating mocked members' : doneLabel ?? 'Done mocked members',
      )),
    ),
  }
})

vi.mock('@/lib/i18n', async () => {
  const { createI18nMock } = await import('../../../test/mainScreenMocks')
  return createI18nMock()
})

vi.mock('@/lib/theme', async () => {
  const { createThemeMock } = await import('../../../test/mainScreenMocks')
  return createThemeMock()
})

vi.mock('@/store', () => ({
  useChatStore: (selector: (state: { contacts: typeof mockState.contacts }) => unknown) => (
    selector({ contacts: mockState.contacts })
  ),
}))

vi.mock('@/services/groupChat', () => ({
  MAX_GROUP_CHAT_MEMBERS: 50,
  createEncryptedGroup: mockState.createEncryptedGroup,
  getGroupRouteParam: (groupId: string) => `group:${groupId}`,
}))

const { fireEvent, render, screen } = await import('@testing-library/react-native')
const { default: CreateGroupScreen } = await import('../../../app/(main)/group/create')

describe('CreateGroupScreen', () => {
  beforeEach(() => {
    mockState.alert.mockClear()
    mockState.createEncryptedGroup.mockReset()
    mockState.createEncryptedGroup.mockResolvedValue({ groupId: 'group-id' })
    mockState.router.replace.mockClear()
  })

  it('keeps create flow disabled until a group title is present', async () => {
    render(<CreateGroupScreen />)

    expect(screen.getByTestId('button-Next: Select Members').props.disabled).toBe(true)

    await fireEvent.press(screen.getByTestId('button-Next: Select Members'))

    expect(mockState.alert).not.toHaveBeenCalled()
    expect(mockState.createEncryptedGroup).not.toHaveBeenCalled()
  })

  it('creates with trimmed details and routes to the group chat token', async () => {
    const view = render(<CreateGroupScreen />)
    const [titleInput, descriptionInput] = view.root.findAll((node) => (node.type as unknown) === 'TextInput')

    await fireEvent.changeText(titleInput, '  Audit Group  ')
    await fireEvent.changeText(descriptionInput, '  private group  ')
    await fireEvent.press(screen.getByTestId('button-Next: Select Members'))
    await fireEvent.press(screen.getByTestId('select-members'))
    await fireEvent.press(screen.getByTestId('done-members'))

    expect(mockState.createEncryptedGroup).toHaveBeenCalledWith({
      description: 'private group',
      memberIdentityIds: ['alice-id', 'bob-id'],
      title: 'Audit Group',
    })
    expect(mockState.router.replace).toHaveBeenCalledWith('/(main)/chat/group:group-id')
  })

  it('ignores repeated member Done presses while group creation is in flight', async () => {
    let resolveGroup: (group: { groupId: string }) => void = () => undefined
    mockState.createEncryptedGroup.mockImplementation(() => new Promise((resolve) => {
      resolveGroup = resolve
    }))

    const view = render(<CreateGroupScreen />)
    const [titleInput] = view.root.findAll((node) => (node.type as unknown) === 'TextInput')

    await fireEvent.changeText(titleInput, 'Audit Group')
    await fireEvent.press(screen.getByTestId('button-Next: Select Members'))
    await fireEvent.press(screen.getByTestId('select-members'))
    fireEvent.press(screen.getByTestId('done-members'))
    fireEvent.press(screen.getByTestId('done-members'))

    expect(mockState.createEncryptedGroup).toHaveBeenCalledTimes(1)

    resolveGroup({ groupId: 'group-id' })
    await Promise.resolve()
    await Promise.resolve()
    expect(mockState.router.replace).toHaveBeenCalledWith('/(main)/chat/group:group-id')
  })
})
