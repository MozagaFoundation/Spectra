/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it, vi } from 'vitest'

import { processMessageReceivedEvent } from './messageReceivedEvent'

describe('processMessageReceivedEvent', () => {
  it('records success and advances the sequence after projection', async () => {
    const handleIncomingMessage = vi.fn(async () => {})
    const recordDiagnostic = vi.fn()
    const onAdvanceSequence = vi.fn()

    await processMessageReceivedEvent({
      eventData: {
        message: {
          id: 'message-1',
          conversationId: 'conversation-1',
          senderId: 'remote-identity',
          content: 'Hello',
          timestamp: 1_717_171_717_000,
          signatureVerified: true,
          serverSequence: 99,
        },
        conversation: {
          remoteIdentityId: 'remote-identity',
        },
      },
      handleIncomingMessage,
      recordDiagnostic,
      transportPath: 'direct_relay',
      onAdvanceSequence,
    })

    expect(handleIncomingMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'message-1',
        serverSequence: 99,
      }),
      undefined,
    )
    expect(recordDiagnostic).toHaveBeenNthCalledWith(
      1,
      'service_message_received_event',
      expect.objectContaining({
        messageId: 'message-1',
        deliveryStage: 'received',
        transportPath: 'direct_relay',
      }),
    )
    expect(recordDiagnostic).toHaveBeenNthCalledWith(
      2,
      'service_message_received_event_processed',
      expect.objectContaining({
        messageId: 'message-1',
        deliveryStage: 'projected',
      }),
    )
    expect(onAdvanceSequence).toHaveBeenCalledWith(99)
  })

  it('forwards the authenticated sender bundle to projection', async () => {
    const handleIncomingMessage = vi.fn(async () => {})
    const authenticatedSenderBundle = {
      identityId: 'remote-identity',
      identityKey: 'identity-key',
    } as any

    await processMessageReceivedEvent({
      eventData: {
        message: {
          id: 'message-1',
          conversationId: 'conversation-1',
          senderId: 'remote-identity',
          content: 'Hello',
          timestamp: 1_717_171_717_000,
          signatureVerified: true,
        },
        authenticatedSenderBundle,
      },
      handleIncomingMessage,
      recordDiagnostic: vi.fn(),
      transportPath: 'direct_relay',
    })

    expect(handleIncomingMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'message-1' }),
      authenticatedSenderBundle,
    )
  })

  it('records failure and does not advance the sequence when projection fails', async () => {
    const handleIncomingMessage = vi.fn(async () => {
      throw new Error('replyTo is read-only')
    })
    const recordDiagnostic = vi.fn()
    const onAdvanceSequence = vi.fn()

    await expect(processMessageReceivedEvent({
      eventData: {
        message: {
          id: 'message-2',
          conversationId: 'conversation-2',
          senderId: 'remote-identity',
          content: 'Hello again',
          timestamp: 1_717_171_717_001,
          signatureVerified: true,
          serverSequence: 100,
        },
      },
      handleIncomingMessage,
      recordDiagnostic,
      transportPath: 'direct_relay',
      onAdvanceSequence,
    })).rejects.toThrow('replyTo is read-only')

    expect(recordDiagnostic).toHaveBeenNthCalledWith(
      1,
      'service_message_received_event',
      expect.objectContaining({
        messageId: 'message-2',
        deliveryStage: 'received',
      }),
    )
    expect(recordDiagnostic).toHaveBeenNthCalledWith(
      2,
      'service_message_received_event_failed',
      expect.objectContaining({
        messageId: 'message-2',
        deliveryStage: 'projection_failed',
        error: 'replyTo is read-only',
      }),
    )
    expect(onAdvanceSequence).not.toHaveBeenCalled()
  })

  it('ignores empty event payloads', async () => {
    const handleIncomingMessage = vi.fn(async () => {})
    const recordDiagnostic = vi.fn()

    await processMessageReceivedEvent({
      eventData: undefined,
      handleIncomingMessage,
      recordDiagnostic,
      transportPath: 'direct_relay',
    })

    expect(handleIncomingMessage).not.toHaveBeenCalled()
    expect(recordDiagnostic).not.toHaveBeenCalled()
  })

  it('does not advance missing, zero, or negative server sequences', async () => {
    const recordDiagnostic = vi.fn()
    const onAdvanceSequence = vi.fn()

    for (const serverSequence of [undefined, 0, -1]) {
      await processMessageReceivedEvent({
        eventData: {
          message: {
            id: `message-${serverSequence ?? 'missing'}`,
            conversationId: 'conversation-1',
            senderId: 'remote-identity',
            content: 'Hello',
            timestamp: 1_717_171_717_000,
            signatureVerified: true,
            serverSequence,
          },
        },
        handleIncomingMessage: vi.fn(async () => {}),
        recordDiagnostic,
        transportPath: 'direct_relay',
        onAdvanceSequence,
      })
    }

    expect(onAdvanceSequence).not.toHaveBeenCalled()
  })

  it('records non-Error projection failures without losing the thrown value', async () => {
    const handleIncomingMessage = vi.fn(async () => {
      throw 'projection failed'
    })
    const recordDiagnostic = vi.fn()

    await expect(processMessageReceivedEvent({
      eventData: {
        message: {
          id: 'message-3',
          conversationId: 'conversation-3',
          senderId: 'remote-identity',
          content: 'Hello again',
          timestamp: 1_717_171_717_002,
          signatureVerified: true,
          serverSequence: 101,
        },
      },
      handleIncomingMessage,
      recordDiagnostic,
      transportPath: 'direct_relay',
      onAdvanceSequence: vi.fn(),
    })).rejects.toBe('projection failed')

    expect(recordDiagnostic).toHaveBeenLastCalledWith(
      'service_message_received_event_failed',
      expect.objectContaining({
        messageId: 'message-3',
        error: 'projection failed',
      }),
    )
  })
})
