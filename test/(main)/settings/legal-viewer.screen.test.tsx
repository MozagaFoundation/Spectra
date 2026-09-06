/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  doc: 'terms' as string | undefined,
  router: { back: vi.fn() },
}))

vi.mock('react-native', async () => await import('../../../test/react-native'))

vi.mock('expo-router', async () => {
  const ReactActual = await import('react')
  const { Text } = await import('../../../test/react-native')
  return {
    Redirect: ({ href }: { href: string }) => ReactActual.createElement(Text, null, `redirect:${href}`),
    useLocalSearchParams: () => ({ doc: mockState.doc }),
    useRouter: () => mockState.router,
  }
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('react-native-safe-area-context', async () => {
  const { createSafeAreaMock } = await import('../../../test/mainScreenMocks')
  return createSafeAreaMock()
})

vi.mock('lucide-react-native', async () => {
  const { TestIcon } = await import('../../../test/mainScreenMocks')
  return { ChevronLeft: TestIcon }
})

vi.mock('@/lib/theme', async () => {
  const { createThemeMock } = await import('../../../test/mainScreenMocks')
  return createThemeMock()
})

vi.mock('@/lib/i18n', () => ({
  translate: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
}))

const { render, screen } = await import('@testing-library/react-native')
const { default: LegalViewerScreen } = await import('../../../app/(main)/settings/legal-viewer')

describe('LegalViewerScreen', () => {
  beforeEach(() => {
    mockState.doc = 'terms'
  })

  it('renders bundled legal content for an allowed doc param', () => {
    render(<LegalViewerScreen />)

    expect(screen.getAllByText(/Terms/i).length).toBeGreaterThan(0)
  })

  it('redirects unknown docs instead of rendering route-controlled content', () => {
    mockState.doc = 'unknown'

    render(<LegalViewerScreen />)

    expect(screen.getByText('redirect:/(main)/(tabs)/settings')).toBeTruthy()
  })
})
