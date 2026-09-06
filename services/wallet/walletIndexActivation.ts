/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 */

import { ed25519 } from '@noble/curves/ed25519'
import { secp256k1 } from '@noble/curves/secp256k1'
import { sha256 } from '@noble/hashes/sha256'
import {
  buildWalletIndexActivationSigningMessage,
  type WalletIndexAddressProof,
  type WalletIndexChain,
} from '@spectra/privacy-protocol'
import {
  deriveBitcoinP2wpkhAddressFromPrivateKey,
  signMessage,
  type EXOWallet,
} from '@spectra/identity-vault'
import {
  beginWalletIndexActivationWithBackend,
  completeWalletIndexActivationWithBackend,
  issueWalletIndexActivationVdfWithBackend,
} from '@/services/backend/walletIndex'
import { ensureVerifiedBackendAccess } from '@/services/backend/session'
import {
  retryVdfSubmissionAfterServerFloor,
  waitForVdfChallengeAge,
} from '@/services/backend/vdfChallengeTiming'
import {
  getWalletAddressForNetwork,
  getWalletPrivateKeyForNetwork,
} from '@/services/crypto/chainRegistry'
import { solveVdfOnDevice } from '@/services/security/nativeVdf'
import { beginVdfActivity } from '@/services/shared/vdfActivity'
import {
  recordWalletIndexActivation,
  type WalletIndexLocalActivation,
} from '@/services/storage/walletIndexStorage'

const SIGNING_DOMAIN = 'spectra.wallet-index-activation.v1'
const encoder = new TextEncoder()

export interface WalletIndexActivationOptions {
  signal?: AbortSignal
}

