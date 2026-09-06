/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const backendRequest = vi.hoisted(() => vi.fn())

vi.mock('./client', () => ({
  backendRequest,
}))

const { abandonChatMediaWithBackend, consumeChatMediaWithBackend } = await import('./media')

describe('media backend adapter', () => {
  beforeEach(() => {
    backendRequest.mockReset()
    backendRequest.mockResolvedValue({})
  })

  it('uses the sender-authorized abandon route', async () => {
    await abandonChatMediaWithBackend(
      'media-1',
      'spectra://objects/users/sender/attachments/media-1.enc',
      { accessToken: 'token' },
    )

    expect(backendRequest).toHaveBeenCalledWith('/v1/media/abandon', {
      method: 'POST',
      body: {
        mediaId: 'media-1',
        objectRef: 'spectra://objects/users/sender/attachments/media-1.enc',
      },
    }, { accessToken: 'token' })
  })

  it('keeps recipient consumption on its distinct route', async () => {
    await consumeChatMediaWithBackend(
      'media-1',
      'spectra://objects/users/sender/attachments/media-1.enc',
      { accessToken: 'token' },
    )

    expect(backendRequest).toHaveBeenCalledWith('/v1/media/consume', expect.any(Object), {
      accessToken: 'token',
    })
  })
})

