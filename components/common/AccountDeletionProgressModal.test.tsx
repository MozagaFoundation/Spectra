/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  resume: vi.fn(async () => {}),
}))

vi.mock('lucide-react-native', async () => {
  const { createLucideIconMock } = await import('../../test/componentMocks')
  return createLucideIconMock([
    'AlertTriangle',
    'CheckCircle',
    'Cloud',
    'Database',
    'HardDrive',
    'KeyRound',
    'RadioTower',
    'ShieldCheck',
    'Trash2',
    'X',
  ])
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
vi.mock('@/services/accountLifecycle/permanentAccountDeletion', () => ({
  resumePendingAccountDeletion: mocks.resume,
}))

const { act, fireEvent, render, screen } = await import('@testing-library/react-native')
const { useAccountDeletionStore } = await import('@/store/accountDeletionStore')
const { AccountDeletionProgressModal } = await import('./AccountDeletionProgressModal')

describe('AccountDeletionProgressModal', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.resume.mockClear()
    useAccountDeletionStore.getState().reset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows real stages and blocks dismissal while deletion is active', () => {
    useAccountDeletionStore.getState().start()
    const view = render(<AccountDeletionProgressModal />)

    expect(screen.getByText('Preparing secure deletion')).toBeTruthy()
    expect(screen.getByText('Deleting chat relay data')).toBeTruthy()
    expect(screen.getByText('Secure deletion in progress')).toBeTruthy()

    act(() => {
      view.root.findByType('Modal' as any).props.onRequestClose()
    })

    expect(useAccountDeletionStore.getState().visible).toBe(true)
  })

  it('offers retry only for recoverable status failures', async () => {
    useAccountDeletionStore.getState().start()
    useAccountDeletionStore.getState().advance('relay')
    useAccountDeletionStore.getState().fail('Private connection unavailable')
    const view = render(<AccountDeletionProgressModal />)

    await fireEvent.press(view.root.findAllByType('Pressable' as any)[1])

    expect(mocks.resume).toHaveBeenCalledTimes(1)
  })

  it('hides retry for terminal local failures', () => {
    useAccountDeletionStore.getState().start()
    useAccountDeletionStore.getState().fail('Local erasure was not confirmed', false)
    render(<AccountDeletionProgressModal />)

    expect(() => screen.getByText('Retry cleanup')).toThrow()
    expect(screen.getByText('Local erasure was not confirmed')).toBeTruthy()
  })

  it('auto-dismisses after confirmed completion', () => {
    useAccountDeletionStore.getState().start()
    useAccountDeletionStore.getState().advance('completed')
    render(<AccountDeletionProgressModal />)

    act(() => {
      vi.advanceTimersByTime(1_400)
    })

    expect(useAccountDeletionStore.getState().visible).toBe(false)
  })
})
