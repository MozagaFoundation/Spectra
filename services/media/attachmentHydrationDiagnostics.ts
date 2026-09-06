/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { AttachmentDiagnosticRecorder } from '@spectra/core-crypto/client/attachmentDiagnostics'
import { sanitizeMobileLogPrimitiveFields } from '@/services/logging/mobileLogger'

export const ATTACHMENT_HYDRATION_EVENT_NAME = 'attachment_hydration'
export const ATTACHMENT_HYDRATION_FAILURE_EVENT_NAME = 'attachment_hydration_failed'

export type AttachmentHydrationField = string | number | boolean | null | undefined

export interface AttachmentHydrationDiagnostics {
  recordDiagnostic?: AttachmentDiagnosticRecorder
  correlationId?: string | null
  source?: string | null
  messageId?: string | null
  conversationId?: string | null
  mediaId?: string | null
  attachmentType?: string | null
  mimeType?: string | null
  fileName?: string | null
}

export interface AttachmentHydrationFailureDetails {
  failureStage: string
  lastSuccessfulStage?: string | null
  error?: string | null
  statusCode?: number | null
}

let hydrationCorrelationCounter = 0

function withDefinedFields(
  fields: Record<string, AttachmentHydrationField>,
): Record<string, AttachmentHydrationField> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  )
}

export function createAttachmentHydrationCorrelationId(mediaId: string): string {
  hydrationCorrelationCounter += 1
  return `hydrate:${mediaId}:${hydrationCorrelationCounter}`
}

export function buildAttachmentHydrationFields(
  stage: string,
  diagnostics: AttachmentHydrationDiagnostics = {},
  extraFields: Record<string, AttachmentHydrationField> = {},
): Record<string, AttachmentHydrationField> {
  return sanitizeMobileLogPrimitiveFields(withDefinedFields({
    stage,
    correlationId: diagnostics.correlationId ?? undefined,
    source: diagnostics.source ?? undefined,
    messageId: diagnostics.messageId ?? undefined,
    conversationId: diagnostics.conversationId ?? undefined,
    mediaId: diagnostics.mediaId ?? undefined,
    attachmentType: diagnostics.attachmentType ?? undefined,
    mimeType: diagnostics.mimeType ?? undefined,
    fileName: diagnostics.fileName ?? undefined,
    ...extraFields,
  }))
}

export function buildAttachmentHydrationFailureFields(
  diagnostics: AttachmentHydrationDiagnostics = {},
  failureDetails: AttachmentHydrationFailureDetails = {
    failureStage: 'unknown',
  },
): Record<string, AttachmentHydrationField> {
  return buildAttachmentHydrationFields('hydration_failed', diagnostics, {
    failureStage: failureDetails.failureStage,
    lastSuccessfulStage: failureDetails.lastSuccessfulStage ?? undefined,
    error: failureDetails.error ?? undefined,
    statusCode: failureDetails.statusCode ?? undefined,
  })
}
