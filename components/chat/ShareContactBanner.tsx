/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useCallback, useRef, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { ChevronDown, ChevronUp } from 'lucide-react-native'
import { useRouter } from 'expo-router'
import ViewShot from 'react-native-view-shot'

import { ContactCardQrPreview } from '@/components/common/ContactCardQrPreview'
import { ContactCardShareActions } from '@/components/common/ContactCardShareActions'
import { translate } from '@/lib/i18n'
import {
  contactShareDisplayHandle,
  contactShareQrPayload,
  findableContactShareLink,
} from '@/lib/contactSharePayload'
import { cn } from '@/lib/utils'
import { useThemeColors } from '@/lib/theme'
import { ensureOwnContactProfile } from '@/services/chat/contactProfile'
import {
  readDiscoveryVisibility,
  type DiscoveryVisibility,
} from '@/services/chat/discoveryModeStorage'
import { getIdentity } from '@/services/quantumChat'
import {
  isScopedActiveContactCard,
  useEphemeralDiscoveryStore,
} from '@/store/ephemeralDiscoveryStore'
import { useWalletStore } from '@/store/walletStore'

export function ShareContactBanner({
  className,
  variant = 'card',
}: {
  className?: string
  variant?: 'card' | 'tabStrip'
}) {
  const router = useRouter()
  const colors = useThemeColors()
  const wallet = useWalletStore((state) => state.wallet)
  const activeContactCard = useEphemeralDiscoveryStore((state) => state.activeContactCard)
  const viewShotRef = useRef<ViewShot>(null)
  const [expanded, setExpanded] = useState(false)
  const [visibility, setVisibility] = useState<DiscoveryVisibility>('findable')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const spectreMode = wallet?.spectreMode === true
  const contactInvite = isScopedActiveContactCard(activeContactCard, wallet?.address)
    ? activeContactCard.invite
    : null
  const findableLink = findableContactShareLink(wallet?.address, spectreMode, visibility)
  const qrPayload = contactShareQrPayload(findableLink, contactInvite)
  const handle = contactShareDisplayHandle(displayName)
  const shareMessage = findableLink
    ? handle
      ? translate("I'm {{alias}} on Spectra. Add me: {{link}}", {
        ns: 'profile',
        alias: handle,
        link: findableLink,
      })
      : translate("I'm on Spectra. Add me: {{link}}", { ns: 'profile', link: findableLink })
    : null

  const loadExpanded = useCallback(async () => {
    if (!wallet?.address) return
    if (spectreMode) {
      setVisibility('private')
      setAvatarUrl(null)
      setDisplayName(null)
      return
    }
    const nextVisibility = await readDiscoveryVisibility(wallet.address)
    setVisibility(nextVisibility)
    const identity = getIdentity()
    if (!identity) return
    const profile = await ensureOwnContactProfile(identity.id).catch(() => null)
    setAvatarUrl(profile?.avatarDataUri ?? null)
    setDisplayName(profile?.displayName ?? null)
  }, [spectreMode, wallet?.address])

  const toggle = useCallback(() => {
    setExpanded((current) => {
      const next = !current
      if (next) void loadExpanded().catch(() => undefined)
      return next
    })
  }, [loadExpanded])

  const toggleRow = (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={translate('Share contact', { ns: 'chat' })}
        onPress={toggle}
        className="flex-row items-center px-4 py-3"
        testID="share-contact-banner-toggle"
      >
        <Text className="flex-1 font-semibold" style={{ color: colors.text }}>
          {translate('Share contact', { ns: 'chat' })}
        </Text>
        {expanded
          ? <ChevronDown size={18} color={colors.textMuted} />
          : <ChevronUp size={18} color={colors.textMuted} />}
      </Pressable>
  )
  const expandedBody = expanded ? (
        <View className="px-4 pb-4 items-center gap-3">
          <ContactCardQrPreview
            invite={qrPayload}
            viewShotRef={viewShotRef}
            avatarUrl={avatarUrl}
            displayName={handle || displayName || wallet?.displayName}
            qrSize={140}
          />
          <ContactCardShareActions
            invite={qrPayload}
            shareMessage={shareMessage}
            viewShotRef={viewShotRef}
          />
          <Pressable
            onPress={() => {
              router.push('/(main)/profile/qr-code')
            }}
          >
            <Text className="text-xs font-semibold" style={{ color: colors.primary }}>
              {translate('Open QR settings', { ns: 'chat' })}
            </Text>
          </Pressable>
        </View>
  ) : null

  return (
    <View
      className={cn(
        variant === 'tabStrip'
          ? 'overflow-hidden'
          : 'mx-5 mb-4 rounded-2xl overflow-hidden',
        className,
      )}
      style={
        variant === 'tabStrip'
          ? {
              backgroundColor: colors.surface,
              borderTopWidth: 1,
              borderColor: colors.border,
            }
          : { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }
      }
    >
      {variant === 'tabStrip' ? (
        <>
          {expandedBody}
          {toggleRow}
        </>
      ) : (
        <>
          {toggleRow}
          {expandedBody}
        </>
      )}
    </View>
  )
}
