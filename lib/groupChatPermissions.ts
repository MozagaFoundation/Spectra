/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { GroupMemberRole } from '@/lib/types'

export function canManageGroupDisappearingTimer(
  role?: GroupMemberRole | null,
): boolean {
  return role === 'owner' || role === 'admin'
}
