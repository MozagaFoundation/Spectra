/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { Alert, Linking } from 'react-native'

import { translateMessage } from '@/lib/i18n/messages'
import { isSpectrePolicyActive } from '@/lib/spectrePolicy'
import { useSpectreStore } from '@/store/spectreStore'
import { useWalletStore } from '@/store/walletStore'

export const SPECTRE_EXTERNAL_LINK_BLOCKED_MESSAGE =
  'External links are unavailable while Spectre Mode is active.'

export function isExternalUrlAllowed(): boolean {
  const spectreState = useSpectreStore.getState()
  const wallet = useWalletStore.getState().wallet
  return !spectreState.isApplying && !isSpectrePolicyActive({
    enabled: spectreState.enabled,
    accountMode: spectreState.spectreAccountMode,
    walletIsSpectre: wallet?.spectreMode === true,
  })
}

export function assertExternalUrlAllowed(): void {
  if (!isExternalUrlAllowed()) {
    throw new Error(SPECTRE_EXTERNAL_LINK_BLOCKED_MESSAGE)
  }
}

export async function openExternalUrl(url: string): Promise<boolean> {
  if (!isExternalUrlAllowed()) {
    Alert.alert(
      translateMessage('External links unavailable'),
      translateMessage(SPECTRE_EXTERNAL_LINK_BLOCKED_MESSAGE),
    )
    return false
  }

  await Linking.openURL(url)
  return true
}
