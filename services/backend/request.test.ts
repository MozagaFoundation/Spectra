/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUpdate: vi.fn(),
  torAwareFetch: vi.fn(),
}))

vi.mock('@/lib/constants', () => ({
  SPECTRA_API_URL: 'https://api.spectra.test',
}))

vi.mock('@/services/tor/torFetch', () => ({
  torAwareFetch: mocks.torAwareFetch,
}))

vi.mock('@/lib/appMetadata', () => ({
  getRuntimeAppVersion: () => '1.2.5',
}))

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}))

vi.mock('@/store/appUpdateStore', () => ({
  useAppUpdateStore: {
    getState: () => ({ requireUpdate: mocks.requireUpdate }),
  },
}))

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: vi.fn(async () => JSON.stringify(body)),
  } as unknown as Response
}

describe('backendRequest identity recovery', () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.requireUpdate.mockReset()
    mocks.torAwareFetch.mockReset()
  })

  it('adds app version metadata to backend requests', async () => {
    mocks.torAwareFetch.mockResolvedValue(response(200, { ok: true }))
    const { backendRequest } = await import('./request')

    await expect(backendRequest('/v1/market/prices', {
      method: 'GET',
    })).resolves.toEqual({ ok: true })

    expect(mocks.torAwareFetch).toHaveBeenCalledWith(
      'https://api.spectra.test/v1/market/prices',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Spectra-App-Version': '1.2.5',
          'X-Spectra-Client-Platform': 'ios',
        }),
      }),
    )
  })

  it('records a structured required-update response', async () => {
    const policy = {
      error: 'app_update_required',
      platform: 'ios',
      minimumSupportedVersion: '1.2.1',
      latestVersion: '1.4.0',
      storeUrl: 'https://apps.apple.com/us/app/spectra/id1234567890',
      updateAvailable: true,
      updateRequired: true,
    }
    mocks.torAwareFetch.mockResolvedValue(response(426, policy))
    const { backendRequest, SpectraBackendError } = await import('./request')

    await expect(backendRequest('/v1/appdata/table', {
      method: 'POST',
      body: {},
    })).rejects.toMatchObject({
      status: 426,
      code: 'app_update_required',
      appUpdatePolicy: expect.objectContaining({
        latestVersion: '1.4.0',
        updateRequired: true,
      }),
    } satisfies Partial<InstanceType<typeof SpectraBackendError>>)

    expect(mocks.requireUpdate).toHaveBeenCalledWith(expect.objectContaining({
      latestVersion: '1.4.0',
      updateRequired: true,
    }))
  })

  it('repairs a stale identity binding and replays once with the new token', async () => {
    mocks.torAwareFetch
      .mockResolvedValueOnce(response(403, { error: 'identity_binding_required' }))
      .mockResolvedValueOnce(response(200, { saved: true }))
    const {
      backendRequest,
      registerBackendIdentityRecovery,
    } = await import('./request')
    const recover = vi.fn(async () => 'repaired-token')
    registerBackendIdentityRecovery(recover)

    await expect(backendRequest('/v1/appdata/table', {
      method: 'POST',
      body: { table: 'chat_media' },
    }, { accessToken: 'stale-token' })).resolves.toEqual({ saved: true })

    expect(recover).toHaveBeenCalledTimes(1)
    expect(mocks.torAwareFetch).toHaveBeenCalledTimes(2)
    expect(mocks.torAwareFetch.mock.calls[1]?.[1]).toEqual(expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer repaired-token' }),
    }))
  })

  it('does not reconnect or replay ordinary authorization failures', async () => {
    mocks.torAwareFetch.mockResolvedValue(response(403, { error: 'forbidden' }))
    const {
      backendRequest,
      registerBackendIdentityRecovery,
    } = await import('./request')
    const recover = vi.fn(async () => 'unused-token')
    registerBackendIdentityRecovery(recover)

    await expect(backendRequest('/v1/appdata/table', {
      method: 'POST',
      body: {},
    }, { accessToken: 'valid-token' })).rejects.toMatchObject({
      status: 403,
      code: 'forbidden',
    })

    expect(recover).not.toHaveBeenCalled()
    expect(mocks.torAwareFetch).toHaveBeenCalledTimes(1)
  })

  it('skips identity recovery when the caller disabled it', async () => {
    mocks.torAwareFetch.mockResolvedValue(response(403, { error: 'identity_binding_required' }))
    const {
      backendRequest,
      registerBackendIdentityRecovery,
    } = await import('./request')
    const recover = vi.fn(async () => 'unused-token')
    registerBackendIdentityRecovery(recover)

    await expect(backendRequest('/v1/chat/sealed/messages', {
      method: 'GET',
    }, {
      accessToken: 'prefetch-token',
      disableIdentityRecovery: true,
    })).rejects.toMatchObject({
      status: 403,
      code: 'identity_binding_required',
    })

    expect(recover).not.toHaveBeenCalled()
    expect(mocks.torAwareFetch).toHaveBeenCalledTimes(1)
  })
})
