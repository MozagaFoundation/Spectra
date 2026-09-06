/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { SecureStoreOptions } from 'expo-secure-store'

export const APP_NAME = 'Spectra'
export const APP_VERSION = '1.2.5'

// Expo maps this value to kSecAttrAccessibleWhenUnlockedThisDeviceOnly.
const THIS_DEVICE_ONLY_ACCESSIBILITY: SecureStoreOptions['keychainAccessible'] = 6

export const SPECTRA_API_URL = process.env.EXPO_PUBLIC_SPECTRA_API_URL || ''
export const EXPLORER_URL = ''
export const MOZAGA_RPC_URL = process.env.EXPO_PUBLIC_MOZAGA_RPC_URL || 'https://creaprotocol.com'
export const ETH_RPC_URL = ''
export const ETH_EXPLORER_URL = process.env.EXPO_PUBLIC_ETH_EXPLORER_URL || 'https://etherscan.io'
export const BITCOIN_RPC_URL = ''
export const BITCOIN_EXPLORER_URL = process.env.EXPO_PUBLIC_BITCOIN_EXPLORER_URL || 'https://mempool.space'
export const SOLANA_RPC_URL = ''
export const SOLANA_EXPLORER_URL = process.env.EXPO_PUBLIC_SOLANA_EXPLORER_URL || 'https://explorer.solana.com'
export const TRON_RPC_URL = ''
export const TRON_EXPLORER_URL = process.env.EXPO_PUBLIC_TRON_EXPLORER_URL || 'https://tronscan.org/#'

export const STORAGE_KEYS = {
  VAULT: 'exo_vault',
  SESSION: 'exo_session',
  HAS_WALLET: 'exo_has_wallet',
  SPECTRE_MODE: 'exo_spectre_mode',
  SPECTRE_SNAPSHOT: 'exo_spectre_snapshot',
  SPECTRE_WALLET_ID: 'exo_spectre_wallet_id',
  SPECTRE_ACCOUNT_MODE: 'exo_spectre_account_mode',
  PENDING_SPECTRE_REMOTE_ACTIVATION: 'exo_pending_spectre_remote_activation',
  PENDING_SPECTRE_BLIND_TOKEN: 'exo_pending_spectre_blind_token',
  PENDING_ACCOUNT_DELETION: 'spectra_pending_account_deletion_v1',
  SPECTRE_ACCESS_STATE: 'exo_spectre_access_state',
  BIOMETRIC_ENABLED: 'exo_biometric_enabled',
  LAST_ACTIVE: 'exo_last_active',
  THEME: 'exo_theme',
  USER_SETTINGS: 'exo_user_settings',
  ARCHIVED_CONVERSATIONS: 'exo_archived_conversations',
  PINNED_CONVERSATIONS: 'exo_pinned_conversations',
  MANUALLY_UNREAD_CONVERSATIONS: 'exo_manually_unread_conversations',
  MUTED_CONVERSATIONS: 'exo_muted_conversations',
  EXO_ACCOUNT_UNREAD_NOTIFICATIONS: 'exo_account_unread_notifications',
  ADDRESS_BOOK_PREFIX: 'exo_address_book_local_v1',
  CONTACT_PROFILE_PREFIX: 'exo_contact_profile_local_v1',
  APP_LANGUAGE: 'exo_app_language',
  ONE_TIME_CONTACT_CARD: 'exo_one_time_contact_card_v1',
  DISCOVERY_VISIBILITY: 'exo_discovery_visibility_v1',
  ALIAS_AUTOCOMPLETE: 'exo_alias_autocomplete_v1',
  WALLET_CONTRIBUTION_NOTICE_SEEN: 'exo_wallet_contribution_notice_seen_v1',
  VDF_BANNER_VISIBLE: 'exo_vdf_banner_visible_v1',
  SEALED_PREFETCH_CURSOR_PREFIX: 'exo_sealed_prefetch_cursor_v1',
} as const

