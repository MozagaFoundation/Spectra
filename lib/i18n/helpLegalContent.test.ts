/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'

import {
  contentTranslations as sharedContentTranslations,
} from '@spectra/public-content/contentTranslations'
import {
  FAQ_DATA as sharedFAQData,
} from '@spectra/public-content/helpData'
import {
  LEGAL_DOCS as sharedLegalDocs,
} from '@spectra/public-content/legalDocs'
import {
  LEGAL_CONTACT_EMAIL,
  PRIVACY_CONTACT_EMAIL,
} from '@spectra/public-content/metadata'
import { FAQ_DATA } from '@/lib/helpData'
import { LEGAL_DOCS } from '@/lib/legalDocs'
import { contentTranslations } from './contentTranslations'
import { eurasiaHelpTranslations } from './manualHelpTranslations.eurasia'
import { miscHelpTranslations } from './manualHelpTranslations.misc'
import { romanceHelpTranslations } from './manualHelpTranslations.romance'
import { southAsiaHelpTranslations } from './manualHelpTranslations.southAsia'

const manualHelpTranslations: Record<string, Record<string, string>> = {
  ...romanceHelpTranslations,
  ...eurasiaHelpTranslations,
  ...southAsiaHelpTranslations,
  ...miscHelpTranslations,
}

const expectedHelpKeys = FAQ_DATA.flatMap((section) => [
  section.titleKey,
  ...section.items.flatMap((item) => [item.qKey, item.aKey]),
]).sort()

const expectedLegalTitleKeys = Object.values(LEGAL_DOCS).map((doc) => doc.titleKey).sort()
const expectedLegalContentKeys = Object.values(LEGAL_DOCS).map((doc) => doc.contentKey).sort()
const expectedLegalKeys = [...expectedLegalTitleKeys, ...expectedLegalContentKeys].sort()

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{\{\s*([^}\s]+)\s*\}\}/g)].map((match) => match[1]).sort()
}

function sortedKeys(record: Record<string, string>): string[] {
  return Object.keys(record).sort()
}

function expectMeaningfulString(value: string | undefined, label: string): void {
  expect(value, label).toBeTypeOf('string')
  expect(value?.trim().length, label).toBeGreaterThan(0)
}

function stripLeadingLegalNotice(value: string): string {
  if (value.startsWith('#')) {
    return value
  }

  const noticeSeparator = '\n\n---\n\n'
  const separatorIndex = value.indexOf(noticeSeparator)
  return separatorIndex === -1 ? value : value.slice(separatorIndex + noticeSeparator.length)
}

