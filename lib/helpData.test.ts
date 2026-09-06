/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'

import { FAQ_DATA } from './helpData'

describe('helpData', () => {
  it('keeps FAQ sections and item ids unique and non-empty', () => {
    const sectionIds = new Set<string>()
    const itemIds = new Set<string>()

    for (const section of FAQ_DATA) {
      expect(section.id).toMatch(/^[a-z][a-zA-Z0-9]*$/)
      expect(section.items.length, section.id).toBeGreaterThan(0)
      expect(sectionIds.has(section.id), section.id).toBe(false)
      sectionIds.add(section.id)

      for (const item of section.items) {
        const compoundId = `${section.id}:${item.id}`
        expect(item.id).toMatch(/^[a-z][a-zA-Z0-9]*$/)
        expect(itemIds.has(compoundId), compoundId).toBe(false)
        itemIds.add(compoundId)
      }
    }
  })

  it('derives every translation key from the canonical section and item ids', () => {
    for (const section of FAQ_DATA) {
      expect(section.titleKey).toBe(`faq.${section.id}.title`)

      for (const item of section.items) {
        expect(item.qKey).toBe(`faq.${section.id}.${item.id}.q`)
        expect(item.aKey).toBe(`faq.${section.id}.${item.id}.a`)
      }
    }
  })

  it('does not expose retired privacy-payment help topics', () => {
    const payments = FAQ_DATA.find((section) => section.id === 'payments')

    expect(payments?.items.map((item) => item.id)).toEqual(['networkFees', 'refunds'])
    expect(FAQ_DATA.map((section) => section.id)).not.toContain('markets')
    expect(FAQ_DATA.find((section) => section.id === 'crypto')?.items.map((item) => item.id)).not.toContain('ammPools')
  })
})
