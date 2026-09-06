/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import * as SecureStore from 'expo-secure-store'

import { SECURE_STORE_OPTIONS } from '@/lib/constants'
import { TOR_STORAGE_KEYS, type BridgeType } from './torConstants'

export const SNOWFLAKE_CONSENT_VERSION = 'snowflake-bootstrap-v1'

export async function hasSnowflakeBootstrapConsent(): Promise<boolean> {
  const consent = await SecureStore.getItemAsync(
    TOR_STORAGE_KEYS.SNOWFLAKE_CONSENT,
    SECURE_STORE_OPTIONS,
  ).catch(() => null)
  return consent === SNOWFLAKE_CONSENT_VERSION
}

export async function acknowledgeSnowflakeBootstrapConsent(): Promise<void> {
  await SecureStore.setItemAsync(
    TOR_STORAGE_KEYS.SNOWFLAKE_CONSENT,
    SNOWFLAKE_CONSENT_VERSION,
    SECURE_STORE_OPTIONS,
  )
}

export async function assertBridgeBootstrapConsent(bridgeType: BridgeType): Promise<void> {
  if (bridgeType !== 'snowflake') {
    return
  }
  if (!(await hasSnowflakeBootstrapConsent())) {
    throw new Error('Acknowledge Snowflake bootstrap privacy exposure before using this bridge')
  }
}
