/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { useEffect } from 'react'
import * as ScreenCapture from 'expo-screen-capture'
import { InteractionManager } from 'react-native'

import { useChatStore } from '@/store/chatStore'
import { sendScreenshotTakenNotification } from '@/services/quantumChat'
export {
  getScreenshotProtectionEnabled,
  setScreenshotProtectionEnabled,
  subscribeToScreenshotProtection,
} from '@/services/security/screenshotProtection'

const SCREENSHOT_NOTIFICATION_COOLDOWN_MS = 2_000

const lastScreenshotNoticeByRemote = new Map<string, number>()

/** Installs screenshot notifications for eligible direct chats. */
export function useScreenshotProtection(conversationId: string | null | undefined) {
  const remoteIdentityId = useChatStore((state) => {
    if (!conversationId) return null
    const conv = state.conversations.find((c) => c.id === conversationId)
    if (!conv || conv.type === 'group') {
      return null
    }
    return conv.remoteIdentityId
  })

  useEffect(() => {
    if (!remoteIdentityId) return

    let mounted = true
    let lastSentAt = 0
    let subscription: ScreenCapture.Subscription | null = null
    let interactionTask: { cancel?: () => void } | null = null

    const notifyScreenshotTaken = () => {
      const now = Date.now()
      const lastGlobalSentAt = lastScreenshotNoticeByRemote.get(remoteIdentityId) ?? 0
      if (
        now - lastSentAt < SCREENSHOT_NOTIFICATION_COOLDOWN_MS
        || now - lastGlobalSentAt < SCREENSHOT_NOTIFICATION_COOLDOWN_MS
      ) {
        return
      }
      lastSentAt = now
      lastScreenshotNoticeByRemote.set(remoteIdentityId, now)
      void sendScreenshotTakenNotification(remoteIdentityId)
    }

    const installListener = async () => {
      try {
        const available = await ScreenCapture.isAvailableAsync()
        if (!mounted || !available) return

        const permission = await ScreenCapture.getPermissionsAsync().catch(() => null)
        if (!mounted) return
        if (permission && permission.status !== 'granted') {
          return
        }

        subscription = ScreenCapture.addScreenshotListener(notifyScreenshotTaken)
      } catch {
        // Screenshot detection is best effort.
      }
    }

    interactionTask = InteractionManager.runAfterInteractions(() => {
      void installListener()
    })

    return () => {
      mounted = false
      interactionTask?.cancel?.()
      subscription?.remove()
      subscription = null
    }
  }, [remoteIdentityId])
}
