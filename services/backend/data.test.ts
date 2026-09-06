/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const backendRequest = vi.fn(async () => ({
  data: { id: 'signal-1' },
  count: 1,
}))

const getValidBackendAccessToken = vi.fn(async () => 'access-token')

vi.mock('./client', () => ({
  backendRequest,
}))

vi.mock('@/services/backend/session', () => ({
  getValidBackendAccessToken,
}))

describe('backendData table adapter', () => {
  beforeEach(() => {
    backendRequest.mockClear()
    getValidBackendAccessToken.mockClear()
    backendRequest.mockResolvedValue({
      data: { id: 'signal-1' },
      count: 1,
    })
  })

  it('preserves insert action when selecting the inserted row', async () => {
    const { backendData } = await import('./data')
    const row = {
      call_session_id: 'session-1',
      sender_identity_id: 'alice',
      recipient_identity_id: 'peter',
    }

    const result = await backendData
      .table('call_signals')
      .insert(row)
      .select('id')
      .single()

    expect(result.error).toBeNull()
    expect(result.data).toEqual({ id: 'signal-1' })
    expect(backendRequest).toHaveBeenCalledWith('/v1/appdata/table', {
      method: 'POST',
      body: {
        table: 'call_signals',
        action: 'insert',
        select: 'id',
        options: {},
        filters: [],
        orderBy: [],
        limit: null,
        payload: row,
        mode: 'single',
      },
    }, { accessToken: 'access-token' })
  })

  it('keeps plain select queries as select actions', async () => {
    const { backendData } = await import('./data')

    await backendData
      .table('call_sessions')
      .select('id,state')
      .eq('id', 'session-1')
      .maybeSingle()

    expect(backendRequest).toHaveBeenCalledWith('/v1/appdata/table', expect.objectContaining({
      method: 'POST',
      body: expect.objectContaining({
        table: 'call_sessions',
        action: 'select',
        select: 'id,state',
        filters: [{ op: 'eq', column: 'id', value: 'session-1' }],
        mode: 'maybeSingle',
      }),
    }), { accessToken: 'access-token' })
  })

  it('preserves update action when selecting updated rows', async () => {
    const { backendData } = await import('./data')
    const payload = { status: 'processed' }

    await backendData
      .table('call_signals')
      .update(payload)
      .select('id,status')
      .eq('id', 'signal-1')
      .single()

    expect(backendRequest).toHaveBeenCalledWith('/v1/appdata/table', expect.objectContaining({
      method: 'POST',
      body: expect.objectContaining({
        table: 'call_signals',
        action: 'update',
        select: 'id,status',
        payload,
        filters: [{ op: 'eq', column: 'id', value: 'signal-1' }],
        mode: 'single',
      }),
    }), { accessToken: 'access-token' })
  })
})
