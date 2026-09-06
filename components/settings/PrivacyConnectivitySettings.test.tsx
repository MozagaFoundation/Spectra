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
  backend: {
    resetAuthCooldowns: vi.fn(),
    syncBundleServerAccessToken: vi.fn(),
  },
  bluetooth: {
    config: {
      enabled: false,
      relayEnabled: false,
      storeForwardEnabled: false,
    },
    setConfig: vi.fn(),
    setEnabled: vi.fn(async () => {}),
    status: 'idle',
    updateConfig: vi.fn(),
  },
  chat: {
    isInitializing: false,
    isSyncingMessages: false,
  },
  disableSpectreMode: vi.fn(async () => {}),
  haptics: {
    impactAsync: vi.fn(async () => {}),
    notificationAsync: vi.fn(async () => {}),
  },
  router: {
    push: vi.fn(),
  },
  spectre: {
    enabled: false,
    isApplying: false,
    isLoaded: true,
    spectreAccountMode: null as string | null,
    spectreWalletId: null as string | null,
    setBluetoothOverride: vi.fn(async () => {}),
  },
  tor: {
    enabled: false,
    errorMessage: null as string | null,
    setEnabled: vi.fn(async (enabled: boolean) => {
      mockState.tor.enabled = enabled
    }),
    start: vi.fn(async () => true),
    status: 'disconnected',
    stop: vi.fn(async () => {}),
  },
}))

vi.mock('react-native', async () => {
  const rn = await import('../../test/react-native')
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

vi.mock('@react-navigation/native', async () => {
  const ReactActual = await import('react')
  return {
    useFocusEffect: (callback: () => void | (() => void)) => {
      ReactActual.useEffect(() => callback(), [callback])
    },
  }
})

vi.mock('lucide-react-native', async () => {
  const { TestIcon } = await import('../../test/mainScreenMocks')
  return {
    AlertTriangle: TestIcon,
    Bluetooth: TestIcon,
    CheckCircle: TestIcon,
    ChevronDown: TestIcon,
    ChevronRight: TestIcon,
    ChevronUp: TestIcon,
    Globe: TestIcon,
    Radio: TestIcon,
    RefreshCw: TestIcon,
    Shield: TestIcon,
    Wifi: TestIcon,
    Zap: TestIcon,
  }
})

vi.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Error: 'error', Success: 'success' },
  impactAsync: mockState.haptics.impactAsync,
  notificationAsync: mockState.haptics.notificationAsync,
}))

vi.mock('@/components/common/TorStatusBadge', async () => {
  const { Pressable, Text } = await import('../../test/react-native')
  return {
    TorStatusBadge: ({ onPress }: { onPress?: () => void }) => (
      <Pressable onPress={onPress}>
        <Text>Tor status</Text>
      </Pressable>
    ),
  }
})

vi.mock('@/components/tor/TorConnectionModal', async () => {
  const { Text } = await import('../../test/react-native')
  return {
    TorConnectionModal: ({ visible }: { visible: boolean }) => (
      visible ? <Text testID="tor-connection-modal">Connecting</Text> : null
    ),
  }
})

vi.mock('@/components/ui', async () => {
  const { View } = await import('../../test/react-native')
  return {
    Card: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  }
})

vi.mock('@/hooks/useGuardedRouter', () => ({
  useGuardedRouter: () => mockState.router,
}))

vi.mock('@/lib/errorDisplay', () => ({
  getErrorDisplayMessage: () => 'Something went wrong. Please try again.',
}))

vi.mock('@/lib/i18n', () => ({
  translate: (key: string) => key,
}))

vi.mock('@/lib/theme', async () => {
  const { createThemeMock } = await import('../../test/mainScreenMocks')
  return createThemeMock()
})

vi.mock('@/services/backend/session', () => ({
  resetAuthCooldowns: mockState.backend.resetAuthCooldowns,
}))

vi.mock('@/services/bluetooth', () => ({
  updateConfig: mockState.bluetooth.updateConfig,
}))

vi.mock('@/services/quantumChat', () => ({
  syncBundleServerAccessToken: mockState.backend.syncBundleServerAccessToken,
}))

vi.mock('@/services/security/spectreMode', () => ({
  disableSpectreMode: mockState.disableSpectreMode,
  setSpectreBluetoothExitOverride: mockState.spectre.setBluetoothOverride,
}))

vi.mock('@/services/tor', () => {
  const useTorStore = Object.assign(
    (selector: (state: typeof mockState.tor) => unknown) => selector(mockState.tor),
    {
      getState: () => mockState.tor,
      setState: (partial: Partial<typeof mockState.tor>) => Object.assign(mockState.tor, partial),
    },
  )
  return {
    startTor: mockState.tor.start,
    stopTor: mockState.tor.stop,
    useTorStore,
  }
})

vi.mock('@/store', () => ({
  useChatStore: (selector: (state: typeof mockState.chat) => unknown) => selector(mockState.chat),
}))

