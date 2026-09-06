/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it, vi } from 'vitest'
import { makeIdentityPair } from '../__tests__/helpers/cryptoTestHelpers'
import {
  deriveExoAddressFromWalletPublicKey,
  signPublicKeyBundleWalletAuthorization,
} from '../crypto/walletAuthorization'
import type { OutboundSealedRelayRecord, PublicKeyBundle } from '../types/index'
import { BackendBundleServer } from './backend'
import { BundleServerRequestError } from './index'

const INVITE_CAPABILITY = 'smbx1.invite-capability'

describe('BackendBundleServer', () => {
  it('classifies a terminal unavailable recipient relay response', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: false,
      status: 410,
      text: async () => JSON.stringify({ error: 'recipient_unavailable' }),
    } as Response))
    const server = new BackendBundleServer('https://api.example', fetchFn)
    server.setAccessToken('access-token')
    const record = {
      recipientMailboxToken: 'smbx2.recipient-mailbox',
      deliveryToken: `sdv1.${'A'.repeat(43)}=`,
      deliveryClass: 'message',
      sealedEnvelope: { version: 1, type: 'message' },
    } as unknown as OutboundSealedRelayRecord

    await expect(server.sendSealedMessage(record)).rejects.toMatchObject({
      name: 'BundleServerRequestError',
      reason: 'recipient_unavailable',
      statusCode: 410,
      transient: false,
    } satisfies Partial<BundleServerRequestError>)
  })

  it('reconstructs a sealed relay result from the minimal acceptance', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      text: async () =>
        JSON.stringify({
          id: 'msg_acceptance',
          status: 'pending',
          serverSequence: 42,
          createdAt: 1_780_000_000_000,
          expiresAt: 1_782_592_000_000,
        }),
    } as Response))
    const record = {
      recipientMailboxToken: 'smbx2.recipient-mailbox',
      deliveryToken: `sdv1.${'A'.repeat(43)}=`,
      deliveryClass: 'message',
      sealedEnvelope: { version: 1, type: 'message' },
    } as unknown as OutboundSealedRelayRecord
    const server = new BackendBundleServer('https://api.example', fetchFn)
    server.setAccessToken('access-token')

    await expect(server.sendSealedMessage(record)).resolves.toEqual({
      id: 'msg_acceptance',
      status: 'pending',
      serverSequence: 42,
      createdAt: 1_780_000_000_000,
      expiresAt: 1_782_592_000_000,
      recipientMailboxToken: record.recipientMailboxToken,
      deliveryToken: record.deliveryToken,
      deliveryClass: record.deliveryClass,
      sealedEnvelope: record.sealedEnvelope,
    })
  })

  it('deletes sealed relay messages through the backend API', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      text: async () => '{"deletedCount":2}',
    } as Response))
    const server = new BackendBundleServer('https://api.example', fetchFn)
    server.setAccessToken('access-token')

    const deletedCount = await server.deleteMessages(['msg-1', 'msg-2'])

    expect(deletedCount).toBe(2)
    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.example/v1/chat/sealed/messages/delete',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ messageIds: ['msg-1', 'msg-2'] }),
      }),
    )
  })

  it('vacuums sealed relay rows through the backend API', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      text: async () => '{"deletedCount":20}',
    } as Response))
    const server = new BackendBundleServer('https://api.example', fetchFn)
    server.setAccessToken('access-token')

    const deletedCount = await server.vacuumOwnedSealedMessages(2272, ['read'])

    expect(deletedCount).toBe(20)
    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.example/v1/chat/sealed/messages/vacuum',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ beforeSequence: 2272, statuses: ['read'] }),
      }),
    )
  })

  it('skips mailbox vacuum without a cursor', async () => {
    const fetchFn = vi.fn()
    const server = new BackendBundleServer('https://api.example', fetchFn as never)
    server.setAccessToken('access-token')

    const deletedCount = await server.vacuumOwnedSealedMessages(0)

    expect(deletedCount).toBe(0)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('rejects mailbox vacuums that omit a deletedCount', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      text: async () => '{}',
    } as Response))
    const server = new BackendBundleServer('https://api.example', fetchFn)
    server.setAccessToken('access-token')

    await expect(server.vacuumOwnedSealedMessages(10)).rejects.toThrow('relay_vacuum_count_invalid')
  })

  it('skips empty sealed relay delete batches', async () => {
    const fetchFn = vi.fn()
    const server = new BackendBundleServer('https://api.example', fetchFn as never)
    server.setAccessToken('access-token')

    const deletedCount = await server.deleteMessages([])

    expect(deletedCount).toBe(0)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('rejects relay deletes that omit a deletedCount', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      text: async () => '{}',
    } as Response))
    const server = new BackendBundleServer('https://api.example', fetchFn)
    server.setAccessToken('access-token')

    await expect(server.deleteMessages(['msg-1'])).rejects.toThrow('relay_delete_count_invalid')
  })

  it('repairs identity binding and retries a rejected relay request once', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        headers: new Headers(),
        text: async () => '{"error":"identity_binding_required"}',
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '{"messages":[]}',
      } as Response)
    const recovery = vi.fn(async () => 'repaired-token')
    const server = new BackendBundleServer('https://api.example', fetchFn)
    server.setAccessToken('stale-token')
    server.setIdentityRecoveryHandler(recovery)

    await expect(server.fetchOwnedSealedMessages()).resolves.toEqual([])

    expect(recovery).toHaveBeenCalledTimes(1)
    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(fetchFn.mock.calls[1]?.[1]?.headers).toEqual(expect.objectContaining({
      Authorization: 'Bearer repaired-token',
    }))
  })

  it('aborts backend requests at the configured deadline', async () => {
    vi.useFakeTimers()
    try {
      const fetchFn = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => (
        new Promise<Response>(() => {})
      ))
      const server = new BackendBundleServer('https://api.example', fetchFn, 1_000)
      server.setAccessToken('access-token')

      const request = server.fetchOwnedSealedMessages()
      const rejection = expect(request).rejects.toMatchObject({
        name: 'BundleServerRequestError',
        message: 'Backend bundle request timed out',
        reason: 'network',
        transient: true,
      })

      await vi.advanceTimersByTimeAsync(1_000)
      await rejection
      expect(fetchFn.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('resolves request deadlines per transport without changing the default', async () => {
    vi.useFakeTimers()
    try {
      const fetchFn = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => (
        new Promise<Response>(() => {})
      ))
      let transportTimeoutMs: number | undefined
      const server = new BackendBundleServer(
        'https://api.example',
        fetchFn,
        () => transportTimeoutMs,
      )
      server.setAccessToken('access-token')

      const clearnetRequest = server.fetchOwnedSealedMessages()
      const clearnetRejection = expect(clearnetRequest).rejects.toMatchObject({
        message: 'Backend bundle request timed out',
      })
      await vi.advanceTimersByTimeAsync(15_000)
      await clearnetRejection

      transportTimeoutMs = 30_000
      const torRequest = server.fetchOwnedSealedMessages()
      const torRejection = expect(torRequest).rejects.toMatchObject({
        message: 'Backend bundle request timed out',
      })
      await vi.advanceTimersByTimeAsync(29_999)
      expect(fetchFn.mock.calls[1]?.[1]?.signal?.aborted).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      await torRejection
      expect(fetchFn.mock.calls[1]?.[1]?.signal?.aborted).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('cancels a bundle request when its caller scope ends', async () => {
    const fetchFn = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => (
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      })
    ))
    const server = new BackendBundleServer('https://api.example', fetchFn)
    const controller = new AbortController()
    server.setAccessToken('access-token')

    const request = server.fetchBundle(
      'peer',
      'requestor',
      INVITE_CAPABILITY,
      controller.signal,
    )
    controller.abort()

    await expect(request).rejects.toMatchObject({
      message: 'Backend bundle request cancelled',
      reason: 'network',
    })
    expect(fetchFn.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
  })

  it('does not request a bundle without an invitation capability', async () => {
    const fetchFn = vi.fn()
    const server = new BackendBundleServer('https://api.example', fetchFn as never)
    server.setAccessToken('access-token')

    await expect(server.fetchBundle('peer', 'requestor', '')).resolves.toEqual({
      bundle: null,
      error: 'Contact invitation is required',
    })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('fetches a discoverable bundle by its authorized wallet address', async () => {
    const bundle = authorizedBundle()
    const walletAddress = bundle.walletAuthorization!.payload.walletAddress
    const fetchFn = bundleFetch({ bundle })
    const server = new BackendBundleServer('https://api.example', fetchFn)
    server.setAccessToken('access-token')

    const result = await server.fetchDiscoverableBundle(walletAddress, 'requestor-identity')

    expect(result).toEqual(expect.objectContaining({ bundle: expect.objectContaining({
      identityId: bundle.identityId,
    }) }))
    expect(fetchFn).toHaveBeenCalledWith(
      `https://api.example/v1/chat/discovery/bundles/${encodeURIComponent(walletAddress)}?requestorId=requestor-identity`,
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('redeems a one-time contact card through its opaque capability', async () => {
    const bundle = authorizedBundle()
    const allocatedOPK = bundle.oneTimePreKeys[0]!
    const cardId = `scc1.${'a'.repeat(32)}`
    const capability = `sccap1.${'A'.repeat(43)}`
    const fetchFn = bundleFetch({
      bundle,
      allocatedOPK,
      allocatedOPKId: allocatedOPK.id,
    })
    const server = new BackendBundleServer('https://api.example', fetchFn)
    server.setAccessToken('access-token')

    const result = await server.fetchOneTimeContactCard(cardId, capability)

    expect(result).toEqual(expect.objectContaining({ bundle: expect.objectContaining({
      identityId: bundle.identityId,
    }) }))
    expect(fetchFn).toHaveBeenCalledWith(
      `https://api.example/v1/chat/contact-cards/${encodeURIComponent(cardId)}/redeem`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ capability }),
      }),
    )
  })

  it('cancels an owned-message poll when superseded', async () => {
    const fetchFn = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => (
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      })
    ))
    const server = new BackendBundleServer('https://api.example', fetchFn)
    const controller = new AbortController()
    server.setAccessToken('access-token')

    const request = server.fetchOwnedSealedMessages(undefined, controller.signal)
    controller.abort()

    await expect(request).rejects.toMatchObject({
      message: 'Backend bundle request cancelled',
      reason: 'network',
    })
  })

  it('omits zero relay cursors from message fetch queries', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      text: async () => '{"messages":[]}',
    } as Response))
    const server = new BackendBundleServer('https://api.example', fetchFn)
    server.setAccessToken('access-token')

    await server.fetchOwnedSealedMessages(0)

    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.example/v1/chat/sealed/messages?deliveryClass=message',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('preserves retry timing for rate-limited receipt requests', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: false,
      status: 429,
      headers: new Headers({ 'Retry-After': '45' }),
      text: async () => 'rate_limited',
    } as Response))
    const server = new BackendBundleServer('https://api.example', fetchFn)
    server.setAccessToken('access-token')

    await expect(server.markDelivered('relay-1')).rejects.toMatchObject({
      name: 'BundleServerRequestError',
      reason: 'rate_limited',
      statusCode: 429,
      retryAfterMs: 45_000,
      transient: true,
    } satisfies Partial<BundleServerRequestError>)
  })

  it('rejects a bundle that does not match the requested directory identity', async () => {
    const bundle = authorizedBundle()
    const fetchFn = bundleFetch({ bundle })
    const server = new BackendBundleServer('https://api.example', fetchFn)
    server.setAccessToken('access-token')

    const result = await server.fetchBundle(
      'different-identity',
      'requestor-identity',
      INVITE_CAPABILITY,
      undefined,
    )

    expect(result.bundle).toBeNull()
    expect(result.error).toBe('Bundle identity does not match requested identity')
  })

  it('rejects inconsistent allocated one-time pre-key metadata', async () => {
    const bundle = authorizedBundle()
    const allocatedOPK = bundle.oneTimePreKeys[0]
    const fetchFn = bundleFetch({
      bundle,
      allocatedOPK,
      allocatedOPKId: allocatedOPK.id + 1,
    })
    const server = new BackendBundleServer('https://api.example', fetchFn)
    server.setAccessToken('access-token')

    const result = await server.fetchBundle(
      bundle.identityId,
      'requestor-identity',
      INVITE_CAPABILITY,
      undefined,
    )

    expect(result.bundle).toBeNull()
    expect(result.error).toBe('Allocated one-time pre-key metadata is inconsistent')
  })

  it('rejects fetched bundles without wallet authorization', async () => {
    const bundle = authorizedBundle()
    const { walletAuthorization: _, ...unsignedWalletBundle } = bundle
    const fetchFn = bundleFetch({ bundle: unsignedWalletBundle as PublicKeyBundle })
    const server = new BackendBundleServer('https://api.example', fetchFn)
    server.setAccessToken('access-token')

    const result = await server.fetchBundle(
      bundle.identityId,
      'requestor-identity',
      INVITE_CAPABILITY,
      undefined,
    )

    expect(result.bundle).toBeNull()
    expect(result.error).toBe('Bundle is missing wallet authorization')
  })
})

function authorizedBundle(): PublicKeyBundle {
  const { bob } = makeIdentityPair()
  const walletAddress = deriveExoAddressFromWalletPublicKey(bob.identity.dilithiumPublicKey)
  return {
    ...bob.bundle,
    walletAuthorization: signPublicKeyBundleWalletAuthorization(
      bob.bundle,
      walletAddress,
      bob.identity.dilithiumPublicKey,
      bob.identity.dilithiumPrivateKey,
      1_771_000_000_000,
    ),
  }
}

function bundleFetch(payload: unknown) {
  return vi.fn(async () => ({
    ok: true,
    text: async () => JSON.stringify(payload),
  } as Response))
}
