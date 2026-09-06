/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useCallback, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import {
  AlertTriangle,
  Bluetooth,
  ChevronDown,
  ChevronUp,
  Globe,
  Radio,
  Shield,
  Wifi,
  Zap,
} from 'lucide-react-native'
import * as Haptics from 'expo-haptics'

import { TorStatusBadge } from '@/components/common/TorStatusBadge'
import { SettingRow } from '@/components/settings/SettingRow'
import { TorConnectionModal } from '@/components/tor/TorConnectionModal'
import { Card } from '@/components/ui'
import { useGuardedRouter } from '@/hooks/useGuardedRouter'
import { getErrorDisplayMessage } from '@/lib/errorDisplay'
import { translate } from '@/lib/i18n'
import { useThemeColors } from '@/lib/theme'
import { resetAuthCooldowns } from '@/services/backend/session'
import * as bleMesh from '@/services/bluetooth'
import { syncBundleServerAccessToken } from '@/services/quantumChat'
import {
  disableSpectreMode,
  setSpectreBluetoothExitOverride,
} from '@/services/security/spectreMode'
import { startTor, stopTor, useTorStore } from '@/services/tor'
import { useChatStore } from '@/store'
import { useBluetoothStore } from '@/store/bluetoothStore'
import { useSpectreAccessStore } from '@/store/spectreAccessStore'
import { useSpectreStore } from '@/store/spectreStore'

