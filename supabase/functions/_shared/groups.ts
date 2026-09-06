import type { Principal } from './auth.ts'
import { type Database, db } from './db.ts'
import {
  bytesToHex,
  databaseErrorCode,
  HttpError,
  optionalString,
  requireInteger,
  requireString,
  sha256Hex,
} from './http.ts'

const MAX_GROUP_MEMBERS = 50
const MAX_GROUP_TITLE_BYTES = 320
const MAX_GROUP_DESCRIPTION_BYTES = 960
const MAX_GROUP_CIPHERTEXT_BYTES = 64 * 1024
const AES_GCM_NONCE_BYTES = 12
const AES_GCM_TAG_BYTES = 16
const ML_DSA_65_SIGNATURE_BYTES = 3309
const MAX_DISAPPEARING_MS = 7 * 24 * 60 * 60 * 1000
const OBJECT_REF_PREFIX = 'spectra://objects/'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/
const GROUP_CONTENT_TYPES = new Set(['text', 'reaction', 'deletion'])

interface TransitionRow {
  transition_id: string
  group_id: string
  action: string
  actor_identity_id: string
  target_identity_ids: string[]
  pre_member_identity_ids: string[]
  post_member_identity_ids: string[]
  roster_hash: string
  from_revision: string
  to_revision: string
  from_epoch: string
  to_epoch: string
  rotator_identity_id: string | null
  status: string
  distribution_id: string | null
  package_recipient_ids: string[] | null
  created_at: Date
  expires_at: Date
  activated_at: Date | null
}

function identifier(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 256) {
    throw new HttpError(400, 'invalid_request')
  }
  return value.trim()
}

function identities(value: unknown): string[] {
  if (!Array.isArray(value)) throw new HttpError(400, 'invalid_request')
  const result = value.map(identifier)
  if (result.length > MAX_GROUP_MEMBERS || new Set(result).size !== result.length) {
    throw new HttpError(400, 'invalid_request')
  }
  return result.sort()
}

function uuid(value: unknown): string {
  const id = identifier(value)
  if (!UUID_PATTERN.test(id)) throw new HttpError(400, 'invalid_request')
  return id
}

async function requireIdentity(
  sql: Database,
  principal: Principal,
  identityId: string,
): Promise<string | null> {
  const rows = await sql<{
    wallet_address: string | null
  }[]>`
    select wallet_address from auth_wallet_bindings
    where user_id=${principal.userId} and identity_id=${identityId}
  `
  if (!rows[0]) throw new HttpError(403, 'identity_binding_required')
  return rows[0].wallet_address
}

async function requireRegisteredIdentity(sql: Database, identityId: string): Promise<void> {
  const rows = await sql`
    select 1 from auth_wallet_bindings
    where identity_id=${identityId}
       or lower(wallet_address)=lower(${identityId})
    limit 1
  `
  if (!rows[0]) throw new HttpError(400, 'invalid_request')
}

async function memberRecordId(groupId: string, identity: string): Promise<string> {
  return `gm2.${(await sha256Hex(`${groupId}\0${identity}`)).slice(0, 32)}`
}

function transition(row: TransitionRow): Record<string, unknown> {
  return {
    transitionId: row.transition_id,
    groupId: row.group_id,
    action: row.action,
    actorIdentityId: row.actor_identity_id,
    targetIdentityIds: row.target_identity_ids,
    preMemberIdentityIds: row.pre_member_identity_ids,
    postMemberIdentityIds: row.post_member_identity_ids,
    rosterHash: row.roster_hash,
    fromRevision: Number(row.from_revision),
    toRevision: Number(row.to_revision),
    fromEpoch: Number(row.from_epoch),
    toEpoch: Number(row.to_epoch),
    ...(row.rotator_identity_id ? { rotatorIdentityId: row.rotator_identity_id } : {}),
    status: row.status,
    ...(row.distribution_id ? { distributionId: row.distribution_id } : {}),
    ...(row.package_recipient_ids ? { packageRecipientIds: row.package_recipient_ids } : {}),
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
    ...(row.activated_at ? { activatedAt: row.activated_at.toISOString() } : {}),
  }
}

