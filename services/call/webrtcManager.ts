/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

/**
 * Manages WebRTC media and peer connections.
 */

import { 
  CallService, 
  type CallSession, 
  type RTCIceCandidate as ICECandidate,
} from './callService'
import { getTrackStableId, hasLiveAudioTrack, hasLiveVideoTrack } from '../../lib/callMedia'
import type { CallType, CallState, CallEndReason } from '@/lib/types'
import { Audio, type AVPlaybackStatus } from 'expo-av'
import { Camera } from 'expo-camera'
import { AppState, type AppStateStatus, Platform } from 'react-native'
import { ensureVerifiedBackendAccess } from '../backend/session'
import { backendRequest } from '@/services/backend/client'
import {
  describeCallError,
  recordCallDiagnostic,
  startCallLatencySpan,
  type CallDiagnosticField,
} from './callDiagnostics'

let RTCPeerConnection: any = null
let RTCSessionDescription: any = null
let RTCIceCandidate: any = null
let RTCMediaStream: any = null
let mediaDevices: any = null
let InCallManager: any = null

type InjectedWebRTCModules = {
  RTCPeerConnection: any
  RTCSessionDescription: any
  RTCIceCandidate: any
  MediaStream: any
  mediaDevices: any
  InCallManager?: any
}

let webrtcAvailable = false
try {
  const webrtc = require('react-native-webrtc')
  RTCPeerConnection = webrtc.RTCPeerConnection
  RTCSessionDescription = webrtc.RTCSessionDescription
  RTCIceCandidate = webrtc.RTCIceCandidate
  RTCMediaStream = webrtc.MediaStream
  mediaDevices = webrtc.mediaDevices
  InCallManager = require('react-native-incall-manager').default
  webrtcAvailable = true
} catch (e) {
  const injected = (globalThis as Record<string, unknown>).__SPECTRA_TEST_WEBRTC__ as InjectedWebRTCModules | undefined
  if (injected) {
    RTCPeerConnection = injected.RTCPeerConnection
    RTCSessionDescription = injected.RTCSessionDescription
    RTCIceCandidate = injected.RTCIceCandidate
    RTCMediaStream = injected.MediaStream
    mediaDevices = injected.mediaDevices
    InCallManager = injected.InCallManager || null
    webrtcAvailable = true
  } else {
    webrtcAvailable = false
  }
}

type MediaStream = any

let cachedIceServers: RTCIceServer[] | null = null
let cacheRefreshAt = 0
let cacheHardExpiresAt = 0

class TurnCredentialsUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TurnCredentialsUnavailableError'
  }
}

function hasVerifiedTurnServer(iceServers: RTCIceServer[]): boolean {
  return iceServers.some((server) => {
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls]
    return urls.some((url) => typeof url === 'string' && url.startsWith('turn:'))
  })
}

async function fetchTurnCredentials(): Promise<RTCIceServer[]> {
  const now = Date.now()
  if (cachedIceServers && now < cacheRefreshAt) {
    recordCallDiagnostic('transport', 'turn_credentials_cache_hit', {
      serverCount: cachedIceServers.length,
      cacheState: 'fresh',
    })
    return cachedIceServers
  }

  const span = startCallLatencySpan('transport', 'fetch_turn_credentials')

  try {
    const verifiedSession = await ensureVerifiedBackendAccess().catch((error) => {
      recordCallDiagnostic('transport', 'turn_credentials_verified_access_failed', {
        error: describeCallError(error),
      })
      return null
    })
    if (!verifiedSession) {
      if (cachedIceServers && now < cacheHardExpiresAt) {
        span.end({ outcome: 'stale_cache_fallback', serverCount: cachedIceServers.length })
        recordCallDiagnostic('transport', 'turn_credentials_cache_hit', {
          serverCount: cachedIceServers.length,
          cacheState: 'stale_fallback',
        })
        return cachedIceServers
      }
      throw new TurnCredentialsUnavailableError('Verified TURN credentials are required before starting a call.')
    }

    recordCallDiagnostic('transport', 'turn_credentials_fetch_start')
    const data = await backendRequest<{ iceServers?: RTCIceServer[] }>('/v1/calls/turn-credentials', {
      method: 'POST',
      body: { ttl: 86400 },
    }, { accessToken: verifiedSession.accessToken })

    if (!Array.isArray(data?.iceServers)) {
      throw new TurnCredentialsUnavailableError('Unable to fetch verified TURN credentials.')
    }

    const iceServers = data.iceServers as RTCIceServer[]
    if (!hasVerifiedTurnServer(iceServers)) {
      throw new TurnCredentialsUnavailableError('TURN credential response did not include a relay server.')
    }

    cachedIceServers = iceServers
    cacheRefreshAt = now + 12 * 60 * 60 * 1000
    cacheHardExpiresAt = now + 24 * 60 * 60 * 1000
    span.end({ outcome: 'ok', serverCount: cachedIceServers.length })
    recordCallDiagnostic('transport', 'turn_credentials_fetch_succeeded', {
      serverCount: cachedIceServers.length,
      hasRelayServer: true,
    })
    return cachedIceServers
  } catch (err) {
    if (cachedIceServers && now < cacheHardExpiresAt) {
      span.end({ outcome: 'stale_cache_fallback', serverCount: cachedIceServers.length })
      recordCallDiagnostic('transport', 'turn_credentials_cache_hit', {
        serverCount: cachedIceServers.length,
        cacheState: 'stale_fallback',
        error: describeCallError(err),
      })
      return cachedIceServers
    }
    span.end({ outcome: 'error', error: describeCallError(err) })
    recordCallDiagnostic('transport', 'turn_credentials_fetch_failed', {
      error: describeCallError(err),
    })
    throw err
  }
}

async function getRTCConfiguration(): Promise<RTCConfiguration> {
  const iceServers = await fetchTurnCredentials()
  recordCallDiagnostic('transport', 'rtc_configuration_ready', {
    serverCount: iceServers.length,
    iceTransportPolicy: 'relay',
  })
  return {
    iceServers,
    iceCandidatePoolSize: 0,
    iceTransportPolicy: 'relay',
  }
}

async function ensureMediaPermissions(callType: CallType): Promise<void> {
  const microphone = await Audio.requestPermissionsAsync()
  if (!microphone.granted) {
    throw new Error('Microphone permission denied. Enable Microphone access for Spectra in iOS Settings.')
  }

  if (callType === 'video') {
    const camera = await Camera.requestCameraPermissionsAsync()
    if (!camera.granted) {
      throw new Error('Camera permission denied. Enable Camera access for Spectra in iOS Settings.')
    }
  }
}

const MEDIA_CONSTRAINTS = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
  video: {
    facingMode: 'user',
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30 },
  },
}

