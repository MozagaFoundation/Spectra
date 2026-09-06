/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

/**
 * Canonical JSON stringify with stable key ordering.
 *
 * This is used for signatures that must survive storage/network round-trips
 * where object insertion order is not preserved.
 */
function canonicalizeJson(value: unknown): string | undefined {
  if (value === null) {
    return 'null'
  }

  if (typeof value !== 'object') {
    if (
      value === undefined
      || typeof value === 'function'
      || typeof value === 'symbol'
    ) {
      return undefined
    }
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizeJson(item) ?? 'null').join(',')}]`
  }

  const sortedKeys = Object.keys(value).sort()
  const pairs: string[] = []
  for (const key of sortedKeys) {
    const entryValue = (value as Record<string, unknown>)[key]
    const canonicalValue = canonicalizeJson(entryValue)
    if (canonicalValue === undefined) {
      continue
    }
    pairs.push(`${JSON.stringify(key)}:${canonicalValue}`)
  }
  return `{${pairs.join(',')}}`
}

export function canonicalJsonStringify(value: unknown): string {
  return canonicalizeJson(value) ?? 'null'
}
