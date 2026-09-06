/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  disable: vi.fn(function disable(this: unknown) {
    return this
  }),
  openExternalUrl: vi.fn(async () => true),
}))

vi.mock('react-native', async () => ({
  ...await import('../../test/react-native'),
}))

vi.mock('react-native-markdown-display', async () => {
  const ReactActual = await import('react')
  const { Pressable, Text, View } = await import('../../test/react-native')
  return {
    default: ({
      children,
      onLinkPress,
    }: {
      children: string
      onLinkPress: (url: string) => boolean
    }) => ReactActual.createElement(
      View,
      { testID: 'markdown-content' },
      ReactActual.createElement(Text, null, children),
      ReactActual.createElement(Pressable, { onPress: () => onLinkPress('https://example.test/a?b=1'), testID: 'https-link' }, ReactActual.createElement(Text, null, 'https')),
      ReactActual.createElement(Pressable, { onPress: () => onLinkPress('javascript:alert(1)'), testID: 'bad-link' }, ReactActual.createElement(Text, null, 'bad')),
      ReactActual.createElement(Pressable, { onPress: () => onLinkPress('http://example.test'), testID: 'http-link' }, ReactActual.createElement(Text, null, 'http')),
    ),
    MarkdownIt: vi.fn(() => ({ disable: mockState.disable })),
  }
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/lib/i18n/direction', () => ({
  getDirectionalTextStyle: () => ({}),
  getLogicalRowDirection: () => 'row',
  getStartBorderStyle: () => ({}),
  useIsCurrentLanguageRtl: () => false,
}))

vi.mock('@/lib/theme', async () => {
  const { chatTestColors } = await import('../../test/chatComponentMocks')
  return { useThemeColors: () => chatTestColors }
})

vi.mock('@/services/tor/externalLinkPolicy', () => ({
  openExternalUrl: mockState.openExternalUrl,
}))

const { fireEvent, render } = await import('@testing-library/react-native')
const { MarkdownContent } = await import('./MarkdownContent')
const { MarkdownIt } = await import('react-native-markdown-display')

describe('MarkdownContent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('skips markdown parsing for plain text', () => {
    const view = render(<MarkdownContent content="hello there" fontSize={16} />)

    expect(view.getByText('hello there')).toBeTruthy()
    expect(MarkdownIt).not.toHaveBeenCalled()
  })

  it('trims content and disables markdown image tokens', () => {
    const view = render(<MarkdownContent content="  **hello**  " fontSize={16} />)

    expect(view.getByText('**hello**')).toBeTruthy()
    expect(MarkdownIt).toHaveBeenCalledWith({ typographer: true })
    expect(mockState.disable).toHaveBeenCalledWith(['image'])
  })

  it('only opens https links', async () => {
    const view = render(<MarkdownContent content="[site](https://example.test)" fontSize={16} />)

    await fireEvent.press(view.getByTestId('https-link'))
    await fireEvent.press(view.getByTestId('bad-link'))
    await fireEvent.press(view.getByTestId('http-link'))

    expect(mockState.openExternalUrl).toHaveBeenCalledTimes(1)
    expect(mockState.openExternalUrl).toHaveBeenCalledWith('https://example.test/a?b=1')
  })
})
