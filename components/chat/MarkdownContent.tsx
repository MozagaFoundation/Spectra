/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { memo, useMemo } from 'react'
import { Platform, StyleSheet, Text } from 'react-native'
import Markdown, { MarkdownIt } from 'react-native-markdown-display'
import { useTranslation } from 'react-i18next'
import { getDirectionalTextStyle, getLogicalRowDirection, getStartBorderStyle, useIsCurrentLanguageRtl } from '@/lib/i18n/direction'
import { useThemeColors, type ThemeColors } from '@/lib/theme'
import { openExternalUrl } from '@/services/tor/externalLinkPolicy'

interface MarkdownContentProps {
  content: string
  fontSize: number
  accentColor?: string
}

function buildStyles(colors: ThemeColors, fontSize: number, accentColor: string, isRtl: boolean) {
  const directionalText = getDirectionalTextStyle(isRtl)

  return StyleSheet.create({
    body: {
      color: colors.text,
      fontSize,
      lineHeight: fontSize * 1.5,
      ...directionalText,
    },
    paragraph: {
      marginTop: 0,
      marginBottom: 6,
      color: colors.text,
      ...directionalText,
    },
    heading1: {
      fontSize: fontSize + 6,
      fontWeight: '700',
      color: colors.text,
      marginTop: 8,
      marginBottom: 4,
      ...directionalText,
    },
    heading2: {
      fontSize: fontSize + 4,
      fontWeight: '700',
      color: colors.text,
      marginTop: 6,
      marginBottom: 4,
      ...directionalText,
    },
    heading3: {
      fontSize: fontSize + 2,
      fontWeight: '600',
      color: colors.text,
      marginTop: 4,
      marginBottom: 2,
      ...directionalText,
    },
    heading4: {
      fontSize: fontSize + 1,
      fontWeight: '600',
      color: colors.text,
      marginTop: 4,
      marginBottom: 2,
      ...directionalText,
    },
    heading5: {
      fontSize,
      fontWeight: '600',
      color: colors.text,
      ...directionalText,
    },
    heading6: {
      fontSize,
      fontWeight: '600',
      color: colors.textSecondary,
      ...directionalText,
    },
    strong: {
      fontWeight: '700',
      color: colors.text,
    },
    em: {
      fontStyle: 'italic',
    },
    link: {
      color: accentColor,
      textDecorationLine: 'underline',
    },
    blockquote: {
      backgroundColor: colors.backgroundTertiary + '40',
      ...getStartBorderStyle(accentColor, 3, isRtl),
      paddingHorizontal: 10,
      paddingVertical: 4,
      marginVertical: 4,
      borderRadius: 4,
    },
    code_inline: {
      backgroundColor: colors.backgroundTertiary + '80',
      color: accentColor,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      fontSize: fontSize - 1,
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderRadius: 4,
    },
    code_block: {
      backgroundColor: colors.backgroundTertiary + '80',
      color: colors.text,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      fontSize: fontSize - 2,
      padding: 10,
      borderRadius: 8,
      marginVertical: 4,
    },
    fence: {
      backgroundColor: colors.backgroundTertiary + '80',
      color: colors.text,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      fontSize: fontSize - 2,
      padding: 10,
      borderRadius: 8,
      marginVertical: 4,
    },
    bullet_list: {
      marginVertical: 2,
    },
    ordered_list: {
      marginVertical: 2,
    },
    list_item: {
      flexDirection: getLogicalRowDirection(isRtl),
      marginVertical: 1,
    },
    bullet_list_icon: {
      color: accentColor,
      fontSize: fontSize,
      lineHeight: fontSize * 1.5,
      ...(isRtl ? { marginLeft: 6 } : { marginRight: 6 }),
    },
    ordered_list_icon: {
      color: accentColor,
      fontSize: fontSize,
      lineHeight: fontSize * 1.5,
      ...(isRtl ? { marginLeft: 6 } : { marginRight: 6 }),
      fontWeight: '600',
    },
    bullet_list_content: {
      flex: 1,
      ...directionalText,
    },
    ordered_list_content: {
      flex: 1,
      ...directionalText,
    },
    hr: {
      backgroundColor: colors.border,
      height: 1,
      marginVertical: 8,
    },
    table: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 6,
      marginVertical: 4,
    },
    thead: {
      backgroundColor: colors.backgroundTertiary + '60',
    },
    th: {
      padding: 6,
      ...(isRtl ? { borderLeftWidth: 1 } : { borderRightWidth: 1 }),
      borderColor: colors.border,
      fontWeight: '600',
      color: colors.text,
      fontSize: fontSize - 1,
      ...directionalText,
    },
    td: {
      padding: 6,
      ...(isRtl ? { borderLeftWidth: 1 } : { borderRightWidth: 1 }),
      borderColor: colors.border,
      color: colors.text,
      fontSize: fontSize - 1,
      ...directionalText,
    },
    tr: {
      borderBottomWidth: 1,
      borderColor: colors.border,
    },
    s: {
      textDecorationLine: 'line-through',
      color: colors.textTertiary,
    },
    image: {
      borderRadius: 8,
    },
    textgroup: directionalText,
    text: {
      color: colors.text,
      ...directionalText,
    },
  })
}

function looksLikeMarkdown(value: string): boolean {
  return /(?:^|\n)\s{0,3}(?:#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```)|\*\*[^*\n]+\*\*|__[^_\n]+__|\[[^\]]+\]\([^)]+\)/.test(value)
}

export const MarkdownContent = memo(function MarkdownContent({
  content,
  fontSize,
  accentColor = '#06b6d4',
}: MarkdownContentProps) {
  useTranslation()
  const colors = useThemeColors()
  const isRtl = useIsCurrentLanguageRtl()
  const trimmed = content.trim()
  const needsMarkdown = looksLikeMarkdown(trimmed)
  const markdownit = useMemo(
    () => needsMarkdown ? MarkdownIt({ typographer: true }).disable(['image']) : null,
    [needsMarkdown]
  )
  const handleLinkPress = useMemo(
    () => (url: string) => {
      try {
        const parsed = new URL(url)
        if (parsed.protocol !== 'https:') {
          return false
        }
        void openExternalUrl(parsed.toString())
      } catch {
        return false
      }
      return false
    },
    []
  )

  const styles = useMemo(
    () => buildStyles(colors, fontSize, accentColor, isRtl),
    [colors, fontSize, accentColor, isRtl]
  )

  if (!needsMarkdown) {
    const directionalText = getDirectionalTextStyle(isRtl)
    return (
      <Text
        style={{
          color: colors.text,
          fontSize,
          lineHeight: fontSize * 1.5,
          ...directionalText,
        }}
      >
        {trimmed}
      </Text>
    )
  }

  return (
    <Markdown style={styles} markdownit={markdownit ?? undefined} onLinkPress={handleLinkPress}>
      {trimmed}
    </Markdown>
  )
})
