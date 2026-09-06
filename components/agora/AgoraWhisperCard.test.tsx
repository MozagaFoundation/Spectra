/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgoraWhisper } from '@/lib/types/agora'
import { componentTestColors } from '../../test/componentMocks'

vi.mock('@/lib/i18n', async () => {
  const { createI18nComponentMock } = await import('../../test/componentMocks')
  return createI18nComponentMock()
})
vi.mock('@/services/agora', async () => await import('@/services/agora/agoraPolicy'))

const { fireEvent, render, screen } = await import('@testing-library/react-native')
const { AgoraWhisperCard } = await import('./AgoraWhisperCard')

const colors = { ...componentTestColors, gold: '#a7da57' }
const luna = { identityId: 'id-luna', nick: 'Luna', color: 'mint' }
const perico = { identityId: 'id-perico', nick: 'Perico', color: 'gold' }

function whisper(overrides: Partial<AgoraWhisper> = {}): AgoraWhisper {
  return {
    id: 'agw1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    kind: 'invite',
    roomId: 'ago1.es_publico.1',
    from: luna,
    to: perico,
    body: '',
    inviteId: 'agi1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    createdAt: '2026-09-05T12:00:00.000Z',
    serverVisible: true,
    ...overrides,
  }
}

describe('AgoraWhisperCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lets the recipient redeem a live invite', async () => {
    const onRedeem = vi.fn()
    render(
      <AgoraWhisperCard
        whisper={whisper()}
        ownIdentityId={perico.identityId}
        ownNick={perico.nick}
        dark
        colors={colors as never}
        onNickPress={() => undefined}
        onRedeem={onRedeem}
        onFilterPartner={() => undefined}
      />,
    )
    expect(screen.queryByTestId('agora-whisper-invite')).toBeTruthy()
    expect(screen.queryByTestId('agora-whisper-redeem')).toBeTruthy()
    await fireEvent.press(screen.queryByTestId('agora-whisper-invite')!)
    expect(onRedeem).toHaveBeenCalledTimes(1)
  })

  it('renders invite_accept as a receipt without redeem', async () => {
    const onRedeem = vi.fn()
    render(
      <AgoraWhisperCard
        whisper={whisper({
          kind: 'invite_accept',
          from: perico,
          to: luna,
          body: '',
        })}
        ownIdentityId={luna.identityId}
        ownNick={luna.nick}
        dark
        colors={colors as never}
        onNickPress={() => undefined}
        onRedeem={onRedeem}
        onFilterPartner={() => undefined}
      />,
    )
    expect(screen.queryByTestId('agora-whisper-accept')).toBeTruthy()
    expect(screen.queryByTestId('agora-whisper-redeem')).toBeNull()
    expect(screen.getByText(/accepted a private-chat invite/)).toBeTruthy()
    await fireEvent.press(screen.queryByTestId('agora-whisper-accept')!)
    expect(onRedeem).not.toHaveBeenCalled()
  })
})
