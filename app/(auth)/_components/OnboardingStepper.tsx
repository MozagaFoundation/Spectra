/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { View, Text } from 'react-native'
import { Check } from 'lucide-react-native'
import { useThemeColors } from '@/lib/theme'

interface OnboardingStepperProps {
  currentStep: number
  totalSteps?: 3 | 4
}

export function OnboardingStepper({ currentStep, totalSteps = 4 }: OnboardingStepperProps) {
  const colors = useThemeColors()
  const steps = Array.from({ length: totalSteps }, (_, index) => index + 1)

  return (
    <View className="flex-row items-center gap-2 my-4">
      {steps.map((step, index) => {
        const isComplete = step < currentStep
        const isActive = step === currentStep
        const fillColor = isComplete
          ? colors.success
          : isActive
            ? colors.primary
            : colors.surface
        const borderColor = isComplete || isActive ? fillColor : colors.border
        const labelColor = isComplete || isActive ? '#ffffff' : colors.textTertiary

        return (
          <React.Fragment key={step}>
            <View
              className="w-7 h-7 rounded-full items-center justify-center border"
              style={{ backgroundColor: fillColor, borderColor }}
            >
              {isComplete ? (
                <Check size={14} color="#ffffff" strokeWidth={3} />
              ) : (
                <Text className="text-[12px] font-bold" style={{ color: labelColor }}>
                  {step}
                </Text>
              )}
            </View>
            {index < steps.length - 1 && (
              <View
                className="flex-1 h-[2px] rounded-full"
                style={{
                  backgroundColor: step < currentStep ? colors.success : colors.border,
                }}
              />
            )}
          </React.Fragment>
        )
      })}
    </View>
  )
}
