/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'
import { STORAGE_KEYS, SECURE_STORE_OPTIONS } from '@/lib/constants'
import type { AuthSession, SecureAccessState } from '@/lib/types'
import { clearIdentityCache } from '@/lib/identity'
import { revokeBackendSession } from '@/services/backend/auth'

const CURRENT_AUTH_SESSION_METADATA_VERSION = 4
const IDLE_SECURE_ACCESS_STATE: SecureAccessState = {
  phase: 'idle',
  failure: null,
  retryable: false,
}

function normalizePersistedCloudSession(session: AuthSession): AuthSession {
  return {
    exoAddress: session.exoAddress,
    identityId: session.identityId,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    expiresAt: session.expiresAt,
    metadataVersion: session.metadataVersion ?? CURRENT_AUTH_SESSION_METADATA_VERSION,
  }
}

function isSamePersistedCloudSession(
  left: AuthSession | null | undefined,
  right: AuthSession,
): boolean {
  return Boolean(
    left
      && left.exoAddress === right.exoAddress
      && left.identityId === right.identityId
      && left.accessToken === right.accessToken
      && left.refreshToken === right.refreshToken
      && left.expiresAt === right.expiresAt
      && left.metadataVersion === right.metadataVersion
  )
}

function isPersistedCloudSession(value: unknown): value is AuthSession {
  if (!value || typeof value !== 'object') {
    return false
  }

  const session = value as Partial<AuthSession>
  return (
    typeof session.exoAddress === 'string'
    && (session.identityId === null || typeof session.identityId === 'string')
    && typeof session.accessToken === 'string'
    && typeof session.refreshToken === 'string'
    && Number.isFinite(session.expiresAt)
    && session.metadataVersion === CURRENT_AUTH_SESSION_METADATA_VERSION
    && (session.publicKey === undefined || typeof session.publicKey === 'string')
  )
}

interface AuthState {
  isAuthenticated: boolean
  isLoading: boolean
  isInitialized: boolean
  initializationError: boolean
  exoAddress: string | null
  publicKey: string | null
  session: AuthSession | null
  isCloudAuthVerified: boolean
  isIdentityBound: boolean
  isSessionExpired: boolean
  secureAccess: SecureAccessState
  
  initialize: () => Promise<void>
  setAuthenticated: (address: string, publicKey: string) => void
  setSession: (session: AuthSession) => Promise<void>
  setCloudAuthVerified: (verified: boolean) => void
  setIdentityBound: (bound: boolean) => void
  setSessionExpired: (expired: boolean) => void
  setSecureAccess: (state: SecureAccessState) => void
  clearCloudSession: () => Promise<void>
  lockForVault: () => void
  logout: () => Promise<void>
  clearSession: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: false,
  isLoading: true,
  isInitialized: false,
  initializationError: false,
  exoAddress: null,
  publicKey: null,
  session: null,
  isCloudAuthVerified: false,
  isIdentityBound: false,
  isSessionExpired: false,
  secureAccess: IDLE_SECURE_ACCESS_STATE,

  initialize: async () => {
    try {
      const sessionStr = await SecureStore.getItemAsync(STORAGE_KEYS.SESSION, SECURE_STORE_OPTIONS)
      
      if (sessionStr) {
        const parsedSession = JSON.parse(sessionStr)

        // Keep a well-formed session even after the 15-minute access token expires.
        // The refresh token is required to reconnect; only drop malformed/legacy blobs.
        if (isPersistedCloudSession(parsedSession)) {
          const normalizedSession = normalizePersistedCloudSession(parsedSession)
          const hasBoundIdentity = typeof normalizedSession.identityId === 'string'
            && normalizedSession.identityId.length > 0
          const accessExpired = normalizedSession.expiresAt <= Date.now()
          clearIdentityCache()
          set({
            isAuthenticated: false,
            isLoading: false,
            isInitialized: true,
            initializationError: false,
            exoAddress: null,
            publicKey: null,
            session: normalizedSession,
            isCloudAuthVerified: hasBoundIdentity,
            isIdentityBound: hasBoundIdentity,
            isSessionExpired: accessExpired,
            secureAccess: hasBoundIdentity
              ? { phase: 'ready', failure: null, retryable: false }
              : IDLE_SECURE_ACCESS_STATE,
          })
          return
        }

        await SecureStore.deleteItemAsync(STORAGE_KEYS.SESSION, SECURE_STORE_OPTIONS)
      }
      
      clearIdentityCache()
      set({
        isAuthenticated: false,
        isLoading: false,
        isInitialized: true,
        initializationError: false,
        isCloudAuthVerified: false,
        isIdentityBound: false,
        secureAccess: IDLE_SECURE_ACCESS_STATE,
      })
    } catch (error) {
      console.error('Failed to initialize auth:', error)
      set({
        isAuthenticated: false,
        isLoading: false,
        isInitialized: true,
        initializationError: true,
        isCloudAuthVerified: false,
        isIdentityBound: false,
        secureAccess: IDLE_SECURE_ACCESS_STATE,
      })
    }
  },

