/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { torSafeUpload, type TorUploadDiagnostics } from '@/services/tor/torUpload'
import { Platform } from 'react-native'
import { SPECTRA_API_URL } from '@/lib/constants'

import { backendRequest, isSpectraBackendConfigured, type SpectraBackendOptions } from './client'
import { isBackendRouteUrl } from './url'

export const SPECTRA_OBJECT_REF_PREFIX = 'spectra://objects/'
const BACKEND_OBJECT_CONTENT_TYPE = 'application/octet-stream'
const ANDROID_DIAGNOSTIC_HEADER_PLATFORM = 'X-Spectra-Client-Platform'
const ANDROID_DIAGNOSTIC_HEADER_CORRELATION = 'X-Spectra-Upload-Correlation'

interface SignedObjectResponse {
  objectRef: string
  url: string
  method: 'GET' | 'PUT'
  expiresAt: string
}

export function isSpectraObjectRef(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.startsWith(SPECTRA_OBJECT_REF_PREFIX)
}

export async function signObjectDownloadWithBackend(
  objectRef: string,
  options: SpectraBackendOptions,
  purpose?: 'chat_media' | 'support_attachment',
): Promise<SignedObjectResponse> {
  const signed = await backendRequest<SignedObjectResponse>('/v1/objects/downloads', {
    method: 'POST',
    body: { objectRef, ...(purpose ? { purpose } : {}) },
  }, options)
  const baseUrl = options.baseUrl || SPECTRA_API_URL
  if (!isBackendRouteUrl(signed.url, baseUrl, '/v1/objects/download/')) {
    throw new Error('Backend returned an untrusted object download URL')
  }
  return signed
}

export async function deleteObjectWithBackend(
  objectRef: string,
  options: SpectraBackendOptions,
): Promise<{ error: Error | null }> {
  if (!isSpectraBackendConfigured(options.baseUrl)) {
    return { error: new Error('Spectra backend is not configured') }
  }
  try {
    await backendRequest('/v1/objects/delete', {
      method: 'POST',
      body: { objectRef },
    }, options)
    return { error: null }
  } catch (error) {
    return { error: error as Error }
  }
}

export async function finalizeObjectUploadWithBackend(
  objectRef: string,
  options: SpectraBackendOptions,
): Promise<void> {
  await backendRequest('/v1/objects/finalize', {
    method: 'POST',
    body: { objectRef },
  }, options)
}

export async function uploadObjectWithBackend(
  request: {
    fileUri: string
    fileName: string
    contentType: string
    purpose?: 'attachment' | 'support_attachment'
    bindingId?: string
    ticketId?: string
    size?: number
    diagnostics?: TorUploadDiagnostics
  },
  options: SpectraBackendOptions,
): Promise<{ objectRef: string; error: Error | null }> {
  if (!isSpectraBackendConfigured(options.baseUrl)) {
    return { objectRef: '', error: new Error('Spectra backend is not configured') }
  }
  let uploadedObjectRef = ''
  try {
    const size = request.size ?? await readLocalFileSize(request.fileUri)
    const bindingId = request.bindingId ?? (
      (request.purpose ?? 'attachment') === 'attachment'
        ? request.fileName.replace(/[.]enc$/i, '')
        : undefined
    )
    const signed = await backendRequest<SignedObjectResponse>('/v1/objects/uploads', {
      method: 'POST',
      headers: androidUploadDiagnosticHeaders(request.diagnostics),
      body: {
        size,
        contentType: BACKEND_OBJECT_CONTENT_TYPE,
        purpose: request.purpose ?? 'attachment',
        ...(bindingId ? { bindingId } : {}),
        ...(request.ticketId ? { ticketId: request.ticketId } : {}),
      },
    }, options)
    logAndroidObjectUploadDiagnostic('signed_upload_ready', request.diagnostics, {
      purpose: request.purpose ?? 'attachment',
      size,
    })
    uploadedObjectRef = signed.objectRef
    const response = await torSafeUpload(
      signed.url,
      request.fileUri,
      request.fileName,
      BACKEND_OBJECT_CONTENT_TYPE,
      androidUploadDiagnosticHeaders(request.diagnostics),
      request.diagnostics,
      { httpMethod: 'PUT', contentLength: size },
    )
    if (!response.ok) {
      throw new Error(`Object upload failed: ${response.status}`)
    }
    await finalizeObjectUploadWithBackend(uploadedObjectRef, options)
    return { objectRef: signed.objectRef, error: null }
  } catch (error) {
    if (uploadedObjectRef) {
      await deleteObjectWithBackend(uploadedObjectRef, options).catch(() => undefined)
    }
    logAndroidObjectUploadDiagnostic('upload_failed', request.diagnostics, {
      purpose: request.purpose ?? 'attachment',
      error: error instanceof Error ? error.message : String(error),
    })
    return { objectRef: '', error: error as Error }
  }
}

function androidUploadDiagnosticHeaders(diagnostics?: TorUploadDiagnostics): Record<string, string> {
  if (Platform.OS !== 'android') {
    return {}
  }
  const headers: Record<string, string> = {
    [ANDROID_DIAGNOSTIC_HEADER_PLATFORM]: 'android',
  }
  const correlationId = sanitizeDiagnosticHeader(diagnostics?.correlationId)
  if (correlationId) {
    headers[ANDROID_DIAGNOSTIC_HEADER_CORRELATION] = correlationId
  }
  return headers
}

function sanitizeDiagnosticHeader(value?: string | null): string | null {
  if (!value) {
    return null
  }
  const sanitized = value.replace(/[^\w:.-]/g, '_').slice(0, 96)
  return sanitized.length > 0 ? sanitized : null
}

function logAndroidObjectUploadDiagnostic(
  event: string,
  diagnostics: TorUploadDiagnostics | undefined,
  details: Record<string, unknown>,
): void {
  if (Platform.OS !== 'android') {
    return
  }
  console.log('[AndroidObjectUpload]', event, {
    caller: diagnostics?.caller ?? null,
    correlationId: sanitizeDiagnosticHeader(diagnostics?.correlationId),
    ...details,
  })
}

async function readLocalFileSize(fileUri: string): Promise<number> {
  const fileSystem = await import('expo-file-system/legacy')
  const info = await fileSystem.getInfoAsync(fileUri)
  if (!info.exists || typeof info.size !== 'number' || info.size <= 0) {
    throw new Error('Object upload file size is unavailable')
  }
  return info.size
}
