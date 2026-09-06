/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useEffect, useState } from 'react'
import {
  AccessibilityInfo,
  ActivityIndicator,
  Pressable,
  Text,
  View,
} from 'react-native'
import { AlertTriangle, CheckCircle2 } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { translate } from '@/lib/i18n'
import { useThemeColors } from '@/lib/theme'
import {
  type VdfActivitySnapshot,
  useVdfActivityStore,
} from '@/store/vdfActivityStore'
import { useVdfBannerPreferenceStore } from '@/store/vdfBannerPreferenceStore'

interface VdfProgressBannerProps {
  includeTopInset?: boolean
}

function isTerminal(activity: VdfActivitySnapshot): boolean {
  return activity.phase === 'completed'
    || activity.phase === 'cancelled'
    || activity.phase === 'failed'
}

function isPersistentFailure(activity: VdfActivitySnapshot): boolean {
  return activity.phase === 'failed'
    && (
      activity.failure === 'native_unavailable'
      || activity.failure === 'deletion_cleanup_pending'
    )
}

function getAutoDismissDelayMs(activity: VdfActivitySnapshot): number | null {
  if (activity.phase === 'completed') return 1_200
  if (activity.phase === 'cancelled') return 800
  if (activity.phase === 'failed' && !isPersistentFailure(activity)) return 800
  return null
}

function getFailedTitle(activity: VdfActivitySnapshot): string {
  if (activity.failure === 'native_unavailable') {
    return translate('Native Rebuild Required', { ns: 'tor' })
  }
  if (activity.failure === 'deletion_cleanup_pending') {
    return translate('Account deletion needs attention', { ns: 'settings' })
  }
  switch (activity.action) {
    case 'claim_session_opk':
      return translate('Could not start this chat', { ns: 'settings' })
    case 'public_discovery':
    case 'extend_public_discovery':
      return translate('Could not update discovery', { ns: 'settings' })
    case 'contact_card':
      return translate('Could not create contact card', { ns: 'settings' })
    case 'wallet_admission':
    case 'wallet_index_activation':
      return translate('Secure access needs attention', { ns: 'settings' })
    default: {
      const _exhaustive: never = activity.action
      return translate('Secure access needs attention', { ns: 'settings' })
    }
  }
}

function getProgressPercent(activity: VdfActivitySnapshot): number | null {
  if (activity.totalIterations <= 0) return null
  return Math.min(100, Math.max(0, Math.round(
    (activity.completedIterations / activity.totalIterations) * 100,
  )))
}

function getRemainingSeconds(activity: VdfActivitySnapshot, now: number): number | null {
  if (activity.phase === 'waiting_for_server' && activity.notBeforeAt) {
    return Math.max(0, Math.ceil((activity.notBeforeAt - now) / 1_000))
  }
  if (
    (activity.phase === 'evaluating' || activity.phase === 'proving')
    && activity.iterationsPerSecond
    && activity.totalIterations > activity.completedIterations
  ) {
    return Math.max(0, Math.ceil(
      (activity.totalIterations - activity.completedIterations) / activity.iterationsPerSecond,
    ))
  }
  return null
}

function getActionTitle(activity: VdfActivitySnapshot): string {
  switch (activity.action) {
    case 'wallet_admission':
      return translate('Activating secure online access', { ns: 'settings' })
    case 'public_discovery':
      return translate('Publishing secure discovery', { ns: 'settings' })
    case 'extend_public_discovery':
      return translate('Keeping you findable', { ns: 'settings' })
    case 'claim_session_opk':
      return translate('Starting a secure chat', { ns: 'settings' })
    case 'contact_card':
      return translate('Creating one-time contact card', { ns: 'settings' })
    case 'wallet_index_activation':
      return translate('Activating wallet indexing', { ns: 'settings' })
    default: {
      const _exhaustive: never = activity.action
      return getPhaseTitle(activity)
    }
  }
}

function getPhaseTitle(activity: VdfActivitySnapshot): string {
  switch (activity.phase) {
    case 'evaluating':
      return translate('Computing VDF proof', { ns: 'settings' })
    case 'proving':
      return translate('Generating VDF proof', { ns: 'settings' })
    case 'waiting_for_server':
      return activity.retrying
        ? translate('Retrying server verification', { ns: 'settings' })
        : translate('Waiting for server verification', { ns: 'settings' })
    case 'submitting':
      return translate('Verifying VDF proof', { ns: 'settings' })
    case 'completed':
      if (activity.action === 'extend_public_discovery' || activity.action === 'public_discovery') {
        return translate('Keeping you findable', { ns: 'settings' })
      }
      if (activity.action === 'claim_session_opk') {
        return translate('Starting a secure chat', { ns: 'settings' })
      }
      return translate('Secure online access is ready', { ns: 'settings' })
    case 'cancelled':
      return translate('VDF work was cancelled', { ns: 'settings' })
    case 'failed':
      return getFailedTitle(activity)
  }
}

function getRentStepLabel(activity: VdfActivitySnapshot): string | null {
  if (
    activity.action !== 'extend_public_discovery'
    || activity.stepCompleted === null
    || activity.stepTotal === null
    || activity.stepTotal <= 0
  ) {
    return null
  }
  return translate('VDFs completed {{completed}}/{{total}}', {
    completed: activity.stepCompleted,
    total: activity.stepTotal,
    ns: 'settings',
  })
}

