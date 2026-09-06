import type { Principal } from './auth.ts'
import { type Database, db } from './db.ts'
import { loadConfig } from './config.ts'
import { allowMethod, bytesToHex, HttpError, json, readJson, sha256Hex } from './http.ts'
import { createClient } from '@supabase/supabase-js'

export const AGORA_TERMS_VERSION = '2026-09-04'
const MAX_OCCUPANCY = 80
const MAX_INSTANCES = 20
const MESSAGE_CAP = 4000
const MESSAGE_PAGE = 50
const MAX_BODY = 500
const MAX_IMAGE_BYTES = 6 * 1024 * 1024
const MAX_VOICE_BYTES = 2 * 1024 * 1024
const MAX_VOICE_MS = 60_000
const AGORA_MEDIA_BUCKET = 'agora-media'
const MEDIA_TYPES: Record<string, { ext: string; kind: 'image' | 'voice'; maxBytes: number }> = {
  'image/jpeg': { ext: 'jpg', kind: 'image', maxBytes: MAX_IMAGE_BYTES },
  'image/png': { ext: 'png', kind: 'image', maxBytes: MAX_IMAGE_BYTES },
  'image/webp': { ext: 'webp', kind: 'image', maxBytes: MAX_IMAGE_BYTES },
  'image/gif': { ext: 'gif', kind: 'image', maxBytes: MAX_IMAGE_BYTES },
  'audio/mp4': { ext: 'm4a', kind: 'voice', maxBytes: MAX_VOICE_BYTES },
  'audio/m4a': { ext: 'm4a', kind: 'voice', maxBytes: MAX_VOICE_BYTES },
  'audio/aac': { ext: 'm4a', kind: 'voice', maxBytes: MAX_VOICE_BYTES },
}
const OVERFLOW_MIN = 10
const OVERFLOW_CLOSE_MS = 5 * 60_000
const WHISPER_TTL_MS = 48 * 60 * 60 * 1000
const INVITE_TTL_MS = 60 * 60 * 1000
const NICK_CHANGE_MS = 24 * 60 * 60 * 1000
const TOMBSTONE_MS = 3 * 24 * 60 * 60 * 1000
const NEW_NICK_WINDOW_MS = 5 * 60 * 1000
const NEW_NICK_GAP_MS = 10_000
const DUPLICATE_GAP_MS = 30_000
const SEND_PER_MINUTE = 20
const WHISPER_PER_MINUTE = 10
const INVITE_PER_HOUR = 3
const REPORT_PER_HOUR = 10
const NICK_PATTERN = /^[A-Za-z0-9_]{3,24}$/
const LINK_SCHEME = /(?:https?|ftp|ftps|mailto|magnet|intent):/i
const LINK_SLASHES = /:\/\//
const LINK_WWW = /\bwww\./i
const LINK_SHORTENER = /\b(?:t\.me|bit\.ly|tinyurl\.com|goo\.gl|ow\.ly|is\.gd|cutt\.ly)\//i
const LINK_DOMAIN =
  /\b[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.(?:com|net|org|io|co|me|app|info|xyz|dev|onion|gg|tv|ly|cc|uk|us|es|mx|br|ar|de|fr|edu|gov|pro|biz|online|site|shop|link|click|top)(?:[/:?#]|\b)/i
const LINK_IPV4 =
  /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)(?::\d{2,5})?(?:\/|\b)/
const LINK_MARKDOWN = /\[[^\]]+\]\([^)]+\)/

