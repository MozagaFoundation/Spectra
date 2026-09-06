/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { backendRequest, type SpectraBackendOptions } from './client'

export async function consumeChatMediaWithBackend(
  mediaId: string,
  objectRef: string,
  options: SpectraBackendOptions,
): Promise<void> {
  await backendRequest('/v1/media/consume', {
    method: 'POST',
    body: { mediaId, objectRef },
  }, options)
}

export async function abandonChatMediaWithBackend(
  mediaId: string,
  objectRef: string,
  options: SpectraBackendOptions,
): Promise<void> {
  await backendRequest('/v1/media/abandon', {
    method: 'POST',
    body: { mediaId, objectRef },
  }, options)
}
