/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { getAppKeyValueStorage } from './keyValueStorage'

const RETIRED_STORAGE_PREFIXES = [
  'exo_kara_active_session:',
  'exo_kara_session_index:',
  'exo_kara_active_mode:',
  'spectra_broadcast_unread_v1:',
] as const

export async function purgeRetiredFeatureStorage(): Promise<void> {
  const keys = await getAppKeyValueStorage().getAllKeys()
  const retiredKeys = keys.filter((key) =>
    RETIRED_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix)),
  )

  if (retiredKeys.length > 0) {
    await getAppKeyValueStorage().multiRemove(retiredKeys)
  }
}