export async function beginEpoch(
  principal: Principal,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const groupId = identifier(body.groupId)
  const actorId = identifier(body.actorIdentityId)
  const action = body.action
  if (!['add', 'remove', 'leave'].includes(action as string)) {
    throw new HttpError(400, 'invalid_request')
  }
  let targets = identities(body.targetIdentityIds ?? [])
  if (
    (action === 'add' && targets.length === 0) ||
    (action === 'remove' && (targets.length !== 1 || targets[0] === actorId)) ||
    (action === 'leave' && targets.length !== 0) ||
    !Number.isSafeInteger(body.expectedRevision) || (body.expectedRevision as number) < 1
  ) throw new HttpError(400, 'invalid_request')
  if (action === 'leave') targets = [actorId]
  return await db().begin(async (sql) => {
    await sql`set transaction isolation level serializable`
    await sql`select pg_advisory_xact_lock(hashtextextended(${groupId}, 0))`
    await requireIdentity(sql, principal, actorId)
    const groups = await sql<{
      body: Record<string, unknown>
    }[]>`
      select body from mobile_app_records
      where record_table='chat_groups' and body->>'id'=${groupId} for update
    `
    const group = groups[0]?.body
    if (!group) throw new HttpError(404, 'not_found')
    const revision = integerField(group.revision)
    const epoch = integerField(group.epoch)
    const protocol = integerField(group.protocol_version)
    const maxMembers = integerField(group.max_members)
    if (!revision || !epoch || !maxMembers || maxMembers > MAX_GROUP_MEMBERS || protocol !== 2) {
      throw new HttpError(426, 'upgrade_required')
    }
    if (typeof group._pending_transition_id === 'string') {
      const pending = await sql<{
        status: string
      }[]>`
        select status from group_epoch_transitions
        where transition_id=${group._pending_transition_id}
      `
      if (pending[0]?.status === 'pending') throw new HttpError(409, 'transition_pending')
      delete group._pending_transition_id
      group._rotation_required = false
    } else if (group._rotation_required === true) {
      const pending = await sql`
        select 1 from group_epoch_transitions
        where group_id=${groupId} and status='pending'
        limit 1
      `
      if (pending[0]) throw new HttpError(409, 'transition_pending')
      group._rotation_required = false
    }
    const pending = await sql`
      select 1 from group_epoch_transitions
      where group_id=${groupId} and status='pending'
      limit 1
    `
    if (pending[0]) throw new HttpError(409, 'transition_pending')
    if (revision !== body.expectedRevision) throw new HttpError(409, 'epoch_conflict')
    const members = await loadMembers(sql, groupId, [actorId, ...targets])
    const activeMembers = members.filter((member) => member.active)
    if (
      activeMembers.some((member) =>
        !member.identityId || member.identityId.length > 256 ||
        !['owner', 'admin', 'member'].includes(member.role)
      ) ||
      new Set(members.map((member) => member.identityId)).size !== members.length
    ) throw new HttpError(426, 'upgrade_required')
    const actor = members.find((member) => member.identityId === actorId && member.active)
    if (!actor) throw new HttpError(403, 'forbidden')
    if (action !== 'leave' && !['owner', 'admin'].includes(actor.role)) {
      throw new HttpError(403, 'forbidden')
    }
    const pre = activeMembers.map((member) => member.identityId).sort()
    if (pre.length > MAX_GROUP_MEMBERS) throw new HttpError(426, 'upgrade_required')
    let post = [...pre]
    if (action === 'add') {
      for (const target of targets) {
        if (pre.includes(target)) throw new HttpError(409, 'epoch_conflict')
        await requireRegisteredIdentity(sql, target)
        post.push(target)
      }
      post = [...new Set(post)].sort()
      if (post.length > maxMembers) throw new HttpError(400, 'invalid_request')
    } else {
      const targetMember = members.find((member) =>
        member.identityId === targets[0] && member.active
      )
      if (!targetMember) throw new HttpError(409, 'epoch_conflict')
      if (action === 'remove' && targetMember.role === 'owner' && actor.role !== 'owner') {
        throw new HttpError(403, 'forbidden')
      }
      post = post.filter((identity) => identity !== targets[0]).sort()
    }
    let rotator = post.includes(actorId) ? actorId : ''
    if (!rotator) {
      for (const role of ['owner', 'admin', 'member']) {
        rotator = members.find((member) =>
          member.active && member.role === role && post.includes(member.identityId)
        )?.identityId ?? ''
        if (rotator) {
          break
        }
      }
    }
    const transitionId = `gep1.${bytesToHex(crypto.getRandomValues(new Uint8Array(16)))}`
    const now = new Date()
    const expires = new Date(now.getTime() + 5 * 60 * 1000)
    const status = post.length === 0 ? 'activated' : 'pending'
    const rosterHash = await sha256Hex(JSON.stringify(post))
    await sql`
      insert into group_epoch_transitions (
        transition_id, group_id, action, actor_identity_id, target_identity_ids,
        pre_member_identity_ids, post_member_identity_ids, roster_hash, from_revision,
        to_revision, from_epoch, to_epoch, rotator_identity_id, status, owner_user_id,
        created_at, expires_at, activated_at
      ) values (
        ${transitionId}, ${groupId}, ${action as string}, ${actorId}, ${sql.json(targets)},
        ${sql.json(pre)}, ${sql.json(post)}, ${rosterHash}, ${revision}, ${revision + 1},
        ${epoch}, ${epoch + 1}, ${rotator || null}, ${status}, ${principal.userId},
        ${now}, ${expires}, ${status === 'activated' ? now : null}
      )
    `
    if (status === 'activated') {
      await sql`
        delete from mobile_app_records where
          (record_table='chat_group_messages' and body->>'group_id'=${groupId}) or
          (record_table='chat_group_members' and body->>'group_id'=${groupId}) or
          (record_table='chat_groups' and body->>'id'=${groupId})
      `
    } else {
      group._rotation_required = true
      group._pending_transition_id = transitionId
      group.updated_at = now.toISOString()
      await sql`
        update mobile_app_records set body=${sql.json(group)}, updated_at=${now}
        where record_table='chat_groups' and body->>'id'=${groupId}
      `
    }
    return {
      transitionId,
      groupId,
      action,
      actorIdentityId: actorId,
      targetIdentityIds: targets,
      preMemberIdentityIds: pre,
      postMemberIdentityIds: post,
      rosterHash,
      fromRevision: revision,
      toRevision: revision + 1,
      fromEpoch: epoch,
      toEpoch: epoch + 1,
      ...(rotator ? { rotatorIdentityId: rotator } : {}),
      status,
      createdAt: now.toISOString(),
      expiresAt: expires.toISOString(),
      ...(status === 'activated' ? { activatedAt: now.toISOString() } : {}),
    }
  })
}

