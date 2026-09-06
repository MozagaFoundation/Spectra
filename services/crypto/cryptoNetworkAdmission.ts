/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import {
  SPECTRE_CRYPTO_MESSAGE,
  getSpectreCryptoRestrictionMessage,
  type SpectreCryptoNetworkId,
} from '@/lib/spectrePolicy'
import { useSpectreStore } from '@/store/spectreStore'
import { useWalletStore } from '@/store/walletStore'

function getSpectrePolicyState() {
  const spectreState = useSpectreStore.getState()
  const wallet = useWalletStore.getState().wallet
  return {
    isApplying: spectreState.isApplying,
    enabled: spectreState.enabled,
    accountMode: spectreState.spectreAccountMode,
    walletIsSpectre: wallet?.spectreMode === true,
  }
}

export function getCryptoNetworkAdmissionError(
  networkId: SpectreCryptoNetworkId,
): Error | null {
  const policyState = getSpectrePolicyState()
  const message = policyState.isApplying
    ? SPECTRE_CRYPTO_MESSAGE
    : getSpectreCryptoRestrictionMessage(policyState, networkId)
  return message ? new Error(message) : null
}

export function assertCryptoNetworkAdmission(networkId: SpectreCryptoNetworkId): void {
  const error = getCryptoNetworkAdmissionError(networkId)
  if (error) {
    throw error
  }
}

export function assertCryptoNetworkAdmissions(
  networkIds: Iterable<SpectreCryptoNetworkId>,
): void {
  for (const networkId of networkIds) {
    assertCryptoNetworkAdmission(networkId)
  }
}
