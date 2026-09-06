/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import en from './locales/en'
import { contentTranslations } from './contentTranslations'
import { featureTranslations } from './locales/featureTranslations'
import { sourceTranslations } from './locales/sourceTranslations'
import type { LocaleTranslationOverrides } from './locales/translationOverrideTypes'
import { APP_NAMESPACES, type AppNamespace, type LanguageTranslations, type NamespaceTranslations } from './schema'

export { APP_NAMESPACES, type AppNamespace, type LanguageTranslations, type NamespaceTranslations } from './schema'

export const APP_LANGUAGES = [
  'ar',
  'bn',
  'de',
  'en',
  'es',
  'fr',
  'hi',
  'id',
  'it',
  'pt',
  'ru',
  'ur',
  'zh-Hans',
] as const

export type AppLanguage = (typeof APP_LANGUAGES)[number]
export const DEFAULT_LANGUAGE: AppLanguage = 'en'

type LocaleModule = { default: LanguageTranslations }
type OverrideModule = { default: LocaleTranslationOverrides }

const localeLoaders: Record<AppLanguage, () => Promise<LocaleModule>> = {
  ar: () => import('./locales/ar'),
  bn: () => import('./locales/bn'),
  de: () => import('./locales/de'),
  en: () => Promise.resolve({ default: en }),
  es: () => import('./locales/es'),
  fr: () => import('./locales/fr'),
  hi: () => import('./locales/hi'),
  id: () => import('./locales/id'),
  it: () => import('./locales/it'),
  pt: () => import('./locales/pt'),
  ru: () => import('./locales/ru'),
  ur: () => import('./locales/ur'),
  'zh-Hans': () => import('./locales/zhHans'),
}

const overrideLoaders: Partial<Record<AppLanguage, () => Promise<OverrideModule>>> = {
  ar: () => import('./locales/translationOverrides.ar'),
  bn: () => import('./locales/translationOverrides.bn'),
  de: () => import('./locales/translationOverrides.de'),
  es: () => import('./locales/translationOverrides.es'),
  fr: () => import('./locales/translationOverrides.fr'),
  hi: () => import('./locales/translationOverrides.hi'),
  id: () => import('./locales/translationOverrides.id'),
  it: () => import('./locales/translationOverrides.it'),
  pt: () => import('./locales/translationOverrides.pt'),
  ru: () => import('./locales/translationOverrides.ru'),
  ur: () => import('./locales/translationOverrides.ur'),
  'zh-Hans': () => import('./locales/translationOverrides.zhHans'),
}

function isContentNamespace(namespace: AppNamespace): namespace is 'help' | 'legal' {
  return namespace === 'help' || namespace === 'legal'
}

function mergeFeatureTranslations(
  language: AppLanguage,
  baseTranslations: LanguageTranslations,
  explicitOverrides?: LocaleTranslationOverrides,
): LanguageTranslations {
  const featureSet = featureTranslations[language] ?? {}
  const sourceSet = sourceTranslations[language] ?? {}
  const contentSet = contentTranslations[language] ?? {}
  const englishFeatureSet = featureTranslations.en
  const englishSourceSet = sourceTranslations.en
  return Object.fromEntries(
    APP_NAMESPACES.map((namespace) => {
      const baseNamespace = baseTranslations[namespace]
      const featureNamespace = featureSet[namespace] ?? {}
      const sourceNamespace = sourceSet[namespace] ?? {}
      const englishFeatureNamespace = englishFeatureSet[namespace] ?? {}
      const englishSourceNamespace = englishSourceSet[namespace] ?? {}
      const mergedNamespace: NamespaceTranslations = { ...baseNamespace }

      for (const [key, value] of Object.entries(featureNamespace)) {
        const isEnglishCompletion =
          language !== 'en' &&
          key in baseNamespace &&
          englishFeatureNamespace[key] === value

        if (!isEnglishCompletion) {
          mergedNamespace[key] = value
        }
      }

      for (const [key, value] of Object.entries(sourceNamespace)) {
        const isEnglishCompletion =
          language !== 'en' &&
          key in mergedNamespace &&
          englishSourceNamespace[key] === value

        if (!isEnglishCompletion) {
          mergedNamespace[key] = value
        }
      }

      Object.assign(mergedNamespace, explicitOverrides?.[namespace] ?? {})

      if (isContentNamespace(namespace)) {
        Object.assign(mergedNamespace, contentSet[namespace] ?? {})
      }

      return [namespace, mergedNamespace]
    }),
  ) as LanguageTranslations
}

const loadedResources: Partial<Record<AppLanguage, LanguageTranslations>> = {
  en: mergeFeatureTranslations('en', en),
}

const languageLoadPromises = new Map<AppLanguage, Promise<LanguageTranslations>>()

export const resources = loadedResources as Record<AppLanguage, LanguageTranslations>

export async function loadLanguageResources(language: AppLanguage): Promise<LanguageTranslations> {
  const cached = loadedResources[language]
  if (cached) {
    return cached
  }

  const pending = languageLoadPromises.get(language)
  if (pending) {
    return pending
  }

  const loadPromise = (async () => {
    const [localeModule, overrideModule] = await Promise.all([
      localeLoaders[language](),
      overrideLoaders[language]?.() ?? Promise.resolve(null),
    ])
    const merged = mergeFeatureTranslations(
      language,
      localeModule.default,
      overrideModule?.default,
    )
    loadedResources[language] = merged
    return merged
  })()

  languageLoadPromises.set(language, loadPromise)
  try {
    return await loadPromise
  } finally {
    languageLoadPromises.delete(language)
  }
}

export async function loadAllLanguageResources(): Promise<Record<AppLanguage, LanguageTranslations>> {
  await Promise.all(APP_LANGUAGES.map((language) => loadLanguageResources(language)))
  return resources
}
