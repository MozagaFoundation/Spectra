/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

const MAX_HIDDEN_PREVIEW_PARSE_LENGTH = 4096
const HIDDEN_PREVIEW_TYPES = new Set([
  'reaction',
  'deletion',
  'conversation_delete',
  'view_once_consumed',
  'disappearing_timer',
  'crypto_payment_request_update',
  'group_sender_key_distribution',
  'group_sender_key_request',
  'group_ciphertext',
  'screenshot_protection',
  'tor_state',
  'group_tor_state',
  'ble_route_capability',
])

function isTruncatedBleCapabilityPreview(content: string): boolean {
  if (content.length > MAX_HIDDEN_PREVIEW_PARSE_LENGTH) return false
  const trimmed = content.trim()
  const normalized = trimmed.startsWith('{\\"')
    ? trimmed.replace(/\\"/g, '"')
    : trimmed
  return /^\{\s*"capability"\s*:\s*"[A-Za-z0-9+/=]{32,256}"?\s*,?\s*$/.test(normalized)
}

function parsePreviewRecord(content: string, depth = 0): Record<string, unknown> | null {
  if (content.length > MAX_HIDDEN_PREVIEW_PARSE_LENGTH) return null
  const trimmed = content.trim()
  if (!trimmed) return null
  if (!trimmed.startsWith('{') && !trimmed.startsWith('"')) return null

  const candidates = [trimmed]
  if (trimmed.startsWith('{\\"')) {
    candidates.push(trimmed.replace(/\\"/g, '"'))
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      if (typeof parsed === 'string' && depth === 0) {
        return parsePreviewRecord(parsed, depth + 1)
      }
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      // Try the next normalized candidate.
    }
  }

  return null
}

export function isHiddenConversationPreview(content?: string): boolean {
  if (content && isTruncatedBleCapabilityPreview(content)) {
    return true
  }
  const parsed = content ? parsePreviewRecord(content) : null
  return parsed?.v === 2
    && typeof parsed.type === 'string'
    && HIDDEN_PREVIEW_TYPES.has(parsed.type)
}

