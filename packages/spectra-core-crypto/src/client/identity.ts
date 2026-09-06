/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

/**
 * Identity Management
 * 
 * Handles creation and management of chat identities,
 * both anonymous and blockchain-linked.
 * All data is stored locally.
 */

import type {
  ChatIdentity,
  ChatIdentityWithKeys,
  PublicKeyBundle,
  PrivateKeyBundle,
  ChatConfig
} from '../types/index'
import { ChatError } from '../types/index'
import {
  generateDilithiumKeyPair
} from '../crypto/dilithium'
import { generateX25519KeyPair } from '../crypto/x25519'
import { generateMLKEMKeyPairAsync } from '../crypto/mlkem'
import { createPublicKeyBundleAsync, generateOneTimePreKeysAsync, STARTUP_PREKEY_COUNT, verifyPublicKeyBundleAsync } from '../crypto/x3dh'
import { verifyPublicKeyBundleWalletAuthorizationAsync } from '../crypto/walletAuthorization'
import { generateUUID } from '../crypto/utils'
import { localChatStorage } from '../storage/local'

// Minimum number of OPKs before replenishment
const MIN_OPK_COUNT = 5
// Number of OPKs to generate when replenishing
const OPK_REPLENISH_COUNT = 10

// Identity Creation

function yieldDuringOpkGeneration(config: ChatConfig): () => Promise<void> {
  return () => {
    if (config.cooperativeScheduler) {
      return config.cooperativeScheduler.yieldToHost('opk_generate', {
        processed: 0,
        remaining: 0,
        priority: 'background',
      })
    }
    return new Promise((resolve) => setTimeout(resolve, 0))
  }
}

/**
 * Create a new anonymous chat identity
 * Uses hybrid X25519 + ML-KEM for post-quantum key establishment
 */
export async function createAnonymousIdentity(
  config: ChatConfig
): Promise<{ identity: ChatIdentityWithKeys; bundle: PublicKeyBundle; privateBundle: PrivateKeyBundle }> {
  // Generate an ML-DSA-65 key pair for post-quantum signatures
  const dilithiumKeys = generateDilithiumKeyPair()
  
  // Generate X25519 identity key pair for classical key exchange
  const identityKeyPair = generateX25519KeyPair()
  const mlkemKeyPair = await generateMLKEMKeyPairAsync()
  
  // Create identity
  const id = generateUUID()
  const identity: ChatIdentityWithKeys = {
    id,
    displayName: config.displayName,
    identityPublicKey: identityKeyPair.publicKey,
    identityPrivateKey: identityKeyPair.privateKey,
    mlkemPublicKey: mlkemKeyPair.publicKey,
    mlkemPrivateKey: mlkemKeyPair.privateKey,
    dilithiumPublicKey: dilithiumKeys.publicKey,
    dilithiumPrivateKey: dilithiumKeys.privateKey,
    createdAt: Date.now(),
    isAnonymous: true
  }
  
  // Create hybrid key bundle for X3DH using the identity key pair above.
  const { bundle, privateBundle } = await createPublicKeyBundleAsync(
    id,
    identityKeyPair.publicKey,
    dilithiumKeys.publicKey,
    dilithiumKeys.privateKey,
    identityKeyPair.privateKey,
    mlkemKeyPair,
    config.preKeyCount ?? STARTUP_PREKEY_COUNT,
    yieldDuringOpkGeneration(config),
  )
  
  // Store identity locally
  await localChatStorage.storeIdentity(identity)
  await localChatStorage.storePrivateKeyBundle(id, privateBundle)
  await localChatStorage.storePublicKeyBundle(id, bundle)
  
  return { identity, bundle, privateBundle }
}

/**
 * Create a chat identity linked to a blockchain address
 * Uses hybrid X25519 + ML-KEM for post-quantum key establishment
 */
