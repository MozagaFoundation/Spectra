/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { MnemonicValidationErrorCode } from '@spectra/identity-vault'

export interface MnemonicValidationErrorLike {
  code: MnemonicValidationErrorCode
  params?: Record<string, string>
}

export type MnemonicValidationTranslator = (
  key: string,
  options?: Record<string, unknown>,
) => string

const mnemonicValidationCodes = new Set<MnemonicValidationErrorCode>(
  [
    'mnemonic_invalid_word_count',
    'mnemonic_invalid_word',
    'mnemonic_invalid_checksum',
  ],
)

export function isMnemonicValidationError(error: unknown): error is MnemonicValidationErrorLike {
  return Boolean(
    error
    && typeof error === 'object'
    && 'code' in error
    && typeof error.code === 'string'
    && mnemonicValidationCodes.has(error.code as MnemonicValidationErrorCode),
  )
}

export function getMnemonicValidationDisplayMessage(
  error: MnemonicValidationErrorLike,
  format: MnemonicValidationTranslator,
): string {
  switch (error.code) {
    case 'mnemonic_invalid_word_count':
      return format('Mnemonic must be 12 or 24 words')
    case 'mnemonic_invalid_word':
      return format('Invalid word: "{{word}}"', {
        word: error.params?.word ?? '',
      })
    case 'mnemonic_invalid_checksum':
      return format('Invalid mnemonic checksum')
  }
}