vi.mock('@/store/spectreAccessStore', () => ({
  useSpectreAccessStore: (
    selector: (state: { access: null }) => unknown,
  ) => selector({ access: null }),
}))

vi.mock('@/store/bluetoothStore', () => ({
  useBluetoothStore: Object.assign(
    (selector: (state: typeof mockState.bluetooth) => unknown) =>
      selector(mockState.bluetooth),
    { getState: () => mockState.bluetooth },
  ),
}))

vi.mock('@/store/spectreStore', () => ({
  useSpectreStore: (
    selector: (state: typeof mockState.spectre) => unknown,
  ) => selector(mockState.spectre),
}))

const { act, fireEvent, render } = await import('@testing-library/react-native')
const { PrivacyConnectivitySettings } = await import('./PrivacyConnectivitySettings')
const openSpectreSetup = vi.fn()

function renderSettings() {
  return render(<PrivacyConnectivitySettings onOpenSpectreSetup={openSpectreSetup} />)
}

function nodeText(node: any): string {
  return (node.children || []).map((child: any) => (
    typeof child === 'string' ? child : nodeText(child)
  )).join('')
}

function switchForSetting(root: any, title: string) {
  const container = root.findAll((node: any) => (
    nodeText(node).includes(title)
    && node.findAll((child: any) => child.type === 'RCTSwitch').length > 0
  )).sort((a: any, b: any) => nodeText(a).length - nodeText(b).length)[0]
  const switchNode = container?.findAll((node: any) => node.type === 'RCTSwitch')[0]
  if (!switchNode) throw new Error(`Missing switch for ${title}`)
  return switchNode
}

function pressableByText(root: any, text: string) {
  const match = root.findAll((node: any) => (
    node.type === 'Pressable'
    && typeof node.props.onPress === 'function'
    && nodeText(node).includes(text)
  )).sort((a: any, b: any) => nodeText(a).length - nodeText(b).length)[0]
  if (!match) throw new Error(`Missing pressable ${text}`)
  return match
}

async function expandNetworkPrivacy(view: ReturnType<typeof renderSettings>) {
  await act(async () => {
    fireEvent.press(view.getByTestId('network-privacy-dropdown'))
  })
}

