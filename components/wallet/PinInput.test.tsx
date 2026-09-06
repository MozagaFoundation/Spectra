/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-native', async () => {
  const rn = await import('../../test/react-native')
  return {
    ...rn,
    Platform: {
      ...rn.Platform,
      OS: 'android',
    },
  }
})

vi.mock('expo-haptics', () => ({
  impactAsync: vi.fn(async () => undefined),
  notificationAsync: vi.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Error: 'error' },
}))

vi.mock('@/lib/theme', async () => {
  const { testColors } = await import('../../test/mainAppMocks')
  return { useThemeColors: () => testColors }
})

const { fireEvent, render } = await import('@testing-library/react-native')
const { Platform, StyleSheet } = await import('react-native')
const { PinInput } = await import('./PinInput')

describe('PinInput', () => {
  beforeEach(() => {
    ;(Platform as { OS: string }).OS = 'android'
  })

  it('uses an invisible Android number-pad input over the PIN boxes', () => {
    const view = render(<PinInput onComplete={vi.fn()} length={4} label="Re-enter your PIN" />)

    const input = view.root.findByProps({ keyboardType: 'number-pad' })
    const flattenedStyle = StyleSheet.flatten(input.props.style)
    const label = view.getByText('Re-enter your PIN')
    const flattenedLabelStyle = StyleSheet.flatten(label.props.style)

    expect(input.props.autoFocus).toBe(false)
    expect(input.props.autoCorrect).toBe(false)
    expect(input.props.caretHidden).toBe(true)
    expect(input.props.contextMenuHidden).toBe(true)
    expect(input.props.secureTextEntry).toBe(true)
    expect(input.props.showSoftInputOnFocus).toBe(true)
    expect(input.props.spellCheck).toBe(false)
    expect(input.props.underlineColorAndroid).toBe('transparent')
    expect(input.props.inputAccessoryViewID).toBeUndefined()
    expect(flattenedStyle.position).toBe('absolute')
    expect(flattenedStyle.color).toBe('transparent')
    expect(flattenedStyle.opacity).toBe(0)
    expect(flattenedLabelStyle.textAlign).toBe('center')
  })

  it('filters typed Android digits and completes once the PIN is full', () => {
    const onComplete = vi.fn()
    const view = render(<PinInput onComplete={onComplete} length={4} />)
    const input = view.root.findByProps({ keyboardType: 'number-pad' })

    fireEvent.changeText(input, '12a345')

    expect(onComplete).toHaveBeenCalledWith('1234')
  })

  it('overlays the iOS number-pad input and replaces the system OK accessory', () => {
    ;(Platform as { OS: string }).OS = 'ios'

    const view = render(<PinInput onComplete={vi.fn()} length={4} />)
    const input = view.root.findByProps({ keyboardType: 'number-pad' })
    const flattenedStyle = StyleSheet.flatten(input.props.style)
    const accessory = view.root.findByProps({ nativeID: 'spectra-pin-keyboard-accessory' })

    expect(input.props.autoFocus).toBe(true)
    expect(input.props.caretHidden).toBe(true)
    expect(input.props.contextMenuHidden).toBe(true)
    expect(input.props.secureTextEntry).toBe(false)
    expect(input.props.inputAccessoryViewID).toBe('spectra-pin-keyboard-accessory')
    expect(flattenedStyle.position).toBe('absolute')
    expect(flattenedStyle.color).toBe('transparent')
    expect(flattenedStyle.opacity).toBe(0)
    expect(accessory).toBeTruthy()
  })
})
