/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { ChatSendOptions, MediaAttachment } from '@/lib/types'
import type { SpectrePolicyState } from '@/lib/spectrePolicy'
import { getSpectreChatRestrictionMessage } from '@/lib/spectrePolicy'
import { inferViewOnceKindFromAttachment } from '@/lib/viewOnce'

export type ChatSendAdmissionReason =
  | 'empty'
  | 'spectre_restricted'
  | 'text_only_attachment'
  | 'view_once_unavailable'
  | 'view_once_invalid'
  | 'chat_not_ready'

export type AcceptedChatSendAdmission = {
  accepted: true
  content: string
  attachments?: MediaAttachment[]
  options?: ChatSendOptions
  completion?: Promise<void>
}

export type RejectedChatSendAdmission = {
  accepted: false
  reason: ChatSendAdmissionReason
  message: string
}

export type ChatSendAdmission = AcceptedChatSendAdmission | RejectedChatSendAdmission

interface ChatSendPolicyInput {
  content: string
  attachments?: MediaAttachment[]
  options?: ChatSendOptions
  spectrePolicyState: SpectrePolicyState
  textOnlyMode?: boolean
  allowViewOnce?: boolean
}

export function rejectChatSend(
  reason: ChatSendAdmissionReason,
  message: string,
): RejectedChatSendAdmission {
  return { accepted: false, reason, message }
}

export function evaluateChatSendPolicy({
  content,
  attachments,
  options,
  spectrePolicyState,
  textOnlyMode = false,
  allowViewOnce = true,
}: ChatSendPolicyInput): ChatSendAdmission {
  const normalizedContent = content.trim()
  const normalizedAttachments = attachments?.length ? attachments : undefined
  const oneTimeKind = options?.oneTime?.kind

  if (!normalizedContent && !normalizedAttachments) {
    return rejectChatSend('empty', 'Message cannot be empty')
  }

  const spectreRestriction = getSpectreChatRestrictionMessage(spectrePolicyState, {
    hasAttachments: Boolean(normalizedAttachments),
    content: normalizedContent,
    hasSpecialDelivery: Boolean(oneTimeKind),
  })
  if (spectreRestriction) {
    return rejectChatSend('spectre_restricted', spectreRestriction)
  }

  if (textOnlyMode && normalizedAttachments) {
    return rejectChatSend(
      'text_only_attachment',
      'Images, files, audio, and voice notes are disabled while Bluetooth mesh is carrying messages. Send a text message or reconnect to the internet to share media.',
    )
  }

  if (!oneTimeKind) {
    return {
      accepted: true,
      content: normalizedContent,
      attachments: normalizedAttachments,
      options,
    }
  }

  if (!allowViewOnce) {
    return rejectChatSend('view_once_unavailable', 'One-time messages are not available in this chat')
  }

  if (normalizedContent && normalizedAttachments) {
    return rejectChatSend(
      'view_once_invalid',
      'Send a one-time text or one-time attachment, but not both together.',
    )
  }

  if (oneTimeKind === 'text') {
    if (normalizedAttachments) {
      return rejectChatSend('view_once_invalid', 'One-time text messages cannot include attachments')
    }
    if (!normalizedContent) {
      return rejectChatSend('view_once_invalid', 'One-time text messages cannot be empty')
    }
  } else {
    if (!normalizedAttachments || normalizedAttachments.length !== 1) {
      return rejectChatSend(
        'view_once_invalid',
        'One-time media messages require exactly one attachment',
      )
    }
    if (normalizedContent) {
      return rejectChatSend(
        'view_once_invalid',
        'One-time media messages cannot include a text preview',
      )
    }
    if (inferViewOnceKindFromAttachment(normalizedAttachments[0]) !== oneTimeKind) {
      return rejectChatSend(
        'view_once_invalid',
        'Only one-time photos and voice notes are supported',
      )
    }
  }

  return {
    accepted: true,
    content: normalizedContent,
    attachments: normalizedAttachments,
    options,
  }
}

export function getChatSendAdmissionTitle(admission: ChatSendAdmission): string {
  if (admission.accepted) return ''
  if (admission.reason === 'spectre_restricted') return 'Spectre Mode'
  if (admission.reason === 'text_only_attachment') return 'Bluetooth mesh supports text only'
  if (admission.reason === 'view_once_invalid' || admission.reason === 'view_once_unavailable') {
    return 'One-time messages'
  }
  return 'Failed to send'
}
