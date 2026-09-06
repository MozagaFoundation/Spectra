/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { EXOWallet } from '@spectra/identity-vault'

export function getRootExoWallet(wallets: EXOWallet[]): EXOWallet | null {
  const normalWallets = wallets.filter((wallet) => wallet.spectreMode !== true)
  return normalWallets.find((wallet) => wallet.transparentMode !== true)
    ?? normalWallets[0]
    ?? null
}
