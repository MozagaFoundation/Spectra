/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it, vi } from 'vitest'

import { createMessageDispatchQueue } from './messageDispatchQueue'

describe('messageDispatchQueue', () => {
  it('returns immediately while dispatch continues in the background', async () => {
    let resolveDispatch: (() => void) | undefined
    const dispatch = vi.fn(() => new Promise<void>((resolve) => {
      resolveDispatch = resolve
    }))
    const recordDiagnostic = vi.fn()
    const queue = createMessageDispatchQueue({
      dispatch,
      recordDiagnostic,
    })

    queue.enqueue([
      { id: 'message-1', conversationId: 'conversation-1', senderId: 'remote-1', serverSequence: 10 },
    ], {
      source: 'realtime',
      latestServerSequence: 10,
    })

    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(queue.isRunning()).toBe(true)
    expect(recordDiagnostic).toHaveBeenCalledWith(
      'background_dispatch_queued',
      expect.objectContaining({
        source: 'realtime',
        messageCount: 1,
        latestServerSequence: 10,
      }),
    )

    resolveDispatch?.()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(queue.isRunning()).toBe(false)
    expect(recordDiagnostic).toHaveBeenCalledWith(
      'background_dispatch_complete',
      expect.objectContaining({ messageCount: 1, latestServerSequence: 10 }),
    )
  })

  it('preserves batch order for messages queued behind an active dispatch', async () => {
    let resolveFirstDispatch: (() => void) | undefined
    const batches: string[][] = []
    const dispatch = vi.fn((messages: Array<{ id: string; serverSequence?: number }>) => {
      batches.push(messages.map((message) => message.id))
      if (batches.length === 1) {
        return new Promise<void>((resolve) => {
          resolveFirstDispatch = resolve
        })
      }
      return Promise.resolve()
    })
    const queue = createMessageDispatchQueue({
      dispatch,
    })

    queue.enqueue([{ id: 'message-1', serverSequence: 1 }], { source: 'realtime' })
    queue.enqueue([
      { id: 'message-2', serverSequence: 2 },
      { id: 'message-3', serverSequence: 3 },
    ], { source: 'queued' })

    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(queue.getPendingCount()).toBe(2)

    resolveFirstDispatch?.()
    await Promise.resolve()
    await Promise.resolve()

    expect(dispatch).toHaveBeenCalledTimes(2)
    expect(batches).toEqual([
      ['message-1'],
      ['message-2', 'message-3'],
    ])
  })

  it('drops pending messages after clear without interrupting an active batch', async () => {
    let resolveFirstDispatch: (() => void) | undefined
    const batches: string[][] = []
    const dispatch = vi.fn((messages: Array<{ id: string; serverSequence?: number }>) => {
      batches.push(messages.map((message) => message.id))
      if (batches.length === 1) {
        return new Promise<void>((resolve) => {
          resolveFirstDispatch = resolve
        })
      }
      return Promise.resolve()
    })
    const queue = createMessageDispatchQueue({
      dispatch,
    })

    queue.enqueue([{ id: 'message-1', serverSequence: 1 }], { source: 'realtime' })
    queue.enqueue([{ id: 'message-stale', serverSequence: 2 }], { source: 'queued' })
    queue.clear()
    queue.enqueue([{ id: 'message-new', serverSequence: 3 }], { source: 'realtime' })

    resolveFirstDispatch?.()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(batches).toEqual([
      ['message-1'],
      ['message-new'],
    ])
  })
})