function hexToBytes(value: string): Uint8Array {
  const normalized = value.trim().replace(/^0x/i, '')
  if (!/^[0-9a-f]{2,}$/i.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error('Invalid wallet signing key')
  }
  const bytes = new Uint8Array(normalized.length / 2)
  for (let index = 0; index < normalized.length; index += 2) {
    bytes[index / 2] = Number.parseInt(normalized.slice(index, index + 2), 16)
  }
  return bytes
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function compactSecp256k1Signature(message: string, privateKey: string): string {
  const signature = secp256k1.sign(sha256(encoder.encode(message)), hexToBytes(privateKey))
  return `${signature.r.toString(16).padStart(64, '0')}${signature.s.toString(16).padStart(64, '0')}`
}

export function resolveWalletIndexActivationAddress(
  wallet: EXOWallet,
  chain: WalletIndexChain,
): string | undefined {
  if (chain !== 'bitcoin') return getWalletAddressForNetwork(wallet, chain)
  const privateKey = getWalletPrivateKeyForNetwork(wallet, chain)
  if (!privateKey) return undefined
  try {
    return deriveBitcoinP2wpkhAddressFromPrivateKey(privateKey)
  } catch {
    throw new Error('Bitcoin wallet address cannot be derived')
  }
}

export async function createWalletIndexAddressProof(
  wallet: EXOWallet,
  chain: WalletIndexChain,
  activation: {
    activationId: string
    address: string
    nonceHex: string
    expiresAt: number
  },
): Promise<{ address: string; proof: WalletIndexAddressProof }> {
  if (!resolveWalletIndexActivationAddress(wallet, chain)) {
    throw new Error(`No ${chain} account is available`)
  }
  const address = activation.address
  const message = buildWalletIndexActivationSigningMessage({
    activationId: activation.activationId,
    ownerWalletAddress: wallet.address,
    chain,
    address,
    nonceHex: activation.nonceHex,
    expiresAt: activation.expiresAt,
  })

  if (chain === 'mozaga') {
    return {
      address,
      proof: {
        algorithm: 'mldsa65',
        publicKeyHex: wallet.publicKey,
        signatureHex: await signMessage(message, wallet.privateKey, { domain: SIGNING_DOMAIN }),
      },
    }
  }

  const privateKey = getWalletPrivateKeyForNetwork(wallet, chain)
  if (!privateKey) throw new Error(`No ${chain} signing key is available`)
  const privateKeyBytes = hexToBytes(privateKey)
  if (chain === 'solana') {
    return {
      address,
      proof: {
        algorithm: 'ed25519',
        publicKeyHex: bytesToHex(ed25519.getPublicKey(privateKeyBytes)),
        signatureHex: bytesToHex(ed25519.sign(encoder.encode(message), privateKeyBytes)),
      },
    }
  }
  return {
    address,
    proof: {
      algorithm: 'secp256k1',
      publicKeyHex: bytesToHex(secp256k1.getPublicKey(privateKeyBytes, chain === 'bitcoin')),
      signatureHex: compactSecp256k1Signature(message, privateKey),
    },
  }
}

function finishActivity(
  activity: ReturnType<typeof beginVdfActivity>,
  error: unknown,
): void {
  if (error instanceof Error && error.name === 'AbortError') {
    activity.cancel()
    return
  }
  activity.fail()
}

export async function activateWalletIndex(
  wallet: EXOWallet,
  chain: WalletIndexChain,
  options: WalletIndexActivationOptions = {},
): Promise<WalletIndexLocalActivation> {
  if (wallet.spectreMode) {
    throw new Error('Wallet indexing is unavailable in Spectre mode')
  }
  const address = resolveWalletIndexActivationAddress(wallet, chain)
  if (!address) throw new Error(`No ${chain} account is available`)
  const session = await ensureVerifiedBackendAccess({ signal: options.signal })
  if (!session || session.exoAddress.toLowerCase() !== wallet.address.toLowerCase()) {
    throw new Error('Secure online access is required for wallet indexing')
  }
  const backend = { accessToken: session.accessToken }
  const started = await beginWalletIndexActivationWithBackend(chain, address, backend)
  if (!started.data) {
    if (chain === 'bitcoin') {
      console.warn('[WalletIndex] bitcoin_activation_begin_failed', {
        addressLength: address.length,
        hasMainnetBech32Prefix: address.startsWith('bc1'),
        isLowercase: address === address.toLowerCase(),
        error: started.error?.message,
      })
    }
    throw started.error ?? new Error('Could not start wallet indexing')
  }
  if (started.data.chain !== chain) throw new Error('Invalid wallet activation response')
  const signed = await createWalletIndexAddressProof(wallet, chain, started.data)
  if (signed.address !== started.data.address) throw new Error('Wallet address changed during activation')
  const challenge = await issueWalletIndexActivationVdfWithBackend(
    started.data.activationId,
    signed.proof,
    backend,
  )
  if (!challenge.data) {
    if (chain === 'bitcoin') {
      console.warn('[WalletIndex] bitcoin_activation_proof_failed', {
        addressLength: signed.address.length,
        hasMainnetBech32Prefix: signed.address.startsWith('bc1'),
        isLowercase: signed.address === signed.address.toLowerCase(),
        publicKeyHexLength: signed.proof.publicKeyHex.length,
        signatureHexLength: signed.proof.signatureHex.length,
        error: challenge.error?.message,
      })
    }
    throw challenge.error ?? new Error('Could not start wallet activation proof')
  }
  const activationId = challenge.data.activationId
  const vdfChallenge = challenge.data.vdfChallenge

  const controller = new AbortController()
  const abort = () => controller.abort()
  options.signal?.addEventListener('abort', abort, { once: true })
  if (options.signal?.aborted) controller.abort()
  const activity = beginVdfActivity({
    action: 'wallet_index_activation',
    cancel: () => controller.abort(),
    canCancel: true,
  })
  try {
    const vdfProof = await solveVdfOnDevice(vdfChallenge.params, {
      challengeId: vdfChallenge.challengeId,
      nonceHex: vdfChallenge.nonceHex,
      action: 'wallet_index_activation',
      bindingHash: vdfChallenge.bindingHash,
    }, {
      signal: controller.signal,
      onProgress: (progress) => activity.progress(progress),
    })
    activity.waitForServer(vdfChallenge.notBeforeAt)
    await waitForVdfChallengeAge(vdfChallenge.notBeforeAt, controller.signal, (
      notBeforeAt,
      retrying,
    ) => activity.waitForServer(notBeforeAt, retrying))
    activity.submit()
    const completed = await retryVdfSubmissionAfterServerFloor(
      async () => {
        const result = await completeWalletIndexActivationWithBackend(
          activationId,
          vdfProof,
          backend,
        )
        if (!result.data) throw result.error ?? new Error('Could not activate wallet indexing')
        return result.data
      },
      controller.signal,
      (notBeforeAt, retrying) => activity.waitForServer(notBeforeAt, retrying),
    )
    const local = {
      chain: completed.chain,
      address: completed.address,
      baselineHeight: completed.baselineHeight,
      leaseGeneration: completed.leaseGeneration,
      activatedAt: completed.activatedAt,
      expiresAt: completed.expiresAt,
    } satisfies WalletIndexLocalActivation
    await recordWalletIndexActivation(wallet.address, local)
    activity.complete()
    return local
  } catch (error) {
    finishActivity(activity, error)
    throw error
  } finally {
    options.signal?.removeEventListener('abort', abort)
  }
}
