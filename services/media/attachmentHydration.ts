/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { MediaAttachment } from '@/lib/types'
import * as FileSystem from 'expo-file-system/legacy'
import { normalizeAccountStorageScope } from '@/lib/accountScope'
import { mapWithConcurrencySettled } from '@/lib/utils'
import { nowRenderMs, recordRenderMetric } from '@/lib/renderMetrics'
import { useWalletStore } from '@/store/walletStore'
import { useTorStore } from '@/services/tor/torStore'
import { mobileLogWarn } from '@/services/logging/mobileLogger'
import {
  assertSafeMediaId,
  getLocalMediaUri,
  getMediaCacheDirectory,
  initializeMediaCache,
  isMediaCached,
  registerCachedMedia,
} from './localMediaCache'
import {
  downloadAndDecryptMedia,
  type MediaDownloadDiagnostics,
  type RemoteMediaDisposition,
} from './mediaService'
import { schedulePendingRemoteMediaCleanup } from './remoteMediaCleanup'
import { isTransientRenderUri } from './transientRenderCache'
import {
  ATTACHMENT_HYDRATION_EVENT_NAME,
  ATTACHMENT_HYDRATION_FAILURE_EVENT_NAME,
  buildAttachmentHydrationFailureFields,
  buildAttachmentHydrationFields,
  createAttachmentHydrationCorrelationId,
  type AttachmentHydrationDiagnostics,
} from './attachmentHydrationDiagnostics'

type EncryptedAttachment = MediaAttachment & {
  encryptionKey?: string
}

const hydrationTasks = new Map<string, Promise<EncryptedAttachment>>()
const hydratedAttachmentCache = new Map<string, EncryptedAttachment>()
const HYDRATED_ATTACHMENT_CACHE_LIMIT = 128
const SAFE_EXTENSION_PATTERN = /^[a-z0-9]{1,12}$/

function isImageMimeType(mimeType?: string | null): boolean {
  return typeof mimeType === 'string' && mimeType.toLowerCase().startsWith('image/')
}

function normalizeExtensionCandidate(value?: string | null): string | null {
  if (!value) {
    return null
  }

  const normalized = value.trim().toLowerCase()
  return SAFE_EXTENSION_PATTERN.test(normalized) ? normalized : null
}

function getExtFromMime(mimeType: string, fileName?: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'audio/mpeg': 'mp3',
    'audio/m4a': 'm4a',
    'audio/mp4': 'm4a',
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'text/plain': 'txt',
    'text/csv': 'csv',
    'application/json': 'json',
  }

  const mappedExtension = normalizeExtensionCandidate(map[mimeType])
  if (mappedExtension) {
    return mappedExtension
  }

  const normalizedFileName = fileName?.trim()
  const dotIndex = normalizedFileName?.lastIndexOf('.') ?? -1
  if (normalizedFileName && dotIndex > -1 && dotIndex < normalizedFileName.length - 1) {
    return normalizeExtensionCandidate(normalizedFileName.slice(dotIndex + 1)) ?? 'bin'
  }

  return 'bin'
}

export function shouldAutoHydrateAttachment(
  attachment: Pick<MediaAttachment, 'type' | 'mimeType' | 'isEncrypted' | 'isViewOnce' | 'uri'>
): boolean {
  if (!attachment.isEncrypted || Boolean(attachment.uri) || attachment.isViewOnce) {
    return false
  }

  if (attachment.type === 'document') {
    return isImageMimeType(attachment.mimeType)
  }

  return attachment.type !== 'audio'
}

export interface HydrateMessageAttachmentsOptions {
  backgroundOnly?: boolean
  diagnostics?: AttachmentHydrationDiagnostics
  runtime?: AttachmentHydrationRuntime
}

export interface AttachmentHydrationRuntime {
  walletScope: string
  generation: number
  isCurrent?: () => boolean
}

function resolveHydrationDiagnostics<T extends EncryptedAttachment>(
  messageId: string,
  conversationId: string,
  attachment: T,
  diagnostics?: AttachmentHydrationDiagnostics,
): MediaDownloadDiagnostics {
  return {
    ...diagnostics,
    correlationId:
      diagnostics?.correlationId ?? createAttachmentHydrationCorrelationId(attachment.id),
    messageId: diagnostics?.messageId ?? messageId,
    conversationId: diagnostics?.conversationId ?? conversationId,
    mediaId: diagnostics?.mediaId ?? attachment.id,
    attachmentType: diagnostics?.attachmentType ?? attachment.type,
    mimeType: diagnostics?.mimeType ?? attachment.mimeType,
    fileName: diagnostics?.fileName ?? attachment.fileName,
  }
}

