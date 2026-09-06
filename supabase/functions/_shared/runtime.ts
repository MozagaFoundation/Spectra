import { optionalEnv } from './config.ts'
import { db } from './db.ts'
import { constantTimeEqual, HttpError, sha256Hex } from './http.ts'

const startedAt = Date.now()
const requestCounters = new Map<string, number>()
const routeDurations = new Map<string, { count: number; max: number; total: number }>()
let durationTotal = 0
let durationCount = 0
const chatMessages = new Map<string, number>()
let chatBundles = 0
const knownRoutes = new Set([
  '/healthz',
  '/readyz',
  '/metrics',
  '/v1/admin/session',
  '/v1/admin/status',
  '/v1/admin/metrics',
  '/v1/auth/wallet/challenge',
  '/v1/auth/wallet/verify',
  '/v1/auth/session/refresh',
  '/v1/auth/session/logout',
  '/v1/account/delete/status',
  '/v1/account/delete',
  '/v1/realtime',
  '/v1/chat/sealed/mailboxes',
  '/v1/chat/sealed/messages',
  '/v1/chat/sealed/messages/delivered',
  '/v1/chat/sealed/messages/read',
  '/v1/chat/sealed/messages/delete',
  '/v1/chat/sealed/messages/vacuum',
  '/v1/chat/sealed/receipts',
  '/v1/chat/bundles',
  '/v1/chat/discovery/vdf-challenges',
  '/v1/chat/discovery/leases',
  '/v1/chat/discovery/lease',
  '/v1/chat/discovery/session-opk',
  '/v1/chat/discovery/aliases',
  '/v1/chat/contact-cards',
  '/v1/wallet-index/activations',
  '/v1/wallet-index/activations/vdf-challenge',
  '/v1/wallet-index/activations/complete',
  '/v1/wallet-index/deliveries',
  '/v1/wallet-index/deliveries/ack',
  '/v1/internal/wallet-index/run',
  '/v1/objects/uploads',
  '/v1/objects/downloads',
  '/v1/objects/delete',
  '/v1/support/tickets',
  '/v1/calls/turn-credentials',
  '/v1/appdata/table',
  '/v1/groups/epochs/begin',
  '/v1/groups/epochs/activate',
  '/v1/groups/epochs/status',
  '/v1/groups/epochs/pending',
  '/v1/groups/epochs/claim',
  '/v1/groups/create',
  '/v1/groups/update',
  '/v1/groups/messages',
  '/v1/rpc-proxy',
  '/v1/market/prices',
  '/v1/contributions/recipients',
  '/v1/agora/session',
  '/v1/agora/join',
  '/v1/agora/nick',
  '/v1/agora/locale',
  '/v1/agora/rooms',
  '/v1/agora/presence/enter',
  '/v1/agora/presence/heartbeat',
  '/v1/agora/presence/activity',
  '/v1/agora/presence/background',
  '/v1/agora/presence/leave',
  '/v1/agora/occupants',
  '/v1/agora/messages',
  '/v1/agora/media/sign',
  '/v1/agora/media/commit',
  '/v1/agora/whispers',
  '/v1/agora/invites',
  '/v1/agora/invites/redeem',
  '/v1/agora/block',
  '/v1/agora/report',
])

export async function applyRateLimit(request: Request, path: string): Promise<void> {
  const configured = optionalEnv('SPECTRA_RATE_LIMIT_PER_MINUTE') || '120'
  const limit = Number(configured)
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new HttpError(503, 'rate_limit_not_configured')
  }
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const client = forwarded || request.headers.get('x-real-ip')?.trim() || 'unknown'
  const key = await sha256Hex(`${request.method} ${routeLabel(path)} ${client}`)
  const window = new Date(Math.floor(Date.now() / 60_000) * 60_000)
  const rows = await db()<{
    request_count: number
  }[]>`
    select spectra_private.increment_api_rate_limit(
      ${key}, ${window}, ${new Date(window.getTime() + 60_000)}
    ) as request_count
  `
  if ((rows[0]?.request_count ?? limit + 1) > limit) throw new HttpError(429, 'rate_limited')
}

export function observeRequest(
  path: string,
  method: string,
  status: number,
  durationMs: number,
): void {
  const route = routeLabel(path)
  const key = `${method}|${route}|${status}`
  const duration = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0
  requestCounters.set(key, (requestCounters.get(key) ?? 0) + 1)
  const durationKey = `${method}|${route}`
  const currentDuration = routeDurations.get(durationKey)
  routeDurations.set(durationKey, {
    count: (currentDuration?.count ?? 0) + 1,
    max: Math.max(currentDuration?.max ?? 0, duration),
    total: (currentDuration?.total ?? 0) + duration,
  })
  durationTotal += duration
  durationCount++
}

export function observeChatMessage(deliveryClass: string): void {
  chatMessages.set(deliveryClass, (chatMessages.get(deliveryClass) ?? 0) + 1)
}

