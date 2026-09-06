/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Image } from 'expo-image'

import { useUIStore } from '@/store/uiStore'
import { useIsSpectreThemeActive } from '@/lib/theme'
import spectraDarkWallpaper from '@/assets/images/spectra/background-cyan-bottomright.png'
import spectraLightWallpaper from '@/assets/images/spectra/background-light-cyan-bottomright.png'

const SPECTRA_DARK_FLOOR = '#0c0c0c'
const SPECTRA_LIGHT_FLOOR = '#ffffff'

export function SpectraBackdrop() {
  const isDarkMode = useUIStore((state) => state.isDarkMode)
  const spectreThemeActive = useIsSpectreThemeActive()

  if (spectreThemeActive) return null

  const floor = isDarkMode ? SPECTRA_DARK_FLOOR : SPECTRA_LIGHT_FLOOR
  const wallpaper = isDarkMode ? spectraDarkWallpaper : spectraLightWallpaper

  return (
    <>
      <View
        style={[StyleSheet.absoluteFill, { backgroundColor: floor }]}
        pointerEvents="none"
      />
      <Image
        source={wallpaper}
        style={{ position: 'absolute', top: -2, left: -2, right: -2, bottom: -2 }}
        contentFit="cover"
        pointerEvents="none"
      />
    </>
  )
}