function containsForbiddenLink(text: string): boolean {
  return LINK_SCHEME.test(text) ||
    LINK_SLASHES.test(text) ||
    LINK_WWW.test(text) ||
    LINK_SHORTENER.test(text) ||
    LINK_DOMAIN.test(text) ||
    LINK_IPV4.test(text) ||
    LINK_MARKDOWN.test(text)
}
const COLORS = [
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

type AgoraIdentity = {
  identity_id: string
  nick: string
  nick_key: string
  color: string
  accepted_terms_version: string
  plaza_locale: 'en' | 'es'
  nick_changed_at: Date
  last_send_at: Date | null
  created_at: Date
}

type AgoraRoom = {
  id: string
  topic_id: string
  instance_index: number
  title: string
  topic_line: string
  icon: string
  is_canonical: boolean
  allows_overflow: boolean
  read_only: boolean
  sort_order: number
  locale: 'en' | 'es'
  closing_at: Date | null
}

export async function handleAgora(
  principal: Principal,
  request: Request,
  path: string,
  url: URL,
): Promise<Response> {
  await assertNotSpectreWallet(principal.walletAddress)
  if (path === '/v1/agora/session' && request.method === 'GET') {
    return json(await getSession(principal))
  }
  if (path === '/v1/agora/join') {
    allowMethod(request, 'POST')
    const body = await readJson(request, ['nick', 'termsVersion', 'recommendationsAck', 'locale'])
    return json(await joinAgora(principal, body))
  }
  if (path === '/v1/agora/nick') {
    allowMethod(request, 'POST')
    const body = await readJson(request, ['nick'])
    return json(await changeNick(principal, body))
  }
  if (path === '/v1/agora/locale') {
    allowMethod(request, 'POST')
    const body = await readJson(request, ['locale'])
    return json(await changeLocale(principal, body))
  }
  if (path === '/v1/agora/rooms' && request.method === 'GET') {
    return json({ rooms: await listRooms(await requireIdentity(principal)) })
  }
  if (path === '/v1/agora/presence/enter') {
    allowMethod(request, 'POST')
    const body = await readJson(request, ['roomId'])
    return json(await enterRoom(principal, body))
  }
  if (path === '/v1/agora/presence/heartbeat') {
    allowMethod(request, 'POST')
    return json(await heartbeat(principal, false))
  }
  if (path === '/v1/agora/presence/activity') {
    allowMethod(request, 'POST')
    return json(await heartbeat(principal, true))
  }
  if (path === '/v1/agora/presence/background') {
    allowMethod(request, 'POST')
    return json(await markBackground(principal))
  }
  if (path === '/v1/agora/presence/leave') {
    allowMethod(request, 'POST')
    return json(await leaveRoom(principal))
  }
  if (path === '/v1/agora/occupants' && request.method === 'GET') {
    const roomId = url.searchParams.get('roomId') ?? ''
    return json({ occupants: await listOccupants(await requireIdentity(principal), roomId) })
  }
  if (path === '/v1/agora/messages' && request.method === 'GET') {
    const identity = await requireIdentity(principal)
    return json(
      await listMessages(
        identity,
        url.searchParams.get('roomId') ?? '',
        url.searchParams.get('before'),
        url.searchParams.get('after'),
        url.searchParams.get('afterWhisper'),
      ),
    )
  }
  if (path === '/v1/agora/messages') {
    allowMethod(request, 'POST')
    const body = await readJson(request, ['roomId', 'body'])
    return json(await sendPublic(principal, body))
  }
  if (path === '/v1/agora/media/sign') {
    allowMethod(request, 'POST')
    const body = await readJson(request, ['roomId', 'contentType', 'size'])
    return json(await signAgoraMedia(principal, body))
  }
  if (path === '/v1/agora/media/commit') {
    allowMethod(request, 'POST')
    const body = await readJson(request, [
      'roomId',
      'messageId',
      'objectPath',
      'size',
      'body',
      'durationMs',
      'waveform',
    ])
    return json(await commitAgoraMedia(principal, body))
  }
  if (path === '/v1/agora/whispers') {
    allowMethod(request, 'POST')
    const body = await readJson(request, ['roomId', 'toNick', 'body'])
    return json(await sendWhisper(principal, body))
  }
  if (path === '/v1/agora/invites') {
    allowMethod(request, 'POST')
    const body = await readJson(request, ['roomId', 'toIdentityId', 'contactInvite'])
    return json(await createInvite(principal, body))
  }
  if (path === '/v1/agora/invites/redeem') {
    allowMethod(request, 'POST')
    const body = await readJson(request, ['inviteId'])
    return json(await redeemInvite(principal, body))
  }
  if (path === '/v1/agora/block') {
    allowMethod(request, 'POST')
    const body = await readJson(request, ['identityId'])
    return json(await blockIdentity(principal, body))
  }
  if (path === '/v1/agora/report') {
    allowMethod(request, 'POST')
    const body = await readJson(request, ['identityId', 'reason', 'roomId', 'messageId'])
    return json(await reportIdentity(principal, body))
  }
  throw new HttpError(404, 'not_found')
}

export async function sweepAgora(): Promise<{
  whispers: number
  invites: number
  tombstones: number
  presence: number
  overflow: number
}> {
  const sql = db()
  const whispers = await sql`delete from agora_whispers where expires_at < now() returning 1`
  const invites = await sql`
    delete from agora_invites where expires_at < now() and redeemed_at is null returning 1
  `
  const tombstones =
    await sql`delete from agora_nick_tombstones where expires_at < now() returning 1`
  const presence = await sql`
    delete from agora_presence
    where (
      backgrounded_at is null
      and last_heartbeat_at < now() - interval '45 seconds'
    ) or (
      backgrounded_at is not null
      and backgrounded_at < now() - interval '5 minutes'
    )
    returning 1
  `
  const overflow = await closeOverflowRooms(sql)
  return {
    whispers: whispers.length,
    invites: invites.length,
    tombstones: tombstones.length,
    presence: presence.length,
    overflow,
  }
}

async function assertNotSpectreWallet(walletAddress: string): Promise<void> {
  const rows = await db()`
    select 1
    from mobile_spectre_addresses
    where wallet_address=${walletAddress}
      and expires_at > now()
    limit 1
  `
  if (rows.length) throw new HttpError(403, 'agora_unavailable')
}

async function getSession(principal: Principal): Promise<Record<string, unknown>> {
  if (!principal.identityId) {
    return { identity: null, termsVersion: AGORA_TERMS_VERSION, acceptedTermsVersion: null }
  }
  const identity = await loadIdentity(principal.identityId)
  return {
    identity: identity ? publicIdentity(identity) : null,
    termsVersion: AGORA_TERMS_VERSION,
    acceptedTermsVersion: identity?.accepted_terms_version ?? null,
  }
}

async function joinAgora(
  principal: Principal,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!principal.identityId) throw new HttpError(403, 'identity_binding_required')
  if (body.termsVersion !== AGORA_TERMS_VERSION) throw new HttpError(400, 'terms_version')
  if (body.recommendationsAck !== true) throw new HttpError(400, 'recommendations_required')
  const nick = normalizeNick(body.nick)
  const locale = parsePlazaLocale(body.locale)
  await assertNickAvailable(nick, principal.identityId)
  const color = COLORS[hashColor(principal.identityId!)]!
  const now = new Date()
  await db()`
    insert into agora_identities (
      identity_id, owner_user_id, nick, nick_key, color, plaza_locale,
      accepted_terms_version, accepted_terms_at, nick_changed_at, created_at, updated_at
    ) values (
      ${principal
    .identityId!}, ${principal.userId}, ${nick}, ${nick.toLowerCase()}, ${color}, ${locale},
      ${AGORA_TERMS_VERSION}, ${now}, ${now}, ${now}, ${now}
    )
    on conflict (identity_id) do update set
      plaza_locale=${locale},
      accepted_terms_version=${AGORA_TERMS_VERSION},
      accepted_terms_at=${now},
      updated_at=${now}
  `
  return { identity: publicIdentity(await loadIdentity(principal.identityId!) as AgoraIdentity) }
}

async function changeNick(
  principal: Principal,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const identity = await requireIdentity(principal)
  const nick = normalizeNick(body.nick)
  if (Date.now() - identity.nick_changed_at.getTime() < NICK_CHANGE_MS) {
    throw new HttpError(429, 'nick_change_limited')
  }
  await assertNickAvailable(nick, identity.identity_id)
  const now = new Date()
  await db().begin(async (sql) => {
    await sql`
      insert into agora_nick_tombstones (nick_key, identity_id, expires_at)
      values (${identity.nick_key}, ${identity.identity_id}, ${new Date(
      now.getTime() + TOMBSTONE_MS,
    )})
      on conflict (nick_key) do update set
        identity_id=${identity.identity_id},
        expires_at=${new Date(now.getTime() + TOMBSTONE_MS)}
    `
    await sql`
      update agora_identities
      set nick=${nick}, nick_key=${nick.toLowerCase()}, nick_changed_at=${now}, updated_at=${now}
      where identity_id=${identity.identity_id}
    `
  })
  return { identity: publicIdentity(await loadIdentity(identity.identity_id) as AgoraIdentity) }
}

async function changeLocale(
  principal: Principal,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const identity = await requireIdentity(principal)
  if (body.locale !== 'en' && body.locale !== 'es') throw new HttpError(400, 'invalid_request')
  const locale = body.locale
  if (locale === identity.plaza_locale) {
    return { identity: publicIdentity(identity) }
  }
  const presence = await currentPresence(identity.identity_id)
  const now = new Date()
  await db().begin(async (sql) => {
    await sql`delete from agora_presence where identity_id=${identity.identity_id}`
    await sql`
      update agora_identities
      set plaza_locale=${locale}, updated_at=${now}
      where identity_id=${identity.identity_id}
    `
  })
  if (presence) await maybeStartOverflowClose((await loadRoom(presence.room_id)).topic_id)
  return { identity: publicIdentity(await loadIdentity(identity.identity_id) as AgoraIdentity) }
}

async function listRooms(identity: AgoraIdentity): Promise<Record<string, unknown>[]> {
  const rooms = await db()<AgoraRoom[]>`
    select id, topic_id, instance_index, title, topic_line, icon,
      is_canonical, allows_overflow, read_only, sort_order, locale, closing_at
    from agora_rooms
    where locale=${identity.plaza_locale}
    order by sort_order, instance_index
  `
  const occupancy = await occupancyMap()
  const presence = await currentPresence(identity.identity_id)
  return rooms.map((room) => ({
    ...serializeRoom(room, occupancy.get(room.id) ?? 0),
    youAreHere: presence?.room_id === room.id,
  }))
}

