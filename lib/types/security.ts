/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

export type SecurityAlertType =
  | 'replay_attempt'
  | 'timestamp_mismatch'
  | 'session_desync'
  | 'bundle_stale'
  | 'session_switched'
  | 'identity_key_changed'
  | 'untrusted_identity'
  | 'session_promoted'
  | 'message_retry'
  | 'key_mismatch'

export type SecurityAlertSeverity = 'low' | 'medium' | 'high' | 'critical'

export interface SecurityAlert {
  id: string
  type: SecurityAlertType
  message: string
  severity: SecurityAlertSeverity
  timestamp: number
  contactId?: string
  requiresAction?: boolean
  dismissed?: boolean
}
