/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { ImageSourcePropType } from 'react-native'
import type { CryptoNetworkId } from '@/services/crypto'

export const CRYPTO_NETWORK_ICONS: Record<CryptoNetworkId, ImageSourcePropType> = {
  mozaga: require('@/assets/images/logos/mozaga-color.png'),
  ethereum: require('@/assets/images/logos/eth-diamond-color.png'),
  bitcoin: require('@/assets/images/logos/bitcoin-btc-logo.png'),
  solana: require('@/assets/images/logos/solana-sol-logo.png'),
  tron: require('@/assets/images/logos/tron-trx-logo.png'),
}
