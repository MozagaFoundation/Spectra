/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  enter: vi.fn(async () => ({
    room: {
      id: 'ago1.avisos.1',
      topicId: 'avisos',
      instanceIndex: 1,
      title: 'Avisos',
      topicTitle: 'Avisos',
      topicLine: 'notices',
      icon: 'landmark',
      canonical: true,
      readOnly: true,
      occupancy: 1,
      maxOccupancy: 0,
      full: false,
      closingAt: null,
    },
  })),
  listMessages: vi.fn(async () => ({ messages: [], whispers: [] })),
  heartbeat: vi.fn(async () => ({ ok: true, roomId: 'ago1.avisos.1' })),
  router: { replace: vi.fn(), push: vi.fn() },
}))

vi.mock('react-native', async () => await import('../../test/react-native'))

vi.mock('@shopify/flash-list', async () => {
  const ReactActual = await import('react')
  const { View, Text } = await import('../../test/react-native')
  return {
    FlashList: ReactActual.forwardRef(({
      ListEmptyComponent,
    }: {
      ListEmptyComponent?: React.ReactElement | null
      [key: string]: unknown
    }, _ref) => (
      ReactActual.createElement(
        View,
        { testID: 'agora-transcript' },
        ReactActual.isValidElement(ListEmptyComponent)
          ? ListEmptyComponent
          : ReactActual.createElement(Text, null, 'list'),
      )
    )),
  }
})

vi.mock('react-native-safe-area-context', async () => {
  const { createSafeAreaMock } = await import('../../test/mainScreenMocks')
  return createSafeAreaMock()
})

vi.mock('lucide-react-native', () => ({
  Send: () => null,
  ImagePlus: () => null,
  Mic: () => null,
  Play: () => null,
  Pause: () => null,
  Trash2: () => null,
  X: () => null,
}))

vi.mock('react-native-keyboard-controller', () => ({
  useKeyboardState: (select?: (state: { isVisible: boolean; height: number }) => unknown) => (
    select ? select({ isVisible: false, height: 0 }) : { isVisible: false, height: 0 }
  ),
}))

vi.mock('expo-image', () => ({
  Image: 'Image',
}))

vi.mock('expo-file-system', () => ({
  File: class {
    constructor(_uri: string) {}
    async bytes() {
      return new Uint8Array(0)
    }
  },
}))

vi.mock('expo-av', () => ({
  Audio: {
    requestPermissionsAsync: async () => ({ granted: true }),
    setAudioModeAsync: async () => undefined,
    Recording: {
      createAsync: async () => ({
        recording: {
          stopAndUnloadAsync: async () => ({ durationMillis: 1000 }),
          getURI: () => null,
        },
      }),
    },
    Sound: {
      createAsync: async () => ({
        sound: {
          unloadAsync: async () => undefined,
          playAsync: async () => undefined,
          pauseAsync: async () => undefined,
          getStatusAsync: async () => ({ isLoaded: false }),
          setOnPlaybackStatusUpdate: () => undefined,
        },
        status: { isLoaded: false },
      }),
    },
    RecordingOptionsPresets: { HIGH_QUALITY: {} },
  },
}))

vi.mock('@/lib/i18n', async () => {
  const { createI18nMock } = await import('../../test/mainScreenMocks')
  return createI18nMock()
})

vi.mock('@/lib/theme', async () => {
  const { createThemeMock } = await import('../../test/mainScreenMocks')
  return createThemeMock()
})

vi.mock('@/hooks/useGuardedRouter', () => ({
  useGuardedRouter: () => mockState.router,
}))

vi.mock('@/services/agora', async () => {
  const policy = await import('@/services/agora/agoraPolicy')
  return {
    ...policy,
    agoraErrorCode: () => null,
    agoraErrorMessage: () => 'error',
    activityAgora: vi.fn(async () => ({ ok: true, roomId: 'ago1.avisos.1' })),
    backgroundAgora: vi.fn(async () => ({ ok: true })),
    enterAgoraRoom: mockState.enter,
    heartbeatAgora: mockState.heartbeat,
    leaveAgoraRoom: vi.fn(async () => ({ ok: true })),
    listAgoraMessages: mockState.listMessages,
    listAgoraOccupants: vi.fn(async () => ({ occupants: [] })),
    parseAgoraOutgoing: policy.parseAgoraOutgoing,
    pickAgoraImage: vi.fn(async () => null),
    redeemAgoraInvite: vi.fn(),
    sendAgoraImage: vi.fn(),
    sendAgoraMessage: vi.fn(),
    sendAgoraVoice: vi.fn(),
  }
})

