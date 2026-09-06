/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import i18next from 'i18next'

import { contentTranslations } from './contentTranslations'
import { isRtlLanguage, SUPPORTED_LANGUAGE_CODES } from './languages'
import { APP_NAMESPACES } from './schema'
import { loadAllLanguageResources, resources } from './resources'

describe('i18n resources', () => {
  beforeAll(async () => {
    await loadAllLanguageResources()
  })
  it('keeps resource languages aligned with supported language codes', () => {
    expect(Object.keys(resources).sort()).toEqual([...SUPPORTED_LANGUAGE_CODES].sort())
  })

  it('provides every namespace for every language', () => {
    for (const [language, translations] of Object.entries(resources)) {
      expect(Object.keys(translations).sort(), language).toEqual([...APP_NAMESPACES].sort())

      for (const namespace of APP_NAMESPACES) {
        expect(translations[namespace], `${language}:${namespace}`).toBeTypeOf('object')
      }
    }
  })

  it('injects help and legal content into the runtime resources', () => {
    for (const [language, content] of Object.entries(contentTranslations)) {
      const appLanguage = language as keyof typeof resources

      expect(resources[appLanguage].help, `${language}:help`).toMatchObject(content.help)
      expect(resources[appLanguage].legal, `${language}:legal`).toMatchObject(content.legal)
    }
  })

  it('does not replace existing localized base strings with English feature completions', () => {
    expect(resources.en.common.Cancel).toBe('Cancel')
    expect(resources.es.common.Cancel).toBe('Cancelar')
  })

  it('keeps recovery, Tor, and secure-storage claims bounded', () => {
    expect(resources.en.auth['Enter your 12- or 24-word recovery phrase to restore your account'])
      .toContain('12- or 24-word')
    expect(resources.en.settings[
      'Routes supported Spectra network requests through Tor. Device-wide network routing is unchanged.'
    ]).toContain('Device-wide network routing is unchanged')
    expect(resources.en.settings[
      'Spectre uses a separate EXO identity, forces stronger device protections, routes supported Spectra network requests through Tor, and disables higher-risk features while active.'
    ]).toContain('supported Spectra network requests')
    expect(resources.en.settings[
      'Your account is secured using industry-standard encryption. Private keys remain on your device and are stored with platform secure storage.'
    ]).toContain('platform secure storage')
    expect(resources.en.tor['Supported Spectra network requests are currently routed through Tor.'])
      .toContain('Supported Spectra network requests')
    expect(resources.en.common[
      'Voice and video calls require direct peer-to-peer connections (WebRTC) which cannot work over the Tor network due to UDP restrictions and high latency.\n\nTo make calls, disable Tor mode in Settings > Network Privacy.'
    ]).toContain('Settings > Network Privacy')
    expect(resources.de.common['Chain {{chainId}}']).toBe('Blockchain {{chainId}}')
    expect(resources.it.common['Chain {{chainId}}']).toBe('Blockchain {{chainId}}')
    expect(resources.pt.common['Chain {{chainId}}']).toBe('Blockchain {{chainId}}')
  })

  it('labels Mozaga as mainnet in every selectable language', () => {
    for (const language of SUPPORTED_LANGUAGE_CODES) {
      expect(resources[language].common['Mozaga Mainnet'], language).toBeTruthy()
      expect(resources[language].common['Mozaga Testnet'], language).toBeUndefined()
      expect(resources[language].common['Mozaga Network'], language).toBeUndefined()
    }
  })

  it('keeps requested Spectre and chat status keys localized across selectable languages', () => {
    const requiredKeys = [
      ['chat', 'Sent nearby'],
      ['chat', 'Waiting for poll'],
      ['chat', 'Spectre Mode'],
      ['chat', 'Incoming voice call'],
      ['chat', 'Outgoing voice call'],
      ['chat', 'Incoming video call'],
      ['chat', 'Outgoing video call'],
      ['chat', 'No conversations yet'],
      ['chat', 'Sending as {{account}}'],
      ['common', 'Unavailable in Spectre Mode'],
      ['common', 'New'],
      ['common', 'Portfolio'],
      ['common', 'Select a cryptocurrency'],
      ['common', 'Just now'],
      ['common', 'No wallets available'],
      ['common', 'Unable to load transaction history'],
      ['common', 'Archive Passphrase Required'],
      ['common', 'Contacts: {{contacts}}'],
      ['navigation', 'Chats'],
      ['settings', 'Contact Archive'],
      ['settings', 'Encrypted contact archive'],
      ['settings', '{{biometricType}} unlock is disabled by Spectre Mode'],
      ['settings', 'Never Persist is enforced by Spectre Mode.'],
      ['common', 'Contact archives are unavailable while Spectre Mode is active.'],
      ['common', 'Spectre Mode only allows plain encrypted text messages. Media, voice notes, transfers, and tags are disabled.'],
      ['common', 'Crypto features are unavailable while Spectre Mode is active.'],
      ['common', 'Media is hidden while Spectre Mode is active.'],
      ['settings', 'Use the saved Spectre account or create a fresh expendable account for this session.'],
    ] as const

    for (const language of SUPPORTED_LANGUAGE_CODES) {
      for (const [namespace, key] of requiredKeys) {
        expect(resources[language][namespace][key], `${language}:${namespace}.${key}`).toBeTruthy()
      }
    }

    expect(resources.es.common['No wallets available']).toBe('No hay billeteras disponibles')
    expect(resources.es.chat['No conversations yet']).toBe('Aún no hay conversaciones')
    expect(resources.es.chat['Incoming voice call']).toBe('Llamada de voz entrante')
    expect(resources['zh-Hans'].chat['Outgoing video call']).toBe('拨出视频通话')
    expect(resources.es.settings['Contact Archive']).toBe('Archivo de contactos')
    expect(resources.es.common['Contacts: {{contacts}}']).toBe('Contactos: {{contacts}}')
  })

  it('localizes critical notification, recovery, and delivery copy in every non-English locale', () => {
    const criticalKeys = [
      ['common', 'New encrypted message'],
      ['common', 'New message'],
      ['auth', 'Mnemonic must be 12 or 24 words'],
      ['auth', 'Invalid mnemonic checksum'],
      ['chat', 'Sending attachment'],
      ['chat', 'Encrypting and uploading {{completed}}/{{total}}'],
    ] as const

    for (const language of SUPPORTED_LANGUAGE_CODES.filter((language) => language !== 'en')) {
      for (const [namespace, key] of criticalKeys) {
        expect(resources[language][namespace][key], `${language}:${namespace}.${key}`)
          .toBeTruthy()
        expect(resources[language][namespace][key], `${language}:${namespace}.${key}`)
          .not.toBe(resources.en[namespace][key])
      }
    }
  })

  it('uses locale-native attachment plural forms without English suffix interpolation', () => {
    for (const language of SUPPORTED_LANGUAGE_CODES) {
      const common = resources[language].common

      expect(common['{{count}} attachment_one'], `${language}:attachment_one`).toBeTruthy()
      expect(common['{{count}} attachment_other'], `${language}:attachment_other`).toBeTruthy()
      expect(common['{{count}} attachment{{suffix}}'], `${language}:legacy attachment key`).toBeUndefined()
    }

    expect(resources.en.common['{{count}} attachment_one']).toBe('{{count}} attachment')
    expect(resources.en.common['{{count}} attachment_other']).toBe('{{count}} attachments')
    expect(resources.de.common['{{count}} attachment_other']).toBe('{{count}} Anhänge')
    expect(resources.ru.common['{{count}} attachment_many']).toBe('{{count}} вложений')
  })

  it('renders attachment counts with each locale’s plural rules', async () => {
    const i18n = i18next.createInstance()
    await i18n.init({
      resources,
      lng: 'en',
      fallbackLng: 'en',
      defaultNS: 'common',
      keySeparator: false,
      nsSeparator: false,
      compatibilityJSON: 'v4',
    })

    const attachmentCount = (language: string, count: number) =>
      i18n.t('{{count}} attachment', { lng: language, count })

    expect(attachmentCount('en', 1)).toBe('1 attachment')
    expect(attachmentCount('en', 2)).toBe('2 attachments')
    expect(attachmentCount('de', 1)).toBe('1 Anhang')
    expect(attachmentCount('de', 2)).toBe('2 Anhänge')
    expect(attachmentCount('ru', 1)).toBe('1 вложение')
    expect(attachmentCount('ru', 2)).toBe('2 вложения')
    expect(attachmentCount('ru', 5)).toBe('5 вложений')
    expect(attachmentCount('ar', 1)).toBe('1 مرفق')
    expect(attachmentCount('ar', 2)).toBe('2 مرفقان')
    expect(attachmentCount('ar', 3)).toBe('3 مرفقات')
    expect(attachmentCount('ar', 11)).toBe('11 مرفقًا')
    expect(attachmentCount('zh-Hans', 2)).toBe('2 个附件')
  })

  it('preserves RTL language metadata for Arabic and Urdu', () => {
    expect(isRtlLanguage('ar')).toBe(true)
    expect(isRtlLanguage('ur')).toBe(true)
    expect(isRtlLanguage('en')).toBe(false)
    expect(isRtlLanguage('es')).toBe(false)
  })

  it('keeps native permission locale files complete for every supported language', () => {
    const nativeLocalesDir = path.resolve(process.cwd(), 'locales')
    const english = JSON.parse(
      fs.readFileSync(path.join(nativeLocalesDir, 'en.json'), 'utf8'),
    ) as Record<string, string>
    const expectedKeys = Object.keys(english).sort()

    for (const language of SUPPORTED_LANGUAGE_CODES) {
      const fileName = `${language}.json`
      const localePath = path.join(nativeLocalesDir, fileName)
      const translations = JSON.parse(fs.readFileSync(localePath, 'utf8')) as Record<string, string>

      expect(Object.keys(translations).sort(), fileName).toEqual(expectedKeys)
      for (const key of expectedKeys) {
        expect(translations[key]?.trim().length, `${fileName}:${key}`).toBeGreaterThan(0)
      }
    }
  })
})