export async function activateEpoch(
  principal: Principal,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const transitionId = identifier(body.transitionId)
  const actorId = identifier(body.actorIdentityId)
  const distributionId = identifier(body.distributionId)
  const recipients = identities(body.packageRecipientIds)
  return await db().begin(async (sql) => {
    await sql`set transaction isolation level serializable`
    const rows = await sql<TransitionRow[]>`
      select * from group_epoch_transitions where transition_id=${transitionId} for update
    `
    const current = rows[0]
    if (!current) throw new HttpError(404, 'not_found')
    await sql`select pg_advisory_xact_lock(hashtextextended(${current.group_id}, 0))`
    await requireIdentity(sql, principal, actorId)
    if (current.rotator_identity_id !== actorId) throw new HttpError(403, 'forbidden')
    if (current.status === 'activated') {
      if (current.distribution_id !== distributionId) throw new HttpError(409, 'epoch_conflict')
      return transition(current)
    }
    if (current.status !== 'pending') throw new HttpError(409, 'epoch_conflict')
    const expected = current.post_member_identity_ids.filter((identity) => identity !== actorId)
      .sort()
    if (JSON.stringify(recipients) !== JSON.stringify(expected)) {
      throw new HttpError(400, 'invalid_request')
    }
    const groups = await sql<{
      body: Record<string, unknown>
    }[]>`
      select body from mobile_app_records
      where record_table='chat_groups' and body->>'id'=${current.group_id} for update
    `
    const group = groups[0]?.body
    if (
      !group || group._pending_transition_id !== transitionId ||
      integerField(group.revision) !== Number(current.from_revision) ||
      integerField(group.epoch) !== Number(current.from_epoch)
    ) throw new HttpError(409, 'epoch_conflict')
    const now = new Date()
    await applyMembership(sql, current, now)
    group.revision = Number(current.to_revision)
    group.key_version = Number(current.to_epoch)
    group.epoch = Number(current.to_epoch)
    group.distribution_id = distributionId
    group.member_count = current.post_member_identity_ids.length
    group._rotation_required = false
    delete group._pending_transition_id
    group.updated_at = now.toISOString()
    await sql`
      update mobile_app_records set body=${sql.json(group)}, updated_at=${now}
      where record_table='chat_groups' and body->>'id'=${current.group_id}
    `
    const updated = await sql<TransitionRow[]>`
      update group_epoch_transitions set status='activated',
        distribution_id=${distributionId}, package_recipient_ids=${sql.json(recipients)},
        activated_at=${now}
      where transition_id=${transitionId} and status='pending' returning *
    `
    return transition(updated[0]!)
  })
}

