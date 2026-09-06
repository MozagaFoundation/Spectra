/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { matchesAccountStorageScope } from '@/lib/accountScope'
import type { Conversation } from '@/lib/types'

type LocalConversationContext = Pick<Conversation, 'localIdentityId' | 'localWalletAddress'>

type DirectActiveThreadOptions = {
  activeConversationId: string | null | undefined
  conversations: Array<Pick<Conversation, 'id' | 'remoteIdentityId' | 'remoteWalletAddress' | 'localIdentityId' | 'localWalletAddress'>>
  localConversationContext: LocalConversationContext
  conversationId: string
  projectedConversationId?: string | null
  migratedConversationId?: string | null
  senderIdentityId: string
  senderWalletAddress?: string | null
}

function addScopedIdentifier(
  identifiers: Set<string>,
  localWalletAddress: string | null | undefined,
  value: string | null | undefined,
): void {
  if (!value) return

  identifiers.add(value)
  if (localWalletAddress) {
    identifiers.add(`local:${localWalletAddress}:${value}`)
  }
}

function matchesLocalConversationContext(
  conversation: LocalConversationContext,
  context: LocalConversationContext,
): boolean {
  if (context.localWalletAddress) {
    return matchesAccountStorageScope(conversation.localWalletAddress, context.localWalletAddress)
  }

  if (context.localIdentityId) {
    return !conversation.localIdentityId || conversation.localIdentityId === context.localIdentityId
  }

  return true
}

export function buildDirectThreadIdentifiers(
  options: Pick<
    DirectActiveThreadOptions,
    'localConversationContext' | 'conversationId' | 'projectedConversationId' | 'migratedConversationId' | 'senderIdentityId' | 'senderWalletAddress'
  >,
): Set<string> {
  const identifiers = new Set<string>()
  const localWalletAddress = options.localConversationContext.localWalletAddress

  addScopedIdentifier(identifiers, localWalletAddress, options.conversationId)
  addScopedIdentifier(identifiers, localWalletAddress, options.projectedConversationId)
  addScopedIdentifier(identifiers, localWalletAddress, options.migratedConversationId)
  addScopedIdentifier(identifiers, localWalletAddress, options.senderIdentityId)
  addScopedIdentifier(identifiers, localWalletAddress, options.senderWalletAddress)

  return identifiers
}

export function isActiveDirectThread(options: DirectActiveThreadOptions): boolean {
  const { activeConversationId } = options
  if (!activeConversationId) return false

  const incomingIdentifiers = buildDirectThreadIdentifiers(options)
  if (incomingIdentifiers.has(activeConversationId)) {
    return true
  }

  const activeConversation = options.conversations.find((conversation) => {
    if (!matchesLocalConversationContext(conversation, options.localConversationContext)) {
      return false
    }

    const conversationIdentifiers = new Set<string>()
    addScopedIdentifier(conversationIdentifiers, conversation.localWalletAddress, conversation.id)
    addScopedIdentifier(conversationIdentifiers, conversation.localWalletAddress, conversation.remoteIdentityId)
    addScopedIdentifier(conversationIdentifiers, conversation.localWalletAddress, conversation.remoteWalletAddress)
    addScopedIdentifier(conversationIdentifiers, options.localConversationContext.localWalletAddress, conversation.id)
    addScopedIdentifier(conversationIdentifiers, options.localConversationContext.localWalletAddress, conversation.remoteIdentityId)
    addScopedIdentifier(conversationIdentifiers, options.localConversationContext.localWalletAddress, conversation.remoteWalletAddress)

    return conversationIdentifiers.has(activeConversationId)
  })

  if (!activeConversation) return false

  return [
    activeConversation.id,
    activeConversation.remoteIdentityId,
    activeConversation.remoteWalletAddress,
  ].some((identifier) => Boolean(identifier && incomingIdentifiers.has(identifier)))
}
