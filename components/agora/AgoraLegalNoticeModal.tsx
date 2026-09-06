/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { Modal, Pressable, ScrollView, Text, View } from 'react-native'
import { AlertTriangle, CheckCircle2, Shield, X, XCircle } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Button } from '@/components/ui'
import { useGuardedRouter } from '@/hooks/useGuardedRouter'
import { translate } from '@/lib/i18n'
import { useThemeColors, type ThemeColors } from '@/lib/theme'

const DEANON_CHECKS = [
  'Turn on Tor before you enter Agora',
  'Do not reuse your discovery alias, EXO address, or real name as your plaza nick',
  'Do not share your face, workplace, city, school, or other unique details',
  'Do not send photos, voice, or files that identify you',
  'Do not post or paste links, URLs, or web addresses',
  'Treat everyone here as a stranger',
  'Move anything private to encrypted chat after a contact invite',
] as const

const PRIVATE_STEPS = [
  'Long-press their nick in the room or in the people list — do not just tap it',
  'Choose Invite to private chat',
  'They receive a whisper invite in this room',
  'They tap Redeem to open Spectra’s encrypted contact flow',
  'After they accept, talk in private chat — not in Agora',
] as const

const RISK_ITEMS = [
  'Tor can hide your device IP from Spectra for supported requests. It does not encrypt Agora messages, whispers, occupancy, or plaza nicks.',
  'Other people in the room can screenshot, copy, and share what you post.',
  'Whispers are visible to you, the recipient, and Spectra. They are not end-to-end encrypted.',
  'Occupancy shows that you are here.',
  'Images and voice notes are stored in plaintext on Spectra’s servers.',
  'A private-chat invite record is readable by Spectra until it expires or is used.',
  'Your plaza nick is not your discovery alias and is not proof of who someone is.',
  'Agora is not an emergency service.',
  'Be careful: dangerous behaviour here can still identify you or harm others.',
] as const

const FORBIDDEN_ITEMS = [
  'Illegal activity',
  'Abuse, exploitation, harassment, or hate',
  'Violence or threats',
  'Sexual exploitation, including child sexual abuse material',
  'Spam, phishing, scams, or malware',
  'Links, URLs, or web addresses',
  'Secrets, passwords, recovery phrases, keys, or financial credentials',
  'Impersonation, or a nick that matches your discovery alias or looks like an EXO address',
  'Using Spectre Mode or a Spectre wallet with Agora',
  'Any other harmful activity',
] as const

function SectionTitle({
  icon,
  color,
  children,
}: {
  icon: React.ReactNode
  color: string
  children: string
}) {
  return (
    <View className="flex-row items-center mt-5 mb-2">
      <View
        className="w-7 h-7 rounded-full items-center justify-center"
        style={{ backgroundColor: color + '18' }}
      >
        {icon}
      </View>
      <Text className="flex-1 ml-2 text-text font-semibold">{children}</Text>
    </View>
  )
}

function CheckRow({
  colors,
  children,
}: {
  colors: ThemeColors
  children: string
}) {
  return (
    <View className="flex-row mt-2">
      <CheckCircle2 size={16} color={colors.primary} style={{ marginTop: 2 }} />
      <Text className="flex-1 ml-2 text-text-muted leading-5">{children}</Text>
    </View>
  )
}

function StepRow({
  index,
  colors,
  children,
}: {
  index: number
  colors: ThemeColors
  children: string
}) {
  return (
    <View className="flex-row mt-2">
      <View
        className="w-5 h-5 rounded-full items-center justify-center mt-0.5"
        style={{ backgroundColor: colors.primary + '22' }}
      >
        <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700' }}>{index}</Text>
      </View>
      <Text className="flex-1 ml-2 text-text-muted leading-5">{children}</Text>
    </View>
  )
}

function RiskRow({
  colors,
  children,
}: {
  colors: ThemeColors
  children: string
}) {
  return (
    <View className="flex-row mt-2">
      <AlertTriangle size={16} color={colors.warning} style={{ marginTop: 2 }} />
      <Text className="flex-1 ml-2 text-text-muted leading-5">{children}</Text>
    </View>
  )
}

function ForbidRow({
  colors,
  children,
}: {
  colors: ThemeColors
  children: string
}) {
  return (
    <View className="flex-row mt-2">
      <XCircle size={16} color={colors.error} style={{ marginTop: 2 }} />
      <Text className="flex-1 ml-2 text-text-muted leading-5">{children}</Text>
    </View>
  )
}

