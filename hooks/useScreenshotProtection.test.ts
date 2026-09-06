/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SCREENSHOT_PROTECTION_KEY, SECURE_STORE_OPTIONS } from '@/lib/constants'

const hookMocks = vi.hoisted(() => ({
  conversations: [] as Array<{
    id: string
    type?: string
    remoteIdentityId?: string
    remoteScreenshotProtection?: boolean
  }>,
  effectCleanups: [] as Array<void | (() => void)>,
  interactionCancel: vi.fn(),
  runAfterInteractions: vi.fn((callback: () => void) => {
    callback()
    return { cancel: hookMocks.interactionCancel }
  }),
  preventScreenCaptureAsync: vi.fn(async () => {}),
  allowScreenCaptureAsync: vi.fn(async () => {}),
  isAvailableAsync: vi.fn(async () => true),
  getPermissionsAsync: vi.fn(async (): Promise<{ status: string; canAskAgain?: boolean }> => ({ status: 'granted' })),
  requestPermissionsAsync: vi.fn(async (): Promise<{ status: string; canAskAgain?: boolean }> => ({ status: 'granted' })),
  subscriptionRemove: vi.fn(),
  screenshotListener: null as null | (() => void),
  screenshotListeners: [] as Array<() => void>,
  addScreenshotListener: vi.fn((listener: () => void) => {
    hookMocks.screenshotListener = listener
    hookMocks.screenshotListeners.push(listener)
    return { remove: hookMocks.subscriptionRemove }
  }),
  sendScreenshotTakenNotification: vi.fn(async () => true),
  secureStoreValue: null as string | null,
  getItemAsync: vi.fn(async () => hookMocks.secureStoreValue),
  setItemAsync: vi.fn(async (_key: string, value: string) => {
    hookMocks.secureStoreValue = value
  }),
}))

vi.mock('react', () => ({
  useEffect: (callback: () => void | (() => void)) => {
    hookMocks.effectCleanups.push(callback())
  },
}))

vi.mock('react-native', () => ({
  InteractionManager: {
    runAfterInteractions: hookMocks.runAfterInteractions,
  },
}))

vi.mock('expo-screen-capture', () => ({
  preventScreenCaptureAsync: hookMocks.preventScreenCaptureAsync,
  allowScreenCaptureAsync: hookMocks.allowScreenCaptureAsync,
  isAvailableAsync: hookMocks.isAvailableAsync,
  getPermissionsAsync: hookMocks.getPermissionsAsync,
  requestPermissionsAsync: hookMocks.requestPermissionsAsync,
  addScreenshotListener: hookMocks.addScreenshotListener,
}))

vi.mock('expo-secure-store', () => ({
  getItemAsync: hookMocks.getItemAsync,
  setItemAsync: hookMocks.setItemAsync,
}))

vi.mock('@/store/chatStore', () => ({
  useChatStore: (selector: (state: { conversations: typeof hookMocks.conversations }) => unknown) => (
    selector({ conversations: hookMocks.conversations })
  ),
}))

vi.mock('@/services/quantumChat', () => ({
  sendScreenshotTakenNotification: hookMocks.sendScreenshotTakenNotification,
}))

async function flushAsyncWork() {
  await Promise.resolve()
  await Promise.resolve()
}

