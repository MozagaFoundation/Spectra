/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it, vi } from 'vitest'

import { ensureWebEventGlobals } from './polyfills'

describe('web event polyfills', () => {
  it('installs a compatible Event, EventTarget, and CustomEvent set', () => {
    const isolatedGlobal: {
      Event?: typeof Event
      EventTarget?: typeof EventTarget
      CustomEvent?: typeof CustomEvent
    } = {}

    ensureWebEventGlobals(isolatedGlobal)

    const target = new isolatedGlobal.EventTarget!()
    const listener = vi.fn()
    target.addEventListener('ready', listener)

    const event = new isolatedGlobal.CustomEvent!('ready', {
      detail: { sessionId: 'session-1' },
    })
    expect(target.dispatchEvent(event)).toBe(true)
    expect(listener).toHaveBeenCalledOnce()
    expect(listener.mock.calls[0]?.[0]).toBe(event)
    expect(event.detail).toEqual({ sessionId: 'session-1' })
  })

  it('preserves a complete native implementation', () => {
    const nativeGlobals = {
      Event,
      EventTarget,
      CustomEvent,
    }

    ensureWebEventGlobals(nativeGlobals)

    expect(nativeGlobals.Event).toBe(Event)
    expect(nativeGlobals.EventTarget).toBe(EventTarget)
    expect(nativeGlobals.CustomEvent).toBe(CustomEvent)
  })
})
