/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useCallback, useRef, useState } from 'react'
import { View, Text, Pressable, ScrollView, Switch } from 'react-native'
import { useRouter } from 'expo-router'
import { ChevronLeft } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import ViewShot from 'react-native-view-shot'
import { Button } from '@/components/ui'
import { ContactCardQrPreview } from '@/components/common/ContactCardQrPreview'
import { ContactCardShareActions } from '@/components/common/ContactCardShareActions'
import { useWalletStore } from '@/store/walletStore'
import { useVdfBannerPreferenceStore } from '@/store/vdfBannerPreferenceStore'
import { isScopedActiveContactCard, isScopedPublicDiscoveryLease, useEphemeralDiscoveryStore } from '@/store/ephemeralDiscoveryStore'
import { translate } from '@/lib/i18n'
import { useThemeColors } from '@/lib/theme'
import {
  contactShareDisplayHandle,
  contactShareQrPayload,
  findableContactShareLink,
} from '@/lib/contactSharePayload'
import { getIdentity } from '@/services/quantumChat'
import {
  ensureActiveDiscoveryRent,
  unpublishActiveDiscovery,
} from '@/services/chat/activeDiscoveryCoordinator'
import {
  startOneTimeContactCardCreation,
  startPublicDiscoveryPublication,
  verifyRestoredOneTimeContactCard,
} from '@/services/chat/ephemeralDiscoveryCoordinator'
import {
  readDiscoveryVisibility,
  writeDiscoveryVisibility,
  type DiscoveryVisibility,
} from '@/services/chat/discoveryModeStorage'
import { ensureOwnContactProfile } from '@/services/chat/contactProfile'

