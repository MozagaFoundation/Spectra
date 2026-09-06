import { createClient } from '@supabase/supabase-js'
import type { Principal } from './auth.ts'
import { loadConfig } from './config.ts'
import { db } from './db.ts'
import {
  base64UrlDecode,
  base64UrlEncode,
  bytesToHex,
  HttpError,
  isRecord,
  sha256Hex,
} from './http.ts'

const encoder = new TextEncoder()
const objectPrefix = 'spectra://objects/'
const downloadTokenContext = encoder.encode('Spectra.ObjectDownload.v1')
const signedUploadTtlMs = 2 * 60 * 60 * 1000

interface ObjectClaims {
  action: 'download'
  userId: string
  objectKey: string
  objectRef: string
  purpose: string
  exp: number
}

function storage() {
  const config = loadConfig()
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage.from(config.storageBucket)
}

function purpose(value: unknown): { typed: string; key: string; visibility: string } {
  if (typeof value !== 'string') throw new HttpError(400, 'invalid_object_request')
  switch (value.trim().toLowerCase()) {
    case '':
    case 'attachment':
    case 'attachments':
      return { typed: 'chat_media', key: 'attachments', visibility: 'private' }
    case 'support_attachment':
    case 'support-attachment':
    case 'support-attachments':
      return { typed: 'support_attachment', key: 'support-attachments', visibility: 'private' }
    default:
      throw new HttpError(400, 'invalid_object_request')
  }
}

function parseObjectRef(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith(objectPrefix)) {
    throw new HttpError(400, 'invalid_object_request')
  }
  const key = value.slice(objectPrefix.length)
  const segments = key.split('/')
  if (
    !key || key.startsWith('/') || key.endsWith('/') ||
    segments.some((segment) => !segment || segment === '.' || segment === '..') ||
    !/^[a-z0-9/_.-]+$/.test(key)
  ) throw new HttpError(400, 'invalid_object_request')
  return key
}

export async function signUpload(
  _request: Request,
  principal: Principal,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const config = loadConfig()
  if (
    !Number.isSafeInteger(body.size) || (body.size as number) <= 0 ||
    (body.size as number) > config.objectMaxBytes ||
    body.contentType !== 'application/octet-stream'
  ) throw new HttpError(400, 'invalid_object_request')
  const normalized = purpose(body.purpose ?? '')
  if (normalized.typed === 'chat_media' && !principal.identityId) {
    throw new HttpError(403, 'identity_binding_required')
  }
  if (
    (body.bindingId !== undefined && body.bindingId !== null &&
      typeof body.bindingId !== 'string') ||
    (body.ticketId !== undefined && body.ticketId !== null && typeof body.ticketId !== 'string')
  ) throw new HttpError(400, 'invalid_object_request')
  const bindingId = typeof body.bindingId === 'string' ? body.bindingId.trim() : ''
  const ticketId = typeof body.ticketId === 'string' ? body.ticketId.trim() : ''
  if (normalized.typed === 'support_attachment' && !ticketId) {
    throw new HttpError(400, 'invalid_object_request')
  }
  let retention: Date | null = null
  if (normalized.typed === 'support_attachment') {
    const tickets = await db()<[{ retention_expires_at: Date }?]>`
      select retention_expires_at from support_tickets
      where id=${ticketId} and owner_user_id=${principal.userId}
        and status <> 'deleted' and retention_expires_at > now()
    `
    if (!tickets[0]) throw new HttpError(401, 'unauthorized')
    retention = tickets[0].retention_expires_at
  }
  const userHash = await sha256Hex(principal.userId)
  const objectKey = `users/${userHash}/${normalized.key}/${
    bytesToHex(crypto.getRandomValues(new Uint8Array(16)))
  }.enc`
  const objectRef = `${objectPrefix}${objectKey}`
  await db()`
    insert into object_records (
      object_ref, object_key, owner_user_id, purpose, visibility, chat_media_id,
      ticket_id, lifecycle, declared_size, retention_expires_at, created_at, updated_at
    ) values (
      ${objectRef}, ${objectKey}, ${principal.userId}, ${normalized.typed},
      ${normalized.visibility}, ${bindingId || null}, ${ticketId || null}, 'pending',
      ${body.size as number}, ${retention}, now(), now()
    )
  `
  const signed = await storage().createSignedUploadUrl(objectKey, { upsert: false })
  if (
    signed.error || !signed.data?.signedUrl || signed.data.path !== objectKey ||
    !trustedStorageUrl(signed.data.signedUrl, `/object/upload/sign/${loadConfig().storageBucket}/`)
  ) {
    await db()`delete from object_records where object_ref=${objectRef} and lifecycle='pending'`
    throw new HttpError(503, 'object_storage_failed')
  }
  const expiresAt = new Date(Date.now() + signedUploadTtlMs)
  return {
    objectRef,
    url: signed.data.signedUrl,
    method: 'PUT',
    expiresAt: expiresAt.toISOString(),
  }
}

