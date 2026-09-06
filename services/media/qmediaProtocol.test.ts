/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'
import {
  buildQMediaReferences,
  parseMediaFromContent,
} from './qmediaProtocol'

const MEDIA_ID = '11111111-2222-4333-8444-555555555555'
const MEDIA_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='

describe('qmediaProtocol', () => {
  it('round-trips the current QMEDIA format', () => {
    const reference = buildQMediaReferences([{
      id: MEDIA_ID,
      encryptionKey: MEDIA_KEY,
      type: 'image',
      fileName: 'photo:one.jpg',
      mimeType: 'image/jpeg',
      fileSize: 1234,
      width: 640,
      height: 480,
      waveform: [0.123, 0.456],
    }])

    const result = parseMediaFromContent(`${reference}\nhello`)

    expect(result.textContent).toBe('hello')
    expect(result.attachments).toEqual([expect.objectContaining({
      id: MEDIA_ID,
      encryptionKey: MEDIA_KEY,
      type: 'image',
      fileName: 'photo:one.jpg',
      mimeType: 'image/jpeg',
      fileSize: 1234,
      width: 640,
      height: 480,
      waveform: [0.12, 0.46],
      isEncrypted: true,
      uri: '',
    })])
  })

  it('preserves voice-note duration and waveform metadata', () => {
    const reference = buildQMediaReferences([{
      id: MEDIA_ID,
      encryptionKey: MEDIA_KEY,
      type: 'voice_note',
      fileName: 'voice_note.m4a',
      mimeType: 'audio/m4a',
      fileSize: 321,
      durationMs: 1250,
      waveform: [0.5, 0.7, 0.9],
    }])

    const result = parseMediaFromContent(reference)

    expect(result.attachments).toEqual([expect.objectContaining({
      id: MEDIA_ID,
      encryptionKey: MEDIA_KEY,
      type: 'voice_note',
      fileName: 'voice_note.m4a',
      mimeType: 'audio/m4a',
      fileSize: 321,
      durationMs: 1250,
      waveform: [0.5, 0.7, 0.9],
      isEncrypted: true,
      uri: '',
    })])
  })

  it('keeps parsing persisted legacy QMEDIA references', () => {
    const legacyReference = `[QMEDIA:${MEDIA_ID}:${MEDIA_KEY}:image:photo%3Aone.jpg:640:480:0:0.25,0.75]`

    const result = parseMediaFromContent(`${legacyReference}\nlegacy body`)

    expect(result.textContent).toBe('legacy body')
    expect(result.attachments).toEqual([expect.objectContaining({
      id: MEDIA_ID,
      encryptionKey: MEDIA_KEY,
      type: 'image',
      fileName: 'photo:one.jpg',
      mimeType: 'image/jpeg',
      fileSize: 0,
      width: 640,
      height: 480,
      waveform: [0.25, 0.75],
      isEncrypted: true,
      uri: '',
    })])
  })

  it('leaves path-like legacy media ids encrypted in text instead of parsing attachments', () => {
    const legacyReference = `[QMEDIA:../escape:${MEDIA_KEY}:image:photo.jpg:640:480:0:0.25]`

    const result = parseMediaFromContent(`${legacyReference}\nlegacy body`)

    expect(result.textContent).toBe(`${legacyReference}\nlegacy body`)
    expect(result.attachments).toBeUndefined()
  })
})