describe('help and legal translations', () => {
  it('keeps mobile compatibility modules attached to shared public content', () => {
    expect(FAQ_DATA).toBe(sharedFAQData)
    expect(LEGAL_DOCS).toBe(sharedLegalDocs)
    expect(contentTranslations).toBe(sharedContentTranslations)
  })

  it('provides exactly every FAQ key for every content locale', () => {
    for (const [language, translations] of Object.entries(contentTranslations)) {
      expect(sortedKeys(translations.help), language).toEqual(expectedHelpKeys)

      for (const key of expectedHelpKeys) {
        expectMeaningfulString(translations.help[key], `${language}:${key}`)
      }
    }
  })

  it('provides exactly every legal key for every content locale', () => {
    for (const [language, translations] of Object.entries(contentTranslations)) {
      expect(sortedKeys(translations.legal), language).toEqual(expectedLegalKeys)

      for (const key of expectedLegalKeys) {
        expectMeaningfulString(translations.legal[key], `${language}:${key}`)
      }
    }
  })

  it('keeps help and legal placeholders aligned with English', () => {
    const englishHelp = contentTranslations.en.help
    const englishLegal = contentTranslations.en.legal

    for (const [language, translations] of Object.entries(contentTranslations)) {
      if (language === 'en') continue

      for (const [key, englishValue] of Object.entries(englishHelp)) {
        expect(placeholders(translations.help[key] ?? '')).toEqual(placeholders(englishValue))
      }

      for (const [key, englishValue] of Object.entries(englishLegal)) {
        expect(placeholders(translations.legal[key] ?? '')).toEqual(placeholders(englishValue))
      }
    }
  })

  it('keeps manual help shards aligned with the canonical FAQ shape', () => {
    for (const [language, translations] of Object.entries(manualHelpTranslations)) {
      expect(sortedKeys(translations), language).toEqual(expectedHelpKeys)

      for (const titleKey of FAQ_DATA.map((section) => section.titleKey)) {
        expectMeaningfulString(translations[titleKey], `${language}:${titleKey}`)
      }
    }
  })

  it('does not leave non-English FAQ bodies as English fallbacks', () => {
    const englishHelp = contentTranslations.en.help

    for (const [language, translations] of Object.entries(contentTranslations)) {
      if (language === 'en') continue

      for (const [key, englishValue] of Object.entries(englishHelp)) {
        if (key.endsWith('.title')) continue
        expect(translations.help[key], `${language}:${key}`).not.toEqual(englishValue)
      }
    }
  })

  it('does not overstate Tor routing coverage in the English FAQ', () => {
    expect(contentTranslations.en.help['faq.tor.torMode.a']).toContain('supported Spectra network requests')
    expect(contentTranslations.en.help['faq.tor.torMode.a']).not.toContain('routes Spectra network traffic')
  })

  it('keeps verified product and legal claims current', () => {
    expect(contentTranslations.en.help['faq.account.recoveryPhrase.a']).toContain('12- or 24-word')
    expect(contentTranslations.en.help['faq.security.encryption.a']).toContain(
      'X25519 + ML-KEM-768 X3DH-like initial key establishment',
    )
    expect(contentTranslations.en.help['faq.security.encryption.a']).toContain(
      'ML-DSA-65 post-quantum signatures',
    )
    expect(contentTranslations.en.help['faq.calls.makeCall.a']).toContain('not post-quantum')
    expect(contentTranslations.en.help['faq.crypto.mozagaNetwork.a']).toContain('mainnet')
    expect(contentTranslations.en.help['faq.crypto.sendCrypto.a']).toContain('treasury recipient')
    expect(contentTranslations.en.help['faq.tor.verifyConnection.a']).toContain('verified exit country')
    expect(contentTranslations.en.help['faq.spectre.disabledFeatures.a']).toContain('15-minute')
    expect(contentTranslations.en.help['faq.spectre.disabledFeatures.a']).toContain('1-hour')
    expect(contentTranslations.en.help['faq.account.multiExo.a']).toContain('on this device')
    expect(LEGAL_DOCS.terms.fallbackContent).not.toContain('peer-to-peer transport')
    expect(LEGAL_DOCS.privacy.fallbackContent).not.toContain('message font size')
    expect(LEGAL_DOCS.disclaimer.fallbackContent).toContain('0.1%')
    expect(FAQ_DATA.flatMap((section) => section.items.map((item) => item.id))).not.toContain('mozagaTestnet')

    for (const [id, document] of Object.entries(LEGAL_DOCS)) {
      expect(document.fallbackContent).toContain(
        id === 'privacy' ? PRIVACY_CONTACT_EMAIL : LEGAL_CONTACT_EMAIL,
      )
      expect(document.fallbackContent).not.toContain('legal@spectra.app')
      expect(document.fallbackContent).not.toContain('VoIP tokens')
      expect(document.fallbackContent).not.toContain('CallKit')
    }
  })

  it('serves the canonical English legal body with a localized notice for non-English locales', () => {
    const englishLegal = contentTranslations.en.legal

    for (const [language, translations] of Object.entries(contentTranslations)) {
      if (language === 'en') continue

      for (const doc of Object.values(LEGAL_DOCS)) {
        const localizedBody = translations.legal[doc.contentKey]
        expect(localizedBody, `${language}:${doc.contentKey}`).not.toEqual(englishLegal[doc.contentKey])
        expect(stripLeadingLegalNotice(localizedBody), `${language}:${doc.contentKey}`)
          .toEqual(englishLegal[doc.contentKey])
      }
    }
  })
})
