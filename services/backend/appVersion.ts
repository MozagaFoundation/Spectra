import { Platform } from 'react-native'

import { getRuntimeAppVersion } from '@/lib/appMetadata'
import { isSafeExternalUrl } from '@/lib/externalLinks'

export const APP_VERSION_HEADER = 'X-Spectra-App-Version'
export const CLIENT_PLATFORM_HEADER = 'X-Spectra-Client-Platform'
export const APP_UPDATE_REQUIRED_ERROR = 'app_update_required'

const VERSION_PATTERN = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/

export type AppVersionPlatform = 'ios' | 'android'

export interface AppUpdatePolicy {
  platform: AppVersionPlatform
  minimumSupportedVersion: string
  latestVersion: string
  storeUrl: string
  updateAvailable: boolean
  updateRequired: boolean
}

export function getAppVersionHeaders(): Record<string, string> {
  const platform = getAppVersionPlatform()
  if (!platform) return {}

  const version = getRuntimeAppVersion().trim()
  return {
    [CLIENT_PLATFORM_HEADER]: platform,
    ...(isValidAppVersion(version) ? { [APP_VERSION_HEADER]: version } : {}),
  }
}

export function getAppVersionPlatform(): AppVersionPlatform | null {
  return Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : null
}

export function isValidAppVersion(value: string): boolean {
  return value.length <= 32 && VERSION_PATTERN.test(value)
}

export function parseAppUpdatePolicy(value: unknown): AppUpdatePolicy | null {
  if (!isRecord(value)) return null
  if (
    (value.platform !== 'ios' && value.platform !== 'android')
    || typeof value.minimumSupportedVersion !== 'string'
    || typeof value.latestVersion !== 'string'
    || typeof value.storeUrl !== 'string'
    || typeof value.updateAvailable !== 'boolean'
    || typeof value.updateRequired !== 'boolean'
  ) return null

  if (
    !isValidAppVersion(value.minimumSupportedVersion)
    || !isValidAppVersion(value.latestVersion)
    || !isSafeAppStoreUrl(value.platform, value.storeUrl)
  ) return null

  return {
    platform: value.platform,
    minimumSupportedVersion: value.minimumSupportedVersion,
    latestVersion: value.latestVersion,
    storeUrl: value.storeUrl,
    updateAvailable: value.updateAvailable,
    updateRequired: value.updateRequired,
  }
}

export function parseAppUpdateRequiredPolicy(value: unknown): AppUpdatePolicy | null {
  if (!isRecord(value) || value.error !== APP_UPDATE_REQUIRED_ERROR) return null
  const policy = parseAppUpdatePolicy(value)
  return policy?.updateRequired ? policy : null
}

export function parseAppVersionPolicyResponse(value: unknown): AppUpdatePolicy | null | undefined {
  if (!isRecord(value) || !('policy' in value)) return undefined
  if (value.policy === null) return null
  return parseAppUpdatePolicy(value.policy) ?? undefined
}

function isSafeAppStoreUrl(platform: AppVersionPlatform, value: string): boolean {
  if (!isSafeExternalUrl(value)) return false
  try {
    const url = new URL(value)
    if (url.port) return false
    if (platform === 'ios') {
      return url.hostname === 'apps.apple.com' && url.pathname.includes('/app/')
    }
    return (
      url.hostname === 'play.google.com'
      && url.pathname === '/store/apps/details'
      && url.searchParams.has('id')
    ) || (
      url.hostname === 'spectraprotocol.org'
      && url.pathname === '/'
      && !url.search
      && !url.hash
    )
  } catch {
    return false
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
