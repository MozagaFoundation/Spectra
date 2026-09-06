import { db } from './db.ts'
import {
  clearInvalidExpoPushTokens,
  collectExpoReceiptChecks,
  scheduleExpoPushReceiptInvalidation,
} from './expoPushDelivery.ts'
import { getGenericEncryptedMessagePushCopy } from './genericPushNotificationCopy.ts'
import { isRecord, sha256Hex } from './http.ts'
import { publishWakeup } from './realtime_bus.ts'

const expoPushUrl = 'https://exp.host/--/api/v2/push/send'
const mailboxPattern = /^smbx[12]\.[^\s:]{8,250}$/
const deliveryClasses = new Set(['message', 'control'])
const messageIdPattern = /^msg_[A-Za-z0-9_-]{16,128}$/
const scopePattern = /^nsc1\.[0-9a-f]{32}$/
const eventPattern = /^nev1\.[0-9a-f]{32}$/
const expoTokenPattern = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{8,256}\]$/
const maxAttempts = 5

interface QueueRow {
  msg_id: number | string
  read_ct: number
  message: unknown
}

interface RelayNotification {
  messageId: string
  recipientMailboxToken: string
  deliveryClass: 'message' | 'control'
  serverSequence: number
  pushNotificationEnabled: boolean
}

interface PushRegistration {
  record_id: string
  notification_scope_id: string
  push_token: string
  notification_locale: string | null
  client_platform: string | null
}

interface PendingPushRegistration extends PushRegistration {
  dispatch_key: string
}

interface RelayNotificationResult {
  read: number
  delivered: number
  retried: number
  discarded: number
}

export async function relayPushEventId(
  messageId: string,
  scopeId: string,
): Promise<string> {
  if (!messageIdPattern.test(messageId) || !scopePattern.test(scopeId)) {
    throw new Error('invalid relay push identifiers')
  }
  const eventHash = (await sha256Hex(
    `relay-push-v2\0${messageId}\0${scopeId}`,
  )).slice(0, 32)
  return `nev1.${eventHash}`
}

export async function relayPushDispatchKey(
  eventId: string,
  registrationId: string,
): Promise<string> {
  if (
    !eventPattern.test(eventId) ||
    registrationId.length < 1 ||
    registrationId.length > 256
  ) {
    throw new Error('invalid relay push dispatch')
  }
  return `relay:${
    (await sha256Hex(`relay-dispatch-v1\0${eventId}\0${registrationId}`)).slice(0, 32)
  }`
}

export function classifyExpoPushTickets(
  tickets: unknown[],
  tokens: string[],
): { settledTokens: string[]; invalidTokens: string[]; retryableFailure: boolean } {
  if (tickets.length !== tokens.length) {
    throw new Error('push provider response was incomplete')
  }
  const settledTokens: string[] = []
  const invalidTokens: string[] = []
  let retryableFailure = false
  for (let index = 0; index < tickets.length; index++) {
    const ticket = tickets[index]
    const token = tokens[index]
    if (!token || !isRecord(ticket)) {
      retryableFailure = true
      continue
    }
    if (ticket.status === 'ok') {
      settledTokens.push(token)
      continue
    }
    const errorCode = isRecord(ticket.details) &&
        typeof ticket.details.error === 'string'
      ? ticket.details.error
      : ''
    if (ticket.status === 'error' && errorCode === 'DeviceNotRegistered') {
      settledTokens.push(token)
      invalidTokens.push(token)
      continue
    }
    if (ticket.status === 'error' && errorCode === 'MessageTooBig') {
      settledTokens.push(token)
      continue
    }
    retryableFailure = true
  }
  return { settledTokens, invalidTokens, retryableFailure }
}

function parseClientPlatform(value: unknown): 'ios' | 'android' | null {
  return value === 'ios' || value === 'android' ? value : null
}

