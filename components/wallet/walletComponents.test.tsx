/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import type { ReactTestInstance } from 'react-test-renderer'
import { Keyboard, Platform } from 'react-native'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render } from '@testing-library/react-native'

import { MnemonicDisplay, MnemonicInput, PinInput } from './index'

const mockState = vi.hoisted(() => ({
  clipboardText: '',
  getStringAsync: vi.fn(),
  impactAsync: vi.fn(),
  notificationAsync: vi.fn(),
}))

vi.mock('expo-clipboard', () => ({
  getStringAsync: mockState.getStringAsync,
}))

vi.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Error: 'error' },
  impactAsync: mockState.impactAsync,
  notificationAsync: mockState.notificationAsync,
}))

vi.mock('react-i18next', () => ({
  initReactI18next: {
    type: '3rdParty',
    init: () => undefined,
  },
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@spectra/identity-vault', () => ({
  getEnglishBip39PrefixSuggestions: (prefix: string, limit: number = 4) => (
    ['abandon', 'ability', 'able', 'about', 'above']
      .filter((word) => word.startsWith(prefix.trim().toLowerCase()))
      .slice(0, limit)
  ),
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

function latestCall(mock: { mock: { calls: unknown[][] } }): unknown[] {
  return mock.mock.calls[mock.mock.calls.length - 1]
}

function pressableByLabel(root: ReactTestInstance, label: string): ReactTestInstance {
  return root.find((node) => node.props.accessibilityLabel === label)
}

describe('wallet components', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(Platform as { OS: string }).OS = 'ios'
    mockState.clipboardText = ''
    mockState.getStringAsync.mockImplementation(async () => mockState.clipboardText)
  })

  describe('PinInput', () => {
    it('filters to digits, caps at the configured length, and completes once', async () => {
      const onComplete = vi.fn()
      const view = render(<PinInput length={4} onComplete={onComplete} />)
      const input = findHost(view.root, 'TextInput')[0]

      await fireEvent.changeText(input, '12ab3456')

      expect(onComplete).toHaveBeenCalledTimes(1)
      expect(onComplete).toHaveBeenCalledWith('1234')
      expect(mockState.impactAsync).toHaveBeenCalledWith('light')
      expect(findHost(view.root, 'TextInput')[0].props.value).toBe('1234')
    })

    it('does not accept input while disabled', async () => {
      const onComplete = vi.fn()
      const view = render(<PinInput disabled onComplete={onComplete} />)

      await fireEvent.changeText(findHost(view.root, 'TextInput')[0], '123456')

      expect(onComplete).not.toHaveBeenCalled()
      expect(findHost(view.root, 'TextInput')[0].props.value).toBe('')
      expect(findHost(view.root, 'TextInput')[0].props.editable).toBe(false)
    })

    it('clears the entered PIN and triggers error haptics when an error appears', async () => {
      const onComplete = vi.fn()
      const view = render(<PinInput onComplete={onComplete} />)

      await fireEvent.changeText(findHost(view.root, 'TextInput')[0], '123')
      expect(findHost(view.root, 'TextInput')[0].props.value).toBe('123')

      view.update(<PinInput error="Wrong PIN" onComplete={onComplete} />)

      expect(findHost(view.root, 'TextInput')[0].props.value).toBe('')
      expect(mockState.notificationAsync).toHaveBeenCalledWith('error')
    })

    it('keeps a transparent Android input over the PIN boxes so taps open the native keyboard', () => {
      ;(Platform as { OS: string }).OS = 'android'
      const view = render(<PinInput onComplete={vi.fn()} />)
      const input = findHost(view.root, 'TextInput')[0]

      expect(input.props.className).toBeUndefined()
      expect(input.props.autoFocus).toBe(false)
      expect(input.props.contextMenuHidden).toBe(true)
      expect(input.props.secureTextEntry).toBe(true)
      expect(input.props.showSoftInputOnFocus).toBe(true)
      expect(input.props.underlineColorAndroid).toBe('transparent')
      expect(input.props.style).toMatchObject({
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        color: 'transparent',
        opacity: 0,
      })
      expect(pressableByLabel(view.root, 'PIN input')).toBeTruthy()
    })

    it('does not render the old Android custom keypad', () => {
      ;(Platform as { OS: string }).OS = 'android'
      const view = render(<PinInput length={4} onComplete={vi.fn()} />)

      expect(view.root.findAll((node) => node.props.testID === 'android-pin-keypad')).toHaveLength(0)
    })

    it('replaces the iOS number-pad OK chip with a transparent accessory over the PIN boxes', () => {
      ;(Platform as { OS: string }).OS = 'ios'
      const view = render(<PinInput onComplete={vi.fn()} />)
      const input = findHost(view.root, 'TextInput')[0]

      expect(input.props.autoFocus).toBe(true)
      expect(input.props.caretHidden).toBe(true)
      expect(input.props.inputAccessoryViewID).toBe('spectra-pin-keyboard-accessory')
      expect(input.props.style).toMatchObject({
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        color: 'transparent',
        opacity: 0,
      })
      expect(findHost(view.root, 'InputAccessoryView')[0].props.nativeID)
        .toBe('spectra-pin-keyboard-accessory')
    })
  })

  describe('MnemonicInput', () => {
    it('normalizes single-word edits and reports incomplete state', async () => {
      const onMnemonicChange = vi.fn()
      const view = render(<MnemonicInput onMnemonicChange={onMnemonicChange} />)

      await fireEvent.changeText(findHost(view.root, 'TextInput')[0], 'Abandon ')

      expect(latestCall(onMnemonicChange)).toEqual(['abandon', false])
    })

    it('advances on Space and Return without dismissing the iOS keyboard', async () => {
      const dismissSpy = vi.spyOn(Keyboard, 'dismiss')
      const view = render(<MnemonicInput onMnemonicChange={vi.fn()} />)
      const firstInput = findHost(view.root, 'TextInput')[0]

      await act(async () => {
        firstInput.props.onFocus()
      })
      await fireEvent.changeText(firstInput, 'abandon ')

      expect(pressableByLabel(view.root, 'Previous').props.disabled).toBe(false)
      expect(dismissSpy).not.toHaveBeenCalled()

      const secondInput = findHost(view.root, 'TextInput')[1]
      await act(async () => {
        secondInput.props.onSubmitEditing()
      })

      expect(pressableByLabel(view.root, 'Previous').props.disabled).toBe(false)
      expect(dismissSpy).not.toHaveBeenCalled()
      dismissSpy.mockRestore()
    })

    it('moves to the previous word when Backspace is pressed on an empty field', async () => {
      const view = render(<MnemonicInput onMnemonicChange={vi.fn()} />)
      const secondInput = findHost(view.root, 'TextInput')[1]

      await act(async () => {
        secondInput.props.onFocus()
        secondInput.props.onKeyPress({ nativeEvent: { key: 'Backspace' } })
      })

      expect(pressableByLabel(view.root, 'Previous').props.disabled).toBe(true)
    })

    it('provides accessible Previous, Next, and Done iOS keyboard controls', async () => {
      const dismissSpy = vi.spyOn(Keyboard, 'dismiss')
      const view = render(<MnemonicInput onMnemonicChange={vi.fn()} />)

      await act(async () => {
        findHost(view.root, 'TextInput')[0].props.onFocus()
      })

      expect(findHost(view.root, 'InputAccessoryView')[0].props.nativeID)
        .toBe('mnemonic-keyboard-accessory')
      expect(pressableByLabel(view.root, 'Previous').props.accessibilityRole).toBe('button')
      expect(pressableByLabel(view.root, 'Previous').props.disabled).toBe(true)
      expect(pressableByLabel(view.root, 'Next').props.disabled).toBe(false)

      await fireEvent.press(pressableByLabel(view.root, 'Next'))
      expect(pressableByLabel(view.root, 'Previous').props.disabled).toBe(false)

      await fireEvent.press(pressableByLabel(view.root, 'Previous'))
      expect(pressableByLabel(view.root, 'Previous').props.disabled).toBe(true)

      await fireEvent.press(pressableByLabel(view.root, 'Done'))
      expect(dismissSpy).toHaveBeenCalledTimes(1)
      dismissSpy.mockRestore()
    })

    it('shows local BIP39 prefix suggestions and fills then advances on selection', async () => {
      const onMnemonicChange = vi.fn()
      const view = render(<MnemonicInput onMnemonicChange={onMnemonicChange} />)
      const firstInput = findHost(view.root, 'TextInput')[0]

      await act(async () => {
        firstInput.props.onFocus()
      })
      await fireEvent.changeText(firstInput, 'abo')

      expect(view.getByTestId('mnemonic-suggestions')).toBeTruthy()
      await fireEvent.press(view.getByTestId('mnemonic-suggestion-about'))

      expect(findHost(view.root, 'TextInput')[0].props.value).toBe('about')
      expect(latestCall(onMnemonicChange)).toEqual(['about', false])
      expect(pressableByLabel(view.root, 'Previous').props.disabled).toBe(false)
    })

    it('disables correction, prediction, spellcheck, and autofill on every word', () => {
      const view = render(<MnemonicInput onMnemonicChange={vi.fn()} />)

      for (const input of findHost(view.root, 'TextInput')) {
        expect(input.props.autoCapitalize).toBe('none')
        expect(input.props.autoComplete).toBe('off')
        expect(input.props.autoCorrect).toBe(false)
        expect(input.props.importantForAutofill).toBe('no')
        expect(input.props.keyboardType).toBe('ascii-capable')
        expect(input.props.smartInsertDelete).toBe(false)
        expect(input.props.spellCheck).toBe(false)
        expect(input.props.submitBehavior).toBe('submit')
        expect(input.props.textContentType).toBe('none')
      }
    })

    it('clears stale trailing words when a shorter phrase is pasted over a full phrase', async () => {
      const onMnemonicChange = vi.fn()
      const fullPhrase = Array.from({ length: 24 }, (_, index) => `word${index + 1}`).join(' ')
      const shorterPhrase = Array.from({ length: 12 }, (_, index) => `new${index + 1}`).join(' ')
      const view = render(<MnemonicInput onMnemonicChange={onMnemonicChange} />)

      await fireEvent.changeText(findHost(view.root, 'TextInput')[0], fullPhrase)
      expect(latestCall(onMnemonicChange)).toEqual([fullPhrase, true])

      await fireEvent.changeText(findHost(view.root, 'TextInput')[0], shorterPhrase)

      expect(latestCall(onMnemonicChange)).toEqual([shorterPhrase, false])
      expect(findHost(view.root, 'TextInput')[12].props.value).toBe('')
    })

    it('does not inspect the clipboard during render, focus, or typing', async () => {
      const view = render(<MnemonicInput onMnemonicChange={vi.fn()} />)
      const firstInput = findHost(view.root, 'TextInput')[0]

      await act(async () => {
        firstInput.props.onFocus()
      })
      await fireEvent.changeText(firstInput, 'abo')

      expect(mockState.getStringAsync).not.toHaveBeenCalled()
    })

    it('pastes from the clipboard through the explicit Paste action', async () => {
      const onMnemonicChange = vi.fn()
      mockState.clipboardText = 'Alpha Beta Gamma'
      const view = render(<MnemonicInput onMnemonicChange={onMnemonicChange} />)
      const pasteButton = findHost(view.root, 'Pressable')
        .find((node) => node.findAll((child) => textContent(child) === 'Paste').length > 0)

      expect(pasteButton).toBeTruthy()
      await fireEvent.press(pasteButton!)

      expect(mockState.getStringAsync).toHaveBeenCalledTimes(1)
      expect(latestCall(onMnemonicChange)).toEqual(['alpha beta gamma', false])
    })

    it('can let parent screens own recovery phrase scrolling', () => {
      const view = render(<MnemonicInput embeddedScroll={false} onMnemonicChange={vi.fn()} />)

      expect(findHost(view.root, 'TextInput')).toHaveLength(24)
      expect(findHost(view.root, 'ScrollView')).toHaveLength(0)
    })
  })

  describe('MnemonicDisplay', () => {
    it('renders trimmed mnemonic words in two numbered columns', () => {
      const mnemonic = `  ${Array.from({ length: 24 }, (_, index) => `word${index + 1}`).join('\n')}  `
      const view = render(<MnemonicDisplay mnemonic={mnemonic} />)
      const textNodes = findHost(view.root, 'Text').map(textContent)

      expect(textNodes).toContain('1.')
      expect(textNodes).toContain('13.')
      expect(textNodes).toContain('word1')
      expect(textNodes).toContain('word24')
    })
  })
})
