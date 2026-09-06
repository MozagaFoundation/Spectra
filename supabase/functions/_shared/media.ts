import type { Principal } from './auth.ts'
import { db } from './db.ts'
import { HttpError } from './http.ts'

const objectPrefix = 'spectra://objects/'
const mediaIdPattern = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,127}$/

function parseMediaIdentity(
  mediaIdValue: unknown,
  objectRefValue: unknown,
): { mediaId: string; objectRef: string } {
  if (
    typeof mediaIdValue !== 'string' || !mediaIdPattern.test(mediaIdValue) ||
    typeof objectRefValue !== 'string' || !objectRefValue.startsWith(objectPrefix) ||
    objectRefValue.length > 1024
  ) throw new HttpError(400, 'invalid_request')
  return { mediaId: mediaIdValue, objectRef: objectRefValue }
}

export async function consumeChatMedia(
  principal: Principal,
  mediaIdValue: unknown,
  objectRefValue: unknown,
): Promise<{ consumed: true }> {
  const { mediaId, objectRef } = parseMediaIdentity(mediaIdValue, objectRefValue)
  if (!principal.identityId) throw new HttpError(403, 'identity_binding_required')
  await db().begin(async (sql) => {
    const records = await sql<{ body: Record<string, unknown> }[]>`
      select records.body from mobile_app_records records
      where records.record_table='chat_media' and records.record_id=${mediaId}
        and exists (
          select 1 from auth_wallet_bindings bindings
          where bindings.user_id=${principal.userId}
            and bindings.identity_id in (
              records.body->>'sender_identity_id',
              records.body->>'recipient_identity_id'
            )
        )
      for update
    `
    const body = records[0]?.body
    if (!body) throw new HttpError(401, 'unauthorized')
    const groupMedia = typeof body.conversation_id === 'string' &&
        body.conversation_id.startsWith('group:')
      ? [{}]
      : await sql`
        select 1 from mobile_app_records
        where record_table='chat_groups' and record_id=${String(body.recipient_identity_id ?? '')}
      `
    if (groupMedia[0]) throw new HttpError(409, 'media_not_ephemeral')

    if (body.status === 'deleted' && body.storage_path === null) {
      const deleted = await sql`
        select 1 from object_records
        where object_ref=${objectRef} and chat_media_id=${mediaId}
          and purpose='chat_media' and lifecycle in ('deletion_pending','deleted')
      `
      if (!deleted[0]) throw new HttpError(409, 'media_consume_conflict')
      return
    }
    if (body.status !== 'uploaded' || body.storage_path !== objectRef) {
      throw new HttpError(409, 'media_consume_conflict')
    }

    const queued = await sql`
      update object_records
      set lifecycle='deletion_pending', deleted_at=coalesce(deleted_at,now()), updated_at=now()
      where object_ref=${objectRef} and chat_media_id=${mediaId}
        and purpose='chat_media' and lifecycle='active'
      returning object_ref
    `
    if (!queued[0]) throw new HttpError(409, 'media_consume_conflict')
    const deletedAt = new Date().toISOString()
    await sql`
      update mobile_app_records
      set body=body || jsonb_build_object(
        'status', 'deleted',
        'storage_path', null,
        'deleted_at', ${deletedAt},
        'updated_at', ${deletedAt}
      ), updated_at=now()
      where record_table='chat_media' and record_id=${mediaId}
    `
  })
  return { consumed: true }
}

export async function abandonChatMedia(
  principal: Principal,
  mediaIdValue: unknown,
  objectRefValue: unknown,
  database: ReturnType<typeof db> = db(),
): Promise<{ abandoned: true }> {
  const { mediaId, objectRef } = parseMediaIdentity(mediaIdValue, objectRefValue)
  if (!principal.identityId) throw new HttpError(403, 'identity_binding_required')

  await database.begin(async (sql) => {
    const objects = await sql<{
      lifecycle: string
      chat_media_id: string | null
    }[]>`
      select lifecycle, chat_media_id from object_records
      where object_ref=${objectRef} and owner_user_id=${principal.userId}
        and purpose='chat_media' and chat_media_id=${mediaId}
      for update
    `
    const object = objects[0]
    if (!object) throw new HttpError(401, 'unauthorized')

    const records = await sql<{ body: Record<string, unknown> }[]>`
      select body from mobile_app_records
      where record_table='chat_media' and record_id=${mediaId}
      for update
    `
    const body = records[0]?.body
    if (body) {
      const senderIdentityId = body.sender_identity_id
      if (
        typeof senderIdentityId !== 'string' ||
        senderIdentityId !== principal.identityId
      ) throw new HttpError(401, 'unauthorized')
      const senderBinding = await sql`
        select 1 from auth_wallet_bindings
        where user_id=${principal.userId} and identity_id=${senderIdentityId}
      `
      if (!senderBinding[0]) throw new HttpError(401, 'unauthorized')

      const alreadyTombstoned = (body.status === 'abandoned' || body.status === 'deleted') &&
        body.storage_path === null
      if (
        !alreadyTombstoned &&
        (body.status !== 'uploaded' || body.storage_path !== objectRef)
      ) {
        throw new HttpError(409, 'media_abandon_conflict')
      }
    }

    if (object.lifecycle === 'pending' || object.lifecycle === 'active') {
      await sql`
        update object_records
        set lifecycle='deletion_pending', deleted_at=coalesce(deleted_at,now()), updated_at=now()
        where object_ref=${objectRef} and owner_user_id=${principal.userId}
          and purpose='chat_media' and chat_media_id=${mediaId}
          and lifecycle in ('pending','active')
      `
    } else if (!['deletion_pending', 'deleted'].includes(object.lifecycle)) {
      throw new HttpError(409, 'media_abandon_conflict')
    }

    if (body && body.status !== 'abandoned' && body.status !== 'deleted') {
      const abandonedAt = new Date().toISOString()
      await sql`
        update mobile_app_records
        set body=body || jsonb_build_object(
          'status', 'abandoned',
          'storage_path', null,
          'abandoned_at', ${abandonedAt},
          'updated_at', ${abandonedAt}
        ), updated_at=now()
        where record_table='chat_media' and record_id=${mediaId}
      `
    }
  })
  return { abandoned: true }
}
