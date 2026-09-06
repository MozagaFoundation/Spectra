/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { vi } from 'vitest'
import type { ReactTestInstance } from 'react-test-renderer'
import type { ChatMessage, MediaAttachment } from '@/lib/types'

const bubbleMocks = vi.hoisted(() => {
  class TestMediaExportError extends Error {
    constructor(public code: string, message: string) {
      super(message)
      this.name = 'MediaExportError'
    }
  }

  const chatStore = {
    contacts: [],
    messages: [] as ChatMessage[],
    updateMessage: vi.fn(),
  }
  const groupStore = {
    messages: {} as Record<string, ChatMessage[]>,
    updateMessage: vi.fn(),
  }

  return {
    MediaExportError: TestMediaExportError,
    alert: {
      alert: vi.fn(),
    },
    chatStore,
    groupStore,
    translateForTest: (key: string, values?: Record<string, unknown>) => {
      if (!values) return key
      return Object.entries(values).reduce(
        (result, [name, value]) => result.replace(`{{${name}}}`, String(value)),
        key,
      )
    },
    hydrateMessageAttachment: vi.fn(),
    isTrustedMediaUrl: vi.fn(),
    openAttachmentExternally: vi.fn(),
    recordChatDiagnostic: vi.fn(),
    resolveStorageUrl: vi.fn(),
    saveImageToLibrary: vi.fn(),
    shareAttachment: vi.fn(),
  }
})

vi.mock('react-native', async () => ({
  ...await import('../../../test/react-native'),
  Alert: bubbleMocks.alert,
}))

vi.mock('expo-image', () => ({
  Image: 'ExpoImage',
}))

vi.mock('lucide-react-native', () => ({
  Activity: () => null,
  AlertCircle: () => null,
  Check: () => null,
  CheckCheck: () => null,
  Clock: () => null,
  Clock3: () => null,
  Download: () => null,
  Eye: () => null,
  FileText: () => null,
  Image: () => null,
  LoaderCircle: () => null,
  Lock: () => null,
  Mic: () => null,
  Phone: () => null,
  Shield: () => null,
  Sparkles: () => null,
  Video: () => null,
  X: () => null,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: bubbleMocks.translateForTest }),
}))

vi.mock('@/lib/i18n', () => ({
  translate: bubbleMocks.translateForTest,
}))

vi.mock('@/lib/i18n/direction', () => ({
  getDirectionalTextStyle: () => ({}),
  getStartBorderStyle: () => ({}),
  useIsCurrentLanguageRtl: () => false,
}))

vi.mock('@/lib/theme', () => ({
  useIsSpectreThemeActive: () => false,
  useThemeColors: () => ({
    backgroundSecondary: '#111111',
    border: '#333333',
    error: '#ff0000',
    primary: '#00ff99',
    success: '#20c997',
    surface: '#121212',
    text: '#ffffff',
    textMuted: '#999999',
    textOnPrimary: '#000000',
    textSecondary: '#cccccc',
    textTertiary: '#777777',
    warning: '#ffaa00',
  }),
}))

vi.mock('@/lib/cryptoTheme', () => ({
  useCryptoTheme: () => ({
    accent: () => '#00aa66',
    alpha: (color: string, opacity: number) => `${color}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`,
    colors: {
      textOnPrimary: '#ffffff',
    },
    resolveExternalAccent: () => '#00aa66',
  }),
}))

vi.mock('@/lib/utils', () => ({
  formatFileSize: (value: number) => `${value} B`,
  formatTime: () => '12:00 AM',
  parseLinks: (value: string) => [{ type: 'text', content: value }],
}))

vi.mock('@/lib/disappearingMessages', () => ({
  formatDisappearingTimerDuration: () => '1m',
  getDisappearingMessageRemainingMs: () => null,
}))

