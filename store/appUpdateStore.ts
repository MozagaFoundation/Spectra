import { create } from 'zustand'

import type { AppUpdatePolicy } from '@/services/backend/appVersion'

interface AppUpdateState {
  policy: AppUpdatePolicy | null
  dismissedLatestVersion: string | null
  checking: boolean
  setPolicy: (policy: AppUpdatePolicy | null) => void
  requireUpdate: (policy: AppUpdatePolicy) => void
  setChecking: (checking: boolean) => void
  dismissAvailableUpdate: () => void
}

export const useAppUpdateStore = create<AppUpdateState>((set, get) => ({
  policy: null,
  dismissedLatestVersion: null,
  checking: false,
  setPolicy: (policy) => set((state) => ({
    policy,
    dismissedLatestVersion: state.policy?.latestVersion === policy?.latestVersion
      ? state.dismissedLatestVersion
      : null,
  })),
  requireUpdate: (policy) => set({
    policy: {
      ...policy,
      updateAvailable: true,
      updateRequired: true,
    },
    dismissedLatestVersion: null,
  }),
  setChecking: (checking) => set({ checking }),
  dismissAvailableUpdate: () => {
    const policy = get().policy
    if (!policy || policy.updateRequired || !policy.updateAvailable) return
    set({ dismissedLatestVersion: policy.latestVersion })
  },
}))
