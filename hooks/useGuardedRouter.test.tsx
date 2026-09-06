/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from '@testing-library/react-native'
import { renderHook } from '@/test/hookTestHarness'
import { useGuardedRouter } from './useGuardedRouter'

const routerMocks = vi.hoisted(() => ({
  router: {
    back: vi.fn(),
    dismissAll: vi.fn(),
    navigate: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
  },
  pathname: '/home',
}))

vi.mock('expo-router', () => ({
  useRouter: () => routerMocks.router,
  usePathname: () => routerMocks.pathname,
}))

describe('useGuardedRouter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    routerMocks.pathname = '/home'
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('suppresses navigation to the current normalized route', () => {
    routerMocks.pathname = '/chat/alice'
    const harness = renderHook(() => useGuardedRouter())

    harness.result.push('/(main)/chat/alice?local=0xabc')

    expect(routerMocks.router.push).not.toHaveBeenCalled()
  })

  it('suppresses duplicate object-route pushes during the cooldown', () => {
    const harness = renderHook(() => useGuardedRouter())

    harness.result.push({ pathname: '/(main)/settings/about', params: { tab: 'legal', id: '1' } } as never)
    harness.result.push({ pathname: '/(main)/settings/about', params: { id: '1', tab: 'legal' } } as never)

    expect(routerMocks.router.push).toHaveBeenCalledTimes(1)
  })

  it('allows a distinct target to replace the pending navigation guard', () => {
    const harness = renderHook(() => useGuardedRouter())

    harness.result.push('/chat/alice')
    harness.result.push('/chat/bob')

    expect(routerMocks.router.push).toHaveBeenCalledTimes(2)
    expect(routerMocks.router.push).toHaveBeenNthCalledWith(1, '/chat/alice')
    expect(routerMocks.router.push).toHaveBeenNthCalledWith(2, '/chat/bob')
  })

  it('allows the same target after the cooldown expires', () => {
    const harness = renderHook(() => useGuardedRouter(250))

    harness.result.navigate('/chat/alice')
    act(() => {
      vi.advanceTimersByTime(250)
    })
    harness.result.navigate('/chat/alice')

    expect(routerMocks.router.navigate).toHaveBeenCalledTimes(2)
  })

  it('passes through router APIs that are not guarded', () => {
    const harness = renderHook(() => useGuardedRouter())

    harness.result.replace('/settings')
    harness.result.back()

    expect(routerMocks.router.replace).toHaveBeenCalledWith('/settings')
    expect(routerMocks.router.back).toHaveBeenCalledTimes(1)
  })
})
