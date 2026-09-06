/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from './testing-library-react-native'
import {
  TestButton,
  createCryptoThemeMock,
  createI18nMock,
  createSafeAreaMock,
  createThemeMock,
  translateForTest,
} from './mainScreenMocks'
import {
  createDirectionComponentMock,
  createI18nComponentMock,
  createLucideIconMock,
} from './componentMocks'
import {
  createChatMessage,
  createConversation,
  createMediaAttachment,
  findPressableByText,
  translateForChatTest,
} from './chatComponentMocks'

describe('shared test mock helpers', () => {
  it('interpolates translation values consistently for app and chat tests', () => {
    expect(translateForTest('Retry {{count}}{{suffix}} of {{number}}', {
      count: 2,
      suffix: 'x',
      number: 5,
    })).toBe('Retry 2x of 5')
    expect(translateForChatTest('Hello {{name}}, {{count}} files', {
      name: 'auditor',
      count: 3,
    })).toBe('Hello auditor, 3 files')
    expect(createI18nMock().translate('Plain text')).toBe('Plain text')
    expect(createI18nComponentMock().getCurrentLocaleTag()).toBe('en-US')
  })

  it('provides safe-area, theme, crypto-theme, direction, and icon mocks', () => {
    const safeArea = createSafeAreaMock()
    const theme = createThemeMock()
    const cryptoTheme = createCryptoThemeMock()
    const rtl = createDirectionComponentMock(true)
    const icons = createLucideIconMock(['Shield', 'Lock'])

    expect(safeArea.useSafeAreaInsets()).toEqual({ top: 0, right: 0, bottom: 0, left: 0 })
    expect(theme.useThemeColors()).toEqual(expect.objectContaining({ primary: '#00ff99' }))
    expect(cryptoTheme.useCryptoTheme().accent()).toBe('#00ff99')
    expect(rtl.useIsCurrentLanguageRtl()).toBe(true)
    expect(rtl.getLogicalRowDirection()).toBe('row-reverse')
    expect(Object.keys(icons)).toEqual(['Shield', 'Lock'])
  })

  it('keeps test buttons interactive and discoverable by text', async () => {
    const onPress = vi.fn()
    const view = render(<TestButton onPress={onPress}>Continue</TestButton>)

    await fireEvent.press(findPressableByText(view.root, 'Continue'))

    expect(screen.getByText('Continue')).toBeTruthy()
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('creates realistic chat fixture records with overridable fields', () => {
    expect(createChatMessage({
      id: 'message-audit',
      signatureVerified: false,
    })).toEqual(expect.objectContaining({
      id: 'message-audit',
      conversationId: 'conversation-1',
      signatureVerified: false,
    }))
    expect(createConversation({
      id: 'conversation-audit',
      unreadCount: 4,
    })).toEqual(expect.objectContaining({
      id: 'conversation-audit',
      remoteIdentityId: 'identity-alice',
      unreadCount: 4,
    }))
    expect(createMediaAttachment({
      id: 'attachment-audit',
      mimeType: 'application/pdf',
      type: 'document',
    })).toEqual(expect.objectContaining({
      id: 'attachment-audit',
      fileName: 'image.jpg',
      mimeType: 'application/pdf',
      type: 'document',
    }))
  })
})
