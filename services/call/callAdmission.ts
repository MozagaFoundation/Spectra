/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { isSpectrePolicyActive } from '@/lib/spectrePolicy'
import { useSpectreStore } from '@/store/spectreStore'
import { useWalletStore } from '@/store/walletStore'
import { useTorStore } from '@/services/tor/torStore'

export const SPECTRE_CALL_DISABLED_ERROR = 'Calls are disabled in Spectre Mode.'
export const TOR_CALL_DISABLED_ERROR = 'Calls are unavailable while Tor mode is active.'

export type CallAdmissionBlockReason = 'spectre' | 'tor' | null

export function getCallAdmissionBlockReason(): CallAdmissionBlockReason {
  const spectreState = useSpectreStore.getState()
  const wallet = useWalletStore.getState().wallet
  if (
    spectreState.isApplying
    || isSpectrePolicyActive({
      enabled: spectreState.enabled,
      accountMode: spectreState.spectreAccountMode,
      walletIsSpectre: wallet?.spectreMode === true,
    })
  ) {
    return 'spectre'
  }

  const torState = useTorStore.getState()
  return torState.enabled || torState.status === 'connecting' ? 'tor' : null
}

export function assertCallAdmission(): void {
  const blockReason = getCallAdmissionBlockReason()
  if (blockReason === 'spectre') {
    throw new Error(SPECTRE_CALL_DISABLED_ERROR)
  }
  if (blockReason === 'tor') {
    throw new Error(TOR_CALL_DISABLED_ERROR)
  }
}

export function canAdmitCalls(): boolean {
  return getCallAdmissionBlockReason() === null
}
