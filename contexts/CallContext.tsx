/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { createContext, useContext, useCallback, useState, useEffect, useMemo, useRef } from 'react'
import { Alert, AppState, View } from 'react-native'
import { useQuantumCall } from '@/hooks/useQuantumCall'
import { useChatStore } from '@/store/chatStore'
import { useAuthStore } from '@/store/authStore'
import { useSpectreStore } from '@/store/spectreStore'
import { useWalletStore } from '@/store/walletStore'
import { getIdentity } from '@/services/chat'
import { translate } from '@/lib/i18n'
import {
  isCallInvitation,
  parseCallInvitation,
  getCallSessionSnapshot,
  getPendingIncomingCallSession,
  getPendingIncomingCallSessions,
  isLiveIncomingCallState,
  rememberIncomingCallSession,
  markCallSessionHandled,
  subscribeToIncomingCallSessionChanges,
  recordCallDiagnostic,
  describeCallError,
  setCallActivity,
  assertCallAdmission,
  getCallAdmissionBlockReason,
} from '@/services/call'
import {
  dismissCallNotifications,
} from '@/services/notifications/pushService'
import { resolveNotificationScopeWallet } from '@/services/notifications/notificationScope'
import { useTorStore } from '@/services/tor/torStore'
import type { CallType, CallState } from '@/lib/types'
import { reconcileQuantumChat } from '@/services/quantumChat'
import { isSameAccountStorageScope } from '@/lib/accountScope'
import {
  canMinimizeCallUi,
  type CallPresentationMode,
  shouldShowFullScreenCall,
  shouldShowMinimizedCallBanner,
} from '@/lib/callPresentation'
import { registerClearnetOperation } from '@/services/tor/torEgressPolicy'

type MediaStream = any

type StartCall = (
  callerIdentityId: string,
  calleeIdentityId: string,
  conversationId: string,
  callType: CallType,
  contactName?: string,
  contactAvatarUrl?: string | null
) => Promise<string>

type HandleCallInvitation = (
  message: string,
  myIdentityId: string,
  conversationId: string,
  callerIdentityId?: string,
  callerName?: string,
  callerAvatarUrl?: string | null
) => boolean

interface CallContextValue {
  callState: CallState | null
  error: Error | null
  startCall: StartCall
  presentation: CallPresentationModel
}

export type PendingCallRecoveryPhase = 'chat' | 'invitation'

export interface CallPresentationModel {
  showFullScreenCall: boolean
  showMinimizedBanner: boolean
  pendingCallRecoveryPhase: PendingCallRecoveryPhase | null
  callState: CallState | null
  callType: CallType
  contactName?: string
  contactAvatarUrl?: string | null
  durationMs: number
  isMuted: boolean
  isVideoEnabled: boolean
  isSpeakerOn: boolean
  isIncoming: boolean
  canMinimize: boolean
  localStream: MediaStream | null
  remoteStream: MediaStream | null
  remoteStreamVersion: number
  answerCall: () => Promise<void>
  declineCall: () => Promise<void>
  endCall: () => Promise<void>
  toggleMute: () => void
  toggleVideo: () => Promise<void>
  toggleSpeaker: () => void
  switchCamera: () => Promise<void>
  minimizeCallUi: () => void
  expandCallUi: () => void
}

const CallContext = createContext<CallContextValue | null>(null)

const CALL_INVITATION_TTL_MS = 5 * 60 * 1000
const PENDING_CALL_INVITATION_RECOVERY_TIMEOUT_MS = 12_000
const PENDING_CALL_RECOVERY_RETRY_BASE_MS = 3_000
const PENDING_CALL_RECOVERY_RETRY_MAX_MS = 15_000

type StoredChatMessage = ReturnType<typeof useChatStore.getState>['messages'][number]

function findIncomingCallInvitationMessage(
  sessionId: string,
  localIdentityId: string,
): StoredChatMessage | null {
  const { messages } = useChatStore.getState()
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.senderId === localIdentityId || !isCallInvitation(message.content)) {
      continue
    }
    if (parseCallInvitation(message.content)?.sessionId === sessionId) {
      return message
    }
  }
  return null
}

