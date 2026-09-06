/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { Pressable, Text, View } from 'react-native'
import { type Href, usePathname, useRouter } from 'expo-router'
import { Shield } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { SPECTRE_AGORA_MESSAGE, SPECTRE_CRYPTO_MESSAGE } from '@/lib/spectrePolicy'
import { translate } from '@/lib/i18n'
import { useThemeColors } from '@/lib/theme'

export function SpectreBlockedRoute() {
  const router = useRouter()
  const pathname = usePathname()
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const message = pathname.split('/').includes('agora')
    ? SPECTRE_AGORA_MESSAGE
    : SPECTRE_CRYPTO_MESSAGE

  return (
    <View
      className="flex-1 items-center justify-center bg-background px-6"
      style={{ paddingBottom: insets.bottom, paddingTop: insets.top }}
      testID="spectre-blocked-route"
    >
      <Shield size={40} color={colors.primary} />
      <Text className="mt-4 text-center text-xl font-semibold text-text">
        {translate('Spectre Mode')}
      </Text>
      <Text className="mt-2 text-center text-text-muted">
        {translate(message)}
      </Text>
      <Pressable
        accessibilityRole="button"
        className="mt-6 rounded-xl px-5 py-3 active:opacity-70"
        onPress={() => router.replace('/(main)/(tabs)/chats' as Href)}
        style={{ backgroundColor: colors.primary }}
      >
        <Text className="font-semibold text-text-on-primary">
          {translate('Chats', { ns: 'navigation' })}
        </Text>
      </Pressable>
    </View>
  )
}
