/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  act,
  bubbleMocks,
  createAttachment,
  fireEvent,
  getAllByHostType,
  nearestPressable,
  render,
  resetBubbleMocks,
  screen,
} from './testUtils'

describe('chat attachment bubble interactions', () => {
  let ImageAttachment: typeof import('./ImageAttachment').ImageAttachment
  let PdfPreviewAttachment: typeof import('./PdfPreviewAttachment').PdfPreviewAttachment
  let DocumentAttachment: typeof import('./DocumentAttachment').DocumentAttachment
  let VoiceNoteAttachment: typeof import('./VoiceNoteAttachment').VoiceNoteAttachment

  beforeEach(async () => {
    resetBubbleMocks()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    ;({ ImageAttachment } = await import('./ImageAttachment'))
    ;({ PdfPreviewAttachment } = await import('./PdfPreviewAttachment'))
    ;({ DocumentAttachment } = await import('./DocumentAttachment'))
    ;({ VoiceNoteAttachment } = await import('./VoiceNoteAttachment'))
  })

  it('does not render or export untrusted image URIs', () => {
    const tree = render(
      <ImageAttachment
        attachment={createAttachment({ uri: 'https://evil.example/photo.jpg' })}
        isOwn={false}
      />,
    )

    expect(screen.getByText('Image unavailable')).toBeTruthy()
    expect(getAllByHostType(tree.root, 'ExpoImage')).toHaveLength(0)
    expect(bubbleMocks.alert.alert).not.toHaveBeenCalled()
  })

  it('exposes save and share actions only for trusted images', async () => {
    const tree = render(
      <ImageAttachment
        attachment={createAttachment({ uri: 'file:///cache/photo.jpg' })}
        isOwn={false}
      />,
    )

    const imagePressable = getAllByHostType(tree.root, 'Pressable')[0]
    await act(async () => {
      imagePressable.props.onLongPress?.()
    })

    const buttons = bubbleMocks.alert.alert.mock.calls[0][2] as Array<{ onPress?: () => Promise<void> | void }>
    await act(async () => {
      await buttons[0].onPress?.()
      await buttons[1].onPress?.()
    })

    expect(bubbleMocks.saveImageToLibrary).toHaveBeenCalledWith('file:///cache/photo.jpg', {
      defaultExtension: 'jpg',
    })
    expect(bubbleMocks.shareAttachment).toHaveBeenCalledWith('file:///cache/photo.jpg', {
      dialogTitle: 'photo.jpg',
      fileName: 'photo.jpg',
      mimeType: 'image/jpeg',
    })
  })

  it('opens PDF previews only after encrypted attachments resolve to trusted URIs', async () => {
    const attachment = createAttachment({
      type: 'document',
      uri: '',
      fileName: 'secure.pdf',
      mimeType: 'application/pdf',
      isEncrypted: true,
    })
    const onPrepareAttachment = vi.fn(async () => ({
      ...attachment,
      uri: 'file:///cache/secure.pdf',
      isEncrypted: false,
    }))

    const tree = render(
      <PdfPreviewAttachment
        attachment={attachment}
        isOwn={false}
        onPrepareAttachment={onPrepareAttachment}
      />,
    )

    await fireEvent.press(getAllByHostType(tree.root, 'Pressable')[0])

    expect(onPrepareAttachment).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('media-lightbox').props).toMatchObject({
      visible: true,
      uri: 'file:///cache/secure.pdf',
      mediaType: 'pdf',
    })
  })

  it('rejects untrusted PDF preview URIs', async () => {
    const tree = render(
      <PdfPreviewAttachment
        attachment={createAttachment({
          type: 'document',
          uri: 'https://evil.example/remote.pdf',
          fileName: 'remote.pdf',
          mimeType: 'application/pdf',
        })}
        isOwn={false}
      />,
    )

    await fireEvent.press(getAllByHostType(tree.root, 'Pressable')[0])

    expect(bubbleMocks.alert.alert).toHaveBeenCalledWith(
      'File unavailable',
      'This PDF is not available on this device yet.',
    )
    expect(screen.getByTestId('media-lightbox').props.visible).toBe(false)
  })

  it('prepares encrypted documents before opening them externally', async () => {
    const attachment = createAttachment({
      type: 'document',
      uri: '',
      fileName: 'secure.txt',
      mimeType: 'text/plain',
      isEncrypted: true,
    })
    const prepared = {
      ...attachment,
      uri: 'file:///cache/secure.txt',
      isEncrypted: false,
    }
    const onPrepareAttachment = vi.fn(async () => prepared)

    const tree = render(
      <DocumentAttachment
        attachment={attachment}
        isOwn={false}
        onPrepareAttachment={onPrepareAttachment}
      />,
    )

    await fireEvent.press(getAllByHostType(tree.root, 'Pressable')[0])

    expect(onPrepareAttachment).toHaveBeenCalledTimes(1)
    expect(bubbleMocks.openAttachmentExternally).toHaveBeenCalledWith(prepared)
  })

  it('loads encrypted voice notes on demand and rejects untrusted audio URIs', async () => {
    const encryptedVoice = createAttachment({
      type: 'voice_note',
      uri: '',
      fileName: 'voice.m4a',
      mimeType: 'audio/m4a',
      isEncrypted: true,
      durationMs: 1200,
    })
    const onPrepareAttachment = vi.fn(async () => ({
      ...encryptedVoice,
      uri: 'file:///cache/voice.m4a',
      isEncrypted: false,
    }))

    render(
      <VoiceNoteAttachment
        attachment={encryptedVoice}
        isOwn={false}
        onPrepareAttachment={onPrepareAttachment}
      />,
    )

    await fireEvent.press(nearestPressable(screen.getByText('Tap to load voice note')))

    expect(screen.getByTestId('audio-player').props.uri).toBe('file:///cache/voice.m4a')

    render(
      <VoiceNoteAttachment
        attachment={createAttachment({
          type: 'voice_note',
          uri: 'https://evil.example/voice.m4a',
          fileName: 'voice.m4a',
          mimeType: 'audio/m4a',
        })}
        isOwn={false}
      />,
    )

    expect(screen.getByText('Voice note unavailable')).toBeTruthy()
    expect(() => screen.getByTestId('audio-player')).toThrow()
  })
})
