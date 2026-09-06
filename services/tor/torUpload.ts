/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

/**
 * Tor-safe upload helper.
 */

import { useTorStore } from './torStore'
import { torAwareFetch } from './torFetch'
import { LOG_PREFIX } from './torConstants'
import {
  assertClearnetEgressAllowed,
  registerClearnetOperation,
} from './torEgressPolicy'
import {
  ATTACHMENT_PIPELINE_EVENT_NAME,
  buildAttachmentPipelineFields,
  tagAttachmentPipelineError,
  type AttachmentDiagnosticRecorder,
  type AttachmentPipelineTraceContext,
} from '@spectra/core-crypto/client/attachmentDiagnostics'
import { createSanitizedConsole } from '@/services/logging/mobileLogger'

export interface TorUploadDiagnostics extends AttachmentPipelineTraceContext {
  caller?: string
  correlationId?: string | null
  recordDiagnostic?: AttachmentDiagnosticRecorder
}

export interface TorUploadOptions {
  httpMethod?: 'POST' | 'PUT'
  contentLength?: number
}

let uploadRequestCounter = 0
const console = createSanitizedConsole('TorUpload')

const NATIVE_DIRECT_STORAGE_TRANSPORT = 'native-direct-storage'

function nextUploadRequestId(): number {
  return ++uploadRequestCounter
}

function summarizeUploadValue(value?: string | null): string | null {
  if (typeof value !== 'string' || value.length === 0) {
    return null
  }

  if (value.length <= 120) {
    return value
  }

  return `${value.slice(0, 48)}...${value.slice(-40)}`
}

function recordAttachmentTransportStage(
  diagnostics: TorUploadDiagnostics | undefined,
  stage: 'upload_transport_started' | 'upload_transport_response',
  extraFields: Record<string, string | number | boolean | null | undefined> = {},
): void {
  if (!diagnostics?.recordDiagnostic || !diagnostics.attachmentSendId) {
    return
  }

  diagnostics.recordDiagnostic(
    ATTACHMENT_PIPELINE_EVENT_NAME,
    buildAttachmentPipelineFields(
      stage,
      {
        attachmentSendId: diagnostics.attachmentSendId,
        sendStartedAt: diagnostics.sendStartedAt,
        attachmentIndex: diagnostics.attachmentIndex,
        attachmentCount: diagnostics.attachmentCount,
        attempt: diagnostics.attempt ?? 1,
        fileSize: diagnostics.fileSize,
        mimeType: diagnostics.mimeType,
        bucket: diagnostics.bucket,
        objectPathSummary: diagnostics.objectPathSummary,
        conversationId: diagnostics.conversationId,
        optimisticMessageId: diagnostics.optimisticMessageId,
      },
      extraFields,
    ),
  )
}

function tagTransportFailure(
  error: unknown,
  failureStage: string,
): Error {
  return tagAttachmentPipelineError(error, {
    failureStage,
    lastSuccessfulStage: 'upload_temp_file_succeeded',
  })
}

function getUriScheme(value: string): string {
  const match = value.match(/^([a-z0-9+.-]+):/i)
  return match?.[1]?.toLowerCase() ?? 'unknown'
}

function decodeFilePath(filePath: string): string {
  try {
    return decodeURIComponent(filePath)
  } catch {
    return filePath
  }
}

function localFilePathFromUri(fileUri: string): string {
  const filePath = fileUri.startsWith('file://') ? fileUri.slice(7) : fileUri
  return decodeFilePath(filePath)
}

function describeUploadUrl(storageUrl: string): Record<string, unknown> {
  try {
    const parsed = new URL(storageUrl)
    return {
      host: parsed.host,
      path: summarizeUploadValue(safeUploadPath(parsed.pathname)),
      search: parsed.search ? '[redacted]' : null,
    }
  } catch {
    return {
      host: null,
      path: summarizeUploadValue(storageUrl),
      search: null,
    }
  }
}

function safeUploadPath(pathname: string): string {
  return pathname.replace(/\/v1\/objects\/(upload|download)\/[^/]+$/i, '/v1/objects/$1/:token')
}

