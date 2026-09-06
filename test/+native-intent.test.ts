/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, describe, expect, it } from 'vitest'

import { redirectSystemPath } from '../app/+native-intent'
import { consumePendingContactShareAddress } from '../lib/pendingContactShare'

describe('redirectSystemPath', () => {
  afterEach(() => {
    consumePendingContactShareAddress()
  })
  it('blocks direct onboarding deep links that could skip app-controlled guards', () => {
    expect(redirectSystemPath({ path: '/(auth)/backup-mnemonic', initial: true })).toBe('/')
    expect(redirectSystemPath({ path: 'spectra://set-pin', initial: true })).toBe('/')
    expect(redirectSystemPath({ path: '/(main)/(auth)/set-pin', initial: true })).toBe('/')
    expect(redirectSystemPath({ path: '/(auth)/(auth)/verify-mnemonic', initial: true })).toBe('/')
    expect(redirectSystemPath({ path: 'https://spectra.example/(main)/(auth)/import-wallet', initial: true })).toBe('/')
    expect(redirectSystemPath({ path: 'spectra://set-pin?manifest=file:///tmp/manifest.json', initial: true })).toBe('/')
  })

  it('allows unlock and language selection entry points', () => {
    expect(redirectSystemPath({ path: '/(auth)/unlock', initial: true })).toBe('/unlock')
    expect(redirectSystemPath({ path: 'spectra://select-language', initial: true })).toBe('/select-language')
    expect(redirectSystemPath({ path: '/(main)/(auth)/unlock', initial: true })).toBe('/unlock')
  })

  it('allows reusable EXO contact share links', () => {
    const address = `EXO00${'ab'.repeat(19)}`
    expect(redirectSystemPath({ path: `spectra://u/${address}`, initial: true }))
      .toBe(`/contact/add?scannedInvite=${encodeURIComponent(address)}`)
    expect(consumePendingContactShareAddress()).toBe(address)
    expect(redirectSystemPath({ path: `https://spectraprotocol.org/u/${address}`, initial: true }))
      .toBe(`/contact/add?scannedInvite=${encodeURIComponent(address)}`)
    expect(consumePendingContactShareAddress()).toBe(address)
    expect(redirectSystemPath({ path: `https://spectra.app/u/${address}`, initial: true })).toBe('/')
    expect(consumePendingContactShareAddress()).toBeNull()
    expect(redirectSystemPath({ path: `spectra://u/${address}?next=/chat`, initial: true }))
      .toBe('/')
    expect(consumePendingContactShareAddress()).toBeNull()
    expect(redirectSystemPath({ path: 'spectra://u/not-an-address', initial: true })).toBe('/')
    expect(consumePendingContactShareAddress()).toBeNull()
  })

  it('preserves safe query parameters for share-extension handoff links', () => {
    const manifest = 'file:///private/var/mobile/Containers/Shared/AppGroup/group.org.spectra/SpectraShare/123e4567-e89b-12d3-a456-426614174000/manifest.json'
    expect(redirectSystemPath({
      path: `spectra://share/import?manifest=${encodeURIComponent(manifest)}`,
      initial: true,
    })).toBe(`/share/import?manifest=${encodeURIComponent(manifest)}`)
  })

  it('allows only explicit supported routes', () => {
    expect(redirectSystemPath({ path: '/(main)/(main)//unlock', initial: false }))
      .toBe('/unlock')
    expect(redirectSystemPath({ path: '/(main)/chat/exo1abc', initial: false }))
      .toBe('/')
  })

  it('rejects unknown, duplicate, sensitive, credential, and object-reference input', () => {
    const attempts = [
      'spectra://unlock?next=/chat/alice',
      'spectra://unknown/join/InviteCode123?code=one&code=two',
      'spectra://unknown/join/InviteCode123',
      'spectra://unknown/join/InviteCode123?token=secret',
      'spectra://user:password@unknown/join/InviteCode123',
      'spectra://objects/chat-media/sender/file.enc',
      'spectra://unknown/join/InviteCode123#fragment',
      'https://evil.example/unknown/join/InviteCode123',
      'http://spectraprotocol.org/unknown/join/InviteCode123',
    ]
    for (const path of attempts) {
      expect(redirectSystemPath({ path, initial: true })).toBe('/')
    }
  })

  it('rejects development-client paths and empty input', () => {
    expect(redirectSystemPath({ path: '/expo-development-client/?url=local', initial: true })).toBe('/')
    expect(redirectSystemPath({ path: '   ', initial: true })).toBe('/')
  })
})
