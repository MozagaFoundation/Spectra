/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

const defaultState = {
  details: null,
  isConnected: true,
  isInternetReachable: true,
  type: 'wifi',
}

const NetInfo = {
  addEventListener: () => ({ remove: () => {} }),
  configure: () => {},
  fetch: async () => defaultState,
  refresh: async () => defaultState,
  useNetInfo: () => defaultState,
}

export const addEventListener = NetInfo.addEventListener
export const configure = NetInfo.configure
export const fetch = NetInfo.fetch
export const refresh = NetInfo.refresh
export const useNetInfo = NetInfo.useNetInfo
export default NetInfo

