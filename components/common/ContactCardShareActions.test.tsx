/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  capture: vi.fn(async () => null),
  clipboard: vi.fn(async () => {}),
  haptics: vi.fn(async () => {}),
  shareImage: vi.fn(async () => {}),
  shareText: vi.fn(async () => {}),
}))

vi.mock('react-native', async () => {
  const native = await import('../../test/react-native')
  return {
    ...native,
    Share: { share: mocks.shareText },
  }
})
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (value: string) => value }),
}))
vi.mock('expo-clipboard', () => ({
  setStringAsync: mocks.clipboard,
}))
vi.mock('expo-haptics', () => ({
  NotificationFeedbackType: { Success: 'success' },
  notificationAsync: mocks.haptics,
}))
vi.mock('expo-sharing', () => ({
  shareAsync: mocks.shareImage,
}))
vi.mock('lucide-react-native', async () => {
  const { TestIcon } = await import('../../test/mainScreenMocks')
  return {
    Check: TestIcon,
    Copy: TestIcon,
    Share: TestIcon,
  }
})
vi.mock('@/components/ui', async () => {
  const { TestButton } = await import('../../test/mainScreenMocks')
  return { Button: TestButton }
})
vi.mock('@/lib/theme', async () => {
  const { createThemeMock } = await import('../../test/mainScreenMocks')
  return createThemeMock()
})

const { fireEvent, render, screen } = await import('@testing-library/react-native')
const { ContactCardShareActions } = await import('./ContactCardShareActions')

describe('ContactCardShareActions', () => {
  const invite = 'spectra://contact-card/test'
  const viewShotRef = {
    current: { capture: mocks.capture },
  } as any

  beforeEach(() => {
    mocks.capture.mockReset()
    mocks.capture.mockResolvedValue(null)
    mocks.clipboard.mockClear()
    mocks.haptics.mockClear()
    mocks.shareImage.mockClear()
    mocks.shareText.mockClear()
  })

  it('copies the invitation without persisting it', async () => {
    render(<ContactCardShareActions invite={invite} viewShotRef={viewShotRef} />)

    await fireEvent.press(screen.getByTestId('button-Copy'))

    expect(mocks.clipboard).toHaveBeenCalledWith(invite)
    expect(mocks.haptics).toHaveBeenCalledWith('success')
  })

  it('falls back to sharing the invitation when image capture is unavailable', async () => {
    render(<ContactCardShareActions invite={invite} viewShotRef={viewShotRef} />)

    await fireEvent.press(screen.getByTestId('button-Share'))

    expect(mocks.shareImage).not.toHaveBeenCalled()
    expect(mocks.shareText).toHaveBeenCalledWith({
      message: invite,
      title: 'Share My QR Code',
    })
  })

  it('shares the provided message instead of the raw QR payload', async () => {
    const shareMessage = "I'm on Spectra. Add me: https://spectraprotocol.org/u/EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    render(
      <ContactCardShareActions
        invite="https://spectraprotocol.org/u/EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        shareMessage={shareMessage}
        viewShotRef={viewShotRef}
      />,
    )

    await fireEvent.press(screen.getByTestId('button-Copy'))

    expect(mocks.clipboard).toHaveBeenCalledWith(shareMessage)
  })
})
