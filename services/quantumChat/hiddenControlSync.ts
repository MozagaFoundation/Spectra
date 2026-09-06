/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { recordChatDiagnostic } from '../chat/chatDiagnostics'
import { useTorStore } from '../tor/torStore'
import * as S from './_state'

export type HiddenControlSyncSource = 'bootstrap' | 'chat_screen' | 'security_settings'
type DirectHiddenControlType = 'screenshot_protection'

type HiddenControlDiagnosticFields = Record<string, string | number | boolean | null | undefined>

type DirectHiddenControlSyncOptions = {
  controlType: DirectHiddenControlType
  remoteIdentityId: string
  enabled: boolean
  source: HiddenControlSyncSource
  deliver: (remoteIdentityId: string, enabled: boolean) => Promise<boolean>
}

type DirectDisappearingTimerSyncOptions = {
  remoteIdentityId: string
  timerKey: string | null
  source: HiddenControlSyncSource
  deliver: (remoteIdentityId: string) => Promise<boolean>
}

function recordHiddenControlDiagnostic(
  name: 'hidden_control_sync_sent' | 'hidden_control_sync_skipped',
  fields: HiddenControlDiagnosticFields,
): void {
  recordChatDiagnostic('send', name, {
    torEnabled: useTorStore.getState().enabled,
    ...fields,
  })
}

function getDirectCachedValue(remoteIdentityId: string): boolean | undefined {
  return S.directHiddenControlSyncStateByIdentity.get(remoteIdentityId)?.screenshotProtection
}

function setDirectCachedValue(remoteIdentityId: string, enabled: boolean): void {
  const currentState = S.directHiddenControlSyncStateByIdentity.get(remoteIdentityId) ?? {}
  S.directHiddenControlSyncStateByIdentity.set(remoteIdentityId, {
    ...currentState,
    screenshotProtection: enabled,
  })
}

function getDirectCachedTimerKey(remoteIdentityId: string): string | null | undefined {
  const cachedState = S.directHiddenControlSyncStateByIdentity.get(remoteIdentityId)
  return cachedState?.disappearingTimerKey
}

function setDirectCachedTimerKey(remoteIdentityId: string, timerKey: string | null): void {
  const currentState = S.directHiddenControlSyncStateByIdentity.get(remoteIdentityId) ?? {}
  S.directHiddenControlSyncStateByIdentity.set(remoteIdentityId, {
    ...currentState,
    disappearingTimerKey: timerKey,
  })
}

function getInFlightKey(scope: 'direct', controlType: string, targetId: string, enabled: boolean): string {
  return `${scope}:${controlType}:${targetId}:${enabled ? 'enabled' : 'disabled'}`
}

export async function syncDirectHiddenControlState(
  options: DirectHiddenControlSyncOptions,
): Promise<boolean> {
  const { controlType, remoteIdentityId, enabled, source, deliver } = options
  const cachedValue = getDirectCachedValue(remoteIdentityId)
  if (cachedValue === enabled) {
    recordHiddenControlDiagnostic('hidden_control_sync_skipped', {
      controlType,
      source,
      reason: 'duplicate_suppressed',
      recipientIdentityId: remoteIdentityId,
      inFlight: false,
    })
    return true
  }

  const inFlightKey = getInFlightKey('direct', controlType, remoteIdentityId, enabled)
  const existingSync = S.hiddenControlSyncInFlight.get(inFlightKey)
  if (existingSync) {
    recordHiddenControlDiagnostic('hidden_control_sync_skipped', {
      controlType,
      source,
      reason: 'duplicate_suppressed',
      recipientIdentityId: remoteIdentityId,
      inFlight: true,
    })
    return existingSync
  }

  const sendReason = cachedValue === undefined ? 'new_recipient' : 'state_changed'
  const syncPromise = (async () => {
    try {
      const delivered = await deliver(remoteIdentityId, enabled)
      if (delivered) {
        setDirectCachedValue(remoteIdentityId, enabled)
        recordHiddenControlDiagnostic('hidden_control_sync_sent', {
          controlType,
          source,
          reason: sendReason,
          recipientIdentityId: remoteIdentityId,
        })
      } else {
        recordHiddenControlDiagnostic('hidden_control_sync_skipped', {
          controlType,
          source,
          reason: 'delivery_failed',
          recipientIdentityId: remoteIdentityId,
        })
      }
      return delivered
    } finally {
      S.hiddenControlSyncInFlight.delete(inFlightKey)
    }
  })()

  S.hiddenControlSyncInFlight.set(inFlightKey, syncPromise)
  return syncPromise
}

export async function syncDirectDisappearingTimerState(
  options: DirectDisappearingTimerSyncOptions,
): Promise<boolean> {
  const { remoteIdentityId, timerKey, source, deliver } = options
  const controlType = 'disappearing_timer'
  const cachedValue = getDirectCachedTimerKey(remoteIdentityId)
  if (cachedValue === timerKey) {
    recordHiddenControlDiagnostic('hidden_control_sync_skipped', {
      controlType,
      source,
      reason: 'duplicate_suppressed',
      recipientIdentityId: remoteIdentityId,
      inFlight: false,
    })
    return true
  }

  const inFlightKey = `direct:${controlType}:${remoteIdentityId}:${timerKey ?? 'off'}`
  const existingSync = S.hiddenControlSyncInFlight.get(inFlightKey)
  if (existingSync) {
    recordHiddenControlDiagnostic('hidden_control_sync_skipped', {
      controlType,
      source,
      reason: 'duplicate_suppressed',
      recipientIdentityId: remoteIdentityId,
      inFlight: true,
    })
    return existingSync
  }

  const sendReason = cachedValue === undefined ? 'new_recipient' : 'state_changed'
  const syncPromise = (async () => {
    try {
      const delivered = await deliver(remoteIdentityId)
      if (delivered) {
        setDirectCachedTimerKey(remoteIdentityId, timerKey)
        recordHiddenControlDiagnostic('hidden_control_sync_sent', {
          controlType,
          source,
          reason: sendReason,
          recipientIdentityId: remoteIdentityId,
        })
      } else {
        recordHiddenControlDiagnostic('hidden_control_sync_skipped', {
          controlType,
          source,
          reason: 'delivery_failed',
          recipientIdentityId: remoteIdentityId,
        })
      }
      return delivered
    } finally {
      S.hiddenControlSyncInFlight.delete(inFlightKey)
    }
  })()

  S.hiddenControlSyncInFlight.set(inFlightKey, syncPromise)
  return syncPromise
}
