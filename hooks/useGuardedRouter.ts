/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { useCallback, useMemo } from 'react'
import { usePathname, useRouter } from 'expo-router'

type AppRouter = ReturnType<typeof useRouter>
type PushTarget = Parameters<AppRouter['push']>[0]
type NavigateTarget = Parameters<AppRouter['navigate']>[0]
type GuardedNavigationTarget =
  | PushTarget
  | NavigateTarget
  | string
  | { pathname: string; params?: Record<string, unknown> }
type GuardedRouter = Omit<AppRouter, 'navigate' | 'push' | 'replace'> & {
  navigate: (target: GuardedNavigationTarget) => void
  push: (target: GuardedNavigationTarget) => void
  replace: (target: GuardedNavigationTarget) => void
}

const DEFAULT_NAVIGATION_GUARD_MS = 1200
let globalPendingNavigation: { key: string; timeout: ReturnType<typeof setTimeout> } | null = null

function stableStringify(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return JSON.stringify(value)
  }

  const sorted = Object.keys(value).sort().reduce<Record<string, unknown>>((acc, key) => {
    acc[key] = (value as Record<string, unknown>)[key]
    return acc
  }, {})
  return JSON.stringify(sorted)
}

function getNavigationKey(target: unknown): string {
  if (typeof target === 'string') {
    return target
  }

  if (target && typeof target === 'object' && 'pathname' in target) {
    const route = target as { pathname?: unknown; params?: unknown }
    if (typeof route.pathname === 'string') {
      return route.params ? `${route.pathname}?${stableStringify(route.params)}` : route.pathname
    }
  }

  try {
    return JSON.stringify(target)
  } catch {
    return String(target)
  }
}

function normalizePath(path: string): string {
  return path
    .replace(/\/\([^/]+?\)/g, '')
    .replace(/[?#].*$/, '')
    .replace(/\/$/, '')
}

export function useGuardedRouter(cooldownMs: number = DEFAULT_NAVIGATION_GUARD_MS): GuardedRouter {
  const router = useRouter()
  const pathname = usePathname()

  const shouldStartNavigation = useCallback((key: string) => {
    const normalizedCurrentPath = normalizePath(pathname || '')
    const normalizedTargetPath = normalizePath(key)

    if (normalizedCurrentPath && normalizedTargetPath && normalizedCurrentPath === normalizedTargetPath) {
      return false
    }

    if (globalPendingNavigation?.key === key) {
      return false
    }

    if (globalPendingNavigation) {
      clearTimeout(globalPendingNavigation.timeout)
    }

    const timeout = setTimeout(() => {
      if (globalPendingNavigation?.key === key) {
        globalPendingNavigation = null
      }
    }, cooldownMs)

    globalPendingNavigation = {
      key,
      timeout,
    }
    return true
  }, [cooldownMs, pathname])

  const guardedPush = useCallback((target: GuardedNavigationTarget) => {
    if (!shouldStartNavigation(getNavigationKey(target))) {
      return
    }
    router.push(target as PushTarget)
  }, [router, shouldStartNavigation])

  const guardedNavigate = useCallback((target: GuardedNavigationTarget) => {
    if (!shouldStartNavigation(getNavigationKey(target))) {
      return
    }
    router.navigate(target as NavigateTarget)
  }, [router, shouldStartNavigation])

  return useMemo(
    () => ({
      ...router,
      push: guardedPush,
      navigate: guardedNavigate,
    }) as GuardedRouter,
    [guardedNavigate, guardedPush, router],
  )
}