async function enterRoom(
  principal: Principal,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const identity = await requireIdentity(principal)
  const requested = await loadRoom(asRoomId(body.roomId))
  if (requested.locale !== identity.plaza_locale) throw new HttpError(404, 'room_not_found')
  await reapStalePresence()
  const target = await resolveEnterTarget(requested)
  const now = new Date()
  const unlimited = isUnlimitedRoom(target)
  await db().begin(async (sql) => {
    await sql`select pg_advisory_xact_lock(hashtextextended(${identity.identity_id}, 0))`
    await sql`delete from agora_presence where identity_id=${identity.identity_id}`
    const occupied = await liveOccupancy(sql, target.id)
    if (!unlimited && occupied >= MAX_OCCUPANCY) throw new HttpError(409, 'room_full')
    await sql`
      insert into agora_presence (
        identity_id, room_id, joined_at, last_heartbeat_at, last_activity_at, backgrounded_at
      ) values (
        ${identity.identity_id}, ${target.id}, ${now}, ${now}, ${now}, null
      )
      on conflict (identity_id) do update set
        room_id=${target.id},
        joined_at=${now},
        last_heartbeat_at=${now},
        last_activity_at=${now},
        backgrounded_at=null
    `
    if (target.closing_at && occupied + 1 >= OVERFLOW_MIN) {
      await sql`update agora_rooms set closing_at=null where id=${target.id}`
    }
  })
  const after = await liveOccupancy(db(), target.id)
  if (!unlimited && after >= MAX_OCCUPANCY && target.allows_overflow) {
    await spawnOverflow(target.topic_id)
  }
  await maybeStartOverflowClose(requested.topic_id)
  return { room: serializeRoom(await loadRoom(target.id), after) }
}

async function heartbeat(
  principal: Principal,
  activity: boolean,
): Promise<Record<string, unknown>> {
  const identity = await requireIdentity(principal)
  const now = new Date()
  const rows = activity
    ? await db()`
        update agora_presence
        set last_heartbeat_at=${now}, last_activity_at=${now}, backgrounded_at=null
        where identity_id=${identity.identity_id}
        returning room_id
      `
    : await db()`
        update agora_presence
        set last_heartbeat_at=${now}, backgrounded_at=null
        where identity_id=${identity.identity_id}
        returning room_id
      `
  if (!rows.length) throw new HttpError(409, 'not_in_room')
  return { ok: true, roomId: (rows[0] as { room_id: string }).room_id }
}

async function markBackground(principal: Principal): Promise<Record<string, unknown>> {
  const identity = await requireIdentity(principal)
  const now = new Date()
  const rows = await db()`
    update agora_presence
    set backgrounded_at=${now}, last_heartbeat_at=${now}
    where identity_id=${identity.identity_id}
    returning room_id
  `
  if (!rows.length) throw new HttpError(409, 'not_in_room')
  return { ok: true }
}

async function leaveRoom(principal: Principal): Promise<Record<string, unknown>> {
  const identity = await requireIdentity(principal)
  const presence = await currentPresence(identity.identity_id)
  await db()`delete from agora_presence where identity_id=${identity.identity_id}`
  if (presence) await maybeStartOverflowClose((await loadRoom(presence.room_id)).topic_id)
  return { ok: true }
}

async function listOccupants(
  identity: AgoraIdentity,
  roomId: string,
): Promise<Record<string, unknown>[]> {
  const room = await loadRoom(asRoomId(roomId))
  assertRoomLocale(identity, room)
  await assertInRoom(identity.identity_id, room.id)
  if (isUnlimitedRoom(room)) return []
  const rows = await db()`
    select i.identity_id, i.nick, i.color, p.last_activity_at
    from agora_presence p
    join agora_identities i on i.identity_id=p.identity_id
    where p.room_id=${room.id}
      and (
        (p.backgrounded_at is null and p.last_heartbeat_at > now() - interval '45 seconds')
        or (p.backgrounded_at is not null and p.backgrounded_at > now() - interval '5 minutes')
      )
    order by i.nick_key
  `
  const blocked = await blockedSet(identity.identity_id)
  return (rows as { identity_id: string; nick: string; color: string; last_activity_at: Date }[])
    .filter((row) => !blocked.has(row.identity_id))
    .map((row) => ({
      identityId: row.identity_id,
      nick: row.nick,
      color: row.color,
      idleSeconds: Math.max(
        0,
        Math.floor((Date.now() - new Date(row.last_activity_at).getTime()) / 1000),
      ),
      isSelf: row.identity_id === identity.identity_id,
    }))
}

async function listMessages(
  identity: AgoraIdentity,
  roomId: string,
  before: string | null,
  after: string | null,
  afterWhisper: string | null,
): Promise<Record<string, unknown>> {
  const loaded = await loadRoom(asRoomId(roomId))
  assertRoomLocale(identity, loaded)
  const room = loaded.id
  await assertInRoom(identity.identity_id, room)
  const beforeSeq = parseSequenceCursor(before)
  const afterSeq = parseSequenceCursor(after)
  if (beforeSeq !== null && afterSeq !== null) throw new HttpError(400, 'invalid_request')
  const afterWhisperAt = parseTimeCursor(afterWhisper)
  if (afterSeq !== null && afterWhisperAt === null) throw new HttpError(400, 'invalid_request')

  const publicRows = afterSeq !== null
    ? await db()`
        select id, author_id, body, is_action, media_kind, media_path, media_duration_ms,
          media_waveform, server_sequence, created_at
        from agora_messages
        where room_id=${room} and server_sequence > ${afterSeq}
        order by server_sequence asc
        limit ${MESSAGE_PAGE}
      `
    : beforeSeq === null
    ? await db()`
          select id, author_id, body, is_action, media_kind, media_path, media_duration_ms,
            media_waveform, server_sequence, created_at
          from agora_messages
          where room_id=${room}
          order by server_sequence desc
          limit ${MESSAGE_PAGE}
        `
    : await db()`
          select id, author_id, body, is_action, media_kind, media_path, media_duration_ms,
            media_waveform, server_sequence, created_at
          from agora_messages
          where room_id=${room} and server_sequence < ${beforeSeq}
          order by server_sequence desc
          limit ${MESSAGE_PAGE}
        `

  const whisperRows = beforeSeq !== null ? [] : afterWhisperAt
    ? await db()`
          select w.id, w.from_id, w.to_id, w.kind, w.body, w.invite_id, w.created_at
          from agora_whispers w
          where w.room_id=${room}
            and w.expires_at > now()
            and w.created_at > ${afterWhisperAt}
            and (w.from_id=${identity.identity_id} or w.to_id=${identity.identity_id})
          order by w.created_at asc
          limit ${MESSAGE_PAGE}
        `
    : await db()`
          select w.id, w.from_id, w.to_id, w.kind, w.body, w.invite_id, w.created_at
          from agora_whispers w
          where w.room_id=${room}
            and w.expires_at > now()
            and (w.from_id=${identity.identity_id} or w.to_id=${identity.identity_id})
          order by w.created_at desc
          limit ${MESSAGE_PAGE}
        `

  const authors = await identityMap([
    ...(publicRows as { author_id: string }[]).map((row) => row.author_id),
    ...(whisperRows as { from_id: string; to_id: string }[]).flatMap((
      row,
    ) => [row.from_id, row.to_id]),
  ])
  const blocked = await blockedSet(identity.identity_id)
  const newestFirst = afterSeq === null
  const messages = (publicRows as {
    id: string
    author_id: string
    body: string
    is_action: boolean
    media_kind: string | null
    media_path: string | null
    media_duration_ms: number | string | null
    media_waveform: unknown
    server_sequence: number
    created_at: Date
  }[])
    .filter((row) => !blocked.has(row.author_id))
  if (newestFirst) messages.reverse()
  const whispers = (whisperRows as {
    id: string
    from_id: string
    to_id: string
    kind: string
    body: string
    invite_id: string | null
    created_at: Date
  }[])
    .filter((row) => !blocked.has(row.from_id) && !blocked.has(row.to_id))
  if (newestFirst) whispers.reverse()
  return {
    messages: messages.map((row) => ({
      id: row.id,
      kind: 'public' as const,
      roomId: room,
      author: serializeAuthor(authors.get(row.author_id)),
      body: row.body,
      isAction: row.is_action,
      ...serializeMedia(row),
      serverSequence: Number(row.server_sequence),
      createdAt: new Date(row.created_at).toISOString(),
    })),
    whispers: whispers.map((row) => ({
      id: row.id,
      kind: row.kind,
      roomId: room,
      from: serializeAuthor(authors.get(row.from_id)),
      to: serializeAuthor(authors.get(row.to_id)),
      body: row.body,
      inviteId: row.invite_id,
      createdAt: new Date(row.created_at).toISOString(),
      serverVisible: true,
    })),
  }
}

