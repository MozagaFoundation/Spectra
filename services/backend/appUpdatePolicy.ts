import {
  getAppVersionPlatform,
  parseAppVersionPolicyResponse,
  type AppUpdatePolicy,
} from './appVersion'
import { backendRequest } from './request'
import { useAppUpdateStore } from '@/store/appUpdateStore'

let refreshPromise: Promise<AppUpdatePolicy | null> | null = null

export function refreshAppUpdatePolicy(): Promise<AppUpdatePolicy | null> {
  if (!getAppVersionPlatform()) return Promise.resolve(null)
  if (!refreshPromise) {
    refreshPromise = loadAppUpdatePolicy().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

async function loadAppUpdatePolicy(): Promise<AppUpdatePolicy | null> {
  useAppUpdateStore.getState().setChecking(true)
  try {
    const response = await backendRequest<unknown>('/v1/client/version-policy', {
      method: 'GET',
    })
    const policy = parseAppVersionPolicyResponse(response)
    if (policy === undefined) {
      throw new Error('Invalid app update policy response')
    }
    useAppUpdateStore.getState().setPolicy(policy)
    return policy
  } finally {
    useAppUpdateStore.getState().setChecking(false)
  }
}