export async function finalizeUpload(
  principal: Principal,
  value: unknown,
): Promise<{ objectRef: string; lifecycle: 'active' }> {
  const objectKey = parseObjectRef(value)
  const objectRef = `${objectPrefix}${objectKey}`
  const records = await db()<{
    owner_user_id: string
    lifecycle: string
    declared_size: string | number
    purpose: string
  }[]>`
    select owner_user_id, lifecycle, declared_size, purpose
    from object_records where object_ref=${objectRef}
  `
  const record = records[0]
  if (!record || record.owner_user_id !== principal.userId) {
    throw new HttpError(401, 'unauthorized')
  }
  if (record.purpose === 'chat_media' && !principal.identityId) {
    throw new HttpError(403, 'identity_binding_required')
  }
  if (record.lifecycle === 'active') {
    return { objectRef, lifecycle: 'active' }
  }
  if (record.lifecycle !== 'pending') {
    throw new HttpError(409, 'object_upload_conflict')
  }
  if (await storageObjectSize(objectKey) !== Number(record.declared_size)) {
    throw new HttpError(409, 'object_upload_incomplete')
  }
  const activated = await db()`
    update object_records
    set lifecycle='active', uploaded_at=coalesce(uploaded_at,now()), updated_at=now()
    where object_ref=${objectRef} and owner_user_id=${principal.userId}
      and lifecycle='pending'
    returning object_ref
  `
  if (!activated[0]) {
    const current = await db()`
      select 1 from object_records
      where object_ref=${objectRef} and owner_user_id=${principal.userId}
        and lifecycle='active'
    `
    if (!current[0]) throw new HttpError(409, 'object_upload_conflict')
  }
  return { objectRef, lifecycle: 'active' }
}

export async function signDownload(
  request: Request,
  principal: Principal,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const objectKey = parseObjectRef(body.objectRef)
  const objectRef = `${objectPrefix}${objectKey}`
  if (
    body.purpose !== undefined && body.purpose !== null && typeof body.purpose !== 'string'
  ) throw new HttpError(400, 'invalid_object_request')
  const records = await db()<{
    object_ref: string
    object_key: string
    owner_user_id: string
    purpose: string
    visibility: string
    chat_media_id: string | null
    chat_id: string | null
    ticket_id: string | null
    lifecycle: string
    declared_size: string | number
    retention_expires_at: Date | null
  }[]>`
    select object_ref, object_key, owner_user_id, purpose, visibility, chat_media_id, chat_id,
      ticket_id, lifecycle, declared_size, retention_expires_at
    from object_records where object_ref=${objectRef}
  `
  const record = records[0]
  if (!record || record.object_key !== objectKey) throw new HttpError(401, 'unauthorized')
  const expected = typeof body.purpose === 'string' ? body.purpose.trim() : ''
  if (expected && expected !== record.purpose) throw new HttpError(401, 'unauthorized')
  if (record.retention_expires_at && record.retention_expires_at.getTime() <= Date.now()) {
    throw new HttpError(401, 'unauthorized')
  }
  if (record.purpose === 'chat_media' && !principal.identityId) {
    throw new HttpError(403, 'identity_binding_required')
  }
  if (record.lifecycle === 'pending' && record.owner_user_id === principal.userId) {
    if (await storageObjectSize(objectKey) === Number(record.declared_size)) {
      await db()`
        update object_records set lifecycle='active', uploaded_at=coalesce(uploaded_at,now()),
          updated_at=now() where object_ref=${objectRef} and lifecycle='pending'
      `
      record.lifecycle = 'active'
    }
  }
  if (record.lifecycle !== 'active') throw new HttpError(401, 'unauthorized')
  await authorizeDownload(principal.userId, record)
  const config = loadConfig()
  const expiresAt = new Date(Date.now() + Math.min(config.objectTokenTtlSeconds, 300) * 1000)
  const token = await signClaims({
    action: 'download',
    userId: principal.userId,
    objectKey,
    objectRef,
    purpose: record.purpose,
    exp: Math.floor(expiresAt.getTime() / 1000),
  })
  const original = new URL(request.url)
  const routeIndex = original.pathname.lastIndexOf('/v1/')
  if (routeIndex < 0) throw new HttpError(503, 'invalid_configuration')
  const basePath = original.pathname.slice(0, routeIndex)
  const configuredOrigin = new URL(config.supabaseUrl)
  const publicBase = configuredOrigin.protocol === 'https:'
    ? `${configuredOrigin.origin}${
      basePath.startsWith('/functions/v1/') ? basePath : `/functions/v1${basePath}`
    }`
    : `${original.origin}${basePath}`
  return {
    objectRef,
    url: `${publicBase}/v1/objects/download/${token}`,
    method: 'GET',
    expiresAt: expiresAt.toISOString(),
  }
}

