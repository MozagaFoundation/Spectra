/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import * as Crypto from 'expo-crypto'

const CACHE_KEY_FORMAT = 'spectra-media-cache-v1'

export async function digestMediaCacheKey(
  domain: string,
  parts: readonly string[],
): Promise<string> {
  const material = new TextEncoder().encode(JSON.stringify([
    CACHE_KEY_FORMAT,
    domain,
    ...parts,
  ]))
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, material)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}
