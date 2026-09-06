/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { AppState, Platform, type AppStateStatus } from 'react-native'
import {
  WebRTCManager,
  CallService,
  getCallSessionSnapshot,
  isLiveIncomingCallState,
  parseCallInvitation,
  isCallInvitation,
  shouldIgnoreCallStateTransition,
  recordCallDiagnostic,
  describeCallError,
  assertCallAdmission,
  getCallAdmissionBlockReason,
} from '../services/call'
import type { CallSession } from '../services/call'
import type { CallType, CallState, CallEndReason } from '@/lib/types'
import { resolveLocalCallEndReason } from '../services/call/callLifecycleUtils'
import { sendMessage as sendQuantumMessage } from '../services/quantumChat'

type MediaStream = any

const INCOMING_RINGING_TIMEOUT_MS = 45_000
const CALL_SESSION_STALE_MS = 12_000
const CALL_SETUP_INTERRUPTED_ERROR = 'Call setup was interrupted. Please try again.'

export interface UseQuantumCallResult {
  callState: CallState | null
  localStream: MediaStream | null
  remoteStream: MediaStream | null
  remoteStreamVersion: number
  session: CallSession | null
  effectiveCallType: CallType
  duration: number
  isMuted: boolean
  isVideoEnabled: boolean
  isSpeakerOn: boolean
  error: Error | null
  isIncoming: boolean
  incomingCallInfo: IncomingCallInfo | null
  
  startCall: (
    callerIdentityId: string,
    calleeIdentityId: string,
    conversationId: string,
    callType: CallType
  ) => Promise<string>
  
  handleCallInvitation: (
    message: string,
    myIdentityId: string,
    conversationId: string,
    callerIdentityId?: string
  ) => boolean
  
  answerCall: () => Promise<void>
  declineCall: () => Promise<void>
  endCall: () => Promise<void>
  toggleMute: () => void
  toggleVideo: () => Promise<void>
  toggleSpeaker: () => void
  switchCamera: () => Promise<void>
}

export interface IncomingCallInfo {
  sessionId: string
  callerIdentityId: string
  callType: CallType
  encryptionKey: string
}

type IncomingPreparation = {
  id: number
  service: CallService
  promise: Promise<CallService | null>
}

