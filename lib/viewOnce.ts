/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type {
  ChatMessage,
  MediaAttachment,
  OneTimeMessage,
  OneTimeMessageKind,
} from '@/lib/types'
import { translate } from '@/lib/i18n'

export const VIEW_ONCE_CONSUMED_TEXT = translate('Opened once', { ns: 'chat' })

export function isOneTimeKind(value: unknown): value is OneTimeMessageKind {
  return value === 'text' || value === 'image' || value === 'voice_note'
}

export function getViewOncePreviewLabel(kind: OneTimeMessageKind): string {
  switch (kind) {
    case 'image':
      return translate('One-time photo', { ns: 'chat' })
    case 'voice_note':
      return translate('One-time voice note', { ns: 'chat' })
    case 'text':
    default:
      return translate('One-time message', { ns: 'chat' })
  }
}

export function inferViewOnceKindFromAttachment(
  attachment?: Pick<MediaAttachment, 'type'> | null,
): OneTimeMessageKind | null {
  if (!attachment) {
    return null
  }

  switch (attachment.type) {
    case 'image':
      return 'image'
    case 'voice_note':
      return 'voice_note'
    default:
      return null
  }
}

export function createLockedOneTimeMessage(
  kind: OneTimeMessageKind,
  options?: { requiresReveal?: boolean },
): OneTimeMessage {
  return {
    kind,
    state: 'locked',
    requiresReveal: options?.requiresReveal,
  }
}

export function createLockedGenericOneTimeMessage(): OneTimeMessage {
  return createLockedOneTimeMessage('text', { requiresReveal: true })
}

function createConsumedOneTimeMessage(
  kind: OneTimeMessageKind,
  consumedAt: number = Date.now(),
): OneTimeMessage {
  return {
    kind,
    state: 'consumed',
    consumedAt,
  }
}

export function isLockedOneTimeMessage(
  message?: Pick<ChatMessage, 'oneTime'> | null,
): boolean {
  return Boolean(message?.oneTime && message.oneTime.state !== 'consumed')
}

export function requiresOneTimeReveal(
  message?: Pick<ChatMessage, 'oneTime'> | null,
): boolean {
  return Boolean(message?.oneTime?.requiresReveal && message.oneTime.state !== 'consumed')
}

export function getChatMessagePreviewText(
  message: Pick<ChatMessage, 'content' | 'attachments' | 'oneTime'>,
): string {
  if (isLockedOneTimeMessage(message)) {
    return getViewOncePreviewLabel(message.oneTime!.kind)
  }

  const trimmedContent = message.content.trim()
  if (trimmedContent.length > 0) {
    return trimmedContent
  }

  const attachment = message.attachments?.[0]
  if (!attachment) {
    return translate('Message')
  }

  switch (attachment.type) {
    case 'image':
      return translate('Photo')
    case 'voice_note':
      return translate('Voice message')
    case 'video':
      return translate('Video')
    case 'document':
      return translate('Document')
    default:
      return translate('Attachment')
  }
}

export function getConsumedOneTimeUpdates(
  message: Pick<ChatMessage, 'oneTime'>,
  consumedAt: number = Date.now(),
): Pick<ChatMessage, 'content' | 'attachments' | 'oneTime'> {
  const kind = message.oneTime?.kind ?? 'text'

  return {
    content: VIEW_ONCE_CONSUMED_TEXT,
    attachments: undefined,
    oneTime: createConsumedOneTimeMessage(kind, consumedAt),
  }
}
