/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { Image } from 'expo-image'
import { translate } from '@/lib/i18n'

const spectraLogo = require('@/assets/images/spectra/isotipo-full-color.svg')

interface SpectraLogoMarkProps {
  size?: number
}

export function SpectraLogoMark({ size = 88 }: SpectraLogoMarkProps) {
  return (
    <Image
      source={spectraLogo}
      style={{ width: size, height: size }}
      contentFit="contain"
      accessibilityLabel={translate('Spectra logo')}
    />
  )
}
