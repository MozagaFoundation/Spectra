/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  store: new Map<string, string>(),
}))

vi.mock('@/lib/constants', () => ({
  STORAGE_KEYS: {
    WALLET_CONTRIBUTION_NOTICE_SEEN: 'exo_wallet_contribution_notice_seen_v1',
  },
}))

vi.mock('@/services/storage/keyValueStorage', () => ({
  getAppKeyValueStorage: () => ({
    getItem: async (key: string) => mockState.store.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      mockState.store.set(key, value)
    },
  }),
}))

import {
  acknowledgeWalletContributionNotice,
  hasWalletContributionNotice,
  WALLET_CONTRIBUTION_NOTICE_VERSION,
} from './walletContributionNotice'

describe('wallet contribution notice', () => {
  beforeEach(() => {
    mockState.store.clear()
  })

  it('is unseen until the current notice version is acknowledged', async () => {
    await expect(hasWalletContributionNotice()).resolves.toBe(false)

    mockState.store.set('exo_wallet_contribution_notice_seen_v1', 'stale-version')
    await expect(hasWalletContributionNotice()).resolves.toBe(false)
  })

  it('persists acknowledgement so the wallets tab does not show it again', async () => {
    await acknowledgeWalletContributionNotice()

    expect(mockState.store.get('exo_wallet_contribution_notice_seen_v1'))
      .toBe(WALLET_CONTRIBUTION_NOTICE_VERSION)
    await expect(hasWalletContributionNotice()).resolves.toBe(true)
  })
})
