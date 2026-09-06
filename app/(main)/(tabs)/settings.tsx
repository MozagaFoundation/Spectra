/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { View, Text, ScrollView, Pressable, Alert, InteractionManager, Modal } from 'react-native'
import { useGuardedRouter } from '@/hooks/useGuardedRouter'
import { useTranslation } from 'react-i18next'
import { Archive, Shield, ChevronRight, ChevronDown, ChevronUp, LogOut, Trash2, QrCode, Palette, HelpCircle, CheckCircle, Gauge } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import { Avatar } from '@/components/common'
import { AccountRemovalFlow } from '@/components/settings/AccountRemovalFlow'
import { PrivacyConnectivitySettings } from '@/components/settings/PrivacyConnectivitySettings'
import { SpectreSetupFlow } from '@/components/settings/SpectreSetupFlow'
import { useAccountReadinessStore, useAuthStore, useExoAccountNotificationStore, useWalletStore } from '@/store'
import { useSpectreStore } from '@/store/spectreStore'
import { translate } from '@/lib/i18n'
import { formatAddress } from '@/lib/utils'
import { lockActiveSession } from '@/services/security/dataProtection'
import { activateChatPersona } from '@/services/chat/personaSwitch'
import { ensureOwnContactProfile } from '@/services/chat/contactProfile'
import { getIdentity } from '@/services/quantumChat'
import { getRootExoWallet } from '@/services/wallet/transparentAccounts'
import { useThemeColors } from '@/lib/theme'
import { getRuntimeAppVersion } from '@/lib/appMetadata'
import { getErrorDisplayMessage } from '@/lib/errorDisplay'
import { isVdfCalibrationBuild } from '@/services/security/vdfCalibration'

interface SettingsItemProps {
  icon: React.ComponentType<{ size: number; color: string }>
  title: string
  subtitle?: string
  onPress: () => void
  danger?: boolean
  disabled?: boolean
}

function SettingsItem({ icon: Icon, title, subtitle, onPress, danger, disabled }: SettingsItemProps) {
  const colors = useThemeColors()
  const { t } = useTranslation('settings')
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      className="bg-surface rounded-2xl p-4 active:bg-surface-hover"
      style={{ opacity: disabled ? 0.55 : 1 }}
    >
      <View className="flex-row items-center gap-4">
        <View
          className="w-10 h-10 rounded-xl items-center justify-center"
          style={{ backgroundColor: danger ? colors.error + '26' : colors.primary + '26' }}
        >
          <Icon size={20} color={danger ? colors.error : colors.primary} />
        </View>
        <View className="flex-1">
          <Text className={`font-medium ${danger ? 'text-error' : 'text-text'}`}>
            {t(title)}
          </Text>
          {subtitle && (
            <Text className="text-text-muted text-sm">
              {t(subtitle)}
            </Text>
          )}
        </View>
        {!disabled ? <ChevronRight size={20} color={colors.textMuted} /> : null}
      </View>
    </Pressable>
  )
}

