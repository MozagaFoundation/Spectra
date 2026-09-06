/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => {
  class MediaExportError extends Error {
    constructor(public code: string, message: string) {
      super(message)
    }
  }
  return {
    alert: vi.fn(),
    diagnostics: vi.fn(),
    media: {
      MediaExportError,
      saveImageToLibrary: vi.fn(async () => undefined),
      shareAttachment: vi.fn(async () => undefined),
    },
  }
})

vi.mock('react-native', async () => ({
  ...await import('../../test/react-native'),
  Alert: { alert: mockState.alert },
}))

vi.mock('expo-image', () => ({ Image: 'Image' }))
vi.mock('react-native-pdf', () => ({ default: 'Pdf' }))
vi.mock('lucide-react-native', async () => {
  const { TestChatIcon } = await import('../../test/chatComponentMocks')
  return { Check: TestChatIcon, Download: TestChatIcon, X: TestChatIcon }
})

vi.mock('@/hooks/useDeviceInsets', () => ({
  useDeviceInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}))

vi.mock('@/lib/i18n', async () => {
  const { translateForChatTest } = await import('../../test/chatComponentMocks')
  return { translate: translateForChatTest }
})

vi.mock('@/lib/theme', async () => {
  const { chatTestColors } = await import('../../test/chatComponentMocks')
  return { useThemeColors: () => chatTestColors }
})

vi.mock('@/services/chat/chatDiagnostics', () => ({
  recordChatDiagnostic: mockState.diagnostics,
}))

vi.mock('@/services/media', () => mockState.media)

const { act, fireEvent, render } = await import('@testing-library/react-native')
const { MediaLightbox } = await import('./MediaLightbox')

function pressableByLabel(root: ReturnType<typeof render>['root'], label: string) {
  return root.findByProps({ accessibilityLabel: label })
}

describe('MediaLightbox', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('records diagnostics and shows unavailable image copy when uri is absent', () => {
    const view = render(
      <MediaLightbox visible mediaType="image" uri={null} onClose={vi.fn()} />,
    )

    expect(view.getByText('Image unavailable')).toBeTruthy()
    expect(mockState.diagnostics).toHaveBeenCalledWith('media', 'lightbox_opened', expect.objectContaining({
      hasUri: false,
      mediaType: 'image',
    }))
  })

  it('saves images and exports pdfs through media services', async () => {
    const imageView = render(
      <MediaLightbox visible mediaType="image" uri="file:///image.jpg" title="image.jpg" onClose={vi.fn()} />,
    )
    await fireEvent.press(pressableByLabel(imageView.root, 'Save image'))

    expect(mockState.media.saveImageToLibrary).toHaveBeenCalledWith('file:///image.jpg', expect.objectContaining({
      fileName: 'image.jpg',
    }))

    const pdfView = render(
      <MediaLightbox visible mediaType="pdf" uri="file:///report.pdf" title="report.pdf" onClose={vi.fn()} />,
    )
    await fireEvent.press(pressableByLabel(pdfView.root, 'Export PDF'))

    expect(mockState.media.shareAttachment).toHaveBeenCalledWith('file:///report.pdf', expect.objectContaining({
      defaultExtension: 'pdf',
      fileName: 'report.pdf',
    }))
  })

  it('toggles image controls when the preview is tapped', async () => {
    const view = render(
      <MediaLightbox visible mediaType="image" uri="file:///image.jpg" title="image.jpg" onClose={vi.fn()} />,
    )

    expect(pressableByLabel(view.root, 'Save image')).toBeTruthy()

    await fireEvent.press(pressableByLabel(view.root, 'Toggle media controls'))

    expect(() => pressableByLabel(view.root, 'Save image')).toThrow()
    expect(() => pressableByLabel(view.root, 'Close media preview')).toThrow()

    await fireEvent.press(pressableByLabel(view.root, 'Toggle media controls'))

    expect(pressableByLabel(view.root, 'Save image')).toBeTruthy()
  })

  it('uses localized copy when PDF preview loading fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const view = render(
      <MediaLightbox visible mediaType="pdf" uri="file:///report.pdf" onClose={vi.fn()} />,
    )
    const pdf = view.root.findByType('Pdf' as any)

    await act(async () => {
      pdf.props.onError(new Error('native pdf detail'))
    })

    expect(view.getByText('File unavailable')).toBeTruthy()
    expect(() => view.getByText('native pdf detail')).toThrow()
    warnSpy.mockRestore()
  })

  it('closes image previews on a clear upward swipe', () => {
    const onClose = vi.fn()
    const view = render(
      <MediaLightbox visible mediaType="image" uri="file:///image.jpg" title="image.jpg" onClose={onClose} />,
    )

    const gestureHost = view.root.find((node) => Boolean(
      node.props?.gestureConfig && typeof (node.props.gestureConfig as { onEnd?: unknown }).onEnd === 'function',
    ))
    const onEnd = gestureHost.props.gestureConfig.onEnd as (event: unknown) => void

    onEnd({ translationX: 6, translationY: -140, velocityX: 0, velocityY: -200 })

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('ignores swipes that do not pass thresholds', () => {
    const onClose = vi.fn()
    const view = render(
      <MediaLightbox visible mediaType="image" uri="file:///image.jpg" title="image.jpg" onClose={onClose} />,
    )

    const gestureHost = view.root.find((node) => Boolean(
      node.props?.gestureConfig && typeof (node.props.gestureConfig as { onEnd?: unknown }).onEnd === 'function',
    ))
    const onEnd = gestureHost.props.gestureConfig.onEnd as (event: unknown) => void

    onEnd({ translationX: 80, translationY: -20, velocityX: 0, velocityY: 0 })
    onEnd({ translationX: 0, translationY: -50, velocityX: 0, velocityY: 0 })

    expect(onClose).not.toHaveBeenCalled()
  })

  it('surfaces export permission errors', async () => {
    mockState.media.saveImageToLibrary.mockRejectedValueOnce(
      new mockState.media.MediaExportError('permission_denied', 'denied'),
    )
    const view = render(
      <MediaLightbox visible mediaType="image" uri="file:///image.jpg" onClose={vi.fn()} />,
    )

    await fireEvent.press(pressableByLabel(view.root, 'Save image'))

    expect(mockState.alert).toHaveBeenCalledWith('Permission needed', 'Allow photo library access to save images.')
  })
})
