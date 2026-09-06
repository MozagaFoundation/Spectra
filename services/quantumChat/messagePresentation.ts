/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { MediaAttachment } from '@/lib/types'
import { translate } from '@/lib/i18n'
import { getViewOncePreviewLabel } from '@/lib/viewOnce'
import { isCallInvitation, parseCallInvitation } from '../shared/callInvitationFormat'
import { parseMediaFromContent } from '../media/qmediaProtocol'
import {
  isControlEnvelope,
  parseDirectEnvelope,
  SCREENSHOT_TAKEN_NOTICE_TEXT,
  type ParsedEnvelope,
} from './envelopes'

function getAttachmentLabel(attachment: MediaAttachment | undefined, isOwn: boolean): string {
  switch (attachment?.type) {
    case 'voice_note':
      return translate(isOwn ? 'Voice message sent' : 'Voice message received')
    case 'image':
      return translate(isOwn ? 'Image sent' : 'Image received')
    case 'video':
      return translate(isOwn ? 'Video sent' : 'Video received')
    case 'document':
      return translate(isOwn ? 'Document sent' : 'Document received')
    default:
      return translate(isOwn ? 'Attachment sent' : 'Attachment received')
  }
}

function getCallInvitationPreview(
  content: string,
  direction: 'incoming' | 'outgoing',
): string {
  const invitation = parseCallInvitation(content)
  if (!invitation) {
    return translate('Call')
  }

  if (direction === 'outgoing') {
    return invitation.callType === 'video'
      ? translate('Outgoing video call', { ns: 'chat' })
      : translate('Outgoing voice call', { ns: 'chat' })
  }

  return invitation.callType === 'video'
    ? translate('Incoming video call', { ns: 'chat' })
    : translate('Incoming voice call', { ns: 'chat' })
}

export function buildDirectMessagePreview(
  content: string,
  attachments?: MediaAttachment[],
  options?: { isOwn?: boolean; envelope?: ParsedEnvelope },
): { preview: string; isCallInvite: boolean } {
  if (isCallInvitation(content)) {
    return {
      preview: getCallInvitationPreview(content, options?.isOwn ? 'outgoing' : 'incoming'),
      isCallInvite: true,
    }
  }

  const envelope = options?.envelope ?? parseDirectEnvelope(content)
  if (isControlEnvelope(envelope)) {
    return { preview: '', isCallInvite: false }
  }
  if (envelope.type === 'view_once') {
    return {
      preview: getViewOncePreviewLabel(envelope.kind),
      isCallInvite: false,
    }
  }
  if (envelope.type === 'crypto_payment_request') {
    return {
      preview: envelope.request.state === 'paid'
        ? translate('Payment submitted: {{amount}} {{symbol}}', {
            amount: envelope.request.amount,
            symbol: envelope.request.symbol,
          })
        : translate('Payment request: {{amount}} {{symbol}}', {
            amount: envelope.request.amount,
            symbol: envelope.request.symbol,
          }),
      isCallInvite: false,
    }
  }

  const visibleBody =
    envelope.type === 'text'
      ? envelope.text
      : envelope.type === 'plain'
        ? envelope.text
        : envelope.type === 'screenshot_taken'
          ? SCREENSHOT_TAKEN_NOTICE_TEXT
        : ''
  const { textContent, attachments: parsedAttachments } = parseMediaFromContent(visibleBody)
  const effectiveAttachments = attachments ?? parsedAttachments
  const trimmed = textContent.trim()
  if (trimmed.length > 0) {
    return { preview: trimmed, isCallInvite: false }
  }

  if (effectiveAttachments && effectiveAttachments.length > 0) {
    return {
      preview: `📎 ${getAttachmentLabel(effectiveAttachments[0], options?.isOwn === true)}`,
      isCallInvite: false,
    }
  }

  return { preview: translate('New message', { ns: 'chat' }), isCallInvite: false }
}
