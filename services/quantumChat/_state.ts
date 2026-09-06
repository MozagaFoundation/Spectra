/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

/**
 * Shared QuantumChat state used by submodules without circular imports.
 */

import type { QuantumChat, ConversationHandle, BundleServer, ChatIdentity } from '@spectra/core-crypto'
import type { BackendRealtimeSubscription } from '@/services/backend/realtime'
import { AppState } from 'react-native'

export type RuntimeBundleServer = BundleServer & {
  setAccessToken: (token: string | null) => void
  setTokenGetter?: (getter: (() => string | null) | null) => void
  listRegisteredMailboxTokens?: (identityId: string) => Promise<string[]>
}

// Core singletons
export let chatClient: QuantumChat | null = null
export let chatIdentity: ChatIdentity | null = null
export let activeConversationHandle: ConversationHandle | null = null
export let bundleServer: RuntimeBundleServer | null = null
export let authSessionUnsubscribe: (() => void) | null = null

// Polling and Realtime
export let pollInterval: ReturnType<typeof setInterval> | null = null
export let outboundStatusSyncInterval: ReturnType<typeof setInterval> | null = null
export let onlineStatusInterval: ReturnType<typeof setInterval> | null = null
export let sessionRefreshTimer: ReturnType<typeof setInterval> | null = null
export let directExpirySweepTimer: ReturnType<typeof setTimeout> | null = null
export let realtimeChannel: BackendRealtimeSubscription | null = null
export let activePollIntervalMs: number | null = null
export let lastKnownAppState = AppState.currentState

// Initialization guard
export let initializationPromise: Promise<boolean> | null = null

// Dedup
export const recentlyProcessedMessageIds = new Set<string>()
export const MAX_PROCESSED_IDS = 500
export type DirectHiddenControlSyncState = {
  screenshotProtection?: boolean
  disappearingTimerKey?: string | null
}
export const directHiddenControlSyncStateByIdentity = new Map<string, DirectHiddenControlSyncState>()
export const hiddenControlSyncInFlight = new Map<string, Promise<boolean>>()

// Decryption failure tracking
export const decryptionFailureCounts = new Map<string, { count: number; lastFailure: number }>()

// Identity resolution caches
export type CachedIdentityResolutionEntry = {
  value: string | null
  checkedAt: number
}
export const walletAddressByIdentityCache = new Map<string, CachedIdentityResolutionEntry>()
export const verifiedContactBundleCache = new Map<string, { identityId: string; checkedAt: number }>()

// Event listener cleanup
export const eventUnsubscribers: Array<() => void> = []

// Constants
export const MAX_BURST_POLLS = 3
export const DEFAULT_MESSAGE_POLL_INTERVAL = 10_000
export const SESSION_REFRESH_CHECK_INTERVAL_MS = 60_000
export const SESSION_REFRESH_BEFORE_EXPIRY_MS = 5 * 60 * 1000
export const ONLINE_STATUS_TIMEOUT = 5 * 60 * 1000
export const MIN_HEALTHY_OPK_COUNT = 20
export const VERIFIED_CONTACT_BUNDLE_TTL_MS = 30_000
export const IDENTITY_RESOLUTION_CACHE_TTL_MS = 30_000
export const MAX_CONSECUTIVE_FAILURES = 5
export const FAILURE_COUNT_RESET_MS = 10 * 60 * 1000

// Setters for module-level state
export function setChatClient(v: QuantumChat | null) { chatClient = v }
export function setChatIdentity(v: ChatIdentity | null) { chatIdentity = v }
export function setActiveConversationHandle(v: ConversationHandle | null) { activeConversationHandle = v }
export function setBundleServer(v: RuntimeBundleServer | null) { bundleServer = v }
export function setAuthSessionUnsubscribe(v: (() => void) | null) { authSessionUnsubscribe = v }
export function setPollInterval(v: ReturnType<typeof setInterval> | null) { pollInterval = v }
export function setOutboundStatusSyncInterval(v: ReturnType<typeof setInterval> | null) { outboundStatusSyncInterval = v }
export function setOnlineStatusInterval(v: ReturnType<typeof setInterval> | null) { onlineStatusInterval = v }
export function setSessionRefreshTimer(v: ReturnType<typeof setInterval> | null) { sessionRefreshTimer = v }
export function setDirectExpirySweepTimer(v: ReturnType<typeof setTimeout> | null) { directExpirySweepTimer = v }
export function setRealtimeChannel(v: BackendRealtimeSubscription | null) { realtimeChannel = v }
export function setActivePollIntervalMs(v: number | null) { activePollIntervalMs = v }
export function setInitializationPromise(v: Promise<boolean> | null) { initializationPromise = v }
export function setLastKnownAppState(v: typeof lastKnownAppState) { lastKnownAppState = v }

export function clearIdentityResolutionCaches(): void {
  walletAddressByIdentityCache.clear()
  verifiedContactBundleCache.clear()
}

export function clearHiddenControlSyncState(): void {
  directHiddenControlSyncStateByIdentity.clear()
  hiddenControlSyncInFlight.clear()
}

export function resetTransientState(): void {
  chatClient = null
  chatIdentity = null
  activeConversationHandle = null
  bundleServer = null
  activePollIntervalMs = null
  initializationPromise = null
  lastKnownAppState = AppState.currentState
  recentlyProcessedMessageIds.clear()
  clearIdentityResolutionCaches()
  clearHiddenControlSyncState()
}
