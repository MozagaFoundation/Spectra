/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import {
  ChevronLeft,
  Globe,
  Download,
  Trash2,
  AlertTriangle,
  CheckCircle,
  Info,
  Lock,
} from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import { Card } from '@/components/ui'
import { translate } from '@/lib/i18n'
import { useThemeColors } from '@/lib/theme'
import { getErrorDisplayMessage } from '@/lib/errorDisplay'
import {
  useTorStore,
  fetchBridgesFromMoat,
  applyTorBridgeConfiguration,
  isIPtProxyAvailable,
  acknowledgeSnowflakeBootstrapConsent,
  hasSnowflakeBootstrapConsent,
  type BridgeFetchRoute,
  type BridgeType,
} from '@/services/tor'
import { resetAuthCooldowns } from '@/services/backend/session'
import {
  reconcileQuantumChat,
  syncBundleServerAccessToken,
} from '@/services/quantumChat'

type BridgeOption = {
  id: BridgeType
  label: string
  description: string
  available: boolean
}

type LastSuccessfulBridgeFetch = {
  bridgeCount: number
  route: BridgeFetchRoute
  transport: BridgeType
}

const ptAvailable = isIPtProxyAvailable()

const BRIDGE_OPTIONS: BridgeOption[] = [
  {
    id: 'none',
    label: 'Direct Bridges',
    description:
      'Plain IP:PORT bridge relays. Works without transport plugins. Suitable for moderate censorship.',
    available: true,
  },
  {
    id: 'obfs4',
    label: 'obfs4',
    description: ptAvailable
      ? 'Obfuscated bridge traffic that evades deep packet inspection. The bridge sees your device IP and connection timing.'
      : 'Obfuscated bridge traffic. Requires a native rebuild with IPtProxy.',
    available: ptAvailable,
  },
  {
    id: 'snowflake',
    label: 'Snowflake',
    description: ptAvailable
      ? 'Uses WebRTC volunteer proxies. Requires acknowledgement because bootstrap infrastructure sees your device IP and timing.'
      : 'Uses WebRTC volunteer proxies. Requires a native rebuild with IPtProxy.',
    available: ptAvailable,
  },
  {
    id: 'webtunnel',
    label: 'WebTunnel',
    description: ptAvailable
      ? 'Disguises Tor as normal HTTPS traffic. The bridge sees your device IP and connection timing.'
      : 'Disguises Tor as HTTPS. Requires a native rebuild with IPtProxy.',
    available: ptAvailable,
  },
]

function logTorBridgeDebug(message: string): void {
  if (__DEV__) {
    console.log(`[TOR] UI: ${message}`)
  }
}

function logTorBridgeError(message: string, error?: unknown): void {
  if (__DEV__) {
    const detail = error instanceof Error ? getErrorDisplayMessage(error) : typeof error === 'string' ? error : null
    if (detail) {
      console.error(`[TOR] UI: ${message}: ${detail}`)
    } else {
      console.error(`[TOR] UI: ${message}`)
    }
  }
}

function describeUpcomingBridgeRoute(
  torEnabled: boolean,
  torStatus: string,
): { route: BridgeFetchRoute; message: string } {
  if (torEnabled && torStatus === 'connected') {
    return {
      route: 'tor',
      message: translate('Tor is already connected, so bridge requests will be sent through the active Tor circuit.'),
    }
  }

  if (torEnabled && torStatus === 'connecting') {
    return {
      route: 'tor',
      message: translate(
        'Tor is still connecting. Bridge requests remain blocked until a Tor circuit is available.',
      ),
    }
  }

  if (torEnabled) {
    return {
      route: 'tor',
      message: translate(
        'Tor is enabled but not connected. Disable Tor before fetching bootstrap bridges over the normal network.',
      ),
    }
  }

  return {
    route: 'clearnet',
    message: translate('Tor is disabled, so bridge requests will use the normal network.'),
  }
}

function buildBridgeFetchErrorMessage(
  error: string,
  route: BridgeFetchRoute,
): string {
  if (route === 'tor') {
    return translate('{{error}} This request was sent through Tor.', { error })
  }

  return (
    translate('{{error}} This request used the normal network while Tor was disabled.', { error }) +
    ' ' +
    translate('Some networks block the Tor Project bridge distributor even when Tor relay traffic still works.')
  )
}