async function sendPublic(
  principal: Principal,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const identity = await requireIdentity(principal)
  const room = await loadRoom(asRoomId(body.roomId))
  assertRoomLocale(identity, room)
  if (room.read_only) throw new HttpError(403, 'read_only')
  await assertInRoom(identity.identity_id, room.id)
  const parsed = parseOutgoing(asBody(body.body), identity.nick)
  if (parsed.whisperTo) {
    return await sendWhisper(principal, {
      roomId: room.id,
      toNick: parsed.whisperTo,
      body: parsed.body,
    })
  }
  await rateLimit(principal.userId, 'agora-send', SEND_PER_MINUTE, 60_000)
  await assertSendAllowed(identity, parsed.body)
  const id = messageId('agm1')
  const rows = await db()`
    insert into agora_messages (id, room_id, author_id, body, is_action)
    values (${id}, ${room.id}, ${identity.identity_id}, ${parsed.body}, ${parsed.action})
    returning id, body, is_action, server_sequence, created_at
  `
  await db()`
    update agora_identities set last_send_at=${new Date()}, updated_at=${new Date()}
    where identity_id=${identity.identity_id}
  `
  await db()`
    update agora_presence
    set last_activity_at=${new Date()}, last_heartbeat_at=${new Date()}, backgrounded_at=null
    where identity_id=${identity.identity_id}
  `
  await trimMessages(room.id)
  const row = rows[0] as {
    id: string
    body: string
    is_action: boolean
    server_sequence: number
    created_at: Date
  }
  return {
    message: {
      id: row.id,
      kind: 'public',
      roomId: room.id,
      author: publicIdentity(identity),
      body: row.body,
      isAction: row.is_action,
      mediaKind: null,
      mediaUrl: null,
      mediaDurationMs: null,
      serverSequence: Number(row.server_sequence),
      createdAt: new Date(row.created_at).toISOString(),
    },
  }
}

async function signAgoraMedia(
  principal: Principal,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const identity = await requireIdentity(principal)
  const room = await loadRoom(asRoomId(body.roomId))
  assertRoomLocale(identity, room)
  if (room.read_only) throw new HttpError(403, 'read_only')
  await assertInRoom(identity.identity_id, room.id)
  const media = asMediaType(body.contentType)
  const size = asMediaSize(body.size, media)
  const id = messageId('agm1')
  const objectPath = `${room.id}/${id}.${media.ext}`
  const signed = await agoraStorage().createSignedUploadUrl(objectPath, { upsert: false })
  const uploadUrl = signed.data?.signedUrl &&
    trustedAgoraUploadUrl(signed.data.signedUrl, objectPath)
  if (signed.error || !uploadUrl || signed.data?.path !== objectPath) {
    throw new HttpError(503, 'object_storage_failed')
  }
  return {
    messageId: id,
    objectPath,
    url: uploadUrl,
    method: 'PUT',
    size,
  }
}

async function commitAgoraMedia(
  principal: Principal,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const identity = await requireIdentity(principal)
  const room = await loadRoom(asRoomId(body.roomId))
  assertRoomLocale(identity, room)
  if (room.read_only) throw new HttpError(403, 'read_only')
  await assertInRoom(identity.identity_id, room.id)
  const messageIdValue = asMessageId(body.messageId)
  const objectPath = asObjectPath(body.objectPath, room.id, messageIdValue)
  const media = mediaFromPath(objectPath)
  const size = asMediaSize(body.size, media)
  const caption = asImageCaption(body.body)
  const durationMs = media.kind === 'voice' ? asVoiceDuration(body.durationMs) : null
  const waveform = media.kind === 'voice' ? asWaveform(body.waveform) : null
  if (media.kind === 'image' && (body.durationMs !== undefined || body.waveform !== undefined)) {
    throw new HttpError(400, 'invalid_request')
  }
  await rateLimit(principal.userId, 'agora-send', SEND_PER_MINUTE, 60_000)
  await assertSendAllowed(identity, caption || objectPath)
  const uploadedSize = await agoraObjectSize(objectPath)
  if (uploadedSize !== size) throw new HttpError(409, 'object_upload_incomplete')
  const rows = await db()`
    insert into agora_messages (
      id, room_id, author_id, body, is_action, media_kind, media_path, media_bytes,
      media_duration_ms, media_waveform
    )
    values (
      ${messageIdValue}, ${room.id}, ${identity.identity_id}, ${caption}, false,
      ${media.kind}, ${objectPath}, ${size}, ${durationMs},
      ${waveform ? db().json(waveform) : null}
    )
    returning id, body, is_action, media_kind, media_path, media_duration_ms, media_waveform,
      server_sequence, created_at
  `
  await db()`
    update agora_identities set last_send_at=${new Date()}, updated_at=${new Date()}
    where identity_id=${identity.identity_id}
  `
  await db()`
    update agora_presence
    set last_activity_at=${new Date()}, last_heartbeat_at=${new Date()}, backgrounded_at=null
    where identity_id=${identity.identity_id}
  `
  await trimMessages(room.id)
  const row = rows[0] as {
    id: string
    body: string
    is_action: boolean
    media_kind: string | null
    media_path: string | null
    media_duration_ms: number | string | null
    media_waveform: unknown
    server_sequence: number
    created_at: Date
  }
  return {
    message: {
      id: row.id,
      kind: 'public',
      roomId: room.id,
      author: publicIdentity(identity),
      body: row.body,
      isAction: row.is_action,
      ...serializeMedia(row),
      serverSequence: Number(row.server_sequence),
      createdAt: new Date(row.created_at).toISOString(),
    },
  }
}

