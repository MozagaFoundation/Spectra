/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 */

import { describe, expect, it } from 'vitest'
import { generateDilithiumKeyPair } from './dilithium'
import {
  createSignedContactProfile,
  openContactCardProfile,
  sealContactCardProfile,
  verifySignedContactProfile,
} from './contactProfile'

const identityId = 'chat_identity_alice_12345678'
const cardId = 'scc1.0123456789abcdef0123456789abcdef'
const cardCapability = 'sccap1.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const profileCapability = 'sccpc1.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

describe('contact profiles', () => {
  it('signs and verifies a canonical contact profile', () => {
    const keys = generateDilithiumKeyPair()
    const profile = createSignedContactProfile({
      version: 1,
      identityId,
      revision: 1,
      displayName: 'Alice',
    }, keys.privateKey)

    expect(verifySignedContactProfile(profile, keys.publicKey, identityId)).toBe(true)
    expect(verifySignedContactProfile(
      { ...profile, displayName: 'Mallory' },
      keys.publicKey,
      identityId,
    )).toBe(false)
  })

  it('seals card profiles to the private profile capability and identity', () => {
    const keys = generateDilithiumKeyPair()
    const profile = createSignedContactProfile({
      version: 1,
      identityId,
      revision: 2,
      displayName: 'Alice',
      avatarDataUri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    }, keys.privateKey)
    const capsule = sealContactCardProfile(profile, cardId, profileCapability)

    expect(openContactCardProfile(capsule, cardId, profileCapability, identityId)).toEqual(profile)
    expect(() => openContactCardProfile(
      capsule,
      cardId,
      cardCapability,
      identityId,
    )).toThrow('Invalid contact card profile')
    expect(() => openContactCardProfile(
      capsule,
      cardId,
      'sccpc1.BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      identityId,
    )).toThrow('Invalid contact card profile')
    expect(() => openContactCardProfile(
      capsule,
      cardId,
      profileCapability,
      'chat_identity_mallory_12345678',
    )).toThrow('Invalid contact card profile')
  })
})
