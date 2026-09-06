/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'
import {
  AGORA_MAX_BODY,
  AGORA_MAX_IMAGE_BYTES,
  AGORA_MAX_VOICE_BYTES,
  AGORA_MAX_VOICE_MS,
  AGORA_MESSAGE_CAP,
  agoraAvisosRoomId,
  agoraContainsForbiddenLink,
  agoraNickConflictsWithAlias,
  applyAgoraWhisperNick,
  agoraWhisperIsRedeemable,
  filterAgoraTranscript,
  isAgoraUnlimitedRoom,
  isAgoraWhisperComposerDraft,
  normalizeAgoraNick,
  parseAgoraOutgoing,
  resolveAgoraPlazaLocale,
} from './agoraPolicy'

describe('agoraPolicy', () => {
  it('rejects nicks that look like aliases or EXO addresses', () => {
    expect(normalizeAgoraNick('ab')).toBeNull()
    expect(normalizeAgoraNick('EXO00dead')).toBeNull()
    expect(normalizeAgoraNick('luna_roja')).toBe('luna_roja')
    expect(agoraNickConflictsWithAlias('Peter', '@Peter')).toBe(true)
    expect(agoraNickConflictsWithAlias('Peter', '@Maria')).toBe(false)
  })

  it('limits Agora to Spanish or English, defaulting other app languages to English', () => {
    expect(resolveAgoraPlazaLocale('es')).toBe('es')
    expect(resolveAgoraPlazaLocale('en')).toBe('en')
    expect(resolveAgoraPlazaLocale('fr')).toBe('en')
    expect(agoraAvisosRoomId('en')).toBe('ago1.en_avisos.1')
    expect(agoraAvisosRoomId('es')).toBe('ago1.avisos.1')
  })

  it('parses public, action, and whisper lines', () => {
    expect(parseAgoraOutgoing('hola', 'me')).toEqual({
      kind: 'public',
      body: 'hola',
      whisperTo: null,
    })
    expect(parseAgoraOutgoing('/me waves', 'me')).toEqual({
      kind: 'action',
      body: 'waves',
      whisperTo: null,
    })
    expect(parseAgoraOutgoing('@mar secret', 'me')).toEqual({
      kind: 'whisper',
      body: 'secret',
      whisperTo: 'mar',
    })
    expect(parseAgoraOutgoing('https://evil.test', 'me')).toEqual({ error: 'link' })
    expect(parseAgoraOutgoing('see www.example.com', 'me')).toEqual({ error: 'link' })
    expect(parseAgoraOutgoing('mira google.com', 'me')).toEqual({ error: 'link' })
    expect(parseAgoraOutgoing('t.me/plaza', 'me')).toEqual({ error: 'link' })
    expect(parseAgoraOutgoing('[click](https://evil.test)', 'me')).toEqual({ error: 'link' })
    expect(parseAgoraOutgoing('@mar https://evil.test', 'me')).toEqual({ error: 'link' })
    expect(parseAgoraOutgoing('hola Perico', 'me')).toEqual({
      kind: 'public',
      body: 'hola Perico',
      whisperTo: null,
    })
    expect(parseAgoraOutgoing('x'.repeat(500), 'me')).toEqual({
      kind: 'public',
      body: 'x'.repeat(500),
      whisperTo: null,
    })
    expect(parseAgoraOutgoing('x'.repeat(501), 'me')).toEqual({ error: 'too_long' })
  })

  it('forbids schemes, domains, shorteners, and markdown links', () => {
    expect(agoraContainsForbiddenLink('hola Perico')).toBe(false)
    expect(agoraContainsForbiddenLink('i.e. cuidado')).toBe(false)
    expect(agoraContainsForbiddenLink('3.14')).toBe(false)
    expect(agoraContainsForbiddenLink('https://evil.test')).toBe(true)
    expect(agoraContainsForbiddenLink('ftp://files.test')).toBe(true)
    expect(agoraContainsForbiddenLink('www.example.com')).toBe(true)
    expect(agoraContainsForbiddenLink('google.com')).toBe(true)
    expect(agoraContainsForbiddenLink('t.me/plaza')).toBe(true)
    expect(agoraContainsForbiddenLink('[click](https://evil.test)')).toBe(true)
    expect(agoraContainsForbiddenLink('1.2.3.4:8080')).toBe(true)
  })

  it('turns a tapped nick into a whisper draft prefix', () => {
    expect(isAgoraWhisperComposerDraft('@mar ', 'me')).toBe(true)
    expect(isAgoraWhisperComposerDraft('@me ', 'me')).toBe(false)
    expect(applyAgoraWhisperNick('hola', 'mar')).toBe('@mar hola')
    expect(applyAgoraWhisperNick('@old secret', 'mar')).toBe('@mar secret')
  })

  it('filters the plaza transcript to public lines or whispers with one nick', () => {
    const luna = { from: { nick: 'Luna' }, to: { nick: 'Perico' } }
    const mar = { from: { nick: 'Perico' }, to: { nick: 'Mar' } }
    const items = [
      { type: 'public' as const, id: 'p1' },
      { type: 'whisper' as const, whisper: luna, id: 'w1' },
      { type: 'whisper' as const, whisper: mar, id: 'w2' },
    ]
    expect(filterAgoraTranscript(items, 'all', null)).toEqual(items)
    expect(filterAgoraTranscript(items, 'public', null)).toEqual([items[0]])
    expect(filterAgoraTranscript(items, 'whispers', null)).toEqual([items[1], items[2]])
    expect(filterAgoraTranscript(items, 'whispers', 'luna')).toEqual([items[1]])
  })

  it('only redeems live invites addressed to the current identity', () => {
    const invite = {
      kind: 'invite',
      inviteId: 'agi1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      from: { identityId: 'id-luna' },
      to: { identityId: 'id-perico' },
    }
    expect(agoraWhisperIsRedeemable(invite, 'id-perico')).toBe(true)
    expect(agoraWhisperIsRedeemable(invite, 'id-luna')).toBe(false)
    expect(agoraWhisperIsRedeemable({ ...invite, kind: 'invite_accept' }, 'id-perico')).toBe(false)
    expect(agoraWhisperIsRedeemable({ ...invite, inviteId: null }, 'id-perico')).toBe(false)
    expect(agoraWhisperIsRedeemable({ ...invite, kind: 'text' }, 'id-perico')).toBe(false)
  })

  it('treats read-only boards with no occupancy cap as unlimited', () => {
    expect(isAgoraUnlimitedRoom({ readOnly: true, maxOccupancy: 0 })).toBe(true)
    expect(isAgoraUnlimitedRoom({ readOnly: false, maxOccupancy: 0 })).toBe(false)
    expect(isAgoraUnlimitedRoom({ readOnly: true, maxOccupancy: 80 })).toBe(false)
  })

  it('caps public lines at 500 characters, images at 6 MB, and voice notes at 2 MB / 60s', () => {
    expect(AGORA_MAX_BODY).toBe(500)
    expect(AGORA_MAX_IMAGE_BYTES).toBe(6 * 1024 * 1024)
    expect(AGORA_MAX_VOICE_BYTES).toBe(2 * 1024 * 1024)
    expect(AGORA_MAX_VOICE_MS).toBe(60_000)
    expect(AGORA_MESSAGE_CAP).toBe(4000)
  })
})
