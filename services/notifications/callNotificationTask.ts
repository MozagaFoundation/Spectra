/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import * as Notifications from 'expo-notifications'
import * as TaskManager from 'expo-task-manager'
import { AppState, Platform } from 'react-native'
// Keep the headless task out of chat and push bootstraps.
import {
  clearPendingIncomingCallSession,
  markCallSessionHandled,
  normalizeIncomingCallPushPayload,
  rememberIncomingCallSession,
} from '../call/callSessionRegistry'
import { describeCallError, recordCallDiagnostic } from '../call/callDiagnostics'
import { useSpectreStore } from '@/store/spectreStore'
import { mobileLogDebug, mobileLogWarn } from '@/services/logging/mobileLogger'
import { enqueueMessagingPush } from './notificationCoordinator'
import { isAuthorizedCallNotificationPayload } from './callNotificationAuthorization'

const CALL_NOTIFICATION_TASK = 'spectra-call-notification-task'

function logAndroidNotificationTask(event: string, details: Record<string, unknown> = {}): void {
  if (Platform.OS !== 'android') {
    return
  }
  mobileLogDebug('AndroidNotificationTask', event, details)
}

function parseTaskPayload(
  payload: Notifications.NotificationTaskPayload,
): Record<string, unknown> | null {
  if ('notification' in payload && 'data' in payload) {
    const dataString = payload.data?.dataString
    if (typeof dataString === 'string') {
      try {
        return JSON.parse(dataString) as Record<string, unknown>
      } catch {}
    }

    return payload.data as Record<string, unknown>
  }

  const responseData = payload.notification.request.content.data
  return responseData as Record<string, unknown>
}

async function dismissPresentedCallNotifications(callSessionId: string): Promise<void> {
  try {
    const presented = await Notifications.getPresentedNotificationsAsync()
    for (const notification of presented) {
      const data = notification.request.content.data as Record<string, unknown> | undefined
      if (
        data?.callSessionId === callSessionId
        && (data?.type === 'call' || data?.type === 'call_end')
      ) {
        await Notifications.dismissNotificationAsync(notification.request.identifier)
      }
    }
  } catch (error) {
    recordCallDiagnostic('recovery', 'dismiss_call_notifications_failed', {
      sessionId: callSessionId,
      error: describeCallError(error),
    })
    mobileLogWarn('CallNotificationTask', 'dismiss_presented_failed', { error })
  }
}

export async function handleIncomingCallNotificationPayload(
  rawPayload: Record<string, unknown> | null | undefined,
  source: 'expo' = 'expo',
): Promise<boolean> {
  if (useSpectreStore.getState().enabled) {
    logAndroidNotificationTask('call_payload_skipped_spectre', { source })
    return false
  }
  let authorized = false
  try {
    authorized = await isAuthorizedCallNotificationPayload(rawPayload)
  } catch (error) {
    recordCallDiagnostic('recovery', 'notification_payload_authorization_failed', {
      source,
      error: describeCallError(error),
    })
    logAndroidNotificationTask('call_payload_authorization_failed', { source })
    return false
  }
  if (!authorized) {
    logAndroidNotificationTask('call_payload_skipped_scope', { source })
    return false
  }

  const payload = normalizeIncomingCallPushPayload(rawPayload, source)
  if (!payload) {
    logAndroidNotificationTask('call_payload_ignored', { source })
    recordCallDiagnostic('recovery', 'notification_payload_ignored', {
      source,
    })
    return false
  }

  recordCallDiagnostic('recovery', 'notification_payload_handled', {
    source,
    sessionId: payload.callSessionId,
    type: payload.type,
    callType: payload.callType,
  })
  logAndroidNotificationTask('call_payload_handled', {
    source,
    type: payload.type,
    callType: payload.callType,
    appState: AppState.currentState,
  })

  if (payload.type === 'call_end') {
    await clearPendingIncomingCallSession(payload.callSessionId)
    await markCallSessionHandled(payload.callSessionId)
    await dismissPresentedCallNotifications(payload.callSessionId)
    return true
  }

  const accepted = await rememberIncomingCallSession(payload)
  if (!accepted) {
    recordCallDiagnostic('recovery', 'notification_payload_duplicate_or_stale', {
      source,
      sessionId: payload.callSessionId,
    })
  }
  return true
}

if (!TaskManager.isTaskDefined(CALL_NOTIFICATION_TASK)) {
  TaskManager.defineTask<Notifications.NotificationTaskPayload>(
    CALL_NOTIFICATION_TASK,
    async ({ data, error }) => {
      if (error) {
        logAndroidNotificationTask('task_failed', {
          error: describeCallError(error),
        })
        recordCallDiagnostic('recovery', 'notification_task_failed', {
          error: describeCallError(error),
        })
        mobileLogWarn('CallNotificationTask', 'headless_task_failed', { error })
        return
      }

      const rawPayload = parseTaskPayload(data)
      logAndroidNotificationTask('task_received', {
        type: typeof rawPayload?.type === 'string' ? rawPayload.type : null,
        appState: AppState.currentState,
      })
      if (rawPayload?.type === 'call' || rawPayload?.type === 'call_end') {
        const handled = await handleIncomingCallNotificationPayload(rawPayload)
        if (handled && rawPayload.type === 'call') {
          await enqueueMessagingPush(rawPayload, 'background')
        }
        return
      }

      await enqueueMessagingPush(rawPayload, 'background')
    },
  )
}

export async function registerCallNotificationTask(): Promise<void> {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(CALL_NOTIFICATION_TASK)
  if (isRegistered) {
    logAndroidNotificationTask('task_already_registered')
    return
  }

  await Notifications.registerTaskAsync(CALL_NOTIFICATION_TASK)
  logAndroidNotificationTask('task_registered')
}

export async function unregisterCallNotificationTask(): Promise<void> {
  if (!await TaskManager.isTaskRegisteredAsync(CALL_NOTIFICATION_TASK)) {
    return
  }
  await Notifications.unregisterTaskAsync(CALL_NOTIFICATION_TASK)
  logAndroidNotificationTask('task_unregistered')
}
