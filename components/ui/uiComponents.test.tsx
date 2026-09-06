/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { Keyboard, Text } from 'react-native'
import type { ReactTestInstance } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react-native'

import { Button, Card, Input, KeyboardDoneAccessory, LanguageSelectorModal } from './index'

const mockState = vi.hoisted(() => ({
  selectionAsync: vi.fn(),
  translate: vi.fn((key: string) => `t:${key}`),
}))

vi.mock('expo-haptics', () => ({
  selectionAsync: mockState.selectionAsync,
}))

vi.mock('lucide-react-native', async () => {
  const { TestIcon } = await import('../../test/mainScreenMocks')
  return {
    Check: TestIcon,
    X: TestIcon,
  }
})

vi.mock('react-native-safe-area-context', async () => {
  const { createSafeAreaMock } = await import('../../test/mainScreenMocks')
  return createSafeAreaMock()
})

vi.mock('@/components/common/SpectraBackdrop', () => ({
  SpectraBackdrop: () => null,
}))

vi.mock('@/lib/i18n', () => ({
  translate: mockState.translate,
}))

vi.mock('@/lib/i18n/languages', () => ({
  getLocalizedLanguageName: (language: { nativeName: string }) => language.nativeName,
  normalizeAppLanguageCode: (language: string | null | undefined) => language ?? 'en',
  SUPPORTED_LANGUAGES: [
    { code: 'en', englishName: 'English', flag: 'US', nativeName: 'English' },
    { code: 'es', englishName: 'Spanish', flag: 'ES', nativeName: 'Español' },
  ],
}))

vi.mock('@/lib/theme', async () => {
  const { createThemeMock } = await import('../../test/mainScreenMocks')
  return createThemeMock()
})

function textContent(node: ReactTestInstance): string {
  return node.children.map((child) => (
    typeof child === 'string' ? child : textContent(child)
  )).join('')
}

function findHost(root: ReactTestInstance, type: string): ReactTestInstance[] {
  return root.findAll((node) => node.type === type)
}

function findPressableByText(root: ReactTestInstance, text: string): ReactTestInstance {
  return findHost(root, 'Pressable')
    .find((node) => node.findAll((child) => textContent(child) === text).length > 0)!
}

describe('ui components', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.selectionAsync.mockResolvedValue(undefined)
    mockState.translate.mockImplementation((key: string) => `t:${key}`)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Button', () => {
    it('translates string children and blocks presses while disabled or loading', async () => {
      const onPress = vi.fn()
      const view = render(
        <Button disabled onPress={onPress}>
          Save
        </Button>,
      )

      expect(textContent(findHost(view.root, 'Text')[0])).toBe('t:Save')
      await fireEvent.press(findHost(view.root, 'Pressable')[0])
      expect(onPress).not.toHaveBeenCalled()

      view.update(
        <Button loading onPress={onPress}>
          Save
        </Button>,
      )

      expect(findHost(view.root, 'ActivityIndicator')).toHaveLength(1)
      expect(findHost(view.root, 'Text')).toHaveLength(0)
      await fireEvent.press(findHost(view.root, 'Pressable')[0])
      expect(onPress).not.toHaveBeenCalled()
    })

    it('does not translate non-string children', () => {
      render(
        <Button>
          <Text>Already translated</Text>
        </Button>,
      )

      expect(mockState.translate).not.toHaveBeenCalled()
    })

    it('applies primary accent colors only for primary buttons', () => {
      const primary = render(<Button accentColor="#123456">Pay</Button>)
      expect(findHost(primary.root, 'Pressable')[0].props.style).toEqual({ backgroundColor: '#123456' })

      const secondary = render(
        <Button accentColor="#123456" variant="secondary">
          Pay
        </Button>,
      )
      expect(findHost(secondary.root, 'Pressable')[0].props.style).toBeUndefined()
    })
  })

  describe('Input', () => {
    it('translates label, placeholder, and error while forwarding native props', async () => {
      const onChangeText = vi.fn()
      const view = render(
        <Input
          error="Required"
          keyboardType="number-pad"
          label="Display Name"
          multiline
          numberOfLines={3}
          onChangeText={onChangeText}
          placeholder="Enter your name"
          secureTextEntry
          value="Manuela"
        />,
      )
      const input = findHost(view.root, 'TextInput')[0]

      expect(textContent(findHost(view.root, 'Text')[0])).toBe('t:Display Name')
      expect(input.props.placeholder).toBe('t:Enter your name')
      expect(input.props.keyboardType).toBe('number-pad')
      expect(input.props.multiline).toBe(true)
      expect(input.props.numberOfLines).toBe(3)
      expect(input.props.secureTextEntry).toBe(true)
      expect(textContent(findHost(view.root, 'Text')[1])).toBe('t:Required')

      await fireEvent.changeText(input, 'Alice')
      expect(onChangeText).toHaveBeenCalledWith('Alice')
    })
  })

  describe('Card', () => {
    it('merges default styles and forwards View props', () => {
      const view = render(
        <Card accessibilityLabel="Security card" className="p-4" testID="card">
          <Text>Body</Text>
        </Card>,
      )
      const card = findHost(view.root, 'View')
        .find((node) => node.props.testID === 'card')

      expect(card?.props.accessibilityLabel).toBe('Security card')
      expect(card?.props.className).toContain('rounded-2xl bg-surface')
      expect(card?.props.className).toContain('p-4')
    })
  })

  describe('KeyboardDoneAccessory', () => {
    it('dismisses the iOS keyboard from its accessory action', async () => {
      const dismiss = vi.spyOn(Keyboard, 'dismiss')
      const view = render(<KeyboardDoneAccessory nativeID="amount-keyboard" />)

      expect(findHost(view.root, 'InputAccessoryView')[0].props.nativeID).toBe('amount-keyboard')

      await fireEvent.press(findPressableByText(view.root, 't:Done'))

      expect(dismiss).toHaveBeenCalledOnce()
    })
  })

  describe('LanguageSelectorModal', () => {
    it('marks the selected language and closes before selecting a new language', async () => {
      const order: string[] = []
      const onClose = vi.fn(() => order.push('close'))
      const onSelect = vi.fn(async () => {
        order.push('select')
      })
      const view = render(
        <LanguageSelectorModal
          onClose={onClose}
          onSelect={onSelect}
          selectedLanguage="es"
          title="Language"
          visible
        />,
      )
      const languageRows = findHost(view.root, 'Pressable').filter((node) => node.props.style?.borderWidth)

      expect(languageRows[1].props.style).toMatchObject({
        borderColor: '#00ff99',
        borderWidth: 2,
      })

      await fireEvent.press(findPressableByText(view.root, 'English'))

      expect(order).toEqual(['close', 'select'])
      expect(onSelect).toHaveBeenCalledWith('en')
      expect(mockState.selectionAsync).toHaveBeenCalledTimes(1)
    })

    it('logs selection failures after closing the modal', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      const onClose = vi.fn()
      const onSelect = vi.fn(async () => {
        throw new Error('persistence failed')
      })
      const view = render(
        <LanguageSelectorModal
          onClose={onClose}
          onSelect={onSelect}
          selectedLanguage={null}
          title="Language"
          visible
        />,
      )

      await fireEvent.press(findPressableByText(view.root, 'English'))

      expect(onClose).toHaveBeenCalledTimes(1)
      expect(consoleError).toHaveBeenCalledWith(
        'Failed to change app language:',
        expect.any(Error),
      )
    })
  })
})
