/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  openExternalUrl: vi.fn(async () => true),
  refreshAppUpdatePolicy: vi.fn(async () => null),
}))

vi.mock('lucide-react-native', async () => {
  const { createLucideIconMock } = await import('../../test/componentMocks')
  return createLucideIconMock(['Download', 'RefreshCw', 'ShieldAlert'])
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
vi.mock('@/services/backend/appUpdatePolicy', () => ({
  refreshAppUpdatePolicy: mocks.refreshAppUpdatePolicy,
}))
vi.mock('@/services/tor/externalLinkPolicy', () => ({
  openExternalUrl: mocks.openExternalUrl,
}))

const { act, fireEvent, render, screen } = await import('@testing-library/react-native')
const { useAppUpdateStore } = await import('@/store/appUpdateStore')
const { AppUpdateGate } = await import('./AppUpdateGate')

const policy = {
  platform: 'ios' as const,
  minimumSupportedVersion: '1.2.1',
  latestVersion: '1.4.0',
  storeUrl: 'https://apps.apple.com/us/app/spectra/id1234567890',
  updateAvailable: true,
  updateRequired: false,
}

describe('AppUpdateGate', () => {
  beforeEach(() => {
    mocks.openExternalUrl.mockClear()
    mocks.refreshAppUpdatePolicy.mockClear()
    useAppUpdateStore.getState().setPolicy(null)
  })

  it('keeps required updates on screen until policy changes', () => {
    useAppUpdateStore.getState().setPolicy({ ...policy, updateRequired: true })
    const view = render(<AppUpdateGate />)

    expect(screen.getByText('Update required')).toBeTruthy()
    act(() => {
      view.root.findByType('Modal' as any).props.onRequestClose()
    })

    expect(screen.getByText('Update required')).toBeTruthy()
  })

  it('opens the configured store update URL', async () => {
    useAppUpdateStore.getState().setPolicy(policy)
    const view = render(<AppUpdateGate />)

    await fireEvent.press(view.root.findByProps({ accessibilityLabel: 'Update Spectra' }))

    expect(mocks.openExternalUrl).toHaveBeenCalledWith(policy.storeUrl)
  })

  it('allows an optional update to be dismissed for its advertised version', async () => {
    useAppUpdateStore.getState().setPolicy(policy)
    const view = render(<AppUpdateGate />)

    await fireEvent.press(view.root.findByProps({ accessibilityLabel: 'Later' }))

    expect(useAppUpdateStore.getState().dismissedLatestVersion).toBe('1.4.0')
  })
})