export function observeChatBundle(): void {
  chatBundles++
}

export function prometheusText(): string {
  const lines = [
    '# HELP spectra_http_requests_total Total HTTP requests.',
    '# TYPE spectra_http_requests_total counter',
  ]
  for (const [key, value] of requestCounters) {
    const [method, route, status] = key.split('|')
    lines.push(
      `spectra_http_requests_total{method="${escapeLabel(method!)}",route="${
        escapeLabel(route!)
      }",status="${escapeLabel(status!)}"} ${value}`,
    )
  }
  lines.push(
    '# TYPE spectra_http_request_duration_ms_sum counter',
    `spectra_http_request_duration_ms_sum ${durationTotal}`,
    '# TYPE spectra_http_request_duration_ms_count counter',
    `spectra_http_request_duration_ms_count ${durationCount}`,
    '# HELP spectra_http_route_duration_ms Route-level HTTP request duration.',
    '# TYPE spectra_http_route_duration_ms summary',
    '# TYPE spectra_http_route_request_duration_ms_max gauge',
  )
  for (const [key, duration] of routeDurations) {
    const [method, route] = key.split('|')
    const labels = `method="${escapeLabel(method!)}",route="${escapeLabel(route!)}"`
    lines.push(
      `spectra_http_route_duration_ms_sum{${labels}} ${duration.total}`,
      `spectra_http_route_duration_ms_count{${labels}} ${duration.count}`,
      `spectra_http_route_request_duration_ms_max{${labels}} ${duration.max}`,
    )
  }
  lines.push(
    '# TYPE spectra_process_uptime_seconds gauge',
    `spectra_process_uptime_seconds ${(Date.now() - startedAt) / 1000}`,
  )
  for (const [deliveryClass, value] of chatMessages) {
    lines.push(
      `spectra_chat_messages_sent_total{delivery_class="${escapeLabel(deliveryClass)}"} ${value}`,
    )
  }
  lines.push(`spectra_chat_bundles_published_total ${chatBundles}`, '')
  return lines.join('\n')
}

export function counterSnapshot(): Record<string, unknown> {
  let requestsTotal = 0
  let fiveXXTotal = 0
  let rateLimitedTotal = 0
  for (const [key, value] of requestCounters) {
    const status = key.split('|')[2]!
    requestsTotal += value
    if (status.startsWith('5')) fiveXXTotal += value
    if (status === '429') rateLimitedTotal += value
  }
  return {
    requestsTotal,
    fiveXXTotal,
    rateLimitedTotal,
    durationMillisecondsTotal: durationTotal,
    durationCount,
    routeDurations: Object.fromEntries([...routeDurations].map(([key, duration]) => {
      const [method, route] = key.split('|')
      return [`${method} ${route}`, duration]
    })),
    chatMessagesSent: Object.fromEntries(chatMessages),
    chatBundlesPublished: chatBundles,
    walletOutboundTransactions: {},
    walletOutboundNativeAtomic: {},
  }
}

export function verifyInternalRequest(request: Request): void {
  const secrets = [
    ...new Set([
      optionalEnv('SPECTRA_INTERNAL_SECRET'),
      ...optionalEnv('SPECTRA_INTERNAL_SECRETS').split(',').map((value) => value.trim()),
    ].filter(Boolean)),
  ]
  if (
    secrets.length === 0 || secrets.length > 4 ||
    secrets.some((secret) => secret.length < 32 || secret.length > 512)
  ) throw new HttpError(503, 'internal_auth_not_configured')
  const header = request.headers.get('x-spectra-internal-secret')?.trim()
  if (
    !header || header.length > 512 || !secrets.some((secret) => constantTimeEqual(header, secret))
  ) {
    throw new HttpError(401, 'unauthorized')
  }
}

export function routeLabel(path: string): string {
  if (path.startsWith('/v1/chat/discovery/bundles/')) return '/v1/chat/discovery/bundles/:wallet'
  if (path.startsWith('/v1/chat/contact-cards/')) return '/v1/chat/contact-cards/:id'
  if (path.startsWith('/v1/chat/bundles/')) return '/v1/chat/bundles/:identity'
  if (path.startsWith('/v1/support/tickets/')) return '/v1/support/tickets/:id'
  if (path.startsWith('/v1/support/staff/tickets/')) return '/v1/support/staff/tickets/:id'
  if (path.startsWith('/v1/objects/download/')) return '/v1/objects/download/:token'
  if (path.startsWith('/v1/objects/upload/')) return '/v1/objects/upload/:token'
  if (path.startsWith('/v1/spectre/access/')) return '/v1/spectre/access/:operation'
  if (path.startsWith('/v1/spectre/activation/')) return '/v1/spectre/activation/:operation'
  return knownRoutes.has(path) ? path : '/unmatched'
}

function escapeLabel(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n')
}
