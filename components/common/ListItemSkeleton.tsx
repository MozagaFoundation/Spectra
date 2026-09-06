/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useEffect, useRef } from 'react'
import { Animated, View } from 'react-native'
import { useThemeColors } from '@/lib/theme'

const SKELETON_COUNT = 8

function SkeletonRow({ opacity }: { opacity: Animated.Value }) {
  const colors = useThemeColors()

  return (
    <Animated.View
      className="flex-row items-center gap-3 p-3 rounded-xl"
      style={{ opacity }}
    >
      <View
        className="w-10 h-10 rounded-full"
        style={{ backgroundColor: colors.surface }}
      />
      <View className="flex-1 gap-2">
        <View className="flex-row justify-between items-center">
          <View
            className="h-4 rounded-md"
            style={{ backgroundColor: colors.surface, width: '45%' }}
          />
          <View
            className="h-3 rounded-md"
            style={{ backgroundColor: colors.surface, width: 40 }}
          />
        </View>
        <View
          className="h-3 rounded-md"
          style={{ backgroundColor: colors.surface, width: '70%' }}
        />
      </View>
    </Animated.View>
  )
}

export function ListItemSkeleton() {
  const pulseAnim = useRef(new Animated.Value(0.4)).current

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.4,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    )
    animation.start()
    return () => animation.stop()
  }, [pulseAnim])

  return (
    <View className="px-4">
      {Array.from({ length: SKELETON_COUNT }, (_, index) => (
        <SkeletonRow key={index} opacity={pulseAnim} />
      ))}
    </View>
  )
}
