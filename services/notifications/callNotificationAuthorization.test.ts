/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  scopes: new Map<string, string>(),
}))

vi.mock('./notificationScope', () => ({
  isValidNotificationScopeId: (value: unknown) =>
    typeof value === 'string' && /^nsc1\.[0-9a-f]{32}$/.test(value),
  resolveNotificationScopeWallet: vi.fn(async (scopeId: string) =>
    mockState.scopes.get(scopeId) ?? null
  ),
}))

const authorization = await import('./callNotificationAuthorization')

describe('callNotificationAuthorization', () => {
  beforeEach(() => {
    mockState.scopes.clear()
  })

  it('accepts only a current scope-bound v2 call', async () => {
    const scopeId = `nsc1.${'a'.repeat(32)}`
    mockState.scopes.set(scopeId, 'EXO_ROOT')

    await expect(authorization.isAuthorizedCallNotificationPayload({
      type: 'call',
      notificationProtocolVersion: 2,
      notificationScopeId: scopeId,
    })).resolves.toBe(true)
  })

  it('rejects stale, malformed, and legacy call payloads', async () => {
    const scopeId = `nsc1.${'b'.repeat(32)}`
    await expect(authorization.isAuthorizedCallNotificationPayload({
      type: 'call',
      notificationProtocolVersion: 2,
      notificationScopeId: scopeId,
    })).resolves.toBe(false)
    await expect(authorization.isAuthorizedCallNotificationPayload({
      type: 'call',
      callSessionId: 'legacy',
    })).resolves.toBe(false)
  })
})
