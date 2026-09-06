import { db } from './db.ts'
import { isRecord } from './http.ts'

const expoReceiptUrl = 'https://exp.host/--/api/v2/push/getReceipts'
const receiptDelayMs = 12_000

export async function clearInvalidExpoPushTokens(recordIds: string[]): Promise<void> {
  const ids = [
    ...new Set(
      recordIds.filter((recordId) => recordId.length > 0 && recordId.length <= 256),
    ),
  ]
  if (ids.length === 0) return
  await db()`
    update public.mobile_app_records
    set body = body - 'push_token',
        updated_at = now()
    where record_table = 'notification_token_registrations'
      and record_id = any(${ids}::text[])
  `
}

export function collectExpoReceiptChecks(
  tickets: unknown[],
  tokens: string[],
): Array<{ ticketId: string; token: string }> {
  const checks: Array<{ ticketId: string; token: string }> = []
  for (let index = 0; index < tickets.length; index++) {
    const ticket = tickets[index]
    const token = tokens[index]
    if (
      !token ||
      !isRecord(ticket) ||
      ticket.status !== 'ok' ||
      typeof ticket.id !== 'string' ||
      ticket.id.length < 8 ||
      ticket.id.length > 128
    ) {
      continue
    }
    checks.push({ ticketId: ticket.id, token })
  }
  return checks
}

export function invalidTokensFromExpoReceipts(
  payload: unknown,
  tokensByTicketId: Map<string, string>,
): string[] {
  if (!isRecord(payload) || !isRecord(payload.data)) return []
  const invalidTokens: string[] = []
  for (const [ticketId, receipt] of Object.entries(payload.data)) {
    if (!isRecord(receipt) || receipt.status !== 'error') continue
    const errorCode = isRecord(receipt.details) && typeof receipt.details.error === 'string'
      ? receipt.details.error
      : ''
    if (errorCode !== 'DeviceNotRegistered') continue
    const token = tokensByTicketId.get(ticketId)
    if (token) invalidTokens.push(token)
  }
  return [...new Set(invalidTokens)]
}

export function scheduleExpoPushReceiptInvalidation(
  checks: Array<{ ticketId: string; token: string }>,
  recordIdsByToken: Map<string, string[]>,
): void {
  if (checks.length === 0) return
  scheduleBackground((async () => {
    await delay(receiptDelayMs)
    const ticketIds = [...new Set(checks.map((check) => check.ticketId))]
    const tokensByTicketId = new Map(checks.map((check) => [check.ticketId, check.token]))
    const response = await fetch(expoReceiptUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({ ids: ticketIds }),
    })
    if (!response.ok) return
    const payload: unknown = await response.json()
    const invalidTokens = invalidTokensFromExpoReceipts(payload, tokensByTicketId)
    const recordIds = invalidTokens.flatMap((token) => recordIdsByToken.get(token) ?? [])
    await clearInvalidExpoPushTokens(recordIds)
  })())
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function scheduleBackground(task: Promise<unknown>): void {
  const runtime = globalThis as typeof globalThis & {
    EdgeRuntime?: { waitUntil(promise: Promise<unknown>): void }
  }
  if (runtime.EdgeRuntime) {
    runtime.EdgeRuntime.waitUntil(task.catch(() => undefined))
    return
  }
  void task.catch(() => undefined)
}
