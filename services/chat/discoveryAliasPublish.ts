/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { storedDiscoveryAlias } from '@/lib/discoveryAlias'
import {
  patchOwnDiscoveryAlias,
  type DiscoveryAliasLeaseFields,
} from '@/services/backend/ephemeralDiscovery'
import { SpectraBackendError } from '@/services/backend/request'
import { getIdentity } from '@/services/quantumChat'
import { useWalletStore } from '@/store/walletStore'
import { readAliasAutocomplete } from './aliasAutocompleteStorage'
import { ensureOwnContactProfile } from './contactProfile'
import { readDiscoveryVisibility } from './discoveryModeStorage'

export async function discoveryAliasLeaseFields(): Promise<DiscoveryAliasLeaseFields> {
  const wallet = useWalletStore.getState().wallet
  if (!wallet?.address || wallet.spectreMode) return {}

  const identity = getIdentity()
  const profile = identity ? await ensureOwnContactProfile(identity.id).catch(() => null) : null
  const discoveryAlias = storedDiscoveryAlias(profile?.displayName) || null
  return {
    discoveryAlias,
    aliasAutocomplete: await readAliasAutocomplete(wallet.address),
  }
}

export async function syncLiveDiscoveryAlias(): Promise<void> {
  const fields = await discoveryAliasLeaseFields()
  const result = await patchOwnDiscoveryAlias(fields)
  if (result === 'updated') return

  const wallet = useWalletStore.getState().wallet
  if (!wallet?.address || wallet.spectreMode) return
  if (await readDiscoveryVisibility(wallet.address) !== 'findable') return

  const { ensureActiveDiscoveryRent } = await import('./activeDiscoveryCoordinator') // cycle: coordinator reads alias fields here
  await ensureActiveDiscoveryRent()
  if (await patchOwnDiscoveryAlias(fields) === 'updated') return

  throw new SpectraBackendError(404, 'not_found')
}