function describeUploadHeaders(authHeaders: Record<string, string>): Record<string, unknown> {
  return {
    headerKeys: Object.keys(authHeaders).sort(),
    hasAuthorization: typeof authHeaders.Authorization === 'string' && authHeaders.Authorization.length > 0,
    hasApiKey: typeof authHeaders.apikey === 'string' && authHeaders.apikey.length > 0,
  }
}

function describeUploadError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const errorWithExtras = error as Error & { code?: unknown; cause?: unknown }
    return {
      name: error.name,
      message: error.message,
      code: errorWithExtras.code ?? null,
      cause: errorWithExtras.cause ? summarizeUploadValue(String(errorWithExtras.cause)) : null,
      stack: error.stack ? summarizeUploadValue(error.stack) : null,
    }
  }

  if (typeof error === 'object' && error !== null) {
    const errorRecord = error as Record<string, unknown>
    let serializedDetails: string | null = null
    try {
      serializedDetails = JSON.stringify(errorRecord)
    } catch {
      serializedDetails = String(error)
    }

    return {
      name: typeof errorRecord.name === 'string' ? errorRecord.name : null,
      message: summarizeUploadValue(
        typeof errorRecord.message === 'string' ? errorRecord.message : String(error)
      ),
      code: errorRecord.code ?? null,
      details: summarizeUploadValue(serializedDetails),
    }
  }

  return {
    message: summarizeUploadValue(String(error)),
  }
}

function describeTorUploadBody(binaryString: string, base64Content: string): Record<string, unknown> {
  return {
    bytesLength: binaryString.length,
    binaryStringLength: binaryString.length,
    base64Length: base64Content.length,
  }
}

function normalizeNativeUploadFileUri(fileUri: string, filePath: string): string {
  if (fileUri.startsWith('file://')) {
    return fileUri
  }

  return filePath.startsWith('/') ? `file://${filePath}` : `file:///${filePath}`
}

function describeNativeUploadPath(fileUri: string, filePath: string): Record<string, unknown> {
  const normalizedUploadFileUri = normalizeNativeUploadFileUri(fileUri, filePath)
  let decodedPath = filePath
  let decodeFailed = false

  try {
    decodedPath = decodeURIComponent(filePath)
  } catch {
    decodeFailed = true
  }

  return {
    nativeFilePath: summarizeUploadValue(filePath),
    nativeFilePathDecoded: summarizeUploadValue(decodedPath),
    nativeFilePathDecodeChanged: decodedPath !== filePath,
    nativeFilePathDecodeFailed: decodeFailed,
    nativeFilePathHasPercentEncoding: /%[0-9a-f]{2}/i.test(filePath),
    nativeFilePathHasSpaces: filePath.includes(' '),
    nativeFilePathStartsWithSlash: filePath.startsWith('/'),
    nativeFileUriHasFileScheme: fileUri.startsWith('file://'),
    nativeUploadFileUri: summarizeUploadValue(normalizedUploadFileUri),
    nativeUploadFileUriWasNormalized: normalizedUploadFileUri !== fileUri,
  }
}

function describeDirectUploadRequest(
  requestHeaders: Record<string, string>,
  fileUri: string,
  fileSize: number,
  httpMethod: 'POST' | 'PUT',
): Record<string, unknown> {
  return {
    nativeUploadApi: 'expo-file-system-upload-task',
    nativeUploadMethod: httpMethod,
    nativeUploadBodyType: 'binary-content',
    nativeUploadBodyByteLength: fileSize,
    nativeUploadHeaderKeys: Object.keys(requestHeaders).sort(),
    nativeUploadContentType:
      requestHeaders['Content-Type'] ?? requestHeaders['content-type'] ?? null,
    nativeUploadContentLength:
      requestHeaders['Content-Length'] ?? requestHeaders['content-length'] ?? null,
    nativeUploadFileUri: summarizeUploadValue(fileUri),
    nativeUploadSessionType: 'foreground',
  }
}

function createResponseFromUploadResult(result: {
  body: string
  headers: Record<string, string>
  mimeType: string | null
  status: number
}): Response {
  const headers = new Headers(result.headers ?? {})
  if (result.mimeType && !headers.has('content-type')) {
    headers.set('content-type', result.mimeType)
  }

  return new Response(result.body, {
    headers,
    status: result.status,
  })
}

