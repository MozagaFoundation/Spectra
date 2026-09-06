/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import type { ReactTestInstance } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render } from '@testing-library/react-native'

import { TorConnectionModal } from './TorConnectionModal'
import { TorReconnectGate } from './TorReconnectGate'
import { TorStatusBanner } from './TorStatusBanner'
import { shouldShowTorReconnectGate } from './torPresenceState'

const mockState = vi.hoisted(() => ({
  tor: {
    enabled: true,
    errorMessage: null as string | null,
    exitCountry: null as string | null,
    lastHealthError: null as string | null,
    status: 'connecting' as 'disconnected' | 'connecting' | 'connected' | 'error',
  },
  spectre: {
    enabled: false,
  },
}))

function useTorStoreMock<T>(selector: (state: typeof mockState.tor) => T): T {
  return selector(mockState.tor)
}

vi.mock('@/services/tor', () => ({
  useTorStore: useTorStoreMock,
}))

vi.mock('@/services/tor/torStore', () => ({
  useTorStore: useTorStoreMock,
}))

vi.mock('@/store/spectreStore', () => ({
  useSpectreStore: (selector: (state: typeof mockState.spectre) => unknown) => selector(mockState.spectre),
}))

vi.mock('lucide-react-native', async () => {
  const { TestIcon } = await import('../../test/mainScreenMocks')
  return {
    AlertTriangle: TestIcon,
    CheckCircle: TestIcon,
    CheckCircle2: TestIcon,
    ChevronRight: TestIcon,
    Globe: TestIcon,
    Lock: TestIcon,
    RefreshCw: TestIcon,
    Shield: TestIcon,
    Wifi: TestIcon,
    X: TestIcon,
    XCircle: TestIcon,
  }
})

vi.mock('react-native-safe-area-context', async () => {
  const { createSafeAreaMock } = await import('../../test/mainScreenMocks')
  return createSafeAreaMock()
})

vi.mock('@/components/common/SpectraBackdrop', () => ({
  SpectraBackdrop: () => null,
}))

vi.mock('@/lib/i18n', () => ({
  translate: (key: string, values?: Record<string, unknown>) => {
    if (typeof values?.country === 'string') {
      return key.replace('{{country}}', values.country)
    }
    if (typeof values?.count !== 'undefined') {
      return key.replace('{{count}}', String(values.count))
    }
    return key
  },
}))
vi.mock('@/lib/errorDisplay', () => ({
  getErrorDisplayMessage: () => 'Something went wrong. Please try again.',
}))

vi.mock('@/lib/theme', async () => {
  const { createThemeMock } = await import('../../test/mainScreenMocks')
  return createThemeMock()
})

function textContent(node: ReactTestInstance): string {
  return node.children.map((child) => (
    typeof child === 'string' ? child : textContent(child)
  )).join('')
}

function findHost(root: ReactTestInstance, type: string): ReactTestInstance[] {
  return root.findAll((node) => node.type === type)
}

function findPressableByText(root: ReactTestInstance, text: string): ReactTestInstance {
  return findHost(root, 'Pressable')
    .find((node) => node.findAll((child) => textContent(child) === text).length > 0)!
}

