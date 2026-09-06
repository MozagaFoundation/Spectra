/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { wordlist as englishWordlist } from '@scure/bip39/wordlists/english.js'

export function normalizeMnemonicPhrase(mnemonic: string): string {
  return mnemonic
    .normalize('NFKD')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .join(' ')
}

export function getEnglishBip39PrefixSuggestions(
  prefix: string,
  limit: number = 4,
): string[] {
  const normalizedPrefix = prefix.normalize('NFKD').trim().toLowerCase()
  const normalizedLimit = Number.isFinite(limit)
    ? Math.max(0, Math.floor(limit))
    : 0

  if (!normalizedPrefix || /\s/.test(normalizedPrefix) || normalizedLimit === 0) {
    return []
  }

  const suggestions: string[] = []
  for (const word of englishWordlist) {
    if (word.startsWith(normalizedPrefix)) {
      suggestions.push(word)
      if (suggestions.length === normalizedLimit) {
        break
      }
    }
  }

  return suggestions
}
