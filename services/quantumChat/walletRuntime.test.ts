/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it, vi } from 'vitest'
import {
  StaleWalletRuntimeError,
  WalletRuntimeController,
} from './walletRuntime'

describe('WalletRuntimeController', () => {
  it('invalidates the previous generation and rejects stale commits', () => {
    const controller = new WalletRuntimeController()
    const first = controller.begin('exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
    const second = controller.begin('exo00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')

    expect(controller.isCurrent(first)).toBe(false)
    expect(controller.isCurrent(second)).toBe(true)
    expect(first.signal.aborted).toBe(true)
    expect(second.signal.aborted).toBe(false)
    expect(() => first.assertActive()).toThrow(StaleWalletRuntimeError)
  })

  it('waits for retired runtime work before allowing storage scope handoff', async () => {
    const controller = new WalletRuntimeController()
    const runtime = controller.begin('exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
    let release!: () => void
    const task = new Promise<void>((resolve) => {
      release = resolve
    })
    runtime.track(task)

    controller.invalidate()
    let settled = false
    const idle = controller.waitForIdle().then(() => {
      settled = true
    })

    await Promise.resolve()
    expect(settled).toBe(false)
    release()
    await idle
    expect(settled).toBe(true)
  })

  it('tracks rejected work without creating unhandled cleanup failures', async () => {
    const controller = new WalletRuntimeController()
    const runtime = controller.begin('exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
    const rejection = vi.fn()
    const task = Promise.reject(new Error('expected')).catch(rejection)

    await runtime.track(task)
    controller.invalidate()
    await controller.waitForIdle()

    expect(rejection).toHaveBeenCalledOnce()
  })
})
