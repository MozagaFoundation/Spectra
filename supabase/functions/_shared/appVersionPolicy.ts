import { db } from './db.ts'
import { HttpError, json } from './http.ts'

export const APP_VERSION_HEADER = 'x-spectra-app-version'
export const CLIENT_PLATFORM_HEADER = 'x-spectra-client-platform'
export const APP_UPDATE_REQUIRED_ERROR = 'app_update_required'

const POLICY_CACHE_TTL_MS = 30_000
const VERSION_PATTERN = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/

export type AppVersionPlatform = 'ios' | 'android'

type ParsedVersion = readonly [number, number, number]

export interface AppVersionPolicy {
  platform: AppVersionPlatform
  minimumSupportedVersion: string
  latestVersion: string
  storeUrl: string
  blockUnversionedClients: boolean
}

export interface AppVersionPolicyDecision {
  policy: AppVersionPolicy
  updateAvailable: boolean
  updateRequired: boolean
}

type AppVersionPolicyRow = {
  platform: string
  minimum_supported_version: string
  latest_version: string
  store_url: string
  block_unversioned_clients: boolean
}

let policyCache: {
  expiresAt: number
  policies: ReadonlyMap<AppVersionPlatform, AppVersionPolicy>
} | null = null

export function parseAppVersion(value: string | null | undefined): ParsedVersion | null {
  if (typeof value !== 'string' || value.length > 32) return null
  const match = VERSION_PATTERN.exec(value)
  if (!match) return null

  const parsed: ParsedVersion = [
    Number(match[1]!),
    Number(match[2]!),
    Number(match[3]!),
  ]
  return parsed.every(Number.isSafeInteger) ? parsed : null
}

export function compareAppVersions(left: ParsedVersion, right: ParsedVersion): number {
  for (const index of [0, 1, 2] as const) {
    const difference = left[index] - right[index]
    if (difference !== 0) return difference < 0 ? -1 : 1
  }
  return 0
}

export function evaluateAppVersionPolicy(
  policy: AppVersionPolicy,
  version: ParsedVersion,
): AppVersionPolicyDecision {
  const minimum = parseAppVersion(policy.minimumSupportedVersion)
  const latest = parseAppVersion(policy.latestVersion)
  if (!minimum || !latest || compareAppVersions(minimum, latest) > 0) {
    throw new HttpError(503, 'app_version_policy_invalid')
  }

  const minimumComparison = compareAppVersions(version, minimum)
  const latestComparison = compareAppVersions(version, latest)
  // Equal bounds create an explicit emergency exact-release lock.
  const exactReleaseLock = compareAppVersions(minimum, latest) === 0
  return {
    policy,
    updateRequired: minimumComparison < 0 || (exactReleaseLock && latestComparison !== 0),
    updateAvailable: latestComparison < 0,
  }
}

export async function appVersionPolicyResponse(request: Request): Promise<Response> {
  const { platform, version } = readClientVersionMetadata(request)
  if (!platform || !version) return json({ policy: null })

  const policy = (await loadPolicies()).get(platform)
  if (!policy) return json({ policy: null })
  return json({ policy: serializeDecision(evaluateAppVersionPolicy(policy, version)) })
}

export async function enforceAppVersionPolicy(
  request: Request,
  path: string,
): Promise<Response | null> {
  if (isAppVersionPolicyExemptPath(path)) return null

  const policies = await loadPolicies()
  if (policies.size === 0) return null

  const { platform, version } = readClientVersionMetadata(request)
  const requiredPolicy = evaluateClientVersionPolicy(policies, platform, version)
  if (requiredPolicy === 'unversioned') return appUpdateRequiredResponse()
  return requiredPolicy ? appUpdateRequiredResponse(requiredPolicy) : null
}

export function evaluateClientVersionPolicy(
  policies: ReadonlyMap<AppVersionPlatform, AppVersionPolicy>,
  platform: AppVersionPlatform | null,
  version: ParsedVersion | null,
): AppVersionPolicy | 'unversioned' | null {
  if (platform && version) {
    const policy = policies.get(platform)
    if (!policy) return null
    return evaluateAppVersionPolicy(policy, version).updateRequired ? policy : null
  }

  if (platform) {
    const policy = policies.get(platform)
    return policy?.blockUnversionedClients ? policy : null
  }

  return (
      policies.get('ios')?.blockUnversionedClients === true &&
      policies.get('android')?.blockUnversionedClients === true
    )
    ? 'unversioned'
    : null
}

