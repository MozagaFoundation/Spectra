/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type {
  DecryptedMessage,
  PublicKeyBundle,
  TelemetryFieldValue,
} from '@spectra/core-crypto'

type ReceivedMessageEventData = {
  message: DecryptedMessage & { serverSequence?: number }
  authenticatedSenderBundle?: PublicKeyBundle
  conversation?: {
    remoteIdentityId?: string
  }
}

type ProcessMessageReceivedEventOptions = {
  eventData: ReceivedMessageEventData | undefined
  handleIncomingMessage: (
    message: DecryptedMessage & { serverSequence?: number },
    authenticatedSenderBundle?: PublicKeyBundle,
  ) => Promise<void>
  recordDiagnostic: (name: string, fields?: Record<string, TelemetryFieldValue>) => void
  transportPath: string
  onAdvanceSequence?: (serverSequence: number) => void
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function processMessageReceivedEvent(
  options: ProcessMessageReceivedEventOptions,
): Promise<void> {
  const { eventData, handleIncomingMessage, recordDiagnostic, transportPath, onAdvanceSequence } = options
  if (!eventData?.message) {
    return
  }

  const message = {
    ...eventData.message,
    serverSequence: eventData.message.serverSequence,
  }

  const baseFields: Record<string, TelemetryFieldValue> = {
    messageId: message.id,
    conversationId: message.conversationId,
    senderIdentityId: message.senderId,
    serverSequence: message.serverSequence,
    remoteIdentityId: eventData.conversation?.remoteIdentityId,
    transportPath,
  }

  recordDiagnostic('service_message_received_event', {
    ...baseFields,
    deliveryStage: 'received',
  })

  try {
    await handleIncomingMessage(message, eventData.authenticatedSenderBundle)
    recordDiagnostic('service_message_received_event_processed', {
      ...baseFields,
      deliveryStage: 'projected',
    })

    if (message.serverSequence !== undefined && message.serverSequence > 0) {
      onAdvanceSequence?.(message.serverSequence)
    }
  } catch (error) {
    recordDiagnostic('service_message_received_event_failed', {
      ...baseFields,
      deliveryStage: 'projection_failed',
      error: describeError(error),
    })
    throw error
  }
}
