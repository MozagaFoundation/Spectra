import { db } from './db.ts'
import {
  clearInvalidExpoPushTokens,
  collectExpoReceiptChecks,
  scheduleExpoPushReceiptInvalidation,
} from './expoPushDelivery.ts'
import { getGenericWalletActivityPushCopy } from './genericPushNotificationCopy.ts'
import { classifyExpoPushTickets } from './relayNotifications.ts'
import { isRecord } from './http.ts'

const expoPushUrl = 'https://exp.host/--/api/v2/push/send'
const expoTokenPattern = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{8,256}\]$/
const maxAttempts = 5

interface QueueRow {
  msg_id: number | string
  read_ct: number
  message: unknown
}

interface WalletIndexWakeup {
  ownerUserId: string
  ownerWalletAddress: string
}

interface PushRegistration {
  record_id: string
  push_token: string
  notification_locale: string | null
}

export async function drainWalletIndexWakeups(
  limit = 25,
): Promise<Record<string, number>> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('invalid wallet index notification limit')
  }
  const rows = await db()<QueueRow[]>`
    select msg_id, read_ct, message
    from pgmq.read('wallet_index_wakeups', 300, ${limit})
  `
  let delivered = 0
  let retried = 0
  let discarded = 0
  for (const row of rows) {
    const outcome = await processQueueRow(row)
    if (outcome === 'delivered') delivered += 1
    if (outcome === 'retried') retried += 1
    if (outcome === 'discarded') discarded += 1
  }
  return { read: rows.length, delivered, retried, discarded }
}

async function processQueueRow(
  row: QueueRow,
): Promise<'delivered' | 'retried' | 'discarded'> {
  const messageId = parseMessageId(row.msg_id)
  try {
    const wakeup = parseWakeup(row.message)
    if (
      await hasActiveWalletIndexLease(wakeup) &&
      await claimPushWindow(wakeup.ownerUserId)
    ) {
      await sendPushNotification(wakeup)
    }
    await deleteQueueMessage(messageId)
    return 'delivered'
  } catch {
    if (row.read_ct < maxAttempts) return 'retried'
    try {
      await deleteQueueMessage(messageId)
      return 'discarded'
    } catch {
      return 'retried'
    }
  }
}

function parseMessageId(value: number | string): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error('invalid queue message')
  return parsed
}

function parseWakeup(value: unknown): WalletIndexWakeup {
  if (
    !isRecord(value) ||
    Object.keys(value).sort().join(',') !== 'ownerUserId,ownerWalletAddress,version' ||
    value.version !== 1 ||
    typeof value.ownerUserId !== 'string' ||
    value.ownerUserId.length < 8 ||
    value.ownerUserId.length > 256 ||
    typeof value.ownerWalletAddress !== 'string' ||
    !/^EXO00[0-9a-f]{38}$/.test(value.ownerWalletAddress)
  ) {
    throw new Error('invalid wallet index wakeup')
  }
  return {
    ownerUserId: value.ownerUserId,
    ownerWalletAddress: value.ownerWalletAddress,
  }
}

async function hasActiveWalletIndexLease(wakeup: WalletIndexWakeup): Promise<boolean> {
  const rows = await db()<{ exists: boolean }[]>`
    select exists(
      select 1
      from wallet_index_activation_leases
      where owner_user_id=${wakeup.ownerUserId}
        and owner_wallet_address=${wakeup.ownerWalletAddress}
        and expires_at > now()
    ) as exists
  `
  return rows[0]?.exists === true
}

async function claimPushWindow(ownerUserId: string): Promise<boolean> {
  const rows = await db()<{ owner_user_id: string }[]>`
    insert into wallet_index_wakeup_throttles (owner_user_id, last_sent_at)
    values (${ownerUserId}, now())
    on conflict (owner_user_id) do update
    set last_sent_at=excluded.last_sent_at
    where wallet_index_wakeup_throttles.last_sent_at < now() - interval '1 minute'
    returning owner_user_id
  `
  return Boolean(rows[0])
}

async function sendPushNotification(wakeup: WalletIndexWakeup): Promise<void> {
  const rows = await db()<PushRegistration[]>`
    select
      records.record_id,
      records.body->>'push_token' as push_token,
      records.body->>'notification_locale' as notification_locale
    from public.mobile_app_records records
    where records.owner_user_id=${wakeup.ownerUserId}
      and records.record_table='notification_token_registrations'
      and records.body->>'wallet_address'=${wakeup.ownerWalletAddress}
      and records.body->>'notification_protocol_version'='2'
      and coalesce(records.body->>'push_token', '') <> ''
    order by records.updated_at desc
    limit 64
  `
  const registrations = rows.filter((row) =>
    typeof row.record_id === 'string' && expoTokenPattern.test(row.push_token)
  )
  const tokens = [...new Set(registrations.map((row) => row.push_token))]
  const recordIdsByToken = new Map<string, string[]>()
  for (const registration of registrations) {
    const recordIds = recordIdsByToken.get(registration.push_token) ?? []
    recordIds.push(registration.record_id)
    recordIdsByToken.set(registration.push_token, recordIds)
  }
  for (let offset = 0; offset < tokens.length; offset += 100) {
    const batch = tokens.slice(offset, offset + 100)
    const copy = getGenericWalletActivityPushCopy(
      registrations.find((row) => row.push_token === batch[0])?.notification_locale,
    )
    const response = await fetch(expoPushUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify(batch.map((to) => ({
        to,
        title: copy.title,
        body: copy.body,
        sound: 'default',
        data: { type: 'wallet_index_wakeup' },
      }))),
    })
    if (!response.ok) throw new Error('push provider request failed')
    const payload: unknown = await response.json()
    if (!isRecord(payload) || !Array.isArray(payload.data)) {
      throw new Error('push provider response was invalid')
    }
    const { invalidTokens, retryableFailure } = classifyExpoPushTickets(payload.data, batch)
    if (invalidTokens.length > 0) {
      await clearInvalidExpoPushTokens(
        invalidTokens.flatMap((token) => recordIdsByToken.get(token) ?? []),
      )
    }
    scheduleExpoPushReceiptInvalidation(
      collectExpoReceiptChecks(payload.data, batch),
      recordIdsByToken,
    )
    if (retryableFailure) throw new Error('push provider rejected notification')
  }
}

async function deleteQueueMessage(messageId: number): Promise<void> {
  const rows = await db()<{ deleted: boolean }[]>`
    select pgmq.delete('wallet_index_wakeups', ${messageId}::bigint) as deleted
  `
  if (rows[0]?.deleted !== true) throw new Error('wallet index queue deletion failed')
}
