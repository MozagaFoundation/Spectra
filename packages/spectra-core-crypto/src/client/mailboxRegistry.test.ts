/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it, vi } from 'vitest'
import {
  ensureInboundMailboxScopes,
  listRealtimeMailboxTokens,
  MAILBOX_SCOPE_REGISTRATION_REFRESH_MS,
  MAILBOX_SCOPE_REGISTRATION_VERSION,
} from './mailboxRegistry'

const scopeSecretA = Buffer.from(new Uint8Array(32).fill(1)).toString('base64')
const scopeSecretB = Buffer.from(new Uint8Array(32).fill(2)).toString('base64')

const identity = {
  id: 'identity-local',
  identityPublicKey: 'identity-key',
  mlkemPublicKey: 'mlkem-key',
  dilithiumPublicKey: 'dilithium-key',
  createdAt: 1,
  isAnonymous: true,
}

describe('mailboxRegistry', () => {
  it('deduplicates local scoped and server-registered realtime mailboxes', async () => {
    const serverToken = 'smbx2.server-token'
    const storage = {
      getMailboxScopes: vi.fn(async () => [
        {
          localIdentityId: identity.id,
          remoteIdentityId: 'remote',
          scopeId: 'scope-1',
          scopeSecret: scopeSecretA,
          epoch: 1,
          status: 'active' as const,
          createdAt: 1,
          updatedAt: 1,
          registeredAt: 1,
          acknowledgedAt: 1,
        },
      ]),
    }
    const bundleServer = {
      listRegisteredMailboxTokens: vi.fn(async () => [serverToken, serverToken]),
    }

    const tokens = await listRealtimeMailboxTokens({
      identity,
      storage,
      bundleServer: bundleServer as any,
      registeredMailboxMode: 'all',
    })

    expect(tokens.map((token) => token.source)).toEqual([
      'local_scope',
      'server_registry',
    ])
    expect(tokens[1]).toEqual(expect.objectContaining({
      token: serverToken,
    }))
  })

  it('registers unregistered local scopes before realtime subscriptions', async () => {
    const registerScope = vi.fn(async (scope: any) => ({
      ...scope,
      registeredAt: 12,
      registrationVersion: 1,
    }))
    const storage = {
      getMailboxScopes: vi.fn(async () => [
        {
          localIdentityId: identity.id,
          remoteIdentityId: 'remote',
          scopeId: 'scope-realtime',
          scopeSecret: scopeSecretA,
          epoch: 1,
          status: 'active' as const,
          createdAt: 1,
          updatedAt: 1,
        },
      ]),
    }

    const tokens = await listRealtimeMailboxTokens({
      identity,
      storage,
      registerScope,
      nowMs: () => 11,
    })

    expect(registerScope).toHaveBeenCalledWith(expect.objectContaining({
      scopeId: 'scope-realtime',
      acknowledgedAt: 11,
    }))
    expect(tokens).toHaveLength(1)
    expect(tokens[0].source).toBe('local_scope')
  })

  it('registers fresh local scopes before owned mailbox fetches', async () => {
    const registerScope = vi.fn(async (scope: any) => ({
      ...scope,
      registeredAt: 10,
    }))
    const storage = {
      getMailboxScopes: vi.fn(async () => [
        {
          localIdentityId: identity.id,
          remoteIdentityId: 'remote',
          scopeId: 'scope-fresh',
          scopeSecret: scopeSecretB,
          epoch: 2,
          status: 'active' as const,
          createdAt: 1,
          updatedAt: 1,
        },
      ]),
    }

    const scopes = await ensureInboundMailboxScopes({
      identity,
      storage,
      registerScope,
      nowMs: () => 7,
    })

    expect(registerScope).toHaveBeenCalledWith(expect.objectContaining({
      scopeId: 'scope-fresh',
      acknowledgedAt: 7,
    }))
    expect(scopes[0]).toEqual(expect.objectContaining({
      scopeId: 'scope-fresh',
      registeredAt: 10,
    }))
  })

  it('refreshes previously registered scopes from older registry versions', async () => {
    const registerScope = vi.fn(async (scope: any) => ({
      ...scope,
      registeredAt: 20,
      registrationVersion: 1,
    }))
    const storage = {
      getMailboxScopes: vi.fn(async () => [
        {
          localIdentityId: identity.id,
          remoteIdentityId: 'remote',
          scopeId: 'scope-legacy',
          scopeSecret: scopeSecretA,
          epoch: 1,
          status: 'active' as const,
          createdAt: 1,
          updatedAt: 1,
          registeredAt: 10,
          acknowledgedAt: 10,
        },
      ]),
    }

    const scopes = await ensureInboundMailboxScopes({
      identity,
      storage,
      registerScope,
      nowMs: () => 21,
    })

    expect(registerScope).toHaveBeenCalledWith(expect.objectContaining({
      scopeId: 'scope-legacy',
    }))
    expect(scopes[0]).toEqual(expect.objectContaining({
      registrationVersion: 1,
    }))
  })

  it('keeps using an already registered scope if refresh is temporarily unavailable', async () => {
    const registerScope = vi.fn(async () => {
      throw new Error('offline')
    })
    const storage = {
      getMailboxScopes: vi.fn(async () => [
        {
          localIdentityId: identity.id,
          remoteIdentityId: 'remote',
          scopeId: 'scope-existing',
          scopeSecret: scopeSecretA,
          epoch: 1,
          status: 'active' as const,
          createdAt: 1,
          updatedAt: 1,
          registeredAt: 10,
          acknowledgedAt: 10,
        },
      ]),
    }

    const scopes = await ensureInboundMailboxScopes({
      identity,
      storage,
      registerScope,
      nowMs: () => 21,
    })

    expect(registerScope).toHaveBeenCalled()
    expect(scopes[0]).toEqual(expect.objectContaining({
      scopeId: 'scope-existing',
      registeredAt: 10,
    }))
  })

  it('does not block owned-mail fetches on a stale keepalive refresh', async () => {
    const registerScope = vi.fn(async (scope: any) => ({
      ...scope,
      registeredAt: 20,
      registrationVersion: MAILBOX_SCOPE_REGISTRATION_VERSION,
    }))
    const storage = {
      getMailboxScopes: vi.fn(async () => [
        {
          localIdentityId: identity.id,
          remoteIdentityId: 'remote',
          scopeId: 'scope-stale',
          scopeSecret: scopeSecretA,
          epoch: 1,
          status: 'active' as const,
          createdAt: 1,
          updatedAt: 1,
          registeredAt: 10,
          acknowledgedAt: 10,
          registrationVersion: MAILBOX_SCOPE_REGISTRATION_VERSION,
        },
      ]),
    }

    const scopes = await ensureInboundMailboxScopes({
      identity,
      storage,
      registerScope,
      registrationUrgency: 'required',
      nowMs: () => 10 + MAILBOX_SCOPE_REGISTRATION_REFRESH_MS + 1,
    })

    expect(registerScope).not.toHaveBeenCalled()
    expect(scopes[0]).toEqual(expect.objectContaining({
      scopeId: 'scope-stale',
      registeredAt: 10,
    }))
  })

  it('refreshes stale keepalive registrations in the background path', async () => {
    const registerScope = vi.fn(async (scope: any) => ({
      ...scope,
      registeredAt: 20,
      registrationVersion: MAILBOX_SCOPE_REGISTRATION_VERSION,
    }))
    const storage = {
      getMailboxScopes: vi.fn(async () => [
        {
          localIdentityId: identity.id,
          remoteIdentityId: 'remote',
          scopeId: 'scope-stale',
          scopeSecret: scopeSecretA,
          epoch: 1,
          status: 'active' as const,
          createdAt: 1,
          updatedAt: 1,
          registeredAt: 10,
          acknowledgedAt: 10,
          registrationVersion: MAILBOX_SCOPE_REGISTRATION_VERSION,
        },
      ]),
    }

    const scopes = await ensureInboundMailboxScopes({
      identity,
      storage,
      registerScope,
      registrationUrgency: 'refresh',
      nowMs: () => 10 + MAILBOX_SCOPE_REGISTRATION_REFRESH_MS + 1,
    })

    expect(registerScope).toHaveBeenCalledWith(expect.objectContaining({
      scopeId: 'scope-stale',
    }))
    expect(scopes[0]).toEqual(expect.objectContaining({
      registeredAt: 20,
    }))
  })

  it('uses one preferred local scope per peer on the normal mailbox path', async () => {
    const storage = {
      getMailboxScopes: vi.fn(async () => [
        {
          localIdentityId: identity.id,
          remoteIdentityId: 'remote-a',
          scopeId: 'old-local',
          scopeSecret: scopeSecretA,
          epoch: 1,
          status: 'active' as const,
          createdAt: 1,
          updatedAt: 1,
          registeredAt: 1,
        },
        {
          localIdentityId: identity.id,
          remoteIdentityId: 'remote-a',
          scopeId: 'new-local',
          scopeSecret: scopeSecretB,
          epoch: 2,
          status: 'active' as const,
          createdAt: 2,
          updatedAt: 2,
          registeredAt: 2,
        },
        {
          localIdentityId: identity.id,
          remoteIdentityId: 'remote-b',
          scopeId: 'other-peer',
          scopeSecret: scopeSecretA,
          epoch: 1,
          status: 'active' as const,
          createdAt: 1,
          updatedAt: 1,
          registeredAt: 1,
        },
      ]),
    }
    const bundleServer = {
      listRegisteredMailboxTokens: vi.fn(async () => ['smbx2.retained-a', 'smbx2.retained-b']),
    }

    const realtimeTokens = await listRealtimeMailboxTokens({
      identity,
      storage,
      bundleServer: bundleServer as any,
      registeredMailboxMode: 'all',
    })

    expect(realtimeTokens.filter((token) => token.source === 'local_scope')).toHaveLength(2)
    expect(realtimeTokens.filter((token) => token.source === 'server_registry')).toHaveLength(2)
  })

  it('keeps locally initiated pending scopes on the realtime path', async () => {
    const storage = {
      getMailboxScopes: vi.fn(async () => [
        {
          localIdentityId: identity.id,
          remoteIdentityId: 'remote-a',
          scopeId: 'pending-local',
          scopeSecret: scopeSecretA,
          epoch: 1,
          status: 'pending' as const,
          initiatedByLocal: true,
          createdAt: 1,
          updatedAt: 2,
          registeredAt: 2,
        },
        {
          localIdentityId: identity.id,
          remoteIdentityId: 'remote-b',
          scopeId: 'pending-remote',
          scopeSecret: scopeSecretB,
          epoch: 1,
          status: 'pending' as const,
          initiatedByLocal: false,
          createdAt: 1,
          updatedAt: 2,
          registeredAt: 2,
        },
      ]),
    }

    const tokens = await listRealtimeMailboxTokens({
      identity,
      storage,
      localScopeMode: 'all',
    })

    expect(tokens).toHaveLength(1)
    expect(tokens[0]).toEqual(expect.objectContaining({
      source: 'local_scope',
    }))
  })

  it('does not refresh stale mailbox keepalives while listing realtime tokens', async () => {
    const registerScope = vi.fn(async (scope: any) => ({
      ...scope,
      registeredAt: 99,
      registrationVersion: MAILBOX_SCOPE_REGISTRATION_VERSION,
    }))
    const storage = {
      getMailboxScopes: vi.fn(async () => [
        {
          localIdentityId: identity.id,
          remoteIdentityId: 'remote',
          scopeId: 'scope-stale',
          scopeSecret: scopeSecretA,
          epoch: 1,
          status: 'active' as const,
          createdAt: 1,
          updatedAt: 1,
          registeredAt: 10,
          acknowledgedAt: 10,
          registrationVersion: MAILBOX_SCOPE_REGISTRATION_VERSION,
        },
      ]),
    }

    await listRealtimeMailboxTokens({
      identity,
      storage,
      registerScope,
      nowMs: () => 10 + MAILBOX_SCOPE_REGISTRATION_REFRESH_MS + 1,
    })

    expect(registerScope).not.toHaveBeenCalled()
  })
})
