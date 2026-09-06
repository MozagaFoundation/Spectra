import { cleanupPendingAccounts } from './account.ts'
import { drainCallNotifications } from './callNotifications.ts'
import { errorResponse, HttpError, json, readJson } from './http.ts'
import { runMarketWorker } from './market.ts'
import { drainRelayNotifications } from './relayNotifications.ts'
import { verifyInternalRequest } from './runtime.ts'
import { runWalletWorker } from './wallet.ts'
import { drainWalletIndexWakeups } from './walletIndexNotifications.ts'

export async function janitorWorker(request: Request): Promise<Response> {
  return await runAuthorized(request, async (body) => {
    const limit = integer(body.accountLimit, 25, 1, 100)
    const { sweepAgora } = await import('./agora.ts')
    return {
      accountDeletions: await cleanupPendingAccounts(limit),
      agora: await sweepAgora(),
    }
  }, ['accountLimit'])
}

export async function walletWorker(request: Request): Promise<Response> {
  return await runAuthorized(
    request,
    async (body) => await runWalletWorker(body),
    ['chains', 'limit', 'mode', 'runId'],
  )
}

export async function marketWorker(request: Request): Promise<Response> {
  return await runAuthorized(request, async () => await runMarketWorker(), [])
}

export async function notificationWorker(request: Request): Promise<Response> {
  return await runAuthorized(request, async (body) => {
    const limit = integer(body.limit, 25, 1, 100)
    const [relayNotifications, callNotifications, walletIndexWakeups] = await Promise.all([
      drainRelayNotifications(limit),
      drainCallNotifications(limit),
      drainWalletIndexWakeups(limit),
    ])
    return { relayNotifications, callNotifications, walletIndexWakeups }
  }, ['limit'])
}

async function runAuthorized(
  request: Request,
  execute: (body: Record<string, unknown>) => Promise<Record<string, unknown>>,
  fields: string[],
): Promise<Response> {
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'method_not_allowed')
    verifyInternalRequest(request)
    const body = await readJson(request, fields)
    return secure(json(await execute(body)))
  } catch (error) {
    return secure(errorResponse(error))
  }
}

function integer(value: unknown, fallback: number, min: number, max: number): number {
  if (value === undefined) return fallback
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    throw new HttpError(400, 'invalid_request')
  }
  return value as number
}

function secure(response: Response): Response {
  const headers = new Headers(response.headers)
  headers.set('cache-control', 'no-store')
  headers.set('x-content-type-options', 'nosniff')
  return new Response(response.body, { status: response.status, headers })
}