export interface WebRTCManagerCallbacks {
  onStateChange: (state: CallState) => void
  onRemoteStream: (stream: MediaStream, version?: number) => void
  onLocalStream: (stream: MediaStream) => void
  onMediaStateChange?: (state: {
    effectiveCallType: CallType
    isVideoEnabled: boolean
  }) => void
  onError: (error: Error) => void
  onCallEnded: (reason: string) => void
}

export function isWebRTCAvailable(): boolean {
  return webrtcAvailable
}

const RINGING_TIMEOUT_MS = 45_000
const RECONNECTION_TIMEOUT_MS = 30_000
const RINGBACK_RETRY_DELAY_MS = 750
const RINGBACK_PAUSE_MS = 2_500
const WEBRTC_UNAVAILABLE_ERROR = 'Voice/video calls require native WebRTC support in this build.'
let RINGBACK_SOUND_ASSET: any = null
try {
  RINGBACK_SOUND_ASSET = require('../../assets/sounds/caller-ringback.mp3')
} catch {
  RINGBACK_SOUND_ASSET = null
}

type RTCStatsLike = Record<string, unknown>

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function createRTCSessionDescription(description: { type: 'offer' | 'answer'; sdp: string }) {
  if (typeof RTCSessionDescription === 'function') {
    try {
      return new RTCSessionDescription(description)
    } catch {
      return description
    }
  }

  return description
}

function createRTCIceCandidate(candidate: ICECandidate) {
  const normalizedCandidate = {
    candidate: candidate.candidate,
    sdpMLineIndex: candidate.sdpMLineIndex,
    sdpMid: candidate.sdpMid,
  }

  if (typeof RTCIceCandidate === 'function') {
    try {
      return new RTCIceCandidate(normalizedCandidate)
    } catch {
      return normalizedCandidate
    }
  }

  return normalizedCandidate
}

function isDevLoggingEnabled(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__ === true
}

function summarizeIceCandidate(candidate: string | null | undefined): {
  candidateType?: string
  candidateProtocol?: string
} {
  if (!candidate) {
    return {}
  }

  const parts = candidate.trim().split(/\s+/)
  const candidateProtocol = parts[2]
  const typeIndex = parts.indexOf('typ')

  return {
    candidateType: typeIndex >= 0 ? parts[typeIndex + 1] : undefined,
    candidateProtocol,
  }
}

function normalizeRTCStatsReports(reports: unknown): RTCStatsLike[] {
  if (!reports) {
    return []
  }

  if (reports instanceof Map) {
    return Array.from(reports.values()).filter(
      (value): value is RTCStatsLike => Boolean(value && typeof value === 'object'),
    )
  }

  if (Array.isArray(reports)) {
    return reports.filter(
      (value): value is RTCStatsLike => Boolean(value && typeof value === 'object'),
    )
  }

  if (typeof reports === 'object') {
    const reportRecord = reports as Record<string, unknown> & {
      forEach?: (callback: (value: unknown) => void) => void
      type?: unknown
    }

    const collected: RTCStatsLike[] = []
    if (typeof reportRecord.forEach === 'function') {
      reportRecord.forEach((value: unknown) => {
        if (value && typeof value === 'object') {
          collected.push(value as RTCStatsLike)
        }
      })
      if (collected.length > 0) {
        return collected
      }
    }

    if (typeof reportRecord.type === 'string') {
      return [reportRecord]
    }

    return Object.values(reportRecord).filter(
      (value): value is RTCStatsLike => Boolean(value && typeof value === 'object'),
    )
  }

  return []
}

export class WebRTCManager {
  private peerConnection: any = null
  private localStream: MediaStream | null = null
  private remoteStream: MediaStream | null = null
  private callService: CallService
  private callbacks: WebRTCManagerCallbacks
  private callType: CallType = 'voice'
  private isMuted: boolean = false
  private isVideoEnabled: boolean = false
  private isSpeakerOn: boolean = false
  private remoteTrackIds: Set<string> = new Set()
  private remoteStreamVersion: number = 0
  private remoteMediaReady: boolean = false
  private hasLoggedPendingRemoteMedia: boolean = false
  private pendingIceCandidates: ICECandidate[] = []
  private pendingOffer: { sdp: string } | null = null
  private offerProcessing: boolean = false
  private renegotiationQueue: Promise<void> = Promise.resolve()
  private hasMarkedConnected: boolean = false
  private inCallManagerActive: boolean = false
  private ringbackActive: boolean = false
  private ringbackSound: Audio.Sound | null = null
  private ringbackToken: number = 0
  private ringbackRestartTimeout: ReturnType<typeof setTimeout> | null = null
  private ringingTimeout: ReturnType<typeof setTimeout> | null = null
  private reconnectionTimeout: ReturnType<typeof setTimeout> | null = null
  private connectivityProbeInterval: ReturnType<typeof setInterval> | null = null
  private connectivityProbeInFlight: boolean = false
  private appState: AppStateStatus = AppState.currentState
  private appStateSubscription: { remove(): void } | null = null
  private reconnectOnForeground: boolean = false
  
  constructor(
    callbacks: WebRTCManagerCallbacks,
    options?: { callService?: CallService },
  ) {
    this.callbacks = callbacks

    this.callService = options?.callService || new CallService()
    this.callService.setCallbacks({
      onStateChange: (state) => {
        if (state !== 'ringing') {
          this.stopRingbackTone()
        }
        callbacks.onStateChange(state)
        if ((state === 'ended' || state === 'failed') && this.peerConnection) {
          this.cleanup()
          const endReason =
            this.callService.getSession()?.endReason
            || (state === 'failed' ? 'network_error' : 'completed')
          callbacks.onCallEnded(endReason as CallEndReason)
        }
      },
      onSignalReceived: async (type, payload) => {
        await this.handleSignal(type, payload)
      },
      onError: (error) => {
        callbacks.onError(error)
      },
    })

    this.appStateSubscription = AppState.addEventListener('change', (nextState) => {
      this.handleAppStateChange(nextState)
    })
    this.recordDiagnostic('webrtc', 'manager_initialized')
  }

  private getDiagnosticFields(
    fields: Record<string, CallDiagnosticField> = {},
  ): Record<string, CallDiagnosticField> {
    const session = this.callService.getSession()
    return {
      sessionId: session?.id,
      direction: session ? (session.isOutgoing ? 'outgoing' : 'incoming') : undefined,
      callType: session?.callType || this.callType,
      state: session?.state,
      ...fields,
    }
  }

  private recordDiagnostic(
    scope: string,
    name: string,
    fields: Record<string, CallDiagnosticField> = {},
  ): void {
    recordCallDiagnostic(scope, name, this.getDiagnosticFields(fields))
  }

  private startLatencySpan(
    scope: 'session' | 'signal' | 'webrtc' | 'native' | 'recovery' | 'transport',
    name: string,
    fields: Record<string, CallDiagnosticField> = {},
  ): { end: (extraFields?: Record<string, CallDiagnosticField>) => void } {
    return startCallLatencySpan(scope, name, this.getDiagnosticFields(fields))
  }
  
