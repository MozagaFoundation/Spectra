/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import {
  clearPendingMessagingNotificationStorage,
  consumePendingMessagingNotifications,
  enqueueMessagingPush,
  hasPendingMessagingNotifications,
} from './notificationCoordinator'

type ChatWakeupSource = 'received' | 'response' | 'background' | 'unlock'

export async function requestChatWakeupFromNotification(
  data: Record<string, unknown> | null | undefined,
  source: ChatWakeupSource,
): Promise<boolean> {
  if (source === 'unlock') {
    return consumePendingMessagingNotifications('unlock')
  }
  return enqueueMessagingPush(data, source)
}

export async function consumePendingChatWakeupAfterUnlock(): Promise<boolean> {
  return consumePendingMessagingNotifications('unlock')
}

export async function hasPendingChatWakeup(): Promise<boolean> {
  return hasPendingMessagingNotifications()
}

export const clearPendingChatWakeupStorage = clearPendingMessagingNotificationStorage