async function authorizeDownload(userId: string, record: Record<string, any>): Promise<void> {
  switch (record.purpose) {
    case 'chat_media': {
      if (!record.chat_media_id) throw new HttpError(401, 'unauthorized')
      const rows = await db()`
        select 1 from mobile_app_records media
        where media.record_table='chat_media' and media.record_id=${record.chat_media_id}
          and media.body->>'storage_path'=${record.object_ref}
          and (${record.chat_id ?? ''}='' or media.body->>'conversation_id'=${record.chat_id ?? ''})
          and (
            exists (select 1 from auth_wallet_bindings b where b.user_id=${userId}
              and b.identity_id in (media.body->>'sender_identity_id', media.body->>'recipient_identity_id'))
            or exists (select 1 from mobile_app_records m
              join auth_wallet_bindings b on b.user_id=${userId}
                and b.identity_id=m.body->>'user_identity_id'
              where m.record_table='chat_group_members'
                and m.body->>'group_id'=media.body->>'recipient_identity_id'
                and coalesce(m.body->>'is_active','false')='true')
          )
      `
      if (rows.length === 0) throw new HttpError(401, 'unauthorized')
      return
    }
    case 'support_attachment': {
      const rows = await db()`
        select 1 from support_tickets t
        join support_ticket_attachments a on a.ticket_id=t.id
          and a.object_ref=${record.object_ref} and a.deleted_at is null
        where t.id=${record.ticket_id} and t.status <> 'deleted'
          and t.retention_expires_at > now()
          and (t.owner_user_id=${userId} or exists (
            select 1 from support_staff_roles s
            where s.user_id=${userId} and s.active=true and s.revoked_at is null
          ))
      `
      if (rows.length === 0) throw new HttpError(401, 'unauthorized')
      return
    }
    default:
      throw new HttpError(401, 'unauthorized')
  }
}

export async function downloadRedirect(token: string): Promise<Response> {
  const claims = await verifyClaims(token)
  const records = await db()<{
    object_ref: string
    object_key: string
    owner_user_id: string
    lifecycle: string
    purpose: string
    visibility: string
    chat_media_id: string | null
    chat_id: string | null
    ticket_id: string | null
    retention_expires_at: Date | null
  }[]>`
    select object_ref, object_key, owner_user_id, lifecycle, purpose, visibility,
      chat_media_id, chat_id, ticket_id, retention_expires_at
    from object_records where object_ref=${claims.objectRef} and object_key=${claims.objectKey}
  `
  const record = records[0]
  if (
    !record || record.lifecycle !== 'active' || record.purpose !== claims.purpose ||
    (record.retention_expires_at && record.retention_expires_at.getTime() <= Date.now())
  ) throw new HttpError(401, 'unauthorized')
  const deletion = await db()`
    select 1
    from account_deletion_jobs
    where user_id=${claims.userId}
      and status in ('pending', 'failed')
  `
  if (deletion[0]) throw new HttpError(401, 'unauthorized')
  await authorizeDownload(claims.userId, record)
  const signed = await storage().createSignedUrl(claims.objectKey, 60, { download: false })
  const storageUrl = signed.data?.signedUrl &&
    trustedStorageUrl(
      signed.data.signedUrl,
      `/object/sign/${loadConfig().storageBucket}/`,
    )
  if (signed.error || !storageUrl) throw new HttpError(503, 'object_storage_failed')
  let upstream: Response
  try {
    upstream = await fetch(storageUrl, { signal: AbortSignal.timeout(60_000) })
  } catch {
    throw new HttpError(503, 'object_storage_failed')
  }
  if (!upstream.ok || !upstream.body) {
    await upstream.body?.cancel().catch(() => undefined)
    throw new HttpError(503, 'object_storage_failed')
  }
  const headers = new Headers({
    'content-type': 'application/octet-stream',
    'cache-control': 'no-store',
  })
  const contentLength = upstream.headers.get('content-length')
  if (contentLength && /^\d+$/.test(contentLength)) headers.set('content-length', contentLength)
  return new Response(upstream.body, { status: 200, headers })
}

