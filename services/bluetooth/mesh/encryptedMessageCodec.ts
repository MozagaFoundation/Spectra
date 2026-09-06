/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { EncryptedMessage } from '@spectra/core-crypto'
import { decodeBinaryValue, encodeBinaryValue } from './binaryValueCodec'

export function encodeBLEEncryptedMessage(
  message: EncryptedMessage,
): Uint8Array {
  return encodeBinaryValue(message)
}

export function decodeBLEEncryptedMessage(
  data: Uint8Array,
  expectedSenderIdentityId: string,
): EncryptedMessage {
  const parsed = decodeBinaryValue(data) as Partial<EncryptedMessage> | null
  const hasPlaintextHeader = Boolean(
    parsed?.header && typeof parsed.header === 'object',
  )
  const encryptedHeader = parsed?.encryptedHeader
  const hasEncryptedHeader = Boolean(
    encryptedHeader
    && typeof encryptedHeader === 'object'
    && typeof encryptedHeader.ciphertext === 'string'
    && typeof encryptedHeader.tag === 'string'
    && typeof encryptedHeader.nonce === 'string',
  )
  if (
    !parsed
    || typeof parsed !== 'object'
    || typeof parsed.ciphertext !== 'string'
    || typeof parsed.tag !== 'string'
    || typeof parsed.nonce !== 'string'
    || typeof parsed.signature !== 'string'
    || typeof parsed.version !== 'number'
    || hasPlaintextHeader === hasEncryptedHeader
    || !parsed.metadata
    || typeof parsed.metadata !== 'object'
    || parsed.metadata.senderId !== expectedSenderIdentityId
  ) {
    throw new Error('BLE direct encrypted message is invalid')
  }
  return parsed as EncryptedMessage
}