describe('useScreenshotProtection', () => {
  beforeEach(() => {
    vi.resetModules()
    hookMocks.conversations = []
    hookMocks.effectCleanups = []
    hookMocks.interactionCancel.mockClear()
    hookMocks.runAfterInteractions.mockClear()
    hookMocks.preventScreenCaptureAsync.mockClear()
    hookMocks.allowScreenCaptureAsync.mockClear()
    hookMocks.isAvailableAsync.mockClear()
    hookMocks.isAvailableAsync.mockResolvedValue(true)
    hookMocks.getPermissionsAsync.mockClear()
    hookMocks.getPermissionsAsync.mockResolvedValue({ status: 'granted' })
    hookMocks.requestPermissionsAsync.mockClear()
    hookMocks.subscriptionRemove.mockClear()
    hookMocks.screenshotListener = null
    hookMocks.screenshotListeners = []
    hookMocks.addScreenshotListener.mockClear()
    hookMocks.addScreenshotListener.mockImplementation((listener: () => void) => {
      hookMocks.screenshotListener = listener
      hookMocks.screenshotListeners.push(listener)
      return { remove: hookMocks.subscriptionRemove }
    })
    hookMocks.sendScreenshotTakenNotification.mockClear()
    hookMocks.secureStoreValue = null
    hookMocks.getItemAsync.mockClear()
    hookMocks.setItemAsync.mockClear()
  })

  it('does not toggle native screen-capture protection for remote peer state', async () => {
    hookMocks.conversations = [{
      id: 'conversation-1',
      remoteIdentityId: 'peer-1',
      remoteScreenshotProtection: true,
    }]

    const { useScreenshotProtection } = await import('./useScreenshotProtection')
    useScreenshotProtection('conversation-1')
    await flushAsyncWork()

    expect(hookMocks.preventScreenCaptureAsync).not.toHaveBeenCalled()
    expect(hookMocks.allowScreenCaptureAsync).not.toHaveBeenCalled()
    expect(hookMocks.addScreenshotListener).toHaveBeenCalledTimes(1)
  })

  it('does not prompt for screenshot listener permissions during chat navigation', async () => {
    hookMocks.conversations = [{
      id: 'conversation-1',
      remoteIdentityId: 'peer-1',
    }]
    hookMocks.getPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: true })

    const { useScreenshotProtection } = await import('./useScreenshotProtection')
    useScreenshotProtection('conversation-1')
    await flushAsyncWork()

    expect(hookMocks.requestPermissionsAsync).not.toHaveBeenCalled()
    expect(hookMocks.addScreenshotListener).not.toHaveBeenCalled()
  })

  it('does not install a listener without a direct peer', async () => {
    hookMocks.conversations = [
      { id: 'group-1', type: 'group', remoteIdentityId: 'peer-1' },
    ]

    const { useScreenshotProtection } = await import('./useScreenshotProtection')
    useScreenshotProtection(null)
    useScreenshotProtection('group-1')
    await flushAsyncWork()

    expect(hookMocks.runAfterInteractions).not.toHaveBeenCalled()
    expect(hookMocks.addScreenshotListener).not.toHaveBeenCalled()
  })

  it('defers listener installation and cleans it up on unmount', async () => {
    hookMocks.conversations = [{
      id: 'conversation-1',
      remoteIdentityId: 'peer-1',
    }]

    const { useScreenshotProtection } = await import('./useScreenshotProtection')
    useScreenshotProtection('conversation-1')
    await flushAsyncWork()

    expect(hookMocks.runAfterInteractions).toHaveBeenCalledTimes(1)

    for (const cleanup of hookMocks.effectCleanups) {
      cleanup?.()
    }

    expect(hookMocks.interactionCancel).toHaveBeenCalledTimes(1)
    expect(hookMocks.subscriptionRemove).toHaveBeenCalledTimes(1)
  })

  it('throttles screenshot notifications to the remote peer', async () => {
    hookMocks.conversations = [{
      id: 'conversation-1',
      remoteIdentityId: 'peer-1',
    }]
    const nowSpy = vi.spyOn(Date, 'now')

    const { useScreenshotProtection } = await import('./useScreenshotProtection')
    useScreenshotProtection('conversation-1')
    await flushAsyncWork()

    nowSpy.mockReturnValue(3_000)
    hookMocks.screenshotListener?.()
    nowSpy.mockReturnValue(3_500)
    hookMocks.screenshotListener?.()
    nowSpy.mockReturnValue(5_100)
    hookMocks.screenshotListener?.()

    expect(hookMocks.sendScreenshotTakenNotification).toHaveBeenCalledTimes(2)
    expect(hookMocks.sendScreenshotTakenNotification).toHaveBeenCalledWith('peer-1')
    nowSpy.mockRestore()
  })

  it('deduplicates screenshot notifications across duplicate listeners for the same peer', async () => {
    hookMocks.conversations = [{
      id: 'conversation-1',
      remoteIdentityId: 'peer-1',
    }]
    const nowSpy = vi.spyOn(Date, 'now')

    const { useScreenshotProtection } = await import('./useScreenshotProtection')
    useScreenshotProtection('conversation-1')
    useScreenshotProtection('conversation-1')
    await flushAsyncWork()

    nowSpy.mockReturnValue(10_000)
    for (const listener of hookMocks.screenshotListeners) {
      listener()
    }

    expect(hookMocks.addScreenshotListener).toHaveBeenCalledTimes(2)
    expect(hookMocks.sendScreenshotTakenNotification).toHaveBeenCalledTimes(1)
    expect(hookMocks.sendScreenshotTakenNotification).toHaveBeenCalledWith('peer-1')
    nowSpy.mockRestore()
  })

  it('reads screenshot protection as enabled by default and false when stored', async () => {
    const { getScreenshotProtectionEnabled } = await import('./useScreenshotProtection')

    await expect(getScreenshotProtectionEnabled()).resolves.toBe(true)

    hookMocks.secureStoreValue = 'false'
    await expect(getScreenshotProtectionEnabled()).resolves.toBe(false)
  })

  it('persists screenshot protection changes and notifies subscribers', async () => {
    const {
      setScreenshotProtectionEnabled,
      subscribeToScreenshotProtection,
    } = await import('./useScreenshotProtection')
    const listener = vi.fn()
    const unsubscribe = subscribeToScreenshotProtection(listener)
    await flushAsyncWork()
    listener.mockClear()

    await setScreenshotProtectionEnabled(false)

    expect(hookMocks.setItemAsync).toHaveBeenCalledWith(
      SCREENSHOT_PROTECTION_KEY,
      'false',
      SECURE_STORE_OPTIONS,
    )
    expect(listener).toHaveBeenCalledWith(false)

    unsubscribe()
    await setScreenshotProtectionEnabled(true)
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
