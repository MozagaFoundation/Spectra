/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { generateUUID } from '../crypto/utils'
import type { TelemetryFieldValue } from '../types/index'

export const ATTACHMENT_PIPELINE_EVENT_NAME = 'attachment_pipeline'
export const ATTACHMENT_PIPELINE_FAILURE_EVENT_NAME = 'attachment_pipeline_failed'

export const ATTACHMENT_PIPELINE_STAGES = [
  'picker_selected',
  'send_started',
  'upload_encrypt_started',
  'upload_encrypt_succeeded',
  'upload_temp_file_succeeded',
  'upload_transport_started',
  'upload_transport_response',
  'chat_media_insert_started',
  'chat_media_insert_succeeded',
  'relay_encrypt_started',
  'relay_encrypt_succeeded',
  'relay_accept_started',
  'relay_accept_failed',
  'local_cache_started',
  'pipeline_failed',
] as const

export type AttachmentPipelineStage = typeof ATTACHMENT_PIPELINE_STAGES[number]

export interface AttachmentSendTrace {
  attachmentSendId: string
  sendStartedAt: number
}

export interface AttachmentPipelineTraceContext {
  attachmentSendId?: string | null
  sendStartedAt?: number | null
  attachmentIndex?: number | null
  attachmentCount?: number | null
  attempt?: number | null
  fileSize?: number | null
  mimeType?: string | null
  bucket?: string | null
  objectPathSummary?: string | null
  conversationId?: string | null
  optimisticMessageId?: string | null
  messageId?: string | null
}

export interface AttachmentPipelineFailureDetails {
  failureStage: string
  lastSuccessfulStage?: string | null
  statusCode?: number | null
  failureReason?: string | null
  transient?: boolean | null
}

export type AttachmentDiagnosticRecorder = (
  eventName: string,
  fields: Record<string, TelemetryFieldValue>,
) => void

type AttachmentPipelineError = Error & {
  attachmentPipelineFailure?: AttachmentPipelineFailureDetails
}

function summarizeObjectPath(value?: string | null): string | null {
  if (typeof value !== 'string' || value.length === 0) {
    return null
  }

  if (value.length <= 96) {
    return value
  }

  return `${value.slice(0, 40)}...${value.slice(-32)}`
}

function withDefinedFields(
  fields: Record<string, TelemetryFieldValue>,
): Record<string, TelemetryFieldValue> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  )
}

export function createAttachmentSendTrace(
  sendStartedAt: number = Date.now(),
): AttachmentSendTrace {
  return {
    attachmentSendId: `attach:${generateUUID()}`,
    sendStartedAt,
  }
}

export function getElapsedSinceSendStartMs(
  sendStartedAt?: number | null,
): number | undefined {
  if (typeof sendStartedAt !== 'number' || !Number.isFinite(sendStartedAt)) {
    return undefined
  }

  return Math.max(0, Date.now() - sendStartedAt)
}

export function summarizeAttachmentObjectPath(
  value?: string | null,
): string | null {
  return summarizeObjectPath(value)
}

export function buildAttachmentPipelineFields(
  stage: AttachmentPipelineStage,
  context: AttachmentPipelineTraceContext = {},
  extraFields: Record<string, TelemetryFieldValue> = {},
): Record<string, TelemetryFieldValue> {
  return withDefinedFields({
    stage,
    attachmentSendId: context.attachmentSendId ?? undefined,
    attachmentIndex: context.attachmentIndex ?? undefined,
    attachmentCount: context.attachmentCount ?? undefined,
    attempt: context.attempt ?? undefined,
    elapsedSinceSendStartMs: getElapsedSinceSendStartMs(context.sendStartedAt),
    fileSize: context.fileSize ?? undefined,
    mimeType: context.mimeType ?? undefined,
    bucket: context.bucket ?? undefined,
    objectPathSummary: summarizeObjectPath(context.objectPathSummary ?? null) ?? undefined,
    conversationId: context.conversationId ?? undefined,
    optimisticMessageId: context.optimisticMessageId ?? undefined,
    messageId: context.messageId ?? undefined,
    ...extraFields,
  })
}

export function buildAttachmentPipelineFailureFields(
  context: AttachmentPipelineTraceContext = {},
  failureDetails: AttachmentPipelineFailureDetails & {
    error?: string | null
    [key: string]: TelemetryFieldValue
  },
): Record<string, TelemetryFieldValue> {
  const {
    failureStage,
    lastSuccessfulStage,
    statusCode,
    failureReason,
    transient,
    ...extraFailureFields
  } = failureDetails

  return buildAttachmentPipelineFields('pipeline_failed', context, {
    ...extraFailureFields,
    failureStage,
    lastSuccessfulStage: lastSuccessfulStage ?? undefined,
    statusCode: statusCode ?? undefined,
    failureReason: failureReason ?? undefined,
    transient: transient ?? undefined,
  })
}

export function tagAttachmentPipelineError(
  error: unknown,
  failureDetails: AttachmentPipelineFailureDetails,
): Error {
  const taggedError =
    error instanceof Error ? error : new Error(String(error))

  ;(taggedError as AttachmentPipelineError).attachmentPipelineFailure = failureDetails
  return taggedError
}

export function getAttachmentPipelineFailureDetails(
  error: unknown,
): AttachmentPipelineFailureDetails | null {
  if (!(error instanceof Error)) {
    return null
  }

  return (error as AttachmentPipelineError).attachmentPipelineFailure ?? null
}
