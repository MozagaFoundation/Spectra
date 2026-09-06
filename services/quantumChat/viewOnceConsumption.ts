/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { OneTimeMessage } from '@/lib/types'

export type ViewOnceConsumptionSource =
  | { kind: 'local' }
  | {
      kind: 'remote'
      controlSenderId: string
      localIdentityId?: string | null
    }

export type ViewOnceConsumptionRejectionReason =
  | 'invalid_consumed_at'
  | 'target_missing'
  | 'target_wrong_conversation'
  | 'target_not_view_once'
  | 'remote_missing_local_identity'
  | 'remote_target_not_own_message'

type ViewOnceConsumptionTarget = {
  consumedAt: number
  requestedConversationId: string
  targetExists: boolean
  targetConversationId?: string | null
  targetSenderId?: string | null
  targetOneTime?: Pick<OneTimeMessage, 'kind' | 'state'> | null
  source: ViewOnceConsumptionSource
}

type ViewOnceConsumptionDecision =
  | { allowed: true }
  | { allowed: false; reason: ViewOnceConsumptionRejectionReason }

export function authorizeViewOnceConsumption(
  target: ViewOnceConsumptionTarget,
): ViewOnceConsumptionDecision {
  if (!Number.isFinite(target.consumedAt) || target.consumedAt <= 0) {
    return { allowed: false, reason: 'invalid_consumed_at' }
  }

  if (!target.targetExists) {
    return { allowed: false, reason: 'target_missing' }
  }

  if (
    target.targetConversationId
    && target.targetConversationId !== target.requestedConversationId
  ) {
    return { allowed: false, reason: 'target_wrong_conversation' }
  }

  if (!target.targetOneTime) {
    return { allowed: false, reason: 'target_not_view_once' }
  }

  if (target.source.kind === 'local') {
    return { allowed: true }
  }

  if (!target.source.localIdentityId) {
    return { allowed: false, reason: 'remote_missing_local_identity' }
  }

  if (target.targetSenderId !== target.source.localIdentityId) {
    return { allowed: false, reason: 'remote_target_not_own_message' }
  }

  return { allowed: true }
}
