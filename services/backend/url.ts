/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

function normalizedBackendBaseUrl(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, '')
  const parsed = new URL(normalized)
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error('Invalid backend base URL')
  }
  return normalized
}

export function buildBackendUrl(baseUrl: string, route: string): string {
  if (!route.startsWith('/') || route.startsWith('//')) {
    throw new Error('Invalid backend route')
  }
  return `${normalizedBackendBaseUrl(baseUrl)}${route}`
}

export function buildBackendWebSocketUrl(baseUrl: string): string {
  const parsed = new URL(buildBackendUrl(baseUrl, '/v1/realtime'))
  parsed.protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:'
  return parsed.toString()
}

export function isBackendRouteUrl(value: string, baseUrl: string, routePrefix: string): boolean {
  if (!routePrefix.startsWith('/') || !routePrefix.endsWith('/')) return false
  try {
    const candidate = new URL(value)
    const expected = new URL(buildBackendUrl(baseUrl, routePrefix))
    return candidate.protocol === expected.protocol &&
      candidate.origin === expected.origin &&
      !candidate.username &&
      !candidate.password &&
      candidate.pathname.startsWith(expected.pathname)
  } catch {
    return false
  }
}
