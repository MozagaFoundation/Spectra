/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { STORAGE_KEYS } from '@/lib/constants'
import {
  __resetAppKeyValueStorageForTests,
  __setAppKeyValueStorageForTests,
  createMemoryKeyValueStorage,
} from '@/services/storage/keyValueStorage'
import { useVdfBannerPreferenceStore } from './vdfBannerPreferenceStore'

describe('useVdfBannerPreferenceStore', () => {
  beforeEach(() => {
    useVdfBannerPreferenceStore.setState({ visible: false, hydrated: false })
    __setAppKeyValueStorageForTests(createMemoryKeyValueStorage())
  })

  afterEach(() => {
    useVdfBannerPreferenceStore.setState({ visible: false, hydrated: false })
    __resetAppKeyValueStorageForTests()
  })

  it('defaults the banner to hidden until the user opts in', () => {
    expect(useVdfBannerPreferenceStore.getState().visible).toBe(false)
  })

  it('persists the opt-in and restores it on hydrate', async () => {
    await useVdfBannerPreferenceStore.getState().setVisible(true)
    expect(useVdfBannerPreferenceStore.getState().visible).toBe(true)

    useVdfBannerPreferenceStore.setState({ visible: false, hydrated: false })
    await useVdfBannerPreferenceStore.getState().hydrate()

    expect(useVdfBannerPreferenceStore.getState().visible).toBe(true)
    expect(useVdfBannerPreferenceStore.getState().hydrated).toBe(true)
  })

  it('clears the stored opt-in when the banner is turned off', async () => {
    const storage = createMemoryKeyValueStorage()
    __setAppKeyValueStorageForTests(storage)

    await useVdfBannerPreferenceStore.getState().setVisible(true)
    await useVdfBannerPreferenceStore.getState().setVisible(false)

    expect(useVdfBannerPreferenceStore.getState().visible).toBe(false)
    expect(await storage.getItem(STORAGE_KEYS.VDF_BANNER_VISIBLE)).toBeNull()
  })

  it('keeps a toggle that races ahead of hydrate', async () => {
    __setAppKeyValueStorageForTests(
      createMemoryKeyValueStorage([[STORAGE_KEYS.VDF_BANNER_VISIBLE, 'true']]),
    )

    const hydrate = useVdfBannerPreferenceStore.getState().hydrate()
    await useVdfBannerPreferenceStore.getState().setVisible(false)
    await hydrate

    expect(useVdfBannerPreferenceStore.getState().visible).toBe(false)
  })
})
