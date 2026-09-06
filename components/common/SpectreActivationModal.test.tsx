/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  spectre: {
    activationFlow: 'enable' as 'enable' | 'disable' | null,
    activationPhase: 'prepare_account' as string | null,
    activationError: null as string | null,
    activationStartedAt: 1_000,
    activationFinishedAt: null as number | null,
  },
  tor: {
    status: 'connecting',
    errorMessage: null as string | null,
  },
}))

vi.mock('lucide-react-native', async () => {
  const { createLucideIconMock } = await import('../../test/componentMocks')
  return createLucideIconMock([
    'AlertTriangle',
    'CheckCircle',
    'Globe',
    'Lock',
    'RefreshCw',
    'Shield',
    'X',
  ])
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { resolvedLanguage: 'en' }, t: (key: string) => key }),
}))

vi.mock('@/lib/i18n', async () => {
  const { createI18nComponentMock } = await import('../../test/componentMocks')
  return createI18nComponentMock()
})

vi.mock('@/lib/errorDisplay', () => ({
  getErrorDisplayMessage: () => 'Something went wrong. Please try again.',
}))

vi.mock('@/lib/theme', async () => {
  const { createThemeComponentMock } = await import('../../test/componentMocks')
  return createThemeComponentMock()
})

vi.mock('@/services/tor', () => ({
  useTorStore: (selector: (state: typeof mockState.tor) => unknown) => selector(mockState.tor),
}))

vi.mock('@/store/spectreStore', () => ({
  useSpectreStore: (selector: (state: typeof mockState.spectre) => unknown) => selector(mockState.spectre),
}))

vi.mock('@/components/common/SpectraBackdrop', async () => {
  const ReactActual = await import('react')
  return {
    SpectraBackdrop: () => ReactActual.createElement('Text', null, 'backdrop'),
  }
})

const { act, fireEvent, render, screen } = await import('@testing-library/react-native')
const { Platform } = await import('react-native')
const { SpectreActivationModal } = await import('./SpectreActivationModal')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(3_000)
  mockState.spectre.activationFlow = 'enable'
  mockState.spectre.activationPhase = 'prepare_account'
  mockState.spectre.activationError = null
  mockState.spectre.activationStartedAt = 1_000
  mockState.spectre.activationFinishedAt = null
  mockState.tor.status = 'connecting'
  mockState.tor.errorMessage = null
  ;(Platform as { OS: string }).OS = 'ios'
})

afterEach(() => {
  vi.useRealTimers()
})

describe('SpectreActivationModal', () => {
  it('renders enable flow progress and blocks native dismissal while in flight', () => {
    const onClose = vi.fn()
    const view = render(<SpectreActivationModal visible onClose={onClose} />)

    expect(screen.getByText('Enabling Spectre Mode')).toBeTruthy()
    expect(screen.getByText('Preparing your Spectre setup')).toBeTruthy()
    expect(screen.getByText('Connecting to Tor')).toBeTruthy()
    expect(screen.getByText('2s elapsed')).toBeTruthy()

    act(() => {
      view.root.findByType('Modal' as any).props.onRequestClose()
    })

    expect(onClose).not.toHaveBeenCalled()
  })

  it('lets users cancel an in-flight enable flow', async () => {
    const onCancel = vi.fn(async () => {})
    const view = render(<SpectreActivationModal visible onClose={vi.fn()} onCancel={onCancel} />)

    expect(() => screen.getByText('Cancel Spectre Mode')).toThrow()
    await fireEvent.press(view.root.findByType('Pressable' as any))

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('renders disable flow steps', () => {
    mockState.spectre.activationFlow = 'disable'
    mockState.spectre.activationPhase = 'restore_settings'

    render(<SpectreActivationModal visible onClose={vi.fn()} />)

    expect(screen.getByText('Disabling Spectre Mode')).toBeTruthy()
    expect(screen.getByText('Restoring privacy protections')).toBeTruthy()
    expect(screen.getByText('Restoring network and cleanup')).toBeTruthy()
  })

  it('shows bridge configuration help only for Tor enable failures', async () => {
    mockState.spectre.activationPhase = 'enable_tor'
    mockState.spectre.activationError = 'Tor bootstrap failed'
    mockState.tor.status = 'error'
    mockState.tor.errorMessage = 'Bridge required'
    const onConfigureBridges = vi.fn()
    const view = render(
      <SpectreActivationModal
        visible
        onClose={vi.fn()}
        onConfigureBridges={onConfigureBridges}
      />,
    )

    expect(screen.getByText('Tor could not connect')).toBeTruthy()
    expect(screen.getAllByText('Something went wrong. Please try again.').length).toBeGreaterThan(0)
    expect(() => screen.getByText('Bridge required')).toThrow()

    await fireEvent.press(view.root.findAllByType('Pressable' as any)[1])
    expect(onConfigureBridges).toHaveBeenCalledTimes(1)
  })

  it('auto-closes after successful completion', () => {
    const onClose = vi.fn()
    mockState.spectre.activationPhase = 'completed'
    mockState.spectre.activationFinishedAt = 2_000

    render(<SpectreActivationModal visible onClose={onClose} />)

    expect(screen.getByText('Spectre is ready')).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(1_400)
    })

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('uses the Android compact scroll layout for rollback failures', () => {
    ;(Platform as { OS: string }).OS = 'android'
    mockState.spectre.activationPhase = 'rollback'
    mockState.spectre.activationError = 'rollback failed'

    const view = render(<SpectreActivationModal visible onClose={vi.fn()} />)

    expect(screen.getByText('Spectre setup failed')).toBeTruthy()
    expect(screen.getByText('Changes were rolled back')).toBeTruthy()
    expect(screen.getByText('EXO stopped the Spectre flow and restored the previous safe state where it could.')).toBeTruthy()
    expect(screen.getByText('Preparing your Spectre setup')).toBeTruthy()
    expect(screen.getByText('Connecting to Tor')).toBeTruthy()
    expect(screen.getByText('Applying Spectre protections')).toBeTruthy()
    expect(screen.getByText('Verifying private access')).toBeTruthy()
    expect(screen.getByText('Switching to your Spectre identity')).toBeTruthy()
    expect(screen.getByText('Preparing your private workspace')).toBeTruthy()
    expect(screen.getByText('Dismiss')).toBeTruthy()
    expect(view.root.findByType('RCTScrollView' as any)).toBeTruthy()
  })
})
