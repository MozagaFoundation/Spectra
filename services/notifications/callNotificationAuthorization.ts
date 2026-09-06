/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import {
  isValidNotificationScopeId,
  resolveNotificationScopeWallet,
} from './notificationScope'

export async function isAuthorizedCallNotificationPayload(
  payload: Record<string, unknown> | null | undefined,
): Promise<boolean> {
  if (!payload || (payload.type !== 'call' && payload.type !== 'call_end')) {
    return false
  }
  if (
    payload.notificationProtocolVersion !== 2
    || !isValidNotificationScopeId(payload.notificationScopeId)
  ) {
    return false
  }
  return Boolean(await resolveNotificationScopeWallet(payload.notificationScopeId))
}
