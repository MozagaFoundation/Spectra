/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

type PreviewableAttachment = {
  isEncrypted?: boolean
  mimeType?: string
  thumbnail?: string
  uri?: string
}

const MAX_INLINE_PREVIEW_BASE64_LENGTH = 120_000
const SAFE_PREVIEW_PROTOCOLS = new Set(['asset:', 'content:', 'data:', 'file:', 'ph:'])

function hasExplicitUriScheme(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(value)
}

function isSafePreviewUri(value: string): boolean {
  try {
    return SAFE_PREVIEW_PROTOCOLS.has(new URL(value).protocol)
  } catch {
    return false
  }
}

export function getAttachmentPreviewUri(attachment: PreviewableAttachment): string | null {
  if (attachment.isEncrypted && !attachment.uri) {
    return null
  }

  const candidate = attachment.uri || attachment.thumbnail
  if (!candidate) return null
  if (hasExplicitUriScheme(candidate)) {
    return isSafePreviewUri(candidate) ? candidate : null
  }
  if (candidate.length > MAX_INLINE_PREVIEW_BASE64_LENGTH) {
    return null
  }
  return `data:${attachment.mimeType || 'image/jpeg'};base64,${candidate}`
}

