import type { Principal } from './auth.ts'
import { db } from './db.ts'
import { bytesToHex, HttpError, isRecord } from './http.ts'

export async function createTicket(
  principal: Principal,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const fields = ['userAddress', 'category', 'description', 'appVersion', 'os', 'deviceModel']
  if (fields.some((field) => typeof body[field] !== 'string')) {
    throw new HttpError(400, 'invalid_support_request')
  }
  const userAddress = (body.userAddress as string).trim()
  const category = (body.category as string).trim()
  const description = (body.description as string).trim()
  const appVersion = (body.appVersion as string).trim()
  const os = (body.os as string).trim()
  const deviceModel = (body.deviceModel as string).trim()
  if (
    !['bug', 'feature_request', 'security_concern', 'other'].includes(category) ||
    !description || description.length > 20_000 ||
    !userAddress || userAddress.length > 128 ||
    !appVersion || appVersion.length > 128 ||
    !os || os.length > 128 ||
    !deviceModel || deviceModel.length > 256
  ) throw new HttpError(400, 'invalid_support_request')
  const owns = await db()`
    select 1 from auth_wallet_bindings
    where user_id=${principal.userId} and lower(wallet_address)=lower(${userAddress})
  `
  if (!owns[0]) throw new HttpError(403, 'forbidden')
  const id = `st1.${bytesToHex(crypto.getRandomValues(new Uint8Array(16)))}`
  const now = new Date()
  const retention = new Date(now)
  retention.setUTCFullYear(retention.getUTCFullYear() + 2)
  await db().begin(async (sql) => {
    await sql`
      insert into support_tickets (
        id, owner_user_id, user_address, category, description, app_version, os, device_model,
        status, retention_expires_at, created_at, updated_at
      ) values (
        ${id}, ${principal.userId}, ${userAddress}, ${category}, ${description}, ${appVersion},
        ${os}, ${deviceModel}, 'open', ${retention}, ${now}, ${now}
      )
    `
    await sql`
      insert into support_access_audit_events (ticket_id, actor_user_id, event_type)
      values (${id}, ${principal.userId}, 'ticket_create')
    `
  })
  return {
    id,
    userAddress,
    category,
    description,
    appVersion,
    os,
    deviceModel,
    status: 'open',
    attachments: [],
    createdAt: now.toISOString(),
    retentionExpiresAt: retention.toISOString(),
  }
}

export async function getTicket(
  principal: Principal,
  ticketId: string,
  staffOnly: boolean,
): Promise<Record<string, unknown>> {
  if (!/^st1\.[0-9a-f]{32}$/.test(ticketId)) {
    throw new HttpError(400, 'invalid_support_request')
  }
  const rows = await db()<{
    id: string
    user_address: string
    category: string
    description: string
    app_version: string
    os: string
    device_model: string
    status: string
    created_at: Date
    retention_expires_at: Date
    is_owner: boolean
    is_staff: boolean
  }[]>`
    select t.id, t.user_address, t.category, t.description, t.app_version, t.os,
      t.device_model, t.status, t.created_at, t.retention_expires_at,
      t.owner_user_id=${principal.userId} as is_owner,
      exists (select 1 from support_staff_roles s where s.user_id=${principal.userId}
        and s.active=true and s.revoked_at is null) as is_staff
    from support_tickets t where t.id=${ticketId}
      and t.status <> 'deleted' and t.retention_expires_at > now()
  `
  const ticket = rows[0]
  if (!ticket) throw new HttpError(404, 'support_ticket_not_found')
  if ((!ticket.is_owner && !ticket.is_staff) || (staffOnly && !ticket.is_staff)) {
    throw new HttpError(403, 'forbidden')
  }
  const attachments = await db()<{
    object_ref: string
  }[]>`
    select a.object_ref from support_ticket_attachments a
    join object_records o on o.object_ref=a.object_ref
    where a.ticket_id=${ticketId} and a.deleted_at is null and o.lifecycle='active'
      and (o.retention_expires_at is null or o.retention_expires_at > now())
    order by a.created_at limit 5
  `
  if (ticket.is_staff) {
    await db()`
      insert into support_access_audit_events (ticket_id, actor_user_id, event_type)
      values (${ticketId}, ${principal.userId}, 'ticket_read')
    `
  }
  return {
    id: ticket.id,
    userAddress: ticket.user_address,
    category: ticket.category,
    description: ticket.description,
    appVersion: ticket.app_version,
    os: ticket.os,
    deviceModel: ticket.device_model,
    status: ticket.status,
    attachments: attachments.map((row) => row.object_ref),
    createdAt: ticket.created_at.toISOString(),
    retentionExpiresAt: ticket.retention_expires_at.toISOString(),
  }
}

