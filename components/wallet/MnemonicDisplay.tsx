/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { View, Text } from 'react-native'

interface MnemonicDisplayProps {
  mnemonic: string
}

export function MnemonicDisplay({ mnemonic }: MnemonicDisplayProps) {
  const words = mnemonic.trim().split(/\s+/).filter(Boolean)
  const leftColumn = words.slice(0, 12)
  const rightColumn = words.slice(12, 24)
  
  return (
    <View className="bg-surface rounded-2xl p-4">
      <View className="flex-row">
        <View className="flex-1 pr-2">
          {leftColumn.map((word, index) => (
            <View key={index} className="flex-row items-center py-2 border-b border-border">
              <Text className="text-text-muted w-6 text-sm">{index + 1}.</Text>
              <Text className="text-text font-mono">{word}</Text>
            </View>
          ))}
        </View>
        
        <View className="flex-1 pl-2">
          {rightColumn.map((word, index) => (
            <View key={index} className="flex-row items-center py-2 border-b border-border">
              <Text className="text-text-muted w-6 text-sm">{index + 13}.</Text>
              <Text className="text-text font-mono">{word}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  )
}