export function useQuantumCall(): UseQuantumCallResult {
  const [callState, setCallState] = useState<CallState | null>(null)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [remoteStreamVersion, setRemoteStreamVersion] = useState(0)
  const [session, setSession] = useState<CallSession | null>(null)
  const [effectiveCallType, setEffectiveCallType] = useState<CallType>('voice')
  const [duration, setDuration] = useState(0)
  const [isMuted, setIsMuted] = useState(false)
  const [isVideoEnabled, setIsVideoEnabled] = useState(false)
  const [isSpeakerOn, setIsSpeakerOn] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [isIncoming, setIsIncoming] = useState(false)
  const [incomingCallInfo, setIncomingCallInfo] = useState<IncomingCallInfo | null>(null)
  
  const managerRef = useRef<WebRTCManager | null>(null)
  const incomingCallServiceRef = useRef<CallService | null>(null)
  const ringingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pendingAnswerRef = useRef<{
    myIdentityId: string
    conversationId: string
  } | null>(null)
  const cleanupRef = useRef<() => void>(() => {})
  const callInProgressRef = useRef(false)
  const answerInFlightRef = useRef(false)
  const incomingPreparationIdRef = useRef(0)
  const incomingPreparationRef = useRef<IncomingPreparation | null>(null)
  const deferredIncomingEndReasonsRef = useRef(new Map<number, CallEndReason>())
  const outgoingNegotiationStartedRef = useRef(false)
  const localEndInProgressRef = useRef(false)
  const appExitCancelInFlightRef = useRef(false)
  
  useEffect(() => {
    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current)
      }
      if (ringingTimeoutRef.current) {
        clearTimeout(ringingTimeoutRef.current)
      }
    }
  }, [])
  
  useEffect(() => {
    if (callState === 'connected') {
      durationIntervalRef.current = setInterval(() => {
        if (managerRef.current) {
          setDuration(managerRef.current.getDuration())
        }
      }, 1000)
    } else {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current)
        durationIntervalRef.current = null
      }
    }
  }, [callState])

  useEffect(() => {
    if (!isIncoming || callState !== 'ringing' || !incomingCallInfo?.sessionId) {
      return
    }

    let cancelled = false

    const syncRemoteRingState = async () => {
      try {
        const snapshot = await getCallSessionSnapshot(incomingCallInfo.sessionId)
        if (cancelled || !snapshot) {
          return
        }

        if (snapshot.state === 'ended' || snapshot.state === 'failed') {
          if (localEndInProgressRef.current) {
            return
          }
          cleanupRef.current()
          return
        }

        if (
          isLiveIncomingCallState(snapshot.state) &&
          Date.now() - snapshot.updatedAt > CALL_SESSION_STALE_MS
        ) {
          await incomingCallServiceRef.current?.endCall('cancelled').catch(() => {})
          cleanupRef.current()
        }
      } catch (error) {
        recordCallDiagnostic('recovery', 'incoming_call_state_refresh_failed', {
          sessionId: incomingCallInfo?.sessionId,
          error: describeCallError(error),
        })
        console.warn('Failed to refresh incoming call state:', error)
      }
    }

    void syncRemoteRingState()
    const interval = setInterval(() => {
      void syncRemoteRingState()
    }, 2000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [callState, incomingCallInfo?.sessionId, isIncoming])

  useEffect(() => {
    if (!session?.id || !callState || !managerRef.current) {
      return
    }

    if (callState === 'ended' || callState === 'failed') {
      return
    }

    let cancelled = false

    const syncActiveCallState = async () => {
      try {
        const snapshot = await getCallSessionSnapshot(session.id)
        if (cancelled || !snapshot) {
          return
        }

        if (snapshot.state === 'ended' || snapshot.state === 'failed') {
          if (localEndInProgressRef.current) {
            return
          }
          cleanupRef.current()
          return
        }

        if (snapshot.state === 'connected') {
          managerRef.current?.synchronizeConnected(snapshot.startedAt || snapshot.updatedAt)
          setSession(managerRef.current?.getSession() || null)
        }
      } catch (error) {
        recordCallDiagnostic('recovery', 'active_call_state_refresh_failed', {
          sessionId: session?.id,
          error: describeCallError(error),
        })
        console.warn('Failed to refresh active call state:', error)
      }
    }

    void syncActiveCallState()
    const interval = setInterval(() => {
      void syncActiveCallState()
    }, 2000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [callState, session?.id])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        appExitCancelInFlightRef.current = false
        return
      }

      if (nextState !== 'background') {
        return
      }

      if (
        appExitCancelInFlightRef.current ||
        isIncoming ||
        !managerRef.current ||
        (Platform.OS === 'android' && !outgoingNegotiationStartedRef.current) ||
        (callState !== 'initiating' && callState !== 'ringing' && callState !== 'connecting')
      ) {
        return
      }

      appExitCancelInFlightRef.current = true
      localEndInProgressRef.current = true

      void managerRef.current.endCall('cancelled').catch((err) => {
        appExitCancelInFlightRef.current = false
        recordCallDiagnostic('recovery', 'cancel_outgoing_call_on_exit_failed', {
          sessionId: session?.id,
          error: describeCallError(err),
        })
        console.warn('Failed to cancel outgoing call on app exit:', err)
      })
    })

    return () => {
      subscription.remove()
    }
  }, [callState, isIncoming, session?.id])
  
  const initManager = useCallback((options?: { callService?: CallService | null }) => {
    recordCallDiagnostic('session', 'hook_init_manager', {
      reusedCallService: Boolean(options?.callService),
    })
    managerRef.current = new WebRTCManager({
      onStateChange: (state) => {
        recordCallDiagnostic('session', 'hook_call_state_changed', {
          sessionId: managerRef.current?.getSession()?.id,
          nextState: state,
        })
        setCallState((currentState) => (
          shouldIgnoreCallStateTransition(currentState, state)
            ? currentState
            : state
        ))
      },
      onLocalStream: (stream) => {
        setLocalStream(stream)
      },
      onRemoteStream: (stream, version) => {
        setRemoteStream(stream)
        setRemoteStreamVersion((currentVersion) => (
          typeof version === 'number' ? version : currentVersion + 1
        ))
      },
      onMediaStateChange: ({ effectiveCallType, isVideoEnabled }) => {
        setEffectiveCallType(effectiveCallType)
        setIsVideoEnabled(isVideoEnabled)
      },
      onError: (err) => {
        recordCallDiagnostic('session', 'hook_manager_error', {
          sessionId: managerRef.current?.getSession()?.id,
          error: err.message,
        })
        setError(err)
      },
      onCallEnded: (reason) => {
        recordCallDiagnostic('session', 'hook_call_ended', {
          sessionId: managerRef.current?.getSession()?.id,
          reason,
        })
        localEndInProgressRef.current = false
        cleanupRef.current()
      },
    }, {
      callService: options?.callService || undefined,
    })
  }, [])
  
  const cleanup = useCallback(() => {
    recordCallDiagnostic('session', 'hook_cleanup', {
      sessionId: managerRef.current?.getSession()?.id || incomingCallServiceRef.current?.getSession()?.id,
    })
    managerRef.current?.dispose()
    if (incomingCallServiceRef.current) {
      incomingCallServiceRef.current.cleanup()
    }
    incomingPreparationIdRef.current += 1
    incomingPreparationRef.current = null

    setCallState(null)
    setLocalStream(null)
    setRemoteStream(null)
    setRemoteStreamVersion(0)
    setSession(null)
    setEffectiveCallType('voice')
    setDuration(0)
    setIsMuted(false)
    setIsVideoEnabled(false)
    setIsSpeakerOn(false)
    setError(null)
    setIsIncoming(false)
    setIncomingCallInfo(null)
    managerRef.current = null
    incomingCallServiceRef.current = null
    pendingAnswerRef.current = null
    answerInFlightRef.current = false
    outgoingNegotiationStartedRef.current = false
    localEndInProgressRef.current = false
    callInProgressRef.current = false
    appExitCancelInFlightRef.current = false
    
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current)
      durationIntervalRef.current = null
    }
    if (ringingTimeoutRef.current) {
      clearTimeout(ringingTimeoutRef.current)
      ringingTimeoutRef.current = null
    }
  }, [])
  
  cleanupRef.current = cleanup
  
  const startCall = useCallback(async (
    callerIdentityId: string,
    calleeIdentityId: string,
    conversationId: string,
    callType: CallType
  ): Promise<string> => {
    try {
      assertCallAdmission()
    } catch (error) {
      setError(error as Error)
      throw error
    }

    if (callInProgressRef.current) {
      recordCallDiagnostic('session', 'hook_start_call_rejected', {
        callerIdentityId,
        calleeIdentityId,
        conversationId,
        requestedCallType: callType,
        reason: 'call_already_in_progress',
      })
      throw new Error('A call is already in progress')
    }
    callInProgressRef.current = true
    recordCallDiagnostic('session', 'hook_start_call_requested', {
      callerIdentityId,
      calleeIdentityId,
      conversationId,
      requestedCallType: callType,
    })

    try {
      setError(null)
      localEndInProgressRef.current = false
      setIsIncoming(false)
      setEffectiveCallType(callType)
      setIsVideoEnabled(callType === 'video')
      setCallState('initiating')
      initManager()
      const manager = managerRef.current
      if (!manager) {
        throw new Error(CALL_SETUP_INTERRUPTED_ERROR)
      }
      
      const { session: newSession, invitationMessage } = await manager.startCall(
        callerIdentityId,
        calleeIdentityId,
        conversationId,
        callType
      )
      if (!newSession?.id) {
        throw new Error('Call session was not initialized.')
      }
      
      setSession(newSession)

      const invitationResult = await sendQuantumMessage(calleeIdentityId, invitationMessage)
      if (!invitationResult.success) {
        throw new Error(invitationResult.error || 'Failed to send call invitation')
      }
      recordCallDiagnostic('session', 'hook_call_invitation_sent', {
        sessionId: newSession.id,
        calleeIdentityId,
      })

      if (managerRef.current !== manager) {
        throw new Error(CALL_SETUP_INTERRUPTED_ERROR)
      }
      outgoingNegotiationStartedRef.current = true
      await manager.startOutgoingNegotiation()
      if (managerRef.current !== manager) {
        throw new Error(CALL_SETUP_INTERRUPTED_ERROR)
      }
      setSession(manager.getSession())
      
      return invitationMessage
    } catch (err) {
      const manager = managerRef.current
      if (manager?.getSession()) {
        try {
          await manager.endCall('network_error')
        } catch {
          manager.dispose()
        }
      } else {
        manager?.dispose()
      }
      managerRef.current = null
      callInProgressRef.current = false
      outgoingNegotiationStartedRef.current = false
      setCallState(null)
      setSession(null)
      setLocalStream(null)
      setRemoteStream(null)
      setRemoteStreamVersion(0)
      setEffectiveCallType('voice')
      setIsVideoEnabled(false)
      setError(err as Error)
      recordCallDiagnostic('session', 'hook_start_call_failed', {
        callerIdentityId,
        calleeIdentityId,
        conversationId,
        requestedCallType: callType,
        error: describeCallError(err),
      })
      throw err
    }
  }, [initManager])
  
  const handleCallInvitation = useCallback((
    message: string,
    myIdentityId: string,
    conversationId: string,
    callerIdentityId?: string
  ): boolean => {
    const admissionBlockReason = getCallAdmissionBlockReason()
    if (admissionBlockReason) {
      recordCallDiagnostic('recovery', 'hook_handle_call_invitation_ignored', {
        reason: `${admissionBlockReason}_mode_active`,
      })
      return false
    }

    if (!isCallInvitation(message)) {
      recordCallDiagnostic('recovery', 'hook_handle_call_invitation_ignored', {
        reason: 'not_a_call_invitation',
      })
      return false
    }

    if (callInProgressRef.current) {
      recordCallDiagnostic('recovery', 'hook_handle_call_invitation_ignored', {
        reason: 'call_already_in_progress',
      })
      return false
    }
    
    const invitation = parseCallInvitation(message)
    if (!invitation) {
      recordCallDiagnostic('recovery', 'hook_handle_call_invitation_ignored', {
        reason: 'invitation_parse_failed',
      })
      return false
    }

    recordCallDiagnostic('recovery', 'hook_handle_call_invitation', {
      sessionId: invitation.sessionId,
      callerIdentityId,
      conversationId,
      callType: invitation.callType,
    })

    callInProgressRef.current = true
    localEndInProgressRef.current = false
    setEffectiveCallType(invitation.callType)
    setIsVideoEnabled(false)
    
    setIncomingCallInfo({
      sessionId: invitation.sessionId,
      callerIdentityId: callerIdentityId || '',
      callType: invitation.callType,
      encryptionKey: invitation.encryptionKey,
    })
    
    pendingAnswerRef.current = {
      myIdentityId,
      conversationId,
    }

    if (incomingCallServiceRef.current) {
      incomingCallServiceRef.current.cleanup()
      incomingCallServiceRef.current = null
    }

    const callService = new CallService()
    const preparationId = incomingPreparationIdRef.current + 1
    incomingPreparationIdRef.current = preparationId
    const preparation = callService.acceptIncomingCall(
      invitation.sessionId,
      callerIdentityId || '',
      myIdentityId,
      conversationId,
      invitation.callType,
      invitation.encryptionKey,
      { skipPolling: true },
    ).then(async () => {
      const deferredEndReason = deferredIncomingEndReasonsRef.current.get(preparationId)
      if (deferredEndReason) {
        deferredIncomingEndReasonsRef.current.delete(preparationId)
        await callService.endCall(deferredEndReason).catch(() => undefined)
        callService.cleanup()
        return null
      }
      if (
        incomingPreparationIdRef.current !== preparationId ||
        !pendingAnswerRef.current ||
        !callInProgressRef.current
      ) {
        callService.cleanup()
        return null
      }
      incomingCallServiceRef.current = callService
      void callService.sendRinging().catch((err) => {
        recordCallDiagnostic('recovery', 'hook_send_ringing_failed', {
          sessionId: invitation.sessionId,
          error: describeCallError(err),
        })
        console.warn('Failed to notify caller that the call is ringing:', err)
      })
      return callService
    }).catch((err) => {
      recordCallDiagnostic('recovery', 'hook_prepare_incoming_call_service_failed', {
        sessionId: invitation.sessionId,
        error: describeCallError(err),
      })
      console.warn('Failed to prepare incoming call service for decline:', err)
      if (incomingPreparationIdRef.current === preparationId) {
        cleanupRef.current()
      }
      return null
    })
    incomingPreparationRef.current = {
      id: preparationId,
      service: callService,
      promise: preparation,
    }
    
    setIsIncoming(true)
    setCallState('ringing')

    if (ringingTimeoutRef.current) clearTimeout(ringingTimeoutRef.current)
    ringingTimeoutRef.current = setTimeout(() => {
      if (incomingPreparationIdRef.current !== preparationId) {
        return
      }
      if (incomingCallServiceRef.current === callService) {
        void callService.endCall('missed').catch(() => undefined)
      } else {
        deferredIncomingEndReasonsRef.current.set(preparationId, 'missed')
      }
      recordCallDiagnostic('recovery', 'hook_incoming_call_timed_out', {
        sessionId: invitation.sessionId,
      })
      cleanupRef.current()
    }, INCOMING_RINGING_TIMEOUT_MS)
    
    return true
  }, [])
  
  const answerCall = useCallback(async () => {
    try {
      assertCallAdmission()
    } catch (error) {
      setError(error as Error)
      throw error
    }

    if (!incomingCallInfo || !pendingAnswerRef.current) {
      recordCallDiagnostic('session', 'hook_answer_call_rejected', {
        reason: 'no_incoming_call',
      })
      throw new Error('No incoming call to answer')
    }
    if (answerInFlightRef.current) {
      recordCallDiagnostic('session', 'hook_answer_call_rejected', {
        sessionId: incomingCallInfo.sessionId,
        reason: 'answer_already_in_flight',
      })
      return
    }
    
    answerInFlightRef.current = true
    recordCallDiagnostic('session', 'hook_answer_call_requested', {
      sessionId: incomingCallInfo.sessionId,
    })
    let preparedIncomingCallService: CallService | null = null
    try {
      const expectedSessionId = incomingCallInfo.sessionId
      const preparation = incomingPreparationRef.current
      preparedIncomingCallService = incomingCallServiceRef.current ||
        await preparation?.promise ||
        null
      if (
        !preparedIncomingCallService ||
        incomingCallInfo.sessionId !== expectedSessionId ||
        (preparation !== null && incomingPreparationIdRef.current !== preparation.id) ||
        !pendingAnswerRef.current ||
        !callInProgressRef.current
      ) {
        throw new Error('Incoming call is no longer available')
      }

      setError(null)
      setEffectiveCallType(incomingCallInfo.callType)
      if (ringingTimeoutRef.current) {
        clearTimeout(ringingTimeoutRef.current)
        ringingTimeoutRef.current = null
      }
      setCallState('connecting')
      incomingCallServiceRef.current = null
      incomingPreparationRef.current = null
      incomingPreparationIdRef.current += 1
      initManager({ callService: preparedIncomingCallService })
      
      const { myIdentityId, conversationId } = pendingAnswerRef.current
      
      await managerRef.current!.answerCall(
        incomingCallInfo.sessionId,
        incomingCallInfo.callerIdentityId,
        myIdentityId,
        conversationId,
        incomingCallInfo.callType,
        incomingCallInfo.encryptionKey,
      )
      
      setSession(managerRef.current!.getSession())
      recordCallDiagnostic('session', 'hook_answer_call_succeeded', {
        sessionId: incomingCallInfo.sessionId,
      })
    } catch (err) {
      const manager = managerRef.current
      if (manager) {
        void manager.endCall('network_error').catch(() => undefined)
      } else if (preparedIncomingCallService) {
        void preparedIncomingCallService.endCall('network_error').catch(() => undefined)
      }
      cleanup()
      setError(err as Error)
      recordCallDiagnostic('session', 'hook_answer_call_failed', {
        sessionId: incomingCallInfo.sessionId,
        error: describeCallError(err),
      })
      throw err
    } finally {
      answerInFlightRef.current = false
    }
  }, [incomingCallInfo, initManager])
  
  const declineCall = useCallback(async () => {
    localEndInProgressRef.current = true
    recordCallDiagnostic('session', 'hook_decline_call_requested', {
      sessionId: managerRef.current?.getSession()?.id || incomingCallServiceRef.current?.getSession()?.id,
    })

    if (managerRef.current) {
      await managerRef.current.declineCall()
    } else if (incomingCallServiceRef.current) {
      await incomingCallServiceRef.current.declineCall()
    } else if (incomingPreparationRef.current) {
      deferredIncomingEndReasonsRef.current.set(
        incomingPreparationRef.current.id,
        'declined',
      )
    }
    cleanup()
  }, [cleanup])
  
  const endCall = useCallback(async () => {
    const reason = resolveLocalCallEndReason(callState, isIncoming)
    localEndInProgressRef.current = true
    recordCallDiagnostic('session', 'hook_end_call_requested', {
      sessionId: managerRef.current?.getSession()?.id || incomingCallServiceRef.current?.getSession()?.id,
      reason,
      isIncoming,
    })

    if (managerRef.current) {
      await managerRef.current.endCall(reason)
      return
    }
    cleanup()
  }, [callState, cleanup, isIncoming])
  
  const toggleMute = useCallback(() => {
    if (managerRef.current) {
      const newState = managerRef.current.toggleMute()
      setIsMuted(newState)
    }
  }, [])
  
  const toggleVideo = useCallback(async () => {
    if (!managerRef.current) {
      return
    }

    try {
      setError(null)
      const newState = await managerRef.current.toggleVideo()
      setIsVideoEnabled(newState)
    } catch (err) {
      setError(err as Error)
    }
  }, [])
  
  const toggleSpeaker = useCallback(() => {
    if (managerRef.current) {
      const newState = managerRef.current.toggleSpeaker()
      setIsSpeakerOn(newState)
    }
  }, [])
  
  const switchCamera = useCallback(async () => {
    if (managerRef.current) {
      await managerRef.current.switchCamera()
    }
  }, [])
  
  return {
    callState,
    localStream,
    remoteStream,
    remoteStreamVersion,
    session,
    effectiveCallType,
    duration,
    isMuted,
    isVideoEnabled,
    isSpeakerOn,
    error,
    isIncoming,
    incomingCallInfo,
    
    startCall,
    handleCallInvitation,
    answerCall,
    declineCall,
    endCall,
    toggleMute,
    toggleVideo,
    toggleSpeaker,
    switchCamera,
  }
}
