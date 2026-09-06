/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { refreshChatList } from '@/services/chat'

type RefreshAction = () => Promise<void>

export const CHATS_REFRESH_UI_DEADLINE_MS = 8_000

type UseChatsRefreshOptions = {
  disabled?: boolean
  errorMessage: string
  uiDeadlineMs?: number
}

export function useChatsRefresh(
  refreshAction: RefreshAction,
  {
    disabled = false,
    errorMessage,
    uiDeadlineMs = CHATS_REFRESH_UI_DEADLINE_MS,
  }: UseChatsRefreshOptions,
) {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const localRefreshInFlightRef = useRef(false)
  const refreshGenerationRef = useRef(0)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      refreshGenerationRef.current += 1
    }
  }, [])

  const handleRefresh = useCallback(async () => {
    if (disabled || localRefreshInFlightRef.current) {
      return
    }

    const generation = ++refreshGenerationRef.current
    localRefreshInFlightRef.current = true
    setIsRefreshing(true)

    const completion = Promise.resolve()
      .then(refreshAction)
      .catch((error) => {
        console.warn(errorMessage, error)
      })
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined
    const deadline = new Promise<void>((resolve) => {
      deadlineTimer = setTimeout(resolve, Math.max(0, uiDeadlineMs))
    })

    await Promise.race([completion, deadline])
    if (deadlineTimer) {
      clearTimeout(deadlineTimer)
    }

    if (generation === refreshGenerationRef.current) {
      localRefreshInFlightRef.current = false
      if (!mountedRef.current) {
        return
      }
      setIsRefreshing(false)
    }
  }, [disabled, errorMessage, refreshAction, uiDeadlineMs])

  return { isRefreshing, handleRefresh }
}

export function usePrivateChatsRefresh() {
  return useChatsRefresh(refreshChatList, {
    errorMessage: 'Failed to refresh chats',
  })
}
