/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'

export const testColors = {
  background: '#000000',
  backgroundSecondary: '#050505',
  border: '#222222',
  error: '#ff4d4f',
  info: '#4aa3ff',
  primary: '#00ff99',
  success: '#20c997',
  surface: '#111111',
  surfaceHover: '#1a1a1a',
  tabBarBadge: '#00ff99',
  text: '#ffffff',
  textMuted: '#999999',
  textOnPrimary: '#000000',
  textSecondary: '#cccccc',
  textTertiary: '#777777',
  warning: '#ffaa00',
}

export function translateForTest(key: string, values?: Record<string, unknown>) {
  let result = key
  if (values && typeof values.count !== 'undefined') {
    result = result.replace('{{count}}', String(values.count))
      .replace('{{suffix}}', typeof values.suffix === 'string' ? values.suffix : '')
  }
  if (values && typeof values.number !== 'undefined') {
    result = result.replace('{{number}}', String(values.number))
  }
  if (values) {
    for (const [name, value] of Object.entries(values)) {
      result = result.replace(`{{${name}}}`, String(value))
    }
  }
  return result
}

export function TestIcon() {
  return null
}

export function TestAvatar({
  name,
  imageUrl,
}: {
  name?: string
  imageUrl?: string | null
}) {
  return (
    <View testID="avatar" accessibilityLabel={imageUrl ?? undefined}>
      <Text>{name || 'Avatar'}</Text>
    </View>
  )
}

export function TestButton({
  children,
  disabled,
  onPress,
}: {
  children: React.ReactNode
  disabled?: boolean
  onPress?: () => void | Promise<void>
}) {
  return (
    <Pressable disabled={disabled} onPress={onPress} testID={`button-${String(children)}`}>
      <Text>{children}</Text>
    </Pressable>
  )
}

export function TestCard({ children }: { children: React.ReactNode }) {
  return <View>{children}</View>
}

export function TestInput({
  error,
  label,
  onChangeText,
  placeholder,
  value,
}: {
  error?: string
  label?: string
  onChangeText?: (value: string) => void
  placeholder?: string
  value?: string
}) {
  return (
    <View>
      {label ? <Text>{label}</Text> : null}
      <TextInput
        onChangeText={onChangeText}
        placeholder={placeholder}
        testID={label ? `input-${label}` : 'input'}
        value={value}
      />
      {error ? <Text>{error}</Text> : null}
    </View>
  )
}

