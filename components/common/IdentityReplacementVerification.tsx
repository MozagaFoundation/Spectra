/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { Text, View } from 'react-native'
import { AlertCircle, CheckCircle } from 'lucide-react-native'
import { Button } from '@/components/ui'
import type { ContactIdentityReplacement } from '@/services/chat'
import { translate } from '@/lib/i18n'
import { useThemeColors } from '@/lib/theme'

function formatSafetyNumber(value: string): string {
  return value.match(/.{1,5}/g)?.join(' ') || value
}

export function IdentityReplacementVerification({
  replacement,
  loading = false,
  onAccept,
}: {
  replacement: ContactIdentityReplacement
  loading?: boolean
  onAccept: () => void
}) {
  const colors = useThemeColors()
  const safetyNumber = replacement.safetyNumber?.numeric

  return (
    <View
      className="rounded-2xl p-4"
      style={{
        backgroundColor: colors.warning + '14',
        borderWidth: 1,
        borderColor: colors.warning + '55',
      }}
    >
      <View className="flex-row items-center gap-2 mb-2">
        <AlertCircle size={16} color={colors.warning} />
        <Text className="font-semibold" style={{ color: colors.warning }}>
          {translate('Chat identity changed', { ns: 'contacts' })}
        </Text>
      </View>
      <Text className="text-xs leading-5" style={{ color: colors.textSecondary }}>
        {translate(
          'This wallet is valid, but it now advertises a new chat identity. This can happen after account import or recovery.',
          { ns: 'contacts' },
        )}
      </Text>
      <Text className="text-xs leading-5 mt-1" style={{ color: colors.textSecondary }}>
        {translate(
          'Compare the safety number out of band before replacing the saved contact identity.',
          { ns: 'contacts' },
        )}
      </Text>
      {safetyNumber ? (
        <Text
          selectable
          className="font-mono text-sm tracking-wide mt-3"
          style={{ color: colors.text }}
        >
          {formatSafetyNumber(safetyNumber)}
        </Text>
      ) : null}
      <View className="rounded-xl px-3 py-2 mt-3 flex-row items-center gap-2" style={{ backgroundColor: colors.success + '14' }}>
        <CheckCircle size={14} color={colors.success} />
        <Text className="text-xs font-semibold" style={{ color: colors.success }}>
          {translate('Wallet authorization verified', { ns: 'contacts' })}
        </Text>
      </View>
      <Button
        variant="primary"
        fullWidth
        className="mt-3"
        loading={loading}
        disabled={loading || !safetyNumber}
        onPress={onAccept}
      >
        {translate('Replace after verification', { ns: 'contacts' })}
      </Button>
    </View>
  )
}