function recordHydrationStage(
  diagnostics: AttachmentHydrationDiagnostics | undefined,
  stage: string,
  extraFields: Record<string, string | number | boolean | null | undefined> = {},
): void {
  diagnostics?.recordDiagnostic?.(
    ATTACHMENT_HYDRATION_EVENT_NAME,
    buildAttachmentHydrationFields(stage, diagnostics, extraFields),
  )
}

function recordHydrationFailure(
  diagnostics: AttachmentHydrationDiagnostics | undefined,
  failureStage: string,
  error: unknown,
  lastSuccessfulStage?: string | null,
): void {
  diagnostics?.recordDiagnostic?.(
    ATTACHMENT_HYDRATION_FAILURE_EVENT_NAME,
    buildAttachmentHydrationFailureFields(diagnostics, {
      failureStage,
      lastSuccessfulStage,
      error: error instanceof Error ? error.message : String(error),
    }),
  )
}

function captureHydrationRuntime(
  runtime?: AttachmentHydrationRuntime,
): AttachmentHydrationRuntime {
  const walletScope = normalizeAccountStorageScope(
    runtime?.walletScope ?? useWalletStore.getState().wallet?.address,
  )
  if (!walletScope) {
    throw new Error('Attachment hydration wallet scope is required')
  }
  const isCurrent = runtime?.isCurrent
  return {
    walletScope,
    generation: runtime?.generation ?? 0,
    isCurrent: () => (
      (!isCurrent || isCurrent())
      && normalizeAccountStorageScope(useWalletStore.getState().wallet?.address) === walletScope
    ),
  }
}

function assertHydrationRuntimeCurrent(runtime: AttachmentHydrationRuntime): void {
  if (!runtime.isCurrent?.()) {
    throw new Error('Attachment hydration wallet scope changed')
  }
}

function getHydrationCacheKey(
  attachment: Pick<MediaAttachment, 'id'>,
  runtime: AttachmentHydrationRuntime,
): string {
  return `${runtime.walletScope}:${runtime.generation}:${attachment.id}`
}

function cacheHydratedAttachment<T extends EncryptedAttachment>(
  attachment: T,
  runtime: AttachmentHydrationRuntime,
): void {
  if (!attachment.uri) return
  const key = getHydrationCacheKey(attachment, runtime)
  const { encryptionKey: _encryptionKey, ...cacheableAttachment } = attachment
  hydratedAttachmentCache.delete(key)
  hydratedAttachmentCache.set(key, cacheableAttachment as EncryptedAttachment)
  if (hydratedAttachmentCache.size > HYDRATED_ATTACHMENT_CACHE_LIMIT) {
    const oldestKey = hydratedAttachmentCache.keys().next().value
    if (oldestKey) {
      hydratedAttachmentCache.delete(oldestKey)
    }
  }
}

function getCachedHydratedAttachment<T extends EncryptedAttachment>(
  attachment: T,
  runtime: AttachmentHydrationRuntime,
): T | null {
  const key = getHydrationCacheKey(attachment, runtime)
  const cached = hydratedAttachmentCache.get(key)
  if (!cached?.uri) return null
  hydratedAttachmentCache.delete(key)
  hydratedAttachmentCache.set(key, cached)
  return {
    ...attachment,
    uri: cached.uri,
    isEncrypted: false,
  }
}

export function __clearAttachmentHydrationCacheForTests(): void {
  if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'test') return
  hydrationTasks.clear()
  hydratedAttachmentCache.clear()
}

export function clearAttachmentHydrationRuntime(
  walletScope: string,
  generation: number,
): void {
  const normalizedScope = normalizeAccountStorageScope(walletScope)
  if (!normalizedScope) return
  const prefix = `${normalizedScope}:${generation}:`
  for (const key of hydrationTasks.keys()) {
    if (key.startsWith(prefix)) hydrationTasks.delete(key)
  }
  for (const key of hydratedAttachmentCache.keys()) {
    if (key.startsWith(prefix)) hydratedAttachmentCache.delete(key)
  }
}