export default function QRCodeScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const colors = useThemeColors()
  const wallet = useWalletStore((state) => state.wallet)
  const activeContactCard = useEphemeralDiscoveryStore((state) => state.activeContactCard)
  const activity = useEphemeralDiscoveryStore((state) => state.activity)
  const publicDiscoveryLease = useEphemeralDiscoveryStore((state) => state.publicDiscoveryLease)
  const lastFailure = useEphemeralDiscoveryStore((state) => state.lastFailure)
  const viewShotRef = useRef<ViewShot>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [sharedDisplayName, setSharedDisplayName] = useState<string | null>(null)
  const [shareError, setShareError] = useState<string | null>(null)
  const [visibility, setVisibility] = useState<DiscoveryVisibility>('findable')
  const vdfBannerVisible = useVdfBannerPreferenceStore((state) => state.visible)
  const setVdfBannerVisible = useVdfBannerPreferenceStore((state) => state.setVisible)
  const spectreMode = wallet?.spectreMode === true
  const contactInvite = isScopedActiveContactCard(activeContactCard, wallet?.address)
    ? activeContactCard.invite
    : null
  const livePublicDiscovery = isScopedPublicDiscoveryLease(publicDiscoveryLease, wallet?.address)
  const isPublishing = activity !== null
  const findableLink = findableContactShareLink(wallet?.address, spectreMode, visibility)
  const qrPayload = contactShareQrPayload(findableLink, contactInvite)
  const shareHandle = contactShareDisplayHandle(sharedDisplayName)
  const shareMessage = findableLink
    ? shareHandle
      ? translate("I'm {{alias}} on Spectra. Add me: {{link}}", {
        ns: 'profile',
        alias: shareHandle,
        link: findableLink,
      })
      : translate("I'm on Spectra. Add me: {{link}}", { ns: 'profile', link: findableLink })
    : null
  const failureMessage = lastFailure?.failure === 'active_contact_card'
    ? translate('Your one-time contact card is still active.', { ns: 'profile' })
    : lastFailure?.failure === 'active_public_discovery'
      ? translate('Your account is already discoverable.', { ns: 'profile' })
      : lastFailure
        ? translate('Something went wrong. Please try again.', { ns: 'errors' })
        : shareError

  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      const loadProfile = async () => {
        const identity = getIdentity()
        if (!identity) return
        const profile = await ensureOwnContactProfile(identity.id)
        if (cancelled) return
        setAvatarUrl(profile.avatarDataUri ?? null)
        setSharedDisplayName(profile.displayName ?? null)
      }
      const loadVisibility = async () => {
        if (!wallet?.address) return
        const next = spectreMode ? 'private' : await readDiscoveryVisibility(wallet.address)
        if (cancelled) return
        setVisibility(next)
        if (next === 'findable' && !spectreMode) {
          void ensureActiveDiscoveryRent()
        }
      }
      void loadProfile().catch(() => undefined)
      void loadVisibility().catch(() => undefined)
      void verifyRestoredOneTimeContactCard().catch(() => undefined)
      return () => {
        cancelled = true
      }
    }, [spectreMode, wallet?.address])
  )

  const handleCreateOneTimeCard = useCallback(() => {
    const identity = getIdentity()
    if (!identity || !wallet) {
      setShareError(translate('Chat identity is not ready yet.', { ns: 'profile' }))
      return
    }
    setShareError(null)
    void startOneTimeContactCardCreation().catch(() => undefined)
  }, [wallet])

  const handlePublishPublicLease = useCallback(() => {
    const identity = getIdentity()
    if (!identity || !wallet) {
      setShareError(translate('Chat identity is not ready yet.', { ns: 'profile' }))
      return
    }
    setShareError(null)
    void startPublicDiscoveryPublication().catch(() => undefined)
  }, [wallet])

  const handleVisibilityChange = useCallback(async (next: DiscoveryVisibility) => {
    if (!wallet?.address || spectreMode || next === visibility) return
    setShareError(null)
    setVisibility(next)
    await writeDiscoveryVisibility(wallet.address, next)
    if (next === 'private') {
      try {
        await unpublishActiveDiscovery()
      } catch {
        setShareError(translate('Could not hide your account from lookup.', { ns: 'profile' }))
      }
      return
    }
    void ensureActiveDiscoveryRent()
  }, [spectreMode, visibility, wallet?.address])

  return (
    <View className="flex-1 bg-background">
      <View
        className="flex-row items-center px-4 py-3"
        style={{ paddingTop: insets.top }}
      >
        <Pressable onPress={() => router.back()} className="p-2 -ml-2">
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <Text className="flex-1 text-xl font-bold text-text text-center mr-10">
          {translate('My QR Code', { ns: 'profile' })}
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 items-center gap-6 pt-4 pb-8"
        contentContainerStyle={{ flexGrow: 1 }}
      >
        {!spectreMode ? (
          <View className="w-full max-w-[320px] bg-surface rounded-2xl p-1 flex-row">
            <Pressable
              testID="discovery-visibility-findable"
              onPress={() => void handleVisibilityChange('findable')}
              className="flex-1 py-2 rounded-xl items-center"
              style={visibility === 'findable' ? { backgroundColor: colors.primary } : undefined}
            >
              <Text className={visibility === 'findable' ? 'text-onPrimary font-semibold' : 'text-text'}>
                {translate('Findable', { ns: 'profile' })}
              </Text>
            </Pressable>
            <Pressable
              testID="discovery-visibility-private"
              onPress={() => void handleVisibilityChange('private')}
              className="flex-1 py-2 rounded-xl items-center"
              style={visibility === 'private' ? { backgroundColor: colors.primary } : undefined}
            >
              <Text className={visibility === 'private' ? 'text-onPrimary font-semibold' : 'text-text'}>
                {translate('Private', { ns: 'profile' })}
              </Text>
            </Pressable>
          </View>
        ) : null}

        <View className="w-full max-w-[320px] bg-surface rounded-2xl px-4 py-3 flex-row items-center">
          <View className="flex-1 mr-3">
            <Text className="text-text font-medium">
              {translate('Show VDF progress', { ns: 'profile' })}
            </Text>
            <Text className="text-text-muted text-xs mt-0.5">
              {translate('Proofs still run in the background when this is off.', { ns: 'profile' })}
            </Text>
          </View>
          <Switch
            testID="vdf-banner-visibility"
            value={vdfBannerVisible}
            onValueChange={(next) => {
              void setVdfBannerVisible(next)
            }}
            trackColor={{ false: colors.borderLight, true: colors.primary }}
            thumbColor="white"
          />
        </View>

        <ContactCardQrPreview
          invite={qrPayload}
          viewShotRef={viewShotRef}
          avatarUrl={avatarUrl}
          displayName={sharedDisplayName || wallet?.displayName}
        />

        <ContactCardShareActions
          invite={qrPayload}
          shareMessage={shareMessage}
          viewShotRef={viewShotRef}
        />

        <Text className="text-text-muted text-sm text-center max-w-[280px]">
          {spectreMode
            ? translate('Spectre accounts are not listed for address lookup.', { ns: 'profile' })
            : visibility === 'findable'
              ? translate('People with your EXO address can find you while you open Spectra at least once a week.', {
                ns: 'profile',
              })
              : translate('Your account is hidden from address lookup unless you publish for 5 minutes.', {
                ns: 'profile',
              })}
        </Text>

        {visibility === 'findable' && livePublicDiscovery ? (
          <Text className="text-text-muted text-sm text-center">
            {translate('Findable by EXO address until this listing expires.', { ns: 'profile' })}
          </Text>
        ) : null}

        <Button
          variant="primary"
          size="lg"
          onPress={handleCreateOneTimeCard}
          disabled={isPublishing}
        >
          {isPublishing && activity?.operation === 'contact_card'
            ? translate('Preparing secure contact card…', { ns: 'profile' })
            : translate('Create one-time contact card', { ns: 'profile' })}
        </Button>

        {visibility === 'private' || spectreMode ? (
          <Button
            variant="secondary"
            size="lg"
            onPress={handlePublishPublicLease}
            disabled={isPublishing || livePublicDiscovery}
          >
            {translate('Publish for 5 minutes', { ns: 'profile' })}
          </Button>
        ) : null}

        {visibility === 'private' && livePublicDiscovery && (
          <Text className="text-text-muted text-sm text-center">
            {translate('Your account is discoverable for 5 minutes.', { ns: 'profile' })}
          </Text>
        )}
        {failureMessage && (
          <Text className="text-error text-sm text-center">{failureMessage}</Text>
        )}

        <Text className="text-text-muted text-sm text-center max-w-[280px]">
          {translate('A one-time contact card expires after one hour and can be used once.', {
            ns: 'profile',
          })}
        </Text>
      </ScrollView>
    </View>
  )
}