function buildBridgeFetchSuccessMessage(
  bridgeCount: number,
  transport: BridgeType,
  route: BridgeFetchRoute,
): string {
  const routeMessage =
    route === 'tor'
      ? translate('Fetched through Tor.')
      : translate('Fetched over the normal network while Tor was disabled.')

  return translate('{{bridgeCount}} {{transport}} bridges loaded. {{routeMessage}}', {
    bridgeCount,
    transport,
    routeMessage,
  })
}

function describeCompletedBridgeRoute(route: BridgeFetchRoute): {
  badgeLabel: string
  message: string
} {
  if (route === 'tor') {
    return {
      badgeLabel: 'TOR',
      message: translate('This fetch went through the active Tor circuit.'),
    }
  }

  return {
    badgeLabel: 'DIRECT',
    message: translate('This fetch used the normal network while Tor was disabled.'),
  }
}

export default function TorBridgesScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const colors = useThemeColors()
  useTranslation()

  const bridges = useTorStore((s) => s.bridges)
  const bridgeType = useTorStore((s) => s.bridgeType)
  const torEnabled = useTorStore((s) => s.enabled)
  const torStatus = useTorStore((s) => s.status)

  const [manualInput, setManualInput] = useState('')
  const [selectedType, setSelectedType] = useState<BridgeType>(
    bridgeType !== 'none' ? bridgeType : 'none'
  )
  const [fetching, setFetching] = useState(false)
  const [applying, setApplying] = useState(false)
  const [applyingMessage, setApplyingMessage] = useState<string | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [lastSuccessfulFetch, setLastSuccessfulFetch] = useState<LastSuccessfulBridgeFetch | null>(null)
  const upcomingBridgeRoute = describeUpcomingBridgeRoute(torEnabled, torStatus)
  const bridgeControlsDisabled = fetching || applying

  const resyncBackendRoute = async () => {
    resetAuthCooldowns()
    syncBundleServerAccessToken()
    await reconcileQuantumChat({
      fullResync: true,
      restartRealtime: true,
      reason: 'manual_recovery',
      suppressLocalNotifications: true,
    })
  }

  const ensureSnowflakeConsent = async (nextBridgeType: BridgeType): Promise<boolean> => {
    if (
      nextBridgeType !== 'snowflake'
      || await hasSnowflakeBootstrapConsent()
    ) {
      return true
    }

    return new Promise((resolve) => {
      Alert.alert(
        translate('Snowflake bootstrap privacy notice'),
        translate(
          'Snowflake uses WebRTC bootstrap infrastructure, including broker, STUN, and volunteer proxy services. Those services can observe your device IP address and connection timing. Tor protects traffic after a circuit is established, but it cannot hide this bootstrap connection.',
        ),
        [
          {
            text: translate('Cancel'),
            style: 'cancel',
            onPress: () => resolve(false),
          },
          {
            text: translate('I understand'),
            onPress: () => {
              void acknowledgeSnowflakeBootstrapConsent()
                .then(() => resolve(true))
                .catch((error) => {
                  Alert.alert(translate('Bridge Update Failed'), getErrorDisplayMessage(error))
                  resolve(false)
                })
            },
          },
        ],
      )
    })
  }

  const applyBridgeConfiguration = async (
    nextBridges: string[],
    nextBridgeType: BridgeType,
  ): Promise<boolean> => {
    if (!(await ensureSnowflakeConsent(nextBridgeType))) {
      return false
    }
    setApplying(true)
    setApplyingMessage(
      nextBridges.length === 0
        ? translate('Applying direct Tor…')
        : translate('Applying bridge configuration…'),
    )
    try {
      const result = await applyTorBridgeConfiguration(nextBridges, nextBridgeType)
      if (result.routeReady) {
        await resyncBackendRoute().catch((error) => {
          logTorBridgeError('Backend route resync failed', error)
        })
      }
      if (result.success) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        return true
      }

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      if (result.outcome === 'restored') {
        Alert.alert(
          translate('Previous Bridges Restored'),
          translate(
            'Tor could not connect with the requested configuration, so the previous working bridges were restored. {{error}}',
            { error: result.error },
          ),
        )
      } else {
        Alert.alert(
          translate('Tor Connection Failed'),
          translate(
            'Neither the requested configuration nor the previous bridges could connect. Tor remains enabled and backend traffic stays blocked. {{error}}',
            { error: result.error },
          ),
        )
      }
      return false
    } catch (error) {
      logTorBridgeError('Bridge configuration failed', error)
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      Alert.alert(translate('Bridge Update Failed'), getErrorDisplayMessage(error))
      return false
    } finally {
      setApplying(false)
      setApplyingMessage(null)
    }
  }

  const handleFetchBridges = async () => {
    if (selectedType === 'none') {
      Alert.alert(
        translate('Select a Transport'),
        translate(
          'To fetch bridges automatically, select a transport type first (obfs4, Snowflake, or WebTunnel). For direct bridges without a transport, enter IP:PORT lines manually below.',
        ),
      )
      return
    }

    logTorBridgeDebug(`Requesting bridges from Moat (transport=${selectedType})`)
    setFetching(true)
    setFetchError(null)

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)

    const result = await fetchBridgesFromMoat(selectedType as 'obfs4' | 'snowflake' | 'webtunnel')

    if (result.error) {
      logTorBridgeError('Bridge fetch failed', result.error)
      setFetchError(buildBridgeFetchErrorMessage(result.error, result.route))
      setFetching(false)
      return
    }

    if (result.bridges.length === 0) {
      logTorBridgeDebug('Moat returned 0 bridges')
      setFetchError(
        buildBridgeFetchErrorMessage(
          translate('No {{transport}} bridges available right now. Try a different transport or enter bridges manually.', {
            transport: selectedType,
          }),
          result.route,
        )
      )
      setFetching(false)
      return
    }

    const finalBridges = result.bridges
      .map((b) => b.trim())
      .filter((b) => b.length > 0)

    logTorBridgeDebug(`Loaded ${finalBridges.length} ${selectedType} bridge lines`)

    setFetching(false)
    const applied = await applyBridgeConfiguration(finalBridges, selectedType)
    if (applied) {
      setLastSuccessfulFetch({
        bridgeCount: finalBridges.length,
        route: result.route,
        transport: selectedType,
      })
      Alert.alert(
        translate(torEnabled ? 'Bridges Applied' : 'Bridges Saved'),
        buildBridgeFetchSuccessMessage(finalBridges.length, selectedType, result.route),
      )
    }
  }

  const handleManualSave = async () => {
    const lines = manualInput
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)

    if (lines.length === 0) {
      Alert.alert(translate('No Bridges'), translate('Please paste at least one bridge line.'))
      return
    }

    logTorBridgeDebug(`Saving ${lines.length} manual bridges (type=${selectedType})`)
    const applied = await applyBridgeConfiguration(lines, selectedType)
    if (applied) {
      setLastSuccessfulFetch(null)
      setManualInput('')
      Alert.alert(
        translate(torEnabled ? 'Bridges Applied' : 'Bridges Saved'),
        translate(
          torEnabled
            ? '{{count}} bridges were verified and are active.'
            : '{{count}} bridges were saved for the next Tor connection.',
          { count: lines.length },
        ),
      )
    }
  }

  const handleClearBridges = () => {
    Alert.alert(
      translate('Clear Bridges'),
      translate('Remove all configured bridges? Tor will connect directly without bridges.'),
      [
        { text: translate('Cancel'), style: 'cancel' },
        {
          text: translate('Clear'),
          style: 'destructive',
          onPress: async () => {
            logTorBridgeDebug('Clearing all bridges')
            const applied = await applyBridgeConfiguration([], 'none')
            if (applied) {
              setLastSuccessfulFetch(null)
              setSelectedType('none')
              await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
              Alert.alert(
                translate(torEnabled ? 'Direct Tor Active' : 'Bridges Cleared'),
                translate(
                  torEnabled
                    ? 'Tor reconnected directly. Backend traffic is using the verified Tor route.'
                    : 'Tor will connect directly the next time it starts.',
                ),
              )
            }
          },
        },
      ]
    )
  }

  return (
    <View className="flex-1 bg-background" style={{ backgroundColor: colors.background }}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View
          className="flex-row items-center px-4 py-3"
          style={{ paddingTop: insets.top }}
        >
          <Pressable onPress={() => router.back()} className="p-2 -ml-2">
            <ChevronLeft size={24} color={colors.text} />
          </Pressable>
          <Text className="flex-1 text-xl font-bold text-text text-center mr-8">
            {translate('Tor Bridges')}
          </Text>
        </View>

        <View className="px-5 gap-6">
          {applyingMessage ? (
            <Card className="p-4 border border-border">
              <View className="flex-row items-center gap-3">
                <ActivityIndicator size="small" color={colors.primary} />
                <Text className="text-text font-medium">{applyingMessage}</Text>
              </View>
            </Card>
          ) : null}
          <Card className="p-4 border border-border">
            <View className="flex-row gap-3">
              <Info size={18} color={colors.primary} />
              <View className="flex-1">
                <Text className="text-text font-medium mb-1">{translate('What are Tor bridges?')}</Text>
                <Text className="text-text-secondary text-sm leading-5">
                  {translate(
                    'Bridges are secret entry points to the Tor network. In countries where direct Tor connections are blocked, bridges can help you connect by routing through unlisted relays.',
                  )}
                </Text>
              </View>
            </View>
          </Card>

          <View
            className="rounded-2xl border"
            style={{ borderColor: ptAvailable ? colors.success + '80' : colors.warning + '80' }}
          >
            <Card className="p-4">
              <View className="flex-row gap-3">
                {ptAvailable ? (
                  <CheckCircle size={18} color={colors.success} />
                ) : (
                  <AlertTriangle size={18} color={colors.warning} />
                )}
                <View className="flex-1">
                  <Text className="text-text font-medium mb-1">
                    {translate(ptAvailable ? 'Pluggable Transports Available' : 'Limited Bridge Support')}
                  </Text>
                  <Text className="text-text-secondary text-sm leading-5">
                    {ptAvailable
                      ? translate(
                          'obfs4, Snowflake, and WebTunnel transports are available. Select a transport type below and fetch bridges for your region.',
                        )
                      : translate(
                          'Only direct (plain IP:PORT) bridges are supported in this build. Run a native rebuild with IPtProxy to enable obfs4, Snowflake, and WebTunnel.',
                        )}
                  </Text>
                </View>
              </View>
            </Card>
          </View>

          <View className="gap-3">
            <Text className="text-text-secondary text-sm font-medium ml-1">
              {translate('Bridge Type')}
            </Text>
            {BRIDGE_OPTIONS.map((bt) => {
              const isSelected = selectedType === bt.id
              const unavailable = !bt.available
              const disabled = unavailable || bridgeControlsDisabled

              return (
                <Pressable
                  key={bt.id}
                  disabled={bridgeControlsDisabled}
                  onPress={() => {
                    if (unavailable) {
                      Alert.alert(
                        translate('Native Rebuild Required'),
                        translate('{{label}} transport requires a native rebuild with IPtProxy. Run "npx pod-install" and rebuild the app.', {
                          label: bt.label,
                        })
                      )
                      return
                    }
                    setSelectedType(bt.id)
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                  }}
                  className="active:opacity-70"
                  style={{ opacity: disabled ? 0.5 : 1 }}
                >
                  <View
                    className="rounded-2xl"
                    style={
                      isSelected && !disabled
                        ? { borderWidth: 1.5, borderColor: colors.primary }
                        : undefined
                    }
                  >
                    <Card className="p-4">
                      <View className="flex-row items-center gap-3">
                      <View
                        className="w-8 h-8 rounded-lg items-center justify-center"
                        style={{
                          backgroundColor:
                            isSelected && !disabled
                              ? colors.primary + '26'
                              : colors.textMuted + '15',
                        }}
                      >
                        {unavailable ? (
                          <Lock size={16} color={colors.textMuted} />
                        ) : (
                          <Globe
                            size={16}
                            color={
                              isSelected ? colors.primary : colors.textMuted
                            }
                          />
                        )}
                      </View>
                      <View className="flex-1">
                        <View className="flex-row items-center gap-2">
                          <Text
                            className="font-medium"
                            style={{
                              color:
                                isSelected && !disabled
                                  ? colors.primary
                                  : colors.text,
                            }}
                          >
                            {translate(bt.label)}
                          </Text>
                          {unavailable && (
                            <View
                              className="px-2 py-0.5 rounded"
                              style={{ backgroundColor: colors.warning + '30' }}
                            >
                              <Text
                                className="text-xs font-medium"
                                style={{ color: colors.warning }}
                              >
                                {translate('Needs Rebuild')}
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text className="text-text-muted text-xs mt-0.5">
                          {translate(bt.description)}
                        </Text>
                      </View>
                      {isSelected && !disabled && (
                        <CheckCircle size={20} color={colors.primary} />
                      )}
                      </View>
                    </Card>
                  </View>
                </Pressable>
              )
            })}
          </View>

          <View className="gap-3">
            <Text className="text-text-secondary text-sm font-medium ml-1">
              {translate('Automatic Bridge Fetch')}
            </Text>
            <Card className="p-4 gap-3">
              <Text className="text-text-secondary text-sm leading-5">
                {translate("Request bridges from the Tor Project's Circumvention Settings API.")}{' '}
                {selectedType === 'none'
                  ? translate('Select a transport type above to enable automatic fetching.')
                  : translate('Will fetch {{transport}} bridges tailored to your region, with builtin bridges as fallback.', {
                      transport: selectedType,
                    })}
              </Text>
              <Text className="text-text-muted text-xs leading-5">
                {upcomingBridgeRoute.message}
              </Text>
              {lastSuccessfulFetch && (
                <View
                  className="rounded-xl border p-3 gap-2"
                  style={{
                    borderColor:
                      lastSuccessfulFetch.route === 'tor'
                        ? colors.success + '66'
                        : colors.warning + '66',
                    backgroundColor:
                      lastSuccessfulFetch.route === 'tor'
                        ? colors.success + '12'
                        : colors.warning + '12',
                  }}
                >
                  <View className="flex-row items-center justify-between gap-3">
                    <View className="flex-1">
                      <Text
                        className="text-xs font-semibold uppercase"
                        style={{
                          color:
                            lastSuccessfulFetch.route === 'tor'
                              ? colors.success
                              : colors.warning,
                        }}
                      >
                        {translate('Last successful fetch')}
                      </Text>
                      <Text className="text-text text-sm font-medium mt-1">
                        {translate('{{count}} {{transport}} bridge{{suffix}}', {
                          count: lastSuccessfulFetch.bridgeCount,
                          transport: lastSuccessfulFetch.transport,
                          suffix: lastSuccessfulFetch.bridgeCount === 1 ? '' : 's',
                        })}
                      </Text>
                      <Text className="text-text-secondary text-xs mt-1 leading-5">
                        {describeCompletedBridgeRoute(lastSuccessfulFetch.route).message}
                      </Text>
                    </View>
                    <View
                      className="px-2.5 py-1 rounded-full"
                      style={{
                        backgroundColor:
                          lastSuccessfulFetch.route === 'tor'
                            ? colors.success + '20'
                            : colors.warning + '20',
                      }}
                    >
                      <Text
                        className="text-[10px] font-semibold"
                        style={{
                          color:
                            lastSuccessfulFetch.route === 'tor'
                              ? colors.success
                              : colors.warning,
                        }}
                      >
                        {describeCompletedBridgeRoute(lastSuccessfulFetch.route).badgeLabel}
                      </Text>
                    </View>
                  </View>
                </View>
              )}
              <Pressable
                onPress={handleFetchBridges}
                disabled={bridgeControlsDisabled}
                className="bg-primary rounded-xl py-3 items-center active:opacity-80"
                style={{ opacity: bridgeControlsDisabled ? 0.6 : 1 }}
              >
                {fetching ? (
                  <View className="flex-row items-center gap-2">
                    <ActivityIndicator size="small" color={colors.textOnPrimary} />
                    <Text className="text-onPrimary font-semibold">
                      {translate('Fetching bridges...')}
                    </Text>
                  </View>
                ) : (
                  <View className="flex-row items-center gap-2">
                    <Download size={18} color="white" />
                    <Text className="text-white font-semibold">
                      {translate('Request Bridges')}
                    </Text>
                  </View>
                )}
              </Pressable>
              {fetchError && (
                <View className="flex-row gap-2 mt-1">
                  <AlertTriangle size={14} color={colors.error} />
                  <Text className="text-error text-xs flex-1">{fetchError}</Text>
                </View>
              )}
            </Card>
          </View>

          <View className="gap-3">
            <Text className="text-text-secondary text-sm font-medium ml-1">
              {translate('Manual Bridge Entry')}
            </Text>
            <Card className="p-4 gap-3">
              <Text className="text-text-secondary text-sm">
                {translate('Paste bridge lines from bridges.torproject.org (one per line).')}{' '}
                {selectedType !== 'none'
                  ? translate('Include the full {{transport}} bridge line with all parameters.', {
                      transport: selectedType,
                    })
                  : translate('Use direct IP:PORT format.')}
              </Text>
              <TextInput
                value={manualInput}
                onChangeText={setManualInput}
                editable={!bridgeControlsDisabled}
                placeholder={`198.51.100.1:443 ABCDEF1234567890...\n203.0.113.2:9001 1234567890ABCDEF...`}
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
                className="bg-background rounded-xl p-3 text-text text-sm"
                style={{
                  borderWidth: 1,
                  borderColor: colors.borderLight,
                  minHeight: 100,
                }}
              />
              <Pressable
                onPress={handleManualSave}
                disabled={!manualInput.trim() || bridgeControlsDisabled}
                className="bg-primary rounded-xl py-3 items-center active:opacity-80"
                style={{ opacity: manualInput.trim() && !bridgeControlsDisabled ? 1 : 0.4 }}
              >
                <Text className="text-onPrimary font-semibold">{translate('Save Bridges')}</Text>
              </Pressable>
            </Card>
          </View>

          {bridges.length > 0 && (
            <View className="gap-3">
              <Text className="text-text-secondary text-sm font-medium ml-1">
                {translate('Active Bridges')}
              </Text>
              <Card className="p-4 gap-3">
                <View className="flex-row items-center gap-2">
                  <CheckCircle size={16} color="#10b981" />
                  <Text className="text-text font-medium">
                    {translate('{{count}} bridge{{suffix}} configured{{bridgeTypeLabel}}', {
                      count: bridges.length,
                      suffix: bridges.length !== 1 ? 's' : '',
                      configuredSuffix: bridges.length !== 1 ? 's' : '',
                      bridgeTypeLabel: bridgeType !== 'none' ? ` (${bridgeType})` : '',
                    })}
                  </Text>
                </View>
                {bridges.slice(0, 3).map((b, i) => (
                  <Text
                    key={i}
                    className="text-text-muted text-xs font-mono"
                    numberOfLines={1}
                  >
                    {b.slice(0, 70)}...
                  </Text>
                ))}
                {bridges.length > 3 && (
                  <Text className="text-text-muted text-xs">
                    {translate('+{{count}} more', { count: bridges.length - 3 })}
                  </Text>
                )}
                <Pressable
                  onPress={handleClearBridges}
                  disabled={bridgeControlsDisabled}
                  className="flex-row items-center gap-2 mt-2 active:opacity-70"
                  style={{ opacity: bridgeControlsDisabled ? 0.5 : 1 }}
                >
                  <Trash2 size={16} color={colors.error} />
                  <Text className="text-error text-sm font-medium">
                    {translate('Clear All Bridges')}
                  </Text>
                </Pressable>
              </Card>
            </View>
          )}

          <Card className="p-4 border border-border">
            <Text className="text-text font-medium mb-2">{translate('Bridge Recommendations')}</Text>
            <View className="gap-2">
              <Text className="text-text-secondary text-sm">
                <Text className="font-medium text-text">{translate('Moderate filtering:')}</Text>{' '}
                {translate('obfs4 is recommended. Direct bridges may also work.')}
              </Text>
              <Text className="text-text-secondary text-sm">
                <Text className="font-medium text-text">{translate('Deep packet inspection:')}</Text>{' '}
                {translate('Snowflake or WebTunnel recommended. Direct bridges are blocked by DPI.')}
              </Text>
              <Text className="text-text-secondary text-sm">
                <Text className="font-medium text-text">{translate('Aggressive blocking:')}</Text>{' '}
                {translate('Snowflake recommended. obfs4 bridges may be probed and blocked.')}
              </Text>
              <Text className="text-text-secondary text-sm">
                <Text className="font-medium text-text">{translate('Restricted networks:')}</Text>{' '}
                {translate('Snowflake or WebTunnel recommended.')}
              </Text>
              <Text className="text-text-secondary text-sm">
                <Text className="font-medium text-text">{translate('Other regions:')}</Text>{' '}
                {translate('Try connecting without bridges first. Add direct bridges or obfs4 if blocked.')}
              </Text>
            </View>
          </Card>
        </View>
      </ScrollView>
    </View>
  )
}
