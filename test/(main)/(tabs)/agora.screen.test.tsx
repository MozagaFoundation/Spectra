/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  identity: null as { identityId: string; nick: string; color: string } | null,
  setIdentity: vi.fn((identity: { identityId: string; nick: string; color: string } | null) => {
    mockState.identity = identity
  }),
  setLoading: vi.fn(),
  reset: vi.fn(),
  router: { push: vi.fn() },
  session: {
    identity: { identityId: 'id-1', nick: 'Perico', color: 'mint' },
    termsVersion: '2026-09-04',
    acceptedTermsVersion: '2026-09-04',
  },
}))

vi.mock('react-native', async () => await import('../../../test/react-native'))

vi.mock('@react-navigation/native', async () => {
  const ReactActual = await import('react')
  return {
    useFocusEffect: (callback: () => void | (() => void)) => {
      ReactActual.useEffect(() => callback(), [callback])
    },
  }
})

vi.mock('react-native-safe-area-context', async () => {
  const { createSafeAreaMock } = await import('../../../test/mainScreenMocks')
  return createSafeAreaMock()
})

vi.mock('lucide-react-native', async () => {
  const { TestIcon } = await import('../../../test/mainScreenMocks')
  return { Landmark: TestIcon }
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/components/ui', async () => {
  const { TestButton } = await import('../../../test/mainScreenMocks')
  return { Button: TestButton }
})

vi.mock('@/lib/i18n', async () => {
  const { createI18nMock } = await import('../../../test/mainScreenMocks')
  return { ...createI18nMock(), getCurrentLanguage: () => 'es' }
})

vi.mock('@/lib/theme', async () => {
  const { createThemeMock } = await import('../../../test/mainScreenMocks')
  return createThemeMock()
})

vi.mock('@/hooks/useGuardedRouter', () => ({
  useGuardedRouter: () => mockState.router,
}))

vi.mock('@/components/agora/AgoraPlazaShell', async () => {
  const ReactActual = await import('react')
  const { View } = await import('../../../test/react-native')
  return {
    AgoraPlazaShell: () => ReactActual.createElement(View, { testID: 'agora-avisos-home' }),
  }
})

vi.mock('@/store/agoraStore', () => {
  const useAgoraStore = (select: (state: Record<string, unknown>) => unknown) => select({
    identity: mockState.identity,
    setIdentity: mockState.setIdentity,
    setLoading: mockState.setLoading,
    reset: mockState.reset,
  })
  useAgoraStore.getState = () => ({ identity: mockState.identity })
  return { useAgoraStore }
})

vi.mock('@/store/walletStore', () => ({
  useWalletStore: (select: (state: Record<string, unknown>) => unknown) =>
    select({ wallet: { address: 'EXO00aa' } }),
}))

vi.mock('@/store/chatStore', () => ({
  useChatStore: (select: (state: Record<string, unknown>) => unknown) => select({ contacts: [] }),
}))

vi.mock('@/services/agora', () => ({
  AGORA_AVISOS_ROOM_ID: 'ago1.avisos.1',
  agoraAvisosRoomId: () => 'ago1.avisos.1',
  agoraErrorCode: () => null,
  agoraErrorMessage: () => 'error',
  agoraNickConflictsWithAlias: () => false,
  fetchAgoraSession: vi.fn(async () => mockState.session),
  joinAgora: vi.fn(),
  normalizeAgoraNick: (value: string) => value,
  resolveAgoraPlazaLocale: () => 'es',
}))

vi.mock('@/lib/discoveryAlias', () => ({
  storedDiscoveryAlias: () => null,
}))

const { act, render, screen } = await import('@testing-library/react-native')
const { default: AgoraLobbyScreen } = await import('../../../app/(main)/(tabs)/agora')
const { fetchAgoraSession } = await import('@/services/agora')

describe('AgoraLobbyScreen', () => {
  beforeEach(() => {
    vi.mocked(fetchAgoraSession).mockReset()
    vi.mocked(fetchAgoraSession).mockImplementation(async () => mockState.session)
    mockState.identity = {
      identityId: 'id-1',
      nick: 'Perico',
      color: 'mint',
    }
  })

  it('opens Avisos as the home board after join and omits the plaintext pill', async () => {
    render(React.createElement(AgoraLobbyScreen))
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByTestId('agora-avisos-home')).toBeTruthy()
    expect(screen.getAllByText('Not encrypted')).toHaveLength(0)
    expect(screen.getAllByText('Join the plaza')).toHaveLength(0)
  })

  it('keeps Avisos open if a later session refresh fails', async () => {
    vi.mocked(fetchAgoraSession).mockRejectedValueOnce(new Error('offline'))
    render(React.createElement(AgoraLobbyScreen))
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByTestId('agora-avisos-home')).toBeTruthy()
  })

  it('shows a retry control when session load fails before join', async () => {
    mockState.identity = null
    vi.mocked(fetchAgoraSession).mockRejectedValueOnce(new Error('offline'))
    render(React.createElement(AgoraLobbyScreen))
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByText('error')).toBeTruthy()
    expect(screen.getByText('Retry')).toBeTruthy()
  })
})
