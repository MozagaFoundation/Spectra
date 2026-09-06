/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  documentPicker: {
    getDocumentAsync: vi.fn(),
  },
  haptics: {
    impactAsync: vi.fn(async () => undefined),
    ImpactFeedbackStyle: { Light: 'light' },
  },
  imagePicker: {
    launchCameraAsync: vi.fn(),
    launchImageLibraryAsync: vi.fn(),
    requestCameraPermissionsAsync: vi.fn(),
    requestMediaLibraryPermissionsAsync: vi.fn(),
    MediaTypeOptions: { All: 'all', Images: 'images' },
  },
  media: {
    normalizeOutgoingMediaAttachment: vi.fn(async (attachment: unknown) => attachment),
  },
}))

vi.mock('expo-document-picker', () => mockState.documentPicker)
vi.mock('expo-haptics', () => mockState.haptics)
vi.mock('expo-image-picker', () => mockState.imagePicker)
vi.mock('@/services/media/outgoingAttachment', () => ({
  hasMediaLibraryAccess: (permission: { granted?: boolean; status?: string; accessPrivileges?: string }) => (
    permission.granted === true || permission.status === 'granted' || permission.accessPrivileges === 'limited'
  ),
  normalizeOutgoingMediaAttachment: mockState.media.normalizeOutgoingMediaAttachment,
}))
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}))

vi.mock('lucide-react-native', async () => {
  const { TestChatIcon } = await import('../../test/chatComponentMocks')
  return {
    Camera: TestChatIcon,
    Download: TestChatIcon,
    FileText: TestChatIcon,
    Hash: TestChatIcon,
    Image: TestChatIcon,
    Music: TestChatIcon,
    Send: TestChatIcon,
    ShieldCheck: TestChatIcon,
    X: TestChatIcon,
  }
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/lib/i18n', async () => {
  const { translateForChatTest } = await import('../../test/chatComponentMocks')
  return { translate: translateForChatTest }
})

vi.mock('@/lib/theme', async () => {
  const { chatTestColors } = await import('../../test/chatComponentMocks')
  return { useThemeColors: () => chatTestColors }
})

const { fireEvent, render } = await import('@testing-library/react-native')
const { MediaPicker } = await import('./MediaPicker')

describe('MediaPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.media.normalizeOutgoingMediaAttachment.mockImplementation(async (attachment) => attachment)
  })

  it('does not select gallery media when permission is denied', async () => {
    mockState.imagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: false })
    const onSelectMedia = vi.fn()
    const onClose = vi.fn()
    const view = render(
      <MediaPicker visible onClose={onClose} onSelectMedia={onSelectMedia} />,
    )

    await fireEvent.press(view.root.findByProps({ accessibilityLabel: 'Gallery' }))

    expect(onSelectMedia).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('creates document and audio attachments from picker assets', async () => {
    const onSelectMedia = vi.fn()
    const onClose = vi.fn()
    mockState.documentPicker.getDocumentAsync
      .mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: 'file:///report.pdf', name: 'report.pdf', mimeType: 'application/pdf', size: 123 }],
      })
      .mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: 'file:///clip.mp3', name: 'clip.mp3', mimeType: 'audio/mpeg', size: 456 }],
      })
    const view = render(
      <MediaPicker visible onClose={onClose} onSelectMedia={onSelectMedia} />,
    )

    await fireEvent.press(view.root.findByProps({ accessibilityLabel: 'Document' }))
    await fireEvent.press(view.root.findByProps({ accessibilityLabel: 'Audio' }))

    expect(onSelectMedia).toHaveBeenNthCalledWith(1, expect.objectContaining({
      type: 'document',
      uri: 'file:///report.pdf',
      fileName: 'report.pdf',
      mimeType: 'application/pdf',
    }))
    expect(onSelectMedia).toHaveBeenNthCalledWith(2, expect.objectContaining({
      type: 'audio',
      uri: 'file:///clip.mp3',
      source: 'audio_document',
    }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('normalizes Android document content URIs before selecting media', async () => {
    const onSelectMedia = vi.fn()
    mockState.documentPicker.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'content://downloads/report', name: 'report.pdf', mimeType: 'application/pdf', size: 123 }],
    })
    mockState.media.normalizeOutgoingMediaAttachment.mockResolvedValue({
      id: 'media_1',
      type: 'document',
      uri: 'file:///cache/outgoing_media/report.pdf',
      source: 'document',
      fileName: 'report.pdf',
      mimeType: 'application/pdf',
      fileSize: 123,
    })
    const view = render(
      <MediaPicker visible onClose={vi.fn()} onSelectMedia={onSelectMedia} />,
    )

    await fireEvent.press(view.root.findByProps({ accessibilityLabel: 'Document' }))

    expect(mockState.media.normalizeOutgoingMediaAttachment).toHaveBeenCalledWith(expect.objectContaining({
      uri: 'content://downloads/report',
      source: 'document',
    }))
    expect(onSelectMedia).toHaveBeenCalledWith(expect.objectContaining({
      uri: 'file:///cache/outgoing_media/report.pdf',
    }))
  })

  it('allows gallery media with limited Android photo-library access', async () => {
    const onSelectMedia = vi.fn()
    mockState.imagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({
      granted: false,
      status: 'denied',
      accessPrivileges: 'limited',
    })
    mockState.imagePicker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cache/photo.jpg', fileName: 'photo.jpg', mimeType: 'image/jpeg', fileSize: 456 }],
    })
    const view = render(
      <MediaPicker visible onClose={vi.fn()} onSelectMedia={onSelectMedia} />,
    )

    await fireEvent.press(view.root.findByProps({ accessibilityLabel: 'Gallery' }))

    expect(onSelectMedia).toHaveBeenCalledWith(expect.objectContaining({
      uri: 'file:///cache/photo.jpg',
      fileName: 'photo.jpg',
    }))
  })

  it('routes crypto and hashtag actions through callbacks', async () => {
    const onClose = vi.fn()
    const onSendCrypto = vi.fn()
    const onHashtag = vi.fn()
    const view = render(
      <MediaPicker
        visible
        onClose={onClose}
        onSelectMedia={vi.fn()}
        onSendCrypto={onSendCrypto}
        onHashtag={onHashtag}
      />,
    )

    await fireEvent.press(view.root.findByProps({ accessibilityLabel: 'Send' }))
    await fireEvent.press(view.root.findByProps({ accessibilityLabel: '#Tag' }))

    expect(onClose).toHaveBeenCalledTimes(2)
    expect(onSendCrypto).toHaveBeenCalled()
    expect(onHashtag).toHaveBeenCalled()
  })

  it('routes action callbacks even when haptics reject', async () => {
    mockState.haptics.impactAsync.mockRejectedValueOnce(new Error('haptics unavailable'))
    const onClose = vi.fn()
    const onSendCrypto = vi.fn()
    const view = render(
      <MediaPicker
        visible
        onClose={onClose}
        onSelectMedia={vi.fn()}
        onSendCrypto={onSendCrypto}
      />,
    )

    await fireEvent.press(view.root.findByProps({ accessibilityLabel: 'Send' }))

    expect(onClose).toHaveBeenCalled()
    expect(onSendCrypto).toHaveBeenCalled()
  })
})
