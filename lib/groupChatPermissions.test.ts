/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'

import { canManageGroupDisappearingTimer } from './groupChatPermissions'

describe('group chat permissions', () => {
  it('allows owners and admins to manage disappearing timers', () => {
    expect(canManageGroupDisappearingTimer('owner')).toBe(true)
    expect(canManageGroupDisappearingTimer('admin')).toBe(true)
  })

  it('blocks members from managing disappearing timers', () => {
    expect(canManageGroupDisappearingTimer('member')).toBe(false)
  })

  it('blocks missing or unrecognized roles defensively', () => {
    expect(canManageGroupDisappearingTimer(null)).toBe(false)
    expect(canManageGroupDisappearingTimer(undefined)).toBe(false)
    expect(canManageGroupDisappearingTimer('creator' as any)).toBe(false)
  })
})
