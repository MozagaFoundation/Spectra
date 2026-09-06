/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from '@testing-library/react-native'
import { renderHook } from '@/test/hookTestHarness'
import { useChatsRefresh, usePrivateChatsRefresh } from './useChatsRefresh'

const refreshMocks = vi.hoisted(() => ({
  refreshChatList: vi.fn(async () => {}),
}))

vi.mock('@/services/chat', () => ({
  refreshChatList: refreshMocks.refreshChatList,
}))

function deferred() {
  let resolve!: () => void
  let reject!: (error: unknown) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, reject, resolve }
}

describe('useChatsRefresh', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not run the refresh action when disabled', async () => {
    const refreshAction = vi.fn(async () => {})
    const harness = renderHook(() => useChatsRefresh(refreshAction, {
      disabled: true,
      errorMessage: 'Refresh failed',
    }))

    await act(async () => {
      await harness.result.handleRefresh()
    })

    expect(refreshAction).not.toHaveBeenCalled()
    expect(harness.result.isRefreshing).toBe(false)
  })

  it('sets and clears refreshing state around successful refreshes', async () => {
    const pending = deferred()
    const refreshAction = vi.fn(() => pending.promise)
    const harness = renderHook(() => useChatsRefresh(refreshAction, {
      errorMessage: 'Refresh failed',
    }))

    let refreshPromise!: Promise<void>
    await act(async () => {
      refreshPromise = harness.result.handleRefresh()
    })

    expect(harness.result.isRefreshing).toBe(true)
    pending.resolve()
    await act(async () => {
      await refreshPromise
    })

    expect(refreshAction).toHaveBeenCalledTimes(1)
    expect(harness.result.isRefreshing).toBe(false)
  })

  it('logs errors and still clears refreshing state', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = new Error('network down')
    const refreshAction = vi.fn(async () => {
      throw error
    })
    const harness = renderHook(() => useChatsRefresh(refreshAction, {
      errorMessage: 'Refresh failed',
    }))

    await act(async () => {
      await harness.result.handleRefresh()
    })

    expect(warn).toHaveBeenCalledWith('Refresh failed', error)
    expect(harness.result.isRefreshing).toBe(false)
    warn.mockRestore()
  })

  it('ignores concurrent refresh calls while one is in flight', async () => {
    const pending = deferred()
    const refreshAction = vi.fn(() => pending.promise)
    const harness = renderHook(() => useChatsRefresh(refreshAction, {
      errorMessage: 'Refresh failed',
    }))

    let first!: Promise<void>
    let second!: Promise<void>
    await act(async () => {
      first = harness.result.handleRefresh()
      second = harness.result.handleRefresh()
    })

    expect(refreshAction).toHaveBeenCalledTimes(1)
    pending.resolve()
    await act(async () => {
      await Promise.all([first, second])
    })
  })

  it('settles the indicator when the refresh promise never completes', async () => {
    vi.useFakeTimers()
    const refreshAction = vi.fn(() => new Promise<void>(() => {}))
    const harness = renderHook(() => useChatsRefresh(refreshAction, {
      errorMessage: 'Refresh failed',
      uiDeadlineMs: 100,
    }))

    let refreshPromise!: Promise<void>
    await act(async () => {
      refreshPromise = harness.result.handleRefresh()
    })
    expect(harness.result.isRefreshing).toBe(true)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
      await refreshPromise
    })

    expect(harness.result.isRefreshing).toBe(false)
    vi.useRealTimers()
  })

  it('does not let stale completion clear a newer refresh', async () => {
    vi.useFakeTimers()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const first = deferred()
    const second = deferred()
    const refreshAction = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const harness = renderHook(() => useChatsRefresh(refreshAction, {
      errorMessage: 'Refresh failed',
      uiDeadlineMs: 100,
    }))

    let firstRefresh!: Promise<void>
    await act(async () => {
      firstRefresh = harness.result.handleRefresh()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
      await firstRefresh
    })

    let secondRefresh!: Promise<void>
    await act(async () => {
      secondRefresh = harness.result.handleRefresh()
    })
    expect(harness.result.isRefreshing).toBe(true)

    const staleError = new Error('stale refresh failed')
    first.reject(staleError)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(harness.result.isRefreshing).toBe(true)
    expect(warn).toHaveBeenCalledWith('Refresh failed', staleError)

    second.resolve()
    await act(async () => {
      await secondRefresh
    })
    expect(harness.result.isRefreshing).toBe(false)
    expect(refreshAction).toHaveBeenCalledTimes(2)
    warn.mockRestore()
    vi.useRealTimers()
  })

  it('uses refreshChatList for private chat refreshes', async () => {
    const harness = renderHook(() => usePrivateChatsRefresh())

    await act(async () => {
      await harness.result.handleRefresh()
    })

    expect(refreshMocks.refreshChatList).toHaveBeenCalledTimes(1)
  })
})