export async function createLinkedIdentity(
  config: ChatConfig
): Promise<{ identity: ChatIdentityWithKeys; bundle: PublicKeyBundle; privateBundle: PrivateKeyBundle }> {
  if (!config.identity) {
    throw new ChatError('Blockchain identity required for linked identity', 'INVALID_CONFIG')
  }
  
  // Use provided ML-DSA-65 keys from blockchain identity
  const dilithiumPublicKey = config.identity.publicKey
  const dilithiumPrivateKey = config.identity.privateKey
  
  // Generate X25519 identity key pair for classical key exchange
  const identityKeyPair = generateX25519KeyPair()
  const mlkemKeyPair = await generateMLKEMKeyPairAsync()
  
  // Create identity
  const id = generateUUID()
  const identity: ChatIdentityWithKeys = {
    id,
    displayName: config.displayName,
    blockchainAddress: config.identity.address,
    identityPublicKey: identityKeyPair.publicKey,
    identityPrivateKey: identityKeyPair.privateKey,
    mlkemPublicKey: mlkemKeyPair.publicKey,
    mlkemPrivateKey: mlkemKeyPair.privateKey,
    dilithiumPublicKey,
    dilithiumPrivateKey,
    createdAt: Date.now(),
    isAnonymous: false
  }
  
  // Create hybrid key bundle for X3DH using the identity key pair above.
  const { bundle, privateBundle } = await createPublicKeyBundleAsync(
    id,
    identityKeyPair.publicKey,
    dilithiumPublicKey,
    dilithiumPrivateKey,
    identityKeyPair.privateKey,
    mlkemKeyPair,
    config.preKeyCount ?? STARTUP_PREKEY_COUNT,
    yieldDuringOpkGeneration(config),
  )
  
  // Store identity locally
  await localChatStorage.storeIdentity(identity)
  await localChatStorage.storePrivateKeyBundle(id, privateBundle)
  await localChatStorage.storePublicKeyBundle(id, bundle)
  
  return { identity, bundle, privateBundle }
}

/**
 * Load an existing identity from local storage
 */
export async function loadIdentity(
  identityId: string
): Promise<{ identity: ChatIdentityWithKeys; privateBundle: PrivateKeyBundle } | null> {
  const identity = await localChatStorage.getIdentity(identityId)
  if (!identity) return null
  
  const privateBundle = await localChatStorage.getPrivateKeyBundle(identityId)
  if (!privateBundle) return null
  
  return { identity, privateBundle }
}

/**
 * Load identity by blockchain address
 */
export async function loadIdentityByAddress(
  address: string
): Promise<{ identity: ChatIdentityWithKeys; privateBundle: PrivateKeyBundle } | null> {
  const identity = await localChatStorage.getIdentityByAddress(address)
  if (!identity) return null
  
  const privateBundle = await localChatStorage.getPrivateKeyBundle(identity.id)
  if (!privateBundle) return null
  
  return { identity, privateBundle }
}

/**
 * Get all stored identities
 */
export async function getAllIdentities(): Promise<ChatIdentityWithKeys[]> {
  return localChatStorage.getAllIdentities()
}

/**
 * Export identity for backup (includes hybrid keys)
 */
export function exportIdentity(identity: ChatIdentityWithKeys): string {
  return JSON.stringify({
    version: 2, // Bumped version for hybrid key support
    identity: {
      id: identity.id,
      displayName: identity.displayName,
      blockchainAddress: identity.blockchainAddress,
      identityPublicKey: identity.identityPublicKey,
      identityPrivateKey: identity.identityPrivateKey,
      mlkemPublicKey: identity.mlkemPublicKey,
      mlkemPrivateKey: identity.mlkemPrivateKey,
      dilithiumPublicKey: identity.dilithiumPublicKey,
      dilithiumPrivateKey: identity.dilithiumPrivateKey,
      createdAt: identity.createdAt,
      isAnonymous: identity.isAnonymous
    }
  })
}

/**
 * Import identity from backup (supports v1 and v2 formats)
 */
export async function importIdentity(exportedData: string): Promise<ChatIdentityWithKeys> {
  const data = JSON.parse(exportedData)
  
  if (data.version !== 1 && data.version !== 2) {
    throw new ChatError('Unsupported identity export version', 'INVALID_FORMAT')
  }
  
  // Handle v1 format (without ML-KEM keys) - generate new ML-KEM keys
  if (data.version === 1) {
    const mlkemKeyPair = await generateMLKEMKeyPairAsync()
    data.identity.mlkemPublicKey = mlkemKeyPair.publicKey
    data.identity.mlkemPrivateKey = mlkemKeyPair.privateKey
  }
  
  const identity: ChatIdentityWithKeys = data.identity
  
  // Store locally
  await localChatStorage.storeIdentity(identity)
  
  return identity
}

