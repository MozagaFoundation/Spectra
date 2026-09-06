/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

export type MediaType = 'image' | 'video' | 'audio' | 'document' | 'voice_note' | 'sticker' | 'gif'

export interface MediaAttachment {
  id: string
  type: MediaType
  uri: string                    // Local or remote URI
  source?: string
  fileName: string
  mimeType: string
  fileSize: number
  width?: number                 // Image/video width
  height?: number
  durationMs?: number            // Audio/video duration
  waveform?: number[]            // Normalized voice waveform
  thumbnail?: string             // Base64 thumbnail
  isEncrypted?: boolean          // Encrypted content
  isViewOnce?: boolean
}
