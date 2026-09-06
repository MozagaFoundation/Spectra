/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { STORAGE_KEYS } from '@/lib/constants'

export const TOR_STORAGE_KEYS = {
  ENABLED: `${STORAGE_KEYS.VAULT}_tor_enabled`,
  BRIDGE_CONFIG: `${STORAGE_KEYS.VAULT}_tor_bridge_config_v2`,
  BRIDGES: `${STORAGE_KEYS.VAULT}_tor_bridges`,
  BRIDGE_TYPE: `${STORAGE_KEYS.VAULT}_tor_bridge_type`,
  SNOWFLAKE_CONSENT: `${STORAGE_KEYS.VAULT}_snowflake_bootstrap_consent`,
} as const

export const TOR_CONFIG = {
  SOCKS_PORT: 9050,
  TARGET_PORT: 9051,
  START_TIMEOUT_MS: 120_000,
  BRIDGE_FETCH_TIMEOUT_MS: 15_000,
  STATUS_POLL_INTERVAL_MS: 1_000,
  STATUS_POLL_MAX_MS: 240_000,
  HTTP_TIMEOUT_MS: 30_000,
  HEALTH_CHECK_TIMEOUT_MS: 15_000,
  RECONNECT_DELAY_MS: 5_000,
  MAX_RECONNECT_ATTEMPTS: 3,
  HEALTH_CHECK_FAILURE_THRESHOLD: 2,
  HEALTH_CHECK_INTERVAL_MS: 30_000,
  HEALTH_CHECK_URL: 'https://check.torproject.org/api/ip',
  FETCH_WAIT_TIMEOUT_MS: 250_000,
  POST_CONNECT_STABILIZATION_MS: 500,
  BACKGROUND_GRACE_PERIOD_MS: 3_600_000,
} as const

export const TOR_SERVICE_STATUS = {
  STARTING: 0,
  RUNNING: 1,
  STOPPED_OR_ERROR: 2,
} as const

export type TorStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export type BridgeType = 'none' | 'obfs4' | 'snowflake' | 'webtunnel'

export const TOR_CHAT_POLL_INTERVAL_MS = 3_000
export const TOR_GROUP_POLL_INTERVAL_MS = 30_000
export const TOR_OUTBOUND_STATUS_SYNC_TIMER_MS = 30_000
export const TOR_PUBLIC_SYNC_POLL_INTERVAL_MS = 15_000
export const TOR_PUBLIC_RUNTIME_REFRESH_INTERVAL_MS = 30_000

export const LOG_PREFIX = '[TOR]' as const
