/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearCallDiagnosticEvents,
  clearCallLatencyEvents,
  getRecentCallDiagnosticEvents,
} from './callDiagnostics'

type RealtimeRequest = {
  accessToken: string
  subscriberId: string
  topic: string
}

const authMocks = vi.hoisted(() => ({
  ensureBoundBackendAccessForIdentity: vi.fn(async (): Promise<{ accessToken: string } | null> => ({ accessToken: 'token' })),
  getCachedBackendAccessToken: vi.fn(() => 'access-token'),
  hasBoundBackendAccessForIdentity: vi.fn(() => false),
  invalidateAuthCaches: vi.fn(),
}))

const realtimeMocks = vi.hoisted(() => ({
  subscribeBackendRealtime: vi.fn((_request: RealtimeRequest) => ({ close: vi.fn() })),
}))

const callAdmissionMocks = vi.hoisted(() => ({
  assertCallAdmission: vi.fn(),
}))

const quantumChatMocks = vi.hoisted(() => ({
  getActiveSessionByRemoteIdentity: vi.fn(async () => null),
  getIdentity: vi.fn(() => ({ id: 'caller-1' })),
  getLocalDilithiumPrivateKey: vi.fn(async () => null as string | null),
}))

type InsertPayload = {
  call_session_id: string
  sender_identity_id: string
  recipient_identity_id: string
  signal_type: string
  encrypted_payload: string
  nonce: string
  auth_tag: string
  signature: string
  sequence_number: number
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const insertPayloads: InsertPayload[] = []
const insertSingle = vi.fn()
const insertSelect = vi.fn(() => ({
  single: insertSingle,
}))
const callSessionsEq = vi.fn(async () => ({ error: null }))
const updateCallSessions = vi.fn(() => ({
  eq: callSessionsEq,
}))
const callSessionsMaybeSingle = vi.fn()
const callSessionsSelectEq = vi.fn(() => ({
  maybeSingle: callSessionsMaybeSingle,
}))
const callSessionsSelect = vi.fn(() => ({
  eq: callSessionsSelectEq,
}))
const insertCallSignals = vi.fn((payload: InsertPayload) => {
  insertPayloads.push(payload)
  return {
    select: insertSelect,
  }
})
const updateCallSignals = vi.fn(() => {
  const chain = {
    eq: vi.fn(() => chain),
    lt: vi.fn(async () => ({ error: null })),
  }
  return chain
})
const selectCallSignals = vi.fn(() => {
  const chain = {
    eq: vi.fn(() => chain),
    gt: vi.fn(() => chain),
    order: vi.fn(async () => ({ data: [], error: null })),
  }
  return chain
})
const insertCallSession = vi.fn(async (): Promise<{ error: Error | null }> => ({ error: null }))

const backend = {
  from: vi.fn((table: string) => {
    if (table === 'call_signals') {
      return {
        insert: insertCallSignals,
        select: selectCallSignals,
        update: updateCallSignals,
      }
    }

    if (table === 'call_sessions') {
      return {
        insert: insertCallSession,
        select: callSessionsSelect,
        update: updateCallSessions,
      }
    }

    throw new Error(`Unexpected table: ${table}`)
  }),
  channel: vi.fn(() => ({
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn(),
  })),
  removeChannel: vi.fn(),
}

let appState = 'active'

let decryptedSignalPayload: Record<string, unknown> = { type: 'offer', sdp: 'remote-offer' }
const decryptedSignalPayloadByCiphertext = new Map<string, Record<string, unknown>>()

vi.mock('../backend/client', () => ({
  backend,
  isBackendConfigured: vi.fn(() => true),
  isSpectraBackendConfigured: vi.fn(() => true),
}))

vi.mock('../backend/data', () => ({
  backendData: {
    table: backend.from,
    call: vi.fn(),
  },
}))

vi.mock('../backend/realtime', () => ({
  subscribeBackendRealtime: realtimeMocks.subscribeBackendRealtime,
}))

vi.mock('../backend/session', () => authMocks)

vi.mock('react-native', () => ({
  AppState: {
    get currentState() {
      return appState
    },
  },
}))

vi.mock('@spectra/core-crypto', () => ({
  generateRandomBytes: vi.fn(),
  bytesToBase64: vi.fn(),
  base64ToBytes: vi.fn(() => new Uint8Array(32)),
  generateUUID: vi.fn(),
  encryptBinary: vi.fn(() => ({
    ciphertext: 'ciphertext',
    nonce: 'nonce',
    tag: 'auth-tag',
  })),
  decryptBinary: vi.fn((_: Uint8Array, encryptedPayload: string) => (
    new TextEncoder().encode(JSON.stringify(
      decryptedSignalPayloadByCiphertext.get(encryptedPayload) || decryptedSignalPayload
    ))
  )),
  dilithiumSignAsync: vi.fn(() => 'signature'),
  dilithiumVerifyAsync: vi.fn(async () => true),
}))

vi.mock('../chat/chatService', () => ({
  getIdentity: vi.fn(() => null),
}))

vi.mock('../quantumChat', () => ({
  getActiveSessionByRemoteIdentity: quantumChatMocks.getActiveSessionByRemoteIdentity,
  getIdentity: quantumChatMocks.getIdentity,
  getLocalDilithiumPrivateKey: quantumChatMocks.getLocalDilithiumPrivateKey,
}))

vi.mock('./callAdmission', () => callAdmissionMocks)

vi.mock('../shared/callInvitationFormat', () => ({
  createCallInvitationMessage: vi.fn(() => 'invitation'),
  parseCallInvitation: vi.fn(),
  isCallInvitation: vi.fn(),
  describeCallInvitation: vi.fn(),
}))

vi.mock('./callLifecycleUtils', () => ({
  isTerminalCallState: vi.fn(() => false),
  shouldIgnoreCallStateTransition: vi.fn(() => false),
}))

function createSession(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'session-1',
    callerIdentityId: 'caller-1',
    calleeIdentityId: 'callee-1',
    conversationId: 'conversation-1',
    callType: 'voice',
    state: 'initiating',
    isOutgoing: true,
    encryptionKey: 'base64-key',
    localDilithiumPrivateKey: 'local-private-key',
    remoteDilithiumPublicKey: null,
    signalSequence: 0,
    lastReceivedSequence: -1,
    ...overrides,
  }
}

