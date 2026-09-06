/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { View } from 'react-native'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  createAttachment,
  getAllByHostType,
  render,
  resetBubbleMocks,
  screen,
} from './testUtils'
import type { MediaAttachment } from '@/lib/types'

describe('renderAttachment', () => {
  let renderAttachment: typeof import('./renderAttachment').renderAttachment

  beforeEach(async () => {
    resetBubbleMocks()
    ;({ renderAttachment } = await import('./renderAttachment'))
  })

  function renderRoutedAttachment(attachment: MediaAttachment) {
    return render(
      <View>
        {renderAttachment(attachment, false, async () => ({
          ...attachment,
          uri: 'file:///cache/prepared.bin',
          isEncrypted: false,
        }))}
      </View>,
    )
  }

  it('routes image attachments through the trusted image renderer', () => {
    const tree = renderRoutedAttachment(createAttachment())

    expect(getAllByHostType(tree.root, 'ExpoImage')).toHaveLength(1)
  })

  it('routes camera videos as openable documents instead of broken image previews', () => {
    const tree = renderRoutedAttachment(createAttachment({
      type: 'video',
      uri: 'file:///cache/clip.mp4',
      fileName: 'clip.mp4',
      mimeType: 'video/mp4',
    }))

    expect(screen.getByText('clip.mp4')).toBeTruthy()
    expect(getAllByHostType(tree.root, 'ExpoImage')).toHaveLength(0)
  })

  it('routes image-like documents, GIFs, and stickers through the image renderer', () => {
    const imageDocument = renderRoutedAttachment(createAttachment({
      type: 'document',
      fileName: 'inline.png',
      mimeType: 'image/png',
    }))
    expect(getAllByHostType(imageDocument.root, 'ExpoImage')).toHaveLength(1)
    imageDocument.unmount()

    const gif = renderRoutedAttachment(createAttachment({
      type: 'gif',
      fileName: 'fun.gif',
      mimeType: 'image/gif',
    }))
    expect(getAllByHostType(gif.root, 'ExpoImage')).toHaveLength(1)
    gif.unmount()

    const sticker = renderRoutedAttachment(createAttachment({
      type: 'sticker',
      fileName: 'sticker.webp',
      mimeType: 'image/webp',
    }))
    expect(getAllByHostType(sticker.root, 'ExpoImage')).toHaveLength(1)
  })

  it('routes PDFs, generic documents, audio files, and voice notes to their dedicated renderers', () => {
    renderRoutedAttachment(createAttachment({
      type: 'document',
      fileName: 'report.pdf',
      mimeType: 'application/pdf',
    }))
    expect(screen.getByText('PDF')).toBeTruthy()

    renderRoutedAttachment(createAttachment({
      type: 'document',
      fileName: 'report.txt',
      mimeType: 'text/plain',
    }))
    expect(screen.getByText('report.txt')).toBeTruthy()

    renderRoutedAttachment(createAttachment({
      type: 'audio',
      fileName: 'song.mp3',
      mimeType: 'audio/mpeg',
    }))
    expect(screen.getByText('song.mp3')).toBeTruthy()

    renderRoutedAttachment(createAttachment({
      type: 'voice_note',
      uri: 'file:///cache/voice.m4a',
      fileName: 'voice.m4a',
      mimeType: 'audio/m4a',
    }))
    expect(screen.getByTestId('audio-player')).toBeTruthy()
  })

  it('renders nothing for unsupported attachment types', () => {
    const tree = renderRoutedAttachment(createAttachment({
      type: 'unsupported' as MediaAttachment['type'],
      mimeType: 'application/octet-stream',
    }))

    expect(tree.root.findAll((node) => String(node.type) !== 'View')).toHaveLength(0)
  })
})