  setAuthenticated: (address: string, publicKey: string) => {
    const previousAddress = get().exoAddress
    if (previousAddress && previousAddress !== address) {
      clearIdentityCache()
    }

    const existingSession = get().session
    const sessionMatchesAddress = existingSession?.exoAddress === address
    if (existingSession && !sessionMatchesAddress) {
      void SecureStore.deleteItemAsync(STORAGE_KEYS.SESSION, SECURE_STORE_OPTIONS).catch((error) => {
        console.error('Failed to clear mismatched persisted session:', error)
      })
    }

    set({
      isAuthenticated: true,
      isLoading: false,
      isInitialized: true,
      initializationError: false,
      exoAddress: address,
      publicKey,
      session: sessionMatchesAddress ? existingSession : null,
      isCloudAuthVerified: sessionMatchesAddress ? get().isCloudAuthVerified : false,
      isIdentityBound: sessionMatchesAddress ? get().isIdentityBound : false,
      secureAccess: sessionMatchesAddress ? get().secureAccess : IDLE_SECURE_ACCESS_STATE,
    })
  },

  setSession: async (session: AuthSession) => {
    try {
      const normalizedSession = normalizePersistedCloudSession(session)
      const previousSession = get().session
      if (!isSamePersistedCloudSession(previousSession, normalizedSession)) {
        await SecureStore.setItemAsync(
          STORAGE_KEYS.SESSION,
          JSON.stringify(normalizedSession),
          SECURE_STORE_OPTIONS
        )
      }

      const previousAddress = get().exoAddress
      if (previousAddress && previousAddress !== normalizedSession.exoAddress) {
        clearIdentityCache()
      }
      const preserveIdentityBinding = Boolean(
        get().isIdentityBound
          && previousSession?.exoAddress === normalizedSession.exoAddress
          && previousSession.identityId === normalizedSession.identityId
          && normalizedSession.identityId,
      )
      const preserveCloudAuthVerified = Boolean(
        get().isCloudAuthVerified && preserveIdentityBinding
      )
      
      set({
        isAuthenticated: get().isAuthenticated,
        isLoading: false,
        isInitialized: true,
        initializationError: false,
        exoAddress: normalizedSession.exoAddress,
        publicKey: session.publicKey ?? get().publicKey ?? null,
        session: normalizedSession,
        isCloudAuthVerified: preserveCloudAuthVerified,
        isIdentityBound: preserveIdentityBinding,
        isSessionExpired: false,
        secureAccess: preserveIdentityBinding ? get().secureAccess : IDLE_SECURE_ACCESS_STATE,
      })
    } catch (error) {
      console.error('Failed to save session:', error)
      throw error
    }
  },

  setCloudAuthVerified: (verified: boolean) => {
    set((state) => ({
      isCloudAuthVerified: verified && Boolean(state.session),
    }))
  },

  setIdentityBound: (bound: boolean) => {
    set({ isIdentityBound: bound })
  },

  setSessionExpired: (expired: boolean) => {
    set({ isSessionExpired: expired })
  },

  setSecureAccess: (secureAccess: SecureAccessState) => {
    set({ secureAccess })
  },

  lockForVault: () => {
    set({
      isAuthenticated: false,
      isSessionExpired: false,
    })
  },

  clearCloudSession: async () => {
    try {
      await SecureStore.deleteItemAsync(STORAGE_KEYS.SESSION, SECURE_STORE_OPTIONS)
    } catch (error) {
      console.error('Failed to clear persisted cloud session:', error)
    }

    set((state) => ({
      session: null,
      exoAddress: state.isAuthenticated ? state.exoAddress : null,
      publicKey: state.isAuthenticated ? state.publicKey : null,
      isCloudAuthVerified: false,
      isIdentityBound: false,
      isSessionExpired: false,
      secureAccess: IDLE_SECURE_ACCESS_STATE,
    }))
  },

  logout: async () => {
    try {
      const refreshToken = get().session?.refreshToken
      if (refreshToken) {
        await revokeBackendSession(refreshToken).catch((error) => {
          console.warn('Failed to revoke backend session:', error)
        })
      }
      await SecureStore.deleteItemAsync(STORAGE_KEYS.SESSION, SECURE_STORE_OPTIONS)
      clearIdentityCache()
      
      set({
        isAuthenticated: false,
        isLoading: false,
        isInitialized: true,
        initializationError: false,
        exoAddress: null,
        publicKey: null,
        session: null,
        isCloudAuthVerified: false,
        isIdentityBound: false,
        isSessionExpired: false,
        secureAccess: IDLE_SECURE_ACCESS_STATE,
      })
    } catch (error) {
      console.error('Failed to logout:', error)
    }
  },

  clearSession: async () => {
    clearIdentityCache()
    try {
      await SecureStore.deleteItemAsync(STORAGE_KEYS.SESSION, SECURE_STORE_OPTIONS)
    } catch (error) {
      console.error('Failed to clear persisted session:', error)
    }
    set({
      isAuthenticated: false,
      initializationError: false,
      exoAddress: null,
      publicKey: null,
      session: null,
      isCloudAuthVerified: false,
      isIdentityBound: false,
      isSessionExpired: false,
      secureAccess: IDLE_SECURE_ACCESS_STATE,
    })
  },
}))
