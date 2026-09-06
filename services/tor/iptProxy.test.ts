/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

async function loadIptProxy(nativeModule?: {
  startObfs4?: ReturnType<typeof vi.fn>
  startSnowflake?: ReturnType<typeof vi.fn>
  startWebtunnel?: ReturnType<typeof vi.fn>
  stopTransports?: ReturnType<typeof vi.fn>
}) {
  vi.resetModules()
  vi.doMock('react-native', () => ({
    NativeModules: nativeModule ? { IPtProxyModule: nativeModule } : {},
    Platform: { OS: 'ios' },
  }))

  return import('./iptProxy')
}

beforeEach(() => {
  vi.stubGlobal('__DEV__', false)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.doUnmock('react-native')
})

describe('iptProxy', () => {
  it('reports unavailable native bindings and no-ops stopTransports', async () => {
    const iptProxy = await loadIptProxy()

    expect(iptProxy.isIPtProxyAvailable()).toBe(false)
    await expect(iptProxy.stopTransports()).resolves.toBeUndefined()
    await expect(iptProxy.startTransport('obfs4')).rejects.toThrow('IPtProxyModule is not available')
  })

  it('dispatches each transport to the matching native method', async () => {
    const nativeModule = {
      startObfs4: vi.fn(async () => ({ port: 1111 })),
      startSnowflake: vi.fn(async () => ({ port: 2222 })),
      startWebtunnel: vi.fn(async () => ({ port: 3333 })),
      stopTransports: vi.fn(async () => {}),
    }
    const iptProxy = await loadIptProxy(nativeModule)

    await expect(iptProxy.startTransport('obfs4')).resolves.toBe(1111)
    await expect(iptProxy.startTransport('snowflake')).resolves.toBe(2222)
    await expect(iptProxy.startTransport('webtunnel')).resolves.toBe(3333)
    await iptProxy.stopTransports()

    expect(nativeModule.startObfs4).toHaveBeenCalledTimes(1)
    expect(nativeModule.startSnowflake).toHaveBeenCalledTimes(1)
    expect(nativeModule.startWebtunnel).toHaveBeenCalledTimes(1)
    expect(nativeModule.stopTransports).toHaveBeenCalledTimes(1)
  })

  it('rejects invalid native ports and propagates stop failures', async () => {
    const nativeModule = {
      startObfs4: vi.fn(async () => ({ port: 0 })),
      startSnowflake: vi.fn(async () => ({ port: 2222 })),
      startWebtunnel: vi.fn(async () => ({ port: 3333 })),
      stopTransports: vi.fn(async () => {
        throw new Error('stop failed')
      }),
    }
    const iptProxy = await loadIptProxy(nativeModule)

    await expect(iptProxy.startTransport('obfs4')).rejects.toThrow('invalid port')
    await expect(iptProxy.stopTransports()).rejects.toThrow('stop failed')
  })
})