function readClientVersionMetadata(request: Request): {
  platform: AppVersionPlatform | null
  version: ParsedVersion | null
} {
  const platformValue = request.headers.get(CLIENT_PLATFORM_HEADER)?.trim().toLowerCase()
  const platform = platformValue === 'ios' || platformValue === 'android' ? platformValue : null
  return {
    platform,
    version: parseAppVersion(request.headers.get(APP_VERSION_HEADER)?.trim()),
  }
}

async function loadPolicies(): Promise<ReadonlyMap<AppVersionPlatform, AppVersionPolicy>> {
  if (policyCache && policyCache.expiresAt > Date.now()) return policyCache.policies

  const rows = await db()<AppVersionPolicyRow[]>`
    select
      platform,
      minimum_supported_version,
      latest_version,
      store_url,
      block_unversioned_clients
    from app_version_policies
  `
  const policies = new Map<AppVersionPlatform, AppVersionPolicy>()
  for (const row of rows) {
    const policy = parsePolicyRow(row)
    if (!policy || policies.has(policy.platform)) {
      throw new HttpError(503, 'app_version_policy_invalid')
    }
    validateAppVersionPolicy(policy)
    policies.set(policy.platform, policy)
  }

  policyCache = {
    expiresAt: Date.now() + POLICY_CACHE_TTL_MS,
    policies,
  }
  return policies
}

function parsePolicyRow(row: AppVersionPolicyRow): AppVersionPolicy | null {
  if (row.platform !== 'ios' && row.platform !== 'android') return null
  if (
    typeof row.minimum_supported_version !== 'string' ||
    typeof row.latest_version !== 'string' ||
    typeof row.store_url !== 'string' ||
    typeof row.block_unversioned_clients !== 'boolean'
  ) return null

  return {
    platform: row.platform,
    minimumSupportedVersion: row.minimum_supported_version,
    latestVersion: row.latest_version,
    storeUrl: row.store_url,
    blockUnversionedClients: row.block_unversioned_clients,
  }
}

export function validateAppVersionPolicy(policy: AppVersionPolicy): void {
  const minimum = parseAppVersion(policy.minimumSupportedVersion)
  const latest = parseAppVersion(policy.latestVersion)
  if (
    !minimum || !latest || compareAppVersions(minimum, latest) > 0 ||
    !isSafeStoreUrl(policy.platform, policy.storeUrl)
  ) {
    throw new HttpError(503, 'app_version_policy_invalid')
  }
}

function isSafeStoreUrl(platform: AppVersionPlatform, value: string): boolean {
  if (value.length === 0 || value.length > 2048) return false
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false
    if (platform === 'ios') {
      return url.hostname === 'apps.apple.com' && url.pathname.includes('/app/')
    }
    return (
      url.hostname === 'play.google.com' &&
      url.pathname === '/store/apps/details' &&
      url.searchParams.has('id')
    ) || (
      url.hostname === 'spectraprotocol.org' &&
      url.pathname === '/' &&
      !url.search &&
      !url.hash
    )
  } catch {
    return false
  }
}

function serializeDecision(decision: AppVersionPolicyDecision): Record<string, unknown> {
  return {
    platform: decision.policy.platform,
    minimumSupportedVersion: decision.policy.minimumSupportedVersion,
    latestVersion: decision.policy.latestVersion,
    storeUrl: decision.policy.storeUrl,
    updateAvailable: decision.updateAvailable,
    updateRequired: decision.updateRequired,
  }
}

function appUpdateRequiredResponse(policy?: AppVersionPolicy): Response {
  return json({
    error: APP_UPDATE_REQUIRED_ERROR,
    ...(policy
      ? serializeDecision({
        policy,
        updateAvailable: true,
        updateRequired: true,
      })
      : {}),
  }, 426)
}

export function isAppVersionPolicyExemptPath(path: string): boolean {
  return (
    path === '/healthz' ||
    path === '/readyz' ||
    path === '/metrics' ||
    path === '/v1/client/version-policy' ||
    path === '/v1/auth/session/logout' ||
    path === '/v1/account/delete' ||
    path === '/v1/account/delete/status' ||
    path.startsWith('/v1/admin/') ||
    path.startsWith('/v1/internal/') ||
    path.startsWith('/v1/objects/upload/') ||
    path.startsWith('/v1/objects/download/')
  )
}
