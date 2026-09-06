/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { STORAGE_KEYS } from '@/lib/constants'
import { getAppKeyValueStorage } from '@/services/storage/keyValueStorage'

export const WALLET_CONTRIBUTION_NOTICE_VERSION = 'wallet-contribution-v1'

export async function hasWalletContributionNotice(): Promise<boolean> {
  const stored = await getAppKeyValueStorage()
    .getItem(STORAGE_KEYS.WALLET_CONTRIBUTION_NOTICE_SEEN)
    .catch(() => null)
  return stored === WALLET_CONTRIBUTION_NOTICE_VERSION
}

export async function acknowledgeWalletContributionNotice(): Promise<void> {
  await getAppKeyValueStorage().setItem(
    STORAGE_KEYS.WALLET_CONTRIBUTION_NOTICE_SEEN,
    WALLET_CONTRIBUTION_NOTICE_VERSION,
  )
}
