/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/i18n', () => ({
  translate: (key: string, options?: { ns?: string }) => options?.ns ? `${options.ns}:${key}` : key,
}))

import {
  VIEW_ONCE_CONSUMED_TEXT,
  createLockedGenericOneTimeMessage,
  createLockedOneTimeMessage,
  getChatMessagePreviewText,
  getConsumedOneTimeUpdates,
  getViewOncePreviewLabel,
  inferViewOnceKindFromAttachment,
  isLockedOneTimeMessage,
  isOneTimeKind,
  requiresOneTimeReveal,
} from './viewOnce'

describe('viewOnce', () => {
  it('recognizes supported one-time message kinds', () => {
    expect(isOneTimeKind('text')).toBe(true)
    expect(isOneTimeKind('image')).toBe(true)
    expect(isOneTimeKind('voice_note')).toBe(true)
    expect(isOneTimeKind('video')).toBe(false)
    expect(isOneTimeKind(null)).toBe(false)
  })

  it('renders preview labels by kind', () => {
    expect(getViewOncePreviewLabel('text')).toBe('chat:One-time message')
    expect(getViewOncePreviewLabel('image')).toBe('chat:One-time photo')
    expect(getViewOncePreviewLabel('voice_note')).toBe('chat:One-time voice note')
  })

  it('infers view-once kinds only for supported attachment types', () => {
    expect(inferViewOnceKindFromAttachment({ type: 'image' } as any)).toBe('image')
    expect(inferViewOnceKindFromAttachment({ type: 'voice_note' } as any)).toBe('voice_note')
    expect(inferViewOnceKindFromAttachment({ type: 'video' } as any)).toBeNull()
    expect(inferViewOnceKindFromAttachment(null)).toBeNull()
  })

  it('creates locked and generic reveal-required one-time metadata', () => {
    expect(createLockedOneTimeMessage('image')).toEqual({
      kind: 'image',
      state: 'locked',
      requiresReveal: undefined,
    })
    expect(createLockedGenericOneTimeMessage()).toEqual({
      kind: 'text',
      state: 'locked',
      requiresReveal: true,
    })
  })

  it('detects locked and reveal-required messages until consumption', () => {
    expect(isLockedOneTimeMessage({ oneTime: { kind: 'text', state: 'locked' } } as any)).toBe(true)
    expect(isLockedOneTimeMessage({ oneTime: { kind: 'text', state: 'consumed' } } as any)).toBe(false)
    expect(requiresOneTimeReveal({
      oneTime: { kind: 'text', state: 'locked', requiresReveal: true },
    } as any)).toBe(true)
    expect(requiresOneTimeReveal({
      oneTime: { kind: 'text', state: 'consumed', requiresReveal: true },
    } as any)).toBe(false)
  })

  it('builds safe chat preview text for locked, text, attachment, and empty messages', () => {
    expect(getChatMessagePreviewText({
      content: 'secret',
      oneTime: { kind: 'image', state: 'locked' },
    } as any)).toBe('chat:One-time photo')
    expect(getChatMessagePreviewText({ content: ' hello ', attachments: [] } as any)).toBe('hello')
    expect(getChatMessagePreviewText({
      content: '',
      attachments: [{ type: 'voice_note' }],
    } as any)).toBe('Voice message')
    expect(getChatMessagePreviewText({ content: '', attachments: [] } as any)).toBe('Message')
  })

  it('removes content and attachments when a view-once message is consumed', () => {
    expect(VIEW_ONCE_CONSUMED_TEXT).toBe('chat:Opened once')
    expect(getConsumedOneTimeUpdates({
      oneTime: { kind: 'voice_note', state: 'locked' },
    } as any, 123)).toEqual({
      content: 'chat:Opened once',
      attachments: undefined,
      oneTime: {
        kind: 'voice_note',
        state: 'consumed',
        consumedAt: 123,
      },
    })
  })
})
