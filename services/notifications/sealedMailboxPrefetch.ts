/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { fetchSealedRelayMessagesForPrefetch } from '@/services/backend/sealedMailboxPrefetch'
import { storeSealedPrefetchRows } from '@/services/storage/sealedPrefetchCache'
import { isClearnetEgressAllowed } from '@/services/tor/torEgressPolicy'
import { useSpectreStore } from '@/store/spectreStore'
import { useTorStore } from '@/services/tor/torStore'
import { loadPrefetchSession } from './prefetchSession'

const PREFETCH_TIMEOUT_MS = 12_000

export async function prefetchSealedMailbox(
  walletAddress: string,
): Promise<boolean> {
  if (!walletAddress.trim()) return false
  if (useSpectreStore.getState().enabled || useTorStore.getState().enabled) return false
  if (!isClearnetEgressAllowed()) return false

  const session = await loadPrefetchSession(walletAddress)
  if (!session) return false

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PREFETCH_TIMEOUT_MS)
  try {
    const rows = await fetchSealedRelayMessagesForPrefetch({
      accessToken: session.accessToken,
      afterSequence: session.afterSequence,
      signal: controller.signal,
    })
    if (rows.length === 0) return true
    await storeSealedPrefetchRows(walletAddress, rows)
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}