  static isAvailable(): boolean {
    return webrtcAvailable
  }
  
  /**
   * Prepare media before sending an invitation.
   */
  async startCall(
    callerIdentityId: string,
    calleeIdentityId: string,
    conversationId: string,
    callType: CallType
  ): Promise<{ session: CallSession; invitationMessage: string }> {
    const span = this.startLatencySpan('webrtc', 'start_call', {
      callerIdentityId,
      calleeIdentityId,
      conversationId,
      requestedCallType: callType,
    })
    this.recordDiagnostic('webrtc', 'start_call_requested', {
      callerIdentityId,
      calleeIdentityId,
      conversationId,
      requestedCallType: callType,
    })

    if (!webrtcAvailable) {
      span.end({ outcome: 'error', error: WEBRTC_UNAVAILABLE_ERROR })
      throw new Error(WEBRTC_UNAVAILABLE_ERROR)
    }
    
    this.callType = callType

    try {
      const { session, invitationMessage } = await this.callService.initiateCall(
        callerIdentityId,
        calleeIdentityId,
        conversationId,
        callType
      )
      if (!session?.id) {
        throw new Error('Call session was not initialized.')
      }

      await this.acquireLocalMedia(callType)

      await this.createPeerConnection()

      span.end({ outcome: 'ok', sessionId: session.id })
      this.recordDiagnostic('webrtc', 'start_call_prepared', {
        localTracks: this.localStream?.getTracks?.().length || 0,
      })
      return { session, invitationMessage }
    } catch (error) {
      span.end({ outcome: 'error', error: describeCallError(error) })
      this.recordDiagnostic('webrtc', 'start_call_failed', {
        error: describeCallError(error),
      })
      try {
        await this.callService.endCall('cancelled')
      } catch {
        this.callService.cleanup()
      }
      this.cleanup()
      throw error
    }
  }

