/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { ShieldOff } from 'lucide-react-native'
import { Text, View } from 'react-native'
import type { MediaAttachment } from '@/lib/types'
import { ImageAttachment } from './ImageAttachment'
import { VoiceNoteAttachment } from './VoiceNoteAttachment'
import { DocumentAttachment } from './DocumentAttachment'
import { PdfPreviewAttachment } from './PdfPreviewAttachment'
import { isImageMimeType, isPdfMimeType } from './attachmentUtils'
import { SPECTRE_BLOCKED_MEDIA_SOURCE, SPECTRE_RECEIVED_MEDIA_MESSAGE } from '@/lib/spectrePolicy'
import { translate } from '@/lib/i18n'
import { useThemeColors } from '@/lib/theme'

type PrepareAttachment = () => Promise<MediaAttachment>
type EditImageAttachment = () => void | Promise<void>

function SpectreBlockedAttachment({ isOwn }: { isOwn: boolean }) {
  const colors = useThemeColors()
  const textColor = isOwn ? 'rgba(255,255,255,0.9)' : colors.textSecondary
  const borderColor = isOwn ? 'rgba(255,255,255,0.25)' : colors.border

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor,
        borderRadius: 14,
        padding: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginTop: 6,
      }}
    >
      <ShieldOff size={18} color={textColor} />
      <Text style={{ color: textColor, fontSize: 13, flex: 1, lineHeight: 18 }}>
        {translate(SPECTRE_RECEIVED_MEDIA_MESSAGE, { ns: 'chat' })}
      </Text>
    </View>
  )
}

export function renderAttachment(
  attachment: MediaAttachment,
  isOwn: boolean,
  onPrepareAttachment?: PrepareAttachment,
  onEditImageAttachment?: EditImageAttachment,
) {
  if (attachment.source === SPECTRE_BLOCKED_MEDIA_SOURCE) {
    return <SpectreBlockedAttachment key={attachment.id} isOwn={isOwn} />
  }

  const renderImage = () => (
    <ImageAttachment
      key={attachment.id}
      attachment={attachment}
      isOwn={isOwn}
      onPrepareAttachment={onPrepareAttachment}
      onEditImageAttachment={onEditImageAttachment}
    />
  )

  const renderDocument = () => (
    <DocumentAttachment
      key={attachment.id}
      attachment={attachment}
      isOwn={isOwn}
      onPrepareAttachment={onPrepareAttachment}
    />
  )

  switch (attachment.type) {
    case 'image':
      return renderImage()
    case 'gif':
    case 'sticker':
      return isImageMimeType(attachment.mimeType) ? renderImage() : null
    case 'video':
      return renderDocument()
    case 'voice_note':
      return (
        <VoiceNoteAttachment
          key={attachment.id}
          attachment={attachment}
          isOwn={isOwn}
          onPrepareAttachment={onPrepareAttachment}
        />
      )
    case 'document':
      if (isImageMimeType(attachment.mimeType)) {
        return renderImage()
      }
      if (isPdfMimeType(attachment.mimeType)) {
        return (
          <PdfPreviewAttachment
            key={attachment.id}
            attachment={attachment}
            isOwn={isOwn}
            onPrepareAttachment={onPrepareAttachment}
          />
        )
      }
      return renderDocument()
    case 'audio':
      return renderDocument()
    default:
      return null
  }
}
