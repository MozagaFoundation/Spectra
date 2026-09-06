/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useMemo } from 'react'
import { View, Text, ScrollView, Pressable } from 'react-native'
import { Redirect, useRouter, useLocalSearchParams, type Href } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ChevronLeft } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useThemeColors } from '@/lib/theme'
import { LEGAL_DOCS } from '@/lib/legalDocs'
import { translate } from '@/lib/i18n'
import { openExternalUrl } from '@/services/tor/externalLinkPolicy'

interface RenderedBlock {
  type: 'h1' | 'h2' | 'h3' | 'hr' | 'paragraph' | 'table-row'
  text: string
}

function parseMarkdown(raw: string): RenderedBlock[] {
  const lines = raw.split('\n')
  const blocks: RenderedBlock[] = []
  let buffer = ''

  const flush = () => {
    const trimmed = buffer.trim()
    if (trimmed) {
      blocks.push({ type: 'paragraph', text: trimmed })
    }
    buffer = ''
  }

  for (const line of lines) {
    const trimmed = line.trimEnd()

    if (trimmed === '---') {
      flush()
      blocks.push({ type: 'hr', text: '' })
    } else if (trimmed.startsWith('### ')) {
      flush()
      blocks.push({ type: 'h3', text: trimmed.slice(4) })
    } else if (trimmed.startsWith('## ')) {
      flush()
      blocks.push({ type: 'h2', text: trimmed.slice(3) })
    } else if (trimmed.startsWith('# ')) {
      flush()
      blocks.push({ type: 'h1', text: trimmed.slice(2) })
    } else if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      flush()
      if (!trimmed.match(/^\|[\s-|]+\|$/)) {
        blocks.push({ type: 'table-row', text: trimmed })
      }
    } else if (trimmed === '') {
      flush()
    } else {
      buffer += (buffer ? ' ' : '') + trimmed
    }
  }
  flush()
  return blocks
}

function StyledText({ text, colors }: { text: string; colors: ReturnType<typeof useThemeColors> }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return (
    <Text>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <Text key={i} style={{ fontWeight: '700', color: colors.text }}>
              {part.slice(2, -2)}
            </Text>
          )
        }
        const inlineParts = part.split(/((?:https?:\/\/[^\s)]+)|(?:[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}))/g)
        return inlineParts.map((inlinePart, inlineIndex) => {
          const isUrl = /^https?:\/\//.test(inlinePart)
          const isEmail = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(inlinePart)
          if (!isUrl && !isEmail) {
            return <Text key={`${i}-${inlineIndex}`}>{inlinePart}</Text>
          }
          const href = isEmail ? `mailto:${inlinePart}` : inlinePart
          return (
            <Text
              key={`${i}-${inlineIndex}`}
              onPress={() => openExternalUrl(href)}
              style={{ color: colors.primary, textDecorationLine: 'underline' }}
            >
              {inlinePart}
            </Text>
          )
        })
      })}
    </Text>
  )
}

export default function LegalViewerScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const colors = useThemeColors()
  useTranslation()
  const { doc } = useLocalSearchParams<{ doc: string }>()

  const legalDoc = doc ? LEGAL_DOCS[doc] : undefined
  const title = legalDoc
    ? translate(legalDoc.titleKey, { ns: 'legal', defaultValue: legalDoc.fallbackTitle })
    : ''
  const content = legalDoc
    ? translate(legalDoc.contentKey, { ns: 'legal', defaultValue: legalDoc.fallbackContent })
    : ''
  const blocks = useMemo(() => parseMarkdown(content), [content])

  if (!legalDoc) {
    return <Redirect href={'/(main)/(tabs)/settings' as Href} />
  }

  return (
    <View className="flex-1 bg-background" style={{ backgroundColor: colors.background }}>
      <View
        className="flex-row items-center px-4 py-3"
        style={{ paddingTop: insets.top }}
      >
        <Pressable onPress={() => router.back()} className="p-2 -ml-2">
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <Text
          className="flex-1 text-lg font-bold text-text text-center mr-10"
          numberOfLines={1}
        >
          {title}
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 32,
        }}
        showsVerticalScrollIndicator={false}
      >
        {blocks.map((block, idx) => {
          switch (block.type) {
            case 'h1':
              return (
                <Text
                  key={idx}
                  className="text-text"
                  style={{ fontSize: 22, fontWeight: '800', marginTop: 20, marginBottom: 8, lineHeight: 28 }}
                >
                  <StyledText text={block.text} colors={colors} />
                </Text>
              )
            case 'h2':
              return (
                <Text
                  key={idx}
                  className="text-text"
                  style={{ fontSize: 17, fontWeight: '700', marginTop: 20, marginBottom: 6, lineHeight: 24 }}
                >
                  <StyledText text={block.text} colors={colors} />
                </Text>
              )
            case 'h3':
              return (
                <Text
                  key={idx}
                  className="text-text"
                  style={{ fontSize: 15, fontWeight: '600', marginTop: 14, marginBottom: 4, lineHeight: 22 }}
                >
                  <StyledText text={block.text} colors={colors} />
                </Text>
              )
            case 'hr':
              return (
                <View
                  key={idx}
                  style={{
                    height: 1,
                    backgroundColor: colors.border,
                    marginVertical: 16,
                  }}
                />
              )
            case 'table-row': {
              const cells = block.text
                .split('|')
                .filter(Boolean)
                .map((c) => c.trim())
              return (
                <View
                  key={idx}
                  style={{
                    flexDirection: 'row',
                    paddingVertical: 6,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                    gap: 8,
                  }}
                >
                  {cells.map((cell, ci) => (
                    <Text
                      key={ci}
                      style={{
                        flex: 1,
                        fontSize: 12,
                        lineHeight: 17,
                        color: colors.textSecondary,
                      }}
                    >
                      <StyledText text={cell} colors={colors} />
                    </Text>
                  ))}
                </View>
              )
            }
            case 'paragraph':
              return (
                <Text
                  key={idx}
                  style={{
                    fontSize: 14,
                    lineHeight: 21,
                    color: colors.textSecondary,
                    marginBottom: 10,
                  }}
                >
                  <StyledText text={block.text} colors={colors} />
                </Text>
              )
            default:
              return null
          }
        })}
      </ScrollView>
    </View>
  )
}
