/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { SPECTRA_API_URL } from '@/lib/constants'
import { isBackendRouteUrl } from './url'

const STORAGE_REF_PREFIX = 'spectra://objects/'
const SPECTRA_OBJECT_REF_PREFIX = 'spectra://objects/'
const DEFAULT_SIGNED_URL_TTL_SECONDS = 15 * 60
const CACHE_SKEW_MS = 60_000
const LOCAL_MEDIA_PROTOCOLS = new Set(['file:', 'content:', 'data:', 'blob:'])

type CachedSignedUrl = {
  url: string
  expiresAt: number
}

const signedUrlCache = new Map<string, CachedSignedUrl>()
const pendingSignedUrlResolutions = new Map<string, Promise<string | null>>()
let signedUrlCacheGeneration = 0

export function createStorageRef(bucket: string, path: string): string {
  return `${STORAGE_REF_PREFIX}${bucket}/${path.replace(/^\/+/, '')}`
}

export function isStorageRef(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.startsWith(STORAGE_REF_PREFIX)
}

function isSpectraObjectRef(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.startsWith(SPECTRA_OBJECT_REF_PREFIX)
}

export function parseStorageRef(value: string | null | undefined): { bucket: string; path: string } | null {
  if (!isStorageRef(value)) return null
  const raw = value.slice(STORAGE_REF_PREFIX.length)
  const slashIndex = raw.indexOf('/')
  if (slashIndex <= 0 || slashIndex === raw.length - 1) return null
  return {
    bucket: raw.slice(0, slashIndex),
    path: raw.slice(slashIndex + 1),
  }
}

export function getStorageImageCacheKey(value: string | null | undefined): string | null {
  if (!value) return null

  const ref = parseStorageRef(value)
  if (ref) {
    return `spectra-storage:${ref.bucket}:${ref.path}`
  }

  return isTrustedMediaUrl(value) ? value : null
}

export function isTrustedMediaUrl(value: string | null | undefined): value is string {
  if (typeof value !== 'string' || value.length === 0) {
    return false
  }

  try {
    const parsed = new URL(value)
    if (LOCAL_MEDIA_PROTOCOLS.has(parsed.protocol)) {
      return true
    }

    if (
      parsed.protocol === 'https:' &&
      SPECTRA_API_URL &&
      isBackendRouteUrl(value, SPECTRA_API_URL, '/v1/objects/download/')
    ) {
      return true
    }

    return false
  } catch {
    return false
  }
}

export async function resolveStorageUrl(
  value: string | null | undefined,
  expiresInSeconds: number = DEFAULT_SIGNED_URL_TTL_SECONDS
): Promise<string | null> {
  if (!value) return null
  if (isSpectraObjectRef(value)) return resolveSpectraObjectUrl(value, expiresInSeconds)
  return isTrustedMediaUrl(value) ? value : null
}

async function resolveSpectraObjectUrl(
  objectRef: string,
  expiresInSeconds: number,
): Promise<string | null> {
  const cached = signedUrlCache.get(objectRef)
  if (cached && cached.expiresAt - CACHE_SKEW_MS > Date.now()) {
    return cached.url
  }

  const pendingKey = `${objectRef}:${expiresInSeconds}`
  const pending = pendingSignedUrlResolutions.get(pendingKey)
  if (pending) {
    return pending
  }

  const generation = signedUrlCacheGeneration
  const request = (async () => {
    const { signObjectDownloadWithBackend } = await import('@/services/backend/objectStorage')
    const { getValidBackendAccessToken } = await import('./session')
    const accessToken = await getValidBackendAccessToken()
    if (!accessToken) return null
    const signed = await signObjectDownloadWithBackend(objectRef, { accessToken })
    if (!isTrustedMediaUrl(signed.url)) {
      throw new Error('Storage resolver returned an untrusted URL')
    }
    if (generation === signedUrlCacheGeneration) {
      signedUrlCache.set(objectRef, {
        url: signed.url,
        expiresAt: Date.parse(signed.expiresAt),
      })
    }
    return signed.url
  })().finally(() => {
    if (pendingSignedUrlResolutions.get(pendingKey) === request) {
      pendingSignedUrlResolutions.delete(pendingKey)
    }
  })

  pendingSignedUrlResolutions.set(pendingKey, request)
  return request
}

export function clearResolvedStorageUrl(value?: string | null): void {
  signedUrlCacheGeneration += 1
  if (value) {
    signedUrlCache.delete(value)
    for (const key of pendingSignedUrlResolutions.keys()) {
      if (key.startsWith(`${value}:`)) {
        pendingSignedUrlResolutions.delete(key)
      }
    }
    return
  }

  signedUrlCache.clear()
  pendingSignedUrlResolutions.clear()
}