export async function epochStatus(
  principal: Principal,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const transitionId = identifier(body.transitionId)
  const identityId = identifier(body.identityId)
  await requireIdentity(db(), principal, identityId)
  const rows = await db()<TransitionRow[]>`
    select * from group_epoch_transitions where transition_id=${transitionId}
      and (actor_identity_id=${identityId}
        or pre_member_identity_ids ? ${identityId}
        or post_member_identity_ids ? ${identityId})
  `
  if (!rows[0]) throw new HttpError(404, 'not_found')
  return transition(rows[0])
}

export async function pendingEpochs(
  principal: Principal,
  identityValue: unknown,
): Promise<Record<string, unknown>> {
  const identityId = identifier(identityValue)
  await requireIdentity(db(), principal, identityId)
  const rows = await db()<TransitionRow[]>`
    select * from group_epoch_transitions where status='pending'
      and post_member_identity_ids ? ${identityId} order by created_at
    limit 100
  `
  return { transitions: rows.map(transition) }
}

export async function claimEpoch(
  principal: Principal,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const transitionId = identifier(body.transitionId)
  const actorId = identifier(body.actorIdentityId)
  return await db().begin(async (sql) => {
    await sql`set transaction isolation level serializable`
    const rows = await sql<TransitionRow[]>`
      select * from group_epoch_transitions where transition_id=${transitionId} for update
    `
    const current = rows[0]
    if (!current) throw new HttpError(404, 'not_found')
    if (current.status !== 'pending' || Date.now() < current.expires_at.getTime()) {
      throw new HttpError(409, 'epoch_conflict')
    }
    await requireIdentity(sql, principal, actorId)
    if (!current.post_member_identity_ids.includes(actorId)) throw new HttpError(403, 'forbidden')
    const active = await sql`
      select 1 from mobile_app_records where record_table='chat_group_members'
        and body->>'group_id'=${current.group_id}
        and body->>'user_identity_id'=${actorId}
        and coalesce(body->>'is_active','false')='true'
    `
    if (!active[0]) throw new HttpError(403, 'forbidden')
    const expires = new Date(Date.now() + 5 * 60 * 1000)
    const updated = await sql<TransitionRow[]>`
      update group_epoch_transitions
      set rotator_identity_id=${actorId}, expires_at=${expires}
      where transition_id=${transitionId} and status='pending' returning *
    `
    return transition(updated[0]!)
  })
}

