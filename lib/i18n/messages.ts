/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import i18n, { type TOptions } from 'i18next'
import { normalizeAppLanguageCode } from './languages'
import { DEFAULT_LANGUAGE, resources, type AppLanguage, type AppNamespace } from './resources'

function resolveLanguage(): AppLanguage {
  return normalizeAppLanguageCode(i18n.resolvedLanguage ?? i18n.language) ?? DEFAULT_LANGUAGE
}

function interpolate(template: string, options?: TOptions): string {
  return template.replace(/{{\s*([^}\s]+)\s*}}/g, (_, key: string) => {
    const value = options?.[key]
    return value === undefined || value === null ? `{{${key}}}` : String(value)
  })
}

export function translateMessage(key: string, options?: TOptions): string {
  const language = resolveLanguage()
  const namespace = (options?.ns as AppNamespace | undefined) ?? 'common'
  const translations = resources[language]?.[namespace] ?? resources[DEFAULT_LANGUAGE][namespace]
  const fallbackTranslations = resources[DEFAULT_LANGUAGE][namespace]
  const template = translations[key] ?? fallbackTranslations[key] ?? key
  return interpolate(template, options)
}
