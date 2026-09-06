/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

export type WalletChainAccountId = 'evm' | 'bitcoin' | 'solana' | 'tron'

export interface DerivedChainAccount {
  address: string
  publicKey: string
  privateKey: string
  derivationPath: string
}

export type ChainAccounts = Partial<Record<WalletChainAccountId, DerivedChainAccount>>

export type VaultKeySlotType = 'pin_device' | 'recovery_passphrase'
export type VaultKeySlotKdf = 'pbkdf2_sha256'

export interface VaultKeySlot {
  id: string
  type: VaultKeySlotType
  version: number
  kdf: VaultKeySlotKdf
  salt: string
  iterations: number
  iv: string
  wrappedKey: string
  createdAt: number
}

export interface EXOWallet {
  id: string
  address: string
  publicKey: string
  privateKey: string
  displayName?: string
  spectreMode?: boolean
  transparentMode?: boolean
  createdAt: number
  ethereumAddress?: string
  ethereumPublicKey?: string
  ethereumPrivateKey?: string
  chainAccounts?: ChainAccounts
}

export interface VaultContents {
  wallets: EXOWallet[]
  activeWalletId: string | null
  version: number
  addressBookKeys?: Record<string, string>
}

export interface EncryptedVault {
  data: string
  iv: string
  salt: string
  version: number
  kdfIterations?: number
  keySlots?: VaultKeySlot[]
}