async function sendWhisper(
  principal: Principal,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const identity = await requireIdentity(principal)
  const room = await loadRoom(asRoomId(body.roomId))
  assertRoomLocale(identity, room)
  if (room.read_only) throw new HttpError(403, 'read_only')
  await assertInRoom(identity.identity_id, room.id)
  const toNick = normalizeNick(body.toNick)
  const text = asBody(body.body)
  await rateLimit(principal.userId, 'agora-whisper', WHISPER_PER_MINUTE, 60_000)
  const target = await identityByNick(toNick)
  if (!target || target.identity_id === identity.identity_id) {
    throw new HttpError(404, 'nick_not_found')
  }
  if (await isBlockedEither(identity.identity_id, target.identity_id)) {
    throw new HttpError(403, 'blocked')
  }
  const targetPresence = await currentPresence(target.identity_id)
  if (targetPresence?.room_id !== room.id) throw new HttpError(409, 'not_in_room')
  const id = messageId('agw1')
  const now = new Date()
  await db()`
    insert into agora_whispers (id, room_id, from_id, to_id, kind, body, expires_at)
    values (
      ${id}, ${room.id}, ${identity.identity_id}, ${target.identity_id}, 'text', ${text},
      ${new Date(now.getTime() + WHISPER_TTL_MS)}
    )
  `
  await db()`
    update agora_presence
    set last_activity_at=${now}, last_heartbeat_at=${now}, backgrounded_at=null
    where identity_id=${identity.identity_id}
  `
  return {
    whisper: {
      id,
      kind: 'text',
      roomId: room.id,
      from: publicIdentity(identity),
      to: publicIdentity(target),
      body: text,
      createdAt: now.toISOString(),
      serverVisible: true,
    },
  }
}

async function createInvite(
  principal: Principal,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const identity = await requireIdentity(principal)
  const room = await loadRoom(asRoomId(body.roomId))
  assertRoomLocale(identity, room)
  await assertInRoom(identity.identity_id, room.id)
  await rateLimit(principal.userId, 'agora-invite', INVITE_PER_HOUR, 60 * 60_000)
  const toId = asIdentityId(body.toIdentityId)
  if (toId === identity.identity_id) throw new HttpError(400, 'invalid_request')
  const contactInvite = asContactInvite(body.contactInvite)
  const target = await loadIdentity(toId)
  if (!target) throw new HttpError(404, 'nick_not_found')
  if (await isBlockedEither(identity.identity_id, toId)) throw new HttpError(403, 'blocked')
  const targetPresence = await currentPresence(toId)
  if (targetPresence?.room_id !== room.id) throw new HttpError(409, 'not_in_room')
  const id = messageId('agi1')
  const whisperId = messageId('agw1')
  const now = new Date()
  await db().begin(async (sql) => {
    await sql`
      insert into agora_invites (
        id, room_id, from_id, to_id, contact_invite, created_at, expires_at
      ) values (
        ${id}, ${room.id}, ${identity.identity_id}, ${toId}, ${contactInvite}, ${now},
        ${new Date(now.getTime() + INVITE_TTL_MS)}
      )
    `
    await sql`
      insert into agora_whispers (
        id, room_id, from_id, to_id, kind, body, invite_id, expires_at
      ) values (
        ${whisperId}, ${room.id}, ${identity.identity_id}, ${toId}, 'invite', '', ${id},
        ${new Date(now.getTime() + INVITE_TTL_MS)}
      )
    `
  })
  return { inviteId: id, whisperId }
}

async function redeemInvite(
  principal: Principal,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const identity = await requireIdentity(principal)
  const inviteId = asInviteId(body.inviteId)
  const rows = await db()`
    update agora_invites
    set redeemed_at=${new Date()}
    where id=${inviteId}
      and to_id=${identity.identity_id}
      and redeemed_at is null
      and expires_at > now()
    returning contact_invite, from_id, room_id
  `
  if (!rows.length) throw new HttpError(404, 'invite_unavailable')
  const row = rows[0] as { contact_invite: string; from_id: string; room_id: string }
  const whisperId = messageId('agw1')
  await db()`
    insert into agora_whispers (
      id, room_id, from_id, to_id, kind, body, invite_id, expires_at
    ) values (
      ${whisperId}, ${row.room_id}, ${identity.identity_id}, ${row.from_id}, 'invite_accept', '',
      ${inviteId}, ${new Date(Date.now() + INVITE_TTL_MS)}
    )
  `
  return { contactInvite: row.contact_invite }
}

async function blockIdentity(
  principal: Principal,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const identity = await requireIdentity(principal)
  const target = asIdentityId(body.identityId)
  if (target === identity.identity_id) throw new HttpError(400, 'invalid_request')
  await db()`
    insert into agora_blocks (owner_id, blocked_id)
    values (${identity.identity_id}, ${target})
    on conflict do nothing
  `
  return { ok: true }
}

async function reportIdentity(
  principal: Principal,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const identity = await requireIdentity(principal)
  await rateLimit(principal.userId, 'agora-report', REPORT_PER_HOUR, 60 * 60_000)
  const reason = body.reason
  if (reason !== 'harassment' && reason !== 'spam' && reason !== 'illegal' && reason !== 'other') {
    throw new HttpError(400, 'invalid_request')
  }
  const target = asIdentityId(body.identityId)
  const roomId = typeof body.roomId === 'string' && body.roomId ? asRoomId(body.roomId) : null
  const messageIdValue =
    typeof body.messageId === 'string' && /^agm1[.][0-9a-f]{32}$/.test(body.messageId)
      ? body.messageId
      : null
  await db()`
    insert into agora_reports (id, reporter_id, target_id, room_id, message_id, reason)
    values (
      ${
    messageId('agr1')
  }, ${identity.identity_id}, ${target}, ${roomId}, ${messageIdValue}, ${reason}
    )
  `
  await db()`
    insert into agora_blocks (owner_id, blocked_id)
    values (${identity.identity_id}, ${target})
    on conflict do nothing
  `
  return { ok: true }
}

async function requireIdentity(principal: Principal): Promise<AgoraIdentity> {
  if (!principal.identityId) throw new HttpError(403, 'identity_binding_required')
  const identity = await loadIdentity(principal.identityId)
  if (!identity) throw new HttpError(403, 'agora_join_required')
  if (identity.accepted_terms_version !== AGORA_TERMS_VERSION) {
    throw new HttpError(403, 'agora_terms_required')
  }
  return identity
}

async function loadIdentity(identityId: string): Promise<AgoraIdentity | null> {
  const rows = await db()<AgoraIdentity[]>`
    select identity_id, nick, nick_key, color, accepted_terms_version, plaza_locale,
      nick_changed_at, last_send_at, created_at
    from agora_identities
    where identity_id=${identityId}
    limit 1
  `
  return rows[0] ?? null
}

async function identityByNick(nick: string): Promise<AgoraIdentity | null> {
  const rows = await db()<AgoraIdentity[]>`
    select identity_id, nick, nick_key, color, accepted_terms_version, plaza_locale,
      nick_changed_at, last_send_at, created_at
    from agora_identities
    where nick_key=${nick.toLowerCase()}
    limit 1
  `
  return rows[0] ?? null
}

async function loadRoom(roomId: string): Promise<AgoraRoom> {
  const rows = await db()<AgoraRoom[]>`
    select id, topic_id, instance_index, title, topic_line, icon,
      is_canonical, allows_overflow, read_only, sort_order, locale, closing_at
    from agora_rooms
    where id=${roomId}
    limit 1
  `
  if (!rows[0]) throw new HttpError(404, 'room_not_found')
  return rows[0]
}

