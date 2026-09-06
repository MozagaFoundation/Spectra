/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useMemo, useRef, useState } from 'react'
import {
  InputAccessoryView,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { useTranslation } from 'react-i18next'
import { getEnglishBip39PrefixSuggestions } from '@spectra/identity-vault'
import { useThemeColors } from '@/lib/theme'

const MNEMONIC_WORD_COUNT = 24
const MNEMONIC_INPUT_ACCESSORY_ID = 'mnemonic-keyboard-accessory'

interface MnemonicInputProps {
  onMnemonicChange: (mnemonic: string, isComplete: boolean) => void
  error?: string
  embeddedScroll?: boolean
}

export function MnemonicInput({ onMnemonicChange, error, embeddedScroll = true }: MnemonicInputProps) {
  const colors = useThemeColors()
  const { t } = useTranslation()
  const [words, setWords] = useState<string[]>(Array(MNEMONIC_WORD_COUNT).fill(''))
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null)
  const inputRefs = useRef<(TextInput | null)[]>([])

  const focusField = (index: number) => {
    if (index < 0 || index >= MNEMONIC_WORD_COUNT) return
    setFocusedIndex(index)
    inputRefs.current[index]?.focus()
  }

  const finishEditing = () => {
    inputRefs.current[focusedIndex ?? -1]?.blur()
    setFocusedIndex(null)
    Keyboard.dismiss()
  }

  const emitMnemonicChange = (nextWords: string[]) => {
    const mnemonic = nextWords.join(' ').trim()
    const isComplete = nextWords.every(w => w.length > 0)
    onMnemonicChange(mnemonic, isComplete)
  }

  const handleWordChange = (index: number, value: string) => {
    const normalizedValue = value.normalize('NFKD').toLowerCase()
    const pastedWords = normalizedValue.trim().split(/\s+/).filter(Boolean)
    if (pastedWords.length > 1) {
      const newWords = [...words]
      for (let i = index; i < MNEMONIC_WORD_COUNT; i++) {
        newWords[i] = ''
      }
      pastedWords.forEach((word, i) => {
        if (index + i < MNEMONIC_WORD_COUNT) {
          newWords[index + i] = word
        }
      })
      setWords(newWords)
      emitMnemonicChange(newWords)

      const nextIndex = Math.min(index + pastedWords.length, MNEMONIC_WORD_COUNT - 1)
      focusField(nextIndex)
      return
    }

    const newWords = [...words]
    const word = normalizedValue.trim()
    newWords[index] = word
    setWords(newWords)
    emitMnemonicChange(newWords)

    if (word && /\s$/.test(normalizedValue) && index < MNEMONIC_WORD_COUNT - 1) {
      focusField(index + 1)
    }
  }

  const handleSuggestion = (index: number, suggestion: string) => {
    const newWords = [...words]
    newWords[index] = suggestion
    setWords(newWords)
    emitMnemonicChange(newWords)

    if (index < MNEMONIC_WORD_COUNT - 1) {
      focusField(index + 1)
    }
  }

  const handleKeyPress = (index: number, key: string) => {
    if (key === 'Backspace' && words[index].length === 0 && index > 0) {
      focusField(index - 1)
    }
  }

  const handleSubmit = (index: number) => {
    if (index < MNEMONIC_WORD_COUNT - 1) {
      focusField(index + 1)
    } else {
      finishEditing()
    }
  }

  const handlePaste = async () => {
    const text = await Clipboard.getStringAsync()
    if (text) {
      handleWordChange(0, text)
    }
  }

  const suggestions = useMemo(() => (
    focusedIndex === null
      ? []
      : getEnglishBip39PrefixSuggestions(words[focusedIndex])
  ), [focusedIndex, words])

  const wordInputs = (
    <View className="flex-row flex-wrap">
      {words.map((word, index) => {
        const isFocused = focusedIndex === index
        return (
          <View key={index} className="w-1/2 p-1">
            <View
              className="flex-row items-center rounded-lg px-2"
              style={{
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: isFocused ? colors.primary : 'transparent',
              }}
            >
              <Text
                className="w-6 text-sm font-mono"
                style={{ color: colors.textMuted }}
              >
                {index + 1}.
              </Text>
              <TextInput
                ref={(ref) => {
                  inputRefs.current[index] = ref
                }}
                value={word}
                onChangeText={(text) => handleWordChange(index, text)}
                onKeyPress={({ nativeEvent }) => handleKeyPress(index, nativeEvent.key)}
                onSubmitEditing={() => handleSubmit(index)}
                onFocus={() => setFocusedIndex(index)}
                onBlur={() => setFocusedIndex((current) => (current === index ? null : current))}
                autoCapitalize="none"
                autoComplete="off"
                autoCorrect={false}
                importantForAutofill="no"
                inputAccessoryViewID={Platform.OS === 'ios' ? MNEMONIC_INPUT_ACCESSORY_ID : undefined}
                keyboardType={Platform.OS === 'ios' ? 'ascii-capable' : 'visible-password'}
                returnKeyType={index === MNEMONIC_WORD_COUNT - 1 ? 'done' : 'next'}
                smartInsertDelete={false}
                spellCheck={false}
                submitBehavior="submit"
                textContentType="none"
                accessibilityLabel={t('Recovery word {{number}}', { number: index + 1 })}
                testID={`mnemonic-word-${index + 1}`}
                className="flex-1 py-3 font-mono"
                style={{ color: colors.text }}
              />
            </View>
          </View>
        )
      })}
    </View>
  )

  return (
    <View>
      <View className="flex-row justify-between items-center mb-3">
        <Text className="text-text font-semibold">{t('Recovery Phrase')}</Text>
        <Pressable
          accessibilityLabel={t('Paste recovery phrase')}
          accessibilityRole="button"
          onPress={handlePaste}
          className="px-3 py-1 bg-surface rounded-lg"
        >
          <Text className="text-primary text-sm">{t('Paste')}</Text>
        </Pressable>
      </View>

      {embeddedScroll ? (
        <ScrollView className="max-h-80" keyboardShouldPersistTaps="handled">
          {wordInputs}
        </ScrollView>
      ) : wordInputs}

      {focusedIndex !== null && suggestions.length > 0 && (
        <View
          accessibilityLabel={t('BIP39 word suggestions')}
          className="flex-row flex-wrap gap-2 mt-2"
          testID="mnemonic-suggestions"
        >
          {suggestions.map((suggestion) => (
            <Pressable
              key={suggestion}
              accessibilityLabel={t('Use {{word}} for recovery word {{number}}', {
                word: suggestion,
                number: focusedIndex + 1,
              })}
              accessibilityRole="button"
              className="px-3 py-2 rounded-lg"
              style={{ backgroundColor: colors.surface }}
              onPress={() => handleSuggestion(focusedIndex, suggestion)}
              testID={`mnemonic-suggestion-${suggestion}`}
            >
              <Text className="font-mono text-sm" style={{ color: colors.primary }}>
                {suggestion}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {error && (
        <Text className="text-error text-sm mt-2">{error}</Text>
      )}

      {Platform.OS === 'ios' && (
        <InputAccessoryView nativeID={MNEMONIC_INPUT_ACCESSORY_ID}>
          <View
            className="flex-row justify-end px-3 py-2"
            style={{
              backgroundColor: colors.backgroundSecondary,
              borderTopColor: colors.border,
              borderTopWidth: 1,
            }}
          >
            <Pressable
              accessibilityLabel={t('Previous')}
              accessibilityRole="button"
              accessibilityState={{ disabled: focusedIndex === null || focusedIndex === 0 }}
              disabled={focusedIndex === null || focusedIndex === 0}
              hitSlop={8}
              className="px-3 py-1.5"
              onPress={() => focusField((focusedIndex ?? 0) - 1)}
            >
              <Text
                className="font-semibold"
                style={{ color: focusedIndex === null || focusedIndex === 0 ? colors.textMuted : colors.primary }}
              >
                {t('Previous')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel={t('Next')}
              accessibilityRole="button"
              accessibilityState={{
                disabled: focusedIndex === null || focusedIndex === MNEMONIC_WORD_COUNT - 1,
              }}
              disabled={focusedIndex === null || focusedIndex === MNEMONIC_WORD_COUNT - 1}
              hitSlop={8}
              className="px-3 py-1.5"
              onPress={() => focusField((focusedIndex ?? -1) + 1)}
            >
              <Text
                className="font-semibold"
                style={{
                  color: focusedIndex === null || focusedIndex === MNEMONIC_WORD_COUNT - 1
                    ? colors.textMuted
                    : colors.primary,
                }}
              >
                {t('Next')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel={t('Done')}
              accessibilityRole="button"
              hitSlop={8}
              className="px-3 py-1.5"
              onPress={finishEditing}
            >
              <Text className="text-primary font-semibold">{t('Done')}</Text>
            </Pressable>
          </View>
        </InputAccessoryView>
      )}
    </View>
  )
}
