/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('lucide-react-native', async () => {
  const { TestChatIcon } = await import('../../test/chatComponentMocks')
  return { Clock: TestChatIcon }
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/lib/i18n', async () => {
  const { translateForChatTest } = await import('../../test/chatComponentMocks')
  return { translate: translateForChatTest }
})

vi.mock('@/lib/theme', async () => {
  const { chatTestColors } = await import('../../test/chatComponentMocks')
  return { useThemeColors: () => chatTestColors }
})

vi.mock('@/services/tor/torConstants', () => ({
  TOR_CHAT_POLL_INTERVAL_MS: 10_000,
}))

const { render } = await import('@testing-library/react-native')
const { TorDeliveryIndicator } = await import('./TorDeliveryIndicator')

describe('TorDeliveryIndicator', () => {
  it('renders local compact polling copy', () => {
    const view = render(<TorDeliveryIndicator compact />)

    expect(view.getByText('Tor polling every 10s')).toBeTruthy()
  })

  it('renders group polling copy', () => {
    const view = render(<TorDeliveryIndicator isGroupChat />)

    expect(view.getByText('Tor polling mode')).toBeTruthy()
    expect(view.getByText(/This chat checks for new group messages every 10s/)).toBeTruthy()
  })
})
