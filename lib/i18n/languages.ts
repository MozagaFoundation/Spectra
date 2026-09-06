/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { AppLanguage } from './resources'

interface AppLanguageDefinition {
  flag: string
  nativeName: string
  englishName: string
  localeTag: string
  aliases: readonly string[]
  isRtl?: boolean
}

export const LANGUAGE_DEFINITIONS: Record<AppLanguage, AppLanguageDefinition> = {
  en: {
    flag: '🇺🇸',
    nativeName: 'English',
    englishName: 'English',
    localeTag: 'en-US',
    aliases: ['en', 'en-us', 'en-gb', 'en-ca', 'en-au', 'en-nz'],
  },
  es: {
    flag: '🇪🇸',
    nativeName: 'Español',
    englishName: 'Spanish',
    localeTag: 'es-ES',
    aliases: ['es', 'es-es', 'es-mx', 'es-ar', 'es-cl', 'es-co', 'es-pe', 'es-us'],
  },
  ru: {
    flag: '🇷🇺',
    nativeName: 'Русский',
    englishName: 'Russian',
    localeTag: 'ru-RU',
    aliases: ['ru', 'ru-ru'],
  },
  'zh-Hans': {
    flag: '🇨🇳',
    nativeName: '简体中文',
    englishName: 'Chinese (Simplified)',
    localeTag: 'zh-CN',
    aliases: ['zh', 'zh-cn', 'zh-sg', 'zh-hans', 'zh-hans-cn', 'zh-hans-sg'],
  },
  hi: {
    flag: '🇮🇳',
    nativeName: 'हिन्दी',
    englishName: 'Hindi',
    localeTag: 'hi-IN',
    aliases: ['hi', 'hi-in'],
  },
  ar: {
    flag: '🇸🇦',
    nativeName: 'العربية',
    englishName: 'Arabic',
    localeTag: 'ar-SA',
    aliases: ['ar', 'ar-sa', 'ar-eg', 'ar-ae'],
    isRtl: true,
  },
  fr: {
    flag: '🇫🇷',
    nativeName: 'Français',
    englishName: 'French',
    localeTag: 'fr-FR',
    aliases: ['fr', 'fr-fr', 'fr-ca', 'fr-be', 'fr-ch'],
  },
  it: {
    flag: '🇮🇹',
    nativeName: 'Italiano',
    englishName: 'Italian',
    localeTag: 'it-IT',
    aliases: ['it', 'it-it'],
  },
  pt: {
    flag: '🇧🇷',
    nativeName: 'Português',
    englishName: 'Portuguese',
    localeTag: 'pt-BR',
    aliases: ['pt', 'pt-br', 'pt-pt'],
  },
  de: {
    flag: '🇩🇪',
    nativeName: 'Deutsch',
    englishName: 'German',
    localeTag: 'de-DE',
    aliases: ['de', 'de-de', 'de-at', 'de-ch'],
  },
  bn: {
    flag: '🇧🇩',
    nativeName: 'বাংলা',
    englishName: 'Bengali',
    localeTag: 'bn-BD',
    aliases: ['bn', 'bn-bd', 'bn-in'],
  },
  ur: {
    flag: '🇵🇰',
    nativeName: 'اردو',
    englishName: 'Urdu',
    localeTag: 'ur-PK',
    aliases: ['ur', 'ur-pk'],
    isRtl: true,
  },
  id: {
    flag: '🇮🇩',
    nativeName: 'Bahasa Indonesia',
    englishName: 'Indonesian',
    localeTag: 'id-ID',
    aliases: ['id', 'id-id'],
  },
}

export type SupportedLanguageDefinition = {
  code: AppLanguage
} & AppLanguageDefinition

export const SUPPORTED_LANGUAGE_CODES = Object.keys(LANGUAGE_DEFINITIONS) as AppLanguage[]

export const SUPPORTED_LANGUAGES: SupportedLanguageDefinition[] = SUPPORTED_LANGUAGE_CODES.map((code) => ({
  code,
  ...LANGUAGE_DEFINITIONS[code],
}))