describe('tor components', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.tor.enabled = true
    mockState.tor.errorMessage = null
    mockState.tor.exitCountry = null
    mockState.tor.lastHealthError = null
    mockState.tor.status = 'connecting'
    mockState.spectre.enabled = false
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('TorStatusBanner', () => {
    it('renders only when Tor is enabled and respects disabled disconnects', async () => {
      const onDisconnect = vi.fn()
      mockState.tor.enabled = false
      const hidden = render(<TorStatusBanner onDisconnect={onDisconnect} />)

      expect(findHost(hidden.root, 'Text')).toHaveLength(0)

      mockState.tor.enabled = true
      mockState.tor.status = 'connected'
      mockState.tor.exitCountry = 'Germany'
      const visible = render(<TorStatusBanner disconnecting onDisconnect={onDisconnect} />)

      expect(findHost(visible.root, 'Text').map(textContent)).toContain('Connected to Tor')
      expect(findHost(visible.root, 'Text').map(textContent)).toContain('Exit node: Germany')

      await fireEvent.press(findHost(visible.root, 'Pressable')[0])
      expect(onDisconnect).not.toHaveBeenCalled()

      visible.update(<TorStatusBanner onDisconnect={onDisconnect} />)
      await fireEvent.press(findHost(visible.root, 'Pressable')[0])
      expect(onDisconnect).toHaveBeenCalledTimes(1)
    })

    it('uses Spectre copy while Spectre Mode is active', () => {
      mockState.spectre.enabled = true
      mockState.tor.status = 'connected'

      const visible = render(<TorStatusBanner onDisconnect={vi.fn()} />)

      expect(findHost(visible.root, 'Text').map(textContent)).toContain('Connected to Spectre')
    })
  })

  describe('TorReconnectGate', () => {
    it('only gates actionable error recovery, not routine connecting', () => {
      expect(shouldShowTorReconnectGate({
        enabled: true,
        presenceGateReason: 'startup',
        status: 'connecting',
      })).toBe(false)
      expect(shouldShowTorReconnectGate({
        enabled: true,
        presenceGateReason: 'foreground_resume',
        status: 'error',
      })).toBe(true)
    })

    it('returns null when hidden and exposes guarded recovery actions on error', async () => {
      const onRetry = vi.fn()
      const onConfigureBridges = vi.fn()
      const onDisconnectTor = vi.fn()
      const onDismissError = vi.fn()
      const hidden = render(<TorReconnectGate visible={false} />)

      expect(findHost(hidden.root, 'Text')).toHaveLength(0)

      mockState.tor.status = 'error'
      mockState.tor.errorMessage = 'Circuit failed'
      mockState.tor.exitCountry = 'France'
      const visible = render(
        <TorReconnectGate
          onConfigureBridges={onConfigureBridges}
          onDismissError={onDismissError}
          onDisconnectTor={onDisconnectTor}
          onRetry={onRetry}
          visible
        />,
      )

      expect(findHost(visible.root, 'Text').map(textContent))
        .toContain('Something went wrong. Please try again.')
      expect(findHost(visible.root, 'Text').map(textContent)).not.toContain('Circuit failed')
      expect(findHost(visible.root, 'Text').map(textContent)).toContain('Last verified exit: France')

      await fireEvent.press(findPressableByText(visible.root, 'Retry Tor connection'))
      await fireEvent.press(findPressableByText(visible.root, 'Configure bridges'))
      await fireEvent.press(findPressableByText(visible.root, 'Disconnect from Tor'))
      await fireEvent.press(findPressableByText(visible.root, 'Continue to app'))

      expect(onRetry).toHaveBeenCalledTimes(1)
      expect(onConfigureBridges).toHaveBeenCalledTimes(1)
      expect(onDisconnectTor).toHaveBeenCalledTimes(1)
      expect(onDismissError).toHaveBeenCalledTimes(1)
    })

    it('disables error actions while disconnecting', async () => {
      const onRetry = vi.fn()
      mockState.tor.status = 'error'
      const view = render(<TorReconnectGate disconnecting onRetry={onRetry} visible />)

      await fireEvent.press(findPressableByText(view.root, 'Retry Tor connection'))

      expect(onRetry).not.toHaveBeenCalled()
    })
  })

  describe('TorConnectionModal', () => {
    it('shows connecting progress and auto-closes after Tor connects', async () => {
      vi.useFakeTimers()
      const onClose = vi.fn()
      mockState.tor.status = 'connected'
      const view = render(<TorConnectionModal onClose={onClose} visible />)

      expect(findHost(view.root, 'Text').map(textContent)).toContain('Connected to Tor')

      await act(async () => {
        vi.advanceTimersByTime(1500)
      })

      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('closes before routing to bridge configuration from the error state', async () => {
      const order: string[] = []
      mockState.tor.status = 'error'
      mockState.tor.errorMessage = 'Bootstrap failed'
      const view = render(
        <TorConnectionModal
          onClose={() => order.push('close')}
          onConfigureBridges={() => order.push('bridges')}
          visible
        />,
      )

      expect(findHost(view.root, 'Text').map(textContent))
        .toContain('Something went wrong. Please try again.')
      expect(findHost(view.root, 'Text').map(textContent)).not.toContain('Bootstrap failed')

      await fireEvent.press(findPressableByText(view.root, 'Configure Bridges'))

      expect(order).toEqual(['close', 'bridges'])
    })
  })
})