function integerField(value: unknown): number {
  return Number.isSafeInteger(value) ? value as number : 0
}

async function loadMembers(sql: Database, groupId: string, relevantIdentities: string[]) {
  const rows = await sql<{
    record_id: string
    body: Record<string, unknown>
  }[]>`
    select record_id, body from mobile_app_records
    where record_table='chat_group_members' and body->>'group_id'=${groupId}
      and (
        coalesce(body->>'is_active','false')='true'
        or body->>'user_identity_id'=any(${relevantIdentities})
      )
    order by body->>'joined_at', body->>'user_identity_id'
    limit 102
  `
  if (rows.length > 101) throw new HttpError(426, 'upgrade_required')
  return rows.map(({ record_id, body }) => {
    const joinedEpoch = integerField(body.joined_epoch ?? 1)
    if (joinedEpoch < 1) throw new HttpError(426, 'upgrade_required')
    return {
      recordId: record_id,
      identityId: String(body.user_identity_id ?? ''),
      role: String(body.role ?? ''),
      active: String(body.is_active ?? 'false') === 'true',
      joinedEpoch,
    }
  })
}

async function applyMembership(sql: Database, current: TransitionRow, now: Date) {
  if (current.action === 'add') {
    for (const identity of current.target_identity_ids) {
      const update = {
        is_active: true,
        role: 'member',
        joined_epoch: Number(current.to_epoch),
        left_epoch: null,
        joined_at: now.toISOString(),
        updated_at: now.toISOString(),
      }
      const updated = await sql`
        update mobile_app_records set body=body || ${sql.json(update)}, updated_at=${now}
        where record_table='chat_group_members' and body->>'group_id'=${current.group_id}
          and body->>'user_identity_id'=${identity} returning record_id
      `
      if (!updated[0]) {
        const recordId = await memberRecordId(current.group_id, identity)
        await sql`
          insert into mobile_app_records
            (record_table, record_id, body, owner_user_id, created_at, updated_at)
          values (
            'chat_group_members', ${recordId},
            ${
          sql.json({
            group_id: current.group_id,
            user_identity_id: identity,
            wallet_address: null,
            display_name: null,
            ...update,
          })
        }, null, ${now}, ${now}
          )
        `
      }
    }
  } else {
    for (const identity of current.target_identity_ids) {
      await sql`
        update mobile_app_records set
          body=body || ${
        sql.json({
          is_active: false,
          left_epoch: Number(current.to_epoch),
          updated_at: now.toISOString(),
        })
      }, updated_at=${now}
        where record_table='chat_group_members' and body->>'group_id'=${current.group_id}
          and body->>'user_identity_id'=${identity}
          and coalesce(body->>'is_active','false')='true'
      `
    }
  }
  if (current.action === 'leave') {
    const leaving = await sql<{
      role: string
    }[]>`
      select body->>'role' as role from mobile_app_records
      where record_table='chat_group_members' and body->>'group_id'=${current.group_id}
        and body->>'user_identity_id'=${current.target_identity_ids[0]}
    `
    if (leaving[0]?.role === 'owner' && current.rotator_identity_id) {
      await sql`
        update mobile_app_records set
          body=body || ${sql.json({ role: 'owner', updated_at: now.toISOString() })},
          updated_at=${now}
        where record_table='chat_group_members' and body->>'group_id'=${current.group_id}
          and body->>'user_identity_id'=${current.rotator_identity_id}
          and coalesce(body->>'is_active','false')='true'
      `
    }
  }
}

function optionalDisappearingMs(value: unknown): number | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  return requireInteger(value, 1, MAX_DISAPPEARING_MS)
}

function objectRef(value: unknown): string {
  const ref = requireString(value, 'invalid_request', 1, 1024)
  if (!ref.startsWith(OBJECT_REF_PREFIX) || ref.includes('\\') || ref.includes('\0')) {
    throw new HttpError(400, 'invalid_request')
  }
  return ref
}

