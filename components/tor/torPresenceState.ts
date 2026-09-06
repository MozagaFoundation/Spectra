/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { TorStatus } from '@/services/tor'
import type { TorPresenceGateReason } from '@/services/tor/torStore'
import { getErrorDisplayMessage } from '@/lib/errorDisplay'
import { translate } from '@/lib/i18n'

export interface TorReconnectGateStateInput {
  enabled: boolean
  status: TorStatus
  presenceGateReason: TorPresenceGateReason | null
}

export type TorPresenceTone = 'connecting' | 'connected' | 'error'

export interface TorPresenceCopyInput {
  status: TorStatus
  exitCountry: string | null
  errorMessage: string | null
  lastHealthError: string | null
}

export interface TorPresenceCopy {
  tone: TorPresenceTone
  title: string
  detail: string
  exitLabel: string
}

export const TOR_BRIDGES_ROUTE = '/(main)/settings/tor-bridges' as const

export function shouldShowTorReconnectGate(input: TorReconnectGateStateInput): boolean {
  return input.enabled && input.presenceGateReason !== null && input.status === 'error'
}

export function getTopChromeAwareTopInset(topInset: number, topChromeVisible: boolean): number {
  return topChromeVisible ? 0 : topInset
}

export function canOpenTorBridges(
  pathname: string | null | undefined,
  navigationPending: boolean,
): boolean {
  return !navigationPending && pathname !== TOR_BRIDGES_ROUTE
}

export function getTorPresenceCopy(
  input: TorPresenceCopyInput,
  surface: 'banner' | 'gate',
): TorPresenceCopy {
  const exitLabel = input.exitCountry
    ? input.status === 'connected'
      ? translate('Exit node: {{country}}', { ns: 'tor', country: input.exitCountry })
      : translate('Last verified exit: {{country}}', { ns: 'tor', country: input.exitCountry })
    : translate('Checking exit node...', { ns: 'tor' })

  if (input.status === 'connected') {
    return {
      tone: 'connected',
      title: translate('Connected to Tor', { ns: 'tor' }),
      detail:
        surface === 'gate'
          ? translate('Your Tor route is active again.', { ns: 'tor' })
          : translate('Supported Spectra network requests are currently routed through Tor.', {
              ns: 'tor',
            }),
      exitLabel,
    }
  }

  if (input.status === 'error') {
    const errorDetail = input.errorMessage ?? input.lastHealthError

    return {
      tone: 'error',
      title: translate('Tor connection failed', { ns: 'tor' }),
      detail:
        errorDetail
          ? getErrorDisplayMessage(errorDetail)
          : translate('Tor could not reconnect. Retry or configure bridges to recover.', { ns: 'tor' }),
      exitLabel,
    }
  }

  return {
    tone: 'connecting',
    title: translate('Connecting to Tor', { ns: 'tor' }),
    detail:
      surface === 'gate'
        ? translate('Re-establishing your Tor route before showing the app.', { ns: 'tor' })
        : translate('Reconnecting through the Tor network.', { ns: 'tor' }),
    exitLabel,
  }
}