async function describeFetchResponse(response: Response): Promise<Record<string, unknown>> {
  const headerKeys = Array.from(response.headers.keys()).sort()
  let responseBodyPreview: string | null = null
  let responseBodyLength: number | null = null
  let responseBodyReadError: Record<string, unknown> | null = null

  try {
    const responseText = await response.clone().text()
    responseBodyPreview = summarizeUploadValue(responseText)
    responseBodyLength = responseText.length
  } catch (error) {
    responseBodyReadError = describeUploadError(error)
  }

  return {
    status: response.status,
    statusText: response.statusText || null,
    responseHeaderKeys: headerKeys,
    responseContentType: response.headers.get('content-type'),
    responseContentLength: response.headers.get('content-length'),
    responseBodyLength,
    responseBodyPreview,
    responseBodyReadError,
  }
}

async function inspectUploadFile(fileUri: string): Promise<Record<string, unknown>> {
  const filePath = localFilePathFromUri(fileUri)
  const normalizedUploadFileUri = normalizeNativeUploadFileUri(fileUri, filePath)

  try {
    const { File } = await import('expo-file-system')
    const file = new File(normalizedUploadFileUri)
    return {
      fileUri: summarizeUploadValue(fileUri),
      filePath: summarizeUploadValue(filePath),
      normalizedUploadFileUri: summarizeUploadValue(normalizedUploadFileUri),
      fileUriScheme: getUriScheme(fileUri),
      fileExists: file.exists,
      fileSize: file.size,
    }
  } catch (error) {
    return {
      fileUri: summarizeUploadValue(fileUri),
      filePath: summarizeUploadValue(filePath),
      normalizedUploadFileUri: summarizeUploadValue(normalizedUploadFileUri),
      fileUriScheme: getUriScheme(fileUri),
      fileInspectError: describeUploadError(error),
    }
  }
}

/**
 * Upload a file to Backend Storage through Tor.
 */
