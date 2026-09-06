/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import * as FileSystem from 'expo-file-system/legacy'
import { resolveStorageUrl } from '@/services/backend/storage'
import { torAwareFetchBytes, type TorByteResponse } from '@/services/tor/torFetch'
import { digestMediaCacheKey } from './cacheKey'
import {
  getTransientRenderPath,
  writeTransientRenderFile,
} from './transientRenderCache'

const DEFAULT_MAX_ASSET_BYTES = 100 * 1024 * 1024
const ASSET_SCOPE = 'tor-assets'
const LOCAL_ASSET_URI = /^(?:asset|content|data|file|ph):/i
const MIME_EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/avif': 'avif',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}
const inFlightAssets = new Map<string, Promise<string>>()

export interface EgressSafeAssetOptions {
  expectedMimeType?: string | null
  expectedSize?: number | null
  maxBytes?: number
}

function normalizeMimeType(value: string | null | undefined): string | null {
  const mimeType = value?.split(';')[0]?.trim().toLowerCase()
  return mimeType || null
}

function mimeTypesMatch(expected: string, actual: string): boolean {
  if (expected === actual) return true
  return (
    (expected === 'image/jpeg' && actual === 'image/jpg')
    || (expected === 'image/heic' && actual === 'image/heif')
    || (expected === 'image/heif' && actual === 'image/heic')
  )
}

function inferExtension(uri: string, mimeType: string | null): string {
  if (mimeType && MIME_EXTENSIONS[mimeType]) {
    return MIME_EXTENSIONS[mimeType]
  }
  const pathname = new URL(uri).pathname
  const match = /\.([a-z0-9]{1,12})$/i.exec(pathname)
  return match?.[1]?.toLowerCase() ?? 'bin'
}

function parseContentLength(response: TorByteResponse): number | null {
  const value = Number(response.headers.get('content-length') || '')
  return Number.isSafeInteger(value) && value >= 0 ? value : null
}

function byteCandidates(response: TorByteResponse): Uint8Array[] {
  return [
    response.bytes,
    response.byteCandidates?.base64,
    response.byteCandidates?.latin1,
    response.byteCandidates?.utf8,
  ].filter((candidate): candidate is Uint8Array => Boolean(candidate))
}

function selectResponseBytes(
  response: TorByteResponse,
  expectedSize: number | null | undefined,
): Uint8Array {
  const candidates = byteCandidates(response)
  const declaredSize = parseContentLength(response)
  const targetSize = declaredSize ?? (
    Number.isSafeInteger(expectedSize) && (expectedSize ?? -1) >= 0
      ? expectedSize!
      : null
  )
  if (targetSize !== null) {
    const exact = candidates.find((candidate) => candidate.byteLength === targetSize)
    if (exact) return exact
  }
  return response.bytes
}

async function assetCacheId(source: string, mimeType: string | null): Promise<string> {
  return digestMediaCacheKey('egress-asset-v1', [source, mimeType ?? ''])
}

async function materializeTorAsset(
  stableSource: string,
  remoteUri: string,
  options: EgressSafeAssetOptions,
): Promise<string> {
  const expectedMimeType = normalizeMimeType(options.expectedMimeType)
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_ASSET_BYTES
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new Error('Invalid remote asset size limit')
  }

  const cacheId = await assetCacheId(stableSource, expectedMimeType)
  const extension = inferExtension(remoteUri, expectedMimeType)
  const path = getTransientRenderPath(cacheId, extension, ASSET_SCOPE)
  const cached = await FileSystem.getInfoAsync(path)
  if (cached.exists && (typeof cached.size !== 'number' || cached.size <= maxBytes)) {
    return path
  }

  const existing = inFlightAssets.get(path)
  if (existing) return existing

  const load = (async () => {
    const response = await torAwareFetchBytes(remoteUri, {
      headers: {
        Accept: expectedMimeType ?? 'application/octet-stream',
      },
    })
    if (!response.ok) {
      throw new Error(`Remote asset download failed with status ${response.status}`)
    }

    const declaredSize = parseContentLength(response)
    if (declaredSize !== null && declaredSize > maxBytes) {
      throw new Error('Remote asset is too large')
    }

    const responseMimeType = normalizeMimeType(response.headers.get('content-type'))
    if (responseMimeType === 'text/html') {
      throw new Error('Remote asset returned an unsafe content type')
    }
    if (
      expectedMimeType
      && responseMimeType
      && responseMimeType !== 'application/octet-stream'
      && !mimeTypesMatch(expectedMimeType, responseMimeType)
    ) {
      throw new Error('Remote asset content type does not match the attachment')
    }

    const bytes = selectResponseBytes(response, options.expectedSize)
    if (bytes.byteLength > maxBytes) {
      throw new Error('Remote asset is too large')
    }

    await writeTransientRenderFile(path, [bytes])
    return path
  })().finally(() => {
    inFlightAssets.delete(path)
  })

  inFlightAssets.set(path, load)
  return load
}

export async function resolveEgressSafeAssetUri(
  source: string | null | undefined,
  options: EgressSafeAssetOptions = {},
): Promise<string | null> {
  const resolvedUri = await resolveStorageUrl(source)
  if (!resolvedUri) {
    return resolvedUri
  }
  if (LOCAL_ASSET_URI.test(resolvedUri)) {
    return resolvedUri
  }
  if (!/^https:\/\//i.test(resolvedUri)) {
    throw new Error('Remote assets require HTTPS')
  }

  return materializeTorAsset(source ?? resolvedUri, resolvedUri, options)
}