function decodedBase64Length(value: string, maxChars: number): number | null {
  if (value.length === 0 || value.length > maxChars || !BASE64_PATTERN.test(value)) return null
  try {
    const decoded = atob(value)
    return btoa(decoded) === value ? decoded.length : null
  } catch {
    return null
  }
}

function requireBase64Bytes(value: unknown, expected: number): string {
  if (typeof value !== 'string') throw new HttpError(400, 'invalid_request')
  if (decodedBase64Length(value, Math.ceil(expected * 4 / 3) + 4) !== expected) {
    throw new HttpError(400, 'invalid_request')
  }
  return value
}

function requireCiphertext(value: unknown): string {
  if (typeof value !== 'string') throw new HttpError(400, 'invalid_request')
  const maxChars = Math.ceil(MAX_GROUP_CIPHERTEXT_BYTES * 4 / 3) + 4
  const length = decodedBase64Length(value, maxChars)
  if (length === null || length < 1 || length > MAX_GROUP_CIPHERTEXT_BYTES) {
    throw new HttpError(400, 'invalid_request')
  }
  return value
}

function requireSignature(value: unknown): string {
  if (typeof value !== 'string' || value.length > ML_DSA_65_SIGNATURE_BYTES * 2 + 2) {
    throw new HttpError(400, 'invalid_request')
  }
  const hex = value.startsWith('0x') ? value.slice(2) : value
  if (hex.length !== ML_DSA_65_SIGNATURE_BYTES * 2 || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new HttpError(400, 'invalid_request')
  }
  return value
}

function requireProtocolGroup(group: Record<string, unknown>): {
  revision: number
  epoch: number
  distributionId: string
} {
  const revision = integerField(group.revision)
  const epoch = integerField(group.epoch)
  const protocol = integerField(group.protocol_version)
  const distributionId = typeof group.distribution_id === 'string' ? group.distribution_id : ''
  if (!revision || !epoch || protocol !== 2 || !UUID_PATTERN.test(distributionId)) {
    throw new HttpError(426, 'upgrade_required')
  }
  return { revision, epoch, distributionId }
}

function conflictError(error: unknown): never {
  if (databaseErrorCode(error) === '23505') throw new HttpError(409, 'conflict')
  throw error
}

export async function createGroup(
  principal: Principal,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const groupId = uuid(body.groupId)
  const actorId = identifier(body.actorIdentityId)
  const title = requireString(body.title, 'invalid_request', 1, MAX_GROUP_TITLE_BYTES)
  const description = optionalString(body.description, MAX_GROUP_DESCRIPTION_BYTES) ?? null
  const distributionId = uuid(body.distributionId)
  const memberIds = identities(body.memberIdentityIds)
  const disappearingTimerMs = optionalDisappearingMs(body.disappearingTimerMs) ?? null
  if (!memberIds.includes(actorId) || memberIds.length < 2) {
    throw new HttpError(400, 'invalid_request')
  }
  return await db().begin(async (sql) => {
    await sql`set transaction isolation level serializable`
    await sql`select pg_advisory_xact_lock(hashtextextended(${groupId}, 0))`
    const actorWallet = await requireIdentity(sql, principal, actorId)
    for (const identityId of memberIds) {
      if (identityId !== actorId) await requireRegisteredIdentity(sql, identityId)
    }
    const existing = await sql`
      select 1 from mobile_app_records
      where record_table='chat_groups' and body->>'id'=${groupId}
    `
    if (existing[0]) throw new HttpError(409, 'conflict')
    const now = new Date()
    const timestamp = now.toISOString()
    const group = {
      id: groupId,
      title,
      description,
      avatar_url: null,
      created_by_identity_id: actorId,
      created_by_wallet_address: actorWallet,
      revision: 1,
      distribution_id: distributionId,
      key_version: 1,
      epoch: 1,
      protocol_version: 2,
      member_count: memberIds.length,
      max_members: MAX_GROUP_MEMBERS,
      disappearing_timer_ms: disappearingTimerMs,
      disappearing_timer_updated_at: disappearingTimerMs ? timestamp : null,
      disappearing_timer_updated_by: disappearingTimerMs ? actorId : null,
      created_at: timestamp,
      updated_at: timestamp,
    }
    try {
      await sql`
        insert into mobile_app_records
          (record_table, record_id, body, owner_user_id, created_at, updated_at)
        values ('chat_groups', ${groupId}, ${sql.json(group)}, ${principal.userId}, ${now}, ${now})
      `
    } catch (error) {
      conflictError(error)
    }
    for (const identityId of memberIds) {
      const recordId = await memberRecordId(groupId, identityId)
      try {
        await sql`
          insert into mobile_app_records
            (record_table, record_id, body, owner_user_id, created_at, updated_at)
          values (
            'chat_group_members', ${recordId},
            ${
          sql.json({
            group_id: groupId,
            user_identity_id: identityId,
            wallet_address: identityId === actorId ? actorWallet : null,
            display_name: null,
            role: identityId === actorId ? 'owner' : 'member',
            is_active: true,
            joined_epoch: 1,
            left_epoch: null,
            joined_at: timestamp,
            updated_at: timestamp,
          })
        }, null, ${now}, ${now}
          )
        `
      } catch (error) {
        conflictError(error)
      }
    }
    return group
  })
}

