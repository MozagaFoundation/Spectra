/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

export interface FAQItem {
  id: string
  qKey: string
  aKey: string
}

export interface FAQSection {
  id: string
  titleKey: string
  items: FAQItem[]
}

function faqItem(sectionId: string, itemId: string): FAQItem {
  return {
    id: itemId,
    qKey: `faq.${sectionId}.${itemId}.q`,
    aKey: `faq.${sectionId}.${itemId}.a`,
  }
}

function faqSection(sectionId: string, itemIds: string[]): FAQSection {
  return {
    id: sectionId,
    titleKey: `faq.${sectionId}.title`,
    items: itemIds.map((itemId) => faqItem(sectionId, itemId)),
  }
}

export const FAQ_DATA: FAQSection[] = [
  faqSection('account', [
    'createAccount',
    'recoveryPhrase',
    'multipleDevices',
    'multiExo',
    'logout',
    'profile',
    'qrCode',
    'pqAddress',
  ]),
  faqSection('security', [
    'encryption',
    'duressPin',
    'failedAttempts',
    'biometrics',
    'autoLock',
    'screenshotProtection',
    'appSwitcher',
    'spectreMode',
  ]),
  faqSection('messaging', [
    'privateMessages',
    'disappearingMessages',
    'filesMedia',
    'voiceNotes',
    'reactions',
    'reply',
    'forward',
    'encryptedGroups',
    'archivePinMute',
    'clearVsDelete',
  ]),
  faqSection('calls', ['makeCall', 'torCalls', 'controls']),
  faqSection('contacts', ['addContact', 'scanQr', 'verifiedBadge', 'customName', 'block', 'tags']),
  faqSection('crypto', [
    'supportedWallets',
    'mozagaNetwork',
    'sendCrypto',
    'receiveCrypto',
    'chatPayments',
    'supportedTokens',
    'transactionHistory',
    'torRpc',
  ]),
  faqSection('tor', ['torMode', 'freeQuota', 'bridges', 'performance', 'verifyConnection', 'otherApps']),
  faqSection('spectre', ['whatIsSpectre', 'subscriptionAccess', 'addresses', 'activationTokens', 'disabledFeatures', 'endingAccess']),
  faqSection('payments', ['networkFees', 'refunds']),
  faqSection('bluetooth', ['meshMessaging', 'security', 'storeForward', 'relaying', 'permissions']),
  faqSection('agora', ['whatIs', 'encrypted', 'whispers', 'nicks', 'spectre']),
  faqSection('appearance', ['theme', 'textSize', 'chatBackground']),
]

export const VISIBLE_FAQ_DATA: FAQSection[] = FAQ_DATA

export const UNAVAILABLE_PUBLIC_FEATURE_IDS = [
  'kara',
  'broadcast',
  'markets',
] as const
