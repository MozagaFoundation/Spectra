/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useCallback, useRef } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable'
import Reanimated, {
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated'
import { Trash2 } from 'lucide-react-native'
import { translate } from '@/lib/i18n'
import { useThemeColors } from '@/lib/theme'

const ACTION_WIDTH = 72

interface SwipeableContactItemProps {
  children: React.ReactNode
  contactId: string
  onDelete: (contactId: string) => void
}

function DeleteAction({
  drag,
  color,
  onPress,
}: {
  drag: SharedValue<number>
  color: string
  onPress: () => void
}) {
  const animStyle = useAnimatedStyle(() => ({
    transform: [{
      translateX: interpolate(
        drag.value,
        [-ACTION_WIDTH, 0],
        [0, ACTION_WIDTH],
        'clamp',
      ),
    }],
  }))

  return (
    <Reanimated.View style={[styles.actionButton, animStyle]}>
      <Pressable
        testID="contact-swipe-delete"
        accessibilityRole="button"
        accessibilityLabel={translate('Delete Contact')}
        onPress={onPress}
        style={[styles.actionPressable, { backgroundColor: color }]}
      >
        <Trash2 size={22} color="#fff" />
      </Pressable>
    </Reanimated.View>
  )
}

export const SwipeableContactItem = React.memo(function SwipeableContactItem({
  children,
  contactId,
  onDelete,
}: SwipeableContactItemProps) {
  const colors = useThemeColors()
  const swipeableRef = useRef<SwipeableMethods>(null)

  const handleDelete = useCallback(() => {
    swipeableRef.current?.close()
    onDelete(contactId)
  }, [contactId, onDelete])

  const renderRightActions = useCallback(
    (_prog: SharedValue<number>, drag: SharedValue<number>) => (
      <View style={styles.rightActionsContainer}>
        <DeleteAction drag={drag} color={colors.error} onPress={handleDelete} />
      </View>
    ),
    [colors.error, handleDelete],
  )

  return (
    <ReanimatedSwipeable
      ref={swipeableRef}
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      renderRightActions={renderRightActions}
    >
      {children}
    </ReanimatedSwipeable>
  )
})

const styles = StyleSheet.create({
  rightActionsContainer: {
    flexDirection: 'row',
    width: ACTION_WIDTH,
  },
  actionButton: {
    width: ACTION_WIDTH,
  },
  actionPressable: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
  },
})