const LOCALIZED_LANGUAGE_NAMES = {
  en: {
    en: 'English',
    es: 'Spanish',
    ru: 'Russian',
    'zh-Hans': 'Chinese (Simplified)',
    hi: 'Hindi',
    ar: 'Arabic',
    fr: 'French',
    it: 'Italian',
    pt: 'Portuguese',
    de: 'German',
    bn: 'Bengali',
    ur: 'Urdu',
    id: 'Indonesian',
  },
  es: {
    en: 'inglés',
    es: 'español',
    ru: 'ruso',
    'zh-Hans': 'chino simplificado',
    hi: 'hindi',
    ar: 'árabe',
    fr: 'francés',
    it: 'italiano',
    pt: 'portugués',
    de: 'alemán',
    bn: 'bengalí',
    ur: 'urdu',
    id: 'indonesio',
  },
  ru: {
    en: 'английский',
    es: 'испанский',
    ru: 'русский',
    'zh-Hans': 'китайский (упрощенный)',
    hi: 'хинди',
    ar: 'арабский',
    fr: 'французский',
    it: 'итальянский',
    pt: 'португальский',
    de: 'немецкий',
    bn: 'бенгальский',
    ur: 'урду',
    id: 'индонезийский',
  },
  'zh-Hans': {
    en: '英语',
    es: '西班牙语',
    ru: '俄语',
    'zh-Hans': '简体中文',
    hi: '印地语',
    ar: '阿拉伯语',
    fr: '法语',
    it: '意大利语',
    pt: '葡萄牙语',
    de: '德语',
    bn: '孟加拉语',
    ur: '乌尔都语',
    id: '印度尼西亚语',
  },
  hi: {
    en: 'अंग्रेज़ी',
    es: 'स्पेनिश',
    ru: 'रूसी',
    'zh-Hans': 'सरलीकृत चीनी',
    hi: 'हिंदी',
    ar: 'अरबी',
    fr: 'फ़्रेंच',
    it: 'इतालवी',
    pt: 'पुर्तगाली',
    de: 'जर्मन',
    bn: 'बंगाली',
    ur: 'उर्दू',
    id: 'इंडोनेशियाई',
  },
  ar: {
    en: 'الإنجليزية',
    es: 'الإسبانية',
    ru: 'الروسية',
    'zh-Hans': 'الصينية المبسطة',
    hi: 'الهندية',
    ar: 'العربية',
    fr: 'الفرنسية',
    it: 'الإيطالية',
    pt: 'البرتغالية',
    de: 'الألمانية',
    bn: 'البنغالية',
    ur: 'الأردية',
    id: 'الإندونيسية',
  },
  fr: {
    en: 'anglais',
    es: 'espagnol',
    ru: 'russe',
    'zh-Hans': 'chinois simplifié',
    hi: 'hindi',
    ar: 'arabe',
    fr: 'français',
    it: 'italien',
    pt: 'portugais',
    de: 'allemand',
    bn: 'bengali',
    ur: 'ourdou',
    id: 'indonésien',
  },
  it: {
    en: 'inglese',
    es: 'spagnolo',
    ru: 'russo',
    'zh-Hans': 'cinese semplificato',
    hi: 'hindi',
    ar: 'arabo',
    fr: 'francese',
    it: 'italiano',
    pt: 'portoghese',
    de: 'tedesco',
    bn: 'bengalese',
    ur: 'urdu',
    id: 'indonesiano',
  },
  pt: {
    en: 'inglês',
    es: 'espanhol',
    ru: 'russo',
    'zh-Hans': 'chinês simplificado',
    hi: 'híndi',
    ar: 'árabe',
    fr: 'francês',
    it: 'italiano',
    pt: 'português',
    de: 'alemão',
    bn: 'bengali',
    ur: 'urdu',
    id: 'indonésio',
  },
  de: {
    en: 'Englisch',
    es: 'Spanisch',
    ru: 'Russisch',
    'zh-Hans': 'Chinesisch (vereinfacht)',
    hi: 'Hindi',
    ar: 'Arabisch',
    fr: 'Französisch',
    it: 'Italienisch',
    pt: 'Portugiesisch',
    de: 'Deutsch',
    bn: 'Bengalisch',
    ur: 'Urdu',
    id: 'Indonesisch',
  },
  bn: {
    en: 'ইংরেজি',
    es: 'স্প্যানিশ',
    ru: 'রুশ',
    'zh-Hans': 'সরলীকৃত চীনা',
    hi: 'হিন্দি',
    ar: 'আরবি',
    fr: 'ফরাসি',
    it: 'ইতালীয়',
    pt: 'পর্তুগিজ',
    de: 'জার্মান',
    bn: 'বাংলা',
    ur: 'উর্দু',
    id: 'ইন্দোনেশীয়',
  },
  ur: {
    en: 'انگریزی',
    es: 'ہسپانوی',
    ru: 'روسی',
    'zh-Hans': 'آسان چینی',
    hi: 'ہندی',
    ar: 'عربی',
    fr: 'فرانسیسی',
    it: 'اطالوی',
    pt: 'پرتگالی',
    de: 'جرمن',
    bn: 'بنگالی',
    ur: 'اردو',
    id: 'انڈونیشیائی',
  },
  id: {
    en: 'Inggris',
    es: 'Spanyol',
    ru: 'Rusia',
    'zh-Hans': 'Tionghoa Sederhana',
    hi: 'Hindi',
    ar: 'Arab',
    fr: 'Prancis',
    it: 'Italia',
    pt: 'Portugis',
    de: 'Jerman',
    bn: 'Bengali',
    ur: 'Urdu',
    id: 'Indonesia',
  },
} satisfies Record<AppLanguage, Record<AppLanguage, string>>

export function getLocalizedLanguageName(language: AppLanguage, displayLanguage: AppLanguage): string {
  return LOCALIZED_LANGUAGE_NAMES[displayLanguage]?.[language] ?? LANGUAGE_DEFINITIONS[language].englishName
}

export function isAppLanguage(value?: string | null): value is AppLanguage {
  return !!value && SUPPORTED_LANGUAGE_CODES.includes(value as AppLanguage)
}

export function normalizeAppLanguageCode(code?: string | null): AppLanguage | null {
  if (!code) {
    return null
  }

  const normalizedCode = code.toLowerCase().replace(/_/g, '-')

  for (const language of SUPPORTED_LANGUAGE_CODES) {
    const definition = LANGUAGE_DEFINITIONS[language]
    if (language.toLowerCase() === normalizedCode || definition.aliases.includes(normalizedCode)) {
      return language
    }
  }

  return null
}

export function getFallbackLocaleTag(language: AppLanguage): string {
  return LANGUAGE_DEFINITIONS[language].localeTag
}

export function isRtlLanguage(language?: AppLanguage | null): boolean {
  return !!language && Boolean(LANGUAGE_DEFINITIONS[language].isRtl)
}
