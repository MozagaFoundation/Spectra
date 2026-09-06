/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  backendRequest: vi.fn(),
  uploadObject: vi.fn(),
}))

vi.mock('react-native', () => ({
  Platform: { OS: 'ios', Version: '18.0' },
}))

vi.mock('expo-constants', () => ({
  default: { deviceName: 'iPhone Test' },
}))

vi.mock('./appClient', () => ({
  isBackendConfigured: () => true,
}))

vi.mock('./client', () => ({
  backendRequest: mocks.backendRequest,
}))

vi.mock('./session', () => ({
  getValidBackendAccessToken: vi.fn(async () => 'access-token'),
}))

vi.mock('@/lib/appMetadata', () => ({
  getRuntimeAppVersion: () => '1.2.5',
}))

vi.mock('@/services/backend/objectStorage', () => ({
  uploadObjectWithBackend: mocks.uploadObject,
}))

describe('typed support backend client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.backendRequest.mockResolvedValue({
      id: 'ticket-1',
      userAddress: 'exo00wallet',
      category: 'bug',
      description: 'details',
      appVersion: '1.2.5',
      os: 'ios 18.0',
      deviceModel: 'iPhone Test',
      status: 'open',
      attachments: [],
      createdAt: '2026-07-10T00:00:00Z',
      retentionExpiresAt: '2028-07-10T00:00:00Z',
    })
    mocks.uploadObject.mockResolvedValue({
      objectRef: 'spectra://objects/users/u/support-attachments/evidence.enc',
      error: null,
    })
  })

  it('creates tickets and binds attachments through typed endpoints', async () => {
    const { submitSupportTicket } = await import('./support')
    const result = await submitSupportTicket(
      'exo00wallet',
      'bug',
      '  reproducible details  ',
      ['spectra://objects/users/u/support-attachments/evidence.enc'],
    )

    expect(result.error).toBeNull()
    expect(mocks.backendRequest).toHaveBeenNthCalledWith(
      1,
      '/v1/support/tickets',
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({
          userAddress: 'exo00wallet',
          description: 'reproducible details',
        }),
      }),
      { accessToken: 'access-token' },
    )
    expect(mocks.backendRequest).toHaveBeenNthCalledWith(
      2,
      '/v1/support/tickets/ticket-1/attachments',
      {
        method: 'POST',
        body: {
          objectRefs: ['spectra://objects/users/u/support-attachments/evidence.enc'],
        },
      },
      { accessToken: 'access-token' },
    )
  })

  it('uploads support images with ticket-bound object purpose', async () => {
    const { uploadSupportImage } = await import('./support')
    const result = await uploadSupportImage('ticket-1', 'file:///evidence.jpg', 'image/jpeg')

    expect(result.error).toBeNull()
    expect(mocks.uploadObject).toHaveBeenCalledWith(
      expect.objectContaining({
        fileUri: 'file:///evidence.jpg',
        purpose: 'support_attachment',
        ticketId: 'ticket-1',
      }),
      { accessToken: 'access-token' },
    )
  })
})
