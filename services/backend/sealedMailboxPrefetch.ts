/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { SealedRelayedMessage } from '@spectra/core-crypto'

import { parseSealedPrefetchRow } from '@/services/storage/sealedPrefetchCache'
import { backendRequest } from './request'

const PREFETCH_LIMIT = 10
const PREFETCH_MAX_RESPONSE_BYTES = 2 * 1024 * 1024 + 64 * 1024

export async function fetchSealedRelayMessagesForPrefetch(input: {
  accessToken: string
  afterSequence: number
  signal?: AbortSignal
}): Promise<SealedRelayedMessage[]> {
  const afterSequence = Number.isSafeInteger(input.afterSequence) && input.afterSequence > 0
    ? input.afterSequence
    : 0
  const query = new URLSearchParams({
    deliveryClass: 'message',
    afterSequence: String(afterSequence),
    limit: String(PREFETCH_LIMIT),
  })
  const result = await backendRequest<{ messages?: unknown }>(
    `/v1/chat/sealed/messages?${query.toString()}`,
    { method: 'GET' },
    {
      accessToken: input.accessToken,
      signal: input.signal,
      disableIdentityRecovery: true,
      maxResponseBytes: PREFETCH_MAX_RESPONSE_BYTES,
    },
  )
  if (!Array.isArray(result.messages)) return []
  const rows: SealedRelayedMessage[] = []
  for (const value of result.messages) {
    const row = parseSealedPrefetchRow(value)
    if (row) rows.push(row)
  }
  return rows.sort((a, b) => a.serverSequence - b.serverSequence)
}