// IDENTITY LOOKUP (Local)

/**
 * Find identity by blockchain address (local storage)
 */
export async function findIdentityByAddress(address: string): Promise<ChatIdentity | null> {
  return localChatStorage.getIdentityByAddress(address)
}

/**
 * Get identity by ID (local storage)
 */
export async function getIdentity(id: string): Promise<ChatIdentity | null> {
  return localChatStorage.getIdentity(id)
}

/**
 * Get public key bundle for an identity (local storage)
 * Automatically replenishes OPKs if running low
 */
export async function getPublicKeyBundle(identityId: string): Promise<PublicKeyBundle | null> {
  const bundle = await localChatStorage.getPublicKeyBundle(identityId)
  if (!bundle) return null
  
  // Check if we need to replenish OPKs
  if (bundle.oneTimePreKeys.length < MIN_OPK_COUNT) {
    // Get private bundle for storing generated OPK private keys
    const privateBundle = await localChatStorage.getPrivateKeyBundle(identityId)
    
    if (privateBundle) {
      // Find the highest existing OPK ID to continue from
      const existingIds = bundle.oneTimePreKeys.map(k => k.id)
      const privateIds = Array.from(privateBundle.oneTimePreKeyPrivates.keys())
      const maxId = Math.max(...existingIds, ...privateIds, 0)
      
      // Generate new OPKs
      const { preKeys, x25519PrivateKeys, mlkemPrivateKeys } = await generateOneTimePreKeysAsync(
        maxId + 1,
        OPK_REPLENISH_COUNT,
      )
      
      // Add new keys to bundles
      bundle.oneTimePreKeys = [...bundle.oneTimePreKeys, ...preKeys]
      
      // Merge new private keys
      x25519PrivateKeys.forEach((value, key) => {
        privateBundle.oneTimePreKeyPrivates.set(key, value)
      })
      mlkemPrivateKeys.forEach((value, key) => {
        privateBundle.mlkemOneTimePreKeyPrivates.set(key, value)
      })
      
      // Store updated bundles
      await localChatStorage.storePublicKeyBundle(identityId, bundle)
      await localChatStorage.storePrivateKeyBundle(identityId, privateBundle)
    }
  }
  
  return bundle
}

export interface StoreContactBundleOptions {
  expectedWalletAddress?: string
}

export function contactBundleAlreadyStored(
  stored: PublicKeyBundle | null | undefined,
  incoming: PublicKeyBundle,
): boolean {
  return Boolean(
    stored
    && stored.identityId === incoming.identityId
    && stored.identityKey === incoming.identityKey
    && stored.dilithiumKey === incoming.dilithiumKey
    && stored.mlkemIdentityKey === incoming.mlkemIdentityKey
    && stored.version === incoming.version
    && stored.bundleSignature === incoming.bundleSignature
  )
}

export function shouldPersistContactBundle(
  stored: PublicKeyBundle | null | undefined,
  incoming: PublicKeyBundle,
): boolean {
  if (!stored) return true
  const identityChanged = stored.identityKey !== incoming.identityKey
    || stored.dilithiumKey !== incoming.dilithiumKey
    || stored.mlkemIdentityKey !== incoming.mlkemIdentityKey
  if (identityChanged) return true
  return !contactBundleAlreadyStored(stored, incoming)
}

/**
 * Store a remote contact's public key bundle.
 */
export async function storeContactBundle(
  bundle: PublicKeyBundle,
  options: StoreContactBundleOptions = {}
): Promise<void> {
  const verification = await verifyPublicKeyBundleAsync(bundle)
  if (!verification.valid) {
    throw new ChatError(`Invalid contact key bundle: ${verification.error}`, 'INVALID_BUNDLE')
  }
  if (bundle.walletAuthorization || options.expectedWalletAddress) {
    const walletVerification = await verifyPublicKeyBundleWalletAuthorizationAsync(
      bundle,
      options.expectedWalletAddress,
    )
    if (!walletVerification.valid) {
      throw new ChatError(`Invalid contact wallet authorization: ${walletVerification.error}`, 'INVALID_BUNDLE')
    }
  }
  await localChatStorage.storePublicKeyBundle(bundle.identityId, bundle)
}