export async function torSafeUpload(
  storageUrl: string,
  fileUri: string,
  fileName: string,
  fileType: string,
  authHeaders: Record<string, string>,
  diagnostics?: TorUploadDiagnostics,
  options: TorUploadOptions = {},
): Promise<Response> {
  const { enabled, status } = useTorStore.getState()
  const uploadRequestId = nextUploadRequestId()
  const httpMethod = options.httpMethod ?? 'POST'
  const uploadContext = {
    uploadRequestId,
    transport: enabled ? 'tor-binary' : NATIVE_DIRECT_STORAGE_TRANSPORT,
    torEnabled: enabled,
    torStatus: status,
    caller: diagnostics?.caller ?? null,
    correlationId: summarizeUploadValue(diagnostics?.correlationId ?? null),
    fileName,
    fileType,
    ...describeUploadUrl(storageUrl),
    ...describeUploadHeaders(authHeaders),
  }

  if (!enabled) {
    assertClearnetEgressAllowed()
    const startedAt = Date.now()
    const localFile = await inspectUploadFile(fileUri)
    let failureStage = 'native_init'
    let lastSuccessfulStage: string | null = 'file_inspect'
    let nativePathDetails: Record<string, unknown> = {}
    let nativeRequestDetails: Record<string, unknown> = {}
    let nativeResponseDetails: Record<string, unknown> = {}
    const selectedTransport = NATIVE_DIRECT_STORAGE_TRANSPORT

    console.log(`${LOG_PREFIX} [upload#${uploadRequestId}] native upload init`, {
      ...uploadContext,
      ...localFile,
      transport: selectedTransport,
      nativeClient: 'expo-file-system-upload-task',
      nativeUploadApi: 'expo-file-system-upload-task',
    })

    try {
      const { File } = await import('expo-file-system')
      const legacyFileSystem = await import('expo-file-system/legacy')
      const filePath = localFilePathFromUri(fileUri)
      const normalizedUploadFileUri = normalizeNativeUploadFileUri(fileUri, filePath)
      const file = new File(normalizedUploadFileUri)
      const fileSize = file.size
      nativePathDetails = describeNativeUploadPath(fileUri, filePath)

      if (!file.exists) {
        console.error(`${LOG_PREFIX} [upload#${uploadRequestId}] native upload missing_file`, {
          ...uploadContext,
          transport: selectedTransport,
          ...nativePathDetails,
        })
        return new Response('File not found', { status: 404 })
      }

      console.log(`${LOG_PREFIX} [upload#${uploadRequestId}] native upload path_ready`, {
        ...uploadContext,
        ...localFile,
        ...nativePathDetails,
        nativeUploadFileSizeBytes: fileSize,
        transport: selectedTransport,
        elapsedMs: Date.now() - startedAt,
      })

      const requestHeaders = {
        ...authHeaders,
        'Content-Type': fileType,
        'Content-Length': String(options.contentLength ?? fileSize),
      }

      failureStage = 'native_direct_request_build'
      nativeRequestDetails = describeDirectUploadRequest(
        requestHeaders,
        normalizedUploadFileUri,
        fileSize,
        httpMethod,
      )
      console.log(`${LOG_PREFIX} [upload#${uploadRequestId}] native upload direct_request_ready`, {
        ...uploadContext,
        ...localFile,
        ...nativePathDetails,
        nativeUploadFileSizeBytes: fileSize,
        ...nativeRequestDetails,
        transport: selectedTransport,
        elapsedMs: Date.now() - startedAt,
      })
      lastSuccessfulStage = 'native_direct_request_ready'

      failureStage = 'native_direct_upload_dispatch'
      console.log(`${LOG_PREFIX} [upload#${uploadRequestId}] native upload direct_dispatch`, {
        ...uploadContext,
        ...localFile,
        ...nativePathDetails,
        nativeUploadFileSizeBytes: fileSize,
        ...nativeRequestDetails,
        transport: selectedTransport,
        elapsedMs: Date.now() - startedAt,
      })
      recordAttachmentTransportStage(diagnostics, 'upload_transport_started', {
        transport: selectedTransport,
        nativeUploadApi: 'expo-file-system-upload-task',
      })

      const uploadTask = legacyFileSystem.createUploadTask(
        storageUrl,
        normalizedUploadFileUri,
        {
          headers: requestHeaders,
          httpMethod,
          sessionType: legacyFileSystem.FileSystemSessionType.FOREGROUND,
          uploadType: legacyFileSystem.FileSystemUploadType.BINARY_CONTENT,
        },
      )
      const unregisterUpload = registerClearnetOperation(() => uploadTask.cancelAsync())
      const uploadResult = await (async () => {
        try {
          return await uploadTask.uploadAsync()
        } finally {
          unregisterUpload()
        }
      })()
      if (!uploadResult) {
        throw new Error('Native direct upload task returned no result')
      }

      const response = createResponseFromUploadResult(uploadResult)
      nativeResponseDetails = await describeFetchResponse(response)
      lastSuccessfulStage = 'native_direct_upload_response'
      console.log(`${LOG_PREFIX} [upload#${uploadRequestId}] native upload response`, {
        ...uploadContext,
        ...localFile,
        ...nativePathDetails,
        nativeUploadFileSizeBytes: fileSize,
        ...nativeRequestDetails,
        ...nativeResponseDetails,
        transport: selectedTransport,
        ok: response.ok,
        elapsedMs: Date.now() - startedAt,
      })
      recordAttachmentTransportStage(diagnostics, 'upload_transport_response', {
        transport: selectedTransport,
        nativeUploadApi: 'expo-file-system-upload-task',
        statusCode: response.status,
        ok: response.ok,
      })

      return response
    } catch (error) {
      console.error(`${LOG_PREFIX} [upload#${uploadRequestId}] native upload exception`, {
        ...uploadContext,
        ...localFile,
        ...nativePathDetails,
        ...nativeRequestDetails,
        transport: selectedTransport,
        failureStage,
        lastSuccessfulStage,
        ...nativeResponseDetails,
        elapsedMs: Date.now() - startedAt,
        error: describeUploadError(error),
      })
      throw tagTransportFailure(
        error,
        failureStage === 'native_direct_upload_dispatch'
          ? 'upload_transport_response'
          : 'upload_transport_started',
      )
    }
  }

  if (status !== 'connected' && status !== 'connecting') {
    throw tagTransportFailure(
      new Error(`Tor is enabled but not usable (status: ${status})`),
      'upload_transport_started',
    )
  }

  const startedAt = Date.now()
  let failureStage = 'tor_init'
  let lastSuccessfulStage: string | null = 'file_inspect'
  let torBinaryDetails: Record<string, unknown> = {}
  console.log(`${LOG_PREFIX} [upload#${uploadRequestId}] tor upload init`, {
    ...uploadContext,
    ...(await inspectUploadFile(fileUri)),
  })

  try {
    const { File } = await import('expo-file-system')
    const filePath = localFilePathFromUri(fileUri)
    const file = new File(normalizeNativeUploadFileUri(fileUri, filePath))
    const exists = file.exists

    if (!exists) {
      console.error(`${LOG_PREFIX} [upload#${uploadRequestId}] tor upload missing_file`, {
        ...uploadContext,
        filePath: summarizeUploadValue(filePath),
      })
      return new Response('File not found', { status: 404 })
    }

    failureStage = 'tor_file_base64'
    console.log(`${LOG_PREFIX} [upload#${uploadRequestId}] tor upload file_base64_start`, {
      ...uploadContext,
      filePath: summarizeUploadValue(filePath),
      elapsedMs: Date.now() - startedAt,
    })
    const base64Content = await file.base64()
    lastSuccessfulStage = 'tor_file_base64_ready'
    console.log(`${LOG_PREFIX} [upload#${uploadRequestId}] tor upload file_base64_ready`, {
      ...uploadContext,
      filePath: summarizeUploadValue(filePath),
      base64Length: base64Content.length,
      elapsedMs: Date.now() - startedAt,
    })

    failureStage = 'tor_binary_decode'
    const binaryString = atob(base64Content)
    torBinaryDetails = describeTorUploadBody(binaryString, base64Content)
    lastSuccessfulStage = 'tor_binary_decode_ready'
    console.log(`${LOG_PREFIX} [upload#${uploadRequestId}] tor upload binary_bytes_ready`, {
      ...uploadContext,
      filePath: summarizeUploadValue(filePath),
      ...torBinaryDetails,
      elapsedMs: Date.now() - startedAt,
    })

    console.log(`${LOG_PREFIX} [upload#${uploadRequestId}] tor upload request_ready`, {
      ...uploadContext,
      filePath: summarizeUploadValue(filePath),
      ...torBinaryDetails,
      elapsedMs: Date.now() - startedAt,
    })

    failureStage = 'tor_fetch_dispatch'
    console.log(`${LOG_PREFIX} [upload#${uploadRequestId}] tor upload fetch_dispatch`, {
      ...uploadContext,
      filePath: summarizeUploadValue(filePath),
      ...torBinaryDetails,
      elapsedMs: Date.now() - startedAt,
    })
    recordAttachmentTransportStage(diagnostics, 'upload_transport_started', {
      transport: 'tor-binary',
      nativeUploadApi: 'torAwareFetch',
    })

    const response = await torAwareFetch(storageUrl, {
      method: httpMethod,
      headers: {
        ...authHeaders,
        'Content-Type': fileType,
        'Content-Length': String(binaryString.length),
      },
      body: binaryString,
    })

    lastSuccessfulStage = 'tor_fetch_response'
    console.log(`${LOG_PREFIX} [upload#${uploadRequestId}] tor upload response`, {
      ...uploadContext,
      ...torBinaryDetails,
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      elapsedMs: Date.now() - startedAt,
    })
    recordAttachmentTransportStage(diagnostics, 'upload_transport_response', {
      transport: 'tor-binary',
      nativeUploadApi: 'torAwareFetch',
      statusCode: response.status,
      ok: response.ok,
    })

    return response
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error(`${LOG_PREFIX} [upload#${uploadRequestId}] tor upload exception`, {
      ...uploadContext,
      ...torBinaryDetails,
      failureStage,
      lastSuccessfulStage,
      elapsedMs: Date.now() - startedAt,
      error: describeUploadError(error),
    })
    throw tagTransportFailure(
      new Error(`Tor upload failed: ${errMsg}`),
      failureStage === 'tor_fetch_dispatch'
        ? 'upload_transport_response'
        : 'upload_transport_started',
    )
  }
}
