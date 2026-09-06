/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { MediaAttachment, MediaType } from '@/lib/types'

const QMEDIA_PATTERN = /\[QMEDIA:([a-f0-9-]+):([A-Za-z0-9+/=]+):([^:]+):([^:]*):([^:]*):(\d+):(\d+):(\d+):(\d+):([^\]]*)\]/g
const LEGACY_QMEDIA_PATTERN = /\[QMEDIA:([^\]]+)\]/g
const SAFE_MEDIA_ID_PATTERN = /^[a-zA-Z0-9_-][a-zA-Z0-9._-]{0,127}$/

export function encodeQMediaPart(value: string): string {
  return encodeURIComponent(value)
}

export function decodeQMediaPart(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export interface ParsedAttachment extends MediaAttachment {
  encryptionKey?: string
}

function isMediaType(type: string): type is MediaType {
  return (
    type === 'image'
    || type === 'video'
    || type === 'audio'
    || type === 'document'
    || type === 'voice_note'
    || type === 'sticker'
    || type === 'gif'
  )
}

function normalizeMediaType(type: string): MediaType {
  return isMediaType(type) ? type : 'document'
}

function isSafeParsedMediaId(id: string): boolean {
  return SAFE_MEDIA_ID_PATTERN.test(id) && !id.includes('..')
}

function parseOptionalNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined
  }

  const parsed = parseInt(value, 10)
  return parsed || undefined
}

function parseWaveform(value: string | undefined): number[] | undefined {
  if (!value) {
    return undefined
  }

  const waveform = value
    .split(',')
    .map((sample) => parseFloat(sample))
    .filter((sample) => !Number.isNaN(sample))

  return waveform.length > 0 ? waveform : undefined
}

function buildParsedAttachment(params: {
  id: string
  encryptionKey: string
  type: string
  fileName: string
  mimeType?: string
  fileSize?: string
  width?: string
  height?: string
  durationMs?: string
  waveform?: string
}): ParsedAttachment {
  const type = normalizeMediaType(params.type)
  const mimeType = params.mimeType
    ? decodeQMediaPart(params.mimeType) || getMimeTypeFromType(type)
    : getMimeTypeFromType(type)

  return {
    id: params.id,
    type,
    fileName: decodeQMediaPart(params.fileName),
    uri: '',
    mimeType,
    fileSize: params.fileSize ? parseInt(params.fileSize, 10) || 0 : 0,
    width: parseOptionalNumber(params.width),
    height: parseOptionalNumber(params.height),
    durationMs: parseOptionalNumber(params.durationMs),
    waveform: parseWaveform(params.waveform),
    isEncrypted: true,
    encryptionKey: params.encryptionKey,
  }
}

export function parseMediaFromContent(content: string): {
  textContent: string
  attachments: ParsedAttachment[] | undefined
} {
  const attachments: ParsedAttachment[] = []
  let textContent = content

  let match

  while ((match = QMEDIA_PATTERN.exec(content)) !== null) {
    const [fullMatch, id, encryptionKey, type, fileName, mimeType, fileSize, width, height, durationMs, waveformStr] = match

    if (!isSafeParsedMediaId(id)) {
      continue
    }

    attachments.push(buildParsedAttachment({
      id,
      encryptionKey,
      type,
      fileName,
      mimeType,
      fileSize,
      width,
      height,
      durationMs,
      waveform: waveformStr,
    }))
    textContent = textContent.replace(fullMatch, '')
  }

  // Parse older media references without MIME type or size.
  if (attachments.length === 0 && content.includes('[QMEDIA:')) {
    while ((match = LEGACY_QMEDIA_PATTERN.exec(content)) !== null) {
      const [fullMatch, innerContent] = match
      const parts = innerContent.split(':')

      if (parts.length >= 7 && parts[1].length >= 40 && /^[A-Za-z0-9+/=]+$/.test(parts[1])) {
        if (parts.length >= 9) {
          const [id, encryptionKey, type, fileName, mimeType, fileSize, width, height, durationMs, ...waveformParts] = parts

          if (!isSafeParsedMediaId(id)) {
            continue
          }

          attachments.push(buildParsedAttachment({
            id,
            encryptionKey,
            type,
            fileName,
            mimeType,
            fileSize,
            width,
            height,
            durationMs,
            waveform: waveformParts.join(':'),
          }))
          textContent = textContent.replace(fullMatch, '')
          continue
        }

        const [id, encryptionKey, type, fileName, width, height, durationMs, ...waveformParts] = parts

        if (!isSafeParsedMediaId(id)) {
          continue
        }

        attachments.push(buildParsedAttachment({
          id,
          encryptionKey,
          type,
          fileName,
          width,
          height,
          durationMs,
          waveform: waveformParts.join(':'),
        }))
        textContent = textContent.replace(fullMatch, '')
      }
    }
  }

  textContent = textContent.replace(/^\n+/, '').trim()

  return { textContent, attachments: attachments.length > 0 ? attachments : undefined }
}

export function getMimeTypeFromType(type: string): string {
  switch (type) {
    case 'image': return 'image/jpeg'
    case 'video': return 'video/mp4'
    case 'audio': return 'audio/mpeg'
    case 'voice_note': return 'audio/m4a'
    case 'document': return 'application/octet-stream'
    case 'sticker': return 'image/webp'
    case 'gif': return 'image/gif'
    default: return 'application/octet-stream'
  }
}

export function buildQMediaReferences(uploadedMedia: Array<{
  id: string
  encryptionKey: string
  type: string
  fileName: string
  mimeType: string
  fileSize: number
  width?: number
  height?: number
  durationMs?: number
  waveform?: number[]
}>): string {
  return uploadedMedia.map(m => {
    const waveformStr = m.waveform ? m.waveform.map(v => v.toFixed(2)).join(',') : ''
    return `[QMEDIA:${m.id}:${m.encryptionKey}:${m.type}:${encodeQMediaPart(m.fileName)}:${encodeQMediaPart(m.mimeType)}:${m.fileSize || 0}:${m.width || 0}:${m.height || 0}:${m.durationMs || 0}:${waveformStr}]`
  }).join('')
}
