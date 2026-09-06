/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { backendRequest } from '../backend/client'

const {
  mockCallService,
  mockGetUserMedia,
  mockRTCPeerConnection,
  mockRTCPeerConnectionImpl,
  MockMediaStream,
} = vi.hoisted(() => {
  class MockMediaStream {
    private tracks: any[] = []

    addTrack(track: any) {
      this.tracks.push(track)
    }

    removeTrack(track: any) {
      this.tracks = this.tracks.filter((entry) => entry !== track)
    }

    getTracks() {
      return this.tracks
    }

    getAudioTracks() {
      return this.tracks.filter((track) => track?.kind === 'audio')
    }

    getVideoTracks() {
      return this.tracks.filter((track) => track?.kind === 'video')
    }

    toURL() {
      return 'stream://mock'
    }
  }

  const mockCallService = {
    acceptIncomingCall: vi.fn(async () => {}),
    cleanup: vi.fn(),
    ensureSignalPolling: vi.fn(),
    endCall: vi.fn(),
    getSession: vi.fn((): any => ({ state: 'connected', isOutgoing: false })),
    initiateCall: vi.fn(async () => ({
      session: { id: 'session-1', state: 'initiating', isOutgoing: true },
      invitationMessage: '[QCALL:a1:voice:key]',
    })),
    markConnected: vi.fn(),
    markConnecting: vi.fn(),
    setCallbacks: vi.fn(),
    sendAnswer: vi.fn(async () => {}),
    sendIceCandidate: vi.fn(async () => {}),
    sendOffer: vi.fn(async () => {}),
    synchronizeConnected: vi.fn(),
  }

  const mockRTCPeerConnectionImpl = vi.fn()

  function mockRTCPeerConnection(...args: any[]) {
    return mockRTCPeerConnectionImpl(...args)
  }

  return {
    mockCallService,
    mockGetUserMedia: vi.fn(),
    mockRTCPeerConnection,
    mockRTCPeerConnectionImpl,
    MockMediaStream,
  }
})

vi.mock('./callService', () => ({
  CallService: vi.fn().mockImplementation(() => mockCallService),
}))

vi.mock('../../assets/sounds/caller-ringback.mp3', () => ({
  default: 'caller-ringback.mp3',
}))

vi.mock('../backend/client', () => ({
  backendRequest: vi.fn(),
}))

vi.mock('../backend/session', () => ({
  ensureVerifiedBackendAccess: vi.fn(async () => ({ accessToken: 'token', user: { id: 'user-1' } })),
}))

vi.mock('expo-av', () => ({
  Audio: {
    requestPermissionsAsync: vi.fn(async () => ({ granted: true })),
    setAudioModeAsync: vi.fn(async () => {}),
    Sound: {
      createAsync: vi.fn(async () => ({
        sound: {
          getStatusAsync: vi.fn(async () => ({ isLoaded: false })),
          playAsync: vi.fn(async () => {}),
          setOnPlaybackStatusUpdate: vi.fn(),
          setPositionAsync: vi.fn(async () => {}),
          stopAsync: vi.fn(async () => {}),
          unloadAsync: vi.fn(async () => {}),
        },
      })),
    },
  },
}))

vi.mock('expo-camera', () => ({
  Camera: {
    requestCameraPermissionsAsync: vi.fn(async () => ({ granted: true })),
  },
}))

vi.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: vi.fn(() => ({ remove: vi.fn() })),
  },
  Platform: {
    OS: 'ios',
  },
}))

vi.mock('react-native-webrtc', () => ({
  RTCPeerConnection: mockRTCPeerConnection,
  RTCSessionDescription: function RTCSessionDescription(description: unknown) {
    return description
  },
  RTCIceCandidate: function RTCIceCandidate(candidate: unknown) {
    return candidate
  },
  MediaStream: MockMediaStream,
  mediaDevices: {
    getUserMedia: mockGetUserMedia,
  },
}))

vi.mock('react-native-incall-manager', () => ({
  default: {
    setForceSpeakerphoneOn: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  },
}))

