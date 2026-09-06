/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const deleteConversation = vi.fn(async () => {})
const getConversation = vi.fn(async () => ({ localIdentityId: 'identity-me' }))
const clearDirectMessagesAndReconcile = vi.fn(async () => ({
  applied: true,
  unreadCount: 0,
  deletedMessageIds: ['message-1'],
}))
const deleteConversationMedia = vi.fn(async () => {})

const storeState = {
  messages: [{ id: 'message-1', conversationId: 'conversation-1' }],
  removeMessages: vi.fn(),
  removeConversation: vi.fn(),
}

vi.mock('@spectra/core-crypto/storage/local', () => ({
  localChatStorage: {
    deleteConversation,
    getConversation,
  },
}))

vi.mock('@/store/walletStore', () => ({
  useWalletStore: {
    getState: () => ({ wallet: { address: 'exo1local' } }),
  },
}))

vi.mock('./directUnreadState', () => ({
  clearDirectMessagesAndReconcile,
}))

vi.mock('@/store/chatStore', () => ({
  useChatStore: {
    getState: () => storeState,
  },
}))

vi.mock('../media/localMediaCache', () => ({
  deleteConversationMedia,
}))

describe('directConversationCleanup', () => {
  beforeEach(() => {
    storeState.removeMessages.mockReset()
    storeState.removeConversation.mockReset()
    deleteConversation.mockReset()
    getConversation.mockReset()
    getConversation.mockResolvedValue({ localIdentityId: 'identity-me' })
    clearDirectMessagesAndReconcile.mockReset()
    clearDirectMessagesAndReconcile.mockResolvedValue({
      applied: true,
      unreadCount: 0,
      deletedMessageIds: ['message-1'],
    })
    deleteConversationMedia.mockReset()
  })

  it('clears local direct conversation messages and media cache', async () => {
    const { clearDirectConversationLocally } = await import('./directConversationCleanup')

    await clearDirectConversationLocally('conversation-1')

    expect(clearDirectMessagesAndReconcile).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      localIdentityId: 'identity-me',
      localWalletAddress: 'exo1local',
      additionalMessageIds: ['message-1'],
    })
    expect(storeState.removeMessages).toHaveBeenCalledWith(['message-1'])
    expect(deleteConversationMedia).toHaveBeenCalledWith('conversation-1')
  })

  it('deletes a direct conversation through the quantum chat client when available', async () => {
    const removeConversation = vi.fn(async () => {})
    const { deleteDirectConversationLocally } = await import('./directConversationCleanup')

    await deleteDirectConversationLocally('conversation-2', {
      client: { removeConversation },
    })

    expect(storeState.removeConversation).toHaveBeenCalledWith('conversation-2')
    expect(removeConversation).toHaveBeenCalledWith('conversation-2')
    expect(deleteConversation).not.toHaveBeenCalled()
    expect(deleteConversationMedia).toHaveBeenCalledWith('conversation-2')
  })

  it('keeps the runtime conversation when durable deletion fails', async () => {
    const removeConversation = vi.fn(async () => {
      throw new Error('storage unavailable')
    })
    const { deleteDirectConversationLocally } = await import('./directConversationCleanup')

    await expect(deleteDirectConversationLocally('conversation-2', {
      client: { removeConversation },
    })).rejects.toThrow('storage unavailable')

    expect(storeState.removeConversation).not.toHaveBeenCalled()
    expect(deleteConversationMedia).not.toHaveBeenCalled()
  })

  it('keeps runtime messages when durable clearing fails', async () => {
    clearDirectMessagesAndReconcile.mockRejectedValueOnce(new Error('storage unavailable'))
    const { clearDirectConversationLocally } = await import('./directConversationCleanup')

    await expect(clearDirectConversationLocally('conversation-1')).rejects.toThrow(
      'storage unavailable',
    )

    expect(storeState.removeMessages).not.toHaveBeenCalled()
    expect(deleteConversationMedia).not.toHaveBeenCalled()
  })

  it('applies incoming bilateral deletes only for the targeted local identity', async () => {
    const removeConversation = vi.fn(async () => {})
    const { applyIncomingDirectConversationDelete } = await import('./directConversationCleanup')

    const ignored = await applyIncomingDirectConversationDelete({
      conversationId: 'conversation-3',
      targetIdentityId: 'identity-me',
      localIdentityId: 'identity-other',
      client: { removeConversation },
    })

    expect(ignored).toBe(false)
    expect(storeState.removeConversation).not.toHaveBeenCalled()

    const applied = await applyIncomingDirectConversationDelete({
      conversationId: 'conversation-3',
      targetIdentityId: 'identity-me',
      localIdentityId: 'identity-me',
      client: { removeConversation },
    })

    expect(applied).toBe(true)
    expect(storeState.removeConversation).toHaveBeenCalledWith('conversation-3')
    expect(removeConversation).toHaveBeenCalledWith('conversation-3')
  })

  it('ignores incoming bilateral deletes when no local identity is available', async () => {
    const removeConversation = vi.fn(async () => {})
    const { applyIncomingDirectConversationDelete } = await import('./directConversationCleanup')

    const ignored = await applyIncomingDirectConversationDelete({
      conversationId: 'conversation-4',
      targetIdentityId: 'identity-me',
      localIdentityId: null,
      client: { removeConversation },
    })

    expect(ignored).toBe(false)
    expect(storeState.removeConversation).not.toHaveBeenCalled()
    expect(removeConversation).not.toHaveBeenCalled()
    expect(deleteConversationMedia).not.toHaveBeenCalled()
  })

  it('preserves delete-for-both by falling back to local storage when no client is available', async () => {
    const { applyIncomingDirectConversationDelete } = await import('./directConversationCleanup')

    const applied = await applyIncomingDirectConversationDelete({
      conversationId: 'conversation-5',
      targetIdentityId: 'identity-me',
      localIdentityId: 'identity-me',
      client: null,
    })

    expect(applied).toBe(true)
    expect(storeState.removeConversation).toHaveBeenCalledWith('conversation-5')
    expect(deleteConversation).toHaveBeenCalledWith('conversation-5')
    expect(deleteConversationMedia).toHaveBeenCalledWith('conversation-5')
  })
})
