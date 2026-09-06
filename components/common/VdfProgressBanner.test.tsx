/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('lucide-react-native', async () => {
  const { createLucideIconMock } = await import('../../test/componentMocks')
  return createLucideIconMock(['AlertTriangle', 'CheckCircle2'])
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
const { beginVdfActivity } = await import('@/services/shared/vdfActivity')
const { useVdfActivityStore } = await import('@/store/vdfActivityStore')
const { useVdfBannerPreferenceStore } = await import('@/store/vdfBannerPreferenceStore')
const { VdfProgressBanner } = await import('./VdfProgressBanner')

describe('VdfProgressBanner', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-01T16:00:00.000Z'))
    useVdfActivityStore.getState().reset()
    useVdfBannerPreferenceStore.setState({ visible: true, hydrated: true })
  })

  afterEach(() => {
    cleanup()
    useVdfActivityStore.getState().reset()
    useVdfBannerPreferenceStore.setState({ visible: false, hydrated: false })
    vi.useRealTimers()
  })

  it('keeps the banner visible while 7-day discovery rent is grinding', () => {
    act(() => {
      const activity = beginVdfActivity({ action: 'extend_public_discovery' })
      activity.setStep({ completed: 6, total: 7 })
      vi.advanceTimersByTime(250)
      activity.progress({
        phase: 'evaluate',
        completedIterations: 50,
        totalIterations: 200,
      })
    })

    render(<VdfProgressBanner />)

    expect(screen.getByText('Keeping you findable')).toBeTruthy()
    expect(screen.getByText('VDFs completed 6/7 · 25% complete · ~1s remaining')).toBeTruthy()
    expect(useVdfActivityStore.getState().activity).not.toBeNull()
  })

  it('shows compact progress without a blocking modal while wallet admission is active', () => {
    let activity!: ReturnType<typeof beginVdfActivity>
    act(() => {
      activity = beginVdfActivity({ action: 'wallet_admission' })
      vi.advanceTimersByTime(250)
      activity.progress({
        phase: 'evaluate',
        completedIterations: 100,
        totalIterations: 400,
      })
    })

    const view = render(<VdfProgressBanner />)

    expect(screen.getByText('Activating secure online access')).toBeTruthy()
    expect(screen.getByText('25% complete · ~1s remaining')).toBeTruthy()
    expect(view.root.findAllByType('Modal' as any)).toHaveLength(0)
    expect(useVdfActivityStore.getState().activity).not.toBeNull()
  })

  it('uses the registered cancellation handler for a share action', async () => {
    const cancel = vi.fn()
    const view = render(<VdfProgressBanner />)
    let activity!: ReturnType<typeof beginVdfActivity>
    act(() => {
      activity = beginVdfActivity({
        action: 'contact_card',
        cancel,
        canCancel: true,
      })
    })

    await act(async () => {
      view.root.findByProps({ accessibilityLabel: 'Cancel secure work' }).props.onPress()
    })

    expect(cancel).toHaveBeenCalledTimes(1)
    expect(useVdfActivityStore.getState().activity?.isCancelling).toBe(true)

    act(() => {
      activity.cancel()
    })
  })

  it('automatically closes after successful verification', () => {
    let activity!: ReturnType<typeof beginVdfActivity>
    render(<VdfProgressBanner />)

    act(() => {
      activity = beginVdfActivity({ action: 'wallet_admission' })
    })
    act(() => {
      activity.complete()
    })
    act(() => {
      vi.advanceTimersByTime(1_200)
    })

    expect(useVdfActivityStore.getState().activity).toBeNull()
  })

  it('distinguishes an unavailable native solver from a retryable proof failure', () => {
    let activity!: ReturnType<typeof beginVdfActivity>
    render(<VdfProgressBanner />)

    act(() => {
      activity = beginVdfActivity({ action: 'wallet_admission' })
      activity.fail('native_unavailable')
    })

    expect(screen.getByText('Native Rebuild Required')).toBeTruthy()
    expect(useVdfActivityStore.getState().activity?.failure).toBe('native_unavailable')
  })

  it('explains when verified deletion cleanup is still active', () => {
    let activity!: ReturnType<typeof beginVdfActivity>
    render(<VdfProgressBanner />)

    act(() => {
      activity = beginVdfActivity({ action: 'wallet_admission' })
      activity.fail('deletion_cleanup_pending')
    })

    expect(screen.getByText('Account deletion needs attention')).toBeTruthy()
    expect(
      screen.getByText('Backend cleanup is still running. You can retry this status check safely.'),
    ).toBeTruthy()
  })

  it('auto-clears a generic proof failure after a short delay', () => {
    let activity!: ReturnType<typeof beginVdfActivity>
    render(<VdfProgressBanner />)

    act(() => {
      activity = beginVdfActivity({ action: 'wallet_admission' })
      activity.fail()
    })

    expect(screen.getByText('Secure access needs attention')).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(800)
    })

    expect(useVdfActivityStore.getState().activity).toBeNull()
  })

  it('keeps a native solver failure until it is dismissed', () => {
    let activity!: ReturnType<typeof beginVdfActivity>
    render(<VdfProgressBanner />)

    act(() => {
      activity = beginVdfActivity({ action: 'wallet_admission' })
      activity.fail('native_unavailable')
    })

    act(() => {
      vi.advanceTimersByTime(800)
    })

    expect(useVdfActivityStore.getState().activity?.failure).toBe('native_unavailable')

    act(() => {
      screen.getByTestId('vdf-banner-dismiss').props.onPress()
    })

    expect(useVdfActivityStore.getState().activity).toBeNull()
  })

  it('does not describe a first-contact failure as a secure-access problem', () => {
    let activity!: ReturnType<typeof beginVdfActivity>
    render(<VdfProgressBanner />)

    act(() => {
      activity = beginVdfActivity({ action: 'claim_session_opk' })
      activity.fail()
    })

    expect(screen.getByText('Could not start this chat')).toBeTruthy()
    expect(screen.getAllByText('Secure access needs attention')).toHaveLength(0)
  })

  it('hides the banner when the preference is off while leftover failures still auto-clear', () => {
    useVdfBannerPreferenceStore.setState({ visible: false, hydrated: true })
    let activity!: ReturnType<typeof beginVdfActivity>
    render(<VdfProgressBanner />)

    act(() => {
      activity = beginVdfActivity({ action: 'claim_session_opk' })
      activity.fail()
    })

    expect(screen.getAllByText('Could not start this chat')).toHaveLength(0)
    expect(useVdfActivityStore.getState().activity).not.toBeNull()

    act(() => {
      vi.advanceTimersByTime(800)
    })

    expect(useVdfActivityStore.getState().activity).toBeNull()
  })
})
