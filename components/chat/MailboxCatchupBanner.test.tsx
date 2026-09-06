/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('lucide-react-native', async () => {
  const { createLucideIconMock } = await import('../../test/componentMocks')
  return createLucideIconMock(['CheckCircle2'])
})
vi.mock('react-native-safe-area-context', async () => {
  const { createSafeAreaMock } = await import('../../test/mainScreenMocks')
  return createSafeAreaMock()
})
vi.mock('@/lib/i18n', async () => {
  const { createI18nComponentMock } = await import('../../test/componentMocks')
  return createI18nComponentMock()
})
vi.mock('@/lib/theme', async () => {
  const { createThemeComponentMock } = await import('../../test/componentMocks')
  return createThemeComponentMock()
})

const { act, cleanup, render, screen } = await import('@testing-library/react-native')
const { useMailboxCatchupBannerStore } = await import('@/store/mailboxCatchupBannerStore')
const { MailboxCatchupBanner } = await import('./MailboxCatchupBanner')

describe('MailboxCatchupBanner', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useMailboxCatchupBannerStore.getState().reset()
  })

  afterEach(() => {
    cleanup()
    useMailboxCatchupBannerStore.getState().reset()
    vi.useRealTimers()
  })

  it('renders nothing when no catch-up session is active', () => {
    render(<MailboxCatchupBanner />)

    expect(screen.getAllByText('Checking for new messages')).toHaveLength(0)
  })

  it('shows stage copy for mailbox catch-up', () => {
    render(<MailboxCatchupBanner />)

    act(() => {
      useMailboxCatchupBannerStore.getState().begin()
      useMailboxCatchupBannerStore.getState().advance('checking_mailbox')
    })

    expect(screen.getByText('Checking for new messages')).toBeTruthy()
    expect(screen.getByText('Checking the mailbox')).toBeTruthy()
  })

  it('shows decrypting copy after sealed rows exist', () => {
    render(<MailboxCatchupBanner />)

    act(() => {
      useMailboxCatchupBannerStore.getState().begin()
      useMailboxCatchupBannerStore.getState().advance('decrypting')
    })

    expect(screen.getByText('Decrypting messages')).toBeTruthy()
  })

  it('hides immediately when a visible message arrives', () => {
    render(<MailboxCatchupBanner />)

    act(() => {
      useMailboxCatchupBannerStore.getState().begin()
      useMailboxCatchupBannerStore.getState().advance('decrypting')
      useMailboxCatchupBannerStore.getState().complete('messages')
    })

    expect(screen.getAllByText('Checking for new messages')).toHaveLength(0)
  })

  it('auto-dismisses the empty-mailbox confirmation', () => {
    render(<MailboxCatchupBanner />)

    act(() => {
      useMailboxCatchupBannerStore.getState().begin()
      useMailboxCatchupBannerStore.getState().complete('empty')
    })

    expect(screen.getByText('You\'re up to date')).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(800)
    })

    expect(useMailboxCatchupBannerStore.getState().phase).toBeNull()
    expect(screen.getAllByText('Checking for new messages')).toHaveLength(0)
  })
})
