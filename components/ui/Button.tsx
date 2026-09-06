/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { Pressable, Text, ActivityIndicator, View } from 'react-native'
import { translate } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useThemeColors } from '@/lib/theme'

interface ButtonProps {
  children: React.ReactNode
  onPress?: () => void
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  loading?: boolean
  fullWidth?: boolean
  icon?: React.ReactNode
  className?: string
  accentColor?: string
}

export function Button({
  children,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  fullWidth = false,
  icon,
  className,
  accentColor,
}: ButtonProps) {
  const colors = useThemeColors()

  const baseStyles = 'flex-row items-center justify-center rounded-xl'

  const variantStyles = {
    primary: accentColor ? '' : 'bg-primary active:bg-primary-dark',
    secondary: 'bg-surface border border-border active:bg-surface-hover',
    ghost: 'bg-transparent active:bg-surface',
    danger: 'bg-error active:bg-error/80',
  }

  const sizeStyles = {
    sm: 'px-3 py-2',
    md: 'px-4 py-3',
    lg: 'px-6 py-4',
  }

  const textSizeStyles = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
  }

  const disabledStyles = disabled || loading ? 'opacity-50' : ''
  const widthStyles = fullWidth ? 'w-full' : ''

  const usingAccentPrimary = variant === 'primary' && Boolean(accentColor)
  const textColor = variant === 'secondary' || variant === 'ghost'
    ? colors.text
    : usingAccentPrimary
      ? '#ffffff'
      : colors.textOnPrimary

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      className={cn(
        baseStyles,
        variantStyles[variant],
        sizeStyles[size],
        disabledStyles,
        widthStyles,
        className,
      )}
      style={usingAccentPrimary ? { backgroundColor: accentColor } : undefined}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : (
        <>
          {icon && <View className="mr-2">{icon}</View>}
          <Text className={cn('font-semibold', textSizeStyles[size])} style={{ color: textColor }}>
            {typeof children === 'string' ? translate(children) : children}
          </Text>
        </>
      )}
    </Pressable>
  )
}
