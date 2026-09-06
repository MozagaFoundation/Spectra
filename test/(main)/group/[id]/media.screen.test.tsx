/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactTestInstance } from 'react-test-renderer'

const mockState = vi.hoisted(() => ({
  params: { id: 'group-id' as string | undefined },
  router: { back: vi.fn() },
  group: {
    messages: {
      'group-id': [
        {
          id: 'message-media',
          conversationId: 'group:group-id',
          senderId: 'alice-id',
          content: '',
          timestamp: 1770000000000,
          attachments: [{
            id: 'image-1',
            type: 'image',
            uri: 'file://image.jpg',
            fileName: 'image.jpg',
            mimeType: 'image/jpeg',
            fileSize: 120,
          }],
        },
        {
          id: 'message-doc',
          conversationId: 'group:group-id',
          senderId: 'alice-id',
          content: 'https://spectra.app',
          timestamp: 1770000001000,
          attachments: [{
            id: 'doc-1',
            type: 'document',
            uri: 'file://doc.pdf',
            fileName: 'doc.pdf',
            mimeType: 'application/pdf',
            fileSize: 240,
          }],
        },
      ],
    },
    updateMessage: vi.fn(),
  },
  services: {
    loadGroupMessages: vi.fn(async () => []),
  },
}))

vi.mock('react-native', async () => {
  const rn = await import('../../../../test/react-native')
  return {
    ...rn,
    Alert: { alert: vi.fn() },
    Dimensions: { get: () => ({ width: 390 }) },
    Linking: { openURL: vi.fn(async () => {}) },
  }
})

vi.mock('@shopify/flash-list', async () => {
  const ReactActual = await import('react')
  const { View } = await import('../../../../test/react-native')
  return {
    FlashList: ({ data, renderItem }: { data: Array<any>; renderItem: (params: { item: any }) => React.ReactNode }) => (
      ReactActual.createElement(
        View,
        { testID: 'shared-list' },
        data.map((item) => ReactActual.createElement(View, { key: item.key }, renderItem({ item }))),
      )
    ),
  }
})

vi.mock('expo-router', () => ({
  useLocalSearchParams: () => mockState.params,
  useRouter: () => mockState.router,
}))

vi.mock('expo-image', async () => {
  const { Image } = await import('../../../../test/react-native')
  return { Image }
})

vi.mock('react-native-safe-area-context', async () => {
  const { createSafeAreaMock } = await import('../../../../test/mainScreenMocks')
  return createSafeAreaMock()
})

vi.mock('lucide-react-native', async () => {
  const { TestIcon } = await import('../../../../test/mainScreenMocks')
  return {
    ArrowLeft: TestIcon,
    ExternalLink: TestIcon,
    FileText: TestIcon,
    Image: TestIcon,
    Link: TestIcon,
    LoaderCircle: TestIcon,
    Video: TestIcon,
  }
})

vi.mock('@/components/chat/MediaLightbox', async () => {
  const ReactActual = await import('react')
  const { View } = await import('../../../../test/react-native')
  return { MediaLightbox: () => ReactActual.createElement(View, { testID: 'media-lightbox' }) }
})

vi.mock('@/components/chat/bubbles/attachmentUtils', () => ({
  isImageMimeType: (mimeType?: string) => mimeType?.startsWith('image/') === true,
  isPdfMimeType: (mimeType?: string) => mimeType === 'application/pdf',
}))

vi.mock('@/lib/i18n', async () => {
  const { createI18nMock } = await import('../../../../test/mainScreenMocks')
  return createI18nMock()
})

vi.mock('@/lib/theme', async () => {
  const { createThemeMock } = await import('../../../../test/mainScreenMocks')
  return createThemeMock()
})

vi.mock('@/lib/utils', () => ({
  formatFileSize: (value?: number) => `${value ?? 0} B`,
  formatRelativeTime: () => 'now',
  parseLinks: (content: string) => content.includes('https://spectra.app')
    ? [{ content: 'https://spectra.app', type: 'link' }]
    : [{ content, type: 'text' }],
}))

vi.mock('@/lib/mediaPreview', () => ({
  getAttachmentPreviewUri: (attachment: { uri?: string }) => attachment.uri || null,
}))

vi.mock('@/services/media/attachmentHydration', () => ({
  hydrateMessageAttachment: vi.fn(),
}))

vi.mock('@/services/media', () => ({
  openAttachmentExternally: vi.fn(async () => true),
}))

vi.mock('@/services/chat', () => mockState.services)

vi.mock('@/store', () => ({
  useGroupChatStore: (selector: (state: typeof mockState.group) => unknown) => selector(mockState.group),
}))

const { fireEvent, render, screen } = await import('@testing-library/react-native')
const { default: GroupSharedMediaScreen } = await import('../../../../app/(main)/group/[id]/media')

function textContent(node: ReactTestInstance): string {
  return node.children.map((child) => (
    typeof child === 'string' ? child : textContent(child)
  )).join('')
}

function getPressableContainingText(root: ReactTestInstance, text: string): ReactTestInstance {
  const match = root.findAll((node) => (
    typeof node.props.onPress === 'function' && textContent(node).includes(text)
  ))[0]
  if (!match) throw new Error(`Unable to find pressable containing ${text}`)
  return match
}

describe('GroupSharedMediaScreen', () => {
  beforeEach(() => {
    mockState.services.loadGroupMessages.mockClear()
  })

  it('categorizes group shared media, links, and documents', async () => {
    const view = render(<GroupSharedMediaScreen />)

    expect(mockState.services.loadGroupMessages).toHaveBeenCalledWith('group-id')
    expect(screen.getByText('Media 1')).toBeTruthy()
    expect(screen.getByText('Links 1')).toBeTruthy()
    expect(screen.getByText('Docs 1')).toBeTruthy()

    await fireEvent.press(getPressableContainingText(view.root, 'Docs 1'))

    expect(screen.getByText('doc.pdf')).toBeTruthy()
  })
})
