/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { describe, expect, it, vi } from 'vitest'

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
        props.renderRightActions?.({ value: 0 }, { value: -72 }),
      )
    }),
  }
})

vi.mock('lucide-react-native', async () => {
  const { TestIcon } = await import('../../test/mainAppMocks')
  return { Trash2: TestIcon }
})

vi.mock('@/lib/i18n', async () => {
  const { translateForTest } = await import('../../test/mainAppMocks')
  return { translate: translateForTest }
})

vi.mock('@/lib/theme', async () => {
  const { testColors } = await import('../../test/mainAppMocks')
  return { useThemeColors: () => testColors }
})

const { fireEvent, render } = await import('@testing-library/react-native')
const { Text } = await import('../../test/react-native')
const { SwipeableContactItem } = await import('./SwipeableContactItem')

describe('SwipeableContactItem', () => {
  it('reveals a delete action on the trailing swipe and reports the contact id', async () => {
    const onDelete = vi.fn()
    const view = render(
      <SwipeableContactItem contactId="identity-alice" onDelete={onDelete}>
        <Text>Alice</Text>
      </SwipeableContactItem>,
    )

    expect(view.getByText('Alice')).toBeTruthy()
    await fireEvent.press(view.getByTestId('contact-swipe-delete'))
    expect(onDelete).toHaveBeenCalledWith('identity-alice')
  })
})
