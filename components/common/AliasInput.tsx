/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { Text, View, type TextInputProps } from 'react-native'

import { Input } from '@/components/ui/Input'
import { discoveryAliasInputBody, normalizeDiscoveryAlias } from '@/lib/discoveryAlias'
import { translate } from '@/lib/i18n'
import { useThemeColors } from '@/lib/theme'

interface AliasInputProps extends Omit<TextInputProps, 'value' | 'onChangeText' | 'className'> {
  label?: string
  value: string
  onChangeText: (value: string) => void
  error?: string | null
  helperText?: string
}

export function aliasFieldValue(raw: string): string {
  const body = discoveryAliasInputBody(raw)
  return body ? `@${body}` : ''
}

export function validateAliasField(raw: string): string | null {
  const value = aliasFieldValue(raw)
  if (!value) return null
  try {
    normalizeDiscoveryAlias(value)
    return null
  } catch {
    return translate('Alias is invalid.', { ns: 'profile' })
  }
}

export function AliasInput({
  label,
  value,
  onChangeText,
  error,
  helperText,
  editable = true,
  ...inputProps
}: AliasInputProps) {
  const colors = useThemeColors()
  const body = discoveryAliasInputBody(value)

  return (
    <View className="w-full">
      <Input
        {...inputProps}
        label={label ?? translate('Alias', { ns: 'profile' })}
        value={body ? `@${body}` : '@'}
        onChangeText={(next) => {
          const nextBody = discoveryAliasInputBody(next.replace(/^@+/, '@'))
          onChangeText(nextBody ? `@${nextBody}` : '')
        }}
        placeholder="@alice"
        autoCapitalize="none"
        autoCorrect={false}
        editable={editable}
        error={error || undefined}
        inputClassName="font-medium"
      />
      {helperText ? (
        <Text className="text-xs leading-4 mt-1" style={{ color: colors.textMuted }}>
          {helperText}
        </Text>
      ) : null}
    </View>
  )
}