const { act, fireEvent, render, screen } = await import('@testing-library/react-native')
const { AgoraSalon } = await import('./AgoraSalon')
const { useAgoraStore } = await import('@/store/agoraStore')
const { Pressable, Text } = await import('../../test/react-native')

function Harness() {
  const [tick, setTick] = useState(0)
  return (
    <>
      <Pressable testID="bump" onPress={() => setTick((value) => value + 1)}>
        <Text>bump</Text>
      </Pressable>
      <AgoraSalon
        roomId="ago1.avisos.1"
        mode="home"
        onUnavailable={() => {
          void tick
        }}
      />
    </>
  )
}

describe('AgoraSalon', () => {
  beforeEach(() => {
    mockState.enter.mockReset()
    mockState.enter.mockImplementation(async () => ({
      room: {
        id: 'ago1.avisos.1',
        topicId: 'avisos',
        instanceIndex: 1,
        title: 'Avisos',
        topicTitle: 'Avisos',
        topicLine: 'notices',
        icon: 'landmark',
        canonical: true,
        readOnly: true,
        occupancy: 1,
        maxOccupancy: 0,
        full: false,
        closingAt: null,
      },
    }))
    mockState.listMessages.mockClear()
    useAgoraStore.getState().reset()
    useAgoraStore.getState().setIdentity({ identityId: 'id-1', nick: 'Perico', color: 'mint' })
  })

  it('never shows a composer on the announcements board', () => {
    mockState.enter.mockImplementation(() => new Promise(() => {}))
    const view = render(React.createElement(AgoraSalon, {
      roomId: 'ago1.avisos.1',
      mode: 'home',
      onUnavailable: () => undefined,
    }))
    expect(screen.getAllByText('Speak in Agora · public')).toHaveLength(0)
    expect(screen.queryByTestId('agora-composer-send')).toBeNull()
    expect(screen.queryByTestId('agora-composer-input')).toBeNull()
    expect(screen.getByText('This board is read-only.')).toBeTruthy()
    view.unmount()
  })

  it('enters Avisos once even if the parent rerenders with a new onUnavailable', async () => {
    const view = render(React.createElement(Harness))
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(mockState.enter).toHaveBeenCalledTimes(1)
    expect(screen.getAllByText('Speak in Agora · public')).toHaveLength(0)
    expect(screen.queryByTestId('agora-composer-send')).toBeNull()
    await fireEvent.press(screen.getByTestId('bump'))
    await fireEvent.press(screen.getByTestId('bump'))
    await act(async () => {
      await Promise.resolve()
    })
    expect(mockState.enter).toHaveBeenCalledTimes(1)
    view.unmount()
  })

  it('shows a compact send control in talk rooms', async () => {
    mockState.enter.mockImplementation(async () => ({
      room: {
        id: 'ago1.es_publico.1',
        topicId: 'publico',
        instanceIndex: 1,
        title: 'Público 1',
        topicTitle: 'Público',
        topicLine: 'public',
        icon: 'messages',
        canonical: true,
        readOnly: false,
        occupancy: 1,
        maxOccupancy: 80,
        full: false,
        closingAt: null,
      },
    }))
    render(React.createElement(AgoraSalon, {
      roomId: 'ago1.es_publico.1',
      mode: 'talk',
      onUnavailable: () => undefined,
    }))
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(screen.getAllByText('Speak in Público 1 · public')).toHaveLength(0)
    expect(screen.getByTestId('agora-composer-send')).toBeTruthy()
    expect(screen.getByTestId('agora-composer-input')).toBeTruthy()
    expect(screen.getByTestId('agora-composer-image')).toBeTruthy()
    expect(screen.getByTestId('agora-composer-mic')).toBeTruthy()
    expect(screen.queryByTestId('agora-composer-emoji')).toBeNull()
    expect(screen.getByTestId('agora-whisper-filter')).toBeTruthy()
    expect(screen.getByText('Public · not encrypted')).toBeTruthy()
  })
})
