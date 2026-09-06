import { db } from './db.ts'
import {
  clearInvalidExpoPushTokens,
  collectExpoReceiptChecks,
  scheduleExpoPushReceiptInvalidation,
} from './expoPushDelivery.ts'
import { isRecord } from './http.ts'
import {
  buildCallExpoPushPayload,
  callPushDispatchKey,
  callPushEventId,
  type CallPushNotification,
  classifyExpoPushTickets,
} from './callPushPayload.ts'

const expoPushUrl = 'https://exp.host/--/api/v2/push/send'
const maxAttempts = 5
const identityPattern = /^[^\s:\0]{1,256}$/
const scopePattern = /^nsc1\.[0-9a-f]{32}$/
const eventKeyPattern = /^call_event:[0-9a-f]{64}$/
const expoTokenPattern = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{8,256}\]$/

interface QueueRow {
  msg_id: number | string
  read_ct: number
  message: unknown
}

type CallNotification = CallPushNotification

interface PushRegistration {
  record_id: string
  owner_user_id: string
  notification_scope_id: string
  push_token: string
}

interface PendingPushRegistration extends PushRegistration {
  dispatchKey: string
}

export interface CallNotificationDrainResult {
  sessionsExpired: number
  read: number
  delivered: number
  retried: number
  discarded: number
}

export async function drainCallNotifications(
  limit = 25,
): Promise<CallNotificationDrainResult> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('invalid call notification limit')
  }
  const expiredRows = await db()<{ expired: number | string }[]>`
    select spectra_private.expire_stale_call_sessions(${Math.min(limit * 2, 100)}) as expired
  `
  const rows = await db()<QueueRow[]>`
    select msg_id, read_ct, message
    from spectra_private.read_call_notification_queue(300, ${limit})
  `
  const outcomes = await mapConcurrent(rows, 4, processQueueRow)
  return {
    sessionsExpired: Number(expiredRows[0]?.expired ?? 0),
    read: rows.length,
    delivered: outcomes.filter((outcome) => outcome === 'delivered').length,
    retried: outcomes.filter((outcome) => outcome === 'retried').length,
    discarded: outcomes.filter((outcome) => outcome === 'discarded').length,
  }
}

async function processQueueRow(
  row: QueueRow,
): Promise<'delivered' | 'retried' | 'discarded'> {
  const queueMessageId = parsePositiveInteger(row.msg_id)
  let notification: CallNotification | null = null
  try {
    notification = parseNotification(row.message)
    if (notification.expiresAt <= Date.now()) {
      await deleteQueueMessage(queueMessageId)
      return 'discarded'
    }
    await sendPushNotifications(notification)
    await deleteQueueMessage(queueMessageId)
    return 'delivered'
  } catch {
    if (row.read_ct < maxAttempts) return 'retried'
    const deleted = await deleteQueueMessage(queueMessageId).catch(() => false)
    if (deleted && notification) {
      await releaseEvent(notification.eventKey).catch(() => undefined)
    }
    return deleted ? 'discarded' : 'retried'
  }
}

async function sendPushNotifications(notification: CallNotification): Promise<void> {
  const rows = await db()<PushRegistration[]>`
    select
      records.record_id,
      records.owner_user_id,
      records.body->>'notification_scope_id' as notification_scope_id,
      records.body->>'push_token' as push_token
    from public.auth_wallet_bindings bindings
    join public.mobile_app_records records
      on records.owner_user_id = bindings.user_id
      and records.record_table = 'notification_token_registrations'
      and lower(records.body->>'wallet_address') = lower(bindings.wallet_address)
    where bindings.identity_id = ${notification.recipientIdentityId}
      and records.body->>'notification_protocol_version' = '2'
      and coalesce(records.body->>'push_token', '') <> ''
      and coalesce(records.body->>'notification_scope_id', '') <> ''
      and not exists (
        select 1
        from public.mobile_spectre_addresses spectre
        where lower(spectre.wallet_address) = lower(bindings.wallet_address)
          and spectre.expires_at > now()
      )
    order by records.updated_at desc
    limit 64
  `
  const registrations = rows.filter((row) =>
    typeof row.record_id === 'string' &&
    typeof row.owner_user_id === 'string' &&
    scopePattern.test(row.notification_scope_id) &&
    expoTokenPattern.test(row.push_token)
  )
  if (registrations.length === 0) return

  const registrationsByScope = new Map<string, PushRegistration[]>()
  for (const registration of registrations) {
    const scoped = registrationsByScope.get(registration.notification_scope_id) ?? []
    scoped.push(registration)
    registrationsByScope.set(registration.notification_scope_id, scoped)
  }
  await mapConcurrent([...registrationsByScope], 4, async ([
    scopeId,
    scopedRegistrations,
  ]) => {
    const eventId = await callPushEventId(notification.eventKey, scopeId)
    const pending = await pendingRegistrations(notification.eventKey, scopedRegistrations)
    if (pending.length === 0) return

    const registrationsByToken = new Map<string, PendingPushRegistration[]>()
    for (const registration of pending) {
      const tokenRegistrations = registrationsByToken.get(registration.push_token) ?? []
      tokenRegistrations.push(registration)
      registrationsByToken.set(registration.push_token, tokenRegistrations)
    }
    const uniqueTokens = [...registrationsByToken.keys()]
    for (let offset = 0; offset < uniqueTokens.length; offset += 100) {
      const batch = uniqueTokens.slice(offset, offset + 100)
      const response = await fetch(expoPushUrl, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify(
          batch.map((token) => buildCallExpoPushPayload(token, scopeId, eventId, notification)),
        ),
      })
      if (!response.ok) throw new Error('call push provider request failed')
      const payload: unknown = await response.json()
      if (!isRecord(payload) || !Array.isArray(payload.data)) {
        throw new Error('call push provider response was invalid')
      }
      const result = classifyExpoPushTickets(payload.data, batch)
      const settled = result.settledTokens.flatMap((token) => registrationsByToken.get(token) ?? [])
      if (settled.length > 0) await recordDispatches(settled)
      const invalid = result.invalidTokens.flatMap((token) => registrationsByToken.get(token) ?? [])
      if (invalid.length > 0) {
        await clearInvalidExpoPushTokens(invalid.map((registration) => registration.record_id))
      }
      scheduleExpoPushReceiptInvalidation(
        collectExpoReceiptChecks(payload.data, batch),
        new Map([...registrationsByToken].map(([token, rows]) => [
          token,
          rows.map((registration) => registration.record_id),
        ])),
      )
      if (result.retryableFailure) throw new Error('call push provider rejected notification')
    }
  })
}

