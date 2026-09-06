/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}))

vi.mock('@/lib/appMetadata', () => ({
  getRuntimeAppVersion: () => '1.2.5',
}))

const {
  getAppVersionHeaders,
  parseAppUpdateRequiredPolicy,
  parseAppVersionPolicyResponse,
} = await import('./appVersion')

describe('app version transport metadata', () => {
  it('uses strict semantic versions for native request metadata', () => {
    expect(getAppVersionHeaders()).toEqual({
      'X-Spectra-App-Version': '1.2.5',
      'X-Spectra-Client-Platform': 'ios',
    })
  })

  it('accepts only the configured platform store URL', () => {
    const policy = {
      error: 'app_update_required',
      platform: 'ios',
      minimumSupportedVersion: '1.2.1',
      latestVersion: '1.4.0',
      storeUrl: 'https://apps.apple.com/us/app/spectra-protocol/id6776937247',
      updateAvailable: true,
      updateRequired: true,
    }

    expect(parseAppUpdateRequiredPolicy(policy)).toMatchObject({
      platform: 'ios',
      latestVersion: '1.4.0',
    })
    expect(parseAppUpdateRequiredPolicy({
      ...policy,
      storeUrl: 'https://untrusted.example.test/update',
    })).toBeNull()
    expect(parseAppUpdateRequiredPolicy({
      ...policy,
      platform: 'android',
    })).toBeNull()
    expect(parseAppUpdateRequiredPolicy({
      ...policy,
      platform: 'android',
      storeUrl: 'https://spectraprotocol.org',
    })).toMatchObject({ platform: 'android' })

    expect(parseAppVersionPolicyResponse({ policy: null })).toBeNull()
    expect(parseAppVersionPolicyResponse({})).toBeUndefined()
    expect(parseAppVersionPolicyResponse({ policy: { ...policy, storeUrl: 'https://untrusted.example.test' } }))
      .toBeUndefined()
  })
})
