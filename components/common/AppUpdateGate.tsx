import React, { useEffect, useState } from 'react'
import {
  AccessibilityInfo,
  ActivityIndicator,
  AppState,
  Modal,
  Pressable,
  Text,
  View,
} from 'react-native'
import { Download, RefreshCw, ShieldAlert } from 'lucide-react-native'

import { SpectraBackdrop } from '@/components/common/SpectraBackdrop'
import { translate } from '@/lib/i18n'
import { useThemeColors } from '@/lib/theme'
import { refreshAppUpdatePolicy } from '@/services/backend/appUpdatePolicy'
import { openExternalUrl } from '@/services/tor/externalLinkPolicy'
import { useAppUpdateStore } from '@/store/appUpdateStore'

export function AppUpdateGate() {
  const colors = useThemeColors()
  const policy = useAppUpdateStore((state) => state.policy)
  const dismissedLatestVersion = useAppUpdateStore((state) => state.dismissedLatestVersion)
  const checking = useAppUpdateStore((state) => state.checking)
  const dismissAvailableUpdate = useAppUpdateStore((state) => state.dismissAvailableUpdate)
  const [openingStore, setOpeningStore] = useState(false)
  const [privacyHidden, setPrivacyHidden] = useState(AppState.currentState !== 'active')

  const required = policy?.updateRequired === true
  const available = policy?.updateAvailable === true
  const visible = Boolean(
    policy && (required || (available && dismissedLatestVersion !== policy.latestVersion)),
  )

  useEffect(() => {
    if (!visible || !policy) return
    AccessibilityInfo.announceForAccessibility(
      translate(required ? 'Update required' : 'Update available', { ns: 'common' }),
    )
  }, [policy, required, visible])

  useEffect(() => {
    if (!visible) {
      setOpeningStore(false)
    }
  }, [visible])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setPrivacyHidden(state !== 'active')
    })
    return () => subscription.remove()
  }, [])

  if (!policy) return null

  const openStore = async () => {
    if (openingStore) return
    setOpeningStore(true)
    try {
      await openExternalUrl(policy.storeUrl)
    } finally {
      setOpeningStore(false)
    }
  }

  const retry = () => {
    void refreshAppUpdatePolicy().catch(() => undefined)
  }

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      statusBarTranslucent
      onRequestClose={required ? () => {} : dismissAvailableUpdate}
    >
      {privacyHidden ? (
        <View style={{ flex: 1, backgroundColor: '#0c0c0c' }} />
      ) : (
        <View
          accessibilityViewIsModal
          style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24, backgroundColor: colors.backgroundSecondary }}
        >
          <SpectraBackdrop />
        <View
          style={{
            alignItems: 'center',
            borderRadius: 20,
            backgroundColor: colors.surface,
            padding: 24,
          }}
        >
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: (required ? colors.error : colors.primary) + '20',
            }}
          >
            {required ? (
              <ShieldAlert size={36} color={colors.error} />
            ) : (
              <Download size={36} color={colors.primary} />
            )}
          </View>
          <Text
            style={{
              marginTop: 18,
              color: required ? colors.error : colors.text,
              fontSize: 21,
              fontWeight: '700',
              textAlign: 'center',
            }}
          >
            {translate(required ? 'Update required' : 'Update available', { ns: 'common' })}
          </Text>
          <Text
            style={{
              marginTop: 10,
              color: colors.textSecondary,
              fontSize: 14,
              lineHeight: 20,
              textAlign: 'center',
            }}
          >
            {translate(
              required
                ? 'This version of Spectra is no longer supported. Update to continue using secure services.'
                : 'A newer version of Spectra is available. Update to get the latest features and fixes.',
              { ns: 'common' },
            )}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={translate('Update Spectra', { ns: 'common' })}
            disabled={openingStore}
            onPress={openStore}
            style={{
              marginTop: 24,
              minWidth: 190,
              alignItems: 'center',
              borderRadius: 14,
              backgroundColor: colors.primary,
              paddingHorizontal: 24,
              paddingVertical: 14,
              opacity: openingStore ? 0.65 : 1,
            }}
          >
            {openingStore ? (
              <ActivityIndicator color={colors.textOnPrimary} />
            ) : (
              <Text style={{ color: colors.textOnPrimary, fontWeight: '700' }}>
                {translate('Update Spectra', { ns: 'common' })}
              </Text>
            )}
          </Pressable>
          {required ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={translate('Retry', { ns: 'common' })}
              disabled={checking}
              onPress={retry}
              style={{
                marginTop: 12,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingHorizontal: 12,
                paddingVertical: 8,
                opacity: checking ? 0.65 : 1,
              }}
            >
              {checking ? (
                <ActivityIndicator size="small" color={colors.textSecondary} />
              ) : (
                <RefreshCw size={16} color={colors.textSecondary} />
              )}
              <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>
                {translate('Retry', { ns: 'common' })}
              </Text>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={translate('Later', { ns: 'common' })}
              onPress={dismissAvailableUpdate}
              style={{ marginTop: 12, paddingHorizontal: 12, paddingVertical: 8 }}
            >
              <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>
                {translate('Later', { ns: 'common' })}
              </Text>
            </Pressable>
          )}
        </View>
        </View>
      )}
    </Modal>
  )
}
