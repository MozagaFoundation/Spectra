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

export interface EXOWallet {
  id: string
  address: string          // EXO address
  publicKey: string        // ML-DSA-65 public key (hex)
  privateKey: string       // ML-DSA-65 private key (hex)
  displayName?: string
  spectreMode?: boolean
  transparentMode?: boolean
  createdAt: number

  // Ethereum BIP44 account.
  ethereumAddress?: string      // Checksum address
  ethereumPublicKey?: string    // secp256k1 public key
  ethereumPrivateKey?: string   // secp256k1 private key

  // Derived chain accounts.
  // Keep Ethereum fields for existing vaults.
  chainAccounts?: ChainAccounts
}

export interface VaultContents {
  wallets: EXOWallet[]
  activeWalletId: string | null
  version: number
  addressBookKeys?: Record<string, string>
}

export interface EncryptedVault {
  data: string             // encrypted JSON
  iv: string               // base64 IV
  salt: string             // base64 salt
  version: number
  kdfIterations?: number
}
