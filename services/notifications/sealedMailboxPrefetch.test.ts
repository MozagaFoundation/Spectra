/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  spectreEnabled: false,
  torEnabled: false,
  clearnetAllowed: true,
  session: {
    accessToken: 'token',
    afterSequence: 4,
  } as { accessToken: string; afterSequence: number } | null,
  fetched: [] as Array<{ id: string; serverSequence: number }>,
  stored: [] as Array<{ id: string; serverSequence: number }>,
}))

vi.mock('@/store/spectreStore', () => ({
  useSpectreStore: { getState: () => ({ enabled: mockState.spectreEnabled }) },
}))

vi.mock('@/services/tor/torStore', () => ({
  useTorStore: { getState: () => ({ enabled: mockState.torEnabled }) },
}))

vi.mock('@/services/tor/torEgressPolicy', () => ({
  isClearnetEgressAllowed: () => mockState.clearnetAllowed,
}))

vi.mock('./prefetchSession', () => ({
  loadPrefetchSession: vi.fn(async (walletAddress: string) => {
    if (!mockState.session) return null
    return {
      v: 1,
      apiBaseUrl: 'https://example.test',
      accessToken: mockState.session.accessToken,
      afterSequence: mockState.session.afterSequence,
      walletAddress,
      notificationScopeId: null,
      expiresAt: Date.now() + 60_000,
      appVersion: '1.2.5',
    }
  }),
}))

vi.mock('@/services/backend/sealedMailboxPrefetch', () => ({
  fetchSealedRelayMessagesForPrefetch: vi.fn(async () => mockState.fetched),
}))

vi.mock('@/services/storage/sealedPrefetchCache', () => ({
  storeSealedPrefetchRows: vi.fn(async (_wallet: string, rows: typeof mockState.stored) => {
    mockState.stored = rows
    return rows.length
  }),
}))

describe('sealedMailboxPrefetch', () => {
  beforeEach(() => {
    mockState.spectreEnabled = false
    mockState.torEnabled = false
    mockState.clearnetAllowed = true
    mockState.session = { accessToken: 'token', afterSequence: 4 }
    mockState.fetched = [{ id: 'msg_one', serverSequence: 5 }]
    mockState.stored = []
  })

  it('stores sealed rows without decrypting', async () => {
    const { prefetchSealedMailbox } = await import('./sealedMailboxPrefetch')
    await expect(prefetchSealedMailbox('EXO00abc')).resolves.toBe(true)
    expect(mockState.stored).toEqual([{ id: 'msg_one', serverSequence: 5 }])
  })

  it('skips Spectre, Tor, and closed clearnet', async () => {
    const { prefetchSealedMailbox } = await import('./sealedMailboxPrefetch')
    mockState.spectreEnabled = true
    await expect(prefetchSealedMailbox('EXO00abc')).resolves.toBe(false)
    mockState.spectreEnabled = false
    mockState.torEnabled = true
    await expect(prefetchSealedMailbox('EXO00abc')).resolves.toBe(false)
    mockState.torEnabled = false
    mockState.clearnetAllowed = false
    await expect(prefetchSealedMailbox('EXO00abc')).resolves.toBe(false)
    expect(mockState.stored).toEqual([])
  })
})
