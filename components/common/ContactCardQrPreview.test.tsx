/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { createRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const qrProps = vi.hoisted(() => ({ latest: null as Record<string, unknown> | null }))

vi.mock('react-native', async () => {
  return await import('../../test/react-native')
})
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (value: string) => value }),
}))
vi.mock('react-native-view-shot', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}))
vi.mock('react-native-qrcode-svg', () => ({
  default: (props: Record<string, unknown>) => {
    qrProps.latest = props
    return null
  },
}))
vi.mock('@/lib/theme', async () => {
  const { createThemeMock } = await import('../../test/mainScreenMocks')
  return createThemeMock()
})
vi.mock('@/components/common/Avatar', async () => {
  const { TestAvatar } = await import('../../test/mainScreenMocks')
  return { Avatar: TestAvatar }
})
vi.mock('@/components/ui', async () => {
  const { TestCard } = await import('../../test/mainScreenMocks')
  return { Card: TestCard }
})

const { render } = await import('@testing-library/react-native')
const { ContactCardQrPreview } = await import('./ContactCardQrPreview')

describe('ContactCardQrPreview', () => {
  afterEach(() => {
    qrProps.latest = null
  })

  it('renders the contact-card QR with an opaque white background', () => {
    render(
      <ContactCardQrPreview
        invite="spectra:contact-card:v1:test"
        viewShotRef={createRef()}
      />,
    )

    expect(qrProps.latest).toEqual(expect.objectContaining({
      backgroundColor: '#ffffff',
      value: 'spectra:contact-card:v1:test',
    }))
  })
})
