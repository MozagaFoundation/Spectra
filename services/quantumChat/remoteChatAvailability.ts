/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { useBluetoothStore } from '@/store/bluetoothStore'
import { useSpectreStore } from '@/store/spectreStore'
import { useTorStore } from '@/services/tor/torStore'

export function isRemoteChatServiceAvailable(): boolean {
  const { internetAvailable } = useBluetoothStore.getState()
  if (useSpectreStore.getState().isApplying) {
    return false
  }
  const tor = useTorStore.getState()
  return internetAvailable && (!tor.enabled || tor.status === 'connected')
}
