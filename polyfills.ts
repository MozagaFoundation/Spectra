/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

/** Provides required web globals before route modules load. */

const {
  Event: EventShim,
  EventTarget: EventTargetShim,
} = require('event-target-shim') as {
  Event: new (type: string, init?: EventInit) => Event
  EventTarget: new () => EventTarget
}

type GlobalWithMutableCrypto = Omit<typeof globalThis, 'crypto'> & {
  crypto?: Partial<Crypto>
}

type MutableEventGlobals = {
  Event?: typeof Event
  EventTarget?: typeof EventTarget
  CustomEvent?: typeof CustomEvent
}

class CustomEventShim<T = unknown> extends EventShim {
  readonly detail: T

  constructor(type: string, init: CustomEventInit<T> = {}) {
    super(type, init)
    this.detail = init.detail as T
  }
}

export function ensureWebEventGlobals(target: MutableEventGlobals): void {
  if (
    typeof target.Event === 'function'
    && typeof target.EventTarget === 'function'
    && typeof target.CustomEvent === 'function'
  ) {
    return
  }

  Object.defineProperties(target, {
    Event: {
      configurable: true,
      writable: true,
      value: EventShim as unknown as typeof Event,
    },
    EventTarget: {
      configurable: true,
      writable: true,
      value: EventTargetShim as unknown as typeof EventTarget,
    },
    CustomEvent: {
      configurable: true,
      writable: true,
      value: CustomEventShim as unknown as typeof CustomEvent,
    },
  })
}

ensureWebEventGlobals(globalThis)

const mutableGlobal = globalThis as GlobalWithMutableCrypto

function ensureCryptoObject(): Partial<Crypto> {
  if (typeof mutableGlobal.crypto !== 'object' || mutableGlobal.crypto === null) {
    mutableGlobal.crypto = {}
  }
  return mutableGlobal.crypto
}

try {
  const { getRandomValues } = require('expo-crypto')

  const cryptoObject = ensureCryptoObject()
  if (typeof cryptoObject.getRandomValues !== 'function') {
    cryptoObject.getRandomValues = getRandomValues as Crypto['getRandomValues']
  }
} catch (_) {
  ensureCryptoObject()
}
