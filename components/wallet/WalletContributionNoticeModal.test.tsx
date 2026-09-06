/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('lucide-react-native', async () => {
  const { createLucideIconMock } = await import('../../test/componentMocks')
  return createLucideIconMock(['HeartHandshake'])
})
vi.mock('@/lib/i18n', async () => {
  const { createI18nComponentMock } = await import('../../test/componentMocks')
  return createI18nComponentMock()
})
vi.mock('@/lib/theme', async () => {
  const { createThemeComponentMock } = await import('../../test/componentMocks')
  return createThemeComponentMock()
})
vi.mock('@/components/common/SpectraBackdrop', async () => {
  const ReactActual = await import('react')
  return {
    SpectraBackdrop: () => ReactActual.createElement('Text', null, 'backdrop'),
  }
})

const { act, fireEvent, render, screen } = await import('@testing-library/react-native')
const { WalletContributionNoticeModal } = await import('./WalletContributionNoticeModal')

describe('WalletContributionNoticeModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps the notice on screen until it is acknowledged', () => {
    const onAcknowledge = vi.fn()
    const view = render(
      <WalletContributionNoticeModal visible onAcknowledge={onAcknowledge} />,
    )

    expect(screen.getByText('Wallet contribution notice')).toBeTruthy()
    act(() => {
      view.root.findByType('Modal' as never).props.onRequestClose()
    })

    expect(onAcknowledge).not.toHaveBeenCalled()
    expect(screen.getByText('Wallet contribution notice')).toBeTruthy()
  })

  it('acknowledges from the understand button', async () => {
    const onAcknowledge = vi.fn(async () => undefined)
    const view = render(
      <WalletContributionNoticeModal visible onAcknowledge={onAcknowledge} />,
    )

    await fireEvent.press(view.root.findByProps({ accessibilityLabel: 'I understand' }))

    expect(onAcknowledge).toHaveBeenCalledTimes(1)
  })
})
