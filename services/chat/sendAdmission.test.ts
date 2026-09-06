/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'
import type { MediaAttachment } from '@/lib/types'
import { evaluateChatSendPolicy } from './sendAdmission'

const openPolicy = {
  enabled: false,
  walletIsSpectre: false,
} as const

const imageAttachment: MediaAttachment = {
  id: 'image-1',
  type: 'image',
  uri: 'file:///image.jpg',
  fileName: 'image.jpg',
  mimeType: 'image/jpeg',
  fileSize: 42,
}

describe('evaluateChatSendPolicy', () => {
  it('normalizes accepted text without remote work', () => {
    expect(evaluateChatSendPolicy({
      content: '  hello  ',
      spectrePolicyState: openPolicy,
    })).toEqual({
      accepted: true,
      content: 'hello',
      attachments: undefined,
      options: undefined,
    })
  })

  it('rejects empty and Bluetooth media sends', () => {
    expect(evaluateChatSendPolicy({
      content: '   ',
      spectrePolicyState: openPolicy,
    })).toMatchObject({ accepted: false, reason: 'empty' })

    expect(evaluateChatSendPolicy({
      content: '',
      attachments: [imageAttachment],
      spectrePolicyState: openPolicy,
      textOnlyMode: true,
    })).toMatchObject({ accepted: false, reason: 'text_only_attachment' })
  })

  it('rejects special delivery and media in Spectre Mode', () => {
    expect(evaluateChatSendPolicy({
      content: 'secret',
      options: { oneTime: { kind: 'text' } },
      spectrePolicyState: { enabled: true },
    })).toMatchObject({ accepted: false, reason: 'spectre_restricted' })

    expect(evaluateChatSendPolicy({
      content: '',
      attachments: [imageAttachment],
      spectrePolicyState: { enabled: true },
    })).toMatchObject({ accepted: false, reason: 'spectre_restricted' })
  })

  it('accepts one supported one-time attachment and rejects mixed content', () => {
    expect(evaluateChatSendPolicy({
      content: '',
      attachments: [imageAttachment],
      options: { oneTime: { kind: 'image' } },
      spectrePolicyState: openPolicy,
    })).toMatchObject({ accepted: true, content: '' })

    expect(evaluateChatSendPolicy({
      content: 'caption',
      attachments: [imageAttachment],
      options: { oneTime: { kind: 'image' } },
      spectrePolicyState: openPolicy,
    })).toMatchObject({ accepted: false, reason: 'view_once_invalid' })
  })
})