function yieldCallWatcher(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function waitForIncomingCallInvitation(
  sessionId: string,
  localIdentityId: string,
  timeoutMs: number,
): Promise<StoredChatMessage | null> {
  return new Promise((resolve) => {
    let settled = false
    let unsubscribe = () => {}

    const finish = (message: StoredChatMessage | null) => {
      if (settled) {
        return
      }

      settled = true
      clearTimeout(timeout)
      unsubscribe()
      resolve(message)
    }

    const resolveIfFound = () => {
      const match = findIncomingCallInvitationMessage(sessionId, localIdentityId)
      if (match) {
        finish(match)
      }
    }

    const timeout = setTimeout(() => {
      finish(null)
    }, timeoutMs)

    unsubscribe = useChatStore.subscribe(() => {
      resolveIfFound()
    })

    resolveIfFound()
  })
}

async function getPendingIncomingCallForWallet(
  walletAddress: string | null,
) {
  const pendingCalls = await getPendingIncomingCallSessions()

  for (const pendingCall of pendingCalls) {
    if (!pendingCall.notificationScopeId) {
      if (pendingCall.source !== 'expo') {
        return pendingCall
      }
      continue
    }

    const scopedWallet = await resolveNotificationScopeWallet(
      pendingCall.notificationScopeId,
    ).catch(() => null)
    if (isSameAccountStorageScope(scopedWallet, walletAddress)) {
      return pendingCall
    }
  }

  return null
}

function CallInvitationWatcher({
  callState,
  handleCallInvitation,
  recoveringSessionIdRef,
  recoveredSessionIdsRef,
  recoveryRetry,
}: {
  callState: CallState | null
  handleCallInvitation: HandleCallInvitation
  recoveringSessionIdRef: React.MutableRefObject<string | null>
  recoveredSessionIdsRef: React.MutableRefObject<Set<string>>
  recoveryRetry: number
}) {
  const messageCount = useChatStore((state) => state.messages.length)
  const processedMessageIdsRef = useRef<Set<string>>(new Set())
  const scannedMessageCountRef = useRef(0)
  const lastRecoveryRetryRef = useRef(recoveryRetry)

  useEffect(() => {
    if (lastRecoveryRetryRef.current !== recoveryRetry) {
      lastRecoveryRetryRef.current = recoveryRetry
      scannedMessageCountRef.current = 0
    }
    if (callState) return

    const identity = getIdentity()
    if (!identity) return

    let cancelled = false

    void (async () => {
      if (cancelled) return

      const { messages } = useChatStore.getState()
      const startIndex = scannedMessageCountRef.current > messages.length
        ? 0
        : scannedMessageCountRef.current
      const INVITATION_SCAN_YIELD_EVERY = 32

      for (let index = messages.length - 1; index >= startIndex; index -= 1) {
        if (cancelled) {
          return
        }

        const scanned = messages.length - 1 - index
        if (scanned > 0 && scanned % INVITATION_SCAN_YIELD_EVERY === 0) {
          await yieldCallWatcher()
          if (cancelled) return
        }

        const message = messages[index]
        if (processedMessageIdsRef.current.has(message.id)) {
          continue
        }

        if (message.senderId === identity.id || !isCallInvitation(message.content)) {
          processedMessageIdsRef.current.add(message.id)
          continue
        }

        if (Date.now() - message.timestamp > CALL_INVITATION_TTL_MS) {
          processedMessageIdsRef.current.add(message.id)
          continue
        }

        const invitation = parseCallInvitation(message.content)
        if (!invitation) {
          processedMessageIdsRef.current.add(message.id)
          continue
        }

        if (recoveringSessionIdRef.current === invitation.sessionId) {
          continue
        }

        if (recoveredSessionIdsRef.current.has(invitation.sessionId)) {
          processedMessageIdsRef.current.add(message.id)
          continue
        }

        recordCallDiagnostic('recovery', 'context_invitation_candidate_found', {
          sessionId: invitation.sessionId,
          conversationId: message.conversationId,
          callerIdentityId: message.senderId,
          source: 'message_watch',
        })

        try {
          const [sessionSnapshot, pendingIncomingCall] = await Promise.all([
            getCallSessionSnapshot(invitation.sessionId),
            getPendingIncomingCallSession(invitation.sessionId),
          ])

          if (cancelled) {
            return
          }

          if (
            !sessionSnapshot ||
            sessionSnapshot.calleeIdentityId !== identity.id ||
            !isLiveIncomingCallState(sessionSnapshot.state)
          ) {
            processedMessageIdsRef.current.add(message.id)
            await markCallSessionHandled(invitation.sessionId).catch(() => {})
            continue
          }

          if (pendingIncomingCall && recoveringSessionIdRef.current === invitation.sessionId) {
            continue
          }

          const chatState = useChatStore.getState()
          const conversation = chatState.conversations.find(
            (entry) => entry.id === message.conversationId,
          )
          const contact = chatState._contactsByIdentityId?.get(message.senderId)
            ?? chatState.contacts.find((entry) => entry.identityId === message.senderId)
          const callerDisplayName =
            contact?.displayName ||
            message.senderName ||
            conversation?.title ||
            translate('Incoming call')
          const callerAvatar =
            contact?.avatarUrl || message.senderAvatarUrl || conversation?.avatarUrl || null
          const accepted = handleCallInvitation(
            message.content,
            identity.id,
            message.conversationId,
            message.senderId,
            callerDisplayName,
            callerAvatar,
          )

          processedMessageIdsRef.current.add(message.id)

          if (!accepted) {
            recordCallDiagnostic('recovery', 'context_invitation_rejected', {
              sessionId: invitation.sessionId,
              conversationId: message.conversationId,
              callerIdentityId: message.senderId,
            })
            break
          }

          await rememberIncomingCallSession({
            type: 'call',
            callSessionId: invitation.sessionId,
            callType: invitation.callType,
            callerIdentityId: message.senderId,
            callerName: callerDisplayName,
            conversationId: message.conversationId,
            receivedAt: Date.now(),
            source: 'message',
          }).catch(() => {})

          break
        } catch (error) {
          recordCallDiagnostic('recovery', 'context_invitation_validation_failed', {
            sessionId: invitation.sessionId,
            conversationId: message.conversationId,
            callerIdentityId: message.senderId,
            error: describeCallError(error),
          })
          console.warn('Failed to validate incoming call invitation:', error)
        }
      }
      scannedMessageCountRef.current = messages.length
    })()

    return () => {
      cancelled = true
    }
  }, [
    callState,
    handleCallInvitation,
    messageCount,
    recoveryRetry,
    recoveredSessionIdsRef,
    recoveringSessionIdRef,
  ])

  return null
}

export function CallProvider({ children }: { children: React.ReactNode }) {
  const {
    callState,
    localStream,
    remoteStream,
    remoteStreamVersion,
    session: quantumSession,
    effectiveCallType,
    duration,
    isMuted,
    isVideoEnabled,
    isSpeakerOn,
    error,
    isIncoming,
    incomingCallInfo,
    startCall: quantumStartCall,
    handleCallInvitation: quantumHandleCallInvitation,
    answerCall,
    declineCall,
    endCall,
    toggleMute,
    toggleVideo,
    toggleSpeaker,
    switchCamera,
  } = useQuantumCall()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const authenticatedWalletAddress = useAuthStore((state) => state.exoAddress)
  const isVaultUnlocked = useWalletStore((state) => state.isVaultUnlocked)
  const chatInitialized = useChatStore((state) => state.isInitialized)
  const chatInitializing = useChatStore((state) => state.isInitializing)
  const spectreEnabled = useSpectreStore((state) => state.enabled)
  const torEnabled = useTorStore((state) => state.enabled)
  const [appState, setAppState] = useState(AppState.currentState)
  const isAppActive = appState === 'active'
  
  const [callerName, setCallerName] = useState<string | undefined>()
  const [callerAvatarUrl, setCallerAvatarUrl] = useState<string | null | undefined>()
  const [callPresentationMode, setCallPresentationMode] = useState<CallPresentationMode>('fullscreen')
  const activeCallSessionIdRef = useRef<string | null>(null)
  const pendingIncomingRecoveryRef = useRef<string | null>(null)
  const recoveredIncomingSessionIdsRef = useRef<Set<string>>(new Set())
  const [pendingCallRecoveryPhase, setPendingCallRecoveryPhase] =
    useState<PendingCallRecoveryPhase | null>(null)
  const currentCallStateRef = useRef<CallState | null>(callState)
  const pendingRecoveryRetryRef = useRef<{
    sessionId: string
    timeout: ReturnType<typeof setTimeout>
  } | null>(null)
  const pendingRecoveryAttemptsRef = useRef<Map<string, number>>(new Map())
  const [pendingCallRecoveryRetry, setPendingCallRecoveryRetry] = useState(0)
  const [pendingCallRegistryRevision, setPendingCallRegistryRevision] = useState(0)

  useEffect(() => subscribeToIncomingCallSessionChanges(() => {
    setPendingCallRegistryRevision((revision) => revision + 1)
  }), [])

  const setContactMeta = useCallback((name?: string, avatar?: string | null) => {
    setCallerName(name)
    setCallerAvatarUrl(avatar)
  }, [])

  const clearPendingCallRecovery = useCallback((sessionId?: string | null) => {
    const retry = pendingRecoveryRetryRef.current
    if (retry && (!sessionId || retry.sessionId === sessionId)) {
      clearTimeout(retry.timeout)
      pendingRecoveryRetryRef.current = null
    }
    if (sessionId) {
      pendingRecoveryAttemptsRef.current.delete(sessionId)
    }
    if (!sessionId || pendingIncomingRecoveryRef.current === sessionId) {
      pendingIncomingRecoveryRef.current = null
    }
    setPendingCallRecoveryPhase(null)
  }, [])

  const schedulePendingCallRecoveryRetry = useCallback((sessionId: string) => {
    if (currentCallStateRef.current) {
      return
    }

    const current = pendingRecoveryRetryRef.current
    if (current?.sessionId === sessionId) {
      return
    }
    if (current) {
      clearTimeout(current.timeout)
    }

    const attempt = (pendingRecoveryAttemptsRef.current.get(sessionId) ?? 0) + 1
    pendingRecoveryAttemptsRef.current.set(sessionId, attempt)
    const delayMs = Math.min(
      PENDING_CALL_RECOVERY_RETRY_BASE_MS * 2 ** Math.min(attempt - 1, 3),
      PENDING_CALL_RECOVERY_RETRY_MAX_MS,
    )
    const timeout = setTimeout(() => {
      if (pendingRecoveryRetryRef.current?.sessionId === sessionId) {
        pendingRecoveryRetryRef.current = null
      }
      if (!currentCallStateRef.current) {
        setPendingCallRecoveryRetry((value) => value + 1)
      }
    }, delayMs)
    pendingRecoveryRetryRef.current = { sessionId, timeout }
    recordCallDiagnostic('recovery', 'context_pending_incoming_recovery_retry_scheduled', {
      sessionId,
      attempt,
      delayMs,
    })
  }, [])

  useEffect(() => () => {
    const retry = pendingRecoveryRetryRef.current
    if (retry) {
      clearTimeout(retry.timeout)
    }
  }, [])

  const minimizeCallUi = useCallback(() => {
    if (canMinimizeCallUi(callState, isIncoming)) {
      setCallPresentationMode('minimized')
    }
  }, [callState, isIncoming])

  const expandCallUi = useCallback(() => {
    if (callState) {
      setCallPresentationMode('fullscreen')
    }
  }, [callState])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      setAppState(nextState)
    })

    return () => {
      subscription.remove()
    }
  }, [])

  useEffect(() => {
    currentCallStateRef.current = callState
  }, [callState])

  useEffect(() => {
    setCallActivity(callState !== null && callState !== 'ended' && callState !== 'failed')
    return () => {
      setCallActivity(false)
    }
  }, [callState])

  useEffect(() => {
    if (!callState) {
      setCallPresentationMode('fullscreen')
      return
    }

    if (callState === 'ringing' && isIncoming) {
      setCallPresentationMode('fullscreen')
    }
  }, [callState, isIncoming])
  
  const startCall = useCallback(async (
    callerIdentityId: string,
    calleeIdentityId: string,
    convId: string,
    callType: CallType,
    contactName?: string,
    contactAvatar?: string | null
  ): Promise<string> => {
    const admissionBlockReason = getCallAdmissionBlockReason()
    if (admissionBlockReason === 'spectre') {
      recordCallDiagnostic('recovery', 'context_start_call_blocked_by_spectre', {
        callerIdentityId,
        calleeIdentityId,
        conversationId: convId,
        requestedCallType: callType,
      })
      Alert.alert(
        translate('Calls Disabled in Spectre Mode'),
        translate('Voice and video calls are disabled while Spectre Mode is active.'),
        [{ text: translate('OK') }],
      )
      return ''
    }

    if (admissionBlockReason === 'tor') {
      recordCallDiagnostic('recovery', 'context_start_call_blocked_by_tor', {
        callerIdentityId,
        calleeIdentityId,
        conversationId: convId,
        requestedCallType: callType,
      })
      console.log('[TOR] Call blocked: Tor mode is active, WebRTC calls are not supported')
      Alert.alert(
        translate('Calls Unavailable in Tor Mode'),
        translate('Voice and video calls require direct peer-to-peer connections (WebRTC) which cannot work over the Tor network due to UDP restrictions and high latency.\n\nTo make calls, disable Tor mode in Settings > Network Privacy.'),
        [{ text: translate('OK') }]
      )
      return ''
    }
    recordCallDiagnostic('session', 'context_start_call_requested', {
      callerIdentityId,
      calleeIdentityId,
      conversationId: convId,
      requestedCallType: callType,
    })
    setCallPresentationMode('fullscreen')
    setContactMeta(contactName, contactAvatar)
    const invitationMessage = await quantumStartCall(callerIdentityId, calleeIdentityId, convId, callType)
    if (invitationMessage) {
      const parsed = parseCallInvitation(invitationMessage)
      if (parsed) {
        activeCallSessionIdRef.current = parsed.sessionId
        recordCallDiagnostic('session', 'context_start_call_prepared', {
          sessionId: parsed.sessionId,
          requestedCallType: callType,
        })
      }
    }
    return invitationMessage
  }, [quantumStartCall, setContactMeta])
  
  const handleCallInvitation = useCallback((
    message: string,
    myIdentityId: string,
    convId: string,
    callerIdentityId?: string,
    contactName?: string,
    contactAvatar?: string | null
  ): boolean => {
    const admissionBlockReason = getCallAdmissionBlockReason()
    if (admissionBlockReason === 'spectre') {
      recordCallDiagnostic('recovery', 'context_handle_invitation_blocked_by_spectre', {
        callerIdentityId,
        conversationId: convId,
      })
      return false
    }

    if (admissionBlockReason === 'tor') {
      recordCallDiagnostic('recovery', 'context_handle_invitation_blocked_by_tor', {
        callerIdentityId,
        conversationId: convId,
      })
      console.log('[TOR] Incoming call rejected: Tor mode is active')
      return false
    }
    const invitation = parseCallInvitation(message)
    recordCallDiagnostic('recovery', 'context_handle_invitation_requested', {
      sessionId: invitation?.sessionId,
      callerIdentityId,
      conversationId: convId,
      callType: invitation?.callType,
    })
    setCallPresentationMode('fullscreen')
    setContactMeta(contactName, contactAvatar)
    const accepted = quantumHandleCallInvitation(message, myIdentityId, convId, callerIdentityId)
    if (accepted && invitation) {
      activeCallSessionIdRef.current = invitation.sessionId
    }
    recordCallDiagnostic('recovery', accepted ? 'context_handle_invitation_accepted' : 'context_handle_invitation_rejected', {
      sessionId: invitation?.sessionId,
      callerIdentityId,
      conversationId: convId,
      callType: invitation?.callType,
    })
    return accepted
  }, [quantumHandleCallInvitation, setContactMeta])

  useEffect(() => {
    if (!isAuthenticated || !isVaultUnlocked || callState) {
      setPendingCallRecoveryPhase(null)
      return
    }

    let cancelled = false

    void getPendingIncomingCallForWallet(authenticatedWalletAddress)
      .then((pendingIncomingCall) => {
        if (cancelled) return
        const pendingSessionId = pendingIncomingCall?.callSessionId
        if (!pendingSessionId) {
          setPendingCallRecoveryPhase(null)
          return
        }
        if (recoveredIncomingSessionIdsRef.current.has(pendingSessionId)) {
          clearPendingCallRecovery(pendingSessionId)
          void markCallSessionHandled(pendingSessionId).catch(() => {})
          return
        }

        setPendingCallRecoveryPhase(
          !chatInitialized || chatInitializing ? 'chat' : 'invitation',
        )
      })
      .catch(() => {
        if (!cancelled) {
          setPendingCallRecoveryPhase(null)
        }
      })

    return () => {
      cancelled = true
    }
  }, [
    callState,
    chatInitialized,
    chatInitializing,
    authenticatedWalletAddress,
    isAuthenticated,
    isVaultUnlocked,
    clearPendingCallRecovery,
    pendingCallRegistryRevision,
  ])

  useEffect(() => {
    if (callState || !isAppActive || !isAuthenticated || !isVaultUnlocked || !chatInitialized || chatInitializing) {
      return
    }

    let cancelled = false

    void (async () => {
      const pendingIncomingCall = await getPendingIncomingCallForWallet(
        authenticatedWalletAddress,
      ).catch(() => null)
      const pendingSessionId = pendingIncomingCall?.callSessionId
      const matchingPendingIncomingCall = pendingIncomingCall

      if (!pendingSessionId) {
        clearPendingCallRecovery()
        return
      }
      if (recoveredIncomingSessionIdsRef.current.has(pendingSessionId)) {
        clearPendingCallRecovery(pendingSessionId)
        void markCallSessionHandled(pendingSessionId).catch(() => {})
        return
      }
      if (pendingIncomingRecoveryRef.current === pendingSessionId) return

      pendingIncomingRecoveryRef.current = pendingSessionId
      setPendingCallRecoveryPhase('invitation')
      recordCallDiagnostic('recovery', 'context_pending_incoming_recovery_start', {
        sessionId: pendingSessionId,
        source: matchingPendingIncomingCall?.source,
      })

      try {
        const sessionSnapshot = await getCallSessionSnapshot(pendingSessionId)
        if (cancelled) {
          return
        }

        if (!sessionSnapshot) {
          recordCallDiagnostic('recovery', 'context_pending_incoming_recovery_snapshot_missing', {
            sessionId: pendingSessionId,
          })
          schedulePendingCallRecoveryRetry(pendingSessionId)
          return
        }

        const identity = getIdentity()
        if (!identity) {
          recordCallDiagnostic('recovery', 'context_pending_incoming_recovery_identity_unavailable', {
            sessionId: pendingSessionId,
          })
          schedulePendingCallRecoveryRetry(pendingSessionId)
          return
        }

        if (sessionSnapshot.calleeIdentityId !== identity.id) {
          recordCallDiagnostic('recovery', 'context_pending_incoming_recovery_account_mismatch', {
            sessionId: pendingSessionId,
          })
          recoveredIncomingSessionIdsRef.current.add(pendingSessionId)
          clearPendingCallRecovery(pendingSessionId)
          await markCallSessionHandled(pendingSessionId).catch(() => {})
          return
        }

        if (!isLiveIncomingCallState(sessionSnapshot.state)) {
          recordCallDiagnostic('recovery', 'context_pending_incoming_recovery_stale', {
            sessionId: pendingSessionId,
            state: sessionSnapshot?.state,
          })
          recoveredIncomingSessionIdsRef.current.add(pendingSessionId)
          clearPendingCallRecovery(pendingSessionId)
          await markCallSessionHandled(pendingSessionId).catch(() => {})
          return
        }

        try {
          await reconcileQuantumChat({
            fullResync: true,
            restartRealtime: true,
            reason: 'manual_recovery',
          })
        } catch (error) {
          recordCallDiagnostic('recovery', 'context_pending_incoming_reconcile_failed', {
            sessionId: pendingSessionId,
            error: describeCallError(error),
          })
          console.warn('Pending incoming call reconciliation failed:', error)
          schedulePendingCallRecoveryRetry(pendingSessionId)
          return
        }

        if (cancelled || callState) {
          return
        }

        const matchingMessage = await waitForIncomingCallInvitation(
          pendingSessionId,
          identity.id,
          PENDING_CALL_INVITATION_RECOVERY_TIMEOUT_MS,
        )

        if (!matchingMessage) {
          recordCallDiagnostic('recovery', 'context_pending_incoming_invitation_timeout', {
            sessionId: pendingSessionId,
            timeoutMs: PENDING_CALL_INVITATION_RECOVERY_TIMEOUT_MS,
          })
          const latestSessionSnapshot = await getCallSessionSnapshot(pendingSessionId).catch(
            () => null,
          )
          if (
            latestSessionSnapshot &&
            latestSessionSnapshot.calleeIdentityId === identity.id &&
            !isLiveIncomingCallState(latestSessionSnapshot.state)
          ) {
            recoveredIncomingSessionIdsRef.current.add(pendingSessionId)
            clearPendingCallRecovery(pendingSessionId)
            await markCallSessionHandled(pendingSessionId).catch(() => {})
            return
          }
          schedulePendingCallRecoveryRetry(pendingSessionId)
          return
        }

        const { contacts, conversations } = useChatStore.getState()
        const conversation = conversations.find((entry) => entry.id === matchingMessage.conversationId)
        const contact = contacts.find((entry) => entry.identityId === matchingMessage.senderId)
        const callerDisplayName =
          contact?.displayName ||
          matchingMessage.senderName ||
          matchingPendingIncomingCall?.callerName ||
          conversation?.title ||
          translate('Incoming call')
        const callerAvatar =
          contact?.avatarUrl || matchingMessage.senderAvatarUrl || conversation?.avatarUrl || null

        const accepted = handleCallInvitation(
          matchingMessage.content,
          identity.id,
          matchingMessage.conversationId,
          matchingMessage.senderId,
          callerDisplayName,
          callerAvatar,
        )
        if (!accepted) {
          schedulePendingCallRecoveryRetry(pendingSessionId)
          return
        }
        recoveredIncomingSessionIdsRef.current.add(pendingSessionId)
        clearPendingCallRecovery(pendingSessionId)
        recordCallDiagnostic('recovery', 'context_pending_incoming_recovery_completed', {
          sessionId: pendingSessionId,
          conversationId: matchingMessage.conversationId,
          callerIdentityId: matchingMessage.senderId,
        })
      } catch (error) {
        recordCallDiagnostic('recovery', 'context_pending_incoming_recovery_failed', {
          sessionId: pendingSessionId,
          error: describeCallError(error),
        })
        schedulePendingCallRecoveryRetry(pendingSessionId)
      } finally {
        if (pendingIncomingRecoveryRef.current === pendingSessionId) {
          pendingIncomingRecoveryRef.current = null
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    callState,
    chatInitialized,
    chatInitializing,
    authenticatedWalletAddress,
    handleCallInvitation,
    isAppActive,
    isAuthenticated,
    isVaultUnlocked,
    clearPendingCallRecovery,
    pendingCallRegistryRevision,
    pendingCallRecoveryRetry,
    schedulePendingCallRecoveryRetry,
  ])

  const answerCallForUi = useCallback(async () => {
    assertCallAdmission()
    const sessionId = activeCallSessionIdRef.current || incomingCallInfo?.sessionId
    if (sessionId) activeCallSessionIdRef.current = sessionId
    setCallPresentationMode('fullscreen')
    await answerCall()
  }, [answerCall, incomingCallInfo?.sessionId])

  const endCallRef = useRef(endCall)
  endCallRef.current = endCall

  useEffect(() => {
    if (torEnabled) {
      return
    }

    try {
      return registerClearnetOperation(async () => {
        const activeCall = currentCallStateRef.current
        if (activeCall) {
          await endCallRef.current().catch(() => undefined)
        }
      })
    } catch {
      return
    }
  }, [torEnabled])

  useEffect(() => {
    if ((!spectreEnabled && !torEnabled) || !currentCallStateRef.current) {
      return
    }

    recordCallDiagnostic('recovery', 'context_active_call_ended_for_private_transport', {
      currentState: currentCallStateRef.current,
      isIncoming,
      sessionId: activeCallSessionIdRef.current || quantumSession?.id,
      spectreEnabled,
      torEnabled,
    })

    endCallRef.current().catch((error) => {
      console.warn('[CallContext] Failed to end active call for private transport mode:', error)
    })
  }, [quantumSession?.id, spectreEnabled, torEnabled])

  useEffect(() => {
    const sid = incomingCallInfo?.sessionId || quantumSession?.id
    if (sid) {
      activeCallSessionIdRef.current = sid
    }
  }, [incomingCallInfo?.sessionId, quantumSession?.id])

  const prevCallStateRef = useRef<CallState | null>(callState)
  useEffect(() => {
    const prev = prevCallStateRef.current

    if (callState === 'connected' && prev !== 'connected') {
      const sid = activeCallSessionIdRef.current || incomingCallInfo?.sessionId || quantumSession?.id
      if (sid) {
        void dismissCallNotifications(sid).catch(() => {})
      }
    }

    if (prev && !callState) {
      const sid = activeCallSessionIdRef.current || incomingCallInfo?.sessionId || quantumSession?.id
      clearPendingCallRecovery(sid)
      if (sid) {
        recoveredIncomingSessionIdsRef.current.add(sid)
        void markCallSessionHandled(sid).catch(() => {})
        void dismissCallNotifications(sid).catch(() => {})
      }
      activeCallSessionIdRef.current = null
      setContactMeta(undefined, undefined)
    }

    prevCallStateRef.current = callState
  }, [
    callState,
    clearPendingCallRecovery,
    setContactMeta,
    incomingCallInfo?.sessionId,
    quantumSession?.id,
  ])

  const canMinimizeCurrentCall = canMinimizeCallUi(callState, isIncoming)
  const showFullScreenCall =
    shouldShowFullScreenCall(callState, isIncoming, callPresentationMode)
  const showMinimizedBanner =
    shouldShowMinimizedCallBanner(callState, isIncoming, callPresentationMode)
  const visibleCallType = incomingCallInfo?.callType || effectiveCallType || quantumSession?.callType || 'voice'
  
  const presentation = useMemo<CallPresentationModel>(() => ({
    showFullScreenCall,
    showMinimizedBanner,
    pendingCallRecoveryPhase,
    callState,
    callType: visibleCallType,
    contactName: callerName,
    contactAvatarUrl: callerAvatarUrl,
    durationMs: duration,
    isMuted,
    isVideoEnabled,
    isSpeakerOn,
    isIncoming,
    canMinimize: canMinimizeCurrentCall,
    localStream,
    remoteStream,
    remoteStreamVersion,
    answerCall: answerCallForUi,
    declineCall,
    endCall,
    toggleMute,
    toggleVideo,
    toggleSpeaker,
    switchCamera,
    minimizeCallUi,
    expandCallUi,
  }), [
    answerCallForUi,
    callState,
    callerAvatarUrl,
    callerName,
    canMinimizeCurrentCall,
    declineCall,
    duration,
    endCall,
    expandCallUi,
    isIncoming,
    isMuted,
    isSpeakerOn,
    isVideoEnabled,
    localStream,
    minimizeCallUi,
    remoteStream,
    remoteStreamVersion,
    showFullScreenCall,
    showMinimizedBanner,
    pendingCallRecoveryPhase,
    switchCamera,
    toggleMute,
    toggleSpeaker,
    toggleVideo,
    visibleCallType,
  ])

  const value = useMemo<CallContextValue>(() => ({
    callState,
    error,
    presentation,
    startCall,
  }), [
    callState,
    error,
    presentation,
    startCall,
  ])
  
  return (
    <CallContext.Provider value={value}>
      <View style={{ flex: 1 }}>
        {children}
        <CallInvitationWatcher
          callState={callState}
          handleCallInvitation={handleCallInvitation}
          recoveringSessionIdRef={pendingIncomingRecoveryRef}
          recoveredSessionIdsRef={recoveredIncomingSessionIdsRef}
          recoveryRetry={pendingCallRecoveryRetry}
        />
      </View>
    </CallContext.Provider>
  )
}

export function useCall(): CallContextValue {
  const context = useContext(CallContext)
  if (!context) {
    throw new Error('useCall must be used within a CallProvider')
  }
  return context
}

export function useCallPresentation(): CallPresentationModel {
  return useCall().presentation
}
