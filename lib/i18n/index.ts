/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { getLocales } from 'expo-localization'
import i18n, { type TOptions } from 'i18next'
import { initReactI18next } from 'react-i18next'
import { getFallbackLocaleTag, normalizeAppLanguageCode, SUPPORTED_LANGUAGE_CODES } from './languages'
import {
  APP_NAMESPACES,
  DEFAULT_LANGUAGE,
  type AppLanguage,
  loadLanguageResources,
  resources,
} from './resources'

let languageCachesInitialized = false
let cachedCurrentLanguage: AppLanguage = DEFAULT_LANGUAGE
let cachedCurrentLocaleTag = getFallbackLocaleTag(DEFAULT_LANGUAGE)
let initPromise: Promise<void> | null = null

function resolveDeviceLanguage(): AppLanguage {
  for (const locale of getLocales()) {
    const resolved =
      normalizeAppLanguageCode(locale.languageTag) ??
      normalizeAppLanguageCode(locale.languageCode)
    if (resolved) {
      return resolved
    }
  }

  return DEFAULT_LANGUAGE
}

function resolveLocaleTag(language: AppLanguage): string {
  for (const locale of getLocales()) {
    const localeLanguage =
      normalizeAppLanguageCode(locale.languageTag) ??
      normalizeAppLanguageCode(locale.languageCode)

    if (localeLanguage === language && locale.languageTag) {
      return locale.languageTag
    }
  }

  return getFallbackLocaleTag(language)
}

function syncLanguageCaches(language?: string | null): void {
  cachedCurrentLanguage = normalizeAppLanguageCode(language) ?? resolveDeviceLanguage()
  cachedCurrentLocaleTag = resolveLocaleTag(cachedCurrentLanguage)
}

export function getCurrentLanguage(): AppLanguage {
  return cachedCurrentLanguage
}

export function getCurrentLocaleTag(): string {
  return cachedCurrentLocaleTag
}

function ensureI18nReady(): Promise<void> {
  if (i18n.isInitialized) {
    return Promise.resolve()
  }
  if (!initPromise) {
    initPromise = initializeI18n().catch((error) => {
      initPromise = null
      throw error
    })
  }
  return initPromise
}

async function initializeI18n(): Promise<void> {
  if (i18n.isInitialized) {
    return
  }

  const bootLanguage = cachedCurrentLanguage
  if (bootLanguage !== DEFAULT_LANGUAGE) {
    await loadLanguageResources(bootLanguage)
  }
  if (i18n.isInitialized) {
    return
  }

  await i18n.use(initReactI18next).init({
    resources: {
      [DEFAULT_LANGUAGE]: resources[DEFAULT_LANGUAGE],
      ...(bootLanguage === DEFAULT_LANGUAGE ? {} : { [bootLanguage]: resources[bootLanguage] }),
    },
    lng: bootLanguage,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: [...SUPPORTED_LANGUAGE_CODES],
    partialBundledLanguages: true,
    ns: [...APP_NAMESPACES],
    defaultNS: 'common',
    fallbackNS: 'common',
    interpolation: {
      escapeValue: false,
    },
    returnNull: false,
    returnEmptyString: false,
    keySeparator: false,
    nsSeparator: false,
    compatibilityJSON: 'v4',
  })
  syncLanguageCaches(i18n.resolvedLanguage)
}

async function installLanguageBundles(language: AppLanguage): Promise<void> {
  const packed = await loadLanguageResources(language)
  await ensureI18nReady()
  for (const namespace of APP_NAMESPACES) {
    i18n.addResourceBundle(language, namespace, packed[namespace], true, true)
  }
}

export async function setAppLanguage(language: AppLanguage): Promise<void> {
  await installLanguageBundles(language)
  if (cachedCurrentLanguage === language && i18n.resolvedLanguage === language) {
    return
  }

  await i18n.changeLanguage(language)
  syncLanguageCaches(language)
}

export function translate(key: string, options?: TOptions): string {
  return i18n.t(key, options) as string
}

syncLanguageCaches(i18n.resolvedLanguage)

if (!i18n.isInitialized) {
  void ensureI18nReady()
}

if (!languageCachesInitialized) {
  i18n.on('languageChanged', (language) => {
    syncLanguageCaches(language)
  })
  languageCachesInitialized = true
}

export default i18n