export default function SettingsScreen() {
  const router = useGuardedRouter()
  const insets = useSafeAreaInsets()
  const colors = useThemeColors()
  const { t } = useTranslation(['settings', 'common', 'contacts', 'profile'])
  const appVersion = getRuntimeAppVersion()
  const showVdfCalibration = isVdfCalibrationBuild()
  
  const exoAddress = useAuthStore((state) => state.exoAddress)
  const wallet = useWalletStore((state) => state.wallet)
  const wallets = useWalletStore((state) => state.wallets)
  const activeWalletId = useWalletStore((state) => state.activeWalletId)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [switchingWalletId, setSwitchingWalletId] = useState<string | null>(null)
  const [showOtherAccounts, setShowOtherAccounts] = useState(false)
  const [spectreSetupVisible, setSpectreSetupVisible] = useState(false)
  const showReadinessBanner = useAccountReadinessStore((s) => s.show)
  const normalWallets = wallets.filter((entry) => entry.spectreMode !== true)
  const rootWallet = getRootExoWallet(wallets)
  const unreadWalletAddresses = useExoAccountNotificationStore((state) => state.unreadWalletAddresses)
  const hydrateExoNotificationBadges = useExoAccountNotificationStore((state) => state.hydrate)
  const spectreEnabled = useSpectreStore((state) => state.enabled)
  const showExoAccounts = !spectreEnabled && wallet?.spectreMode !== true
  const unreadWalletSet = useMemo(() => new Set(unreadWalletAddresses), [unreadWalletAddresses])
  const activeWallet = normalWallets.find(
    (entry) => entry.id === activeWalletId || entry.address === wallet?.address,
  ) ?? normalWallets[0]
  const otherWallets = normalWallets.filter((entry) => entry.id !== activeWallet?.id)
  const hasUnreadInactiveAccount = showExoAccounts && otherWallets.some(
    (entry) => unreadWalletSet.has(entry.address),
  )
  const getLocalizedWalletDisplayName = useCallback(
    (displayName: string | null | undefined, fallback: 'Post-Quantum Account' | 'EXO Account') => {
      if (displayName === 'Post-Quantum Account') {
        return t('Post-Quantum Account', { ns: 'profile' })
      }
      if (displayName === 'EXO Account') {
        return t('EXO Account', { ns: 'contacts' })
      }
      return displayName || t(fallback, { ns: fallback === 'EXO Account' ? 'contacts' : 'profile' })
    },
    [t],
  )
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      hydrateExoNotificationBadges().catch((error) => {
        console.warn('Failed to load EXO account notification badges:', error)
      })
    })
    return () => task.cancel()
  }, [hydrateExoNotificationBadges])
  
  useFocusEffect(
    React.useCallback(() => {
      let cancelled = false
      const task = InteractionManager.runAfterInteractions(() => {
        const loadAvatar = async () => {
          const identity = getIdentity()
          if (!identity) return
          const profile = await ensureOwnContactProfile(identity.id)
          if (!cancelled) setAvatarUrl(profile.avatarDataUri ?? null)
        }
        void loadAvatar().catch(() => undefined)
      })
      return () => {
        cancelled = true
        task.cancel()
      }
    }, [])
  )
  
  const handleLock = () => {
    Alert.alert(
      translate('Lock Account', { ns: 'settings' }),
      translate('Are you sure you want to lock your account? You will need your PIN to unlock it again.'),
      [
        { text: translate('Cancel'), style: 'cancel' },
        {
          text: translate('Lock'),
          style: 'destructive',
          onPress: async () => {
            await lockActiveSession()
            router.replace('/(auth)/unlock')
          },
        },
      ]
    )
  }

  const handleSwitchWallet = async (walletId: string) => {
    if (walletId === activeWalletId || switchingWalletId) return
    setSwitchingWalletId(walletId)

    try {
      await activateChatPersona(walletId, { verifyCloudBinding: false })
      const targetWallet = wallets.find((w) => w.id === walletId)
      if (targetWallet) {
        showReadinessBanner(targetWallet, rootWallet ?? null)
      }
      setSwitchingWalletId(null)
    } catch (error) {
      setSwitchingWalletId(null)
      Alert.alert(
        translate('Could not switch EXO account'),
        getErrorDisplayMessage(error),
      )
    }
  }

  const closeSpectreSetup = useCallback(() => {
    setSpectreSetupVisible(false)
  }, [])
  const openSpectreSetup = useCallback(() => {
    setSpectreSetupVisible(true)
  }, [])

  const renderAccountRow = (entry: (typeof normalWallets)[number]) => {
    const isActive = entry.id === activeWalletId || entry.address === wallet?.address
    const isSwitching = switchingWalletId === entry.id
    const isRoot = rootWallet?.id === entry.id
    const hasUnread = !isActive && unreadWalletSet.has(entry.address)

    return (
      <Pressable
        key={entry.id}
        onPress={() => handleSwitchWallet(entry.id)}
        disabled={isActive || Boolean(switchingWalletId)}
        className="flex-row items-center gap-3 rounded-xl p-3"
        style={{
          backgroundColor: isActive ? colors.primary + '1a' : colors.background,
          borderWidth: 1,
          borderColor: isActive ? colors.primary : colors.border,
        }}
      >
        <Avatar
          name={getLocalizedWalletDisplayName(entry.displayName, 'EXO Account')}
          size="sm"
        />
        <View className="flex-1">
          <Text className="text-text font-medium">
            {getLocalizedWalletDisplayName(entry.displayName, 'EXO Account')}
          </Text>
          <Text className="text-text-muted text-xs font-mono">
            {formatAddress(entry.address, 8)}
          </Text>
          {isRoot ? (
            <Text className="text-xs mt-0.5" style={{ color: colors.primary }}>
              {t('Root', { ns: 'settings' })}
            </Text>
          ) : null}
        </View>
        {isActive ? (
          <View className="flex-row items-center gap-1">
            <CheckCircle size={15} color={colors.primary} />
            <Text className="text-xs font-semibold" style={{ color: colors.primary }}>
              {t('Active', { ns: 'common' })}
            </Text>
          </View>
        ) : (
          <View className="flex-row items-center gap-2">
            {hasUnread ? (
              <View
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: colors.primary }}
              />
            ) : null}
            <Text className="text-xs font-semibold" style={{ color: colors.textMuted }}>
              {isSwitching ? t('Switching...', { ns: 'common' }) : t('Use', { ns: 'common' })}
            </Text>
          </View>
        )}
      </Pressable>
    )
  }

  return (
    <AccountRemovalFlow>
      {({ requestAccountRemoval, isDeleting }) => (
        <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {spectreSetupVisible ? (
        <Modal
          visible
          animationType="slide"
          presentationStyle="fullScreen"
          statusBarTranslucent
          onRequestClose={closeSpectreSetup}
        >
          <SpectreSetupFlow onClose={closeSpectreSetup} />
        </Modal>
      ) : null}
      <ScrollView 
        className="flex-1" 
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
        showsVerticalScrollIndicator={false}
      >
        <Text className="text-2xl font-bold text-text mb-5">
          {t('Settings', { ns: 'settings' })}
        </Text>
        
        <Pressable
          onPress={() => router.push('/(main)/profile')}
          className="bg-surface rounded-2xl p-4 active:bg-surface-hover mb-3"
        >
          <View className="flex-row items-center gap-4">
            <Avatar
              name={getLocalizedWalletDisplayName(wallet?.displayName, 'Post-Quantum Account') || t('User', { ns: 'profile' })}
              imageUrl={avatarUrl}
              size="lg"
              previewable
            />
            <View className="flex-1">
              <Text className="text-text font-semibold text-lg">
                {getLocalizedWalletDisplayName(wallet?.displayName, 'Post-Quantum Account')}
              </Text>
              <Text className="text-text-muted text-sm font-mono">
                {formatAddress(exoAddress || '', 8)}
              </Text>
            </View>
            <ChevronRight size={20} color={colors.textMuted} />
          </View>
        </Pressable>
        
        <Pressable
          onPress={() => router.push('/(main)/profile/qr-code')}
          className="bg-surface rounded-2xl p-4 active:bg-surface-hover"
        >
          <View className="flex-row items-center gap-4">
            <View
              className="w-10 h-10 rounded-xl items-center justify-center"
              style={{ backgroundColor: colors.primary + '26' }}
            >
              <QrCode size={20} color={colors.primary} />
            </View>
            <View className="flex-1">
              <Text className="text-text font-medium">
                {t('My QR Code', { ns: 'profile' })}
              </Text>
              <Text className="text-text-muted text-sm">
                {t('Share your Post-Quantum Address', { ns: 'profile' })}
              </Text>
            </View>
            <ChevronRight size={20} color={colors.textMuted} />
          </View>
        </Pressable>

        {showExoAccounts ? (
          <View className="mt-6 gap-3">
            <Text className="text-text-secondary text-sm font-medium ml-1 mb-1">
              {t('EXO Accounts', { ns: 'settings' })}
            </Text>

            <View className="bg-surface rounded-2xl p-3 gap-2">
              {activeWallet ? renderAccountRow(activeWallet) : null}

              {otherWallets.length > 0 ? (
                <>
                  <Pressable
                    onPress={() => setShowOtherAccounts((value) => !value)}
                    className="flex-row items-center justify-between rounded-xl px-3 py-2.5"
                    style={{ backgroundColor: colors.background }}
                  >
                    <Text className="text-text-secondary text-sm font-medium">
                      {showOtherAccounts
                        ? t('Hide other accounts', { ns: 'settings' })
                        : t('Show other accounts', { ns: 'settings' })}
                    </Text>
                    <View className="flex-row items-center gap-2">
                      {!showOtherAccounts && hasUnreadInactiveAccount ? (
                        <View
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: colors.primary }}
                        />
                      ) : null}
                      <View
                        className="rounded-full px-2 py-0.5"
                        style={{ backgroundColor: colors.primary + '26' }}
                      >
                        <Text className="text-xs font-semibold" style={{ color: colors.primary }}>
                          {otherWallets.length}
                        </Text>
                      </View>
                      {showOtherAccounts ? (
                        <ChevronUp size={18} color={colors.textMuted} />
                      ) : (
                        <ChevronDown size={18} color={colors.textMuted} />
                      )}
                    </View>
                  </Pressable>

                  {showOtherAccounts ? otherWallets.map((entry) => renderAccountRow(entry)) : null}
                </>
              ) : null}
            </View>
          </View>
        ) : null}
        
        <View className="mt-6 gap-3">
          <Text className="text-text-secondary text-sm font-medium ml-1 mb-1">
            {t('Appearance', { ns: 'settings' })}
          </Text>
          <SettingsItem
            icon={Palette}
            title="Appearance"
            subtitle="Theme, font size, language"
            onPress={() => router.push('/(main)/settings/appearance')}
          />
        </View>
        
        <View className="mt-6 gap-3">
          <Text className="text-text-secondary text-sm font-medium ml-1 mb-1">
            {t('Security', { ns: 'settings' })}
          </Text>
          <SettingsItem
            icon={Shield}
            title="Security Settings"
            subtitle="PIN, biometrics, auto-lock"
            onPress={() => router.push('/(main)/settings/security')}
          />
          <PrivacyConnectivitySettings onOpenSpectreSetup={openSpectreSetup} />
          <SettingsItem
            icon={Archive}
            title={t('Contact Archive', { ns: 'settings' })}
            subtitle={spectreEnabled
              ? t('Disabled by Spectre Mode', { ns: 'settings' })
              : t('Export and import encrypted contacts', { ns: 'settings' })}
            onPress={() => router.push('/(main)/settings/contact-archive')}
            disabled={spectreEnabled}
          />
          {showVdfCalibration ? (
            <SettingsItem
              icon={Gauge}
              title="VDF Calibration"
              subtitle="Internal release benchmark"
              onPress={() => router.push('/(main)/settings/vdf-calibration')}
            />
          ) : null}
        </View>
        
        <View className="mt-6 gap-3">
          <SettingsItem
            icon={HelpCircle}
            title="Help & About"
            subtitle={translate('Version {{version}}', { version: appVersion })}
            onPress={() => router.push('/(main)/settings/about')}
          />
        </View>
        
        <View className="mt-6 gap-3">
          <SettingsItem
            icon={LogOut}
            title="Lock Account"
            subtitle="Lock and return to PIN screen"
            onPress={handleLock}
            danger
          />
          <SettingsItem
            icon={Trash2}
            title="Log Out"
            subtitle="Permanently delete this device and account"
            onPress={requestAccountRemoval}
            danger
            disabled={isDeleting}
          />
        </View>
      </ScrollView>
        </View>
      )}
    </AccountRemovalFlow>
  )
}
