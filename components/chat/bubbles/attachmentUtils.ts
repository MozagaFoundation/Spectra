/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { Alert } from 'react-native'
import {
  MediaExportError,
  saveImageToLibrary,
  shareAttachment as shareAttachmentService,
} from '@/services/media'
import { isTrustedMediaUrl } from '@/services/backend/storage'
import { translate } from '@/lib/i18n'

export function isImageMimeType(mimeType?: string | null): boolean {
  return typeof mimeType === 'string' && mimeType.toLowerCase().startsWith('image/')
}

export function isPdfMimeType(mimeType?: string | null): boolean {
  return (mimeType || '').toLowerCase() === 'application/pdf'
}

export function getTrustedMediaUri(uri?: string | null): string | null {
  return uri
    && /^(?:asset|blob|content|data|file|ph):/i.test(uri)
    && isTrustedMediaUrl(uri)
    ? uri
    : null
}

export async function saveImageToGallery(uri: string): Promise<void> {
  try {
    await saveImageToLibrary(uri, {
      defaultExtension: 'jpg',
    })
    Alert.alert(translate('Saved'), translate('Image saved to your photo library.'))
  } catch (error) {
    if (error instanceof MediaExportError && error.code === 'permission_denied') {
      Alert.alert(translate('Permission needed'), translate('Allow photo library access to save images.'))
      return
    }
    console.warn('Failed to save image:', error)
    Alert.alert(translate('Save failed'), translate('Could not save the image. Please try again.'))
  }
}

export async function shareAttachment(uri: string, fileName?: string, mimeType?: string): Promise<void> {
  try {
    await shareAttachmentService(uri, {
      dialogTitle: fileName,
      fileName,
      mimeType,
    })
  } catch (error) {
    if (error instanceof MediaExportError && error.code === 'sharing_unavailable') {
      Alert.alert(translate('Unavailable'), translate('Sharing is not available on this device.'))
      return
    }
    console.warn('Failed to share attachment:', error)
  }
}
