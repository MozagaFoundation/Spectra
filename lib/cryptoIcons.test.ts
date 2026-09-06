/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CRYPTO_NETWORKS } from '@/services/crypto/chainRegistry'

describe('crypto network icons', () => {
  it('covers every configured crypto network id', () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'cryptoIcons.ts'),
      'utf8',
    )
    const iconKeys = Array.from(source.matchAll(/^\s+([a-z]+): require\(/gm), (match) => match[1]).sort()
    const networkIds = CRYPTO_NETWORKS.map((network) => network.id).sort()

    expect(iconKeys).toEqual(networkIds)
  })
})
