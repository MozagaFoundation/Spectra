/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'

import { AGORA_TERMS_TEXT, DISCLAIMER_TEXT, LEGAL_DOCS, PRIVACY_TEXT, TERMS_TEXT } from './legalDocs'

describe('legalDocs', () => {
  it('exposes exactly the supported legal document ids', () => {
    expect(Object.keys(LEGAL_DOCS).sort()).toEqual(['agora', 'disclaimer', 'privacy', 'terms'])
  })

  it('wires each legal document to the correct i18n keys and fallback text', () => {
    expect(LEGAL_DOCS.terms).toMatchObject({
      titleKey: 'legal.terms.title',
      contentKey: 'legal.terms.content',
      fallbackTitle: 'Terms and Conditions',
      fallbackContent: TERMS_TEXT,
    })
    expect(LEGAL_DOCS.privacy).toMatchObject({
      titleKey: 'legal.privacy.title',
      contentKey: 'legal.privacy.content',
      fallbackTitle: 'Privacy Policy',
      fallbackContent: PRIVACY_TEXT,
    })
    expect(LEGAL_DOCS.disclaimer).toMatchObject({
      titleKey: 'legal.disclaimer.title',
      contentKey: 'legal.disclaimer.content',
      fallbackTitle: 'Payment and Digital Assets Disclaimer',
      fallbackContent: DISCLAIMER_TEXT,
    })
    expect(LEGAL_DOCS.agora).toMatchObject({
      titleKey: 'legal.agora.title',
      contentKey: 'legal.agora.content',
      fallbackTitle: 'Agora Terms',
      fallbackContent: AGORA_TERMS_TEXT,
    })
  })

  it('keeps fallback documents non-empty markdown with expected headings', () => {
    expect(TERMS_TEXT).toContain('# Terms and Conditions')
    expect(PRIVACY_TEXT).toContain('# Privacy Policy')
    expect(DISCLAIMER_TEXT).toContain('# Payment and Digital Assets Disclaimer')
    expect(AGORA_TERMS_TEXT).toContain('# Agora Terms')

    for (const doc of Object.values(LEGAL_DOCS)) {
      expect(doc.fallbackContent.length, doc.fallbackTitle).toBeGreaterThan(1000)
      expect(doc.fallbackContent).toContain('## ')
    }
  })

  it('describes current backend security controls without legacy RLS wording', () => {
    expect(PRIVACY_TEXT).toContain('authenticated backend authorization')
    expect(PRIVACY_TEXT).toContain('database access controls')
    expect(PRIVACY_TEXT).not.toContain('Backend row-level security')
  })
})
