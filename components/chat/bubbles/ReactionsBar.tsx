/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { memo, useMemo } from 'react'
import { View, Text } from 'react-native'
import type { ChatMessage } from '@/lib/types'

export const ReactionsBar = memo(function ReactionsBar({ 
  reactions, 
  isOwn 
}: { 
  reactions: NonNullable<ChatMessage['reactions']>
  isOwn: boolean 
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of reactions) {
      map.set(r.emoji, (map.get(r.emoji) || 0) + 1)
    }
    return [...map.entries()]
  }, [reactions])

  if (grouped.length === 0) return null

  return (
    <View className={`flex-row flex-wrap gap-1 mt-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
      {grouped.map(([emoji, count]) => (
        <View 
          key={emoji} 
          className="flex-row items-center bg-surface rounded-full px-1.5 py-0.5 border border-border"
        >
          <Text style={{ fontSize: 12 }}>{emoji}</Text>
          {count > 1 && (
            <Text className="text-text-muted text-xs ml-0.5">{count}</Text>
          )}
        </View>
      ))}
    </View>
  )
})
