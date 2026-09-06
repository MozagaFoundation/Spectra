/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

export const BLE_V2_PROTOCOL_VERSION = 2 as const
export const BLE_V2_ENDIAN = 'big' as const

export const BLE_V2_ROUTE_ENVELOPE_MAGIC = 0x53425232
export const BLE_V2_FRAGMENT_MAGIC = 0x53424632
export const BLE_V2_ACCEPTANCE_RECEIPT_MAGIC = 0x53424132
export const BLE_V2_ROUTE_CAPABILITY_MAGIC = 0x53425032
export const BLE_V2_X25519_CREDENTIAL_MAGIC = 0x53424332

export const BLE_V2_ENVELOPE_ID_BYTES = 16
export const BLE_V2_ROUTE_ID_BYTES = 16
export const BLE_V2_ROUTE_SECRET_BYTES = 32
export const BLE_V2_SENDER_BINDING_BYTES = 32
export const BLE_V2_HASH_BYTES = 32
export const BLE_V2_HMAC_BYTES = 32
export const BLE_V2_X25519_KEY_BYTES = 32
export const BLE_V2_CREDENTIAL_ID_BYTES = 16

export const BLE_V2_ROUTE_ENVELOPE_FIXED_BYTES = 180
export const BLE_V2_FRAGMENT_FIXED_BYTES = 190
export const BLE_V2_ACCEPTANCE_RECEIPT_BYTES = 176
export const BLE_V2_ROUTE_CAPABILITY_BYTES = 108
export const BLE_V2_X25519_CREDENTIAL_BYTES = 3383

export const BLE_V2_MAX_PAYLOAD_BYTES = 256 * 1024
export const BLE_V2_MAX_FRAGMENT_CHUNK_BYTES = 4096
export const BLE_V2_MAX_FRAGMENTS = 64
export const BLE_V2_MAX_HOPS = 7
export const BLE_V2_MAX_REPLAY_IDS = 4096

export const BLE_V2_MAX_ENVELOPE_LIFETIME_MS = 24 * 60 * 60 * 1000
export const BLE_V2_MAX_ROUTE_CAPABILITY_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000
export const BLE_V2_MAX_CREDENTIAL_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000
export const BLE_V2_CLOCK_SKEW_MS = 5 * 60 * 1000

export const BLE_V2_ROUTE_ENVELOPE_PURPOSE = 'Spectra_BLE_Route_Envelope_v2' as const
export const BLE_V2_FRAGMENT_PURPOSE = 'Spectra_BLE_Fragment_v2' as const
export const BLE_V2_ACCEPTANCE_RECEIPT_PURPOSE = 'Spectra_BLE_Acceptance_Receipt_v2' as const
export const BLE_V2_CACHE_DELETE_PREIMAGE_PURPOSE = 'Spectra_BLE_Cache_Delete_Preimage_v2' as const
export const BLE_V2_CACHE_DELETE_HASH_PURPOSE = 'Spectra_BLE_Cache_Delete_Hash_v2' as const
export const BLE_V2_ROUTE_MAC_KEY_PURPOSE = 'Spectra_BLE_Route_MAC_Key_v2' as const
export const BLE_V2_X25519_CREDENTIAL_PURPOSE =
  'Spectra_BLE_Noise_XX_X25519_Credential_v2' as const
export const BLE_NOISE_XX_PROTOCOL_NAME = 'Noise_XX_25519_ChaChaPoly_SHA256' as const

export enum BlePayloadType {
  ChatCiphertext = 0x01,
  HiddenControl = 0x02,
}

export enum BleRouteFlags {
  None = 0x00,
  StoreForward = 0x01,
  AcceptanceReceiptRequired = 0x02,
}

export enum BleAcceptanceStatus {
  Accepted = 0x01,
}

export const BLE_V2_ALLOWED_ROUTE_FLAGS =
  BleRouteFlags.StoreForward | BleRouteFlags.AcceptanceReceiptRequired
