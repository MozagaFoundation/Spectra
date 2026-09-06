import type { Principal } from './auth.ts'
import { db } from './db.ts'
import { HttpError, sha256Hex } from './http.ts'
import { purgeUserObjects } from './objects.ts'

export async function deleteAccount(
  principal: Principal,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (body.confirmation !== 'DELETE') throw new HttpError(400, 'invalid_confirmation')
  const token = typeof body.operationToken === 'string' ? body.operationToken : ''
  let tokenHash: string | null = null
  let tokenExpiresAt: Date | null = null
  if (token) {
    if (token.length < 43 || token.length > 256 || !/^[A-Za-z0-9_-]+$/.test(token)) {
      throw new HttpError(400, 'invalid_operation_token')
    }
    tokenHash = await sha256Hex(token)
    tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
  }
  const started = await db()<{
    generation: string
  }[]>`
    select spectra_private.start_account_deletion(
      ${principal.userId}, ${tokenHash}, ${tokenExpiresAt}
    )::text as generation
  `
  const generation = Number(started[0]?.generation)
  if (!Number.isSafeInteger(generation) || generation < 1) {
    throw new HttpError(500, 'account_deletion_failed')
  }
  const state = await db()<{
    status: string
  }[]>`
    select status from account_deletion_jobs
    where user_id=${principal.userId} and generation=${generation}
  `
  const deleted = 0
  if (state[0]?.status === 'completed') {
    return {
      postgresRowsDeleted: deleted,
      relayRowsDeleted: 0,
      objectsDeleted: 0,
    }
  }
  try {
    const cleanup = await cleanupAccount(principal.userId, generation)
    return {
      postgresRowsDeleted: deleted,
      relayRowsDeleted: cleanup.relayRowsDeleted,
      objectsDeleted: cleanup.objectsDeleted,
    }
  } catch {
    return {
      postgresRowsDeleted: deleted,
      relayRowsDeleted: 0,
      objectsDeleted: 0,
      cleanupPending: true,
    }
  }
}

export async function deletionStatus(value: unknown): Promise<Record<string, unknown>> {
  if (
    typeof value !== 'string' || value.length < 43 || value.length > 256 ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) throw new HttpError(404, 'deletion_status_unavailable')
  const hash = await sha256Hex(value)
  const rows = await db()<{
    status: string
    postgres_done: boolean
    objects_done: boolean
    relay_done: boolean
  }[]>`
    select status, postgres_deleted_at is not null as postgres_done,
      objects_deleted_at is not null as objects_done,
      relay_deleted_at is not null as relay_done
    from account_deletion_jobs where operation_token_hash=${hash}
      and operation_token_expires_at > now()
  `
  const row = rows[0]
  if (!row) throw new HttpError(404, 'deletion_status_unavailable')
  if (row.status === 'completed') return { status: 'completed', stage: 'completed' }
  return {
    status: 'pending',
    stage: !row.postgres_done ? 'postgres' : !row.objects_done ? 'objects' : 'relay',
  }
}

export async function cleanupPendingAccounts(limit = 25): Promise<Record<string, number>> {
  const bounded = Math.max(1, Math.min(100, limit))
  const rows = await db()<{
    user_id: string
    generation: string
  }[]>`
    select user_id, generation from account_deletion_jobs
    where status in ('pending','failed') and next_retry_at <= now()
      and (objects_deleted_at is null or relay_deleted_at is null)
    order by updated_at limit ${bounded}
  `
  const summary = {
    jobsChecked: rows.length,
    jobsCompleted: 0,
    jobsFailed: 0,
    objectsDeleted: 0,
    relayRowsDeleted: 0,
  }
  for (const row of rows) {
    try {
      const result = await cleanupAccount(row.user_id, Number(row.generation))
      summary.jobsCompleted++
      summary.objectsDeleted += result.objectsDeleted
      summary.relayRowsDeleted += result.relayRowsDeleted
    } catch {
      summary.jobsFailed++
    }
  }
  return summary
}

async function cleanupAccount(userId: string, generation: number) {
  const claimed = await db()`
    update account_deletion_jobs set attempt_count=attempt_count+1, status='pending',
      next_retry_at=now()+interval '5 minutes', updated_at=now()
    where user_id=${userId} and generation=${generation}
      and status in ('pending','failed') and next_retry_at <= now()
    returning objects_deleted_at, relay_deleted_at
  `
  if (!claimed[0]) throw new Error('cleanup already claimed')
  let objectsDeleted = 0
  let relayRowsDeleted = 0
  try {
    if (!claimed[0].objects_deleted_at) {
      for (let batch = 0; batch < 10; batch++) {
        const deleted = await purgeUserObjects(userId, 1000)
        objectsDeleted += deleted
        if (deleted < 1000) break
      }
      const remaining = await db()`
        select 1 from object_records
        where owner_user_id=${userId} and lifecycle <> 'deleted'
        limit 1
      `
      if (remaining[0]) throw new Error('object cleanup incomplete')
    }
    if (!claimed[0].relay_deleted_at) {
      const purged = await db()<{
        count: string
      }[]>`
        select spectra_private.purge_relay_user(${userId})::text as count
      `
      relayRowsDeleted = Number(purged[0]?.count ?? 0)
      await db()`
        update account_deletion_jobs set relay_deleted_at=coalesce(relay_deleted_at,now()),
          last_error=null, updated_at=now()
        where user_id=${userId} and generation=${generation}
      `
    }
    const completed = await db()<{
      completed: boolean
    }[]>`
      select spectra_private.complete_account_object_cleanup(
        ${userId}, ${generation}
      ) as completed
    `
    if (completed[0]?.completed !== true) throw new Error('account cleanup incomplete')
    return { objectsDeleted, relayRowsDeleted }
  } catch (error) {
    await db()`
      update account_deletion_jobs set status='failed', last_error='cleanup_failed',
        next_retry_at=now()+interval '1 minute', updated_at=now()
      where user_id=${userId} and generation=${generation}
    `
    throw error
  }
}
