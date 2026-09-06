/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useState, useRef, useEffect } from 'react'
import { InputAccessoryView, Platform, StyleSheet, View, Text, TextInput, Pressable } from 'react-native'
import * as Haptics from 'expo-haptics'
import { translate } from '@/lib/i18n'
import { useThemeColors } from '@/lib/theme'

interface PinInputProps {
  onComplete: (pin: string) => void
  error?: string
  label?: string
  length?: number
  disabled?: boolean
}

const PIN_KEYBOARD_ACCESSORY_ID = 'spectra-pin-keyboard-accessory'

export function PinInput({
  onComplete,
  error,
  label,
  length = 6,
  disabled = false,
}: PinInputProps) {
  const colors = useThemeColors()
  const [pin, setPin] = useState('')
  const inputRef = useRef<TextInput>(null)
  const isAndroid = Platform.OS === 'android'
  
  useEffect(() => {
    if (error) {
      setPin('')
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    }
  }, [error])
  
  const commitPin = (nextPin: string, haptic = true) => {
    setPin(nextPin)
    if (haptic && nextPin.length > pin.length) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    }
    if (nextPin.length === length && nextPin !== pin) {
      onComplete(nextPin)
      if (error) {
        setPin('')
      }
    }
  }

  const handleChange = (value: string) => {
    if (disabled) return
    const numericValue = value.replace(/[^0-9]/g, '').slice(0, length)
    commitPin(numericValue)
  }

  const handlePress = () => {
    if (disabled) return
    inputRef.current?.focus()
  }
  
  return (
    <View className="items-center">
      {label && (
        <Text
          className="text-text-secondary text-sm mb-4"
          style={isAndroid ? styles.androidLabel : undefined}
        >
          {label}
        </Text>
      )}
      
      <View collapsable={false} style={styles.pinTarget}>
        <Pressable
          accessibilityLabel={translate('PIN input', { ns: 'auth' })}
          accessibilityRole="button"
          onPress={handlePress}
          disabled={disabled}
        >
          <View className="flex-row gap-3">
            {Array.from({ length }).map((_, index) => (
              <View
                key={index}
                className={`w-12 h-14 rounded-xl items-center justify-center border-2 ${
                  pin.length === index
                    ? 'border-primary bg-surface'
                    : pin.length > index
                    ? 'border-primary bg-primary/20'
                    : 'border-border bg-surface'
                } ${error ? 'border-error' : ''}`}
              >
                {pin.length > index && (
                  <View
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: colors.primary }}
                  />
                )}
              </View>
            ))}
          </View>
        </Pressable>

        <TextInput
          ref={inputRef}
          value={pin}
          onChangeText={handleChange}
          keyboardType="number-pad"
          maxLength={length}
          autoFocus={!isAndroid}
          autoCorrect={false}
          autoComplete="off"
          editable={!disabled}
          showSoftInputOnFocus
          caretHidden
          contextMenuHidden
          importantForAutofill="no"
          spellCheck={false}
          underlineColorAndroid="transparent"
          selectionColor="transparent"
          textContentType="none"
          secureTextEntry={isAndroid}
          inputAccessoryViewID={isAndroid ? undefined : PIN_KEYBOARD_ACCESSORY_ID}
          style={styles.inputOverlay}
        />
      </View>

      {Platform.OS === 'ios' ? (
        <InputAccessoryView nativeID={PIN_KEYBOARD_ACCESSORY_ID} backgroundColor="transparent">
          <View pointerEvents="none" style={styles.iosAccessory} />
        </InputAccessoryView>
      ) : null}
      
      {error && (
        <Text className="text-error text-sm mt-4 text-center">{error}</Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  pinTarget: {
    overflow: 'hidden',
    position: 'relative',
  },
  androidLabel: {
    alignSelf: 'stretch',
    lineHeight: 20,
    textAlign: 'center',
  },
  inputOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'transparent',
    borderWidth: 0,
    color: 'transparent',
    fontSize: 1,
    lineHeight: 1,
    opacity: 0,
    padding: 0,
  },
  iosAccessory: {
    height: 1,
    opacity: 0,
  },
})
