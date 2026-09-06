/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { Pressable, Text, View } from 'react-native'
import { AgoraNick } from '@/components/agora/AgoraNick'
import { translate } from '@/lib/i18n'
import type { ThemeColors } from '@/lib/theme'
import type { AgoraIdentityPublic, AgoraWhisper } from '@/lib/types/agora'
import { agoraWhisperIsRedeemable, agoraWhisperPartnerNick } from '@/services/agora'

function formatTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function AgoraWhisperCard({
  whisper,
  ownIdentityId,
  ownNick,
  dark,
  colors,
  onNickPress,
  onNickLongPress,
  onRedeem,
  onFilterPartner,
}: {
  whisper: AgoraWhisper
  ownIdentityId: string | null | undefined
  ownNick: string
  dark: boolean
  colors: ThemeColors
  onNickPress: (person: AgoraIdentityPublic) => void
  onNickLongPress?: (person: AgoraIdentityPublic) => void
  onRedeem: (whisper: AgoraWhisper) => void
  onFilterPartner: (nick: string) => void
}) {
  const mine = whisper.from.identityId === ownIdentityId
  const redeemable = agoraWhisperIsRedeemable(whisper, ownIdentityId)
  const accepted = whisper.kind === 'invite_accept'

  return (
    <View className={`px-4 my-1.5 ${mine ? 'items-end' : 'items-start'}`}>
      <Pressable
        testID={redeemable ? 'agora-whisper-invite' : accepted ? 'agora-whisper-accept' : 'agora-whisper'}
        onPress={redeemable ? () => onRedeem(whisper) : undefined}
        onLongPress={() => onFilterPartner(agoraWhisperPartnerNick(whisper, ownNick))}
        delayLongPress={320}
        accessibilityHint={redeemable ? translate('Tap to redeem') : translate('Show whispers')}
        className="rounded-2xl px-3 py-2.5"
        style={{
          maxWidth: '85%',
          borderWidth: 1,
          borderColor: colors.gold,
          backgroundColor: `${colors.gold}14`,
        }}
      >
        <Text className="text-[11px] text-text-muted">{formatTime(whisper.createdAt)}</Text>
        <Text className="mt-1 text-text">
          <AgoraNick
            person={whisper.from}
            dark={dark}
            onPress={onNickPress}
            onLongPress={onNickLongPress}
          />
          {accepted
            ? ` ${translate('accepted a private-chat invite')}`
            : whisper.kind === 'invite'
              ? ` ${translate('offered a private-chat invite to')} `
              : ` ${translate('whispers')} `}
          {accepted ? null : (
            <AgoraNick
              person={whisper.to}
              dark={dark}
              onPress={onNickPress}
              onLongPress={onNickLongPress}
            />
          )}
          {whisper.kind === 'invite' || accepted || !whisper.body ? '' : `: ${whisper.body}`}
        </Text>
        <Text className="mt-1 text-[11px] text-text-muted">
          {translate('Visible to you two and to Spectra’s servers.')}
        </Text>
        {redeemable ? (
          <Text
            testID="agora-whisper-redeem"
            className="mt-1 text-xs font-semibold"
            style={{ color: colors.gold }}
          >
            {translate('Tap to redeem')}
          </Text>
        ) : null}
      </Pressable>
    </View>
  )
}
