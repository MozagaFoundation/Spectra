/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { type ComponentProps } from 'react'
import { TextInput, View, Text } from 'react-native'
import { translate } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useThemeColors } from '@/lib/theme'

type NativeTextInputProps = ComponentProps<typeof TextInput>

interface InputProps extends Omit<NativeTextInputProps, 'className'> {
  label?: string
  error?: string
  className?: string
  inputClassName?: string
}

export function Input({
  value,
  onChangeText,
  placeholder,
  label,
  error,
  secureTextEntry,
  autoCapitalize = 'none',
  autoCorrect = false,
  keyboardType = 'default',
  multiline = false,
  numberOfLines = 1,
  editable = true,
  placeholderTextColor,
  className,
  inputClassName,
  ...inputProps
}: InputProps) {
  const colors = useThemeColors()

  return (
    <View className={cn('w-full', className)}>
      {label && (
        <Text className="text-text-secondary text-sm mb-2">{translate(label)}</Text>
      )}
      <TextInput
        {...inputProps}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ? translate(placeholder) : placeholder}
        placeholderTextColor={placeholderTextColor ?? colors.textMuted}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        keyboardType={keyboardType}
        multiline={multiline}
        numberOfLines={numberOfLines}
        editable={editable}
        className={cn(
          'bg-surface border border-border rounded-xl px-4 py-3 text-text text-base',
          error && 'border-error',
          !editable && 'opacity-50',
          inputClassName
        )}
      />
      {error && (
        <Text className="text-error text-sm mt-1">{translate(error)}</Text>
      )}
    </View>
  )
}