  async startOutgoingNegotiation(): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('Call connection not initialized')
    }

    const span = this.startLatencySpan('webrtc', 'start_outgoing_negotiation')
    try {
      await this.createAndSendOffer()
      this.startRingbackTone()
      this.startRingingTimeout()
      span.end({ outcome: 'ok' })
      this.recordDiagnostic('webrtc', 'outgoing_negotiation_started')
    } catch (error) {
      span.end({ outcome: 'error', error: describeCallError(error) })
      this.recordDiagnostic('webrtc', 'outgoing_negotiation_failed', {
        error: describeCallError(error),
      })
      throw error
    }
  }
  
  async answerCall(
    sessionId: string,
    callerIdentityId: string,
    calleeIdentityId: string,
    conversationId: string,
    callType: CallType,
    encryptionKey: string,
  ): Promise<void> {
    const span = this.startLatencySpan('webrtc', 'answer_call', {
      sessionId,
      callerIdentityId,
      calleeIdentityId,
      conversationId,
      requestedCallType: callType,
    })
    this.recordDiagnostic('webrtc', 'answer_call_requested', {
      sessionId,
      callerIdentityId,
      calleeIdentityId,
      conversationId,
      requestedCallType: callType,
    })

    if (!webrtcAvailable) {
      span.end({ outcome: 'error', error: WEBRTC_UNAVAILABLE_ERROR })
      throw new Error(WEBRTC_UNAVAILABLE_ERROR)
    }
    
    try {
      this.callType = callType
      await this.prepareIncomingCallService(
        sessionId,
        callerIdentityId,
        calleeIdentityId,
        conversationId,
        callType,
        encryptionKey,
      )

      await this.acquireLocalMedia(callType)

      await this.createPeerConnection()

      // Handle offers received before answer.
      await this.processPendingOffer()

      this.startRingingTimeout()
      span.end({ outcome: 'ok' })
      this.recordDiagnostic('webrtc', 'answer_call_prepared')
    } catch (error) {
      span.end({ outcome: 'error', error: describeCallError(error) })
      this.recordDiagnostic('webrtc', 'answer_call_failed', {
        error: describeCallError(error),
      })
      throw error
    }
  }
  
  async declineCall(): Promise<void> {
    await this.callService.declineCall()
    this.cleanup()
  }
  
  async endCall(reason: string = 'completed'): Promise<void> {
    this.recordDiagnostic('session', 'manager_end_call_requested', { reason })
    void this.callService.endCall(reason as CallEndReason, {
      suppressStateChange: true,
    }).catch((error) => {
      this.recordDiagnostic('session', 'manager_end_call_failed', {
        reason,
        error: describeCallError(error),
      })
      console.warn('Failed to end call session cleanly:', error)
    })
    this.cleanup()
    this.callbacks.onCallEnded(reason)
  }
  
  toggleMute(): boolean {
    this.isMuted = !this.isMuted
    
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track: any) => {
        track.enabled = !this.isMuted
      })
    }
    
    return this.isMuted
  }
  
  async toggleVideo(): Promise<boolean> {
    if (!this.peerConnection || !this.localStream) {
      return this.isVideoEnabled
    }

    if (this.hasLocalVideoTrack()) {
      await this.removeLocalVideoTrack()
    } else {
      await this.addLocalVideoTrack()
    }

    await this.queueLocalRenegotiation()
    this.syncMediaState()
    return this.isVideoEnabled
  }
  
  async switchCamera(): Promise<void> {
    if (!this.localStream || !this.hasLocalVideoTrack()) return
    
    const videoTrack = this.localStream.getVideoTracks()[0]
    if (videoTrack) {
      // @ts-ignore - React Native WebRTC method.
      videoTrack._switchCamera?.()
    }
  }
  
  toggleSpeaker(): boolean {
    this.isSpeakerOn = !this.isSpeakerOn

    if (InCallManager && this.inCallManagerActive) {
      try {
        InCallManager.setForceSpeakerphoneOn(this.isSpeakerOn)
      } catch (error) {
        console.warn('Failed to switch audio output:', error)
      }
    }

    return this.isSpeakerOn
  }
  
  getDuration(): number {
    return this.callService.getDuration()
  }
  
  getSession(): CallSession | null {
    return this.callService.getSession()
  }

  synchronizeConnected(startedAt?: number | null): void {
    this.clearRingingTimeout()
    this.clearReconnectionTimeout()
    this.reconnectOnForeground = false
    this.stopRingbackTone()
    this.hasMarkedConnected = true
    this.callService.synchronizeConnected(startedAt)
  }
  
  getIsMuted(): boolean {
    return this.isMuted
  }
  
  getIsVideoEnabled(): boolean {
    return this.isVideoEnabled
  }
  
  getIsSpeakerOn(): boolean {
    return this.isSpeakerOn
  }

  dispose(): void {
    this.callService.cleanup()
    this.cleanup()
  }
  
  private startRingingTimeout(): void {
    this.clearRingingTimeout()
    this.ringingTimeout = setTimeout(() => {
      const session = this.callService.getSession()
      if (session && session.state !== 'connected') {
        this.endCall('timeout')
      }
    }, RINGING_TIMEOUT_MS)
  }

  private clearRingingTimeout(): void {
    if (this.ringingTimeout) {
      clearTimeout(this.ringingTimeout)
      this.ringingTimeout = null
    }
  }

  private clearReconnectionTimeout(): void {
    if (this.reconnectionTimeout) {
      clearTimeout(this.reconnectionTimeout)
      this.reconnectionTimeout = null
    }
  }

  private hasConnectedTransport(): boolean {
    if (!this.peerConnection) return false

    const connectionState = this.peerConnection.connectionState
    const iceState = this.peerConnection.iceConnectionState

    return (
      connectionState === 'connected'
      || iceState === 'connected'
      || iceState === 'completed'
    )
  }

  private handleAppStateChange(nextState: AppStateStatus): void {
    const resumed = this.appState !== 'active' && nextState === 'active'
    const previousAppState = this.appState
    this.appState = nextState
    this.recordDiagnostic('webrtc', 'app_state_changed', {
      previousAppState,
      nextAppState: nextState,
      resumed,
    })

    if (nextState !== 'active') {
      this.clearReconnectionTimeout()
      return
    }

    if (!resumed) {
      return
    }

    const connectionState = this.peerConnection?.connectionState
    const iceState = this.peerConnection?.iceConnectionState
    if (
      this.reconnectOnForeground
      || connectionState === 'disconnected'
      || connectionState === 'failed'
      || iceState === 'disconnected'
      || iceState === 'failed'
    ) {
      this.reconnectOnForeground = false
      this.startReconnectionFlow()
      return
    }

    this.maybeMarkConnected()
  }

  private maybeMarkConnected(force: boolean = false): void {
    if (!this.peerConnection) return

    if (!this.hasConnectedTransport()) return

    const hasRemoteMediaReady =
      force
      || this.remoteMediaReady
      || this.hasRemoteAudioTrack()
      || hasLiveVideoTrack(this.remoteStream, { allowMuted: false })

    if (!this.hasMarkedConnected && !hasRemoteMediaReady) {
      if (!this.hasLoggedPendingRemoteMedia && isDevLoggingEnabled()) {
        console.log('[WebRTC] Waiting for remote media before marking call connected')
      }
      if (!this.hasLoggedPendingRemoteMedia) {
        this.recordDiagnostic('webrtc', 'waiting_for_remote_media', {
          force,
        })
      }
      this.hasLoggedPendingRemoteMedia = true
      return
    }

    this.clearRingingTimeout()
    this.clearReconnectionTimeout()
    this.reconnectOnForeground = false
    this.stopRingbackTone()
    this.stopConnectivityProbe()
    this.hasLoggedPendingRemoteMedia = false

    if (!this.hasMarkedConnected) {
      this.hasMarkedConnected = true
      this.recordDiagnostic('webrtc', 'connection_marked_connected', {
        force,
      })
      this.callService.markConnected()
      return
    }

    this.recordDiagnostic('webrtc', 'connection_confirmed_connected', { force })
    this.callbacks.onStateChange('connected')
  }

  private startReconnectionFlow(): void {
    if (!this.peerConnection) return

    if (this.hasConnectedTransport()) {
      this.recordDiagnostic('webrtc', 'reconnection_skipped_transport_connected')
      this.maybeMarkConnected()
      return
    }

    if (this.appState !== 'active') {
      this.reconnectOnForeground = true
      this.recordDiagnostic('webrtc', 'reconnection_deferred_to_foreground', {
        appState: this.appState,
      })
      return
    }

    this.reconnectOnForeground = false
    this.stopRingbackTone()
    this.callbacks.onStateChange('reconnecting')
    this.recordDiagnostic('webrtc', 'reconnection_started', {
      connectionState: this.peerConnection?.connectionState,
      iceConnectionState: this.peerConnection?.iceConnectionState,
    })

    try {
      this.peerConnection?.restartIce?.()
    } catch (error) {
      console.warn('Failed to restart ICE:', error)
    }

    if (this.reconnectionTimeout) return

    this.reconnectionTimeout = setTimeout(() => {
      const connectionState = this.peerConnection?.connectionState
      const iceState = this.peerConnection?.iceConnectionState
      const recovered =
        connectionState === 'connected'
        || iceState === 'connected'
        || iceState === 'completed'

      if (!recovered) {
        this.recordDiagnostic('webrtc', 'reconnection_failed', {
          connectionState,
          iceConnectionState: iceState,
        })
        this.callbacks.onError(new Error('Connection failed'))
        void this.endCall('network_error')
      }
    }, RECONNECTION_TIMEOUT_MS)
  }

  private startConnectivityProbe(): void {
    if (this.connectivityProbeInterval || this.hasMarkedConnected) {
      return
    }

    this.recordDiagnostic('webrtc', 'connectivity_probe_started')

    const tick = async () => {
      if (this.connectivityProbeInFlight || !this.peerConnection || this.hasMarkedConnected) {
        return
      }

      this.connectivityProbeInFlight = true
      try {
        const hasActiveTransport = await this.hasStatsConnectedTransport()
        if (hasActiveTransport) {
          this.markRemoteMediaReady('rtp_stats')
          if (isDevLoggingEnabled()) {
            console.log('[WebRTC] Marking call connected from stats fallback')
          }
          this.maybeMarkConnected(true)
        }
      } catch (error) {
        this.recordDiagnostic('webrtc', 'connectivity_probe_failed', {
          error: describeCallError(error),
        })
      } finally {
        this.connectivityProbeInFlight = false
      }
    }

    void tick()
    this.connectivityProbeInterval = setInterval(() => {
      void tick()
    }, 1000)
  }

  private stopConnectivityProbe(): void {
    if (this.connectivityProbeInterval) {
      clearInterval(this.connectivityProbeInterval)
      this.connectivityProbeInterval = null
    }
    this.connectivityProbeInFlight = false
    this.recordDiagnostic('webrtc', 'connectivity_probe_stopped')
  }

  private async hasStatsConnectedTransport(): Promise<boolean> {
    if (!this.peerConnection?.getStats) {
      this.recordDiagnostic('webrtc', 'stats_probe_unavailable')
      return false
    }

    try {
      const reports = normalizeRTCStatsReports(await this.peerConnection.getStats())
      let hasSelectedCandidatePair = false
      let hasMediaTraffic = false

      for (const report of reports) {
        const type = typeof report.type === 'string' ? report.type : ''
        const bytesReceived = Number(report.bytesReceived ?? 0)
        const bytesSent = Number(report.bytesSent ?? 0)

        if (type === 'candidate-pair') {
          const state = typeof report.state === 'string' ? report.state : ''
          const nominated = report.nominated === true || report.selected === true || report.writable === true
          if (
            nominated
            && (state === 'succeeded' || state === 'in-progress' || state === 'connected')
          ) {
            hasSelectedCandidatePair = true
            if (bytesReceived > 0 || bytesSent > 0) {
              hasMediaTraffic = true
            }
          }
          continue
        }

        if (
          (type === 'inbound-rtp' || type === 'outbound-rtp')
          && (bytesReceived > 0 || bytesSent > 0)
        ) {
          hasMediaTraffic = true
        }
      }

      const connected = hasSelectedCandidatePair && hasMediaTraffic
      if (connected) {
        this.recordDiagnostic('webrtc', 'stats_probe_connected_transport', {
          reportCount: reports.length,
        })
      }
      return connected
    } catch (error) {
      this.recordDiagnostic('webrtc', 'stats_probe_failed', {
        error: describeCallError(error),
      })
      return false
    }
  }

  private async acquireLocalMedia(callType: CallType): Promise<void> {
    const span = this.startLatencySpan('webrtc', 'acquire_local_media', {
      requestedCallType: callType,
    })
    try {
      const constraints = {
        audio: Platform.OS === 'ios' ? true : MEDIA_CONSTRAINTS.audio,
        video: callType === 'video' ? MEDIA_CONSTRAINTS.video : false,
      }
      this.recordDiagnostic('webrtc', 'acquire_local_media_start', {
        requestedCallType: callType,
        requestsVideo: callType === 'video',
      })

      await ensureMediaPermissions(callType)
      this.localStream = await mediaDevices.getUserMedia(constraints) as MediaStream
      this.startInCallManager(callType)
      this.isVideoEnabled = this.hasLocalVideoTrack()

      if (this.isSpeakerOn && InCallManager) {
        InCallManager.setForceSpeakerphoneOn(true)
      }

      this.callbacks.onLocalStream(this.localStream)
      this.syncMediaState()
      span.end({
        outcome: 'ok',
        localTrackCount: this.localStream?.getTracks?.().length || 0,
        localAudioTrackCount: this.localStream?.getAudioTracks?.().length || 0,
        localVideoTrackCount: this.localStream?.getVideoTracks?.().length || 0,
      })
      this.recordDiagnostic('webrtc', 'acquire_local_media_succeeded', {
        localTrackCount: this.localStream?.getTracks?.().length || 0,
        localAudioTrackCount: this.localStream?.getAudioTracks?.().length || 0,
        localVideoTrackCount: this.localStream?.getVideoTracks?.().length || 0,
      })
    } catch (error) {
      this.stopInCallManager()
      span.end({ outcome: 'error', error: describeCallError(error) })
      this.recordDiagnostic('webrtc', 'acquire_local_media_failed', {
        error: describeCallError(error),
      })
      throw new Error(`Failed to acquire media: ${(error as Error).message}`)
    }
  }

  private startInCallManager(callType: CallType): void {
    if (!InCallManager || this.inCallManagerActive) return

    try {
      InCallManager.start({ media: callType === 'video' ? 'video' : 'audio' })
      this.inCallManagerActive = true
      this.recordDiagnostic('native', 'incall_manager_started', {
        media: callType === 'video' ? 'video' : 'audio',
      })
    } catch (error) {
      this.recordDiagnostic('native', 'incall_manager_start_failed', {
        error: describeCallError(error),
      })
      console.warn('Failed to start InCallManager:', error)
    }
  }

  private stopInCallManager(): void {
    if (!InCallManager || !this.inCallManagerActive) return

    try {
      InCallManager.stop()
    } catch (error) {
      this.recordDiagnostic('native', 'incall_manager_stop_failed', {
        error: describeCallError(error),
      })
      console.warn('Failed to stop InCallManager:', error)
    } finally {
      this.inCallManagerActive = false
      this.recordDiagnostic('native', 'incall_manager_stopped')
    }
  }
  
  private async createPeerConnection(): Promise<void> {
    const span = this.startLatencySpan('webrtc', 'create_peer_connection')
    const rtcConfig = await getRTCConfiguration()
    this.peerConnection = new RTCPeerConnection(rtcConfig)
    this.recordDiagnostic('webrtc', 'peer_connection_created', {
      iceServerCount: rtcConfig.iceServers?.length || 0,
      iceTransportPolicy: rtcConfig.iceTransportPolicy,
    })
    
    if (this.localStream) {
      this.localStream.getTracks().forEach((track: any) => {
        this.peerConnection!.addTrack(track, this.localStream!)
      })
    }
    this.syncMediaState()
    
    this.peerConnection.ontrack = (event: any) => {
      const incomingStream = event.streams?.[0] || null
      const remoteTracks = incomingStream?.getTracks?.() || (event.track ? [event.track] : [])

      if (isDevLoggingEnabled() && event.track) {
        console.log('[WebRTC] Remote track received', {
          id: getTrackStableId(event.track),
          kind: event.track.kind,
          muted: event.track.muted,
          readyState: event.track.readyState,
        })
      }
      this.recordDiagnostic('webrtc', 'remote_track_received', {
        trackId: event.track ? getTrackStableId(event.track) : undefined,
        kind: event.track?.kind,
        muted: event.track?.muted,
        readyState: event.track?.readyState,
        remoteTrackCount: remoteTracks.length,
      })

      remoteTracks.forEach((track: any) => {
        this.attachRemoteTrack(track, incomingStream)
        this.observeRemoteTrack(track)
      })

      if (incomingStream) {
        incomingStream.onremovetrack = (removeEvent: { track?: any }) => {
          this.detachRemoteTrack(removeEvent.track)
          this.syncRemoteMediaState()
        }
      }

      this.syncMediaState()
      this.maybeMarkConnected()
    }
    
    this.peerConnection.onicecandidate = (event: any) => {
      if (event.candidate) {
        this.recordDiagnostic('signal', 'local_ice_candidate_generated', {
          ...summarizeIceCandidate(event.candidate.candidate),
          hasSdpMid: event.candidate.sdpMid !== null,
          hasSdpMLineIndex: event.candidate.sdpMLineIndex !== null,
        })
        void this.callService.sendIceCandidate({
          candidate: event.candidate.candidate,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
          sdpMid: event.candidate.sdpMid,
        }).catch((error) => {
          this.recordDiagnostic('signal', 'local_ice_candidate_send_failed', {
            error: describeCallError(error),
            ...summarizeIceCandidate(event.candidate.candidate),
          })
          console.warn('Failed to send ICE candidate:', error)
        })
      }
    }
    
    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState
      this.recordDiagnostic('webrtc', 'connection_state_changed', {
        connectionState: state,
      })
      
      switch (state) {
        case 'connected':
          this.maybeMarkConnected()
          break
        case 'disconnected':
          this.startReconnectionFlow()
          break
        case 'failed':
          this.startReconnectionFlow()
          break
      }
    }
    
    this.peerConnection.oniceconnectionstatechange = () => {
      const state = this.peerConnection?.iceConnectionState
      this.recordDiagnostic('webrtc', 'ice_connection_state_changed', {
        iceConnectionState: state,
      })
      
      if (state === 'connected' || state === 'completed') {
        this.maybeMarkConnected()
      } else if (state === 'disconnected' || state === 'failed') {
        this.startReconnectionFlow()
      }
    }

    this.peerConnection.onsignalingstatechange = () => {
      this.recordDiagnostic('webrtc', 'signaling_state_changed', {
        signalingState: this.peerConnection?.signalingState,
      })
    }

    this.startConnectivityProbe()
    span.end({ outcome: 'ok' })
  }
  
  private async handleSignal(type: string, payload: any): Promise<void> {
    this.recordDiagnostic('signal', 'handle_signal', { signalType: type })
    switch (type) {
      case 'offer':
        await this.handleOffer(payload)
        break
      case 'answer':
        await this.handleAnswer(payload)
        break
      case 'ice_candidate':
        await this.handleIceCandidate(payload)
        break
      case 'ringing':
        this.startRingbackTone()
        this.callbacks.onStateChange('ringing')
        break
    }
  }

  private async prepareIncomingCallService(
    sessionId: string,
    callerIdentityId: string,
    calleeIdentityId: string,
    conversationId: string,
    callType: CallType,
    encryptionKey: string,
  ): Promise<void> {
    const existingSession = this.callService.getSession()
    const canReuseIncomingSession = Boolean(
      existingSession
        && !existingSession.isOutgoing
        && existingSession.id === sessionId
        && existingSession.callerIdentityId === callerIdentityId
        && existingSession.calleeIdentityId === calleeIdentityId
        && existingSession.conversationId === conversationId
        && existingSession.callType === callType
        && existingSession.encryptionKey === encryptionKey,
    )

    if (canReuseIncomingSession) {
      this.callService.ensureSignalPolling()
      this.recordDiagnostic('session', 'incoming_call_service_reused', { sessionId })
      return
    }

    this.recordDiagnostic('session', 'incoming_call_service_prepare', { sessionId })
    await this.callService.acceptIncomingCall(
      sessionId,
      callerIdentityId,
      calleeIdentityId,
      conversationId,
      callType,
      encryptionKey
    )
  }
  
  private async handleOffer(offer: { sdp: string }): Promise<void> {
    if (!this.peerConnection) {
      this.pendingOffer = offer
      this.recordDiagnostic('signal', 'offer_buffered_until_peer_ready')
      return
    }

    this.pendingOffer = offer
    if (this.offerProcessing) return
    this.offerProcessing = true
    
    try {
      while (this.pendingOffer && this.peerConnection) {
        const nextOffer = this.pendingOffer
        this.pendingOffer = null
        this.recordDiagnostic('signal', 'offer_processing_started', {
          signalingState: this.peerConnection.signalingState,
        })

        if (this.peerConnection.signalingState === 'have-local-offer') {
          try {
            await this.peerConnection.setLocalDescription({ type: 'rollback' })
          } catch (error) {
            console.warn('Failed to roll back local offer before applying remote offer:', error)
          }
        }

        await this.peerConnection.setRemoteDescription(
          createRTCSessionDescription({ type: 'offer', sdp: nextOffer.sdp })
        )
        this.recordDiagnostic('signal', 'offer_remote_description_applied')
        
        await this.processPendingIceCandidates()
        
        const answer = await this.peerConnection.createAnswer()
        await this.peerConnection.setLocalDescription(answer)
        this.recordDiagnostic('signal', 'answer_local_description_applied')
        await this.callService.sendAnswer(answer.sdp!, {
          transitionState: this.callService.getSession()?.state !== 'connected',
        })
      }
    } catch (error) {
      this.recordDiagnostic('signal', 'offer_processing_failed', {
        error: describeCallError(error),
      })
      throw error
    } finally {
      this.offerProcessing = false
    }
  }

  private async processPendingOffer(): Promise<void> {
    if (!this.pendingOffer || !this.peerConnection) return
    const offer = this.pendingOffer
    this.pendingOffer = null
    await this.handleOffer(offer)
  }
  
  private async handleAnswer(answer: { sdp: string }): Promise<void> {
    if (!this.peerConnection) return
    
    this.recordDiagnostic('signal', 'answer_processing_started')
    await this.peerConnection.setRemoteDescription(
      createRTCSessionDescription({ type: 'answer', sdp: answer.sdp })
    )
    this.recordDiagnostic('signal', 'answer_remote_description_applied')

    this.stopRingbackTone()
    if (!this.hasMarkedConnected && this.callService.getSession()?.state !== 'connected') {
      this.callService.markConnecting()
    }
    
    await this.processPendingIceCandidates()
  }
  
  private async handleIceCandidate(candidate: ICECandidate): Promise<void> {
    if (!this.peerConnection || !this.peerConnection.remoteDescription) {
      this.pendingIceCandidates.push(candidate)
      this.recordDiagnostic('signal', 'remote_ice_candidate_buffered', {
        pendingCandidateCount: this.pendingIceCandidates.length,
        ...summarizeIceCandidate(candidate.candidate),
      })
      return
    }
    
    try {
      await this.peerConnection.addIceCandidate(createRTCIceCandidate(candidate))
      this.recordDiagnostic('signal', 'remote_ice_candidate_applied', {
        ...summarizeIceCandidate(candidate.candidate),
      })
    } catch (error) {
      this.recordDiagnostic('signal', 'remote_ice_candidate_failed', {
        error: describeCallError(error),
        ...summarizeIceCandidate(candidate.candidate),
      })
      console.warn('Failed to add ICE candidate:', error)
    }
  }
  
  private async processPendingIceCandidates(): Promise<void> {
    for (const candidate of this.pendingIceCandidates) {
      try {
        await this.peerConnection?.addIceCandidate(createRTCIceCandidate(candidate))
        this.recordDiagnostic('signal', 'pending_ice_candidate_applied', {
          ...summarizeIceCandidate(candidate.candidate),
        })
      } catch (error) {
        this.recordDiagnostic('signal', 'pending_ice_candidate_failed', {
          error: describeCallError(error),
          ...summarizeIceCandidate(candidate.candidate),
        })
        console.warn('Failed to add pending ICE candidate:', error)
      }
    }
    this.pendingIceCandidates = []
  }

  private ensureRemoteStream(streamHint?: MediaStream | null): MediaStream | null {
    if (!this.remoteStream) {
      if (RTCMediaStream) {
        this.remoteStream = new RTCMediaStream()
      } else {
        this.remoteStream = streamHint || null
      }
    }

    return this.remoteStream
  }

  private attachRemoteTrack(track: any, streamHint?: MediaStream | null): void {
    if (!track) {
      return
    }

    const remoteStream = this.ensureRemoteStream(streamHint)
    if (!remoteStream) {
      return
    }

    const trackId = getTrackStableId(track)
    if (!this.remoteTrackIds.has(trackId)) {
      try {
        remoteStream.addTrack?.(track)
      } catch (error) {
        this.recordDiagnostic('webrtc', 'remote_track_attach_failed', {
          trackId,
          kind: track.kind,
          error: describeCallError(error),
        })
        console.warn('Failed to attach remote track to aggregated stream:', error)
      }
      this.remoteTrackIds.add(trackId)
      this.recordDiagnostic('webrtc', 'remote_track_attached', {
        trackId,
        kind: track.kind,
      })
    }

    if (track.muted !== true) {
      this.markRemoteMediaReady(`${track.kind || 'media'}_track`)
    }

    this.emitRemoteStreamUpdate()
  }

  private detachRemoteTrack(track: any): void {
    if (!track || !this.remoteStream) {
      return
    }

    const trackId = getTrackStableId(track)
    if (this.remoteTrackIds.has(trackId)) {
      this.remoteTrackIds.delete(trackId)
      try {
        this.remoteStream.removeTrack?.(track)
      } catch (error) {
        this.recordDiagnostic('webrtc', 'remote_track_detach_failed', {
          trackId,
          kind: track.kind,
          error: describeCallError(error),
        })
        console.warn('Failed to detach remote track from aggregated stream:', error)
      }
      this.recordDiagnostic('webrtc', 'remote_track_detached', {
        trackId,
        kind: track.kind,
      })
    }
  }

  private observeRemoteTrack(track: any): void {
    if (!track) {
      return
    }

    const syncRemoteMediaState = () => {
      this.syncRemoteMediaState()
      this.maybeMarkConnected()
    }

    track.onunmute = () => {
      if (isDevLoggingEnabled()) {
        console.log('[WebRTC] Remote track unmuted', {
          id: getTrackStableId(track),
          kind: track.kind,
        })
      }
      this.markRemoteMediaReady(`${track.kind || 'media'}_unmuted`)
      syncRemoteMediaState()
    }

    track.onmute = () => {
      if (isDevLoggingEnabled()) {
        console.log('[WebRTC] Remote track muted', {
          id: getTrackStableId(track),
          kind: track.kind,
        })
      }
      syncRemoteMediaState()
    }

    track.onended = () => {
      if (isDevLoggingEnabled()) {
        console.log('[WebRTC] Remote track ended', {
          id: getTrackStableId(track),
          kind: track.kind,
        })
      }
      this.detachRemoteTrack(track)
      syncRemoteMediaState()
    }
  }

  private emitRemoteStreamUpdate(): void {
    if (!this.remoteStream) {
      return
    }

    this.remoteStreamVersion += 1
    this.callbacks.onRemoteStream(this.remoteStream, this.remoteStreamVersion)
  }

  private syncRemoteMediaState(): void {
    this.syncMediaState()
    this.emitRemoteStreamUpdate()
  }

  private markRemoteMediaReady(reason: string): void {
    if (!this.remoteMediaReady && isDevLoggingEnabled()) {
      console.log('[WebRTC] Remote media became ready', { reason })
    }

    this.remoteMediaReady = true
    this.recordDiagnostic('webrtc', 'remote_media_ready', { reason })
  }

  private hasLocalVideoTrack(): boolean {
    return hasLiveVideoTrack(this.localStream)
  }

  private hasRemoteVideoTrack(): boolean {
    return hasLiveVideoTrack(this.remoteStream)
  }

  private hasRemoteAudioTrack(): boolean {
    return hasLiveAudioTrack(this.remoteStream, { allowMuted: false })
  }

  private syncMediaState(): void {
    const effectiveCallType: CallType =
      this.hasLocalVideoTrack() || this.hasRemoteVideoTrack() ? 'video' : 'voice'

    this.callType = effectiveCallType
    this.isVideoEnabled = this.hasLocalVideoTrack()

    this.callbacks.onMediaStateChange?.({
      effectiveCallType,
      isVideoEnabled: this.isVideoEnabled,
    })
  }

  private getOfferOptions(): {
    offerToReceiveAudio: boolean
    offerToReceiveVideo: boolean
  } {
    return {
      offerToReceiveAudio: true,
      offerToReceiveVideo: this.hasLocalVideoTrack() || this.hasRemoteVideoTrack(),
    }
  }

  private async createAndSendOffer(options?: { transitionState?: boolean }): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('Call connection not initialized')
    }

    const span = this.startLatencySpan('signal', 'create_and_send_offer', {
      transitionState: options?.transitionState !== false,
    })
    try {
      const offer = await this.peerConnection.createOffer(this.getOfferOptions())
      await this.peerConnection.setLocalDescription(offer)
      await this.callService.sendOffer(offer.sdp!, options)
      span.end({ outcome: 'ok' })
      this.recordDiagnostic('signal', 'offer_sent', {
        transitionState: options?.transitionState !== false,
      })
    } catch (error) {
      span.end({ outcome: 'error', error: describeCallError(error) })
      this.recordDiagnostic('signal', 'offer_send_failed', {
        transitionState: options?.transitionState !== false,
        error: describeCallError(error),
      })
      throw error
    }
  }

  private async waitForStableSignalingState(timeoutMs: number = 5_000): Promise<void> {
    const startedAt = Date.now()
    while (this.peerConnection && this.peerConnection.signalingState !== 'stable') {
      if (Date.now() - startedAt >= timeoutMs) {
        throw new Error('Timed out waiting for call renegotiation to settle')
      }
      await sleep(50)
    }
  }

  private async queueLocalRenegotiation(): Promise<void> {
    const queuedRenegotiation = this.renegotiationQueue
      .catch(() => {})
      .then(async () => {
        if (!this.peerConnection) {
          throw new Error('Call connection not initialized')
        }

        this.recordDiagnostic('webrtc', 'local_renegotiation_started')
        await this.waitForStableSignalingState()
        await this.createAndSendOffer({ transitionState: false })
        this.recordDiagnostic('webrtc', 'local_renegotiation_succeeded')
      })

    this.renegotiationQueue = queuedRenegotiation.catch(() => {})
    return queuedRenegotiation
  }

  private getLocalVideoSender(): any | null {
    return this.peerConnection?.getSenders?.().find(
      (sender: any) => sender?.track?.kind === 'video'
    ) || null
  }

  private async addLocalVideoTrack(): Promise<void> {
    if (!this.localStream || !this.peerConnection) {
      throw new Error('Call connection not initialized')
    }

    if (this.hasLocalVideoTrack()) {
      this.syncMediaState()
      return
    }

    const videoStream = await mediaDevices.getUserMedia({
      audio: false,
      video: MEDIA_CONSTRAINTS.video,
    }) as MediaStream
    const [videoTrack] = videoStream.getVideoTracks()

    if (!videoTrack) {
      throw new Error('Camera unavailable')
    }

    this.localStream.addTrack?.(videoTrack)
    this.peerConnection.addTrack(videoTrack, this.localStream)
    this.callbacks.onLocalStream(this.localStream)
    this.syncMediaState()
    this.recordDiagnostic('webrtc', 'local_video_track_added')
  }

  private async removeLocalVideoTrack(): Promise<void> {
    if (!this.localStream) {
      return
    }

    const videoSender = this.getLocalVideoSender()
    if (videoSender?.replaceTrack) {
      await Promise.resolve(videoSender.replaceTrack(null)).catch(() => {})
    }
    if (videoSender && this.peerConnection?.removeTrack) {
      this.peerConnection.removeTrack(videoSender)
    }

    this.localStream.getVideoTracks().forEach((track: any) => {
      try {
        this.localStream?.removeTrack?.(track)
      } catch {}
      track.stop?.()
    })

    this.callbacks.onLocalStream(this.localStream)
    this.syncMediaState()
    this.recordDiagnostic('webrtc', 'local_video_track_removed')
  }
  
  private cleanup(): void {
    this.recordDiagnostic('webrtc', 'cleanup_start')
    this.clearRingingTimeout()
    this.clearReconnectionTimeout()
    this.stopConnectivityProbe()
    this.reconnectOnForeground = false
    this.unloadRingbackTone()
    if (this.appStateSubscription) {
      this.appStateSubscription.remove()
      this.appStateSubscription = null
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach((track: any) => track.stop())
      this.localStream = null
    }
    
    this.remoteStream = null

    if (this.peerConnection) {
      this.peerConnection.close()
      this.peerConnection = null
    }
    
    this.isMuted = false
    this.callType = 'voice'
    this.isVideoEnabled = false
    this.isSpeakerOn = false
    this.remoteTrackIds.clear()
    this.remoteStreamVersion = 0
    this.remoteMediaReady = false
    this.hasLoggedPendingRemoteMedia = false
    this.pendingIceCandidates = []
    this.pendingOffer = null
    this.offerProcessing = false
    this.renegotiationQueue = Promise.resolve()
    this.hasMarkedConnected = false

    this.stopInCallManager()
    this.recordDiagnostic('webrtc', 'cleanup_complete')
  }

  private startRingbackTone(): void {
    if ((Platform.OS !== 'ios' && !this.inCallManagerActive) || this.ringbackActive) {
      return
    }

    if (!this.callService.getSession()?.isOutgoing) {
      return
    }

    this.ringbackActive = true
    const ringbackToken = ++this.ringbackToken
    void this.playRingbackTone(ringbackToken)
  }

  private stopRingbackTone(): void {
    if (!this.ringbackActive && !this.ringbackSound) {
      return
    }

    this.ringbackActive = false
    this.ringbackToken += 1
    this.clearRingbackRestartTimeout()

    const sound = this.ringbackSound
    if (!sound) {
      return
    }

    void (async () => {
      try {
        const status = await sound.getStatusAsync()
        if (!status.isLoaded) {
          return
        }

        await sound.stopAsync()
        await sound.setPositionAsync(0)
      } catch (error) {
        console.warn('Failed to stop ringback tone:', error)
      }
    })()
  }

  private async playRingbackTone(ringbackToken: number): Promise<void> {
    if (!RINGBACK_SOUND_ASSET) {
      this.ringbackActive = false
      return
    }

    let sound = this.ringbackSound
    let createdSound = false

    try {
      this.clearRingbackRestartTimeout()
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      })

      if (!sound) {
        const result = await Audio.Sound.createAsync(
          RINGBACK_SOUND_ASSET,
          {
            shouldPlay: false,
            isLooping: false,
            volume: 1,
          },
        )
        sound = result.sound
        sound.setOnPlaybackStatusUpdate(this.handleRingbackPlaybackStatusUpdate)
        this.ringbackSound = sound
        createdSound = true
      }

      if (!this.ringbackActive || ringbackToken !== this.ringbackToken) {
        if (createdSound) {
          await sound.unloadAsync()
          if (this.ringbackSound === sound) {
            this.ringbackSound = null
          }
        }
        return
      }

      const status = await sound.getStatusAsync()
      if (!status.isLoaded) {
        throw new Error('Ringback sound is not loaded')
      }

      await sound.setPositionAsync(0)
      await sound.playAsync()
    } catch (error) {
      if (createdSound && sound) {
        try {
          await sound.unloadAsync()
        } catch {}
        if (this.ringbackSound === sound) {
          this.ringbackSound = null
        }
      }

      console.warn('Failed to start ringback tone:', error)
      this.recordDiagnostic('native', 'ringback_start_failed', {
        error: describeCallError(error),
      })
      if (this.ringbackActive && ringbackToken === this.ringbackToken) {
        this.scheduleRingbackReplay(RINGBACK_RETRY_DELAY_MS)
      } else {
        this.ringbackActive = false
      }
    }
  }

  private unloadRingbackTone(): void {
    this.ringbackActive = false
    this.ringbackToken += 1
    this.clearRingbackRestartTimeout()

    const sound = this.ringbackSound
    this.ringbackSound = null
    if (!sound) {
      return
    }

    void (async () => {
      try {
        sound.setOnPlaybackStatusUpdate(null)
        const status = await sound.getStatusAsync()
        if (status.isLoaded) {
          await sound.stopAsync()
        }
        await sound.unloadAsync()
      } catch (error) {
        console.warn('Failed to unload ringback tone:', error)
      }
    })()
  }

  private handleRingbackPlaybackStatusUpdate = (status: AVPlaybackStatus): void => {
    if (!this.ringbackActive) {
      return
    }

    if (!status.isLoaded) {
      this.recordDiagnostic('native', 'ringback_playback_unloaded', {
        error: 'error' in status ? status.error : undefined,
      })
      this.scheduleRingbackReplay(RINGBACK_RETRY_DELAY_MS)
      return
    }

    if (status.didJustFinish) {
      this.scheduleRingbackReplay(RINGBACK_PAUSE_MS)
    }
  }

  private scheduleRingbackReplay(delayMs: number): void {
    if (!this.ringbackActive || this.ringbackRestartTimeout) {
      return
    }

    const ringbackToken = this.ringbackToken
    this.ringbackRestartTimeout = setTimeout(() => {
      this.ringbackRestartTimeout = null
      if (!this.ringbackActive || ringbackToken !== this.ringbackToken) {
        return
      }

      void this.playRingbackTone(ringbackToken)
    }, delayMs)
  }

  private clearRingbackRestartTimeout(): void {
    if (!this.ringbackRestartTimeout) {
      return
    }

    clearTimeout(this.ringbackRestartTimeout)
    this.ringbackRestartTimeout = null
  }
}
