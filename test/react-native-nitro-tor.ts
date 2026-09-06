/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

const okResponse = async () => ({
  body: '',
  headers: '{}',
  status: 200,
})

export const RnTor = {
  getServiceStatus: async () => 'stopped',
  httpDelete: okResponse,
  httpGet: okResponse,
  httpPost: okResponse,
  httpPut: okResponse,
  shutdownService: async () => undefined,
  startTorIfNotRunning: async () => ({
    error: null,
    proxyHost: '127.0.0.1',
    proxyPort: 9050,
    started: true,
  }),
}

