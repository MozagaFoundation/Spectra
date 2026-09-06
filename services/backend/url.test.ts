/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'
import { buildBackendUrl, buildBackendWebSocketUrl, isBackendRouteUrl } from './url'

const edgeBase = 'https://project.supabase.co/functions/v1/spectra-api'

describe('backend URL helpers', () => {
  it('preserves Edge Function base paths for HTTP and WebSocket routes', () => {
    expect(buildBackendUrl(edgeBase, '/v1/auth/wallet/challenge')).toBe(
      `${edgeBase}/v1/auth/wallet/challenge`,
    )
    expect(buildBackendWebSocketUrl(edgeBase)).toBe(
      'wss://project.supabase.co/functions/v1/spectra-api/v1/realtime',
    )
  })

  it('supports local HTTP backends without weakening route validation', () => {
    expect(buildBackendWebSocketUrl('http://127.0.0.1:54321/functions/v1/spectra-api/')).toBe(
      'ws://127.0.0.1:54321/functions/v1/spectra-api/v1/realtime',
    )
    expect(() => buildBackendUrl(edgeBase, '//evil.example/path')).toThrow('Invalid backend route')
  })

  it('accepts only URLs below the configured backend route prefix', () => {
    expect(isBackendRouteUrl(
      `${edgeBase}/v1/objects/download/token`,
      edgeBase,
      '/v1/objects/download/',
    )).toBe(true)
    expect(isBackendRouteUrl(
      'https://project.supabase.co/v1/objects/download/token',
      edgeBase,
      '/v1/objects/download/',
    )).toBe(false)
    expect(isBackendRouteUrl(
      `${edgeBase}/v1/objects/download-redirect/token`,
      edgeBase,
      '/v1/objects/download/',
    )).toBe(false)
    expect(isBackendRouteUrl(
      'https://evil.example/functions/v1/spectra-api/v1/objects/download/token',
      edgeBase,
      '/v1/objects/download/',
    )).toBe(false)
  })
})