async function prepareInitiateCallMocks() {
  const quantum = await import('@spectra/core-crypto')
  vi.mocked(quantum.generateRandomBytes).mockReturnValue(new Uint8Array(32))
  vi.mocked(quantum.bytesToBase64).mockReturnValue('base64-key')
  vi.mocked(quantum.generateUUID).mockReturnValue('session-1')
  quantumChatMocks.getLocalDilithiumPrivateKey.mockResolvedValue('local-private-key')
}

describe('CallService signaling transport', () => {
  beforeEach(() => {
    ;(globalThis as { __DEV__?: boolean }).__DEV__ = false
    appState = 'active'
    insertPayloads.length = 0
    decryptedSignalPayload = { type: 'offer', sdp: 'remote-offer' }
    decryptedSignalPayloadByCiphertext.clear()
    clearCallDiagnosticEvents()
    clearCallLatencyEvents()
    insertSingle.mockReset()
    insertSelect.mockClear()
    insertCallSignals.mockClear()
    selectCallSignals.mockClear()
    updateCallSignals.mockClear()
    insertCallSession.mockReset()
    insertCallSession.mockResolvedValue({ error: null })
    updateCallSessions.mockClear()
    callSessionsEq.mockClear()
    callSessionsMaybeSingle.mockReset()
    callSessionsSelectEq.mockClear()
    callSessionsSelect.mockClear()
    backend.from.mockClear()
    authMocks.ensureBoundBackendAccessForIdentity.mockReset()
    authMocks.ensureBoundBackendAccessForIdentity.mockResolvedValue({ accessToken: 'token' })
    authMocks.getCachedBackendAccessToken.mockClear()
    authMocks.getCachedBackendAccessToken.mockReturnValue('access-token')
    authMocks.hasBoundBackendAccessForIdentity.mockReset()
    authMocks.hasBoundBackendAccessForIdentity.mockReturnValue(false)
    authMocks.invalidateAuthCaches.mockClear()
    realtimeMocks.subscribeBackendRealtime.mockClear()
    callAdmissionMocks.assertCallAdmission.mockReset()
    quantumChatMocks.getActiveSessionByRemoteIdentity.mockReset()
    quantumChatMocks.getActiveSessionByRemoteIdentity.mockResolvedValue(null)
    quantumChatMocks.getIdentity.mockReset()
    quantumChatMocks.getIdentity.mockReturnValue({ id: 'caller-1' })
    quantumChatMocks.getLocalDilithiumPrivateKey.mockReset()
    quantumChatMocks.getLocalDilithiumPrivateKey.mockResolvedValue(null)
  })

  it('retries transient call signal send failures', async () => {
    const { CallService } = await import('./callService')
    const service = new CallService()
    ;(service as any).session = createSession()

    insertSingle
      .mockResolvedValueOnce({
        data: null,
        error: new Error('TypeError: Network request failed'),
      })
      .mockResolvedValueOnce({
        data: { id: 'signal-1' },
        error: null,
      })

    await (service as any).sendSignal('offer', {
      type: 'offer',
      sdp: 'offer-sdp',
    })

    expect(insertCallSignals).toHaveBeenCalledTimes(2)
    expect(insertPayloads).toHaveLength(2)
    expect(insertPayloads[0]?.sequence_number).toBe(1)
    expect(insertPayloads[1]?.sequence_number).toBe(1)
    expect(authMocks.ensureBoundBackendAccessForIdentity).toHaveBeenCalledWith('caller-1')
    expect(getRecentCallDiagnosticEvents().map((event) => event.name)).toEqual(
      expect.arrayContaining(['send_retrying', 'send_succeeded'])
    )
  })

  it('blocks new calls when Spectre Mode is enabled', async () => {
    callAdmissionMocks.assertCallAdmission.mockImplementation(() => {
      throw new Error('Calls are disabled in Spectre Mode.')
    })

    const { CallService } = await import('./callService')
    const service = new CallService()

    await expect(
      service.initiateCall('caller-1', 'callee-1', 'conversation-1', 'voice'),
    ).rejects.toThrow('Calls are disabled in Spectre Mode.')

    expect(backend.from).not.toHaveBeenCalled()
  })

  it('blocks accepting calls when Spectre Mode is enabled', async () => {
    callAdmissionMocks.assertCallAdmission.mockImplementation(() => {
      throw new Error('Calls are disabled in Spectre Mode.')
    })

    const { CallService } = await import('./callService')
    const service = new CallService()

    await expect(
      service.acceptIncomingCall(
        'session-1',
        'caller-1',
        'callee-1',
        'conversation-1',
        'voice',
        'base64-key',
      ),
    ).rejects.toThrow('Calls are disabled in Spectre Mode.')

    expect(backend.from).not.toHaveBeenCalled()
  })

  it('blocks calls when Tor is active', async () => {
    callAdmissionMocks.assertCallAdmission.mockImplementation(() => {
      throw new Error('Calls are unavailable while Tor mode is active.')
    })

    const { CallService } = await import('./callService')
    const service = new CallService()

    await expect(
      service.initiateCall('caller-1', 'callee-1', 'conversation-1', 'voice'),
    ).rejects.toThrow('Calls are unavailable while Tor mode is active.')

    expect(backend.from).not.toHaveBeenCalled()
  })

  it('starts outgoing calls when the caller identity is already bound', async () => {
    await prepareInitiateCallMocks()
    authMocks.hasBoundBackendAccessForIdentity.mockReturnValue(true)

    const { CallService } = await import('./callService')
    const service = new CallService()

    await expect(
      service.initiateCall('caller-1', 'callee-1', 'conversation-1', 'voice'),
    ).resolves.toMatchObject({
      invitationMessage: 'invitation',
      session: expect.objectContaining({
        callerIdentityId: 'caller-1',
        calleeIdentityId: 'callee-1',
        id: 'session-1',
      }),
    })

    expect(insertCallSession).toHaveBeenCalledWith(expect.objectContaining({
      caller_identity_id: 'caller-1',
      callee_identity_id: 'callee-1',
      id: 'session-1',
    }))
    const realtimeRequest = realtimeMocks.subscribeBackendRealtime.mock.calls[0]?.[0]
    expect(realtimeRequest).toEqual(expect.objectContaining({
      accessToken: 'access-token',
      topic: 'call_signals:session-1',
    }))
    expect(realtimeRequest?.subscriberId).toMatch(/^call-/)
    expect(realtimeRequest?.subscriberId).toMatch(/^[^\s:\0]{1,128}$/)
    expect(realtimeRequest?.subscriberId).not.toContain('session-1')
    expect(realtimeRequest?.subscriberId).not.toContain('caller-1')
  })

  it('does not publish discovery when the caller identity is unavailable', async () => {
    await prepareInitiateCallMocks()
    authMocks.ensureBoundBackendAccessForIdentity.mockResolvedValue(null)

    const { CallService } = await import('./callService')
    const service = new CallService()

    await expect(
      service.initiateCall('caller-1', 'callee-1', 'conversation-1', 'voice'),
    ).rejects.toThrow('Secure call setup is still syncing. Please wait a moment and try again.')

    expect(authMocks.ensureBoundBackendAccessForIdentity).toHaveBeenCalledWith('caller-1')
    expect(insertCallSession).not.toHaveBeenCalled()
  })

  it('retries call session creation once after a stale Backend binding is rejected', async () => {
    await prepareInitiateCallMocks()
    authMocks.hasBoundBackendAccessForIdentity
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false)
      .mockReturnValue(true)
    insertCallSession
      .mockResolvedValueOnce({ error: new Error('Spectra backend 403: forbidden') })
      .mockResolvedValueOnce({ error: null })

    const { CallService } = await import('./callService')
    const service = new CallService()

    await service.initiateCall('caller-1', 'callee-1', 'conversation-1', 'voice')

    expect(authMocks.invalidateAuthCaches).toHaveBeenCalled()
    expect(authMocks.ensureBoundBackendAccessForIdentity).toHaveBeenCalledWith('caller-1')
    expect(insertCallSession).toHaveBeenCalledTimes(2)
  })

  it('serializes concurrent signal writes to avoid transport bursts', async () => {
    const { CallService } = await import('./callService')
    const service = new CallService()
    ;(service as any).session = createSession()

    const firstInsert = createDeferred<{ data: { id: string }; error: null }>()
    insertSingle
      .mockImplementationOnce(() => firstInsert.promise)
      .mockResolvedValueOnce({
        data: { id: 'signal-2' },
        error: null,
      })

    const firstSend = (service as any).sendSignal('ice_candidate', {
      candidate: 'candidate-1',
      sdpMLineIndex: 0,
      sdpMid: '0',
    })
    const secondSend = (service as any).sendSignal('ice_candidate', {
      candidate: 'candidate-2',
      sdpMLineIndex: 0,
      sdpMid: '0',
    })

    await new Promise((resolve) => {
      setTimeout(resolve, 0)
    })

    expect(insertCallSignals).toHaveBeenCalledTimes(1)
    expect(insertPayloads).toHaveLength(1)
    expect(insertPayloads[0]?.sequence_number).toBe(1)

    firstInsert.resolve({
      data: { id: 'signal-1' },
      error: null,
    })

    await Promise.all([firstSend, secondSend])

    expect(insertCallSignals).toHaveBeenCalledTimes(2)
    expect(insertPayloads).toHaveLength(2)
    expect(insertPayloads[1]?.sequence_number).toBe(2)
  })

  it('sends a ringing signal for an accepted incoming call', async () => {
    const { CallService } = await import('./callService')
    const service = new CallService()
    ;(service as any).session = createSession({
      state: 'ringing',
      isOutgoing: false,
    })
    insertSingle.mockResolvedValueOnce({
      data: { id: 'signal-1' },
      error: null,
    })

    await service.sendRinging()

    expect(insertCallSignals).toHaveBeenCalledTimes(1)
    expect(insertPayloads).toHaveLength(1)
    expect(insertPayloads[0]?.signal_type).toBe('ringing')
    expect(insertPayloads[0]?.sequence_number).toBe(1)
  })

  it('keeps a connected call stable during renegotiation offers and answers', async () => {
    const { CallService } = await import('./callService')
    const service = new CallService()
    ;(service as any).session = createSession({
      state: 'connected',
      startedAt: Date.now(),
    })

    insertSingle
      .mockResolvedValueOnce({
        data: { id: 'signal-1' },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { id: 'signal-2' },
        error: null,
      })

    await service.sendOffer('renegotiation-offer', { transitionState: false })
    expect((service as any).session.state).toBe('connected')

    await service.sendAnswer('renegotiation-answer', { transitionState: false })
    expect((service as any).session.state).toBe('connected')
    expect(insertPayloads.map((payload) => payload.signal_type)).toEqual(['offer', 'answer'])
  })

  it('awaits async signal handlers before marking processing complete', async () => {
    const signalHandled = createDeferred<void>()
    const onSignalReceived = vi.fn(() => signalHandled.promise)

    const { CallService } = await import('./callService')
    const service = new CallService({ onSignalReceived })
    ;(service as any).session = createSession()

    const processing = (service as any).processSignal({
      id: 'signal-remote-1',
      signal_type: 'offer',
      encrypted_payload: 'ciphertext',
      nonce: 'nonce',
      auth_tag: 'auth-tag',
      signature: 'signature',
      sequence_number: 1,
    })

    let settled = false
    void processing.then(() => {
      settled = true
    })

    await Promise.resolve()

    expect(onSignalReceived).toHaveBeenCalledWith('offer', {
      type: 'offer',
      sdp: 'remote-offer',
    })
    expect(settled).toBe(false)

    signalHandled.resolve()
    await expect(processing).resolves.toBe('processed')
  })

  it('buffers out-of-order signals until the missing sequence arrives', async () => {
    const onSignalReceived = vi.fn()

    const { CallService } = await import('./callService')
    const service = new CallService({ onSignalReceived })
    ;(service as any).session = createSession()

    decryptedSignalPayloadByCiphertext.set('cipher-ice', {
      candidate: 'candidate-2',
      sdpMLineIndex: 0,
      sdpMid: '0',
    })
    decryptedSignalPayloadByCiphertext.set('cipher-offer', {
      type: 'offer',
      sdp: 'remote-offer',
    })

    const outOfOrder = await (service as any).consumeSignal({
      id: 'signal-2',
      signal_type: 'ice_candidate',
      encrypted_payload: 'cipher-ice',
      nonce: 'nonce',
      auth_tag: 'auth-tag',
      signature: 'signature',
      sequence_number: 2,
    })

    expect(outOfOrder).toEqual({
      processedIds: [],
      expiredIds: [],
    })
    expect(onSignalReceived).not.toHaveBeenCalled()

    const inOrder = await (service as any).consumeSignal({
      id: 'signal-1',
      signal_type: 'offer',
      encrypted_payload: 'cipher-offer',
      nonce: 'nonce',
      auth_tag: 'auth-tag',
      signature: 'signature',
      sequence_number: 1,
    })

    expect(inOrder).toEqual({
      processedIds: ['signal-1', 'signal-2'],
      expiredIds: [],
    })
    expect(onSignalReceived).toHaveBeenNthCalledWith(1, 'offer', {
      type: 'offer',
      sdp: 'remote-offer',
    })
    expect(onSignalReceived).toHaveBeenNthCalledWith(2, 'ice_candidate', {
      candidate: 'candidate-2',
      sdpMLineIndex: 0,
      sdpMid: '0',
    })
    expect((service as any).session.lastReceivedSequence).toBe(2)
  })

  it('records fail-secure diagnostics when signature verification fails', async () => {
    const quantum = await import('@spectra/core-crypto')
    vi.mocked(quantum.dilithiumVerifyAsync).mockResolvedValue(false)

    const { CallService } = await import('./callService')
    const service = new CallService()
    ;(service as any).session = createSession({
      remoteDilithiumPublicKey: 'remote-public-key',
    })

    await expect((service as any).processSignal({
      id: 'signal-invalid-1',
      signal_type: 'offer',
      encrypted_payload: 'ciphertext',
      nonce: 'nonce',
      auth_tag: 'auth-tag',
      signature: 'signature',
      sequence_number: 1,
    })).resolves.toBe('expired')

    expect((service as any).session.state).toBe('failed')
    expect(getRecentCallDiagnosticEvents().map((event) => event.name)).toEqual(
      expect.arrayContaining(['fail_securely'])
    )
  })

  it('fetches call session snapshots with mapped timestamps', async () => {
    callSessionsMaybeSingle.mockResolvedValueOnce({
      data: {
        id: 'session-1',
        caller_identity_id: 'caller-1',
        callee_identity_id: 'callee-1',
        conversation_id: 'conversation-1',
        call_type: 'video',
        state: 'connected',
        end_reason: null,
        created_at: '2026-04-18T12:00:00.000Z',
        updated_at: '2026-04-18T12:01:00.000Z',
        started_at: '2026-04-18T12:00:30.000Z',
        ended_at: null,
      },
      error: null,
    })

    const { getCallSessionSnapshot } = await import('./callService')
    const snapshot = await getCallSessionSnapshot('session-1')

    expect(callSessionsSelect).toHaveBeenCalledWith(
      'id, caller_identity_id, callee_identity_id, conversation_id, call_type, state, end_reason, created_at, updated_at, started_at, ended_at',
    )
    expect(callSessionsSelectEq).toHaveBeenCalledWith('id', 'session-1')
    expect(authMocks.ensureBoundBackendAccessForIdentity).toHaveBeenCalledWith('caller-1')
    expect(snapshot).toMatchObject({
      id: 'session-1',
      callerIdentityId: 'caller-1',
      calleeIdentityId: 'callee-1',
      callType: 'video',
      state: 'connected',
      startedAt: Date.parse('2026-04-18T12:00:30.000Z'),
    })
  })

  it('returns null for missing call session snapshots', async () => {
    callSessionsMaybeSingle.mockResolvedValueOnce({ data: null, error: null })

    const { getCallSessionSnapshot } = await import('./callService')

    await expect(getCallSessionSnapshot('missing-session')).resolves.toBeNull()
  })

  it('requires a signature when a remote ML-DSA-65 key is known', async () => {
    const { CallService } = await import('./callService')
    const service = new CallService()
    ;(service as any).session = createSession({
      remoteDilithiumPublicKey: 'remote-public-key',
    })

    await expect((service as any).processSignal({
      id: 'signal-unsigned-1',
      signal_type: 'offer',
      encrypted_payload: 'ciphertext',
      nonce: 'nonce',
      auth_tag: 'auth-tag',
      signature: 'unsigned',
      sequence_number: 1,
    })).resolves.toBe('expired')

    expect((service as any).session.state).toBe('failed')
    expect(getRecentCallDiagnosticEvents().map((event) => event.name)).toEqual(
      expect.arrayContaining(['fail_securely']),
    )
  })

  it('does not claim ML-DSA-65 authentication when the remote public key is unavailable', async () => {
    const quantum = await import('@spectra/core-crypto')
    vi.mocked(quantum.dilithiumVerifyAsync).mockClear()
    const onSignalReceived = vi.fn()
    const { CallService } = await import('./callService')
    const service = new CallService({ onSignalReceived })
    ;(service as any).session = createSession({
      remoteDilithiumPublicKey: null,
    })

    await expect((service as any).processSignal({
      id: 'signal-no-key-1',
      signal_type: 'offer',
      encrypted_payload: 'ciphertext',
      nonce: 'nonce',
      auth_tag: 'auth-tag',
      signature: 'unsigned',
      sequence_number: 1,
    })).resolves.toBe('processed')

    expect(quantum.dilithiumVerifyAsync).not.toHaveBeenCalled()
    expect(onSignalReceived).toHaveBeenCalledWith('offer', {
      type: 'offer',
      sdp: 'remote-offer',
    })
  })

  it('expires stale and duplicate signals without invoking handlers', async () => {
    const onSignalReceived = vi.fn()
    const { CallService } = await import('./callService')
    const service = new CallService({ onSignalReceived })
    ;(service as any).session = createSession({ lastReceivedSequence: 2 })

    const stale = await (service as any).consumeSignal({
      id: 'signal-stale',
      signal_type: 'offer',
      encrypted_payload: 'ciphertext',
      nonce: 'nonce',
      auth_tag: 'auth-tag',
      signature: 'signature',
      sequence_number: 2,
    })
    const duplicate = await (service as any).consumeSignal({
      id: 'signal-stale',
      signal_type: 'offer',
      encrypted_payload: 'ciphertext',
      nonce: 'nonce',
      auth_tag: 'auth-tag',
      signature: 'signature',
      sequence_number: 2,
    })

    expect(stale).toEqual({ processedIds: ['signal-stale'], expiredIds: [] })
    expect(duplicate).toEqual({ processedIds: [], expiredIds: [] })
    expect(onSignalReceived).not.toHaveBeenCalled()
  })

  it('reports decrypt or payload parse failures as expired without advancing the call', async () => {
    const quantum = await import('@spectra/core-crypto')
    vi.mocked(quantum.decryptBinary).mockReturnValueOnce(new TextEncoder().encode('{not json'))
    const onError = vi.fn()
    const { CallService } = await import('./callService')
    const service = new CallService({ onError })
    ;(service as any).session = createSession()

    await expect((service as any).processSignal({
      id: 'signal-malformed',
      signal_type: 'offer',
      encrypted_payload: 'bad-json',
      nonce: 'nonce',
      auth_tag: 'auth-tag',
      signature: 'signature',
      sequence_number: 1,
    })).resolves.toBe('expired')

    expect(onError).toHaveBeenCalledWith(expect.any(Error))
    expect((service as any).session.state).toBe('initiating')
  })
})
