/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import {
  applyCryptoPaymentRequestUpdateToContent,
  type CryptoPaymentRequestUpdate,
} from '../shared/cryptoPaymentRequest'
import {
  getScopedSealedStorageRecord,
  setScopedSealedStorageRecord,
} from '../storage'

type StoredPaymentRequestSettlement = CryptoPaymentRequestUpdate & {
  storedAt: number
}

type MessageWithContent = {
  id?: string
  content?: string
  [key: string]: unknown
}

type StoredPaymentRequestSettlementMap = Record<string, StoredPaymentRequestSettlement>

const SETTLEMENTS_RECORD_PREFIX = 'payment_request_settlements_v1_'

function encodeKeyPart(value: string): string {
  return encodeURIComponent(value)
}

function settlementsRecordKey(conversationId: string): string {
  return `${SETTLEMENTS_RECORD_PREFIX}${encodeKeyPart(conversationId)}`
}

function shouldReplaceSettlement(
  existing: StoredPaymentRequestSettlement | null,
  update: CryptoPaymentRequestUpdate,
): boolean {
  if (!existing) return true
  if (existing.txHash !== update.txHash) return false
  return existing.status === 'pending' && update.status === 'confirmed'
}

export async function storeCryptoPaymentRequestSettlement(
  conversationId: string,
  update: CryptoPaymentRequestUpdate,
): Promise<void> {
  const recordKey = settlementsRecordKey(conversationId)
  const records = await getScopedSealedStorageRecord<StoredPaymentRequestSettlementMap>(recordKey) ?? {}
  const existing = records[update.requestId] ?? null
  if (!shouldReplaceSettlement(existing, update)) {
    return
  }

  await setScopedSealedStorageRecord<StoredPaymentRequestSettlementMap>(recordKey, {
    ...records,
    [update.requestId]: {
      ...update,
      storedAt: Date.now(),
    },
  })
}

export async function getCryptoPaymentRequestSettlements(
  conversationId: string,
): Promise<CryptoPaymentRequestUpdate[]> {
  const records = await getScopedSealedStorageRecord<StoredPaymentRequestSettlementMap>(
    settlementsRecordKey(conversationId),
  )
  return records ? Object.values(records) : []
}

export async function applyStoredCryptoPaymentRequestSettlements<T extends MessageWithContent>(
  conversationId: string,
  messages: T[],
): Promise<T[]> {
  const settlements = await getCryptoPaymentRequestSettlements(conversationId)
  if (settlements.length === 0) return messages

  return messages.map((message) => {
    if (typeof message.content !== 'string') return message

    for (const settlement of settlements) {
      const content = applyCryptoPaymentRequestUpdateToContent(message.content, settlement)
      if (content) {
        return {
          ...message,
          content,
        }
      }
    }

    return message
  })
}
