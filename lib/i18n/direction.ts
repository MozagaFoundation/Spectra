/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { useMemo } from 'react'
import type { TextStyle, ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { getCurrentLanguage } from './index'
import { isRtlLanguage, normalizeAppLanguageCode } from './languages'

export type WritingDirection = 'ltr' | 'rtl'

export function isCurrentLanguageRtl(): boolean {
  return isRtlLanguage(getCurrentLanguage())
}

export function useIsCurrentLanguageRtl(): boolean {
  const { i18n } = useTranslation()
  const currentLanguage = normalizeAppLanguageCode(i18n.resolvedLanguage) ?? getCurrentLanguage()

  return useMemo(() => isRtlLanguage(currentLanguage), [currentLanguage])
}

export function getWritingDirection(isRtl: boolean = isCurrentLanguageRtl()): WritingDirection {
  return isRtl ? 'rtl' : 'ltr'
}

export function getDirectionalTextStyle(isRtl: boolean = isCurrentLanguageRtl()): TextStyle {
  return {
    textAlign: isRtl ? 'right' : 'left',
    writingDirection: getWritingDirection(isRtl),
  }
}

export function getStartBorderStyle(
  color: string,
  width: number,
  isRtl: boolean = isCurrentLanguageRtl(),
): ViewStyle {
  return isRtl
    ? { borderRightWidth: width, borderRightColor: color }
    : { borderLeftWidth: width, borderLeftColor: color }
}

export function getStartPaddingStyle(
  value: number,
  isRtl: boolean = isCurrentLanguageRtl(),
): ViewStyle {
  return isRtl ? { paddingRight: value } : { paddingLeft: value }
}

export function getStartMarginStyle(
  value: number,
  isRtl: boolean = isCurrentLanguageRtl(),
): ViewStyle {
  return isRtl ? { marginRight: value } : { marginLeft: value }
}

export function getLogicalRowDirection(isRtl: boolean = isCurrentLanguageRtl()): 'row' | 'row-reverse' {
  return isRtl ? 'row-reverse' : 'row'
}
