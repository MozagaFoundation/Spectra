/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'

import {
  registerAccountRuntimeAbortListener,
  registerAccountRuntimeResetListener,
  resetActiveAccountRuntime,
} from './accountRuntimeLifecycle'

describe('account runtime lifecycle', () => {
  it('aborts active work before resetting presentation state', () => {
    const order: string[] = []
    const unregisterAbort = registerAccountRuntimeAbortListener(() => {
      order.push('abort')
    })
    const unregisterReset = registerAccountRuntimeResetListener(() => {
      order.push('reset')
    })

    resetActiveAccountRuntime()

    unregisterAbort()
    unregisterReset()
    expect(order).toEqual(['abort', 'reset'])
  })
})