function assertRoomLocale(identity: AgoraIdentity, room: AgoraRoom): void {
  if (room.locale !== identity.plaza_locale) throw new HttpError(404, 'room_not_found')
}

async function resolveEnterTarget(requested: AgoraRoom): Promise<AgoraRoom> {
  if (isUnlimitedRoom(requested)) return requested
  const occupied = await liveOccupancy(db(), requested.id)
  if (occupied < MAX_OCCUPANCY) return requested
  if (!requested.allows_overflow) throw new HttpError(409, 'room_full')
  const siblings = await db()<AgoraRoom[]>`
    select id, topic_id, instance_index, title, topic_line, icon,
      is_canonical, allows_overflow, read_only, sort_order, locale, closing_at
    from agora_rooms
    where topic_id=${requested.topic_id}
    order by instance_index
  `
  for (const room of siblings) {
    if (await liveOccupancy(db(), room.id) < MAX_OCCUPANCY) return room
  }
  const spawned = await spawnOverflow(requested.topic_id)
  if (!spawned) throw new HttpError(409, 'topic_full')
  return spawned
}

async function spawnOverflow(topicId: string): Promise<AgoraRoom | null> {
  const canonical = await db()<AgoraRoom[]>`
    select id, topic_id, instance_index, title, topic_line, icon,
      is_canonical, allows_overflow, read_only, sort_order, locale, closing_at
    from agora_rooms
    where topic_id=${topicId} and instance_index=1
    limit 1
  `
  if (!canonical[0]?.allows_overflow) return null
  const used = await db()`
    select instance_index from agora_rooms where topic_id=${topicId}
  `
  const taken = new Set((used as { instance_index: number }[]).map((row) => row.instance_index))
  let next = 0
  for (let index = 2; index <= MAX_INSTANCES; index += 1) {
    if (!taken.has(index)) {
      next = index
      break
    }
  }
  if (!next) return null
  const parent = canonical[0]
  const id = `ago1.${topicId}.${next}`
  await db()`
    insert into agora_rooms (
      id, topic_id, instance_index, title, topic_line, icon,
      is_canonical, allows_overflow, read_only, sort_order, locale
    ) values (
      ${id}, ${topicId}, ${next}, ${parent.title}, ${parent.topic_line}, ${parent.icon},
      false, true, false, ${parent.sort_order}, ${parent.locale}
    )
    on conflict (topic_id, instance_index) do nothing
  `
  return await loadRoom(id)
}

async function maybeStartOverflowClose(topicId: string): Promise<void> {
  const rooms = await db()<AgoraRoom[]>`
    select id, topic_id, instance_index, title, topic_line, icon,
      is_canonical, allows_overflow, read_only, sort_order, locale, closing_at
    from agora_rooms
    where topic_id=${topicId} and instance_index >= 2
  `
  const now = new Date()
  for (const room of rooms) {
    const occupied = await liveOccupancy(db(), room.id)
    if (occupied >= OVERFLOW_MIN) {
      if (room.closing_at) {
        await db()`update agora_rooms set closing_at=null where id=${room.id}`
      }
      continue
    }
    if (!room.closing_at) {
      await db()`
        update agora_rooms
        set closing_at=${new Date(now.getTime() + OVERFLOW_CLOSE_MS)}
        where id=${room.id} and closing_at is null
      `
    }
  }
}

async function closeOverflowRooms(sql: Database): Promise<number> {
  const due = await sql<AgoraRoom[]>`
    select id, topic_id, instance_index, title, topic_line, icon,
      is_canonical, allows_overflow, read_only, sort_order, locale, closing_at
    from agora_rooms
    where instance_index >= 2
      and closing_at is not null
      and closing_at <= now()
  `
  let closed = 0
  for (const room of due) {
    const occupied = await liveOccupancy(sql, room.id)
    if (occupied >= OVERFLOW_MIN) {
      await sql`update agora_rooms set closing_at=null where id=${room.id}`
      continue
    }
    const occupants = await sql<{ identity_id: string }[]>`
      select identity_id from agora_presence where room_id=${room.id}
    `
    const target = await lowestOpenSibling(sql, room.topic_id, room.id)
    if (occupants.length && !target) {
      await sql`update agora_rooms set closing_at=null where id=${room.id}`
      continue
    }
    if (target) {
      for (const occupant of occupants) {
        await sql`
          update agora_presence
          set room_id=${target.id}, last_heartbeat_at=${new Date()}, backgrounded_at=null
          where identity_id=${occupant.identity_id}
        `
      }
    }
    await sql`delete from agora_rooms where id=${room.id}`
    closed += 1
  }
  return closed
}

async function lowestOpenSibling(
  sql: Database,
  topicId: string,
  exceptId: string,
): Promise<AgoraRoom | null> {
  const rooms = await sql<AgoraRoom[]>`
    select id, topic_id, instance_index, title, topic_line, icon,
      is_canonical, allows_overflow, read_only, sort_order, locale, closing_at
    from agora_rooms
    where topic_id=${topicId} and id<>${exceptId}
    order by instance_index
  `
  for (const room of rooms) {
    if (await liveOccupancy(sql, room.id) < MAX_OCCUPANCY) return room
  }
  return null
}

async function liveOccupancy(sql: Database, roomId: string): Promise<number> {
  const rows = await sql<{ count: string }[]>`
    select count(*)::text as count
    from agora_presence
    where room_id=${roomId}
      and (
        (backgrounded_at is null and last_heartbeat_at > now() - interval '45 seconds')
        or (backgrounded_at is not null and backgrounded_at > now() - interval '5 minutes')
      )
  `
  return Number(rows[0]?.count ?? 0)
}

async function occupancyMap(): Promise<Map<string, number>> {
  const rows = await db()`
    select room_id, count(*)::text as count
    from agora_presence
    where (
      (backgrounded_at is null and last_heartbeat_at > now() - interval '45 seconds')
      or (backgrounded_at is not null and backgrounded_at > now() - interval '5 minutes')
    )
    group by room_id
  `
  return new Map(
    (rows as { room_id: string; count: string }[]).map((row) => [row.room_id, Number(row.count)]),
  )
}

async function currentPresence(identityId: string): Promise<{ room_id: string } | null> {
  const rows = await db()`
    select room_id from agora_presence
    where identity_id=${identityId}
      and (
        (backgrounded_at is null and last_heartbeat_at > now() - interval '45 seconds')
        or (backgrounded_at is not null and backgrounded_at > now() - interval '5 minutes')
      )
    limit 1
  `
  return (rows[0] as { room_id: string } | undefined) ?? null
}

async function assertInRoom(identityId: string, roomId: string): Promise<void> {
  const presence = await currentPresence(identityId)
  if (presence?.room_id !== roomId) throw new HttpError(409, 'not_in_room')
}

async function reapStalePresence(): Promise<void> {
  await db()`
    delete from agora_presence
    where (
      backgrounded_at is null
      and last_heartbeat_at < now() - interval '45 seconds'
    ) or (
      backgrounded_at is not null
      and backgrounded_at < now() - interval '5 minutes'
    )
  `
}