function getTerminalDetail(activity: VdfActivitySnapshot): string {
  if (activity.phase === 'completed') {
    return getRentStepLabel(activity)
      ?? translate('Your secure online access is active.', { ns: 'settings' })
  }
  if (activity.phase === 'cancelled') {
    return translate('No proof was submitted.', { ns: 'settings' })
  }
  if (activity.failure === 'deletion_cleanup_pending') {
    return translate(
      'Backend cleanup is still running. You can retry this status check safely.',
      { ns: 'settings' },
    )
  }
  return translate(
    'This proof could not be completed. Check your connection and try again.',
    { ns: 'settings' },
  )
}

function getStatusDetail(
  activity: VdfActivitySnapshot,
  progressPercent: number | null,
  remainingSeconds: number | null,
): string {
  if (isTerminal(activity)) {
    return getTerminalDetail(activity)
  }

  const parts: string[] = []
  const rentStep = getRentStepLabel(activity)
  if (rentStep) parts.push(rentStep)
  if (progressPercent !== null) {
    parts.push(translate('{{percent}}% complete', { percent: progressPercent, ns: 'settings' }))
  }
  if (remainingSeconds !== null) {
    parts.push(translate('~{{count}}s remaining', { count: remainingSeconds, ns: 'settings' }))
  }
  if (parts.length > 0) return parts.join(' · ')
  return getPhaseTitle(activity)
}

export function VdfProgressBanner({ includeTopInset = true }: VdfProgressBannerProps) {
  const insets = useSafeAreaInsets()
  const colors = useThemeColors()
  const activity = useVdfActivityStore((state) => state.activity)
  const cancelActivity = useVdfActivityStore((state) => state.cancelActivity)
  const dismiss = useVdfActivityStore((state) => state.dismiss)
  const visible = useVdfBannerPreferenceStore((state) => state.visible)
  const [now, setNow] = useState(Date.now())

  const terminal = activity ? isTerminal(activity) : false
  const progressPercent = activity ? getProgressPercent(activity) : null
  const remainingSeconds = activity ? getRemainingSeconds(activity, now) : null
  const title = activity
    ? (terminal ? getPhaseTitle(activity) : getActionTitle(activity))
    : null
  const detail = activity
    ? getStatusDetail(activity, progressPercent, remainingSeconds)
    : null

  useEffect(() => {
    if (!visible || !activity?.activityId || terminal) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(timer)
  }, [activity?.activityId, terminal, visible])

  useEffect(() => {
    if (!activity) return
    const delay = getAutoDismissDelayMs(activity)
    if (delay === null) return
    const timer = setTimeout(dismiss, delay)
    return () => clearTimeout(timer)
  }, [activity, dismiss])

  useEffect(() => {
    if (!visible || !title) return
    AccessibilityInfo.announceForAccessibility(title)
  }, [activity?.activityId, activity?.phase, activity?.retrying, title, visible])

  if (!visible || !activity || !title || !detail) return null

  const isError = activity.phase === 'failed'
  const isComplete = activity.phase === 'completed'
  const canCancel = activity.canCancel && !terminal
  const canDismiss = isError
  const accentColor = isError
    ? colors.error
    : isComplete
      ? colors.success
      : colors.primary

  return (
    <View style={{ backgroundColor: 'transparent' }}>
      <View
        className="px-4"
        style={{
          paddingTop: includeTopInset ? insets.top + 8 : 0,
          paddingBottom: 12,
        }}
      >
        <View
          className="rounded-2xl px-4 py-3"
          style={{
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: accentColor + '33',
          }}
        >
          <View className="flex-row items-center">
            <View
              className="w-9 h-9 rounded-full items-center justify-center"
              style={{ backgroundColor: accentColor + '18' }}
            >
              {isError ? (
                <AlertTriangle size={18} color={accentColor} />
              ) : isComplete ? (
                <CheckCircle2 size={18} color={accentColor} />
              ) : (
                <ActivityIndicator size="small" color={accentColor} />
              )}
            </View>

            <View className="flex-1 ml-3">
              <Text
                className="font-semibold"
                numberOfLines={1}
                style={{ color: isError ? colors.error : colors.text }}
              >
                {title}
              </Text>
              <Text
                className="text-xs mt-0.5"
                numberOfLines={2}
                style={{ color: accentColor }}
              >
                {detail}
              </Text>
            </View>

            {canCancel ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={translate('Cancel secure work', { ns: 'settings' })}
                disabled={activity.isCancelling}
                onPress={cancelActivity}
                className="ml-3 px-2 py-1 rounded-full items-center justify-center active:opacity-70"
                style={{
                  backgroundColor: colors.background,
                  opacity: activity.isCancelling ? 0.6 : 1,
                }}
              >
                {activity.isCancelling ? (
                  <ActivityIndicator size="small" color={colors.textSecondary} />
                ) : (
                  <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                    {translate('Cancel', { ns: 'common' })}
                  </Text>
                )}
              </Pressable>
            ) : canDismiss ? (
              <Pressable
                testID="vdf-banner-dismiss"
                accessibilityRole="button"
                accessibilityLabel={translate('Dismiss', { ns: 'settings' })}
                onPress={dismiss}
                className="ml-3 px-2 py-1 rounded-full items-center justify-center active:opacity-70"
                style={{ backgroundColor: colors.background }}
              >
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                  {translate('Dismiss', { ns: 'settings' })}
                </Text>
              </Pressable>
            ) : null}
          </View>

          {progressPercent !== null && !terminal ? (
            <View
              style={{
                height: 4,
                borderRadius: 2,
                backgroundColor: colors.background,
                marginTop: 10,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  width: `${progressPercent}%`,
                  height: '100%',
                  borderRadius: 2,
                  backgroundColor: colors.primary,
                }}
              />
            </View>
          ) : null}
        </View>
      </View>
    </View>
  )
}
