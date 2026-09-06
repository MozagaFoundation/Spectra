/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const screenCaptureMocks = vi.hoisted(() => ({
  preventScreenCaptureAsync: vi.fn(async () => {}),
  allowScreenCaptureAsync: vi.fn(async () => {}),
}))

vi.mock('expo-screen-capture', () => screenCaptureMocks)

describe('screenCaptureProtection', () => {
  beforeEach(() => {
    vi.resetModules()
    screenCaptureMocks.preventScreenCaptureAsync.mockReset()
    screenCaptureMocks.preventScreenCaptureAsync.mockResolvedValue(undefined)
    screenCaptureMocks.allowScreenCaptureAsync.mockReset()
    screenCaptureMocks.allowScreenCaptureAsync.mockResolvedValue(undefined)
  })

  it('uses one stable native key for root-owned protection', async () => {
    const {
      SCREEN_CAPTURE_PROTECTION_KEY,
      __resetScreenCaptureProtectionForTests,
      setRootScreenCaptureProtectionEnabled,
    } = await import('./screenCaptureProtection')
    __resetScreenCaptureProtectionForTests()

    await setRootScreenCaptureProtectionEnabled(true)
    await setRootScreenCaptureProtectionEnabled(false)

    expect(screenCaptureMocks.preventScreenCaptureAsync).toHaveBeenCalledWith(SCREEN_CAPTURE_PROTECTION_KEY)
    expect(screenCaptureMocks.allowScreenCaptureAsync).toHaveBeenCalledWith(SCREEN_CAPTURE_PROTECTION_KEY)
  })

  it('does not stack duplicate native enable calls', async () => {
    const {
      __resetScreenCaptureProtectionForTests,
      setRootScreenCaptureProtectionEnabled,
    } = await import('./screenCaptureProtection')
    __resetScreenCaptureProtectionForTests()

    await setRootScreenCaptureProtectionEnabled(true)
    await setRootScreenCaptureProtectionEnabled(true)

    expect(screenCaptureMocks.preventScreenCaptureAsync).toHaveBeenCalledTimes(1)
    expect(screenCaptureMocks.allowScreenCaptureAsync).not.toHaveBeenCalled()
  })

  it('serializes enable and disable transitions', async () => {
    let releaseEnable!: () => void
    screenCaptureMocks.preventScreenCaptureAsync.mockImplementationOnce(() => new Promise<void>((resolve) => {
      releaseEnable = resolve
    }))

    const {
      __resetScreenCaptureProtectionForTests,
      setRootScreenCaptureProtectionEnabled,
    } = await import('./screenCaptureProtection')
    __resetScreenCaptureProtectionForTests()

    const enablePromise = setRootScreenCaptureProtectionEnabled(true)
    for (let i = 0; i < 5 && !releaseEnable; i++) {
      await Promise.resolve()
    }
    const disablePromise = setRootScreenCaptureProtectionEnabled(false)

    expect(screenCaptureMocks.allowScreenCaptureAsync).not.toHaveBeenCalled()

    releaseEnable()
    await Promise.all([enablePromise, disablePromise])

    expect(screenCaptureMocks.preventScreenCaptureAsync).toHaveBeenCalledTimes(1)
    expect(screenCaptureMocks.allowScreenCaptureAsync).toHaveBeenCalledTimes(1)
  })

  it('keeps the desired state retryable after a native enable failure', async () => {
    screenCaptureMocks.preventScreenCaptureAsync
      .mockRejectedValueOnce(new Error('native unavailable'))
      .mockResolvedValueOnce(undefined)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const {
      __resetScreenCaptureProtectionForTests,
      setRootScreenCaptureProtectionEnabled,
    } = await import('./screenCaptureProtection')
    __resetScreenCaptureProtectionForTests()

    await setRootScreenCaptureProtectionEnabled(true)
    await setRootScreenCaptureProtectionEnabled(true)

    expect(screenCaptureMocks.preventScreenCaptureAsync).toHaveBeenCalledTimes(2)
    expect(warnSpy).toHaveBeenCalledWith(
      'Failed to enable screenshot protection:',
      expect.any(Error),
    )
  })

  it('shares one native protection lease with sensitive screens', async () => {
    const {
      SCREEN_CAPTURE_PROTECTION_KEY,
      __resetScreenCaptureProtectionForTests,
      acquireSensitiveScreenProtection,
      setRootScreenCaptureProtectionEnabled,
      subscribeToSensitiveScreenProtection,
    } = await import('./screenCaptureProtection')
    __resetScreenCaptureProtectionForTests()
    const listener = vi.fn()
    const unsubscribe = subscribeToSensitiveScreenProtection(listener)

    await setRootScreenCaptureProtectionEnabled(true)
    const releaseFirst = await acquireSensitiveScreenProtection()
    const releaseSecond = await acquireSensitiveScreenProtection()
    await releaseFirst()

    expect(screenCaptureMocks.preventScreenCaptureAsync).toHaveBeenCalledWith(
      SCREEN_CAPTURE_PROTECTION_KEY,
    )
    expect(screenCaptureMocks.preventScreenCaptureAsync).toHaveBeenCalledTimes(1)
    expect(screenCaptureMocks.allowScreenCaptureAsync).not.toHaveBeenCalled()

    await setRootScreenCaptureProtectionEnabled(false)
    expect(screenCaptureMocks.allowScreenCaptureAsync).not.toHaveBeenCalled()

    await releaseSecond()

    expect(screenCaptureMocks.allowScreenCaptureAsync).toHaveBeenCalledWith(
      SCREEN_CAPTURE_PROTECTION_KEY,
    )
    expect(listener.mock.calls.map(([enabled]) => enabled)).toEqual([false, true, false])
    unsubscribe()
  })

  it('rejects sensitive-screen acquisition when native protection fails', async () => {
    screenCaptureMocks.preventScreenCaptureAsync.mockRejectedValueOnce(
      new Error('native unavailable'),
    )
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const {
      __resetScreenCaptureProtectionForTests,
      acquireSensitiveScreenProtection,
      subscribeToSensitiveScreenProtection,
    } = await import('./screenCaptureProtection')
    __resetScreenCaptureProtectionForTests()
    const listener = vi.fn()
    subscribeToSensitiveScreenProtection(listener)

    await expect(acquireSensitiveScreenProtection()).rejects.toThrow('native unavailable')
    expect(listener.mock.calls.map(([enabled]) => enabled)).toEqual([false, true, false])
    expect(screenCaptureMocks.allowScreenCaptureAsync).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalled()
  })
})