describe('PrivacyConnectivitySettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.alerts = []
    mockState.bluetooth.config.enabled = false
    mockState.bluetooth.config.relayEnabled = false
    mockState.bluetooth.config.storeForwardEnabled = false
    mockState.bluetooth.status = 'idle'
    mockState.chat.isInitializing = false
    mockState.chat.isSyncingMessages = false
    mockState.spectre.enabled = false
    mockState.spectre.isApplying = false
    mockState.spectre.isLoaded = true
    mockState.spectre.spectreAccountMode = null
    mockState.spectre.spectreWalletId = null
    mockState.tor.enabled = false
    mockState.tor.errorMessage = null
    mockState.tor.status = 'disconnected'
    mockState.tor.start.mockResolvedValue(true)
  })

  it('reveals Spectre and Tor controls from the Network Privacy dropdown', async () => {
    const view = renderSettings()
    await act(async () => {})

    expect(view.getByText('Network Privacy')).toBeTruthy()
    expect(view.getByTestId('network-privacy-dropdown').props.accessibilityState)
      .toEqual({ expanded: false })
    expect(() => view.getByText('Spectre Mode')).toThrow()
    expect(() => view.getByText('Offline Messaging')).toThrow()
    expect(view.getByText('Bluetooth Mesh Messaging')).toBeTruthy()

    await expandNetworkPrivacy(view)

    expect(view.getByText('Spectre Mode')).toBeTruthy()
    expect(view.getByText('Tor Connection')).toBeTruthy()
    expect(view.getByText('Tor Bridges')).toBeTruthy()
    expect(view.getByTestId('network-privacy-dropdown').props.accessibilityState)
      .toEqual({ expanded: true })

    await fireEvent.press(pressableByText(view.root, 'Tor Bridges'))
    expect(mockState.router.push).toHaveBeenCalledWith('/(main)/settings/tor-bridges')
  })

  it('does not expose raw Tor failures in the settings card', async () => {
    mockState.tor.errorMessage = 'upstream DNS request failed'
    const view = renderSettings()

    await expandNetworkPrivacy(view)

    expect(view.getByText('Something went wrong. Please try again.')).toBeTruthy()
    expect(() => view.getByText('upstream DNS request failed')).toThrow()
  })

  it('shows the Spectre disclaimer before opening focused setup', async () => {
    const view = renderSettings()
    await expandNetworkPrivacy(view)

    await act(async () => {
      switchForSetting(view.root, 'Spectre Mode').props.onValueChange(true)
    })

    expect(openSpectreSetup).not.toHaveBeenCalled()
    expect(mockState.alerts[0]).toEqual(expect.objectContaining({
      title: 'Enable Spectre Mode',
      message: expect.stringContaining('Spectre disables calls and crypto actions'),
    }))

    await act(async () => {
      await mockState.alerts[0].buttons?.[1].onPress?.()
    })

    expect(openSpectreSetup).toHaveBeenCalledTimes(1)
    expect(mockState.router.push).not.toHaveBeenCalledWith('/(main)/settings/spectre-setup')
    expect(mockState.disableSpectreMode).not.toHaveBeenCalled()
  })

  it('removes redundant Spectre description and activation blocks', async () => {
    const view = renderSettings()
    await expandNetworkPrivacy(view)
    const text = nodeText(view.root)
    const activationHeadings = view.root.findAll((node: any) => (
      nodeText(node) === 'Spectre activation'
    ))

    expect(activationHeadings).toHaveLength(0)
    expect(text).not.toContain('Spectre disables calls')
  })

  it('starts Tor only after the user confirms the trade-offs', async () => {
    const view = renderSettings()
    await expandNetworkPrivacy(view)

    await act(async () => {
      switchForSetting(view.root, 'Tor Connection').props.onValueChange(true)
    })
    expect(mockState.tor.start).not.toHaveBeenCalled()
    expect(mockState.alerts[0]?.message).toContain(
      'Tor routes supported Spectra network requests only',
    )
    expect(mockState.alerts[0]?.message).toContain(
      'up to one hour in the background before stopping',
    )
    expect(mockState.alerts[0]?.message).not.toContain('all app network traffic')

    await act(async () => {
      await mockState.alerts[0].buttons?.[1].onPress?.()
    })

    expect(mockState.tor.setEnabled).toHaveBeenCalledWith(true)
    expect(mockState.tor.start).toHaveBeenCalledWith()
    expect(mockState.backend.resetAuthCooldowns).toHaveBeenCalled()
    expect(mockState.backend.syncBundleServerAccessToken).toHaveBeenCalled()
    expect(view.queryByTestId('tor-connection-modal')).toBeNull()
  })

  it('updates Bluetooth mesh and subordinate relay settings', async () => {
    const view = renderSettings()

    await act(async () => {
      switchForSetting(view.root, 'Bluetooth Mesh Messaging').props.onValueChange(true)
    })
    expect(mockState.bluetooth.setEnabled).not.toHaveBeenCalled()

    await act(async () => {
      await mockState.alerts[0].buttons?.[1].onPress?.()
    })
    expect(mockState.bluetooth.setEnabled).toHaveBeenCalledWith(true)
    expect(mockState.bluetooth.updateConfig).toHaveBeenCalledWith({ enabled: true })

    mockState.bluetooth.config.enabled = true
    const enabledView = renderSettings()
    await act(async () => {
      switchForSetting(enabledView.root, 'Relay Messages').props.onValueChange(true)
      switchForSetting(enabledView.root, 'Store & Forward').props.onValueChange(true)
    })

    expect(mockState.bluetooth.setConfig).toHaveBeenCalledWith({ relayEnabled: true })
    expect(mockState.bluetooth.setConfig).toHaveBeenCalledWith({ storeForwardEnabled: true })
    expect(mockState.bluetooth.updateConfig).toHaveBeenCalledWith({ relayEnabled: true })
    expect(mockState.bluetooth.updateConfig).toHaveBeenCalledWith({ storeForwardEnabled: true })
  })

  it('records Bluetooth changes made during Spectre Mode as exit overrides', async () => {
    mockState.spectre.enabled = true
    const view = renderSettings()

    await act(async () => {
      switchForSetting(view.root, 'Bluetooth Mesh Messaging').props.onValueChange(true)
    })
    await act(async () => {
      await mockState.alerts[0].buttons?.[1].onPress?.()
    })

    expect(mockState.spectre.setBluetoothOverride).toHaveBeenCalledWith(true)
    expect(mockState.spectre.setBluetoothOverride.mock.invocationCallOrder[0]).toBeLessThan(
      mockState.bluetooth.setEnabled.mock.invocationCallOrder[0],
    )
  })

  it('does not change Bluetooth when the Spectre exit override cannot be saved', async () => {
    mockState.spectre.enabled = true
    mockState.spectre.setBluetoothOverride.mockRejectedValueOnce(
      new Error('Spectre Mode settings are transitioning'),
    )
    const view = renderSettings()

    await act(async () => {
      switchForSetting(view.root, 'Bluetooth Mesh Messaging').props.onValueChange(true)
    })
    await act(async () => {
      await mockState.alerts[0].buttons?.[1].onPress?.()
    })

    expect(mockState.bluetooth.setEnabled).not.toHaveBeenCalled()
    expect(mockState.alerts[1]?.title).toBe('Enable Bluetooth Mesh')
  })

  it('locks the Tor switch while Spectre protections are active', async () => {
    mockState.spectre.enabled = true
    const view = renderSettings()
    await expandNetworkPrivacy(view)

    expect(switchForSetting(view.root, 'Tor Connection').props.disabled).toBe(true)
  })

  it('allows setup of a new Spectre wallet immediately', async () => {
    const view = renderSettings()
    await expandNetworkPrivacy(view)

    expect(switchForSetting(view.root, 'Spectre Mode').props.disabled).toBe(false)
  })
})
