/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { BundleHealthReason } from './bundleHealthCoordinator'

export type ChatReconcileOptions = {
  fullResync?: boolean
  restartRealtime?: boolean
  reason?: BundleHealthReason
  suppressLocalNotifications?: boolean
  skipBundleHealth?: boolean
}

const REASON_PRIORITY: Record<BundleHealthReason, number> = {
  foreground_resume: 0,
  initialization: 1,
  manual_recovery: 2,
  decryption_failure: 3,
}

function strongerReason(
  current?: BundleHealthReason,
  incoming?: BundleHealthReason,
): BundleHealthReason | undefined {
  if (!current) return incoming
  if (!incoming) return current
  return REASON_PRIORITY[incoming] > REASON_PRIORITY[current] ? incoming : current
}

export function mergeChatReconcileOptions(
  current: ChatReconcileOptions | null,
  incoming: ChatReconcileOptions,
): ChatReconcileOptions {
  return {
    fullResync: Boolean(current?.fullResync || incoming.fullResync),
    restartRealtime: Boolean(current?.restartRealtime || incoming.restartRealtime),
    reason: strongerReason(current?.reason, incoming.reason),
    suppressLocalNotifications: Boolean(
      current?.suppressLocalNotifications || incoming.suppressLocalNotifications,
    ),
    skipBundleHealth: current
      ? Boolean(current.skipBundleHealth && incoming.skipBundleHealth)
      : incoming.skipBundleHealth,
  }
}
