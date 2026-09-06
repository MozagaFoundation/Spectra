/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { Platform } from 'react-native'
import Constants from 'expo-constants'
import { isBackendConfigured } from './appClient'
import { getRuntimeAppVersion } from '@/lib/appMetadata'
import { uploadObjectWithBackend } from '@/services/backend/objectStorage'
import { backendRequest } from '@/services/backend/client'

export interface SupportTicket {
  user_address: string
  category: 'bug' | 'feature_request' | 'security_concern' | 'other'
  description: string
  app_version: string
  os: string
  device_model: string
  screenshot_urls?: string[]
}

export interface SupportTicketRow {
  id: string
  userAddress: string
  category: SupportTicket['category']
  description: string
  appVersion: string
  os: string
  deviceModel: string
  status: 'open' | 'in_progress' | 'resolved' | 'closed'
  createdAt: string
  retentionExpiresAt: string
  attachments: string[]
}

export function collectDeviceInfo(): { os: string; device_model: string } {
  const osVersion = Platform.Version
  const os = `${Platform.OS} ${typeof osVersion === 'string' ? osVersion : String(osVersion)}`
  const device_model = Constants.deviceName ?? `${Platform.OS} device`
  return { os, device_model }
}

export async function uploadSupportImage(
  ticketId: string,
  fileUri: string,
  mimeType: string,
): Promise<{ url: string | null; error: Error | null }> {
  if (!isBackendConfigured()) {
    return { url: null, error: new Error('Backend is not configured') }
  }

  try {
    const ext = mimeType.split('/')[1] || 'jpg'
    const randomSuffix = Array.from(crypto.getRandomValues(new Uint8Array(4)))
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('')
    const fileName = `${ticketId.slice(0, 16)}_${Date.now()}_${randomSuffix}.${ext}`
    const uploadCorrelationId = `support:${fileName}`

    if (__DEV__) {
      console.log('[SupportUpload] upload_support_image_transport_start', {
        uploadCorrelationId,
        fileName,
        mimeType,
      })
    }

    const { getValidBackendAccessToken } = await import('./session')
    const accessToken = await getValidBackendAccessToken()
    if (!accessToken) {
      throw new Error('Backend auth token is required')
    }
    const uploadResult = await uploadObjectWithBackend({
      fileUri,
      fileName,
      contentType: mimeType,
      purpose: 'support_attachment',
      ticketId,
      diagnostics: {
        caller: 'backend.uploadSupportImage',
        correlationId: uploadCorrelationId,
      },
    }, { accessToken })
    if (uploadResult.error) {
      throw uploadResult.error
    }

    return { url: uploadResult.objectRef, error: null }
  } catch (error) {
    if (__DEV__) {
      console.error('[SupportUpload] upload_support_image_transport_exception', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
    return { url: null, error: error as Error }
  }
}

export async function submitSupportTicket(
  userAddress: string,
  category: SupportTicket['category'],
  description: string,
  screenshotUrls: string[] = [],
): Promise<{ data: SupportTicketRow | null; error: Error | null }> {
  if (!isBackendConfigured()) {
    return { data: null, error: new Error('Backend is not configured') }
  }

  const { os, device_model } = collectDeviceInfo()

  try {
    const accessToken = await requireAccessToken()
    const data = await backendRequest<SupportTicketRow>('/v1/support/tickets', {
      method: 'POST',
      body: {
        userAddress,
        category,
        description: description.trim(),
        appVersion: getRuntimeAppVersion(),
        os,
        deviceModel: device_model,
      },
    }, { accessToken })
    if (screenshotUrls.length > 0) {
      const attachmentResult = await attachSupportImages(data.id, screenshotUrls, accessToken)
      if (attachmentResult.error) throw attachmentResult.error
      data.attachments = [...screenshotUrls]
    }
    return { data, error: null }
  } catch (error) {
    return { data: null, error: error as Error }
  }
}

export async function attachSupportImages(
  ticketId: string,
  objectRefs: string[],
  token?: string,
): Promise<{ error: Error | null }> {
  try {
    const accessToken = token ?? await requireAccessToken()
    await backendRequest(`/v1/support/tickets/${encodeURIComponent(ticketId)}/attachments`, {
      method: 'POST',
      body: { objectRefs },
    }, { accessToken })
    return { error: null }
  } catch (error) {
    return { error: error as Error }
  }
}

async function requireAccessToken(): Promise<string> {
  const { getValidBackendAccessToken } = await import('./session')
  const accessToken = await getValidBackendAccessToken()
  if (!accessToken) {
    throw new Error('Backend auth token is required')
  }
  return accessToken
}