export function buildRelayExpoPushPayload(
  pushToken: string,
  notificationScopeId: string,
  notificationEventId: string,
  notificationLocale: unknown,
  clientPlatform?: unknown,
): Record<string, unknown> {
  const copy = getGenericEncryptedMessagePushCopy(notificationLocale)
  const data = {
    notificationScopeId,
    notificationEventId,
  }
  // Android display+data FCM skips onMessageReceived while backgrounded.
  // Data-only + local title/message lets the existing headless task prefetch.
  if (parseClientPlatform(clientPlatform) === 'android') {
    return {
      to: pushToken,
      channelId: 'messages',
      priority: 'high',
      data: {
        ...data,
        title: copy.title,
        message: copy.body,
      },
    }
  }
  const payload: Record<string, unknown> = {
    to: pushToken,
    title: copy.title,
    body: copy.body,
    sound: 'default',
    channelId: 'messages',
    priority: 'high',
    mutableContent: true,
    _mutableContent: true,
    data,
  }
  // 1.2.5+ iOS sends client_platform=ios and includes the NSE. content-available
  // on that alert payload prevents iOS from launching the extension.
  // 1.2.3/1.2.4 have no NSE and no client_platform; keep content-available so a
  // backgrounded JS task can still wake. mutable-content is ignored without an NSE.
  if (parseClientPlatform(clientPlatform) !== 'ios') {
    payload.contentAvailable = true
    payload._contentAvailable = true
  }
  return payload
}

export async function drainRelayNotifications(
  limit = 25,
): Promise<RelayNotificationResult> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('invalid relay notification limit')
  }
  const rows = await db()<QueueRow[]>`
    select msg_id, read_ct, message
    from spectra_private.read_relay_notification_queue(300, ${limit})
  `
  const outcomes = await mapConcurrent(rows, 8, processQueueRow)
  return {
    read: rows.length,
    delivered: outcomes.filter((outcome) => outcome === 'delivered').length,
    retried: outcomes.filter((outcome) => outcome === 'retried').length,
    discarded: outcomes.filter((outcome) => outcome === 'discarded').length,
  }
}

export function scheduleRelayNotificationDrain(): void {
  const runtime = globalThis as typeof globalThis & {
    EdgeRuntime?: { waitUntil(promise: Promise<unknown>): void }
  }
  if (!runtime.EdgeRuntime) return
  runtime.EdgeRuntime.waitUntil(drainRelayNotifications(1).catch(() => undefined))
}

async function processQueueRow(
  row: QueueRow,
): Promise<'delivered' | 'retried' | 'discarded'> {
  const queueMessageId = parsePositiveInteger(row.msg_id)
  try {
    const notification = parseNotification(row.message)
    await publishWakeup({
      topic: `sealed_mailbox:${notification.recipientMailboxToken}`,
      event: 'sealed_message_insert',
      payload: {
        delivery_class: notification.deliveryClass,
        server_sequence: notification.serverSequence,
      },
    })
    if (
      notification.deliveryClass === 'message' &&
      notification.pushNotificationEnabled
    ) {
      await sendPushNotifications(notification)
    }
    const rows = await db()<{ deleted: boolean }[]>`
      select spectra_private.delete_relay_notification(
        ${queueMessageId}::bigint
      ) as deleted
    `
    if (rows[0]?.deleted !== true) throw new Error('relay notification delete failed')
    return 'delivered'
  } catch {
    if (row.read_ct < maxAttempts) return 'retried'
    const rows = await db()<{ deleted: boolean }[]>`
      select spectra_private.delete_relay_notification(
        ${queueMessageId}::bigint
      ) as deleted
    `
    return rows[0]?.deleted === true ? 'discarded' : 'retried'
  }
}

