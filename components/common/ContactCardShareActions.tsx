/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useEffect, useRef, useState, type RefObject } from 'react'
import { Share as RNShare, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Check, Copy, Share } from 'lucide-react-native'
import * as Clipboard from 'expo-clipboard'
import * as Haptics from 'expo-haptics'
import * as Sharing from 'expo-sharing'
import ViewShot from 'react-native-view-shot'

import { Button } from '@/components/ui'
import { useThemeColors } from '@/lib/theme'

interface ContactCardShareActionsProps {
  invite: string | null
  viewShotRef: RefObject<ViewShot | null>
  shareMessage?: string | null
}

export function ContactCardShareActions({
  invite,
  viewShotRef,
  shareMessage,
}: ContactCardShareActionsProps) {
  const colors = useThemeColors()
  const { t } = useTranslation()
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [copied, setCopied] = useState(false)
  const payload = shareMessage || invite

  useEffect(() => () => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current)
  }, [])

  const handleShare = async () => {
    if (!payload) return
    try {
      const uri = await viewShotRef.current?.capture?.()
      if (uri) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: t('Share My QR Code', { ns: 'profile' }),
        })
        return
      }
    } catch {
      // Fall back to sharing the invite text.
    }
    try {
      await RNShare.share({
        message: payload,
        title: t('Share My QR Code', { ns: 'profile' }),
      })
    } catch {
      return
    }
  }

  const handleCopy = async () => {
    if (!payload) return
    try {
      await Clipboard.setStringAsync(payload)
    } catch {
      return
    }
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined)
    setCopied(true)
    if (copiedTimer.current) clearTimeout(copiedTimer.current)
    copiedTimer.current = setTimeout(() => {
      copiedTimer.current = null
      setCopied(false)
    }, 2_000)
  }

  return (
    <View className="flex-row gap-3">
      <Button
        variant="secondary"
        size="lg"
        onPress={handleCopy}
        disabled={!payload}
        icon={copied
          ? <Check size={18} color={colors.success} />
          : <Copy size={18} color={colors.text} />}
      >
        {copied ? t('Copied') : t('Copy')}
      </Button>
      <Button
        variant="secondary"
        size="lg"
        onPress={handleShare}
        disabled={!payload}
        icon={<Share size={18} color={colors.text} />}
      >
        {t('Share')}
      </Button>
    </View>
  )
}
