/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { ReactTestInstance } from 'react-test-renderer'

const mockState = vi.hoisted(() => ({
  linking: {
    openURL: vi.fn(),
  },
  router: {
    back: vi.fn(),
    push: vi.fn(),
  },
}))

vi.mock('react-native', async () => {
  const rn = await import('../../../test/react-native')
  return {
    ...rn,
    Linking: mockState.linking,
  }
})

vi.mock('expo-image', async () => {
  const { Image } = await import('../../../test/react-native')
  return { Image }
})

vi.mock('@/assets/images/spectra/isotipo-full-color.svg', () => ({ default: 'logo-dark' }))
vi.mock('@/assets/images/spectra/isotipo-verde-1.svg', () => ({ default: 'logo-light' }))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('react-native-safe-area-context', async () => {
  const { createSafeAreaMock } = await import('../../../test/mainScreenMocks')
  return createSafeAreaMock()
})

vi.mock('lucide-react-native', async () => {
  const { TestIcon } = await import('../../../test/mainScreenMocks')
  return {
    Building2: TestIcon,
    ChevronLeft: TestIcon,
    ChevronRight: TestIcon,
    FileText: TestIcon,
    Globe: TestIcon,
    HelpCircle: TestIcon,
    Landmark: TestIcon,
    Mail: TestIcon,
    MessageSquareWarning: TestIcon,
    Scale: TestIcon,
    Shield: TestIcon,
  }
})

vi.mock('@/components/ui', async () => {
  const { TestCard } = await import('../../../test/mainScreenMocks')
  return { Card: TestCard }
})

vi.mock('@/lib/appMetadata', () => ({
  getRuntimeAppVersion: () => '9.8.7',
  LEGAL_CONTACT_EMAIL: 'legal@spectraprotocol.org',
  LEGAL_OWNER_NAME: 'MOZAGA FOUNDATION',
  PRIVACY_CONTACT_EMAIL: 'privacy@spectraprotocol.org',
  SPECTRA_COPYRIGHT_NOTICE: 'Copyright (c) 2026 MOZAGA FOUNDATION.',
  SPECTRA_WEBSITE_URL: 'https://spectraprotocol.org',
}))

vi.mock('@/lib/i18n', async () => {
  const { createI18nMock } = await import('../../../test/mainScreenMocks')
  return createI18nMock()
})

vi.mock('@/lib/theme', async () => {
  const { createThemeMock } = await import('../../../test/mainScreenMocks')
  return createThemeMock()
})

vi.mock('@/hooks/useGuardedRouter', () => ({
  useGuardedRouter: () => mockState.router,
}))

vi.mock('@/store/uiStore', () => ({
  useUIStore: (selector: (state: { isDarkMode: boolean }) => unknown) => selector({ isDarkMode: false }),
}))

const { fireEvent, render, screen } = await import('@testing-library/react-native')
const { default: HelpAboutScreen } = await import('../../../app/(main)/settings/about')

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

describe('HelpAboutScreen', () => {
  it('shows verified app identity, contacts, and official links', async () => {
    const view = render(<HelpAboutScreen />)

    expect(screen.getByText('Version 9.8.7')).toBeTruthy()
    expect(screen.getByText('Payment and Digital Assets Disclaimer')).toBeTruthy()
    expect(screen.getByText('MOZAGA FOUNDATION')).toBeTruthy()
    expect(screen.getByText('legal@spectraprotocol.org')).toBeTruthy()
    expect(screen.getByText('privacy@spectraprotocol.org')).toBeTruthy()
    expect(screen.getByText('Copyright (c) 2026 MOZAGA FOUNDATION.')).toBeTruthy()

    await fireEvent.press(getPressableByText(view.root, 'Visit Website'))
    expect(mockState.linking.openURL).toHaveBeenCalledWith('https://spectraprotocol.org')

    await fireEvent.press(getPressableByText(view.root, 'legal@spectraprotocol.org'))
    expect(mockState.linking.openURL).toHaveBeenCalledWith('mailto:legal@spectraprotocol.org')
  })
})