export async function addAttachments(
  principal: Principal,
  ticketId: string,
  value: unknown,
): Promise<void> {
  if (
    !/^st1\.[0-9a-f]{32}$/.test(ticketId) ||
    !Array.isArray(value) || value.length < 1 || value.length > 5 ||
    new Set(value).size !== value.length ||
    value.some((ref) =>
      typeof ref !== 'string' || ref.length > 1024 || !ref.startsWith('spectra://objects/')
    )
  ) throw new HttpError(400, 'invalid_support_request')
  await db().begin(async (sql) => {
    const ticket = await sql`
      select 1 from support_tickets where id=${ticketId} and owner_user_id=${principal.userId}
        and status <> 'deleted' and retention_expires_at > now()
      for update
    `
    if (!ticket[0]) throw new HttpError(403, 'forbidden')
    const usage = await sql<{
      count: string
    }[]>`
      select count(*)::text as count from support_ticket_attachments
      where ticket_id=${ticketId} and deleted_at is null
    `
    if (Number(usage[0]?.count ?? 0) + value.length > 5) {
      throw new HttpError(400, 'invalid_support_request')
    }
    for (const ref of value as string[]) {
      const inserted = await sql`
        insert into support_ticket_attachments (ticket_id, object_ref, owner_user_id)
        select ${ticketId}, o.object_ref, ${principal.userId}
        from object_records o where o.object_ref=${ref} and o.owner_user_id=${principal.userId}
          and o.purpose='support_attachment' and o.ticket_id=${ticketId}
          and o.lifecycle='active' and (o.retention_expires_at is null or o.retention_expires_at > now())
        on conflict (ticket_id, object_ref) do nothing returning object_ref
      `
      if (!inserted[0]) throw new HttpError(403, 'forbidden')
      await sql`
        insert into support_access_audit_events (ticket_id, actor_user_id, event_type, object_ref)
        values (${ticketId}, ${principal.userId}, 'attachment_add', ${ref})
      `
    }
  })
}

export async function assignTicket(
  principal: Principal,
  ticketId: string,
  body: Record<string, unknown>,
): Promise<void> {
  if (
    !/^st1\.[0-9a-f]{32}$/.test(ticketId) ||
    !isRecord(body) || typeof body.staffUserId !== 'string' ||
    !body.staffUserId.trim() || body.staffUserId.trim().length > 256
  ) {
    throw new HttpError(400, 'invalid_support_request')
  }
  const staffUserId = body.staffUserId.trim()
  await db().begin(async (sql) => {
    const assigned = await sql`
      insert into support_ticket_assignments (ticket_id, staff_user_id, assigned_by_user_id)
      select t.id, assignee.user_id, ${principal.userId}
      from support_tickets t
      join support_staff_roles actor on actor.user_id=${principal.userId}
        and actor.role='support_lead' and actor.active=true and actor.revoked_at is null
      join support_staff_roles assignee on assignee.user_id=${staffUserId}
        and assignee.active=true and assignee.revoked_at is null
      where t.id=${ticketId} and t.status <> 'deleted' and t.retention_expires_at > now()
      on conflict (ticket_id, staff_user_id) do update set active=true,
        assigned_by_user_id=excluded.assigned_by_user_id, assigned_at=now(), ended_at=null
      returning ticket_id
    `
    if (!assigned[0]) throw new HttpError(403, 'forbidden')
    await sql`
      insert into support_access_audit_events (ticket_id, actor_user_id, event_type)
      values (${ticketId}, ${principal.userId}, 'assign')
    `
  })
}
