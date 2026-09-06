/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setClearnetEgressAllowed } from '@/services/tor/torEgressPolicy'

vi.mock('./appVersion', () => ({
  getAppVersionHeaders: () => ({
    'X-Spectra-App-Version': '1.2.5',
    'X-Spectra-Client-Platform': 'ios',
  }),
}))

const sockets: MockSocket[] = []

class MockSocket {
  onopen: (() => void) | null = null
  onmessage: ((message: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: ((event: { code: number; reason: string; wasClean: boolean }) => void) | null = null
  sent: string[] = []
  closed = false

  constructor(
    readonly url: string,
    readonly protocols: string[],
    readonly options: { headers?: Record<string, string> },
  ) {
    sockets.push(this)
  }

  send(message: string): void {
    this.sent.push(message)
  }

  close(): void {
    this.closed = true
  }
}

describe('backend realtime adapter', () => {
  beforeEach(async () => {
    await setClearnetEgressAllowed(true)
    sockets.length = 0
    vi.stubGlobal('WebSocket', MockSocket)
  })

  afterEach(async () => {
    await setClearnetEgressAllowed(true)
    vi.useRealTimers()
  })

  it('opens authenticated websocket subscriptions and dispatches backend events', async () => {
    const onEvent = vi.fn()
    const onSubscribed = vi.fn()
    const onLifecycle = vi.fn()
    const { subscribeBackendRealtime } = await import('./realtime')

    const subscription = subscribeBackendRealtime({
      accessToken: 'token',
      subscriberId: 'sub-1',
      topic: 'sealed_mailbox:token',
      onEvent,
      onSubscribed,
      onLifecycle,
    }, 'https://api.spectra.test')

    expect(sockets[0].url).toBe('wss://api.spectra.test/v1/realtime')
    expect(sockets[0].options.headers?.Authorization).toBe('Bearer token')
    expect(sockets[0].options.headers).toMatchObject({
      'X-Spectra-App-Version': '1.2.5',
      'X-Spectra-Client-Platform': 'ios',
    })

    sockets[0].onopen?.()
    expect(onLifecycle).toHaveBeenCalledWith(expect.objectContaining({ state: 'OPEN' }))
    expect(JSON.parse(sockets[0].sent[0])).toEqual({
      subscriberId: 'sub-1',
      topic: 'sealed_mailbox:token',
    })

    sockets[0].onmessage?.({ data: JSON.stringify({ type: 'subscribed', topic: 'sealed_mailbox:token' }) })
    expect(onSubscribed).toHaveBeenCalledWith('sealed_mailbox:token')
    expect(onLifecycle).toHaveBeenCalledWith(expect.objectContaining({ state: 'SUBSCRIBED' }))

    sockets[0].onmessage?.({ data: JSON.stringify({ type: 'event', topic: 'sealed_mailbox:token', event: 'message', payload: { id: 'm1' } }) })
    expect(onEvent).toHaveBeenCalledWith({ type: 'event', topic: 'sealed_mailbox:token', event: 'message', payload: { id: 'm1' } })

    subscription.close()
    expect(sockets[0].closed).toBe(true)
  })

  it('ignores events for topics that are not subscribed without closing the socket', async () => {
    const onEvent = vi.fn()
    const onError = vi.fn()
    const { subscribeBackendRealtime } = await import('./realtime')

    const subscription = subscribeBackendRealtime({
      accessToken: 'token',
      subscriberId: 'sub-1',
      topic: 'sealed_mailbox:token',
      onEvent,
      onError,
    }, 'http://api.spectra.test')

    sockets[0].onopen?.()
    sockets[0].onmessage?.({ data: JSON.stringify({ type: 'subscribed', topic: 'sealed_mailbox:token' }) })
    sockets[0].onmessage?.({
      data: JSON.stringify({
        type: 'event',
        topic: 'sealed_mailbox:other',
        event: 'sealed_message_insert',
        payload: { server_sequence: 9 },
      }),
    })

    expect(onError).not.toHaveBeenCalled()
    expect(sockets[0].closed).toBe(false)

    sockets[0].onmessage?.({
      data: JSON.stringify({
        type: 'event',
        topic: 'sealed_mailbox:token',
        event: 'sealed_message_insert',
        payload: { server_sequence: 10 },
      }),
    })
    expect(onEvent).toHaveBeenCalledTimes(1)
    subscription.close()
  })

  it('preserves the Edge Function path in the websocket URL', async () => {
    const { subscribeBackendRealtime } = await import('./realtime')

    const subscription = subscribeBackendRealtime({
      accessToken: 'token',
      subscriberId: 'sub-edge',
      topic: 'sealed_mailbox:token',
      onEvent: vi.fn(),
    }, 'https://project.supabase.co/functions/v1/spectra-api')

    expect(sockets[0].url).toBe(
      'wss://project.supabase.co/functions/v1/spectra-api/v1/realtime',
    )
    subscription.close()
  })

  it('rejects invalid subscriber IDs before opening a socket', async () => {
    const { subscribeBackendRealtime } = await import('./realtime')

    expect(() => subscribeBackendRealtime({
      accessToken: 'token',
      subscriberId: 'chat:primary:identity',
      topic: 'sealed_mailbox:token',
      onEvent: vi.fn(),
    }, 'https://invalid-subscriber.spectra.test')).toThrow(
      'Invalid backend realtime subscriber ID',
    )
    expect(sockets).toHaveLength(0)
  })

  it('multiplexes topics that share backend credentials', async () => {
    const firstEvent = vi.fn()
    const secondEvent = vi.fn()
    const { subscribeBackendRealtime } = await import('./realtime')
    const first = subscribeBackendRealtime({
      accessToken: 'shared-token',
      subscriberId: 'sub-1',
      topic: 'sealed_mailbox:first',
      onEvent: firstEvent,
    }, 'https://api.spectra.test')
    const second = subscribeBackendRealtime({
      accessToken: 'shared-token',
      subscriberId: 'sub-2',
      topic: 'sealed_receipt:second',
      onEvent: secondEvent,
    }, 'https://api.spectra.test')

    expect(sockets).toHaveLength(1)
    sockets[0].onopen?.()
    expect(JSON.parse(sockets[0].sent[0])).toEqual({
      subscriberId: 'sub-1',
      topic: 'sealed_mailbox:first',
    })
    expect(JSON.parse(sockets[0].sent[1])).toEqual({
      type: 'subscribe',
      subscriberId: 'sub-2',
      topic: 'sealed_receipt:second',
    })

    sockets[0].onmessage?.({
      data: JSON.stringify({
        type: 'subscribed',
        topic: 'sealed_mailbox:first',
      }),
    })
    sockets[0].onmessage?.({
      data: JSON.stringify({
        type: 'subscribed',
        topic: 'sealed_receipt:second',
      }),
    })
    sockets[0].onmessage?.({
      data: JSON.stringify({
        type: 'event',
        topic: 'sealed_receipt:second',
        event: 'receipt',
        payload: { id: 'r1' },
      }),
    })

    expect(firstEvent).not.toHaveBeenCalled()
    expect(secondEvent).toHaveBeenCalledTimes(1)
    first.close()
    expect(sockets[0].closed).toBe(false)
    second.close()
    expect(sockets[0].closed).toBe(true)
  })

  it('rejects a stale receipt topic without closing the mailbox socket', async () => {
    const mailboxEvent = vi.fn()
    const mailboxError = vi.fn()
    const receiptError = vi.fn()
    const { subscribeBackendRealtime } = await import('./realtime')
    subscribeBackendRealtime({
      accessToken: 'shared-token',
      subscriberId: 'sub-mailbox',
      topic: 'sealed_mailbox:primary',
      onEvent: mailboxEvent,
      onError: mailboxError,
    }, 'https://api.spectra.test')
    subscribeBackendRealtime({
      accessToken: 'shared-token',
      subscriberId: 'sub-receipt',
      topic: 'sealed_receipt:stale',
      onEvent: vi.fn(),
      onError: receiptError,
    }, 'https://api.spectra.test')

    sockets[0].onopen?.()
    sockets[0].onmessage?.({
      data: JSON.stringify({ type: 'subscribed', topic: 'sealed_mailbox:primary' }),
    })
    sockets[0].onmessage?.({
      data: JSON.stringify({
        type: 'error',
        topic: 'sealed_receipt:stale',
        code: 'unauthorized_topic',
      }),
    })
    sockets[0].onmessage?.({
      data: JSON.stringify({
        type: 'event',
        topic: 'sealed_mailbox:primary',
        event: 'sealed_message_insert',
        payload: { server_sequence: 1 },
      }),
    })

    expect(receiptError).toHaveBeenCalledTimes(1)
    expect(mailboxError).not.toHaveBeenCalled()
    expect(mailboxEvent).toHaveBeenCalledTimes(1)
    expect(sockets[0].closed).toBe(false)
  })

  it('reports unexpected socket closes', async () => {
    const onError = vi.fn()
    const onLifecycle = vi.fn()
    const { subscribeBackendRealtime } = await import('./realtime')

    const subscription = subscribeBackendRealtime({
      accessToken: 'token',
      subscriberId: 'sub-1',
      topic: 'sealed_mailbox:token',
      onEvent: vi.fn(),
      onError,
      onLifecycle,
    }, 'http://api.spectra.test')

    sockets[0].onclose?.({ code: 1008, reason: 'unauthorized topic', wasClean: true })
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Backend realtime socket closed before acknowledgement',
    }))
    expect(onLifecycle).toHaveBeenCalledWith(expect.objectContaining({
      state: 'CLOSED',
      failureStage: 'closed_before_ack',
      closeCode: 1008,
      closeReason: 'unauthorized topic',
      wasClean: true,
    }))

    onError.mockClear()
    subscription.close()
    sockets[0].onclose?.({ code: 1000, reason: 'done', wasClean: true })
    expect(onError).not.toHaveBeenCalled()
  })