function formatDuration(targetTimestampMs: number | null, nowMs: number): string {
  if (targetTimestampMs === null || targetTimestampMs <= nowMs) {
    return translate('Available now', { ns: 'settings' })
  }

  const totalSeconds = Math.max(0, Math.floor((targetTimestampMs - nowMs) / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

interface PrivacyConnectivitySettingsProps {
  onOpenSpectreSetup: () => void
}

export function PrivacyConnectivitySettings({
  onOpenSpectreSetup,
}: PrivacyConnectivitySettingsProps) {
  const router = useGuardedRouter()
  const colors = useThemeColors()
  const spectreLoaded = useSpectreStore((state) => state.isLoaded)
  const spectreEnabled = useSpectreStore((state) => state.enabled)
  const spectreApplying = useSpectreStore((state) => state.isApplying)
  const spectreAccountMode = useSpectreStore((state) => state.spectreAccountMode)
  const spectreWalletId = useSpectreStore((state) => state.spectreWalletId)
  const chatInitializing = useChatStore((state) => state.isInitializing)
  const chatSyncing = useChatStore((state) => state.isSyncingMessages)
  const spectreAccess = useSpectreAccessStore((state) => state.access)
  const torEnabled = useTorStore((state) => state.enabled)
  const torError = useTorStore((state) => state.errorMessage)
  const setTorEnabled = useTorStore((state) => state.setEnabled)
  const bleEnabled = useBluetoothStore((state) => state.config.enabled)
  const bleStatus = useBluetoothStore((state) => state.status)
  const bleRelayEnabled = useBluetoothStore((state) => state.config.relayEnabled)
  const bleStoreForwardEnabled = useBluetoothStore((state) => state.config.storeForwardEnabled)
  const setBleEnabled = useBluetoothStore((state) => state.setEnabled)
  const setBleConfig = useBluetoothStore((state) => state.setConfig)

  const [networkPrivacyExpanded, setNetworkPrivacyExpanded] = useState(false)
  const [torModalVisible, setTorModalVisible] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const spectreWalletConfigured = Boolean(spectreWalletId)
  const currentSpectreExpiresAtMs = spectreAccess?.currentSpectreExpiresAt
    ? Date.parse(spectreAccess.currentSpectreExpiresAt)
    : null
  const currentSpectreExpiryActive = Boolean(
    spectreEnabled
    && spectreAccess?.currentWalletIsSpectre
    && spectreAccess.currentSpectreIsEphemeral
    && currentSpectreExpiresAtMs !== null
    && nowMs < currentSpectreExpiresAtMs,
  )
  const spectreSettingsLocked = spectreEnabled || spectreApplying
  const spectreToggleDisabled = !spectreLoaded || spectreApplying
  const spectreModeSubtitle = spectreEnabled
    ? 'Maximum privacy mode is active. Managed protections cannot be changed individually.'
    : spectreWalletConfigured
      ? 'A Spectre wallet is already configured on this device.'
      : 'Create a separate Spectre wallet. Expendable wallets use one anonymous activation token every 24 hours.'
  const torConnectionSubtitle = spectreEnabled
    ? 'Required by Spectre Mode'
    : translate(
        'Routes supported Spectra network requests through Tor. Device-wide network routing is unchanged.',
        { ns: 'settings' },
      )

  useFocusEffect(useCallback(() => {
    if (!currentSpectreExpiryActive) return
    const timer = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [currentSpectreExpiryActive]))

  const handleSpectreToggle = async (enabled: boolean) => {
    if (spectreApplying) return
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)

    if (enabled) {
      Alert.alert(
        translate('Enable Spectre Mode', { ns: 'settings' }),
        translate(
          'Spectre disables calls and crypto actions; removes push tokens; forces Tor, duress PIN, fail-wipe, screenshot protection, and app switcher privacy; and defaults new messages to short disappearing timers.',
          { ns: 'settings' },
        ),
        [
          { text: translate('Cancel', { ns: 'common' }), style: 'cancel' },
          {
            text: translate('Enable Spectre Mode', { ns: 'settings' }),
            onPress: onOpenSpectreSetup,
          },
        ],
      )
      return
    }

    const restoreMessage = translate(
      'Your original wallet and managed privacy settings will be restored. Bluetooth Mesh will keep whatever state you chose while Spectre was active.',
      { ns: 'settings' },
    )
    const message = spectreAccountMode === 'expendable'
      ? `${restoreMessage}\n\n${translate('Because this Spectre account is expendable, its local data and wallet will be erased from this device.', {
          ns: 'settings',
        })}`
      : restoreMessage

    Alert.alert(
      translate('Disable Spectre Mode', { ns: 'settings' }),
      message,
      [
        { text: translate('Cancel', { ns: 'common' }), style: 'cancel' },
        {
          text: translate('Disable Spectre', { ns: 'settings' }),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await disableSpectreMode()
                await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
              } catch (error) {
                Alert.alert(
                  translate('Spectre Mode', { ns: 'settings' }),
                  getErrorDisplayMessage(error),
                  [{ text: translate('OK', { ns: 'settings' }) }],
                )
                await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
              }
            })()
          },
        },
      ],
    )
  }

  const handleConfirmEnableTor = async () => {
    try {
      await setTorEnabled(true)
      setTorModalVisible(true)
      const success = await startTor()
      if (success) {
        resetAuthCooldowns()
        syncBundleServerAccessToken()
      }
      setTorModalVisible(false)
    } catch (error) {
      useTorStore.setState({
        status: 'error',
        errorMessage: getErrorDisplayMessage(error),
      })
      setTorModalVisible(true)
    }
  }

  const handleTorToggle = async (enabled: boolean) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)

    if (enabled) {
      Alert.alert(
        translate('Enable Tor Mode', { ns: 'settings' }),
        translate(
          'Tor routes supported Spectra network requests only; device-wide network routing is unchanged.\n\nWhile Tor is active, calls are unavailable, messaging polls for updates, supported requests and media uploads can be slower, push registration is disabled, and links opened in other apps are outside Spectra’s Tor boundary. When Spectre Mode is off, Tor stays active for up to one hour in the background before stopping.\n\nDo you want to enable Tor mode?',
          { ns: 'settings' },
        ),
        [
          { text: translate('Cancel', { ns: 'common' }), style: 'cancel' },
          {
            text: translate('Enable Tor', { ns: 'settings' }),
            onPress: () => void handleConfirmEnableTor(),
          },
        ],
      )
      return
    }

    await setTorEnabled(false)
    await stopTor()
    resetAuthCooldowns()
    syncBundleServerAccessToken()
  }

  const applyBleEnabled = async (enabled: boolean) => {
    try {
      if (spectreEnabled) {
        await setSpectreBluetoothExitOverride(enabled)
      }
      await setBleEnabled(enabled)
      bleMesh.updateConfig({ enabled })
    } catch (error) {
      Alert.alert(
        translate('Enable Bluetooth Mesh', { ns: 'settings' }),
        getErrorDisplayMessage(error),
      )
    }
  }

  const handleBleToggle = async (enabled: boolean) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)

    if (enabled) {
      Alert.alert(
        translate('Enable Bluetooth Mesh', { ns: 'settings' }),
        translate(
          'Enable p2p messaging over Bluetooth when internet connectivity is unavailable.\n\nNearby contacts will appear with a "Nearby" label, allowing you to send messages directly over Bluetooth.\n\nYour existing internet and Tor-based messaging will continue to function normally.',
          { ns: 'settings' },
        ),
        [
          { text: translate('Cancel', { ns: 'common' }), style: 'cancel' },
          {
            text: translate('Enable', { ns: 'settings' }),
            onPress: () => applyBleEnabled(true),
          },
        ],
      )
      return
    }

    await applyBleEnabled(false)
  }

  const setRelayEnabled = (enabled: boolean) => {
    setBleConfig({ relayEnabled: enabled })
    bleMesh.updateConfig({ relayEnabled: enabled })
  }

  const setStoreForwardEnabled = (enabled: boolean) => {
    setBleConfig({ storeForwardEnabled: enabled })
    bleMesh.updateConfig({ storeForwardEnabled: enabled })
  }

  const navigateToTorBridges = () => {
    router.push('/(main)/settings/tor-bridges')
  }

  return (
    <>
      <Pressable
        testID="network-privacy-dropdown"
        accessibilityRole="button"
        accessibilityState={{ expanded: networkPrivacyExpanded }}
        onPress={() => setNetworkPrivacyExpanded((expanded) => !expanded)}
        className="bg-surface rounded-2xl p-4 active:bg-surface-hover"
      >
        <View className="flex-row items-center gap-4">
          <View
            className="w-10 h-10 rounded-xl items-center justify-center"
            style={{ backgroundColor: colors.primary + '26' }}
          >
            <Globe size={20} color={colors.primary} />
          </View>
          <View className="flex-1">
            <Text className="text-text font-medium">
              {translate('Network Privacy', { ns: 'settings' })}
            </Text>
            <Text className="text-text-muted text-sm">
              {[
                translate('Spectre Mode', { ns: 'settings' }),
                translate('Tor Connection', { ns: 'settings' }),
                translate('Tor Bridges', { ns: 'settings' }),
              ].join(' · ')}
            </Text>
          </View>
          <View className="flex-row items-center gap-2">
            <TorStatusBadge />
            {networkPrivacyExpanded ? (
              <ChevronUp size={20} color={colors.textMuted} />
            ) : (
              <ChevronDown size={20} color={colors.textMuted} />
            )}
          </View>
        </View>
      </Pressable>

      {networkPrivacyExpanded ? (
        <>
          <Card className="p-4 gap-4">
        <SettingRow
          icon={Shield}
          title="Spectre Mode"
          subtitle={spectreModeSubtitle}
          value={spectreEnabled}
          onValueChange={handleSpectreToggle}
          disabled={spectreToggleDisabled}
        />
        {currentSpectreExpiryActive ? (
          <View className="border-t border-border pt-4">
            <Text className="text-warning text-xs leading-5">
              {translate('This expendable Spectre wallet expires in {{time}} and will be removed from the server when the session closes or expires.', {
                ns: 'settings',
                time: formatDuration(currentSpectreExpiresAtMs, nowMs),
              })}
            </Text>
          </View>
        ) : null}
        {spectreEnabled && !spectreApplying && (chatInitializing || chatSyncing) ? (
          <View className="border-t border-border pt-4 flex-row items-center gap-3">
            <ActivityIndicator size="small" color={colors.primary} />
            <Text className="text-text-secondary text-sm flex-1">
              {translate('Spectre chats and contacts are still refreshing in the background.', {
                ns: 'settings',
              })}
            </Text>
          </View>
        ) : null}
      </Card>

      <Card className="p-4 gap-4">
        <SettingRow
          icon={Globe}
          title="Tor Connection"
          subtitle={torConnectionSubtitle}
          value={torEnabled}
          onValueChange={handleTorToggle}
          disabled={spectreSettingsLocked}
        />
        <View className="border-t border-border pt-4">
          <SettingRow
            icon={Wifi}
            title="Tor Bridges"
            subtitle="For regions where Tor access is restricted"
            onPress={navigateToTorBridges}
          />
        </View>
      </Card>

      {torEnabled ? (
        <Card className="p-3 border border-warning">
          <View className="flex-row gap-3">
            <AlertTriangle size={16} color={colors.warning} />
            <View className="flex-1">
              <Text className="text-text font-medium text-xs mb-1">
                {translate('Tor Mode Active', { ns: 'settings' })}
              </Text>
              <Text className="text-text-secondary text-xs leading-4">
                {translate('Calls are unavailable. Messages poll for updates. Supported requests can be slower.', {
                  ns: 'settings',
                })}
              </Text>
            </View>
          </View>
        </Card>
      ) : null}

      {torError ? (
        <Card className="p-3 border border-error">
          <View className="flex-row gap-3">
            <AlertTriangle size={16} color={colors.error} />
            <Text className="text-error text-xs flex-1 leading-4">
              {getErrorDisplayMessage(torError)}
            </Text>
          </View>
        </Card>
      ) : null}
        </>
      ) : null}

      <Card className="p-4 gap-4">
        <SettingRow
          icon={Bluetooth}
          title="Bluetooth Mesh Messaging"
          subtitle={spectreEnabled
            ? 'Disabled by default in Spectre Mode, but you can still choose to use it offline'
            : 'Enable message transmission over Bluetooth when offline'}
          value={bleEnabled}
          onValueChange={handleBleToggle}
          disabled={spectreApplying}
        />
        {bleEnabled ? (
          <>
            <View className="border-t border-border pt-4">
              <SettingRow
                icon={Radio}
                title="Relay Messages"
                subtitle="Help deliver messages for other nearby users"
                value={bleRelayEnabled}
                onValueChange={setRelayEnabled}
              />
            </View>
            <View className="border-t border-border pt-4">
              <SettingRow
                icon={Zap}
                title="Store & Forward"
                subtitle="Cache messages for offline contacts and deliver when they appear"
                value={bleStoreForwardEnabled}
                onValueChange={setStoreForwardEnabled}
              />
            </View>
          </>
        ) : null}
      </Card>

      {bleEnabled ? (
        <Card className="p-3 border border-primary/30">
          <View className="flex-row gap-3">
            <Bluetooth size={16} color={colors.primary} />
            <View className="flex-1">
              <Text className="text-text font-medium text-xs mb-1">
                {translate('Bluetooth Mesh Active', { ns: 'settings' })}
              </Text>
              <Text className="text-text-secondary text-xs leading-4">
                {translate('Messages are sent over the internet when available. When offline, nearby contacts can be reached via Bluetooth (up to ~100m per hop outdoors). Messages can relay through up to 5 devices, extending effective range to ~500m. All messages remain end-to-end encrypted regardless of transport.', {
                  ns: 'settings',
                })}
              </Text>
            </View>
          </View>
        </Card>
      ) : null}

      {bleEnabled && (bleStatus === 'bluetooth_off' || bleStatus === 'permission_denied') ? (
        <Card className="p-3 border border-error">
          <View className="flex-row gap-3">
            <AlertTriangle size={16} color={colors.error} />
            <Text className="text-error text-xs flex-1 leading-4">
              {bleStatus === 'bluetooth_off'
                ? translate('Bluetooth is turned off. Enable Bluetooth in your device settings to use mesh messaging.', {
                    ns: 'settings',
                  })
                : translate('Bluetooth permissions were denied. Grant Bluetooth permissions in your device settings.', {
                    ns: 'settings',
                  })}
            </Text>
          </View>
        </Card>
      ) : null}

      <TorConnectionModal
        visible={torModalVisible}
        onClose={() => setTorModalVisible(false)}
        onConfigureBridges={navigateToTorBridges}
      />
    </>
  )
}