vi.mock('@/services/backend/storage', () => ({
  isTrustedMediaUrl: bubbleMocks.isTrustedMediaUrl,
  resolveStorageUrl: bubbleMocks.resolveStorageUrl,
}))

vi.mock('@/services/media', () => ({
  MediaExportError: bubbleMocks.MediaExportError,
  openAttachmentExternally: bubbleMocks.openAttachmentExternally,
  saveImageToLibrary: bubbleMocks.saveImageToLibrary,
  shareAttachment: bubbleMocks.shareAttachment,
}))

vi.mock('@/services/media/attachmentHydration', () => ({
  hydrateMessageAttachment: bubbleMocks.hydrateMessageAttachment,
}))

vi.mock('@/services/chat/chatDiagnostics', () => ({
  recordChatDiagnostic: bubbleMocks.recordChatDiagnostic,
}))

vi.mock('@/services/shared/callInvitationFormat', () => ({
  isCallInvitation: () => false,
  parseCallInvitation: () => null,
}))

vi.mock('@/services/crypto', () => ({
  isCryptoReceipt: () => false,
  parseCryptoReceipt: () => null,
}))

vi.mock('@/services/crypto/receipts', () => ({
  isCryptoReceipt: () => false,
  parseCryptoReceipt: () => null,
  resolveCryptoReceiptNetwork: () => 'mozaga',
}))

vi.mock('@/components/common', async () => {
  const ReactActual = await import('react')
  return {
    Avatar: ({ name }: { name?: string }) => ReactActual.createElement('Text', null, name || 'Avatar'),
  }
})

vi.mock('@/store', () => {
  const useChatStore = (selector?: (state: typeof bubbleMocks.chatStore) => unknown) => (
    selector ? selector(bubbleMocks.chatStore) : bubbleMocks.chatStore
  )
  useChatStore.getState = () => bubbleMocks.chatStore

  const useGroupChatStore = (selector?: (state: typeof bubbleMocks.groupStore) => unknown) => (
    selector ? selector(bubbleMocks.groupStore) : bubbleMocks.groupStore
  )
  useGroupChatStore.getState = () => bubbleMocks.groupStore

  const uiStore = { messageFontSize: 'medium' }
  const useUIStore = (selector?: (state: typeof uiStore) => unknown) => (
    selector ? selector(uiStore) : uiStore
  )

  return {
    useChatStore,
    useGroupChatStore,
    useUIStore,
  }
})

vi.mock('@/store/chatStore', () => {
  const useChatStore = (selector?: (state: typeof bubbleMocks.chatStore) => unknown) => (
    selector ? selector(bubbleMocks.chatStore) : bubbleMocks.chatStore
  )
  useChatStore.getState = () => bubbleMocks.chatStore
  return { useChatStore }
})

vi.mock('@/store/groupChatStore', () => {
  const useGroupChatStore = (selector?: (state: typeof bubbleMocks.groupStore) => unknown) => (
    selector ? selector(bubbleMocks.groupStore) : bubbleMocks.groupStore
  )
  useGroupChatStore.getState = () => bubbleMocks.groupStore
  return { useGroupChatStore }
})

vi.mock('@/store/uiStore', () => {
  const uiStore = { messageFontSize: 'medium' }
  return {
    useUIStore: (selector?: (state: typeof uiStore) => unknown) => (
      selector ? selector(uiStore) : uiStore
    ),
  }
})

vi.mock('../MediaLightbox', async () => {
  const ReactActual = await import('react')
  return {
    MediaLightbox: (props: Record<string, unknown>) => ReactActual.createElement(
      'View',
      { testID: 'media-lightbox', ...props },
      ReactActual.createElement(
        'Text',
        null,
        props.visible ? `lightbox:${String(props.mediaType)}` : 'lightbox:hidden',
      ),
    ),
  }
})

vi.mock('../AudioPlayer', async () => {
  const ReactActual = await import('react')
  return {
    AudioPlayer: (props: Record<string, unknown>) => ReactActual.createElement(
      'View',
      { testID: 'audio-player', ...props },
      ReactActual.createElement('Text', null, String(props.uri ?? '')),
    ),
  }
})