async function hydrateAttachmentInternal<T extends EncryptedAttachment>(
  messageId: string,
  conversationId: string,
  attachment: T,
  diagnostics?: AttachmentHydrationDiagnostics,
  runtime?: AttachmentHydrationRuntime,
): Promise<T> {
  const capturedRuntime = captureHydrationRuntime(runtime)
  assertHydrationRuntimeCurrent(capturedRuntime)
  const resolvedDiagnostics = resolveHydrationDiagnostics(
    messageId,
    conversationId,
    attachment,
    diagnostics,
  )
  let lastSuccessfulStage: string | null = null

  recordHydrationStage(resolvedDiagnostics, 'hydrate_requested')
  lastSuccessfulStage = 'hydrate_requested'

  if (!attachment.isEncrypted || attachment.uri) {
    recordHydrationStage(resolvedDiagnostics, 'hydrate_skipped', {
      reason: 'already_available',
      hasUri: Boolean(attachment.uri),
      isEncrypted: Boolean(attachment.isEncrypted),
    })
    return attachment
  }

  try {
    recordHydrationStage(resolvedDiagnostics, 'cache_lookup_started')
    assertSafeMediaId(attachment.id)
    await initializeMediaCache(capturedRuntime.walletScope)
    schedulePendingRemoteMediaCleanup(capturedRuntime.walletScope)
    assertHydrationRuntimeCurrent(capturedRuntime)
    const alreadyCached = await isMediaCached(attachment.id, capturedRuntime.walletScope)
    assertHydrationRuntimeCurrent(capturedRuntime)
    if (alreadyCached) {
      const localUri = await getLocalMediaUri(attachment.id, capturedRuntime.walletScope)
      assertHydrationRuntimeCurrent(capturedRuntime)
      if (localUri) {
        recordHydrationStage(resolvedDiagnostics, 'cache_hit', {
          localUri,
        })
        return {
          ...attachment,
          uri: localUri,
          isEncrypted: false,
        }
      }
    }

    if (!attachment.encryptionKey) {
      const error = new Error('Attachment encryption key is missing')
      recordHydrationFailure(
        resolvedDiagnostics,
        'missing_encryption_key',
        error,
        lastSuccessfulStage,
      )
      throw error
    }

    const destinationUri = `${getMediaCacheDirectory(capturedRuntime.walletScope)}${attachment.id}.${getExtFromMime(attachment.mimeType, attachment.fileName)}`
    recordHydrationStage(resolvedDiagnostics, 'download_requested', {
      destinationUri,
    })
    lastSuccessfulStage = 'download_requested'

    const remoteDisposition: { current: RemoteMediaDisposition | null } = { current: null }
    await downloadAndDecryptMedia(
      attachment.encryptionKey,
      attachment.id,
      destinationUri,
      undefined,
      resolvedDiagnostics,
      (disposition) => {
        remoteDisposition.current = disposition
      },
    )
    try {
      assertHydrationRuntimeCurrent(capturedRuntime)
    } catch (error) {
      await FileSystem.deleteAsync(destinationUri, { idempotent: true }).catch(() => undefined)
      throw error
    }

    const cached = await registerCachedMedia(
      attachment.id,
      messageId,
      conversationId,
      destinationUri,
      {
        id: attachment.id,
        type: attachment.type,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        fileSize: attachment.fileSize,
        width: attachment.width,
        height: attachment.height,
        durationMs: attachment.durationMs,
        waveform: attachment.waveform,
      },
      capturedRuntime.walletScope,
      remoteDisposition.current?.shouldConsumeRemote
        ? remoteDisposition.current.remoteObjectRef
        : undefined,
    )
    try {
      assertHydrationRuntimeCurrent(capturedRuntime)
    } catch (error) {
      await FileSystem.deleteAsync(cached.localUri, { idempotent: true }).catch(() => undefined)
      throw error
    }
    lastSuccessfulStage = 'cache_register_succeeded'
    recordHydrationStage(resolvedDiagnostics, 'cache_register_succeeded', {
      localUri: cached.localUri,
      localFileSize: cached.fileSize,
    })
    if (remoteDisposition.current?.shouldConsumeRemote) {
      schedulePendingRemoteMediaCleanup(capturedRuntime.walletScope)
    }

    recordHydrationStage(resolvedDiagnostics, 'hydrate_completed', {
      localUri: cached.localUri,
    })
    return {
      ...attachment,
      uri: cached.localUri,
      isEncrypted: false,
    }
  } catch (error) {
    recordHydrationFailure(
      resolvedDiagnostics,
      'hydrate_attachment_internal',
      error,
      lastSuccessfulStage,
    )
    throw error
  }
}

