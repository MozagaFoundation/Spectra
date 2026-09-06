/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgoraPublicMessage } from '@/lib/types/agora'
import { componentTestColors } from '../../test/componentMocks'

vi.mock('@/lib/i18n', async () => {
  const { createI18nComponentMock } = await import('../../test/componentMocks')
  return createI18nComponentMock()
})
vi.mock('@/services/agora', async () => await import('@/services/agora/agoraPolicy'))
vi.mock('expo-image', () => ({ Image: 'Image' }))
vi.mock('./AgoraVoicePlayer', () => ({
  AgoraVoicePlayer: () => null,
}))

const { act, render, screen } = await import('@testing-library/react-native')
const { AgoraPublicMessageRow } = await import('./AgoraPublicMessageRow')

const colors = { ...componentTestColors, gold: '#a7da57' }

function message(overrides: Partial<AgoraPublicMessage> = {}): AgoraPublicMessage {
  return {
    id: 'agm1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    kind: 'public',
    roomId: 'ago1.es_publico.1',
    author: { identityId: 'id-luna', nick: 'Luna', color: 'mint' },
    body: 'hola',
    isAction: false,
    serverSequence: 1,
    createdAt: '2026-09-05T12:00:00.000Z',
    ...overrides,
  }
}

describe('AgoraPublicMessageRow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('aligns other people left and own messages right', () => {
    const onNickPress = vi.fn()
    const other = render(
      <AgoraPublicMessageRow
        message={message()}
        isOwn={false}
        dark
        colors={colors as never}
        onNickPress={onNickPress}
      />,
    )
    expect(screen.getByTestId('agora-message-other')).toBeTruthy()
    expect(screen.getByTestId('agora-nick-id-luna')).toBeTruthy()
    other.unmount()

    const own = render(
      <AgoraPublicMessageRow
        message={message({ author: { identityId: 'id-me', nick: 'Perico', color: 'gold' }, body: 'mine' })}
        isOwn
        dark
        colors={colors as never}
        onNickPress={onNickPress}
      />,
    )
    expect(screen.getByTestId('agora-message-own')).toBeTruthy()
    expect(screen.queryByTestId('agora-nick-id-me')).toBeNull()
    own.unmount()
  })

  it('long-presses a nick to open person actions', async () => {
    const onNickLongPress = vi.fn()
    render(
      <AgoraPublicMessageRow
        message={message()}
        isOwn={false}
        dark
        colors={colors as never}
        onNickPress={() => undefined}
        onNickLongPress={onNickLongPress}
      />,
    )
    const nick = screen.getByTestId('agora-nick-id-luna')
    await act(async () => {
      nick.props.onLongPress?.()
    })
    expect(onNickLongPress).toHaveBeenCalledWith(expect.objectContaining({
      identityId: 'id-luna',
      nick: 'Luna',
    }))
  })
})
