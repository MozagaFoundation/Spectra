/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { ChatMessage, Conversation, MediaAttachment } from '@/lib/types'
import { parseLinks } from '@/lib/utils'

export interface SharedAttachmentItem {
  key: string
  messageId: string
  conversationId: string
  createdAt: number
  attachment: MediaAttachment
}

export interface SharedLinkItem {
  key: string
  messageId: string
  conversationId: string
  createdAt: number
  url: string
}

export interface SharedChatContent {
  media: SharedAttachmentItem[]
  docs: SharedAttachmentItem[]
  links: SharedLinkItem[]
}

export interface SharedChatContentSummary {
  attachmentPreviews: SharedAttachmentItem[]
  totalCount: number
}

const LINK_HINT_REGEX = /https?:\/\/|www\./i
const MAX_SHARED_CONTENT_LINK_PARSE_LENGTH = 8192

function isImageOrVideoAttachment(attachment: MediaAttachment): boolean {
  const mimeType = attachment.mimeType?.toLowerCase() || ''
  return attachment.type === 'image'
    || attachment.type === 'video'
    || mimeType.startsWith('image/')
    || mimeType.startsWith('video/')
}

function getParseableLinkContent(content: string | undefined): string | null {
  if (!content || content.length > MAX_SHARED_CONTENT_LINK_PARSE_LENGTH || !LINK_HINT_REGEX.test(content)) {
    return null
  }

  return content
}

export function getDirectConversationIds(
  address: string | undefined,
  conversation: Conversation | null | undefined,
  conversations: Conversation[],
): Set<string> {
  const ids = new Set<string>()
  if (conversation?.id) {
    ids.add(conversation.id)
  }

  if (!address && !conversation) {
    return ids
  }

  const remoteIdentityId = conversation?.remoteIdentityId || address
  const remoteWalletAddress = conversation?.remoteWalletAddress

  for (const candidate of conversations) {
    if (candidate.type === 'group') {
      continue
    }

    if (
      (remoteIdentityId && candidate.remoteIdentityId === remoteIdentityId)
      || (address && candidate.remoteIdentityId === address)
      || (remoteWalletAddress && candidate.remoteWalletAddress === remoteWalletAddress)
      || (address && candidate.remoteWalletAddress === address)
    ) {
      ids.add(candidate.id)
    }
  }

  return ids
}

export function getDirectConversationMessages(
  messages: ChatMessage[],
  conversationIds: Set<string>,
): ChatMessage[] {
  if (conversationIds.size === 0) {
    return []
  }

  return messages
    .filter((message) => conversationIds.has(message.conversationId))
    .sort((a, b) => a.timestamp - b.timestamp)
}

export function getSharedChatContent(messages: ChatMessage[]): SharedChatContent {
  const media: SharedAttachmentItem[] = []
  const docs: SharedAttachmentItem[] = []
  const links: SharedLinkItem[] = []

  for (const message of messages) {
    if (message.deleted) {
      continue
    }

    if (!message.oneTime) {
      for (const attachment of message.attachments ?? []) {
        const item: SharedAttachmentItem = {
          key: `${message.id}:${attachment.id}`,
          messageId: message.id,
          conversationId: message.conversationId,
          createdAt: message.timestamp,
          attachment,
        }

        if (isImageOrVideoAttachment(attachment)) {
          media.push(item)
        } else {
          docs.push(item)
        }
      }
    }

    const linkContent = getParseableLinkContent(message.content)
    if (!linkContent) {
      continue
    }

    for (const part of parseLinks(linkContent)) {
      if (part.type !== 'link') {
        continue
      }

      links.push({
        key: `${message.id}:${links.length}`,
        messageId: message.id,
        conversationId: message.conversationId,
        createdAt: message.timestamp,
        url: part.content,
      })
    }
  }

  return {
    media: media.sort((a, b) => b.createdAt - a.createdAt),
    docs: docs.sort((a, b) => b.createdAt - a.createdAt),
    links: links.sort((a, b) => b.createdAt - a.createdAt),
  }
}

export function getSharedChatContentSummary(
  messages: ChatMessage[],
  previewLimit: number = 3,
): SharedChatContentSummary {
  const attachmentPreviews: SharedAttachmentItem[] = []
  let totalCount = 0

  for (const message of messages) {
    if (message.deleted) {
      continue
    }

    if (!message.oneTime) {
      for (const attachment of message.attachments ?? []) {
        totalCount += 1
        if (attachmentPreviews.length < previewLimit || message.timestamp > attachmentPreviews[attachmentPreviews.length - 1]?.createdAt) {
          insertRecentAttachmentPreview(
            attachmentPreviews,
            {
              key: `${message.id}:${attachment.id}`,
              messageId: message.id,
              conversationId: message.conversationId,
              createdAt: message.timestamp,
              attachment,
            },
            previewLimit,
          )
        }
      }
    }

    const linkContent = getParseableLinkContent(message.content)
    if (!linkContent) {
      continue
    }

    for (const part of parseLinks(linkContent)) {
      if (part.type === 'link') {
        totalCount += 1
      }
    }
  }

  return {
    attachmentPreviews,
    totalCount,
  }
}

function insertRecentAttachmentPreview(
  previews: SharedAttachmentItem[],
  item: SharedAttachmentItem,
  limit: number,
): void {
  const insertAt = previews.findIndex((candidate) => candidate.createdAt < item.createdAt)
  if (insertAt === -1) {
    previews.push(item)
  } else {
    previews.splice(insertAt, 0, item)
  }

  if (previews.length > limit) {
    previews.length = limit
  }
}

export function getDirectConversationSharedContentSummary(
  messages: ChatMessage[],
  conversationIds: Set<string>,
  previewLimit: number = 3,
): SharedChatContentSummary {
  if (conversationIds.size === 0) {
    return { attachmentPreviews: [], totalCount: 0 }
  }

  return getSharedChatContentSummary(
    messages.filter((message) => conversationIds.has(message.conversationId)),
    previewLimit,
  )
}
