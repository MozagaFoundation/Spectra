/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'
import { runBLENoiseSelfTest } from '../noiseSelfTest'

describe('BLE Noise self-test', () => {
  it('authenticates large credentials and transports plaintext through fragmented records', async () => {
    await expect(runBLENoiseSelfTest()).resolves.toBe(true)
  })
})
