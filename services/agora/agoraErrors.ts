/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { SpectraBackendError } from '@/services/backend/request'

const AGORA_ERROR_KEYS: Record<string, string> = {
  agora_unavailable: 'Agora is unavailable for this account.',
  agora_join_required: 'Join Agora to continue.',
  agora_terms_required: 'Please accept the Agora Terms to continue.',
  terms_version: 'Please accept the current Agora Terms.',
  recommendations_required: 'Please confirm the Agora recommendations.',
  identity_binding_required: 'Your chat identity is not ready yet.',
  invalid_nick: 'Choose a nick with 3–24 letters, numbers, or underscores.',
  nick_taken: 'That nick is taken or reserved.',
  nick_matches_alias: 'Your plaza nick cannot match your discovery alias.',
  nick_change_limited: 'You can change your Agora nick once every 24 hours.',
  nick_not_found: 'That nick is not in this room.',
  room_full: 'That room is full.',
  room_not_found: 'That room is no longer available.',
  read_only: 'This board is read-only.',
  not_in_room: 'You are not in this room.',
  blocked: 'That person is blocked.',
  rate_limited: 'Please wait a moment before sending again.',
  duplicate: 'That line was just sent.',
  invalid_request: 'That request could not be sent.',
  links_not_allowed: 'Links are not allowed in Agora.',
  image_too_large: 'Images must be 6 MB or smaller.',
  voice_too_large: 'Voice notes must be 2 MB or smaller.',
  object_upload_incomplete: 'That image could not be sent.',
  object_storage_failed: 'That image could not be sent.',
}

export function agoraErrorCode(error: unknown): string | null {
  return error instanceof SpectraBackendError ? error.code : null
}

export function agoraErrorMessage(error: unknown): string {
  const code = agoraErrorCode(error)
  if (code && AGORA_ERROR_KEYS[code]) return AGORA_ERROR_KEYS[code]
  if (error instanceof Error && error.message === 'Your private chat identity is not ready yet.') {
    return error.message
  }
  if (
    error instanceof Error
    && (error.message === 'Images must be 6 MB or smaller.'
      || error.message === 'That image could not be sent.'
      || error.message === 'Voice notes must be 2 MB or smaller.'
      || error.message === 'That voice note could not be sent.')
  ) {
    return error.message
  }
  return 'Something went wrong. Please try again.'
}