export function AgoraLegalNoticeModal({
  visible,
  onClose,
}: {
  visible: boolean
  onClose: () => void
}) {
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const router = useGuardedRouter()

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end" style={{ backgroundColor: colors.overlay }}>
        <Pressable className="flex-1" onPress={onClose} accessibilityRole="button" accessibilityLabel={translate('Close')} />
        <View
          className="rounded-t-3xl px-5 pt-3"
          style={{
            height: '88%',
            backgroundColor: colors.surface,
            paddingBottom: insets.bottom + 8,
          }}
        >
          <View className="items-center pb-2">
            <View className="w-10 h-1 rounded-full" style={{ backgroundColor: colors.border }} />
          </View>
          <View className="flex-row items-center pb-3">
            <Text className="flex-1 text-text text-lg font-semibold">{translate('Stay safer in Agora')}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={translate('Close')}
              onPress={onClose}
              className="w-8 h-8 rounded-full items-center justify-center"
              style={{ backgroundColor: colors.backgroundSecondary }}
              hitSlop={8}
            >
              <X size={16} color={colors.textMuted} />
            </Pressable>
          </View>
          <ScrollView
            style={{ flex: 1, minHeight: 0 }}
            contentContainerStyle={{ paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            showsVerticalScrollIndicator
          >
            <View
              className="rounded-2xl px-4 py-3"
              style={{
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.error + '33',
              }}
            >
              <View className="flex-row items-center">
                <View
                  className="w-9 h-9 rounded-full items-center justify-center"
                  style={{ backgroundColor: colors.error + '18' }}
                >
                  <AlertTriangle size={18} color={colors.error} />
                </View>
                <Text className="flex-1 ml-3 font-semibold" style={{ color: colors.error }}>
                  {translate('Public · not encrypted')}
                </Text>
              </View>
              <Text className="mt-2 leading-5" style={{ color: colors.textSecondary }}>
                {translate('This is a public, non-encrypted chat. Spectra’s servers can read every line, whisper, image, voice note, nick, and occupancy record.')}
              </Text>
            </View>

            <SectionTitle icon={<Shield size={14} color={colors.primary} />} color={colors.primary}>
              {translate('Minimize deanonymization')}
            </SectionTitle>
            <Text className="text-text-muted leading-5">
              {translate('Tor can hide your device IP from Spectra. It does not encrypt Agora. Use these habits:')}
            </Text>
            {DEANON_CHECKS.map((key) => (
              <CheckRow key={key} colors={colors}>{translate(key)}</CheckRow>
            ))}

            <SectionTitle icon={<CheckCircle2 size={14} color={colors.gold} />} color={colors.gold}>
              {translate('Start a private conversation')}
            </SectionTitle>
            <Text className="text-text-muted leading-5">
              {translate('A whisper in Agora is not private. To add someone from the plaza to your contacts:')}
            </Text>
            {PRIVATE_STEPS.map((key, index) => (
              <StepRow key={key} index={index + 1} colors={colors}>{translate(key)}</StepRow>
            ))}
            <Text className="text-text-muted mt-3 leading-5">
              {translate('Tapping a nick only starts an unencrypted whisper. Long-press is how you send a private-chat invite.')}
            </Text>

            <SectionTitle icon={<AlertTriangle size={14} color={colors.warning} />} color={colors.warning}>
              {translate('Anonymization is not a guarantee')}
            </SectionTitle>
            {RISK_ITEMS.map((key) => (
              <RiskRow key={key} colors={colors}>{translate(key)}</RiskRow>
            ))}

            <SectionTitle icon={<XCircle size={14} color={colors.error} />} color={colors.error}>
              {translate('Forbidden conducts')}
            </SectionTitle>
            <Text className="text-text-muted leading-5">
              {translate('Do not use Agora for any of the following. Spectra may remove content, kick occupancy, block, rate-limit, or disable Agora access.')}
            </Text>
            {FORBIDDEN_ITEMS.map((key) => (
              <ForbidRow key={key} colors={colors}>{translate(key)}</ForbidRow>
            ))}

            <Text className="text-text mt-5 leading-5">
              {translate('I understand Agora is not encrypted.')}
            </Text>
            <Pressable
              onPress={() => {
                onClose()
                router.push({ pathname: '/(main)/settings/legal-viewer', params: { doc: 'agora' } })
              }}
              className="mt-4"
            >
              <Text style={{ color: colors.gold }}>{translate('Read Agora Terms')}</Text>
            </Pressable>
            <Button className="mt-5" onPress={onClose}>{translate('Close')}</Button>
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}
