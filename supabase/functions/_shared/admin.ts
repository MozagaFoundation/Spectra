import { optionalEnv } from './config.ts'
import { checkDatabase, db } from './db.ts'
import { HttpError, isRecord, validHttpsUrl } from './http.ts'

export interface AdminPrincipal {
  id: string
  email?: string
  role?: string
}

export async function authenticateAdmin(request: Request): Promise<AdminPrincipal> {
  const authorization = request.headers.get('authorization') ?? ''
  const match = /^Bearer ([^\s]+)$/i.exec(authorization)
  const accessToken = match?.[1]
  if (!accessToken || accessToken.length > 8192) throw new HttpError(401, 'unauthorized')
  const projectUrl = optionalEnv('SUPABASE_URL')
  const publishable = optionalEnv('SUPABASE_ANON_KEY') || optionalEnv('SUPABASE_PUBLISHABLE_KEY')
  const requiredRole = optionalEnv('SPECTRA_SUPABASE_ADMIN_ROLE')
  if (!projectUrl || !publishable || !requiredRole) {
    throw new HttpError(503, 'admin_auth_not_configured')
  }
  let response: Response
  try {
    const endpoint = validHttpsUrl(
      projectUrl,
      optionalEnv('SPECTRA_ENV') !== 'production',
    )
    endpoint.pathname = `${endpoint.pathname.replace(/\/$/, '')}/auth/v1/user`
    endpoint.search = ''
    response = await fetch(endpoint, {
      headers: { apikey: publishable, authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(5_000),
    })
  } catch (error) {
    if (error instanceof HttpError) throw error
    throw new HttpError(502, 'admin_auth_unavailable')
  }
  if (response.status === 401 || response.status === 403) {
    throw new HttpError(401, 'unauthorized')
  }
  if (!response.ok) throw new HttpError(502, 'admin_auth_unavailable')
  const user = await readAdminUser(response)
  if (
    !isRecord(user) || typeof user.id !== 'string' || !user.id ||
    !isRecord(user.app_metadata)
  ) throw new HttpError(401, 'unauthorized')
  const metadata = user.app_metadata
  const roles = metadata.roles
  const allowed = metadata.role === requiredRole ||
    (Array.isArray(roles) && roles.includes(requiredRole)) ||
    metadata.is_admin === true
  if (!allowed) throw new HttpError(403, 'forbidden')
  return {
    id: user.id,
    ...(typeof user.email === 'string' ? { email: user.email } : {}),
    role: requiredRole,
  }
}

async function readAdminUser(response: Response): Promise<unknown> {
  const reader = response.body?.getReader()
  if (!reader) throw new HttpError(502, 'admin_auth_unavailable')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      size += next.value.byteLength
      if (size > 256 * 1024) {
        await reader.cancel()
        throw new HttpError(502, 'admin_auth_unavailable')
      }
      chunks.push(next.value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch (error) {
    if (error instanceof HttpError) throw error
    throw new HttpError(502, 'admin_auth_unavailable')
  } finally {
    reader.releaseLock()
  }
}

export async function adminStatus(request: Request): Promise<Record<string, unknown>> {
  const user = await authenticateAdmin(request)
  const dependencies: Record<string, string>[] = []
  let status = 'ok'
  try {
    await checkDatabase()
    dependencies.push({ name: 'postgres', status: 'ok' })
  } catch {
    status = 'degraded'
    dependencies.push({ name: 'postgres', status: 'error', error: 'unavailable' })
  }
  return { status, generatedAt: Date.now(), user, dependencies }
}

export async function adminBusinessSnapshot(): Promise<Record<string, unknown>> {
  const [users, bundles] = await Promise.all([
    countHistory('users'),
    countHistory('bundles'),
  ])
  return { users, bundles }
}

async function countHistory(kind: 'users' | 'bundles') {
  const rows = kind === 'users'
    ? await db()<{
      bucket: Date
      count: string
      total: string
    }[]>`
      select date_trunc('day',verified_at) as bucket, count(*)::text as count,
        (select count(*)::text from auth_wallet_bindings) as total
      from auth_wallet_bindings group by bucket order by bucket desc limit 30
    `
    : await db()<{
      bucket: Date
      count: string
      total: string
    }[]>`
      select date_trunc('day',created_at) as bucket, count(*)::text as count,
        (select count(*)::text from chat_key_bundles) as total
      from chat_key_bundles group by bucket order by bucket desc limit 30
    `
  return {
    total: Number(rows[0]?.total ?? 0),
    daily: rows.reverse().map((row) => ({
      start: row.bucket.getTime(),
      count: Number(row.count),
    })),
  }
}