async function trimMessages(roomId: string): Promise<void> {
  const deleted = await db()`
    delete from agora_messages
    where id in (
      select id from agora_messages
      where room_id=${roomId}
      order by server_sequence desc
      offset ${MESSAGE_CAP}
    )
    returning media_path
  `
  const paths = (deleted as { media_path: string | null }[])
    .map((row) => row.media_path)
    .filter((path): path is string => Boolean(path))
  if (paths.length) {
    await agoraStorage().remove(paths)
  }
}

async function assertNickAvailable(nick: string, identityId: string | undefined): Promise<void> {
  const key = nick.toLowerCase()
  if (key.startsWith('exo00')) throw new HttpError(400, 'invalid_nick')
  const taken = await db()`
    select identity_id from agora_identities where nick_key=${key} limit 1
  `
  if (taken.length && (taken[0] as { identity_id: string }).identity_id !== identityId) {
    throw new HttpError(409, 'nick_taken')
  }
  const tombstone = await db()`
    select identity_id from agora_nick_tombstones
    where nick_key=${key} and expires_at > now()
    limit 1
  `
  if (
    tombstone.length &&
    (tombstone[0] as { identity_id: string }).identity_id !== identityId
  ) {
    throw new HttpError(409, 'nick_taken')
  }
  if (identityId) {
    const alias = await db()`
      select discovery_alias_key
      from chat_key_bundles
      where identity_id=${identityId}
      limit 1
    `
    const aliasKey = (alias[0] as { discovery_alias_key: string | null } | undefined)
      ?.discovery_alias_key
    if (aliasKey && aliasKey.replace(/^@/, '').toLowerCase() === key) {
      throw new HttpError(400, 'nick_matches_alias')
    }
  }
}

async function assertSendAllowed(identity: AgoraIdentity, body: string): Promise<void> {
  const now = Date.now()
  if (now - identity.created_at.getTime() < NEW_NICK_WINDOW_MS && identity.last_send_at) {
    if (now - identity.last_send_at.getTime() < NEW_NICK_GAP_MS) {
      throw new HttpError(429, 'rate_limited')
    }
  }
  if (identity.last_send_at && now - identity.last_send_at.getTime() < DUPLICATE_GAP_MS) {
    const last = await db()`
      select body from agora_messages
      where author_id=${identity.identity_id}
      order by server_sequence desc
      limit 1
    `
    if (last.length && (last[0] as { body: string }).body === body) {
      throw new HttpError(429, 'duplicate')
    }
  }
}

async function blockedSet(ownerId: string): Promise<Set<string>> {
  const rows = await db()`
    select blocked_id from agora_blocks where owner_id=${ownerId}
  `
  return new Set((rows as { blocked_id: string }[]).map((row) => row.blocked_id))
}

async function isBlockedEither(a: string, b: string): Promise<boolean> {
  const rows = await db()`
    select 1 from agora_blocks
    where (owner_id=${a} and blocked_id=${b})
       or (owner_id=${b} and blocked_id=${a})
    limit 1
  `
  return rows.length > 0
}

async function identityMap(ids: string[]): Promise<Map<string, AgoraIdentity>> {
  const unique = [...new Set(ids.filter(Boolean))]
  if (!unique.length) return new Map()
  const rows = await db()<AgoraIdentity[]>`
    select identity_id, nick, nick_key, color, accepted_terms_version, plaza_locale,
      nick_changed_at, last_send_at, created_at
    from agora_identities
    where identity_id = any(${unique})
  `
  return new Map(rows.map((row) => [row.identity_id, row]))
}

async function rateLimit(
  userId: string,
  bucket: string,
  limit: number,
  windowMs: number,
): Promise<void> {
  const window = new Date(Math.floor(Date.now() / windowMs) * windowMs)
  const key = await sha256Hex(`${bucket}:${userId}`)
  const rows = await db()`
    select spectra_private.increment_api_rate_limit(
      ${key}, ${window}, ${new Date(window.getTime() + windowMs)}
    ) as request_count
  `
  const count = Number((rows[0] as { request_count: number } | undefined)?.request_count ?? 0)
  if (count > limit) throw new HttpError(429, 'rate_limited')
}

function normalizeNick(value: unknown): string {
  if (typeof value !== 'string') throw new HttpError(400, 'invalid_nick')
  const nick = value.trim()
  if (!NICK_PATTERN.test(nick)) throw new HttpError(400, 'invalid_nick')
  return nick
}

function asBody(value: unknown): string {
  if (typeof value !== 'string') throw new HttpError(400, 'invalid_request')
  const body = value.trim()
  if (!body || body.length > MAX_BODY) throw new HttpError(400, 'invalid_request')
  if (containsForbiddenLink(body)) throw new HttpError(400, 'links_not_allowed')
  return body
}

function parseOutgoing(body: string, ownNick: string): {
  body: string
  action: boolean
  whisperTo: string | null
} {
  if (body.startsWith('/me ')) {
    const action = body.slice(4).trim()
    if (!action) throw new HttpError(400, 'invalid_request')
    return { body: action, action: true, whisperTo: null }
  }
  const whisper = body.match(/^@([A-Za-z0-9_]{3,24})\s+(.+)$/)
  if (whisper) {
    if (whisper[1]!.toLowerCase() === ownNick.toLowerCase()) {
      throw new HttpError(400, 'invalid_request')
    }
    return { body: whisper[2]!.trim(), action: false, whisperTo: whisper[1]! }
  }
  return { body, action: false, whisperTo: null }
}

function agoraStorage() {
  const config = loadConfig()
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage.from(AGORA_MEDIA_BUCKET)
}

function publicMediaUrl(path: string): string {
  const base = loadConfig().supabaseUrl.replace(/\/+$/, '')
  return `${base}/storage/v1/object/public/${AGORA_MEDIA_BUCKET}/${path}`
}

function trustedAgoraUploadUrl(value: string, objectPath: string): string | null {
  try {
    const url = new URL(value)
    const base = new URL(loadConfig().supabaseUrl)
    const root = base.pathname.replace(/\/+$/, '')
    const expected = `${root}/storage/v1/object/upload/sign/${AGORA_MEDIA_BUCKET}/${objectPath}`
    if (
      url.origin !== base.origin ||
      url.username ||
      url.password ||
      url.hash ||
      url.pathname !== expected ||
      !url.searchParams.has('token')
    ) return null
    return url.toString()
  } catch {
    return null
  }
}

function asMediaType(value: unknown): { ext: string; kind: 'image' | 'voice'; maxBytes: number } {
  if (typeof value !== 'string' || !MEDIA_TYPES[value]) throw new HttpError(400, 'invalid_request')
  return MEDIA_TYPES[value]!
}

function mediaFromPath(path: string): { ext: string; kind: 'image' | 'voice'; maxBytes: number } {
  const ext = path.split('.').pop() ?? ''
  const match = Object.values(MEDIA_TYPES).find((entry) => entry.ext === ext)
  if (!match) throw new HttpError(400, 'invalid_request')
  return match
}

function asMediaSize(
  value: unknown,
  media: { kind: 'image' | 'voice'; maxBytes: number },
): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new HttpError(400, 'invalid_request')
  }
  if ((value as number) > media.maxBytes) {
    throw new HttpError(400, media.kind === 'voice' ? 'voice_too_large' : 'image_too_large')
  }
  return value as number
}

