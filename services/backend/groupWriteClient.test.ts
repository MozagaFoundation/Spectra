/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  backendRequest: vi.fn(),
  getValidBackendAccessToken: vi.fn(async () => 'access-token'),
}))

vi.mock('./request', () => ({
  backendRequest: mocks.backendRequest,
}))

vi.mock('./session', () => ({
  getValidBackendAccessToken: mocks.getValidBackendAccessToken,
}))

const { createGroup, insertGroupMessage, updateGroup } = await import('./groupWriteClient')

describe('group write backend client', () => {
  beforeEach(() => {
    mocks.backendRequest.mockReset()
    mocks.getValidBackendAccessToken.mockReset()
    mocks.getValidBackendAccessToken.mockResolvedValue('access-token')
    mocks.backendRequest.mockResolvedValue({ id: 'group-1' })
  })

  it('creates groups on the dedicated create route', async () => {
    await createGroup({
      groupId: '11111111-1111-4111-8111-111111111111',
      actorIdentityId: 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      title: 'Team',
      memberIdentityIds: [
        'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        'EXO00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      ],
      distributionId: '22222222-2222-4222-8222-222222222222',
    })

    expect(mocks.backendRequest).toHaveBeenCalledWith(
      '/v1/groups/create',
      {
        method: 'POST',
        body: expect.objectContaining({
          title: 'Team',
          groupId: '11111111-1111-4111-8111-111111111111',
        }),
      },
      { accessToken: 'access-token' },
    )
  })

  it('updates group metadata without using table writes', async () => {
    await updateGroup({
      groupId: '11111111-1111-4111-8111-111111111111',
      actorIdentityId: 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      avatarUrl: null,
    })

    expect(mocks.backendRequest).toHaveBeenCalledWith(
      '/v1/groups/update',
      {
        method: 'POST',
        body: expect.objectContaining({ avatarUrl: null }),
      },
      { accessToken: 'access-token' },
    )
  })

  it('publishes ciphertext on the group message route', async () => {
    await insertGroupMessage({
      id: '33333333-3333-4333-8333-333333333333',
      groupId: '11111111-1111-4111-8111-111111111111',
      senderIdentityId: 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      distributionId: '22222222-2222-4222-8222-222222222222',
      keyVersion: 1,
      groupRevision: 1,
      contentType: 'text',
      ciphertext: 'Yw==',
      nonce: 'AAAAAAAAAAAA',
      tag: 'AAAAAAAAAAAAAAAAAAAAAA==',
      signature: `0x${'ab'.repeat(3309)}`,
    })

    expect(mocks.backendRequest).toHaveBeenCalledWith(
      '/v1/groups/messages',
      {
        method: 'POST',
        body: expect.objectContaining({
          contentType: 'text',
          groupId: '11111111-1111-4111-8111-111111111111',
        }),
      },
      { accessToken: 'access-token' },
    )
  })
})