  it('repairs identity binding before recycling a rejected channel', async () => {
    const onError = vi.fn()
    const recovery = vi.fn(async () => 'repaired-token')
    const { registerBackendIdentityRecovery } = await import('./request')
    registerBackendIdentityRecovery(recovery)
    const { subscribeBackendRealtime } = await import('./realtime')

    subscribeBackendRealtime({
      accessToken: 'stale-token',
      subscriberId: 'sub-repair',
      topic: 'chat_groups:group-1',
      onEvent: vi.fn(),
      onError,
    }, 'http://api.spectra.test')

    sockets[0].onclose?.({
      code: 1008,
      reason: 'identity binding required',
      wasClean: false,
    })

    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1))
    expect(recovery).toHaveBeenCalledTimes(1)
  })

  it('reports subscriptions that never receive backend acknowledgement', async () => {
    vi.useFakeTimers()
    const onError = vi.fn()
    const onLifecycle = vi.fn()
    const { subscribeBackendRealtime } = await import('./realtime')

    subscribeBackendRealtime({
      accessToken: 'token',
      subscriberId: 'sub-1',
      topic: 'sealed_mailbox:token',
      onEvent: vi.fn(),
      onError,
      onLifecycle,
    }, 'http://api.spectra.test')

    sockets[0].onopen?.()
    await vi.advanceTimersByTimeAsync(7_000)

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Backend realtime subscription acknowledgement timed out',
    }))
    expect(onLifecycle).toHaveBeenCalledWith(expect.objectContaining({
      state: 'ERROR',
      failureStage: 'ack_timeout',
      elapsedMs: 7_000,
    }))
  })

  it('rejects acknowledgements for a different topic', async () => {
    const onError = vi.fn()
    const { subscribeBackendRealtime } = await import('./realtime')

    subscribeBackendRealtime({
      accessToken: 'token',
      subscriberId: 'sub-1',
      topic: 'sealed_mailbox:expected',
      onEvent: vi.fn(),
      onError,
    }, 'http://api.spectra.test')
    sockets[0].onmessage?.({
      data: JSON.stringify({ type: 'subscribed', topic: 'sealed_mailbox:other' }),
    })

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Backend realtime acknowledgement topic mismatch',
    }))
  })

  it('closes active sockets and blocks new ones when the Tor boundary closes', async () => {
    const { subscribeBackendRealtime } = await import('./realtime')
    subscribeBackendRealtime({
      accessToken: 'token',
      subscriberId: 'sub-1',
      topic: 'sealed_mailbox:token',
      onEvent: vi.fn(),
    }, 'https://api.spectra.test')

    await setClearnetEgressAllowed(false)

    expect(sockets[0].closed).toBe(true)
    expect(() => subscribeBackendRealtime({
      accessToken: 'token',
      subscriberId: 'sub-2',
      topic: 'sealed_mailbox:token',
      onEvent: vi.fn(),
    }, 'https://api.spectra.test')).toThrow('Clearnet network access is blocked')
    expect(sockets).toHaveLength(1)
  })
})