async function sendPushNotifications(
  notification: RelayNotification,
): Promise<void> {
  const rows = await db()<PushRegistration[]>`
    select
      records.record_id,
      records.body->>'notification_scope_id' as notification_scope_id,
      records.body->>'push_token' as push_token,
      records.body->>'notification_locale' as notification_locale,
      records.body->>'client_platform' as client_platform
    from public.chat_mailbox_token_owners owners
    join public.mobile_app_records records
      on records.owner_user_id = owners.user_id
      and records.record_table = 'notification_token_registrations'
      and records.body->>'wallet_address' = owners.wallet_address
    where owners.mailbox_token = ${notification.recipientMailboxToken}
      and records.body->>'notification_protocol_version' = '2'
      and coalesce(records.body->>'push_token', '') <> ''
      and coalesce(records.body->>'notification_scope_id', '') <> ''
    order by records.updated_at desc
    limit 64
  `
  const registrations = rows.filter((row) =>
    typeof row.record_id === 'string' &&
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
  await mapConcurrent([...registrationsByScope], 8, async ([
    scopeId,
    scopedRegistrations,
  ]) => {
    const eventId = await relayPushEventId(
      notification.messageId,
      scopeId,
    )
    const pending = await pendingRegistrations(eventId, scopedRegistrations)
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
        body: JSON.stringify(batch.map((to) =>
          buildRelayExpoPushPayload(
            to,
            scopeId,
            eventId,
            registrationsByToken.get(to)?.[0]?.notification_locale,
            registrationsByToken.get(to)?.[0]?.client_platform,
          )
        )),
      })
      if (!response.ok) throw new Error('push provider request failed')
      const payload: unknown = await response.json()
      if (!isRecord(payload) || !Array.isArray(payload.data)) {
        throw new Error('push provider response was invalid')
      }
      const { settledTokens, invalidTokens, retryableFailure } = classifyExpoPushTickets(
        payload.data,
        batch,
      )
      const invalid = invalidTokens.flatMap((token) => registrationsByToken.get(token) ?? [])
      if (invalid.length > 0) {
        await clearInvalidExpoPushTokens(invalid.map((registration) => registration.record_id))
      }
      const settled = settledTokens.flatMap((token) => registrationsByToken.get(token) ?? [])
      if (settled.length > 0) await recordDispatches(settled)
      scheduleExpoPushReceiptInvalidation(
        collectExpoReceiptChecks(payload.data, batch),
        new Map([...registrationsByToken].map(([token, rows]) => [
          token,
          rows.map((registration) => registration.record_id),
        ])),
      )
      if (retryableFailure) throw new Error('push provider rejected notification')
    }
  })
}

async function pendingRegistrations(
  eventId: string,
  registrations: PushRegistration[],
): Promise<PendingPushRegistration[]> {
  const keyed = await Promise.all(registrations.map(async (registration) => ({
    ...registration,
    dispatch_key: await relayPushDispatchKey(eventId, registration.record_id),
  })))
  const dispatchKeys = keyed.map((registration) => registration.dispatch_key)
  const dispatched = await db()<{ dispatch_key: string }[]>`
    select dispatch_key
    from public.push_notification_dispatches
    where dispatch_key = any(${dispatchKeys}::text[])
  `
  const existingKeys = new Set(dispatched.map((row) => row.dispatch_key))
  return keyed.filter((registration) => !existingKeys.has(registration.dispatch_key))
}

async function recordDispatches(
  registrations: PendingPushRegistration[],
): Promise<void> {
  const dispatchKeys = registrations.map((registration) => registration.dispatch_key)
  await db()`
    insert into public.push_notification_dispatches (
      dispatch_key,
      created_at
    )
    select dispatch_key, now()
    from unnest(${dispatchKeys}::text[]) as pending(dispatch_key)
    on conflict (dispatch_key) do nothing
  `
}

function parseNotification(value: unknown): RelayNotification {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    typeof value.message_id !== 'string' ||
    !messageIdPattern.test(value.message_id) ||
    typeof value.recipient_mailbox_token !== 'string' ||
    !mailboxPattern.test(value.recipient_mailbox_token) ||
    typeof value.delivery_class !== 'string' ||
    !deliveryClasses.has(value.delivery_class) ||
    typeof value.server_sequence !== 'number' ||
    !Number.isSafeInteger(value.server_sequence) ||
    value.server_sequence < 1 ||
    typeof value.push_notification_enabled !== 'boolean'
  ) {
    throw new Error('invalid relay notification')
  }
  return {
    messageId: value.message_id,
    recipientMailboxToken: value.recipient_mailbox_token,
    deliveryClass: value.delivery_class as 'message' | 'control',
    serverSequence: value.server_sequence,
    pushNotificationEnabled: value.push_notification_enabled,
  }
}

function parsePositiveInteger(value: number | string): number {
  const parsed = typeof value === 'string' ? Number(value) : value
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error('invalid relay notification queue id')
  }
  return parsed
}

export async function mapConcurrent<T, R>(
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
