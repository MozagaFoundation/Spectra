/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  clipboardRead: vi.fn(async () => ''),
  suggestions: vi.fn((prefix: string) => prefix ? ['abandon'] : []),
}))

vi.mock('react-native', async () => await import('../../test/react-native'))
vi.mock('expo-clipboard', () => ({
  getStringAsync: mocks.clipboardRead,
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) => (
      key
        .replace('{{number}}', String(values?.number ?? ''))
        .replace('{{word}}', String(values?.word ?? ''))
    ),
  }),
}))
vi.mock('@spectra/identity-vault', () => ({
  getEnglishBip39PrefixSuggestions: mocks.suggestions,
}))
vi.mock('@/lib/theme', async () => {
  const { testColors } = await import('../../test/mainAppMocks')
  return { useThemeColors: () => testColors }
})

const { act, fireEvent, render, screen } = await import('@testing-library/react-native')
const { Platform } = await import('react-native')
const { MnemonicInput } = await import('./MnemonicInput')

describe('MnemonicInput', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(Platform as { OS: string }).OS = 'ios'
  })

  it('never reads the clipboard until Paste is explicitly pressed', async () => {
    mocks.clipboardRead.mockResolvedValueOnce(
      Array.from({ length: 24 }, () => 'abandon').join(' '),
    )
    const onMnemonicChange = vi.fn()
    const view = render(<MnemonicInput onMnemonicChange={onMnemonicChange} />)

    expect(mocks.clipboardRead).not.toHaveBeenCalled()
    await fireEvent.press(view.root.findByProps({
      accessibilityLabel: 'Paste recovery phrase',
    }))

    expect(mocks.clipboardRead).toHaveBeenCalledTimes(1)
    expect(onMnemonicChange).toHaveBeenCalledWith(
      Array.from({ length: 24 }, () => 'abandon').join(' '),
      true,
    )
  })

  it('advances on Space and Return and moves back from an empty field', async () => {
    render(<MnemonicInput onMnemonicChange={vi.fn()} />)
    const first = screen.getByTestId('mnemonic-word-1')

    act(() => first.props.onFocus())
    expect(screen.getByText('Previous').parent!.props.accessibilityState).toEqual({
      disabled: true,
    })

    await fireEvent.changeText(screen.getByTestId('mnemonic-word-1'), 'abandon ')
    expect(screen.getByText('Previous').parent!.props.accessibilityState).toEqual({
      disabled: false,
    })

    const second = screen.getByTestId('mnemonic-word-2')
    act(() => second.props.onSubmitEditing())
    expect(screen.getByText('Previous').parent!.props.accessibilityState).toEqual({
      disabled: false,
    })

    act(() => second.props.onFocus())
    act(() => second.props.onKeyPress({ nativeEvent: { key: 'Backspace' } }))
    expect(screen.getByText('Previous').parent!.props.accessibilityState).toEqual({
      disabled: true,
    })
  })

  it('selects local BIP39 suggestions and advances without network or clipboard access', async () => {
    const onMnemonicChange = vi.fn()
    render(<MnemonicInput onMnemonicChange={onMnemonicChange} />)
    const first = screen.getByTestId('mnemonic-word-1')

    act(() => first.props.onFocus())
    await fireEvent.changeText(screen.getByTestId('mnemonic-word-1'), 'aban')
    expect(mocks.suggestions).toHaveBeenCalledWith('aban')
    await fireEvent.press(screen.getByTestId('mnemonic-suggestion-abandon'))

    expect(mocks.suggestions).toHaveBeenCalledWith('aban')
    expect(mocks.clipboardRead).not.toHaveBeenCalled()
    expect(onMnemonicChange).toHaveBeenLastCalledWith('abandon', false)
    expect(screen.getByText('Previous').parent!.props.accessibilityState).toEqual({
      disabled: false,
    })
  })

  it('uses hardened input settings and an accessible iOS toolbar', () => {
    render(<MnemonicInput onMnemonicChange={vi.fn()} embeddedScroll={false} />)
    const first = screen.getByTestId('mnemonic-word-1')
    const last = screen.getByTestId('mnemonic-word-24')

    expect(first.props).toMatchObject({
      autoComplete: 'off',
      autoCorrect: false,
      importantForAutofill: 'no',
      inputAccessoryViewID: 'mnemonic-keyboard-accessory',
      returnKeyType: 'next',
      spellCheck: false,
      textContentType: 'none',
    })
    expect(last.props.returnKeyType).toBe('done')
    expect(screen.getByText('Done').parent!.props.accessibilityRole).toBe('button')
  })
})