async function pendingRegistrations(
  eventKey: string,
  registrations: PushRegistration[],
): Promise<PendingPushRegistration[]> {
  const keyed = await Promise.all(registrations.map(async (registration) => ({
    ...registration,
    dispatchKey: await callPushDispatchKey(eventKey, registration.record_id),
  })))
  const dispatchKeys = keyed.map((registration) => registration.dispatchKey)
  const dispatched = await db()<{ dispatch_key: string }[]>`
    select dispatch_key
    from public.push_notification_dispatches
    where dispatch_key = any(${dispatchKeys}::text[])
  `
  const existingKeys = new Set(dispatched.map((row) => row.dispatch_key))
  return keyed.filter((registration) => !existingKeys.has(registration.dispatchKey))
}

async function recordDispatches(registrations: PendingPushRegistration[]): Promise<void> {
  const dispatchKeys = registrations.map((registration) => registration.dispatchKey)
  await db()`
    insert into public.push_notification_dispatches (dispatch_key, created_at)
    select dispatch_key, now()
    from unnest(${dispatchKeys}::text[]) as pending(dispatch_key)
    on conflict (dispatch_key) do nothing
  `
}

async function deleteQueueMessage(queueMessageId: number): Promise<boolean> {
  const rows = await db()<{ deleted: boolean }[]>`
    select spectra_private.delete_call_notification(${queueMessageId}::bigint) as deleted
  `
  return rows[0]?.deleted === true
}

async function releaseEvent(eventKey: string): Promise<void> {
  await db()`
    select spectra_private.release_call_notification_event(${eventKey})
  `
}

function parseNotification(value: unknown): CallNotification {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    typeof value.event_key !== 'string' ||
    !eventKeyPattern.test(value.event_key) ||
    (value.type !== 'call' && value.type !== 'call_end') ||
    typeof value.call_session_id !== 'string' ||
    !identityPattern.test(value.call_session_id) ||
    typeof value.caller_identity_id !== 'string' ||
    !identityPattern.test(value.caller_identity_id) ||
    typeof value.callee_identity_id !== 'string' ||
    !identityPattern.test(value.callee_identity_id) ||
    value.caller_identity_id === value.callee_identity_id ||
    typeof value.recipient_identity_id !== 'string' ||
    !identityPattern.test(value.recipient_identity_id) ||
    ![value.caller_identity_id, value.callee_identity_id].includes(value.recipient_identity_id) ||
    (value.call_type !== 'voice' && value.call_type !== 'video') ||
    typeof value.expires_at !== 'string'
  ) {
    throw new Error('invalid call notification')
  }
  const expiresAt = Date.parse(value.expires_at)
  if (
    !Number.isFinite(expiresAt) ||
    expiresAt > Date.now() + 60 * 60 * 1000 ||
    expiresAt < Date.now() - 24 * 60 * 60 * 1000
  ) {
    throw new Error('invalid call notification expiry')
  }
  return {
    eventKey: value.event_key,
    type: value.type,
    callSessionId: value.call_session_id,
    callerIdentityId: value.caller_identity_id,
    calleeIdentityId: value.callee_identity_id,
    recipientIdentityId: value.recipient_identity_id,
    callType: value.call_type,
    expiresAt,
  }
}

async function mapConcurrent<T, R>(
  values: readonly T[],
  concurrency: number,
  transform: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length)
  let nextIndex = 0
  let firstError: unknown
  let failed = false
  await Promise.all(Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => {
      while (nextIndex < values.length) {
        const index = nextIndex++
        try {
          results[index] = await transform(values[index] as T)
        } catch (error) {
          if (!failed) firstError = error
          failed = true
        }
      }
    },
  ))
  if (failed) throw firstError
  return results
}

function parsePositiveInteger(value: number | string): number {
  const parsed = typeof value === 'string' ? Number(value) : value
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error('invalid call notification queue id')
  }
  return parsed
}
