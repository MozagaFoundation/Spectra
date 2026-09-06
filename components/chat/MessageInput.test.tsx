/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMediaAttachment } from '@/test/chatComponentMocks'

const mockState = vi.hoisted(() => ({
  alert: vi.fn(),
  haptics: {
    impactAsync: vi.fn(async () => undefined),
    ImpactFeedbackStyle: { Medium: 'medium', Light: 'light' },
  },
}))

vi.mock('react-native', async () => ({
  ...await import('../../test/react-native'),
  Alert: { alert: mockState.alert },
}))

vi.mock('expo-image', () => ({ Image: 'Image' }))
vi.mock('react-native-pdf', () => ({ default: 'Pdf' }))
vi.mock('expo-haptics', () => mockState.haptics)
vi.mock('lucide-react-native', async () => {
  const { TestChatIcon } = await import('../../test/chatComponentMocks')
  return {
    FileText: TestChatIcon,
    Mic: TestChatIcon,
    Pencil: TestChatIcon,
    Plus: TestChatIcon,
    Send: TestChatIcon,
    Timer: TestChatIcon,
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

vi.mock('@/lib/i18n/direction', () => ({
  getDirectionalTextStyle: () => ({}),
  getLogicalRowDirection: () => 'row',
  getStartBorderStyle: () => ({}),
  isCurrentLanguageRtl: () => false,
}))

vi.mock('@/lib/theme', async () => {
  const { chatTestColors } = await import('../../test/chatComponentMocks')
  return { useThemeColors: () => chatTestColors }
})

vi.mock('@/lib/viewOnce', () => ({
  getViewOncePreviewLabel: (kind: string) => `View once ${kind}`,
  inferViewOnceKindFromAttachment: (attachment: { type: string; mimeType?: string }) => (
    attachment.type === 'image' || attachment.mimeType?.startsWith('image/')
      ? 'image'
      : attachment.type === 'voice_note'
        ? 'voice_note'
        : null
  ),
}))

vi.mock('@/services/media/editedImageCache', () => ({
  cleanupEditedAttachments: vi.fn(async () => undefined),
}))
vi.mock('@/store/spectreStore', () => ({
  useSpectreStore: (selector: (state: { enabled: boolean; spectreAccountMode: boolean }) => unknown) => selector({
    enabled: false,
    spectreAccountMode: false,
  }),
}))
vi.mock('@/store/walletStore', () => ({
  useWalletStore: (selector: (state: { wallet: { spectreMode: boolean } | null }) => unknown) => selector({
    wallet: { spectreMode: false },
  }),
}))
vi.mock('@/lib/spectrePolicy', () => ({
  getSpectreChatRestrictionMessage: () => null,
  isSpectrePolicyActive: () => false,
  SPECTRE_TEXT_ONLY_MESSAGE: 'Spectre text only',
}))

vi.mock('@/components/media/ImageEditorModal', async () => {
  const ReactActual = await import('react')
  const { Pressable, Text, View } = await import('../../test/react-native')
  return {
    ImageEditorModal: ({
      visible,
      attachment,
      onUseOriginal,
      onSave,
    }: {
      visible: boolean
      attachment: ReturnType<typeof createMediaAttachment> | null
      onUseOriginal?: (attachment: ReturnType<typeof createMediaAttachment>) => void
      onSave: (attachment: ReturnType<typeof createMediaAttachment>) => void
    }) => visible && attachment ? (
      ReactActual.createElement(
        View,
        { testID: 'mock-image-editor' },
        ReactActual.createElement(
          Pressable,
          {
            onPress: () => onUseOriginal?.(attachment),
            testID: 'mock-use-original',
          },
          ReactActual.createElement(Text, null, 'Use original'),
        ),
        ReactActual.createElement(
          Pressable,
          {
            onPress: () => onSave({
              ...attachment,
              id: 'edited-attachment',
              uri: 'file:///edited.jpg',
              fileName: 'image_edited.jpg',
              fileSize: 2048,
              width: 320,
              height: 180,
              source: 'gallery_edited',
            }),
            testID: 'mock-save-edited-image',
          },
          ReactActual.createElement(Text, null, 'Save edited'),
        ),
      )
    ) : null,
  }
})

vi.mock('./MediaPicker', async () => {
  const ReactActual = await import('react')
  const { Pressable, Text, View } = await import('../../test/react-native')
  return {
    MediaPicker: ({
      visible,
      onSelectMedia,
    }: {
      visible: boolean
      onSelectMedia: (attachment: ReturnType<typeof createMediaAttachment>) => void
    }) => visible ? (
      ReactActual.createElement(
        View,
        { testID: 'mock-media-picker' },
        ReactActual.createElement(
          Pressable,
          {
            onPress: () => onSelectMedia(createMediaAttachment()),
            testID: 'mock-select-image',
          },
          ReactActual.createElement(Text, null, 'Select image'),
        ),
      )
    ) : null,
  }
})

vi.mock('./VoiceRecorder', async () => {
  const ReactActual = await import('react')
  const { Text, View } = await import('../../test/react-native')
  return {
    VoiceRecorder: () => ReactActual.createElement(View, { testID: 'mock-voice-recorder' }, ReactActual.createElement(Text, null, 'Recording')),
  }
})

const { act, fireEvent, render } = await import('@testing-library/react-native')
const { MessageInput } = await import('./MessageInput')

async function flushLazyComponent(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function waitForTestId(
  view: ReturnType<typeof render>,
  testID: string,
) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const node = view.queryByTestId(testID)
    if (node) return node
    await flushLazyComponent()
  }
  return view.getByTestId(testID)
}

function pressableByLabel(root: ReturnType<typeof render>['root'], label: string) {
  return root.findByProps({ accessibilityLabel: label })
}

describe('MessageInput', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('trims text and sends it with no attachment options', async () => {
    const onSend = vi.fn()
    const view = render(<MessageInput onSend={onSend} />)

    await fireEvent.changeText(view.root.findByType('TextInput' as any), '  hello auditors  ')
    await fireEvent.press(pressableByLabel(view.root, 'Send message'))

    expect(onSend).toHaveBeenCalledWith('hello auditors', undefined, undefined)
  })

  it('clears immediately and blocks duplicate rapid submissions', async () => {
    const onSend = vi.fn()
    const view = render(<MessageInput onSend={onSend} />)
    const input = view.root.findByType('TextInput' as any)

    await fireEvent.changeText(input, 'send once')
    await fireEvent.press(pressableByLabel(view.root, 'Send message'))
    await fireEvent.press(pressableByLabel(view.root, 'Send message'))

    expect(input.props.value).toBe('')
    expect(onSend).toHaveBeenCalledTimes(1)
    expect(onSend).toHaveBeenCalledWith('send once', undefined, undefined)
  })

  it('rejects delayed autocorrect text after send and accepts the next keystroke', async () => {
    const view = render(<MessageInput onSend={vi.fn()} />)
    const input = view.root.findByType('TextInput' as any)

    await fireEvent.changeText(input, 'mispelled')
    await fireEvent.press(pressableByLabel(view.root, 'Send message'))
    await fireEvent.changeText(input, 'misspelled')

    expect(input.props.value).toBe('')

    input.props.onKeyPress({ nativeEvent: { key: 'n' } })
    await fireEvent.changeText(input, 'next message')

    expect(input.props.value).toBe('next message')
  })

  it('restores text when sending throws synchronously', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const view = render(<MessageInput onSend={() => { throw new Error('send failed') }} />)
    const input = view.root.findByType('TextInput' as any)

    await fireEvent.changeText(input, 'keep this message')
    await fireEvent.press(pressableByLabel(view.root, 'Send message'))

    expect(input.props.value).toBe('keep this message')
    consoleError.mockRestore()
  })

  it('keeps the draft when the chat rejects local admission', async () => {
    const view = render(
      <MessageInput
        onSend={() => ({
          accepted: false,
          reason: 'chat_not_ready',
          message: 'Chat is still being secured.',
        })}
      />,
    )
    const input = view.root.findByType('TextInput' as any)

    await fireEvent.changeText(input, 'keep until ready')
    await fireEvent.press(pressableByLabel(view.root, 'Send message'))

    expect(input.props.value).toBe('keep until ready')
  })

  it('sends text even when haptics reject', async () => {
    mockState.haptics.impactAsync.mockRejectedValueOnce(new Error('haptics unavailable'))
    const onSend = vi.fn()
    const view = render(<MessageInput onSend={onSend} />)

    await fireEvent.changeText(view.root.findByType('TextInput' as any), 'android send')
    await fireEvent.press(pressableByLabel(view.root, 'Send message'))

    expect(onSend).toHaveBeenCalledWith('android send', undefined, undefined)
  })

  it('passes one-time text options when enabled', async () => {
    const onSend = vi.fn()
    const view = render(<MessageInput onSend={onSend} />)

    await fireEvent.press(pressableByLabel(view.root, 'Toggle one-time message'))
    await fireEvent.changeText(view.root.findByType('TextInput' as any), 'secret')
    await fireEvent.press(pressableByLabel(view.root, 'Send message'))

    expect(onSend).toHaveBeenCalledWith('secret', undefined, { oneTime: { kind: 'text' } })
  })

  it('blocks one-time sends that combine text and an attachment', async () => {
    const onSend = vi.fn()
    const view = render(<MessageInput onSend={onSend} />)

    await fireEvent.press(pressableByLabel(view.root, 'Toggle one-time message'))
    await fireEvent.press(pressableByLabel(view.root, 'Add attachment'))
    await fireEvent.press(await waitForTestId(view, 'mock-select-image'))
    await fireEvent.changeText(view.root.findByType('TextInput' as any), 'secret with photo')
    await fireEvent.press(pressableByLabel(view.root, 'Send message'))

    expect(onSend).not.toHaveBeenCalled()
    expect(mockState.alert).toHaveBeenCalledWith('One-time messages', 'Send a one-time text or one-time attachment, but not both together.')
  })

  it('attaches selected image media without requiring the editor', async () => {
    const onSend = vi.fn()
    const view = render(<MessageInput onSend={onSend} />)

    await fireEvent.press(pressableByLabel(view.root, 'Add attachment'))
    await fireEvent.press(await waitForTestId(view, 'mock-select-image'))

    expect(view.queryByTestId('mock-image-editor')).toBeNull()

    await fireEvent.press(pressableByLabel(view.root, 'Send message'))

    expect(onSend).toHaveBeenCalledWith('', [
      expect.objectContaining({
        id: 'attachment-1',
        uri: 'file:///tmp/image.jpg',
        fileName: 'image.jpg',
      }),
    ], undefined)
  })

  it('edits a pending image attachment when requested', async () => {
    const onSend = vi.fn()
    const view = render(<MessageInput onSend={onSend} />)

    await fireEvent.press(pressableByLabel(view.root, 'Add attachment'))
    await fireEvent.press(await waitForTestId(view, 'mock-select-image'))
    await fireEvent.press(pressableByLabel(view.root, 'Edit image'))

    expect(await waitForTestId(view, 'mock-image-editor')).toBeTruthy()

    await fireEvent.press(view.getByTestId('mock-save-edited-image'))
    await fireEvent.press(pressableByLabel(view.root, 'Send message'))

    expect(onSend).toHaveBeenCalledWith('', [
      expect.objectContaining({
        id: 'edited-attachment',
        uri: 'file:///edited.jpg',
        fileName: 'image_edited.jpg',
        source: 'gallery_edited',
      }),
    ], undefined)
  })

  it('blocks media entry points while in text-only mode', async () => {
    const view = render(<MessageInput onSend={vi.fn()} textOnlyMode />)

    await fireEvent.press(pressableByLabel(view.root, 'Add attachment'))
    await fireEvent.press(pressableByLabel(view.root, 'Record voice note'))

    expect(view.queryByTestId('mock-media-picker')).toBeNull()
    expect(view.queryByTestId('mock-voice-recorder')).toBeNull()
  })

  it('renders reply context and invokes cancel', async () => {
    const onCancelReply = vi.fn()
    const view = render(
      <MessageInput
        onSend={vi.fn()}
        replyTo={{
          messageId: 'reply-1',
          previewText: 'Original text',
          senderId: 'identity-bob',
          senderName: 'Bob',
        }}
        onCancelReply={onCancelReply}
      />,
    )

    expect(view.getByText('Bob')).toBeTruthy()
    expect(view.getByText('Original text')).toBeTruthy()

    await fireEvent.press(pressableByLabel(view.root, 'Cancel reply'))

    expect(onCancelReply).toHaveBeenCalled()
  })
})
