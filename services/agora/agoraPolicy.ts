/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

export const AGORA_TERMS_VERSION = '2026-09-04'
export const AGORA_AVISOS_ROOM_ID = 'ago1.avisos.1'
export const AGORA_AVISOS_ROOM_IDS = {
  es: 'ago1.avisos.1',
  en: 'ago1.en_avisos.1',
} as const
export type AgoraPlazaLocale = 'en' | 'es'
export const AGORA_MAX_OCCUPANCY = 80
export const AGORA_MESSAGE_PAGE = 50
export const AGORA_MESSAGE_CAP = 4000
export const AGORA_MAX_BODY = 500
export const AGORA_MAX_IMAGE_BYTES = 6 * 1024 * 1024
export const AGORA_MAX_VOICE_BYTES = 2 * 1024 * 1024
export const AGORA_MAX_VOICE_MS = 60_000
export const AGORA_IMAGE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
} as const
export type AgoraImageMime = keyof typeof AGORA_IMAGE_TYPES
export const AGORA_VOICE_TYPES = {
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/aac': 'm4a',
} as const
export type AgoraVoiceMime = keyof typeof AGORA_VOICE_TYPES
export const AGORA_POLL_MS = 2500
export const AGORA_HEARTBEAT_MS = 20_000
export const AGORA_BACKGROUND_HOLD_MS = 5 * 60_000
export const AGORA_IDLE_MS = 15 * 60_000
export const AGORA_IDLE_WARN_MS = 13 * 60_000

export const AGORA_NICK_PATTERN = /^[A-Za-z0-9_]{3,24}$/
const CONTROL_PATTERN = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u
const LINK_SCHEME = /(?:https?|ftp|ftps|mailto|magnet|intent):/i
const LINK_SLASHES = /:\/\//
const LINK_WWW = /\bwww\./i
const LINK_SHORTENER = /\b(?:t\.me|bit\.ly|tinyurl\.com|goo\.gl|ow\.ly|is\.gd|cutt\.ly)\//i
const LINK_DOMAIN = /\b[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.(?:com|net|org|io|co|me|app|info|xyz|dev|onion|gg|tv|ly|cc|uk|us|es|mx|br|ar|de|fr|edu|gov|pro|biz|online|site|shop|link|click|top)(?:[/:?#]|\b)/i
const LINK_IPV4 = /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)(?::\d{2,5})?(?:\/|\b)/
const LINK_MARKDOWN = /\[[^\]]+\]\([^)]+\)/

export function agoraContainsForbiddenLink(text: string): boolean {
  return LINK_SCHEME.test(text)
    || LINK_SLASHES.test(text)
    || LINK_WWW.test(text)
    || LINK_SHORTENER.test(text)
    || LINK_DOMAIN.test(text)
    || LINK_IPV4.test(text)
    || LINK_MARKDOWN.test(text)
}

export const AGORA_COLORS = [
  'mint',
  'gold',
  'coral',
  'sky',
  'violet',
  'rose',
  'amber',
  'teal',
  'lime',
  'indigo',
  'peach',
  'slate',
] as const

export type AgoraColor = (typeof AGORA_COLORS)[number]

export function normalizeAgoraNick(value: string): string | null {
  const nick = value.trim()
  if (!AGORA_NICK_PATTERN.test(nick) || CONTROL_PATTERN.test(nick)) return null
  if (nick.toLowerCase().startsWith('exo00')) return null
  return nick
}

export function agoraNickConflictsWithAlias(nick: string, alias: string | null | undefined): boolean {
  if (!alias) return false
  const aliasKey = alias.trim().replace(/^@/, '').toLowerCase()
  return aliasKey.length > 0 && aliasKey === nick.toLowerCase()
}

export function parseAgoraOutgoing(body: string, ownNick: string): {
  kind: 'public' | 'action' | 'whisper'
  body: string
  whisperTo: string | null
} | { error: 'empty' | 'too_long' | 'link' | 'self_whisper' } {
  const trimmed = body.trim()
  if (!trimmed) return { error: 'empty' }
  if (trimmed.length > AGORA_MAX_BODY) return { error: 'too_long' }
  if (agoraContainsForbiddenLink(trimmed)) return { error: 'link' }
  if (trimmed.startsWith('/me ')) {
    const action = trimmed.slice(4).trim()
    if (!action) return { error: 'empty' }
    return { kind: 'action', body: action, whisperTo: null }
  }
  const whisper = trimmed.match(/^@([A-Za-z0-9_]{3,24})\s+(.+)$/)
  if (whisper) {
    if (whisper[1]!.toLowerCase() === ownNick.toLowerCase()) return { error: 'self_whisper' }
    return { kind: 'whisper', body: whisper[2]!.trim(), whisperTo: whisper[1]! }
  }
  return { kind: 'public', body: trimmed, whisperTo: null }
}

