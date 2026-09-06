/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const storage = new Map<string, string>()

vi.mock('react-native', () => ({
  NativeModules: {},
  Platform: { OS: 'android' },
}))

vi.mock('./keyValueStorage', () => ({
  getAppKeyValueStorage: () => ({
    getItem: async (key: string) => storage.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      storage.set(key, value)
    },
    removeItem: async (key: string) => {
      storage.delete(key)
    },
    getAllKeys: async () => [...storage.keys()],
    multiRemove: async (keys: string[]) => {
      for (const key of keys) storage.delete(key)
    },
  }),
}))

const sealedEnvelope = {
  version: 1,
  type: 'relay',
  ciphertext: 'aabb',
}

function row(id: string, sequence: number) {
  return {
    id,
    recipientMailboxToken: 'smbx1.mailbox-token-value',
    deliveryClass: 'message' as const,
    sealedEnvelope,
    status: 'pending' as const,
    serverSequence: sequence,
    createdAt: Date.now(),
    expiresAt: Date.now() + 60_000,
  }
}

describe('sealedPrefetchCache', () => {
  beforeEach(() => {
    storage.clear()
  })

  it('rejects plaintext-looking rows and stores sealed relay rows', async () => {
    const { parseSealedPrefetchRow, storeSealedPrefetchRows, takeSealedPrefetchRows } =
      await import('./sealedPrefetchCache')

    expect(parseSealedPrefetchRow({
      id: 'msg_plaintext',
      body: 'hello',
    })).toBeNull()
    expect(parseSealedPrefetchRow(row('msg_validsealedrow01', 3))).not.toBeNull()

    await storeSealedPrefetchRows('EXO00abc', [row('msg_validsealedrow01', 3)])
    await expect(takeSealedPrefetchRows('EXO00abc')).resolves.toEqual([
      expect.objectContaining({ id: 'msg_validsealedrow01', serverSequence: 3 }),
    ])
    await expect(takeSealedPrefetchRows('EXO00abc')).resolves.toEqual([])
  })

  it('does not consume native rows for a different wallet', async () => {
    const takeRows = vi.fn(async () => JSON.stringify({
      walletAddress: 'EXO00other',
      rows: [row('msg_validsealedrow01', 3)],
    }))
    vi.resetModules()
    vi.doMock('react-native', () => ({
      NativeModules: { SealedPrefetchModule: { takeRows } },
      Platform: { OS: 'ios' },
    }))
    const { takeSealedPrefetchRows } = await import('./sealedPrefetchCache')
    await expect(takeSealedPrefetchRows('EXO00abc')).resolves.toEqual([])
    expect(takeRows).toHaveBeenCalledWith('EXO00abc')
  })
})
