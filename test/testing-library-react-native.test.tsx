/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Pressable, Text, TextInput, View } from 'react-native'
import { cleanup, fireEvent, render, screen } from './testing-library-react-native'

describe('testing-library-react-native shim', () => {
  it('cleans up rendered trees so stale screen queries fail closed', () => {
    render(
      <View testID="root">
        <Text>Audit tree</Text>
      </View>,
    )

    expect(screen.getByTestId('root')).toBeTruthy()

    cleanup()

    expect(() => screen.getByTestId('root')).toThrow('No React Native test tree has been rendered')
  })

  it('replaces the previous tree when rendering again', () => {
    render(<Text testID="first">First tree</Text>)
    render(<Text testID="second">Second tree</Text>)

    expect(screen.queryByTestId('first')).toBeNull()
    expect(screen.getByTestId('second')).toBeTruthy()
  })

  it('matches leaf text and resets global regex state between queries', () => {
    const repeatedPattern = /Hello auditors/g
    render(
      <View>
        <Text>Hello auditors</Text>
      </View>,
    )

    expect(screen.getByText(repeatedPattern)).toBeTruthy()
    expect(screen.getByText(repeatedPattern)).toBeTruthy()
  })

  it('fires common interactions inside act and respects disabled controls', async () => {
    const onPress = vi.fn()
    const onDisabledPress = vi.fn()
    const onChangeText = vi.fn()
    const view = render(
      <View>
        <Pressable onPress={onPress}>
          <Text>Enabled</Text>
        </Pressable>
        <Pressable accessibilityState={{ disabled: true }} onPress={onDisabledPress}>
          <Text>Disabled</Text>
        </Pressable>
        <TextInput onChangeText={onChangeText} />
      </View>,
    )

    const pressables = view.root.findAllByType('Pressable' as any)
    await fireEvent.press(pressables[0])
    await fireEvent.press(pressables[1])
    await fireEvent.changeText(view.root.findByType('TextInput' as any), 'reviewed')

    expect(onPress).toHaveBeenCalledTimes(1)
    expect(onDisabledPress).not.toHaveBeenCalled()
    expect(onChangeText).toHaveBeenCalledWith('reviewed')
  })
})
