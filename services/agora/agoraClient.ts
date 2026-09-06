/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { backendRequest } from '@/services/backend/request'
import { getValidBackendAccessToken } from '@/services/backend/session'

async function agoraRequest<T>(
  path: string,
  request: { method: 'GET' | 'POST'; body?: unknown },
): Promise<T> {
  const accessToken = await getValidBackendAccessToken()
  if (!accessToken) throw new Error('Backend auth token is required')
  return backendRequest<T>(path, request, { accessToken })
}

export function agoraGet<T>(path: string): Promise<T> {
  return agoraRequest<T>(path, { method: 'GET' })
}

export function agoraPost<T>(path: string, body?: unknown): Promise<T> {
  return agoraRequest<T>(path, { method: 'POST', body })
}
