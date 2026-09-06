/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { File } from 'expo-file-system'
import * as ImagePicker from 'expo-image-picker'
import type { AgoraPublicMessage } from '@/lib/types/agora'
import {
  AGORA_IMAGE_TYPES,
  AGORA_MAX_IMAGE_BYTES,
  AGORA_MAX_VOICE_BYTES,
  type AgoraImageMime,
  type AgoraVoiceMime,
} from './agoraPolicy'
import { agoraPost } from './agoraClient'

export interface AgoraPendingImage {
  uri: string
  mimeType: AgoraImageMime
  fileSize: number
  width?: number
  height?: number
}

function isAgoraImageMime(value: string | null | undefined): value is AgoraImageMime {
  return Boolean(value && value in AGORA_IMAGE_TYPES)
}

function bytesAsFetchBody(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer
}

export async function readAgoraFileBytes(uri: string): Promise<Uint8Array> {
  const attempt = async (): Promise<Uint8Array> => {
    try {
      const bytes = await new File(uri).bytes()
      if (bytes.byteLength > 0) return bytes
    } catch {
      // Recording files on iOS often fail the File helper until a fetch retry.
    }
    try {
      const response = await fetch(uri)
      if (response.ok) {
        const bytes = new Uint8Array(await response.arrayBuffer())
        if (bytes.byteLength > 0) return bytes
      }
    } catch {
      // Fall through so callers can surface a send error.
    }
    return new Uint8Array()
  }
  const first = await attempt()
  if (first.byteLength > 0) return first
  await new Promise((resolve) => setTimeout(resolve, 120))
  return attempt()
}

export async function pickAgoraImage(): Promise<AgoraPendingImage | 'too_large' | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (
    permission.granted !== true
    && permission.status !== 'granted'
    && permission.accessPrivileges !== 'limited'
  ) {
    return null
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.8,
    allowsMultipleSelection: false,
  })
  if (result.canceled || !result.assets[0]) return null
  const asset = result.assets[0]
  const mimeType = isAgoraImageMime(asset.mimeType) ? asset.mimeType : 'image/jpeg'
  const bytes = await new File(asset.uri).bytes()
  if (bytes.byteLength <= 0) return null
  if (bytes.byteLength > AGORA_MAX_IMAGE_BYTES || (asset.fileSize ?? 0) > AGORA_MAX_IMAGE_BYTES) {
    return 'too_large'
  }
  return {
    uri: asset.uri,
    mimeType,
    fileSize: bytes.byteLength,
    width: asset.width,
    height: asset.height,
  }
}

export async function sendAgoraImage(
  roomId: string,
  image: AgoraPendingImage,
  caption: string,
): Promise<{ message: AgoraPublicMessage }> {
  const bytes = await new File(image.uri).bytes()
  if (bytes.byteLength > AGORA_MAX_IMAGE_BYTES) {
    throw new Error('Images must be 6 MB or smaller.')
  }
  const signed = await agoraPost<{
    messageId: string
    objectPath: string
    url: string
    method: 'PUT'
  }>('/v1/agora/media/sign', {
    roomId,
    contentType: image.mimeType,
    size: bytes.byteLength,
  })
  const uploaded = await fetch(signed.url, {
    method: signed.method,
    headers: { 'Content-Type': image.mimeType },
    body: bytesAsFetchBody(bytes),
  })
  if (!uploaded.ok) {
    throw new Error('That image could not be sent.')
  }
  return agoraPost<{ message: AgoraPublicMessage }>('/v1/agora/media/commit', {
    roomId,
    messageId: signed.messageId,
    objectPath: signed.objectPath,
    size: bytes.byteLength,
    ...(caption.trim() ? { body: caption.trim() } : {}),
  })
}

export interface AgoraPendingVoice {
  uri: string
  mimeType: AgoraVoiceMime
  fileSize: number
  durationMs: number
  waveform?: number[]
}

export async function sendAgoraVoice(
  roomId: string,
  voice: AgoraPendingVoice,
  caption: string,
): Promise<{ message: AgoraPublicMessage }> {
  const bytes = await readAgoraFileBytes(voice.uri)
  if (bytes.byteLength <= 0) {
    throw new Error('That voice note could not be sent.')
  }
  if (bytes.byteLength > AGORA_MAX_VOICE_BYTES) {
    throw new Error('Voice notes must be 2 MB or smaller.')
  }
  const signed = await agoraPost<{
    messageId: string
    objectPath: string
    url: string
    method: 'PUT'
  }>('/v1/agora/media/sign', {
    roomId,
    contentType: voice.mimeType,
    size: bytes.byteLength,
  })
  const uploaded = await fetch(signed.url, {
    method: signed.method,
    headers: { 'Content-Type': voice.mimeType },
    body: bytesAsFetchBody(bytes),
  })
  if (!uploaded.ok) {
    throw new Error('That voice note could not be sent.')
  }
  return agoraPost<{ message: AgoraPublicMessage }>('/v1/agora/media/commit', {
    roomId,
    messageId: signed.messageId,
    objectPath: signed.objectPath,
    size: bytes.byteLength,
    durationMs: voice.durationMs,
    ...(voice.waveform && voice.waveform.length ? { waveform: voice.waveform } : {}),
    ...(caption.trim() ? { body: caption.trim() } : {}),
  })
}