export const VAULT_SECURITY_KEYS = {
  PIN_HASH: `${STORAGE_KEYS.VAULT}_pin_hash`,
  PIN_SALT: `${STORAGE_KEYS.VAULT}_pin_salt`,
  PIN_KDF_ITERATIONS: `${STORAGE_KEYS.VAULT}_pin_kdf_iterations`,
  DEVICE_SECRET: `${STORAGE_KEYS.VAULT}_device_secret`,
  BIOMETRIC_PIN: `${STORAGE_KEYS.VAULT}_biometric_pin`,
  DURESS_PIN: `${STORAGE_KEYS.VAULT}_duress_pin`,
  DURESS_PIN_HASH: `${STORAGE_KEYS.VAULT}_duress_pin_hash`,
  DURESS_PIN_SALT: `${STORAGE_KEYS.VAULT}_duress_pin_salt`,
  DURESS_PIN_KDF_ITERATIONS: `${STORAGE_KEYS.VAULT}_duress_pin_kdf_iterations`,
  DURESS_ENABLED: `${STORAGE_KEYS.VAULT}_duress_enabled`,
  FAIL_WIPE_ENABLED: `${STORAGE_KEYS.VAULT}_fail_wipe_enabled`,
  FAIL_WIPE_ATTEMPTS: `${STORAGE_KEYS.VAULT}_fail_wipe_attempts`,
  PIN_ATTEMPTS: `${STORAGE_KEYS.VAULT}_pin_attempts`,
  PIN_LOCKOUT_UNTIL: `${STORAGE_KEYS.VAULT}_pin_lockout_until`,
  AUTO_LOCK: `${STORAGE_KEYS.VAULT}_auto_lock`,
  AUTO_LOCK_TIME: `${STORAGE_KEYS.VAULT}_auto_lock_time`,
  HIDE_CONTENT: `${STORAGE_KEYS.VAULT}_hide_content`,
  DELIVERY_RECEIPTS: `${STORAGE_KEYS.VAULT}_delivery_receipts`,
  READ_RECEIPTS: `${STORAGE_KEYS.VAULT}_read_receipts`,
  CLEAR_IMAGE_CACHE_ON_LOCK: `${STORAGE_KEYS.VAULT}_clear_image_cache_on_lock`,
  MESSAGE_CACHE_PRIVACY_MODE: `${STORAGE_KEYS.VAULT}_message_cache_privacy_mode`,
  LOCAL_MESSAGE_CONTENT_KEY: `${STORAGE_KEYS.VAULT}_local_message_content_key_v1`,
  LOCAL_CACHE_ROOT_KEY: `${STORAGE_KEYS.VAULT}_local_cache_root_key_v1`,
  NOTIFICATION_SCOPE_REGISTRY: `${STORAGE_KEYS.VAULT}_notification_scope_registry_v1`,
} as const

// SecureStore needs explicit keychain services on iOS 26.
export const SECURE_STORE_OPTIONS = {
  keychainService: 'org.spectramozaga.exo',
  keychainAccessible: THIS_DEVICE_ONLY_ACCESSIBILITY,
} as const

export const BIOMETRIC_SECURE_STORE_OPTIONS = {
  keychainService: 'org.spectramozaga.exo.biometric',
  keychainAccessible: THIS_DEVICE_ONLY_ACCESSIBILITY,
  requireAuthentication: true,
} as const

export const SCREENSHOT_PROTECTION_KEY = `${STORAGE_KEYS.VAULT}_screenshot_protection`

export const SPECTRE_AUTO_LOCK_TIME = 'Immediately'
export const SPECTRE_FAIL_WIPE_ATTEMPTS = 5
export const SPECTRE_DIRECT_DISAPPEARING_MS = 15 * 60 * 1000
export const SPECTRE_GROUP_DISAPPEARING_MS = 60 * 60 * 1000

export const MESSAGE_FONT_SIZES = {
  small: 12,
  medium: 14,
  large: 16,
  extra_large: 18,
} as const

export type MessageFontSize = keyof typeof MESSAGE_FONT_SIZES

export const SECURITY_CONFIG = {
  MAX_PIN_ATTEMPTS: 5,
  LOCKOUT_DURATION: 5 * 60 * 1000,
} as const

export const EXO_ADDRESS_REGEX = /^EXO00[0-9a-fA-F]{38}$/
export const EXO_ADDRESS_LENGTH = 43