export async function hydrateMessageAttachment<T extends EncryptedAttachment>(
  messageId: string,
  conversationId: string,
  attachment: T,
  diagnostics?: AttachmentHydrationDiagnostics,
  runtime?: AttachmentHydrationRuntime,
): Promise<T> {
  const capturedRuntime = captureHydrationRuntime(runtime)
  assertHydrationRuntimeCurrent(capturedRuntime)
  const startedAt = nowRenderMs()
  let candidate = attachment
  if (isTransientRenderUri(candidate.uri)) {
    const info = await FileSystem.getInfoAsync(candidate.uri!)
    assertHydrationRuntimeCurrent(capturedRuntime)
    if (!info.exists) {
      candidate = {
        ...candidate,
        uri: undefined,
        isEncrypted: true,
      }
      hydratedAttachmentCache.delete(getHydrationCacheKey(candidate, capturedRuntime))
    }
  }
  if (!candidate.isEncrypted || candidate.uri) {
    recordRenderMetric('media', 'attachment_hydration_skipped', {
      reason: 'already_available',
      isEncrypted: Boolean(attachment.isEncrypted),
      hasUri: Boolean(attachment.uri),
      attachmentType: attachment.type,
    })
    return candidate
  }

  const resolvedDiagnostics = resolveHydrationDiagnostics(
    messageId,
    conversationId,
    candidate,
    diagnostics,
  )
  const cached = getCachedHydratedAttachment(candidate, capturedRuntime)
  if (cached) {
    recordHydrationStage(resolvedDiagnostics, 'memory_cache_hit')
    recordRenderMetric('media', 'attachment_hydration_memory_cache_hit', {
      elapsedMs: Number((nowRenderMs() - startedAt).toFixed(2)),
      attachmentType: attachment.type,
      mimeType: attachment.mimeType,
      fileSize: attachment.fileSize ?? null,
    })
    return cached
  }
  const taskKey = getHydrationCacheKey(candidate, capturedRuntime)
  const inFlight = hydrationTasks.get(taskKey) as Promise<T> | undefined
  if (inFlight) {
    recordHydrationStage(resolvedDiagnostics, 'reuse_inflight_task')
    recordRenderMetric('media', 'attachment_hydration_inflight_reused', {
      attachmentType: attachment.type,
      mimeType: attachment.mimeType,
      fileSize: attachment.fileSize ?? null,
    })
    return inFlight
  }

  const task = hydrateAttachmentInternal(
    messageId,
    conversationId,
    candidate,
    resolvedDiagnostics,
    capturedRuntime,
  )
    .then((hydrated) => {
      assertHydrationRuntimeCurrent(capturedRuntime)
      cacheHydratedAttachment(hydrated, capturedRuntime)
      recordRenderMetric('media', 'attachment_hydration_completed', {
        elapsedMs: Number((nowRenderMs() - startedAt).toFixed(2)),
        attachmentType: attachment.type,
        mimeType: attachment.mimeType,
        fileSize: attachment.fileSize ?? null,
      })
      return hydrated
    })
    .finally(() => {
      if (hydrationTasks.get(taskKey) === task) {
        hydrationTasks.delete(taskKey)
      }
    }) as Promise<T>

  hydrationTasks.set(taskKey, task)
  return task
}

export async function hydrateMessageAttachments<T extends EncryptedAttachment>(
  messageId: string,
  conversationId: string,
  attachments: T[],
  options?: HydrateMessageAttachmentsOptions,
): Promise<T[]> {
  const runtime = captureHydrationRuntime(options?.runtime)
  assertHydrationRuntimeCurrent(runtime)
  const concurrency = useTorStore.getState().enabled ? 2 : 3

  return mapWithConcurrencySettled(
    attachments,
    concurrency,
    async (attachment, _i) => {
      const diagnostics = resolveHydrationDiagnostics(
        messageId,
        conversationId,
        attachment,
        options?.diagnostics,
      )
      if (options?.backgroundOnly && !shouldAutoHydrateAttachment(attachment)) {
        recordHydrationStage(diagnostics, 'background_skip', {
          reason: 'attachment_not_eligible',
        })
        return attachment
      }

      return hydrateMessageAttachment(
        messageId,
        conversationId,
        attachment,
        diagnostics,
        runtime,
      )
    },
    (attachment, _i, error) => {
      if (!options?.backgroundOnly) {
        throw error
      }

      const diagnostics = resolveHydrationDiagnostics(
        messageId,
        conversationId,
        attachment,
        options?.diagnostics,
      )
      mobileLogWarn('MediaHydration', 'background_hydration_failed', { error })
      recordHydrationFailure(
        diagnostics,
        'background_hydration',
        error,
        'hydrate_requested',
      )
      return attachment
    },
  )
}
