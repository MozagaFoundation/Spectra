/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const translateMock = vi.hoisted(() => vi.fn((key: string) => key))

vi.mock('@/lib/i18n', () => ({
  translate: translateMock,
}))

import { createCallInvitationMessage } from '../shared/callInvitationFormat'
import { buildDirectMessagePreview } from './messagePresentation'

describe('buildDirectMessagePreview', () => {
  beforeEach(() => {
    translateMock.mockClear()
  })

  it('uses friendly previews for incoming call invitations', () => {
    const content = createCallInvitationMessage(
      '123e4567-e89b-12d3-a456-426614174000',
      'video',
      'YWJj',
    )

    expect(buildDirectMessagePreview(content)).toEqual({
      preview: 'Incoming video call',
      isCallInvite: true,
    })
    expect(translateMock).toHaveBeenCalledWith('Incoming video call', { ns: 'chat' })
  })

  it('uses friendly previews for outgoing call invitations', () => {
    const content = createCallInvitationMessage(
      '123e4567-e89b-12d3-a456-426614174000',
      'voice',
      'YWJj',
    )

    expect(buildDirectMessagePreview(content, undefined, { isOwn: true })).toEqual({
      preview: 'Outgoing voice call',
      isCallInvite: true,
    })
    expect(translateMock).toHaveBeenCalledWith('Outgoing voice call', { ns: 'chat' })
  })

  it('suppresses raw control-envelope previews', () => {
    expect(buildDirectMessagePreview('{"v":2,"type":"tor_state","enabled":true}')).toEqual({
      preview: '',
      isCallInvite: false,
    })
  })

  it('uses direction-aware attachment previews', () => {
    expect(buildDirectMessagePreview('', [{ type: 'image' } as any])).toEqual({
      preview: '📎 Image received',
      isCallInvite: false,
    })
    expect(buildDirectMessagePreview(
      '',
      [{ type: 'voice_note' } as any],
      { isOwn: true },
    )).toEqual({
      preview: '📎 Voice message sent',
      isCallInvite: false,
    })
  })

  it('redacts view-once previews to placeholders', () => {
    expect(
      buildDirectMessagePreview(
        '{"v":2,"type":"view_once","kind":"text","body":"top secret"}',
      ),
    ).toEqual({
      preview: 'One-time message',
      isCallInvite: false,
    })
  })

  it('reuses a parsed envelope without inspecting raw content again', () => {
    expect(buildDirectMessagePreview('not-json', undefined, {
      envelope: {
        type: 'view_once',
        kind: 'text',
        body: 'top secret',
      },
    })).toEqual({
      preview: 'One-time message',
      isCallInvite: false,
    })
  })
})
