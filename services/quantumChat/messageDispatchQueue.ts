/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { TelemetryFieldValue } from '@spectra/core-crypto'

type QueueMessage = {
  id: string
  conversationId?: string
  senderId?: string
  serverSequence?: number
}

type QueueContext = {
  source: string
  latestServerSequence?: number
}

type MessageDispatchQueueOptions<T extends QueueMessage> = {
  dispatch: (messages: T[]) => Promise<void>
  recordDiagnostic?: (name: string, fields?: Record<string, TelemetryFieldValue>) => void
  yieldAfterBatch?: () => Promise<void>
  now?: () => number
}

export type MessageDispatchQueue<T extends QueueMessage> = {
  enqueue: (messages: T[], context: QueueContext) => Promise<void>
  clear: () => void
  getPendingCount: () => number
  isRunning: () => boolean
}

function getLatestServerSequence(messages: QueueMessage[]): number | undefined {
  const sequences = messages
    .map((message) => message.serverSequence ?? 0)
    .filter((sequence) => sequence > 0)
  return sequences.length > 0 ? Math.max(...sequences) : undefined
}

export function createMessageDispatchQueue<T extends QueueMessage>(
  options: MessageDispatchQueueOptions<T>,
): MessageDispatchQueue<T> {
  const now = options.now ?? Date.now
  let pendingMessages: T[] = []
  let drainPromise: Promise<void> | null = null
  let generation = 0

  const drain = async (activeGeneration: number): Promise<void> => {
    while (activeGeneration === generation && pendingMessages.length > 0) {
      const batch = pendingMessages
      pendingMessages = []
      const startedAt = now()
      const latestServerSequence = getLatestServerSequence(batch)
      options.recordDiagnostic?.('background_dispatch_start', {
        messageCount: batch.length,
        latestServerSequence: latestServerSequence ?? null,
      })

      try {
        await options.dispatch(batch)
        options.recordDiagnostic?.('background_dispatch_complete', {
          messageCount: batch.length,
          latestServerSequence: latestServerSequence ?? null,
          elapsedMs: now() - startedAt,
        })
      } catch (error) {
        options.recordDiagnostic?.('background_dispatch_failed', {
          messageCount: batch.length,
          latestServerSequence: latestServerSequence ?? null,
          elapsedMs: now() - startedAt,
          error: error instanceof Error ? error.message : String(error),
        })
      }

      await options.yieldAfterBatch?.()
    }
  }

  const startDrain = (): Promise<void> => {
    if (drainPromise) return drainPromise
    const activeGeneration = generation
    drainPromise = drain(activeGeneration).finally(() => {
      drainPromise = null
      if (pendingMessages.length > 0) {
        startDrain()
      }
    })
    return drainPromise
  }

  return {
    enqueue(messages, context) {
      if (messages.length === 0) return Promise.resolve()
      pendingMessages.push(...messages)
      const latestServerSequence = Math.max(
        context.latestServerSequence ?? 0,
        getLatestServerSequence(messages) ?? 0,
      ) || undefined
      options.recordDiagnostic?.('background_dispatch_queued', {
        source: context.source,
        messageCount: messages.length,
        pendingCount: pendingMessages.length,
        latestServerSequence: latestServerSequence ?? null,
        alreadyRunning: Boolean(drainPromise),
      })

      return startDrain()
    },

    clear() {
      pendingMessages = []
      generation += 1
    },

    getPendingCount() {
      return pendingMessages.length
    },

    isRunning() {
      return Boolean(drainPromise)
    },
  }
}
