/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  haptics: {
    impactAsync: vi.fn(async () => undefined),
    selectionAsync: vi.fn(async () => undefined),
    ImpactFeedbackStyle: { Heavy: 'heavy', Medium: 'medium' },
  },
}))

vi.mock('react-native', async () => {
  const rn = await import('../../test/react-native')
  return {
    ...rn,
    Animated: {
      ...rn.Animated,
      loop: () => ({ start: vi.fn(), stop: vi.fn() }),
      sequence: () => ({}),
      timing: () => ({}),
    },
  }
})

vi.mock('expo-haptics', () => mockState.haptics)
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}))
vi.mock('react-native-webrtc', () => ({ RTCView: 'RTCView' }))

vi.mock('lucide-react-native', async () => {
  const { TestChatIcon } = await import('../../test/chatComponentMocks')
  return {
    ChevronLeft: TestChatIcon,
    Mic: TestChatIcon,
    MicOff: TestChatIcon,
    Phone: TestChatIcon,
    PhoneIncoming: TestChatIcon,
    PhoneOff: TestChatIcon,
    RotateCcw: TestChatIcon,
    Shield: TestChatIcon,
    Video: TestChatIcon,
    Volume2: TestChatIcon,
  }
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/components/common', async () => {
  const { TestChatAvatar } = await import('../../test/chatComponentMocks')
  return { Avatar: TestChatAvatar }
})

vi.mock('@/lib/i18n', async () => {
  const { translateForChatTest } = await import('../../test/chatComponentMocks')
  return { translate: translateForChatTest }
})

vi.mock('@/lib/theme', async () => {
  const { chatTestColors } = await import('../../test/chatComponentMocks')
  return { useThemeColors: () => chatTestColors }
})

vi.mock('../../lib/callMedia', () => ({
  hasLiveVideoTrack: () => false,
}))

const { fireEvent, render } = await import('@testing-library/react-native')
const { Platform } = await import('react-native')
const { CallScreen } = await import('./CallScreen')

function baseProps(overrides = {}) {
  return {
    visible: true,
    callType: 'voice' as const,
    callState: 'connected' as const,
    contactName: 'Alice',
    isOutgoing: true,
    durationMs: 65_000,
    onEndCall: vi.fn(),
    onToggleMute: vi.fn(),
    onToggleVideo: vi.fn(),
    onToggleSpeaker: vi.fn(),
    onSwitchCamera: vi.fn(),
    isMuted: false,
    isVideoEnabled: false,
    isSpeakerOn: false,
    ...overrides,
  }
}

describe('CallScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(Platform as { OS: string }).OS = 'ios'
  })

  it('renders active call state and routes active controls', async () => {
    const props = baseProps()
    const view = render(<CallScreen {...props} />)

    expect(view.getAllByText('Alice').length).toBeGreaterThan(0)
    expect(view.getByText('1:05')).toBeTruthy()

    await fireEvent.press(view.root.findByProps({ accessibilityLabel: 'Mute' }))
    await fireEvent.press(view.root.findByProps({ accessibilityLabel: 'Speaker' }))
    await fireEvent.press(view.root.findByProps({ accessibilityLabel: 'End' }))

    expect(props.onToggleMute).toHaveBeenCalled()
    expect(props.onToggleSpeaker).toHaveBeenCalled()
    expect(props.onEndCall).toHaveBeenCalled()
  })

  it('renders incoming ringing answer and decline controls', async () => {
    const onAnswerCall = vi.fn()
    const onDeclineCall = vi.fn()
    const view = render(
      <CallScreen
        {...baseProps({
          callState: 'ringing',
          isOutgoing: false,
          onAnswerCall,
          onDeclineCall,
        })}
      />,
    )

    expect(view.getByText('Incoming call')).toBeTruthy()

    await fireEvent.press(view.root.findByProps({ accessibilityLabel: 'Decline' }))
    await fireEvent.press(view.root.findByProps({ accessibilityLabel: 'Answer' }))

    expect(onDeclineCall).toHaveBeenCalled()
    expect(onAnswerCall).toHaveBeenCalled()
  })

  it('answers an incoming call even when haptics reject', async () => {
    mockState.haptics.impactAsync.mockRejectedValueOnce(new Error('haptics unavailable'))
    const onAnswerCall = vi.fn()
    const view = render(
      <CallScreen
        {...baseProps({
          callState: 'ringing',
          isOutgoing: false,
          onAnswerCall,
        })}
      />,
    )

    await fireEvent.press(view.root.findByProps({ accessibilityLabel: 'Answer' }))

    expect(onAnswerCall).toHaveBeenCalled()
  })

  it('minimizes from the top-left control and right swipe', async () => {
    const onMinimize = vi.fn()
    const view = render(
      <CallScreen
        {...baseProps({
          canMinimize: true,
          onMinimize,
        })}
      />,
    )

    await fireEvent.press(view.root.findByProps({ accessibilityLabel: 'Minimize call' }))
    expect(onMinimize).toHaveBeenCalledTimes(1)

    const gestureHost = view.root.find((node) => Boolean(
      node.props?.gestureConfig && typeof (node.props.gestureConfig as { onEnd?: unknown }).onEnd === 'function',
    ))
    const onEnd = gestureHost.props.gestureConfig.onEnd as (event: unknown) => void
    onEnd({ translationX: 130, translationY: 12, velocityX: 0, velocityY: 0 })
    await Promise.resolve()

    expect(onMinimize).toHaveBeenCalledTimes(2)
  })

  it('disables full-screen minimize swipe on Android', () => {
    ;(Platform as { OS: string }).OS = 'android'
    const view = render(
      <CallScreen
        {...baseProps({
          canMinimize: true,
          onMinimize: vi.fn(),
        })}
      />,
    )

    const gestureHost = view.root.find((node) => Boolean(node.props?.gestureConfig))

    expect(gestureHost.props.gestureConfig.enabled).toBe(false)
  })
})
