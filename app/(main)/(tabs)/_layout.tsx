/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { View, Text, ScrollView, Pressable, Platform, StyleSheet } from 'react-native'
import { Tabs } from 'expo-router'
import { BlurView } from 'expo-blur'
import { MessageSquare, Users, Settings, Wallet, Landmark } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { isSameAccountStorageScope } from '@/lib/accountScope'
import { useAuthStore } from '@/store/authStore'
import { useChatStore } from '@/store/chatStore'
import { useGroupChatStore } from '@/store/groupChatStore'
import { useSpectreStore } from '@/store/spectreStore'
import { useWalletStore } from '@/store/walletStore'
import { isSpectrePolicyActive } from '@/lib/spectrePolicy'
import { useWalletTransferNotificationStore } from '@/store/walletTransferNotificationStore'
import { translate } from '@/lib/i18n'
import { useResolvedThemeVariant, useThemeColors } from '@/lib/theme'
import { getErrorDisplayMessage, shouldShowErrorDetails } from '@/lib/errorDisplay'
import {
  markNavigationFocused,
  markNavigationStart,
  type PerformanceRouteClass,
} from '@/lib/performanceMetrics'
import { deriveTabBadgeCounts } from '@/services/notifications/badgeDomains'
import { syncGlobalBadge } from '@/services/notifications/badgeSync'

function GlassTabBackground() {
  const variant = useResolvedThemeVariant()
  const isDarkSurface = variant !== 'light'
  const blurTint: 'dark' | 'light' = isDarkSurface ? 'dark' : 'light'
  const tintOverlay = isDarkSurface
    ? 'rgba(12,12,12,0.42)'
    : 'rgba(250,250,250,0.55)'
  const topHighlight = isDarkSurface
    ? 'rgba(255,255,255,0.10)'
    : 'rgba(255,255,255,0.7)'
  const hairline = isDarkSurface ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)'

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <BlurView
        intensity={Platform.OS === 'ios' ? 55 : 90}
        tint={blurTint}
        experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
        style={StyleSheet.absoluteFill}
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: tintOverlay }]} />
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 1,
          backgroundColor: topHighlight,
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: 1,
          left: 0,
          right: 0,
          height: StyleSheet.hairlineWidth,
          backgroundColor: hairline,
        }}
      />
    </View>
  )
}

function ErrorBoundaryFallback({
  title,
  error,
  onRetry,
}: {
  title: string
  error: Error
  onRetry: () => void
}) {
  const colors = useThemeColors()

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
      }}
    >
      <Text style={{ color: colors.error, fontSize: 20, fontWeight: 'bold', marginBottom: 12 }}>
        {title}
      </Text>
      <ScrollView style={{ maxHeight: 400, width: '100%' }}>
        <Text style={{ color: colors.warning, fontSize: 14, marginBottom: 8 }}>
          {getErrorDisplayMessage(error)}
        </Text>
        {shouldShowErrorDetails() ? (
          <Text style={{ color: colors.textMuted, fontSize: 11 }}>
            {error.stack?.slice(0, 1500)}
          </Text>
        ) : null}
      </ScrollView>
      <Pressable
        onPress={onRetry}
        style={{
          marginTop: 20,
          backgroundColor: colors.primary,
          paddingHorizontal: 24,
          paddingVertical: 12,
          borderRadius: 12,
        }}
      >
        <Text style={{ color: colors.textOnPrimary, fontWeight: '600' }}>
          {translate('Retry')}
        </Text>
      </Pressable>
    </View>
  )
}

class TabsErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorBoundaryFallback
          title={translate('Tabs failed to load', { ns: 'navigation' })}
          error={this.state.error}
          onRetry={() => this.setState({ error: null })}
        />
      )
    }
    return this.props.children
  }
}

function TabsContent() {
  const activeWalletAddress = useWalletStore((state) => state.wallet?.address)
  const authenticatedAddress = useAuthStore((state) => state.exoAddress)
  const chatUnreadCount = useChatStore((state) => (
    isSameAccountStorageScope(state.storageScope, activeWalletAddress)
      ? state.totalUnreadCount
      : 0
  ))
  const groupUnreadCount = useGroupChatStore((state) => (
    state.groups.reduce((sum, group) => (
      isSameAccountStorageScope(group.localWalletAddress, activeWalletAddress)
        ? sum + (group.unreadCount || 0)
        : sum
    ), 0)
  ))
  const walletTransferUnreadCount = useWalletTransferNotificationStore((state) => (
    isSameAccountStorageScope(authenticatedAddress, activeWalletAddress)
      ? state.totalUnreadCount
      : 0
  ))
  const refreshWalletTransferUnread = useWalletTransferNotificationStore((state) => state.refresh)
  const spectreEnabled = useSpectreStore((state) => state.enabled)
  const walletIsSpectre = useWalletStore((state) => state.wallet?.spectreMode === true)
  const hideAgora = isSpectrePolicyActive({ enabled: spectreEnabled, walletIsSpectre })
  const colors = useThemeColors()
  const { t } = useTranslation('navigation')
  const tabBadges = deriveTabBadgeCounts({
    direct: chatUnreadCount,
    group: groupUnreadCount,
    walletTransfer: walletTransferUnreadCount,
  })

  React.useEffect(() => {
    void refreshWalletTransferUnread().then(() => syncGlobalBadge())
  }, [refreshWalletTransferUnread])
  
  return (
    <Tabs
      detachInactiveScreens
      screenListeners={({ navigation, route }) => {
        const routeClass: PerformanceRouteClass = route.name === 'crypto'
          ? 'wallets'
          : route.name === 'agora'
            ? 'agora'
            : route.name as PerformanceRouteClass
        return {
          tabPress: () => {
            if (!navigation.isFocused()) markNavigationStart(routeClass)
          },
          focus: () => markNavigationFocused(routeClass),
        }
      }}
      screenOptions={{
        headerShown: false,
        freezeOnBlur: true,
        lazy: true,
        sceneStyle: { backgroundColor: 'transparent' },
        tabBarStyle: {
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          height: 85,
          paddingTop: 10,
          paddingBottom: 25,
          elevation: 0,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -6 },
          shadowOpacity: 0.35,
          shadowRadius: 12,
        },
        tabBarBackground: () => <GlassTabBackground />,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '500',
        },
      }}
    >
      <Tabs.Screen
        name="chats"
        options={{
          title: t('Chats'),
          tabBarIcon: ({ color, size }) => (
            <MessageSquare size={size} color={color} />
          ),
          tabBarBadge: tabBadges.chats > 0 ? tabBadges.chats : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.tabBarBadge,
            fontSize: 10,
            minWidth: 18,
            height: 18,
          },
        }}
      />
      <Tabs.Screen
        name="contacts"
        options={{
          title: t('Contacts'),
          tabBarIcon: ({ color, size }) => (
            <Users size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="agora"
        options={{
          href: hideAgora ? null : undefined,
          title: t('Agora'),
          tabBarIcon: ({ color, size }) => (
            <Landmark size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="crypto"
        options={{
          title: t('Wallets'),
          tabBarIcon: ({ color, size }) => (
            <Wallet size={size} color={color} />
          ),
          tabBarBadge: tabBadges.wallets > 0 ? tabBadges.wallets : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.tabBarBadge,
            fontSize: 10,
            minWidth: 18,
            height: 18,
          },
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('Settings'),
          tabBarIcon: ({ color, size }) => (
            <Settings size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  )
}

export default function TabsLayout() {
  return (
    <TabsErrorBoundary>
      <TabsContent />
    </TabsErrorBoundary>
  )
}
