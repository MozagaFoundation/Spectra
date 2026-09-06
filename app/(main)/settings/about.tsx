/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { View, Text, ScrollView, Pressable } from 'react-native'
import { Image } from 'expo-image'
import { useTranslation } from 'react-i18next'
import {
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  MessageSquareWarning,
  Globe,
  FileText,
  Shield,
  Scale,
  Landmark,
  Mail,
  Building2,
} from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Card } from '@/components/ui'
import { APP_NAME } from '@/lib/constants'
import {
  getRuntimeAppVersion,
  LEGAL_CONTACT_EMAIL,
  LEGAL_OWNER_NAME,
  PRIVACY_CONTACT_EMAIL,
  SPECTRA_COPYRIGHT_NOTICE,
  SPECTRA_WEBSITE_URL,
} from '@/lib/appMetadata'
import { translate } from '@/lib/i18n'
import { useIsSpectreThemeActive, useThemeColors } from '@/lib/theme'
import { useGuardedRouter } from '@/hooks/useGuardedRouter'
import { useUIStore } from '@/store/uiStore'
import { openExternalUrl } from '@/services/tor/externalLinkPolicy'

function loadDarkLogo() {
  try {
    return require('@/assets/images/spectra/isotipo-full-color.svg')
  } catch {
    return undefined
  }
}

function loadLightLogo() {
  try {
    return require('@/assets/images/spectra/isotipo-verde-1.svg')
  } catch {
    return undefined
  }
}

const LOGO_DARK = loadDarkLogo()
const LOGO_LIGHT = loadLightLogo()

function NavRow({
  icon: Icon,
  title,
  onPress,
  colors,
  isLast,
}: {
  icon: React.ComponentType<{ size: number; color: string }>
  title: string
  onPress: () => void
  colors: ReturnType<typeof useThemeColors>
  isLast?: boolean
}) {
  return (
    <>
      <Pressable onPress={onPress} className="active:opacity-70">
        <View className="flex-row items-center gap-3 px-4 py-3.5">
          <Icon size={18} color={colors.textMuted} />
          <Text className="flex-1 text-text text-sm">{translate(title)}</Text>
          <ChevronRight size={16} color={colors.textMuted} />
        </View>
      </Pressable>
      {!isLast && <View className="border-t border-border ml-11 mr-4" />}
    </>
  )
}

function InfoRow({
  icon: Icon,
  label,
  value,
  colors,
  isLast,
  onPress,
}: {
  icon: React.ComponentType<{ size: number; color: string }>
  label: string
  value: string
  colors: ReturnType<typeof useThemeColors>
  isLast?: boolean
  onPress?: () => void
}) {
  const content = (
    <View className="flex-row items-center gap-3 px-4 py-3.5">
      <Icon size={18} color={colors.textMuted} />
      <View className="flex-1">
        <Text className="text-text text-sm">{translate(label)}</Text>
        <Text className="text-text-muted text-xs mt-0.5">{value}</Text>
      </View>
      {onPress ? <ChevronRight size={16} color={colors.textMuted} /> : null}
    </View>
  )

  return (
    <>
      {onPress ? (
        <Pressable onPress={onPress} className="active:opacity-70">
          {content}
        </Pressable>
      ) : content}
      {!isLast && <View className="border-t border-border ml-11 mr-4" />}
    </>
  )
}

export default function HelpAboutScreen() {
  const router = useGuardedRouter()
  const insets = useSafeAreaInsets()
  const colors = useThemeColors()
  const isDarkMode = useUIStore((s) => s.isDarkMode)
  const spectreThemeActive = useIsSpectreThemeActive()
  useTranslation()
  const logoSource = isDarkMode || spectreThemeActive ? LOGO_DARK : LOGO_LIGHT
  const appVersion = getRuntimeAppVersion()

  return (
    <View className="flex-1 bg-background" style={{ backgroundColor: colors.background }}>
      <View
        className="flex-row items-center px-4 py-3"
        style={{ paddingTop: insets.top }}
      >
        <Pressable onPress={() => router.back()} className="p-2 -ml-2">
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <Text className="flex-1 text-xl font-bold text-text text-center mr-10">
          {translate('Help & About')}
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row items-center gap-4 py-5 px-2">
          <Image
            source={logoSource}
            style={{ width: 64, height: 64 }}
            contentFit="contain"
          />
          <View>
            <Text className="text-xl font-bold text-text">{APP_NAME}</Text>
            <Text className="text-text-muted text-sm">{translate('Version {{version}}', { version: appVersion })}</Text>
          </View>
        </View>

        <Card className="overflow-hidden mb-3">
          <NavRow
            icon={HelpCircle}
            title="Help Center"
            onPress={() => router.push('/(main)/settings/help-center')}
            colors={colors}
          />
          <NavRow
            icon={MessageSquareWarning}
            title="Report an Issue"
            onPress={() => router.push('/(main)/settings/report-issue')}
            colors={colors}
            isLast
          />
        </Card>

        <Card className="overflow-hidden mb-3">
          <NavRow
            icon={FileText}
            title="Terms and Conditions"
            onPress={() =>
              router.push({
                pathname: '/(main)/settings/legal-viewer',
                params: { doc: 'terms' },
              })
            }
            colors={colors}
          />
          <NavRow
            icon={Shield}
            title="Privacy Policy"
            onPress={() =>
              router.push({
                pathname: '/(main)/settings/legal-viewer',
                params: { doc: 'privacy' },
              })
            }
            colors={colors}
          />
          <NavRow
            icon={Scale}
            title="Payment and Digital Assets Disclaimer"
            onPress={() =>
              router.push({
                pathname: '/(main)/settings/legal-viewer',
                params: { doc: 'disclaimer' },
              })
            }
            colors={colors}
          />
          <NavRow
            icon={Landmark}
            title="Agora Terms"
            onPress={() =>
              router.push({
                pathname: '/(main)/settings/legal-viewer',
                params: { doc: 'agora' },
              })
            }
            colors={colors}
            isLast
          />
          <NavRow
            icon={Globe}
            title="Visit Website"
            onPress={() => openExternalUrl(SPECTRA_WEBSITE_URL)}
            colors={colors}
          />
          <InfoRow
            icon={Building2}
            label="Legal Owner"
            value={LEGAL_OWNER_NAME}
            colors={colors}
          />
          <InfoRow
            icon={Mail}
            label="Legal Contact"
            value={LEGAL_CONTACT_EMAIL}
            onPress={() => openExternalUrl(`mailto:${LEGAL_CONTACT_EMAIL}`)}
            colors={colors}
          />
          <InfoRow
            icon={Shield}
            label="Privacy Contact"
            value={PRIVACY_CONTACT_EMAIL}
            onPress={() => openExternalUrl(`mailto:${PRIVACY_CONTACT_EMAIL}`)}
            colors={colors}
            isLast
          />
        </Card>

        <View className="items-center">
          <Text className="text-text-muted text-xs">
            {SPECTRA_COPYRIGHT_NOTICE}
          </Text>
        </View>
      </ScrollView>
    </View>
  )
}
