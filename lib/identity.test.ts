/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const loadIdentityByAddress = vi.hoisted(() => vi.fn())

vi.mock('@spectra/core-crypto/client/identity', () => ({
  loadIdentityByAddress,
}))

async function importSubject() {
  vi.resetModules()
  return import('./identity')
}

describe('identity cache and lookup', () => {
  beforeEach(() => {
    loadIdentityByAddress.mockReset()
  })

  it('prefers the local identity vault and caches the matching wallet identity', async () => {
    loadIdentityByAddress.mockResolvedValue({ identity: { id: 'local-id' } })
    const { getCachedIdentityId, getIdentityId } = await importSubject()

    await expect(getIdentityId('wallet-a')).resolves.toBe('local-id')

    expect(getCachedIdentityId()).toBe('local-id')
  })

  it('does not resolve identities through the Backend directory', async () => {
    loadIdentityByAddress.mockRejectedValue(new Error('local unavailable'))
    const { getIdentityId } = await importSubject()

    await expect(getIdentityId('wallet-a')).resolves.toBeNull()
  })

  it('returns null when the identity is unavailable locally', async () => {
    loadIdentityByAddress.mockRejectedValue(new Error('local unavailable'))
    const first = await importSubject()

    await expect(first.getIdentityId('wallet-a')).resolves.toBeNull()

    const second = await importSubject()
    loadIdentityByAddress.mockRejectedValue(new Error('local unavailable'))

    await expect(second.getIdentityId('wallet-a')).resolves.toBeNull()
  })

  it('clears cached identity state on account changes', async () => {
    loadIdentityByAddress.mockResolvedValue({ identity: { id: 'local-id' } })
    const { clearIdentityCache, getCachedIdentityId, getIdentityId } = await importSubject()

    await getIdentityId('wallet-a')
    expect(getCachedIdentityId()).toBe('local-id')

    clearIdentityCache()
    expect(getCachedIdentityId()).toBeNull()
  })
})
