/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactTestInstance } from 'react-test-renderer'

const mockState = vi.hoisted(() => ({
  haptics: {
    impactAsync: vi.fn(async () => {}),
    notificationAsync: vi.fn(async () => {}),
  },
  router: {
    back: vi.fn(),
  },
  support: {
    collectDeviceInfo: vi.fn(() => ({ device_model: 'iPhone Test', os: 'ios test' })),
    submitSupportTicket: vi.fn(async () => ({ data: { id: 'ticket-1' }, error: null })),
    uploadSupportImage: vi.fn(async () => ({ url: 'storage://image', error: null })),
  },
}))

vi.mock('react-native', async () => {
  const rn = await import('../../../test/react-native')
  return {
    ...rn,
    Alert: { alert: vi.fn() },
  }
})

vi.mock('react-native-keyboard-controller', async () => {
  const { View } = await import('../../../test/react-native')
  return { KeyboardAvoidingView: View }
})

vi.mock('expo-image', async () => {
  const { Image } = await import('../../../test/react-native')
  return { Image }
})

vi.mock('expo-router', () => ({
  useRouter: () => mockState.router,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success' },
  impactAsync: mockState.haptics.impactAsync,
  notificationAsync: mockState.haptics.notificationAsync,
}))

vi.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: vi.fn(async () => ({ canceled: true, assets: [] })),
  requestMediaLibraryPermissionsAsync: vi.fn(async () => ({ status: 'granted' })),
}))

vi.mock('react-native-safe-area-context', async () => {
  const { createSafeAreaMock } = await import('../../../test/mainScreenMocks')
  return createSafeAreaMock()
})

vi.mock('lucide-react-native', async () => {
  const { TestIcon } = await import('../../../test/mainScreenMocks')
  return {
    Bug: TestIcon,
    CheckCircle: TestIcon,
    ChevronDown: TestIcon,
    ChevronLeft: TestIcon,
    HelpCircle: TestIcon,
    ImagePlus: TestIcon,
    Info: TestIcon,
    Lightbulb: TestIcon,
    ShieldAlert: TestIcon,
    X: TestIcon,
  }
})

vi.mock('@/components/ui', async () => {
  const { TestCard } = await import('../../../test/mainScreenMocks')
  return { Card: TestCard }
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
  useAuthStore: () => ({ exoAddress: 'EXO001111111111111111111111111111111111111' }),
}))

vi.mock('@/services/backend/support', () => mockState.support)

const { fireEvent, render, screen } = await import('@testing-library/react-native')
const { default: ReportIssueScreen } = await import('../../../app/(main)/settings/report-issue')

function textContent(node: ReactTestInstance): string {
  return node.children.map((child) => (
    typeof child === 'string' ? child : textContent(child)
  )).join('')
}

function getPressableByText(root: ReactTestInstance, text: string): ReactTestInstance {
  const match = root.findAll((node) => (
    typeof node.props.onPress === 'function' && textContent(node).includes(text)
  ))[0]
  if (!match) throw new Error(`Unable to find pressable ${text}`)
  return match
}

describe('ReportIssueScreen', () => {
  beforeEach(() => {
    mockState.support.submitSupportTicket.mockClear()
    mockState.support.collectDeviceInfo.mockClear()
  })

  it('gates submission until category and minimum description are present', async () => {
    const view = render(<ReportIssueScreen />)
    const descriptionInput = view.root.findAll((node) => (node.type as unknown) === 'TextInput')[0]

    await fireEvent.changeText(descriptionInput, 'too short')
    await fireEvent.press(getPressableByText(view.root, 'Submit Report'))

    expect(mockState.support.submitSupportTicket).not.toHaveBeenCalled()
  })

  it('submits a trimmed report with device metadata collected once per render', async () => {
    const view = render(<ReportIssueScreen />)
    const descriptionInput = view.root.findAll((node) => (node.type as unknown) === 'TextInput')[0]

    await fireEvent.press(getPressableByText(view.root, 'Select a category'))
    await fireEvent.press(getPressableByText(view.root, 'Bug Report'))
    await fireEvent.changeText(descriptionInput, '   This is a reproducible auditor report.   ')
    await fireEvent.press(getPressableByText(view.root, 'Submit Report'))

    expect(mockState.support.submitSupportTicket).toHaveBeenCalledWith(
      'EXO001111111111111111111111111111111111111',
      'bug',
      'This is a reproducible auditor report.',
      [],
    )
    expect(screen.getByText('Thank You')).toBeTruthy()
    expect(screen.getByText('Your report has been submitted.')).toBeTruthy()
    expect(() => screen.getByText(
      'Your report has been submitted. We will look into it as soon as possible.',
    )).toThrow()
  })
})
