/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const getAllKeys = vi.fn()
const multiRemove = vi.fn()

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getAllKeys, multiRemove },
}))

describe('purgeRetiredFeatureStorage', () => {
  beforeEach(() => {
    getAllKeys.mockReset()
    multiRemove.mockReset()
  })

  it('removes only retired feature storage', async () => {
    getAllKeys.mockResolvedValue([
      'exo_kara_active_session:kara-1',
      'exo_kara_session_index:kara-1',
      'exo_kara_active_mode:kara-1',
      'spectra_broadcast_unread_v1:exo00abc',
      'exo_chat_preferences:exo00abc',
    ])

    const { purgeRetiredFeatureStorage } = await import('./retiredFeatureCleanup')

    await purgeRetiredFeatureStorage()

    expect(multiRemove).toHaveBeenCalledWith([
      'exo_kara_active_session:kara-1',
      'exo_kara_session_index:kara-1',
      'exo_kara_active_mode:kara-1',
      'spectra_broadcast_unread_v1:exo00abc',
    ])
  })

  it('does not write when there is no retired feature storage', async () => {
    getAllKeys.mockResolvedValue(['exo_chat_preferences:exo00abc'])

    const { purgeRetiredFeatureStorage } = await import('./retiredFeatureCleanup')

    await purgeRetiredFeatureStorage()

    expect(multiRemove).not.toHaveBeenCalled()
  })
})
