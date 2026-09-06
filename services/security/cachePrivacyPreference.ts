/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import * as SecureStore from 'expo-secure-store'

import { SECURE_STORE_OPTIONS, VAULT_SECURITY_KEYS } from '@/lib/constants'

const MESSAGE_CACHE_PRIVACY_MODES = ['standard', 'clear_on_lock', 'strict'] as const

export type MessageCachePrivacyMode = typeof MESSAGE_CACHE_PRIVACY_MODES[number]

export function parseMessageCachePrivacyMode(_value: string | null): MessageCachePrivacyMode {
  return 'strict'
}

export async function getClearImageCacheOnLockEnabled(): Promise<boolean> {
  return (await SecureStore.getItemAsync(
    VAULT_SECURITY_KEYS.CLEAR_IMAGE_CACHE_ON_LOCK,
    SECURE_STORE_OPTIONS,
  )) === 'true'
}

export async function setClearImageCacheOnLockEnabled(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(
    VAULT_SECURITY_KEYS.CLEAR_IMAGE_CACHE_ON_LOCK,
    String(enabled),
    SECURE_STORE_OPTIONS,
  )
}

export async function getMessageCachePrivacyMode(): Promise<MessageCachePrivacyMode> {
  const raw = await SecureStore.getItemAsync(
    VAULT_SECURITY_KEYS.MESSAGE_CACHE_PRIVACY_MODE,
    SECURE_STORE_OPTIONS,
  )
  if (raw !== 'strict') {
    await SecureStore.setItemAsync(
      VAULT_SECURITY_KEYS.MESSAGE_CACHE_PRIVACY_MODE,
      'strict',
      SECURE_STORE_OPTIONS,
    )
  }
  return 'strict'
}

export async function setStoredMessageCachePrivacyMode(_mode: MessageCachePrivacyMode): Promise<void> {
  await SecureStore.setItemAsync(
    VAULT_SECURITY_KEYS.MESSAGE_CACHE_PRIVACY_MODE,
    'strict',
    SECURE_STORE_OPTIONS,
  )
}
