/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { deleteBackendAccount, getBackendAccountDeletionStatus } from './account'

const mockState = vi.hoisted(() => ({
  fetch: vi.fn(),
}))

vi.mock('@/lib/constants', () => ({
  SPECTRA_API_URL: 'https://api.example',
  STORAGE_KEYS: { VAULT: 'exo_vault' },
}))
vi.mock('@/services/tor/torFetch', () => ({
  torAwareFetch: mockState.fetch,
}))

describe('deleteBackendAccount', () => {
  beforeEach(() => {
    mockState.fetch.mockReset()
  })

  it('deletes the authenticated backend account with an explicit confirmation body', async () => {
    mockState.fetch.mockResolvedValueOnce(new Response(JSON.stringify({
      postgresRowsDeleted: 3,
      relayRowsDeleted: 2,
      objectsDeleted: 1,
    }), { status: 200 }))

    const result = await deleteBackendAccount({ accessToken: 'access-token' })

    expect(result).toEqual({
      postgresRowsDeleted: 3,
      relayRowsDeleted: 2,
      objectsDeleted: 1,
    })
    expect(mockState.fetch).toHaveBeenCalledWith(
      'https://api.example/v1/account/delete',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ confirmation: 'DELETE' }),
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    )
  })

  it('attaches an operation token when resumable deletion is requested', async () => {
    mockState.fetch.mockResolvedValueOnce(new Response(JSON.stringify({
      postgresRowsDeleted: 3,
      relayRowsDeleted: 0,
      objectsDeleted: 0,
      cleanupPending: true,
      status: 'pending',
      stage: 'objects',
    }), { status: 202 }))

    await deleteBackendAccount(
      { accessToken: 'access-token' },
      'ab'.repeat(32),
    )

    expect(mockState.fetch).toHaveBeenCalledWith(
      'https://api.example/v1/account/delete',
      expect.objectContaining({
        body: JSON.stringify({
          confirmation: 'DELETE',
          operationToken: 'ab'.repeat(32),
        }),
      }),
    )
  })

  it('checks coarse deletion status without sending account credentials', async () => {
    mockState.fetch.mockResolvedValueOnce(new Response(JSON.stringify({
      status: 'pending',
      stage: 'relay',
    }), { status: 200 }))

    await expect(getBackendAccountDeletionStatus('cd'.repeat(32))).resolves.toEqual({
      status: 'pending',
      stage: 'relay',
    })

    expect(mockState.fetch).toHaveBeenCalledWith(
      'https://api.example/v1/account/delete/status',
      expect.objectContaining({
        body: JSON.stringify({ operationToken: 'cd'.repeat(32) }),
        headers: expect.not.objectContaining({
          Authorization: expect.anything(),
        }),
      }),
    )
  })
})