describe('WebRTCManager renegotiation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('__SPECTRA_TEST_WEBRTC__', {
      RTCPeerConnection: mockRTCPeerConnection,
      RTCSessionDescription: function RTCSessionDescription(description: unknown) {
        return description
      },
      RTCIceCandidate: function RTCIceCandidate(candidate: unknown) {
        return candidate
      },
      MediaStream: MockMediaStream,
      mediaDevices: {
        getUserMedia: mockGetUserMedia,
      },
      InCallManager: {
        setForceSpeakerphoneOn: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      },
    })
    vi.stubGlobal('require', (moduleName: string) => {
      if (moduleName === 'react-native-webrtc') {
        return {
          RTCPeerConnection: mockRTCPeerConnection,
          RTCSessionDescription: function RTCSessionDescription(description: unknown) {
            return description
          },
          RTCIceCandidate: function RTCIceCandidate(candidate: unknown) {
            return candidate
          },
          MediaStream: MockMediaStream,
          mediaDevices: {
            getUserMedia: mockGetUserMedia,
          },
        }
      }
      if (moduleName === 'react-native-incall-manager') {
        return {
          default: {
            setForceSpeakerphoneOn: vi.fn(),
            start: vi.fn(),
            stop: vi.fn(),
          },
        }
      }
      throw new Error(`Unexpected require: ${moduleName}`)
    })
    mockCallService.getSession.mockReturnValue({ state: 'connected', isOutgoing: false })
    mockCallService.initiateCall.mockResolvedValue({
      session: { id: 'session-1', state: 'initiating', isOutgoing: true },
      invitationMessage: '[QCALL:a1:voice:key]',
    })
    mockCallService.sendAnswer.mockResolvedValue(undefined)
    mockCallService.acceptIncomingCall.mockResolvedValue(undefined)
    mockCallService.endCall.mockResolvedValue(undefined)
    mockCallService.ensureSignalPolling.mockImplementation(() => {})
    mockRTCPeerConnectionImpl.mockImplementation(() => ({
      addTrack: vi.fn(),
      close: vi.fn(),
      connectionState: 'new',
      createAnswer: vi.fn(async () => ({ sdp: 'answer-sdp' })),
      createOffer: vi.fn(async () => ({ sdp: 'offer-sdp' })),
      getSenders: vi.fn(() => []),
      iceConnectionState: 'new',
      restartIce: vi.fn(),
      setLocalDescription: vi.fn(async () => {}),
      setRemoteDescription: vi.fn(async () => {}),
    }))
    mockGetUserMedia.mockResolvedValue(new MockMediaStream())
    ;(backendRequest as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      iceServers: [{ urls: 'turn:relay.example.com' }],
    })
  })

  it('merges remote audio and video tracks into one stable stream', async () => {
    const onRemoteStream = vi.fn()
    const { WebRTCManager } = await import('./webrtcManager')
    const manager = new WebRTCManager({
      onStateChange: vi.fn(),
      onRemoteStream,
      onLocalStream: vi.fn(),
      onMediaStateChange: vi.fn(),
      onError: vi.fn(),
      onCallEnded: vi.fn(),
    })

    ;(manager as any).peerConnection = {
      close: vi.fn(),
      connectionState: 'connecting',
      iceConnectionState: 'new',
    }

    const audioTrack = { id: 'audio-1', kind: 'audio', muted: false, readyState: 'live' }
    const audioStream = new MockMediaStream()
    audioStream.addTrack(audioTrack)
    ;(manager as any).attachRemoteTrack(audioTrack, audioStream)

    const videoTrack = { id: 'video-1', kind: 'video', muted: false, readyState: 'live' }
    const videoStream = new MockMediaStream()
    videoStream.addTrack(videoTrack)
    ;(manager as any).attachRemoteTrack(videoTrack, videoStream)

    const aggregatedRemoteStream = onRemoteStream.mock.calls.at(-1)?.[0]
    expect(new Set(aggregatedRemoteStream?.getTracks?.().map((track: any) => track.id))).toEqual(
      new Set(['audio-1', 'video-1'])
    )

    manager.dispose()
  })

  it('waits for remote media before marking the call connected', async () => {
    mockCallService.getSession.mockReturnValue({ state: 'connecting', isOutgoing: false })

    const { WebRTCManager } = await import('./webrtcManager')
    const manager = new WebRTCManager({
      onStateChange: vi.fn(),
      onRemoteStream: vi.fn(),
      onLocalStream: vi.fn(),
      onMediaStateChange: vi.fn(),
      onError: vi.fn(),
      onCallEnded: vi.fn(),
    })

    ;(manager as any).peerConnection = {
      close: vi.fn(),
      connectionState: 'connected',
      iceConnectionState: 'connected',
    }

    ;(manager as any).maybeMarkConnected()
    expect(mockCallService.markConnected).not.toHaveBeenCalled()

    const audioTrack: {
      id: string
      kind: 'audio'
      muted: boolean
      readyState: string
      onunmute?: () => void
    } = { id: 'audio-2', kind: 'audio', muted: true, readyState: 'live' }
    const audioStream = new MockMediaStream()
    audioStream.addTrack(audioTrack)
    ;(manager as any).attachRemoteTrack(audioTrack, audioStream)
    ;(manager as any).observeRemoteTrack(audioTrack)
    ;(manager as any).maybeMarkConnected()
    expect(mockCallService.markConnected).not.toHaveBeenCalled()

    audioTrack.muted = false
    audioTrack.onunmute?.()
    expect(mockCallService.markConnected).toHaveBeenCalledTimes(1)

    manager.dispose()
  })

  it('queues follow-up offers while another offer is processing', async () => {
    const { WebRTCManager } = await import('./webrtcManager')

    let resolveFirstRemoteDescription: (() => void) | null = null
    let remoteDescriptionCount = 0
    let answerCount = 0

    const peerConnection = {
      signalingState: 'stable',
      addIceCandidate: vi.fn(async () => {}),
      createAnswer: vi.fn(async () => ({ sdp: `answer-${++answerCount}` })),
      getSenders: vi.fn(() => []),
      setLocalDescription: vi.fn(async () => {}),
      setRemoteDescription: vi.fn(() => {
        remoteDescriptionCount += 1
        if (remoteDescriptionCount === 1) {
          return new Promise<void>((resolve) => {
            resolveFirstRemoteDescription = resolve
          })
        }
        return Promise.resolve()
      }),
    }

    const manager = new WebRTCManager({
      onStateChange: vi.fn(),
      onRemoteStream: vi.fn(),
      onLocalStream: vi.fn(),
      onMediaStateChange: vi.fn(),
      onError: vi.fn(),
      onCallEnded: vi.fn(),
    })

    ;(manager as any).peerConnection = peerConnection

    const firstOffer = (manager as any).handleOffer({ sdp: 'offer-1' })
    await Promise.resolve()
    await (manager as any).handleOffer({ sdp: 'offer-2' })

    expect(mockCallService.sendAnswer).not.toHaveBeenCalled()

    ;(resolveFirstRemoteDescription as (() => void) | null)?.()
    await firstOffer

    expect(peerConnection.setRemoteDescription).toHaveBeenCalledTimes(2)
    expect(mockCallService.sendAnswer).toHaveBeenNthCalledWith(1, 'answer-1', {
      transitionState: false,
    })
    expect(mockCallService.sendAnswer).toHaveBeenNthCalledWith(2, 'answer-2', {
      transitionState: false,
    })
  })

  it('reuses a prepared incoming CallService before answering', async () => {
    mockCallService.getSession.mockReturnValue({
      id: 'session-1',
      state: 'ringing',
      isOutgoing: false,
      callerIdentityId: 'caller-1',
      calleeIdentityId: 'callee-1',
      conversationId: 'conversation-1',
      callType: 'voice',
      encryptionKey: 'shared-key',
    })

    const { WebRTCManager } = await import('./webrtcManager')
    const manager = new WebRTCManager({
      onStateChange: vi.fn(),
      onRemoteStream: vi.fn(),
      onLocalStream: vi.fn(),
      onMediaStateChange: vi.fn(),
      onError: vi.fn(),
      onCallEnded: vi.fn(),
    }, {
      callService: mockCallService as any,
    })

    await (manager as any).prepareIncomingCallService(
      'session-1',
      'caller-1',
      'callee-1',
      'conversation-1',
      'voice',
      'shared-key',
    )

    expect(mockCallService.ensureSignalPolling).toHaveBeenCalledTimes(1)
    expect(mockCallService.acceptIncomingCall).not.toHaveBeenCalled()
  })

  it('ends calls locally before remote cleanup finishes', async () => {
    mockCallService.endCall.mockImplementation(() => new Promise(() => {}))

    const onCallEnded = vi.fn()
    const { WebRTCManager } = await import('./webrtcManager')
    const manager = new WebRTCManager({
      onStateChange: vi.fn(),
      onRemoteStream: vi.fn(),
      onLocalStream: vi.fn(),
      onMediaStateChange: vi.fn(),
      onError: vi.fn(),
      onCallEnded,
    }, {
      callService: mockCallService as any,
    })

    await manager.endCall('cancelled')

    expect(mockCallService.endCall).toHaveBeenCalledWith('cancelled', {
      suppressStateChange: true,
    })
    expect(onCallEnded).toHaveBeenCalledWith('cancelled')
  })

  it('allows ringback playback on iOS for outgoing calls', async () => {
    mockCallService.getSession.mockReturnValue({ state: 'ringing', isOutgoing: true })

    const { WebRTCManager } = await import('./webrtcManager')
    const manager = new WebRTCManager({
      onStateChange: vi.fn(),
      onRemoteStream: vi.fn(),
      onLocalStream: vi.fn(),
      onMediaStateChange: vi.fn(),
      onError: vi.fn(),
      onCallEnded: vi.fn(),
    }, {
      callService: mockCallService as any,
    })

    const playRingbackTone = vi.fn(async () => {})
    ;(manager as any).playRingbackTone = playRingbackTone
    ;(manager as any).startRingbackTone()

    expect(playRingbackTone).toHaveBeenCalledTimes(1)
  })

  it('retries ringback playback if the sound unloads while ringing', async () => {
    vi.useFakeTimers()
    try {
      const { WebRTCManager } = await import('./webrtcManager')
      const manager = new WebRTCManager({
        onStateChange: vi.fn(),
        onRemoteStream: vi.fn(),
        onLocalStream: vi.fn(),
        onMediaStateChange: vi.fn(),
        onError: vi.fn(),
        onCallEnded: vi.fn(),
      }, {
        callService: mockCallService as any,
      })
      const playRingbackTone = vi.fn(async () => {})
      ;(manager as any).ringbackActive = true
      ;(manager as any).ringbackToken = 7
      ;(manager as any).playRingbackTone = playRingbackTone

      ;(manager as any).handleRingbackPlaybackStatusUpdate({ isLoaded: false, error: 'audio interruption' })
      await vi.advanceTimersByTimeAsync(750)

      expect(playRingbackTone).toHaveBeenCalledWith(7)
    } finally {
      vi.useRealTimers()
    }
  })

  it('creates peer connections with relay-only verified TURN credentials', async () => {
    const { WebRTCManager } = await import('./webrtcManager')
    const manager = new WebRTCManager({
      onStateChange: vi.fn(),
      onRemoteStream: vi.fn(),
      onLocalStream: vi.fn(),
      onMediaStateChange: vi.fn(),
      onError: vi.fn(),
      onCallEnded: vi.fn(),
    }, {
      callService: mockCallService as any,
    })

    await manager.startCall('caller-1', 'callee-1', 'conversation-1', 'voice')

    expect(backendRequest).toHaveBeenCalledWith('/v1/calls/turn-credentials', {
      method: 'POST',
      body: { ttl: 86400 },
    }, { accessToken: 'token' })
    expect(mockRTCPeerConnectionImpl).toHaveBeenCalledWith(expect.objectContaining({
      iceServers: [{ urls: 'turn:relay.example.com' }],
      iceTransportPolicy: 'relay',
      iceCandidatePoolSize: 0,
    }))
  })

  it('fails closed when verified TURN credentials do not include a relay server', async () => {
    vi.resetModules()
    ;(backendRequest as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      iceServers: [{ urls: 'stun:stun.example.com' }],
    })

    const { WebRTCManager } = await import('./webrtcManager')
    const manager = new WebRTCManager({
      onStateChange: vi.fn(),
      onRemoteStream: vi.fn(),
      onLocalStream: vi.fn(),
      onMediaStateChange: vi.fn(),
      onError: vi.fn(),
      onCallEnded: vi.fn(),
    }, {
      callService: mockCallService as any,
    })

    await expect(
      manager.startCall('caller-1', 'callee-1', 'conversation-1', 'voice'),
    ).rejects.toThrow('TURN credential response did not include a relay server.')
    expect(mockCallService.endCall).toHaveBeenCalledWith('cancelled')
  })
})