export async function updateGroup(
  principal: Principal,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const groupId = uuid(body.groupId)
  const actorId = identifier(body.actorIdentityId)
  const hasAvatar = Object.prototype.hasOwnProperty.call(body, 'avatarUrl')
  const disappearingTimerMs = optionalDisappearingMs(body.disappearingTimerMs)
  if (!hasAvatar && disappearingTimerMs === undefined) {
    throw new HttpError(400, 'invalid_request')
  }
  const avatarUrl = hasAvatar
    ? (body.avatarUrl === null ? null : objectRef(body.avatarUrl))
    : undefined
  return await db().begin(async (sql) => {
    await sql`set transaction isolation level serializable`
    await sql`select pg_advisory_xact_lock(hashtextextended(${groupId}, 0))`
    await requireIdentity(sql, principal, actorId)
    const groups = await sql<{
      body: Record<string, unknown>
    }[]>`
      select body from mobile_app_records
      where record_table='chat_groups' and body->>'id'=${groupId} for update
    `
    const group = groups[0]?.body
    if (!group) throw new HttpError(404, 'not_found')
    requireProtocolGroup(group)
    const membership = await sql<{
      role: string
    }[]>`
      select body->>'role' as role from mobile_app_records
      where record_table='chat_group_members' and body->>'group_id'=${groupId}
        and body->>'user_identity_id'=${actorId}
        and coalesce(body->>'is_active','false')='true'
    `
    if (!membership[0] || !['owner', 'admin'].includes(membership[0].role)) {
      throw new HttpError(403, 'forbidden')
    }
    const now = new Date()
    const timestamp = now.toISOString()
    if (avatarUrl !== undefined) group.avatar_url = avatarUrl
    if (disappearingTimerMs !== undefined) {
      group.disappearing_timer_ms = disappearingTimerMs
      group.disappearing_timer_updated_at = disappearingTimerMs ? timestamp : null
      group.disappearing_timer_updated_by = disappearingTimerMs ? actorId : null
    }
    group.updated_at = timestamp
    await sql`
      update mobile_app_records set body=${sql.json(group)}, updated_at=${now}
      where record_table='chat_groups' and body->>'id'=${groupId}
    `
    return group
  })
}

