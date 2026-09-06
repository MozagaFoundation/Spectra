/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { BLE_SERVICE_UUID } from './types'

export const BLE_LINK_OFFER_BYTES = 8
const LINK_OFFER_TYPE = 0x00
const FRAME_HEADER_BYTES = 4
export const LINK_OFFER_FRAME_BYTES = FRAME_HEADER_BYTES + BLE_LINK_OFFER_BYTES

export function createLinkOffer(): Uint8Array {
  const offer = new Uint8Array(BLE_LINK_OFFER_BYTES)
  crypto.getRandomValues(offer)
  return offer
}

export function encodeLinkOfferFrame(offer: Uint8Array): Uint8Array {
  if (offer.length !== BLE_LINK_OFFER_BYTES) {
    throw new Error('BLE link offer length is invalid')
  }
  const frame = new Uint8Array(FRAME_HEADER_BYTES + BLE_LINK_OFFER_BYTES)
  frame[0] = 0x53
  frame[1] = 0x42
  frame[2] = 2
  frame[3] = LINK_OFFER_TYPE
  frame.set(offer, FRAME_HEADER_BYTES)
  return frame
}

export function decodeLinkOfferFrame(data: Uint8Array): Uint8Array | null {
  const split = splitLeadingLinkOffer(data)
  if (!split.offer || split.remainder.length > 0) return null
  return split.offer
}

export function splitLeadingLinkOffer(data: Uint8Array): {
  offer: Uint8Array | null
  remainder: Uint8Array
} {
  if (data.length < LINK_OFFER_FRAME_BYTES) {
    return { offer: null, remainder: data }
  }
  if (
    data[0] !== 0x53
    || data[1] !== 0x42
    || data[2] !== 2
    || data[3] !== LINK_OFFER_TYPE
  ) {
    return { offer: null, remainder: data }
  }
  return {
    offer: data.slice(FRAME_HEADER_BYTES, LINK_OFFER_FRAME_BYTES),
    remainder: data.slice(LINK_OFFER_FRAME_BYTES),
  }
}

export function compareLinkOffers(left: Uint8Array, right: Uint8Array): number {
  const length = Math.min(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index]
  }
  return left.length - right.length
}

export function sameLinkOffer(left: Uint8Array, right: Uint8Array): boolean {
  return compareLinkOffers(left, right) === 0
}

export function parseAdvertisedLinkOffer(device: {
  serviceData?: Record<string, string> | null
}): Uint8Array | null {
  const serviceData = device.serviceData
  if (!serviceData) return null
  const expected = BLE_SERVICE_UUID.replace(/-/g, '').toLowerCase()
  for (const [uuid, value] of Object.entries(serviceData)) {
    if (uuid.replace(/-/g, '').toLowerCase() !== expected) continue
    try {
      const binary = atob(value)
      if (binary.length !== BLE_LINK_OFFER_BYTES) return null
      const offer = new Uint8Array(BLE_LINK_OFFER_BYTES)
      for (let index = 0; index < binary.length; index += 1) {
        offer[index] = binary.charCodeAt(index)
      }
      return offer
    } catch {
      return null
    }
  }
  return null
}