function asVoiceDuration(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > MAX_VOICE_MS) {
    throw new HttpError(400, 'invalid_request')
  }
  return value as number
}

function serializeMedia(row: {
  media_kind: string | null
  media_path: string | null
  media_duration_ms?: number | string | null
  media_waveform?: unknown
}) {
  const mediaKind = row.media_kind === 'image' || row.media_kind === 'voice' ? row.media_kind : null
  const duration = row.media_duration_ms == null ? null : Number(row.media_duration_ms)
  return {
    mediaKind,
    mediaUrl: row.media_path ? publicMediaUrl(row.media_path) : null,
    mediaDurationMs: mediaKind === 'voice' && Number.isFinite(duration) ? duration : null,
    mediaWaveform: mediaKind === 'voice' ? publicWaveform(row.media_waveform) : null,
  }
}

function asWaveform(value: unknown): number[] | null {
  if (value === undefined || value === null) return null
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) {
    throw new HttpError(400, 'invalid_request')
  }
  return value.map((entry) => {
    if (typeof entry !== 'number' || !Number.isFinite(entry)) {
      throw new HttpError(400, 'invalid_request')
    }
    return Math.min(1, Math.max(0.05, entry))
  })
}

function publicWaveform(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length < 1) return null
  const samples = value
    .filter((entry): entry is number => typeof entry === 'number' && Number.isFinite(entry))
    .slice(0, 50)
    .map((entry) => Math.min(1, Math.max(0.05, entry)))
  return samples.length ? samples : null
}

function asMessageId(value: unknown): string {
  if (typeof value !== 'string' || !/^agm1[.][0-9a-f]{32}$/.test(value)) {
    throw new HttpError(400, 'invalid_request')
  }
  return value
}

function asObjectPath(value: unknown, roomId: string, id: string): string {
  if (typeof value !== 'string') throw new HttpError(400, 'invalid_request')
  const allowed = [...new Set(Object.values(MEDIA_TYPES).map((entry) => entry.ext))].join('|')
  const pattern = new RegExp(
    `^${roomId.replaceAll('.', '\\.')}/${id.replaceAll('.', '\\.')}\\.(${allowed})$`,
  )
  if (!pattern.test(value)) throw new HttpError(400, 'invalid_request')
  return value
}

function asImageCaption(value: unknown): string {
  if (value === undefined || value === null || value === '') return ''
  if (typeof value !== 'string') throw new HttpError(400, 'invalid_request')
  const caption = value.trim()
  if (!caption) return ''
  if (caption.length > MAX_BODY) throw new HttpError(400, 'invalid_request')
  if (containsForbiddenLink(caption)) throw new HttpError(400, 'links_not_allowed')
  if (caption.startsWith('/me ') || /^@[A-Za-z0-9_]{3,24}\s+/.test(caption)) {
    throw new HttpError(400, 'invalid_request')
  }
  return caption
}

async function agoraObjectSize(objectPath: string): Promise<number | null> {
  try {
    const response = await fetch(publicMediaUrl(objectPath), {
      signal: AbortSignal.timeout(10_000),
    })
    const contentLength = response.headers.get('content-length')
    await response.body?.cancel().catch(() => undefined)
    if (!response.ok || !contentLength || !/^(?:0|[1-9][0-9]*)$/.test(contentLength)) return null
    const size = Number(contentLength)
    return Number.isSafeInteger(size) ? size : null
  } catch {
    return null
  }
}

function asRoomId(value: unknown): string {
  if (typeof value !== 'string' || !/^ago1[.][a-z][a-z0-9_]{1,24}[.][0-9]{1,2}$/.test(value)) {
    throw new HttpError(400, 'invalid_request')
  }
  return value
}

function asIdentityId(value: unknown): string {
  if (typeof value !== 'string' || value.length < 8 || value.length > 256) {
    throw new HttpError(400, 'invalid_request')
  }
  return value
}

function asInviteId(value: unknown): string {
  if (typeof value !== 'string' || !/^agi1[.][0-9a-f]{32}$/.test(value)) {
    throw new HttpError(400, 'invalid_request')
  }
  return value
}

function asContactInvite(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length > 512 ||
    value.includes('\n') ||
    !/^spectra:contact-card:v1:scc1\.[0-9a-f]{32}:sccap1\.[A-Za-z0-9_-]{43}(?::sccpc1\.[A-Za-z0-9_-]{43})?$/
      .test(
        value,
      )
  ) {
    throw new HttpError(400, 'invalid_request')
  }
  return value
}

function publicIdentity(identity: AgoraIdentity) {
  return {
    identityId: identity.identity_id,
    nick: identity.nick,
    color: identity.color,
    plazaLocale: identity.plaza_locale === 'en' ? 'en' : 'es',
  }
}

function serializeAuthor(identity: AgoraIdentity | undefined) {
  if (!identity) return { identityId: '', nick: 'unknown', color: 'slate' }
  return publicIdentity(identity)
}

function isUnlimitedRoom(room: Pick<AgoraRoom, 'read_only' | 'allows_overflow'>): boolean {
  return room.read_only && !room.allows_overflow
}

function parseSequenceCursor(value: string | null): number | null {
  if (!value) return null
  if (!/^\d{1,16}$/.test(value)) throw new HttpError(400, 'invalid_request')
  const sequence = Number(value)
  if (!Number.isSafeInteger(sequence) || sequence < 0) throw new HttpError(400, 'invalid_request')
  return sequence
}

function parseTimeCursor(value: string | null): Date | null {
  if (!value) return null
  if (value.length > 40) throw new HttpError(400, 'invalid_request')
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new HttpError(400, 'invalid_request')
  if (parsed > Date.now() + 5 * 60_000) throw new HttpError(400, 'invalid_request')
  return new Date(parsed)
}

function serializeRoom(room: AgoraRoom, occupancy: number) {
  const unlimited = isUnlimitedRoom(room)
  const numbered = room.allows_overflow && !room.read_only
  return {
    id: room.id,
    topicId: room.topic_id,
    instanceIndex: room.instance_index,
    topicTitle: room.title,
    title: numbered ? `${room.title} ${room.instance_index}` : room.title,
    topicLine: room.topic_line,
    icon: room.icon,
    canonical: room.is_canonical,
    readOnly: room.read_only,
    occupancy,
    maxOccupancy: unlimited ? 0 : MAX_OCCUPANCY,
    full: unlimited ? false : occupancy >= MAX_OCCUPANCY,
    closingAt: room.closing_at ? new Date(room.closing_at).toISOString() : null,
  }
}

function parsePlazaLocale(value: unknown): 'en' | 'es' {
  if (value === undefined || value === null) return 'es'
  if (value === 'en' || value === 'es') return value
  throw new HttpError(400, 'invalid_request')
}

function hashColor(identityId: string): number {
  let hash = 0
  for (let index = 0; index < identityId.length; index += 1) {
    hash = (hash + identityId.charCodeAt(index) * (index + 3)) % COLORS.length
  }
  return hash
}

function messageId(prefix: 'agm1' | 'agw1' | 'agi1' | 'agr1'): string {
  return `${prefix}.${bytesToHex(crypto.getRandomValues(new Uint8Array(16)))}`
}