vi.mock('../ViewOnceTextViewer', async () => {
  const ReactActual = await import('react')
  return {
    ViewOnceTextViewer: (props: Record<string, unknown>) => ReactActual.createElement(
      'View',
      { testID: 'view-once-text-viewer', ...props },
      ReactActual.createElement('Text', null, String(props.text ?? '')),
    ),
  }
})

vi.mock('../ViewOnceVoiceNoteViewer', async () => {
  const ReactActual = await import('react')
  return {
    ViewOnceVoiceNoteViewer: (props: Record<string, unknown>) => ReactActual.createElement(
      'View',
      { testID: 'view-once-voice-viewer', ...props },
      ReactActual.createElement('Text', null, String(props.uri ?? '')),
    ),
  }
})

vi.mock('../MarkdownContent', async () => {
  const ReactActual = await import('react')
  return {
    MarkdownContent: ({ content }: { content: string }) => ReactActual.createElement('Text', null, content),
  }
})

export function resetBubbleMocks() {
  bubbleMocks.alert.alert.mockReset()
  bubbleMocks.hydrateMessageAttachment.mockReset()
  bubbleMocks.isTrustedMediaUrl.mockReset()
  bubbleMocks.openAttachmentExternally.mockReset()
  bubbleMocks.recordChatDiagnostic.mockReset()
  bubbleMocks.resolveStorageUrl.mockReset()
  bubbleMocks.saveImageToLibrary.mockReset()
  bubbleMocks.shareAttachment.mockReset()
  bubbleMocks.chatStore.messages = []
  bubbleMocks.chatStore.updateMessage.mockReset()
  bubbleMocks.groupStore.messages = {}
  bubbleMocks.groupStore.updateMessage.mockReset()

  bubbleMocks.isTrustedMediaUrl.mockImplementation((uri?: string | null) => (
    typeof uri === 'string'
    && (
      /^(file|content|data|blob):/i.test(uri)
      || uri.startsWith('https://trusted.example/')
    )
  ))
  bubbleMocks.resolveStorageUrl.mockImplementation(async (uri?: string | null) => (
    bubbleMocks.isTrustedMediaUrl(uri) ? uri : null
  ))
  bubbleMocks.openAttachmentExternally.mockResolvedValue(true)
  bubbleMocks.saveImageToLibrary.mockResolvedValue(undefined)
  bubbleMocks.shareAttachment.mockResolvedValue(undefined)
}

export function createAttachment(overrides: Partial<MediaAttachment> = {}): MediaAttachment {
  return {
    id: 'attachment-1',
    type: 'image',
    uri: 'file:///media/photo.jpg',
    fileName: 'photo.jpg',
    mimeType: 'image/jpeg',
    fileSize: 1024,
    width: 100,
    height: 100,
    ...overrides,
  }
}

export function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'message-1',
    conversationId: 'conversation-1',
    senderId: 'sender-1',
    senderName: 'Alice',
    content: 'Hello',
    timestamp: 1,
    status: 'delivered',
    signatureVerified: true,
    ...overrides,
  }
}

export function textContent(node: ReactTestInstance): string {
  return node.children.map((child) => (
    typeof child === 'string' ? child : textContent(child)
  )).join('')
}

export function nearestPressable(node: ReactTestInstance): ReactTestInstance {
  let current: ReactTestInstance | null = node
  while (current) {
    if (String(current.type) === 'Pressable') {
      return current
    }
    current = current.parent
  }
  throw new Error('Unable to find parent Pressable')
}

export function getAllByHostType(root: ReactTestInstance, type: string): ReactTestInstance[] {
  return root.findAll((node) => node.type === type)
}

export { act, fireEvent, render, screen } from '@testing-library/react-native'
export { bubbleMocks }
