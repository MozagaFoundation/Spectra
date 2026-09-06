/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

export type SpectreAccountMode = 'mnemonic' | 'persistent_generated' | 'expendable' | null
export type SpectreCryptoNetworkId = 'mozaga' | 'ethereum' | 'bitcoin' | 'solana' | 'tron'

export interface SpectrePolicyState {
  enabled: boolean
  accountMode?: SpectreAccountMode
  walletIsSpectre?: boolean
  currentSpectreIsEphemeral?: boolean | null
}

export const SPECTRE_TEXT_ONLY_MESSAGE =
  'Spectre Mode only allows plain encrypted text messages. Media, voice notes, transfers, and tags are disabled.'
export const SPECTRE_TRANSFER_MESSAGE =
  'Transfers are disabled while Spectre Mode is active.'
export const SPECTRE_TAG_MESSAGE =
  'Tags are disabled while Spectre Mode is active.'
export const SPECTRE_AGORA_MESSAGE =
  'Agora is unavailable while Spectre Mode is active.'
export const SPECTRE_CRYPTO_MESSAGE =
  'Crypto features are unavailable while Spectre Mode is active.'
export const SPECTRE_RECEIVED_MEDIA_MESSAGE =
  'Media is hidden while Spectre Mode is active.'
export const SPECTRE_BLOCKED_MEDIA_SOURCE = 'spectre_received_media_blocked'

export function isSpectrePolicyActive(state: SpectrePolicyState): boolean {
  return state.enabled || state.walletIsSpectre === true
}

export function canUseCryptoNetworkInSpectre(
  state: SpectrePolicyState,
  _networkId: SpectreCryptoNetworkId,
): boolean {
  return !isSpectrePolicyActive(state)
}

export function getSpectreCryptoRestrictionMessage(
  state: SpectrePolicyState,
  networkId: SpectreCryptoNetworkId,
): string | null {
  if (canUseCryptoNetworkInSpectre(state, networkId)) {
    return null
  }

  return SPECTRE_CRYPTO_MESSAGE
}

export function assertCryptoNetworkInSpectre(
  state: SpectrePolicyState,
  networkId: SpectreCryptoNetworkId,
): void {
  const message = getSpectreCryptoRestrictionMessage(state, networkId)
  if (message) {
    throw new Error(message)
  }
}

export function canSendMediaInSpectre(state: SpectrePolicyState): boolean {
  return !isSpectrePolicyActive(state)
}

export function canReceiveMediaInSpectre(state: SpectrePolicyState): boolean {
  return !isSpectrePolicyActive(state)
}

export function canSendTransfersInSpectre(state: SpectrePolicyState): boolean {
  return !isSpectrePolicyActive(state)
}

export function canUseTagsInSpectre(state: SpectrePolicyState): boolean {
  return !isSpectrePolicyActive(state)
}

export function isCryptoReceiptContent(content: string): boolean {
  const trimmed = content.trim()
  return trimmed.startsWith('[CRYPTO_TX:') ||
    trimmed.startsWith('[CRYPTO_TX_V2:') ||
    trimmed.startsWith('[CRYPTO_TX_V3:')
}

export function isCryptoPaymentRequestContent(content: string): boolean {
  const trimmed = content.trim()
  return trimmed.includes('"type":"crypto_payment_request"') ||
    trimmed.includes('"type":"crypto_payment_request_update"')
}

export function hasHashtagContent(content: string): boolean {
  return /#\w+/.test(content)
}

export function getSpectreChatRestrictionMessage(
  state: SpectrePolicyState,
  options: {
    hasAttachments?: boolean
    content?: string
    hasTags?: boolean
    hasSpecialDelivery?: boolean
  },
): string | null {
  if (!isSpectrePolicyActive(state)) {
    return null
  }

  if (options.hasAttachments || options.hasSpecialDelivery) {
    return SPECTRE_TEXT_ONLY_MESSAGE
  }

  if (options.content && (isCryptoReceiptContent(options.content) || isCryptoPaymentRequestContent(options.content))) {
    return SPECTRE_TRANSFER_MESSAGE
  }

  if (options.hasTags || (options.content && hasHashtagContent(options.content))) {
    return SPECTRE_TAG_MESSAGE
  }

  return null
}
