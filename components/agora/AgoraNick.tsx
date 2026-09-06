/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { Text, type TextProps } from 'react-native'
import { translate } from '@/lib/i18n'
import { agoraColorValue } from '@/services/agora'
import type { AgoraIdentityPublic } from '@/lib/types/agora'

export function AgoraNick({
  person,
  dark,
  onPress,
  onLongPress,
  compact = false,
}: {
  person: AgoraIdentityPublic
  dark: boolean
  onPress?: (person: AgoraIdentityPublic) => void
  onLongPress?: (person: AgoraIdentityPublic) => void
  compact?: boolean
}) {
  return (
    <Text
      testID={`agora-nick-${person.identityId}`}
      onPress={onPress ? () => onPress(person) : undefined}
      onLongPress={onLongPress ? () => onLongPress(person) : undefined}
      {...({ delayLongPress: 320 } as TextProps)}
      accessibilityRole="button"
      accessibilityLabel={translate('Whisper {{nick}}', { nick: person.nick })}
      className={compact ? 'text-xs font-semibold mb-1' : undefined}
      style={{
        color: agoraColorValue(person.color, dark),
        fontWeight: '700',
        flexShrink: 1,
      }}
      numberOfLines={1}
    >
      {person.nick}
    </Text>
  )
}
