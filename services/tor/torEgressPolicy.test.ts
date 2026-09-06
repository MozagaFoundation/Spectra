/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  assertClearnetEgressAllowed,
  isClearnetEgressAllowed,
  registerClearnetOperation,
  setClearnetEgressAllowed,
  TOR_CLEARNET_EGRESS_BLOCKED_ERROR,
} from './torEgressPolicy'

describe('Tor egress policy', () => {
  beforeEach(async () => {
    await setClearnetEgressAllowed(true)
  })

  afterEach(async () => {
    await setClearnetEgressAllowed(true)
  })

  it('starts closed until persisted Tor preferences are loaded', async () => {
    vi.resetModules()
    const freshPolicy = await import('./torEgressPolicy')

    expect(freshPolicy.isClearnetEgressAllowed()).toBe(false)
    expect(() => freshPolicy.assertClearnetEgressAllowed()).toThrow(
      TOR_CLEARNET_EGRESS_BLOCKED_ERROR,
    )
  })

  it('cancels active clearnet operations before closing the boundary', async () => {
    const cancel = vi.fn(async () => undefined)
    registerClearnetOperation(cancel)

    await setClearnetEgressAllowed(false)

    expect(cancel).toHaveBeenCalledTimes(1)
    expect(isClearnetEgressAllowed()).toBe(false)
    expect(() => assertClearnetEgressAllowed()).toThrow(TOR_CLEARNET_EGRESS_BLOCKED_ERROR)
  })

  it('rejects operations registered after the boundary closes', async () => {
    const cancel = vi.fn()
    await setClearnetEgressAllowed(false)

    expect(() => registerClearnetOperation(cancel)).toThrow(TOR_CLEARNET_EGRESS_BLOCKED_ERROR)
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it('does not cancel an operation that already completed', async () => {
    const cancel = vi.fn()
    const unregister = registerClearnetOperation(cancel)
    unregister()

    await setClearnetEgressAllowed(false)

    expect(cancel).not.toHaveBeenCalled()
  })
})