export function isAgoraWhisperComposerDraft(draft: string, ownNick: string): boolean {
  const match = draft.match(/^@([A-Za-z0-9_]{3,24})(\s|$)/)
  if (!match) return false
  return match[1]!.toLowerCase() !== ownNick.toLowerCase()
}

export function applyAgoraWhisperNick(draft: string, nick: string): string {
  const prefix = `@${nick} `
  const rest = draft.replace(/^@[A-Za-z0-9_]{3,24}\s*/, '')
  return `${prefix}${rest}`
}

export function isAgoraUnlimitedRoom(room: {
  readOnly: boolean
  maxOccupancy: number
}): boolean {
  return room.readOnly && room.maxOccupancy === 0
}

export function agoraColorValue(color: string, dark: boolean): string {
  const palette: Record<string, [string, string]> = {
    mint: ['#2f8f78', '#5fc7a9'],
    gold: ['#7a8f2e', '#a7da57'],
    coral: ['#c45c4a', '#f0a090'],
    sky: ['#2f6f9a', '#7ec8ea'],
    violet: ['#6b4ea3', '#b9a4e8'],
    rose: ['#a24b6a', '#e8a0b8'],
    amber: ['#9a7420', '#e9d27a'],
    teal: ['#2c7a78', '#7ad4d0'],
    lime: ['#5d8a28', '#c2e87f'],
    indigo: ['#3f5aa8', '#9bb0ef'],
    peach: ['#b56a3c', '#f0c2a0'],
    slate: ['#4a5560', '#c5ccd4'],
  }
  const pair = palette[color] ?? palette.slate
  return dark ? pair[1] : pair[0]
}

export function isAgoraPlazaLocale(value: unknown): value is AgoraPlazaLocale {
  return value === 'en' || value === 'es'
}

export function resolveAgoraPlazaLocale(appLanguage: string | null | undefined): AgoraPlazaLocale {
  return appLanguage === 'es' ? 'es' : 'en'
}

export function agoraAvisosRoomId(locale: AgoraPlazaLocale | null | undefined): string {
  return AGORA_AVISOS_ROOM_IDS[isAgoraPlazaLocale(locale) ? locale : 'es']
}

export function isAgoraAvisosRoomId(roomId: string): boolean {
  return roomId === AGORA_AVISOS_ROOM_IDS.es || roomId === AGORA_AVISOS_ROOM_IDS.en
}

export type AgoraWhisperFilterMode = 'all' | 'public' | 'whispers'

function nickKey(nick: string): string {
  return nick.trim().toLowerCase()
}

export function agoraWhisperInvolvesNick(
  whisper: { from: { nick: string }; to: { nick: string } },
  nick: string,
): boolean {
  const key = nickKey(nick)
  if (!key) return false
  return nickKey(whisper.from.nick) === key || nickKey(whisper.to.nick) === key
}

export function agoraWhisperPartnerNick(
  whisper: { from: { nick: string }; to: { nick: string } },
  ownNick: string,
): string {
  return nickKey(whisper.from.nick) === nickKey(ownNick) ? whisper.to.nick : whisper.from.nick
}

export function agoraWhisperIsRedeemable(
  whisper: {
    kind: string
    inviteId?: string | null
    from: { identityId: string }
    to: { identityId: string }
  },
  ownIdentityId: string | null | undefined,
): boolean {
  if (!ownIdentityId || whisper.kind !== 'invite' || !whisper.inviteId) return false
  if (whisper.from.identityId === ownIdentityId) return false
  return whisper.to.identityId === ownIdentityId
}

export function filterAgoraTranscript<
  T extends { type: 'public' } | { type: 'whisper'; whisper: { from: { nick: string }; to: { nick: string } } },
>(
  items: T[],
  mode: AgoraWhisperFilterMode,
  nick: string | null,
): T[] {
  if (mode === 'all' && !nick) return items
  if (mode === 'public') return items.filter((item) => item.type === 'public')
  const whispers = items.filter((item) => item.type === 'whisper')
  if (!nick) return whispers
  return whispers.filter((item) => item.type === 'whisper' && agoraWhisperInvolvesNick(item.whisper, nick))
}
