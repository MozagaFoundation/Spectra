/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { MediaAttachment } from '@/lib/types'
import {
  deleteAppOwnedMediaIngress,
  stageAndValidateMediaIngress,
  type ValidatedMediaIngress,
} from './mediaIngress'

export interface OutgoingFileSource {
  id: string
  uri: string
  fileName?: string | null
  mimeType?: string | null
  fileSize?: number
}

export interface NormalizedOutgoingFile {
  uri: string
  fileSize: number
  mimeType: string
  digest: string
}

export interface PreparedOutgoingMediaAttachment {
  version: 1
  attachment: MediaAttachment
  ingress: ValidatedMediaIngress
}

const preparedArtifacts = new WeakSet<object>()

export function hasMediaLibraryAccess(permission: { granted?: boolean; status?: string; accessPrivileges?: string }): boolean {
  return permission.granted === true
    || permission.status === 'granted'
    || permission.accessPrivileges === 'limited'
}

export async function normalizeOutgoingFileUri(source: OutgoingFileSource): Promise<NormalizedOutgoingFile> {
  const validated = await stageAndValidateMediaIngress(source)
  return {
    uri: validated.uri,
    fileSize: validated.fileSize,
    mimeType: validated.mimeType,
    digest: validated.digest,
  }
}

export async function normalizeOutgoingMediaAttachment(attachment: MediaAttachment): Promise<MediaAttachment> {
  const prepared = await prepareOutgoingMediaAttachment(attachment)
  prepared.ingress.bytes.fill(0)
  return prepared.attachment
}

export async function prepareOutgoingMediaAttachment(
  attachment: MediaAttachment,
): Promise<PreparedOutgoingMediaAttachment> {
  const ingress = await stageAndValidateMediaIngress({
    ...attachment,
    mediaType: attachment.type,
  })

  const prepared: PreparedOutgoingMediaAttachment = {
    version: 1,
    attachment: {
      ...attachment,
      uri: ingress.uri,
      fileSize: ingress.fileSize,
      mimeType: ingress.mimeType,
      type: ingress.mediaType,
      width: ingress.width,
      height: ingress.height,
    },
    ingress,
  }
  preparedArtifacts.add(prepared)
  return prepared
}

export function isPreparedOutgoingMediaAttachment(
  value: MediaAttachment | PreparedOutgoingMediaAttachment,
): value is PreparedOutgoingMediaAttachment {
  return preparedArtifacts.has(value)
}

export async function releasePreparedOutgoingMediaAttachment(
  prepared: PreparedOutgoingMediaAttachment,
): Promise<void> {
  prepared.ingress.bytes.fill(0)
  if (prepared.ingress.deleteOnRelease) {
    await deleteAppOwnedMediaIngress(prepared.ingress.uri)
  }
}