export async function insertGroupMessage(
  principal: Principal,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const messageId = uuid(body.id)
  const groupId = uuid(body.groupId)
  const senderId = identifier(body.senderIdentityId)
  const distributionId = uuid(body.distributionId)
  const keyVersion = requireInteger(body.keyVersion, 1, Number.MAX_SAFE_INTEGER)
  const groupRevision = requireInteger(body.groupRevision, 1, Number.MAX_SAFE_INTEGER)
  const contentType = requireString(body.contentType, 'invalid_request', 1, 32)
  if (!GROUP_CONTENT_TYPES.has(contentType)) throw new HttpError(400, 'invalid_request')
  const ciphertext = requireCiphertext(body.ciphertext)
  const nonce = requireBase64Bytes(body.nonce, AES_GCM_NONCE_BYTES)
  const tag = requireBase64Bytes(body.tag, AES_GCM_TAG_BYTES)
  const signature = requireSignature(body.signature)
  const disappearingDurationMs = optionalDisappearingMs(body.disappearingDurationMs) ?? null
  const disappearingTrigger =
    body.disappearingTrigger === undefined || body.disappearingTrigger === null
      ? null
      : requireString(body.disappearingTrigger, 'invalid_request', 1, 16)
  if (
    disappearingTrigger && disappearingTrigger !== 'after_send' &&
    disappearingTrigger !== 'after_read'
  ) {
    throw new HttpError(400, 'invalid_request')
  }
  if (contentType !== 'text' && (disappearingDurationMs || disappearingTrigger)) {
    throw new HttpError(400, 'invalid_request')
  }
  return await db().begin(async (sql) => {
    await sql`set transaction isolation level serializable`
    await sql`select pg_advisory_xact_lock(hashtextextended(${groupId}, 0))`
    await requireIdentity(sql, principal, senderId)
    const groups = await sql<{
      body: Record<string, unknown>
    }[]>`
      select body from mobile_app_records
      where record_table='chat_groups' and body->>'id'=${groupId} for update
    `
    const group = groups[0]?.body
    if (!group) throw new HttpError(404, 'not_found')
    const current = requireProtocolGroup(group)
    if (
      current.revision !== groupRevision ||
      current.epoch !== keyVersion ||
      current.distributionId !== distributionId
    ) {
      throw new HttpError(409, 'epoch_conflict')
    }
    const membership = await sql<{
      body: Record<string, unknown>
    }[]>`
      select body from mobile_app_records
      where record_table='chat_group_members' and body->>'group_id'=${groupId}
        and body->>'user_identity_id'=${senderId}
        and coalesce(body->>'is_active','false')='true'
    `
    if (!membership[0]) throw new HttpError(403, 'forbidden')
    const joinedEpoch = integerField(membership[0].body.joined_epoch ?? 1)
    if (joinedEpoch < 1 || keyVersion < joinedEpoch) throw new HttpError(403, 'forbidden')
    const now = new Date()
    const sequence = await sql<{
      seq: string
    }[]>`
      select nextval('public.group_message_server_sequence_seq'::regclass)::text as seq
    `
    const serverSequence = Number(sequence[0]?.seq)
    if (!Number.isSafeInteger(serverSequence) || serverSequence < 1) {
      throw new HttpError(503, 'database_unavailable')
    }
    const expiresAt = disappearingDurationMs && disappearingTrigger === 'after_send'
      ? new Date(now.getTime() + disappearingDurationMs).toISOString()
      : null
    const message = {
      id: messageId,
      group_id: groupId,
      sender_identity_id: senderId,
      distribution_id: distributionId,
      key_version: keyVersion,
      group_revision: groupRevision,
      content_type: contentType,
      ciphertext,
      nonce,
      tag,
      signature,
      created_at: now.toISOString(),
      server_sequence: serverSequence,
      expires_at: expiresAt,
      disappearing_duration_ms: disappearingDurationMs,
      disappearing_trigger: disappearingTrigger,
    }
    try {
      await sql`
        insert into mobile_app_records
          (record_table, record_id, body, owner_user_id, created_at, updated_at)
        values (
          'chat_group_messages', ${messageId}, ${sql.json(message)}, null, ${now}, ${now}
        )
      `
    } catch (error) {
      conflictError(error)
    }
    return message
  })
}
