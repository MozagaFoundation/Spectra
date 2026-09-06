/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  alerts: [] as Array<{
    title: string
    message?: string
    buttons?: Array<{ text: string; onPress?: () => void | Promise<void> }>
  }>,
  applyBridgeConfiguration: vi.fn(),
  reconcileQuantumChat: vi.fn(async () => {}),
  resetAuthCooldowns: vi.fn(),
  syncBundleServerAccessToken: vi.fn(),
  tor: {
    bridges: ['obfs4 192.0.2.1:443 cert=old iat-mode=0'],
    bridgeType: 'obfs4',
    enabled: true,
    status: 'connected',
  },
}))

vi.mock('react-native', async () => {
  const rn = await import('../../../test/react-native')
  return {
    ...rn,
    Alert: {
      alert: (
        title: string,
        message?: string,
        buttons?: Array<{ text: string; onPress?: () => void | Promise<void> }>,
      ) => {
        mockState.alerts.push({ title, message, buttons })
      },
    },
  }
})

vi.mock('expo-router', () => ({
  useRouter: () => ({ back: vi.fn() }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}))

vi.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Error: 'error', Success: 'success' },
  impactAsync: vi.fn(async () => {}),
  notificationAsync: vi.fn(async () => {}),
}))

vi.mock('lucide-react-native', async () => {
  const { TestIcon } = await import('../../../test/mainScreenMocks')
  return {
    AlertTriangle: TestIcon,
    CheckCircle: TestIcon,
    ChevronLeft: TestIcon,
    Download: TestIcon,
    Globe: TestIcon,
    Info: TestIcon,
    Lock: TestIcon,
    Trash2: TestIcon,
  }
})

vi.mock('@/components/ui', async () => {
  const { View } = await import('../../../test/react-native')
  return {
    Card: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  }
})

vi.mock('@/lib/i18n', () => ({
  translate: (key: string) => key,
}))

vi.mock('@/lib/theme', async () => {
  const { createThemeMock } = await import('../../../test/mainScreenMocks')
  return createThemeMock()
})

vi.mock('@/lib/errorDisplay', () => ({
  getErrorDisplayMessage: (error: unknown) => error instanceof Error ? error.message : String(error),
}))

vi.mock('@/services/backend/session', () => ({
  resetAuthCooldowns: mockState.resetAuthCooldowns,
}))

vi.mock('@/services/quantumChat', () => ({
  reconcileQuantumChat: mockState.reconcileQuantumChat,
  syncBundleServerAccessToken: mockState.syncBundleServerAccessToken,
}))

vi.mock('@/services/tor', () => ({
  applyTorBridgeConfiguration: mockState.applyBridgeConfiguration,
  fetchBridgesFromMoat: vi.fn(),
  isIPtProxyAvailable: () => false,
  useTorStore: (selector: (state: typeof mockState.tor) => unknown) => selector(mockState.tor),
}))

const { act, fireEvent, render } = await import('@testing-library/react-native')
const { default: TorBridgesScreen } = await import('../../../app/(main)/settings/tor-bridges')

function nodeText(node: any): string {
  return (node.children || []).map((child: any) => (
    typeof child === 'string' ? child : nodeText(child)
  )).join('')
}

function pressableByText(root: any, text: string) {
  const match = root.findAll((node: any) => (
    node.type === 'Pressable'
    && typeof node.props.onPress === 'function'
    && nodeText(node).includes(text)
  ))[0]
  if (!match) throw new Error(`Missing pressable ${text}`)
  return match
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((finish) => {
    resolve = finish
  })
  return { promise, resolve }
}

describe('TorBridgesScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.alerts = []
    mockState.tor.bridges = ['obfs4 192.0.2.1:443 cert=old iat-mode=0']
    mockState.tor.bridgeType = 'obfs4'
    mockState.tor.enabled = true
    mockState.tor.status = 'connected'
  })

  it('shows direct-Tor progress and resyncs backend state after a verified clear', async () => {
    const deferred = createDeferred<{
      outcome: 'applied'
      success: true
      routeReady: true
    }>()
    mockState.applyBridgeConfiguration.mockReturnValueOnce(deferred.promise)
    const view = render(<TorBridgesScreen />)

    await fireEvent.press(pressableByText(view.root, 'Clear All Bridges'))
    const clearAction = mockState.alerts[0].buttons?.find((button) => button.text === 'Clear')
    let actionPromise: Promise<void> | undefined
    act(() => {
      actionPromise = clearAction?.onPress?.() as Promise<void>
    })
    await act(async () => {})

    expect(view.getByText('Applying direct Tor…')).toBeTruthy()
    expect(mockState.applyBridgeConfiguration).toHaveBeenCalledWith([], 'none')

    deferred.resolve({ outcome: 'applied', success: true, routeReady: true })
    await act(async () => {
      await actionPromise
    })

    expect(mockState.resetAuthCooldowns).toHaveBeenCalled()
    expect(mockState.syncBundleServerAccessToken).toHaveBeenCalled()
    expect(mockState.reconcileQuantumChat).toHaveBeenCalledWith({
      fullResync: true,
      restartRealtime: true,
      reason: 'manual_recovery',
      suppressLocalNotifications: true,
    })
    expect(mockState.alerts.some((alert) => alert.title === 'Direct Tor Active')).toBe(true)
  })

  it('reports rollback while resyncing through the restored Tor route', async () => {
    mockState.applyBridgeConfiguration.mockResolvedValueOnce({
      outcome: 'restored',
      success: false,
      routeReady: true,
      error: 'direct route blocked',
    })
    const view = render(<TorBridgesScreen />)

    await fireEvent.press(pressableByText(view.root, 'Clear All Bridges'))
    const clearAction = mockState.alerts[0].buttons?.find((button) => button.text === 'Clear')
    await act(async () => {
      await clearAction?.onPress?.()
    })

    expect(mockState.reconcileQuantumChat).toHaveBeenCalled()
    expect(mockState.alerts.some((alert) => alert.title === 'Previous Bridges Restored')).toBe(true)
    expect(mockState.alerts.some((alert) => alert.title === 'Direct Tor Active')).toBe(false)
  })
})
