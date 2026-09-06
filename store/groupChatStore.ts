/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { create } from 'zustand'
import type { ChatMessage, GroupChatMember, GroupConversation } from '@/lib/types'

interface GroupChatState {
  groups: GroupConversation[]
  activeGroupId: string | null
  members: Record<string, GroupChatMember[]>
  messages: Record<string, ChatMessage[]>
  isLoadingMessages: boolean
  isSyncingMessages: boolean

  setGroups: (groups: GroupConversation[]) => void
  addGroup: (group: GroupConversation) => void
  updateGroup: (groupId: string, updates: Partial<GroupConversation>) => void
  removeGroup: (groupId: string) => void
  setActiveGroup: (groupId: string | null) => void

  setMembers: (groupId: string, members: GroupChatMember[]) => void

  setMessages: (groupId: string, messages: ChatMessage[]) => void
  addMessage: (groupId: string, message: ChatMessage) => void
  mergeMessages: (groupId: string, messages: ChatMessage[]) => void
  updateMessage: (groupId: string, messageId: string, updates: Partial<ChatMessage>) => void
  removeMessage: (groupId: string, messageId: string) => void
  addReaction: (groupId: string, messageId: string, reaction: NonNullable<ChatMessage['reactions']>[number]) => void
  markRead: (groupId: string) => void

  setLoadingMessages: (loading: boolean) => void
  setSyncingMessages: (syncing: boolean) => void
  reset: () => void
}

const initialState = {
  groups: [] as GroupConversation[],
  activeGroupId: null as string | null,
  members: {} as Record<string, GroupChatMember[]>,
  messages: {} as Record<string, ChatMessage[]>,
  isLoadingMessages: false,
  isSyncingMessages: false,
}

export const useGroupChatStore = create<GroupChatState>((set) => ({
  ...initialState,

  setGroups: (groups) => set({ groups }),

  addGroup: (group) =>
    set((state) => {
      const existingIndex = state.groups.findIndex((entry) => entry.groupId === group.groupId)
      if (existingIndex === -1) {
        return { groups: [...state.groups, group] }
      }

      const groups = [...state.groups]
      groups[existingIndex] = { ...groups[existingIndex], ...group }
      return { groups }
    }),

  updateGroup: (groupId, updates) =>
    set((state) => ({
      groups: state.groups.map((group) =>
        group.groupId === groupId ? { ...group, ...updates } : group
      ),
    })),

  removeGroup: (groupId) =>
    set((state) => {
      const { [groupId]: _members, ...members } = state.members
      const { [groupId]: _messages, ...messages } = state.messages

      return {
        groups: state.groups.filter((group) => group.groupId !== groupId),
        members,
        messages,
        activeGroupId: state.activeGroupId === groupId ? null : state.activeGroupId,
      }
    }),

  setActiveGroup: (groupId) => set({ activeGroupId: groupId }),

  setMembers: (groupId, members) =>
    set((state) => ({
      members: { ...state.members, [groupId]: members },
    })),

  setMessages: (groupId, messages) =>
    set((state) => ({
      messages: { ...state.messages, [groupId]: messages },
    })),

  addMessage: (groupId, message) =>
    set((state) => {
      const existing = state.messages[groupId] || []
      if (existing.some((entry) => entry.id === message.id)) {
        return state
      }

      return {
        messages: {
          ...state.messages,
          [groupId]: [...existing, message],
        },
      }
    }),

  mergeMessages: (groupId, messages) =>
    set((state) => {
      const existing = state.messages[groupId] || []
      const byId = new Map(existing.map((message) => [message.id, message]))
      for (const message of messages) {
        byId.set(message.id, { ...byId.get(message.id), ...message })
      }

      const merged = [...byId.values()].sort((a, b) => a.timestamp - b.timestamp)
      return {
        messages: {
          ...state.messages,
          [groupId]: merged,
        },
      }
    }),

  updateMessage: (groupId, messageId, updates) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [groupId]: (state.messages[groupId] || []).map((message) =>
          message.id === messageId ? { ...message, ...updates } : message
        ),
      },
    })),

  removeMessage: (groupId, messageId) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [groupId]: (state.messages[groupId] || []).filter((message) => message.id !== messageId),
      },
    })),

  addReaction: (groupId, messageId, reaction) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [groupId]: (state.messages[groupId] || []).map((message) => {
          if (message.id !== messageId) return message
          const existing = message.reactions || []
          const alreadyExists = existing.some(
            (entry) => entry.emoji === reaction.emoji && entry.senderId === reaction.senderId
          )
          if (alreadyExists) return message

          return {
            ...message,
            reactions: [...existing, reaction],
          }
        }),
      },
    })),

  markRead: (groupId) =>
    set((state) => ({
      groups: state.groups.map((group) =>
        group.groupId === groupId ? { ...group, unreadCount: 0 } : group
      ),
    })),

  setLoadingMessages: (loading) => set({ isLoadingMessages: loading }),
  setSyncingMessages: (syncing) => set({ isSyncingMessages: syncing }),
  reset: () => set({ ...initialState }),
}))