export async function deleteObject(principal: Principal, value: unknown): Promise<void> {
  const key = parseObjectRef(value)
  const ref = `${objectPrefix}${key}`
  const rows = await db()`
    update object_records set lifecycle='deletion_pending', deleted_at=now(), updated_at=now()
    where object_ref=${ref} and owner_user_id=${principal.userId}
      and lifecycle in ('pending','active')
    returning object_key
  `
  if (rows.length === 1) return
  const alreadyQueued = await db()`
    select 1 from object_records
    where object_ref=${ref} and owner_user_id=${principal.userId}
      and lifecycle in ('deletion_pending','deleted')
  `
  if (!alreadyQueued[0]) throw new HttpError(401, 'unauthorized')
}

export async function purgeUserObjects(userId: string, limit = 1000): Promise<number> {
  let deleted = 0
  while (deleted < limit) {
    const rows = await db()<{
      object_ref: string
    }[]>`
      select object_ref from object_records
      where owner_user_id=${userId} and lifecycle <> 'deleted'
      order by created_at limit ${Math.min(100, limit - deleted)}
    `
    if (rows.length === 0) break
    const keys = rows.map((row) => parseObjectRef(row.object_ref))
    const result = await storage().remove(keys)
    if (result.error) throw new HttpError(503, 'object_storage_failed')
    const refs = rows.map((row) => row.object_ref)
    await db()`
      update object_records set lifecycle='deleted', deleted_at=now(), updated_at=now()
      where object_ref = any(${refs})
        and owner_user_id=${userId}
    `
    deleted += rows.length
  }
  return deleted
}

async function signClaims(claims: ObjectClaims): Promise<string> {
  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: nonce,
      additionalData: downloadTokenContext,
      tagLength: 128,
    },
    await downloadTokenKey(),
    encoder.encode(JSON.stringify(claims)),
  )
  return `od1.${base64UrlEncode(nonce)}.${base64UrlEncode(new Uint8Array(ciphertext))}`
}

async function verifyClaims(token: string): Promise<ObjectClaims> {
  const parts = token.trim().split('.')
  if (token.length > 2048 || parts.length !== 3 || parts[0] !== 'od1') {
    throw new HttpError(401, 'unauthorized')
  }
  let value: unknown
  try {
    const nonce = base64UrlDecode(parts[1]!)
    const ciphertext = base64UrlDecode(parts[2]!)
    if (nonce.byteLength !== 12 || ciphertext.byteLength < 17) throw new Error()
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: new Uint8Array(nonce).buffer,
        additionalData: downloadTokenContext,
        tagLength: 128,
      },
      await downloadTokenKey(),
      new Uint8Array(ciphertext).buffer,
    )
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext))
  } catch {
    throw new HttpError(401, 'unauthorized')
  }
  if (
    !isRecord(value) || value.action !== 'download' ||
    typeof value.userId !== 'string' || !value.userId.trim() || value.userId.length > 256 ||
    typeof value.objectKey !== 'string' || typeof value.objectRef !== 'string' ||
    typeof value.purpose !== 'string' || !Number.isSafeInteger(value.exp) ||
    (value.exp as number) <= Math.floor(Date.now() / 1000) ||
    value.objectRef !== `${objectPrefix}${value.objectKey}`
  ) throw new HttpError(401, 'unauthorized')
  try {
    if (parseObjectRef(value.objectRef) !== value.objectKey) throw new Error()
  } catch {
    throw new HttpError(401, 'unauthorized')
  }
  return value as unknown as ObjectClaims
}

async function downloadTokenKey(): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(loadConfig().objectSigningSecret),
  )
  return await crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

function trustedStorageUrl(value: string, pathPrefix: string): string | null {
  try {
    const url = new URL(value)
    const base = new URL(loadConfig().supabaseUrl)
    const root = base.pathname.replace(/\/+$/, '')
    const expected = `${root}/storage/v1${pathPrefix}`
    if (
      url.origin !== base.origin || url.username || url.password || url.hash ||
      !url.pathname.startsWith(expected) || !url.searchParams.has('token')
    ) return null
    return url.toString()
  } catch {
    return null
  }
}

async function storageObjectSize(objectKey: string): Promise<number | null> {
  const signed = await storage().createSignedUrl(objectKey, 5)
  const storageUrl = signed.data?.signedUrl &&
    trustedStorageUrl(signed.data.signedUrl, `/object/sign/${loadConfig().storageBucket}/`)
  if (signed.error || !storageUrl) return null
  try {
    const response = await fetch(storageUrl, { signal: AbortSignal.timeout(10_000) })
    const contentLength = response.headers.get('content-length')
    await response.body?.cancel().catch(() => undefined)
    if (!response.ok || !contentLength || !/^(?:0|[1-9][0-9]*)$/.test(contentLength)) {
      return null
    }
    const size = Number(contentLength)
    return Number.isSafeInteger(size) ? size : null
  } catch {
    return null
  }
}
