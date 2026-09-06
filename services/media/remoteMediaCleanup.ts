/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { isSameAccountStorageScope, normalizeAccountStorageScope } from '@/lib/accountScope'
import { consumeChatMediaWithBackend } from '@/services/backend/media'
import { getValidBackendAccessToken } from '@/services/backend/session'
import { useWalletStore } from '@/store/walletStore'
import {
  listPendingRemoteMediaDeletes,
  markRemoteMediaDeleteComplete,
} from './localMediaCache'

const cleanupTasks = new Map<string, Promise<void>>()
const MAX_CLEANUP_BATCH = 16

function isActiveScope(scope: string): boolean {
  return isSameAccountStorageScope(useWalletStore.getState().wallet?.address, scope)
}

export function schedulePendingRemoteMediaCleanup(walletAddress: string): void {
  const scope = normalizeAccountStorageScope(walletAddress)
  if (!scope || cleanupTasks.has(scope) || !isActiveScope(scope)) return
  const task = flushPendingRemoteMediaCleanup(scope).catch(() => undefined).finally(() => {
    if (cleanupTasks.get(scope) === task) cleanupTasks.delete(scope)
  })
  cleanupTasks.set(scope, task)
}

async function flushPendingRemoteMediaCleanup(scope: string): Promise<void> {
  const accessToken = await getValidBackendAccessToken()
  if (!accessToken || !isActiveScope(scope)) return
  const pending = await listPendingRemoteMediaDeletes(scope)
  await Promise.allSettled(pending.slice(0, MAX_CLEANUP_BATCH).map(async (entry) => {
    if (!isActiveScope(scope)) return
    try {
      await consumeChatMediaWithBackend(entry.mediaId, entry.objectRef, { accessToken })
      if (!isActiveScope(scope)) return
      await markRemoteMediaDeleteComplete(entry.mediaId, scope)
    } catch {
      // The durable marker remains for a later bounded pass.
    }
  }))
}
