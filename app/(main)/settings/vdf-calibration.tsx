/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md
 */

import React, { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { Redirect, type Href } from 'expo-router'
import { ChevronLeft, Gauge } from 'lucide-react-native'

import { Card } from '@/components/ui'
import { useGuardedRouter } from '@/hooks/useGuardedRouter'
import { translate } from '@/lib/i18n'
import { useThemeColors } from '@/lib/theme'
import {
  calibrateVdfOnDevice,
  getVdfCalibrationModulus,
  isVdfCalibrationBuild,
  type VdfCalibrationResult,
} from '@/services/security/vdfCalibration'

function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value)
}

export default function VdfCalibrationScreen() {
  const router = useGuardedRouter()
  const colors = useThemeColors()
  const controllerRef = useRef<AbortController | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [result, setResult] = useState<VdfCalibrationResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const modulusHex = getVdfCalibrationModulus()

  useEffect(() => () => {
    controllerRef.current?.abort()
  }, [])

  if (!isVdfCalibrationBuild()) {
    return <Redirect href={'/(main)/(tabs)/settings' as Href} />
  }

  const runCalibration = async () => {
    if (!modulusHex || isRunning) return
    const controller = new AbortController()
    controllerRef.current = controller
    setIsRunning(true)
    setError(null)
    try {
      setResult(await calibrateVdfOnDevice(modulusHex, controller.signal))
    } catch (cause) {
      if ((cause as Error).name !== 'AbortError') {
        setError(translate('Calibration failed. Confirm that this is a native release build.'))
      }
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null
      setIsRunning(false)
    }
  }

  return (
    <View className="flex-1 bg-background" style={{ backgroundColor: colors.background }}>
      <View className="flex-row items-center px-4 pt-12 pb-3">
        <Pressable onPress={() => router.back()} className="p-2 -ml-2">
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <Text className="flex-1 text-xl font-bold text-text text-center mr-10">
          {translate('VDF calibration')}
        </Text>
      </View>
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 20, gap: 16 }}>
        <Card className="p-5 gap-3">
          <View className="flex-row items-center gap-3">
            <Gauge size={22} color={colors.primary} />
            <Text className="text-text font-semibold">{translate('Local-only benchmark')}</Text>
          </View>
          <Text className="text-text-muted text-sm leading-5">
            {translate('This runs a native sequential-squaring sample on this device. It does not upload, store, or identify the device.')}
          </Text>
          <Text className="text-text-muted text-sm leading-5">
            {translate('Use the candidate from the slowest supported release device, then confirm it with one full VDF solve before deployment.')}
          </Text>
        </Card>

        {!modulusHex ? (
          <Card className="p-5">
            <Text className="text-error font-medium">{translate('No calibration modulus is configured.')}</Text>
            <Text className="text-text-muted text-sm mt-2 leading-5">
              {translate('Rebuild with EXPO_PUBLIC_VDF_CALIBRATION_MODULUS_HEX set to the intended public RSA modulus.')}
            </Text>
          </Card>
        ) : (
          <Card className="p-5 gap-3">
            <Text className="text-text font-semibold">{translate('Sample')}</Text>
            <Text className="text-text-muted text-sm">
              {translate('250,000 complete VDF iterations; target solve time: 12 seconds.')}
            </Text>
            {result ? (
              <View className="gap-1 mt-2">
                <Text className="text-text">
                  {translate('Sample: {{value}} ms', { value: formatNumber(result.elapsedMs, 1) })}
                </Text>
                <Text className="text-text">
                  {translate('Rate: {{value}} iterations/second', {
                    value: formatNumber(result.iterationsPerSecond, 1),
                  })}
                </Text>
                <Text className="text-text font-semibold">
                  {translate('Candidate: {{value}} iterations', {
                    value: formatNumber(result.candidateIterations),
                  })}
                </Text>
              </View>
            ) : null}
            {error ? <Text className="text-error text-sm">{error}</Text> : null}
            <Pressable
              onPress={isRunning ? () => controllerRef.current?.abort() : runCalibration}
              className="rounded-xl py-3 items-center mt-2"
              style={{ backgroundColor: isRunning ? colors.error : colors.primary }}
            >
              {isRunning ? (
                <View className="flex-row items-center gap-2">
                  <ActivityIndicator color={colors.textOnPrimary} />
                  <Text style={{ color: colors.textOnPrimary }} className="font-semibold">
                    {translate('Cancel calibration')}
                  </Text>
                </View>
              ) : (
                <Text style={{ color: colors.textOnPrimary }} className="font-semibold">
                  {translate('Run calibration')}
                </Text>
              )}
            </Pressable>
          </Card>
        )}
      </ScrollView>
    </View>
  )
}
