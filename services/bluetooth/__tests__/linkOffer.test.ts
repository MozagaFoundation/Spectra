/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'
import { BLE_SERVICE_UUID } from '../types'
import {
  compareLinkOffers,
  createLinkOffer,
  decodeLinkOfferFrame,
  encodeLinkOfferFrame,
  parseAdvertisedLinkOffer,
  sameLinkOffer,
  splitLeadingLinkOffer,
} from '../linkOffer'

describe('BLE link offer', () => {
  it('round-trips a session offer without embedding identity', () => {
    const offer = createLinkOffer()
    expect(offer).toHaveLength(8)
    const frame = encodeLinkOfferFrame(offer)
    expect(decodeLinkOfferFrame(frame)).toEqual(offer)
    expect(decodeLinkOfferFrame(new Uint8Array([0x53, 0x42, 0x02, 0x7f]))).toBeNull()
  })

  it('splits a leading offer from a coalesced ATT payload', () => {
    const offer = new Uint8Array([9, 8, 7, 6, 5, 4, 3, 2])
    const handshake = new Uint8Array([0x53, 0x42, 0x02, 0x01, 0xaa])
    const coalesced = new Uint8Array(encodeLinkOfferFrame(offer).length + handshake.length)
    coalesced.set(encodeLinkOfferFrame(offer))
    coalesced.set(handshake, encodeLinkOfferFrame(offer).length)
    expect(splitLeadingLinkOffer(coalesced)).toEqual({
      offer,
      remainder: handshake,
    })
    expect(splitLeadingLinkOffer(handshake)).toEqual({
      offer: null,
      remainder: handshake,
    })
  })

  it('orders offers lexicographically so only one side dials', () => {
    const lower = new Uint8Array(8)
    const higher = new Uint8Array(8).fill(1)
    expect(compareLinkOffers(lower, higher)).toBeLessThan(0)
    expect(sameLinkOffer(lower, lower.slice())).toBe(true)
  })

  it('reads an advertised offer from service data', () => {
    const offer = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
    const value = btoa(String.fromCharCode(...offer))
    expect(parseAdvertisedLinkOffer({
      serviceData: { [BLE_SERVICE_UUID.toLowerCase()]: value },
    })).toEqual(offer)
    expect(parseAdvertisedLinkOffer({ serviceData: {} })).toBeNull()
  })
})
