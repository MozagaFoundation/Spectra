/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import {
  BLE_HANDSHAKE_HEADER_BYTES,
  HandshakeFrameAssembler,
  createHandshakeId,
  decodeHandshakeFrame,
  encodeHandshakeFrames,
} from './handshakeFrames'
import {
  BLE_SECURE_LINK_PAYLOAD_BYTES,
  BleNoiseLinkSession,
  type BleLinkStaticKeyPair,
  type BleNoiseOutbound,
} from './linkSession'
import { BLE_FALLBACK_VALUE_BYTES } from '../types'
import { createLogger } from '../logger'
import {
  TransportFrameAssembler,
  encodeTransportFrames,
  isTransportFrame,
} from './transportFrames'

const log = createLogger('LinkMgr')

const MAX_LINKS = 8
const HANDSHAKE_TIMEOUT_MS = 45_000
const RATE_WINDOW_MS = 1_000
const PRE_AUTH_RATE_BURST = 96
const AUTHENTICATED_RATE_BURST = 256
const MAX_PRE_AUTH_RATE_PEERS = 128
const MAX_PENDING_FRAMES_PER_DEVICE = 128
const MAX_PENDING_FRAMES = 512
const MAX_LINK_FRAME_BYTES = 512

interface LinkState {
  deviceId: string
  deviceGeneration: number
  role: 'initiator' | 'responder'
  handshakeId: Uint8Array
  session: BleNoiseLinkSession
  startedAt: number
  remoteIdentityId: string | null
  knownContact: boolean
  rateWindowStartedAt: number
  rateCount: number
  secureNotified: boolean
  authenticationNotified: boolean
  failureNotified: boolean
}

export interface BleLinkPeerIdentity {
  identityId: string
  knownContact: boolean
}

export type BleLinkHandshakeProgress =
  | 'step_1_sent'
  | 'step_1_received'
  | 'step_2_sent'
  | 'step_2_received'
  | 'step_3_sent'
  | 'step_3_received'
  | 'transport_keys_ready'
  | 'credential_authenticated'

export type BleLinkFailureCause =
  | 'handshake_timeout'
  | 'handshake_send_failed'
  | 'handshake_progress_timeout'
  | 'handshake_malformed'
  | 'handshake_noise_failed'
  | 'handshake_unexpected_message'
  | 'handshake_link_closed'
  | 'handshake_init_failed'
  | 'handshake_static_missing'
  | 'handshake_out_of_order'
  | 'credential_rejected'
  | 'transport_send_failed'
  | 'transport_failed'

export interface BleLinkManagerOptions {
  staticKeyPair: BleLinkStaticKeyPair
  credential: Uint8Array
  verifyCredential: (
    deviceId: string,
    credential: Uint8Array,
    remoteStaticKey: Uint8Array,
  ) => Promise<BleLinkPeerIdentity | null>
  sendRaw: (deviceId: string, frames: Uint8Array[]) => Promise<boolean>
  onSecureData: (
    deviceId: string,
    remoteIdentityId: string,
    data: Uint8Array,
  ) => Promise<void> | void
  onAuthenticated?: (
    peer: BleLinkPeerIdentity & {
      deviceId: string
      role: 'initiator' | 'responder'
      linkGeneration: number
    },
  ) => void
  onLinkStage?: (
    deviceId: string,
    stage: 'handshaking' | 'secure' | 'authenticated',
  ) => void
  onHandshakeProgress?: (
    deviceId: string,
    progress: BleLinkHandshakeProgress,
  ) => void
  onLinkFailure?: (
    deviceId: string,
    stage: 'handshake' | 'authentication' | 'transport',
    cause: BleLinkFailureCause,
  ) => void
  onAbortCompetingInitiators?: (deviceIds: string[]) => void
  maxFrameBytes?: (deviceId: string) => number
}

function receivedHandshakeProgress(step: number): BleLinkHandshakeProgress {
  if (step === 1) return 'step_1_received'
  if (step === 2) return 'step_2_received'
  return 'step_3_received'
}

function sentHandshakeProgress(step: number): BleLinkHandshakeProgress | null {
  if (step === 1) return 'step_1_sent'
  if (step === 2) return 'step_2_sent'
  if (step === 3) return 'step_3_sent'
  return null
}

function compareHandshakeIds(left: Uint8Array, right: Uint8Array): number {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index]
  }
  return 0
}

function sameHandshakeId(left: Uint8Array, right: Uint8Array): boolean {
  return left.every((byte, index) => byte === right[index])
}

function isRejectedProtocolVersion(data: Uint8Array): boolean {
  if (data[0] === 1) return true
  return data.length >= 3
    && data[0] === 0x53
    && data[1] === 0x42
    && data[2] !== 2
}

function classifyReceiveFailure(
  error: unknown,
  stage: 'handshake' | 'authentication' | 'transport',
): BleLinkFailureCause {
  const message = error instanceof Error ? error.message : ''
  if (message === 'BLE handshake response failed') return 'handshake_send_failed'
  if (message === 'BLE Noise link progress timed out') return 'handshake_progress_timeout'
  if (message === 'BLE transport data arrived before Noise handshake completion') {
    return 'handshake_out_of_order'
  }
  if (message === 'BLE Noise received data before authentication') {
    return 'handshake_out_of_order'
  }
  if (message === 'BLE transport response failed') return 'transport_send_failed'
  if (message === 'BLE Noise identity credential verification failed') {
    return 'credential_rejected'
  }
  if (isHandshakeFrameError(message)) return 'handshake_malformed'
  if (
    message === 'BLE Noise link closed'
    || message === 'BLE Noise link is not available'
    || message === 'BLE Noise link is not active'
  ) {
    return 'handshake_link_closed'
  }
  if (
    message === 'BLE Noise link initialization failed'
    || message === 'BLE Noise protocol suite is invalid'
    || message === 'BLE Noise implementation changed the static private key'
    || message === 'BLE Noise static key must be 32 bytes'
  ) {
    return 'handshake_init_failed'
  }
  if (message === 'BLE Noise remote static key is unavailable') {
    return 'handshake_static_missing'
  }
  if (isUnexpectedNoiseMessage(message)) return 'handshake_unexpected_message'
  if (stage === 'authentication') return 'credential_rejected'
  if (stage === 'transport') return 'transport_failed'
  return 'handshake_noise_failed'
}

function isUnexpectedNoiseMessage(message: string): boolean {
  if (message.startsWith('BLE ') || message.startsWith('Invalid BLE ')) return false
  const lower = message.toLowerCase()
  return lower.includes('unexpected')
    || lower.includes('wrong handshake')
    || lower.includes('invalid handshake')
}

function boundedNoiseErrorTag(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown'
  if (error.message.startsWith('BLE ') || error.message.startsWith('Invalid BLE ')) {
    return error.message
  }
  const name = error.name.replace(/[^A-Za-z]/g, '').slice(0, 40)
  return name || 'library'
}

function isHandshakeFrameError(message: string): boolean {
  return message === 'Invalid BLE handshake frame'
    || message === 'Invalid BLE handshake frame metadata'
    || message === 'BLE handshake assembly limit reached'
    || message === 'BLE handshake fragment metadata mismatch'
    || message === 'BLE handshake duplicate fragment mismatch'
    || message === 'BLE handshake assembly exceeds declared length'
    || message === 'BLE handshake assembly length mismatch'
    || message === 'BLE handshake assembly is incomplete'
    || message === 'BLE Noise wire message length is invalid'
}

export class BleLinkManager {
  private readonly options: BleLinkManagerOptions
  private readonly links = new Map<string, LinkState>()
  private readonly preAuthRates = new Map<string, { startedAt: number; count: number }>()
  private readonly assembler = new HandshakeFrameAssembler()
  private readonly transportAssembler = new TransportFrameAssembler()
  private readonly stateQueues = new Map<string, Promise<unknown>>()
  private readonly pendingReceiveCounts = new Map<string, number>()
  private readonly sendQueues = new Map<string, Promise<boolean>>()
  private readonly deviceGenerations = new Map<string, number>()
  private pendingReceives = 0
  private generation = 0

  constructor(options: BleLinkManagerOptions) {
    this.options = options
  }

  async start(deviceId: string): Promise<boolean> {
    if (this.isAuthenticated(deviceId)) return true
    if (this.getRole(deviceId) === 'responder') return false
    this.remove(deviceId)
    const deviceGeneration = this.deviceGeneration(deviceId)
    const generation = this.generation
    const previous = this.stateQueues.get(deviceId) ?? Promise.resolve()
    const operation = previous
      .catch(() => {})
      .then(() => this.startOrdered(deviceId, generation, deviceGeneration))
    this.stateQueues.set(deviceId, operation)
    try {
      return await operation
    } finally {
      if (this.stateQueues.get(deviceId) === operation) {
        this.stateQueues.delete(deviceId)
      }
    }
  }

  private async startOrdered(
    deviceId: string,
    generation: number,
    deviceGeneration: number,
  ): Promise<boolean> {
    if (!this.isCurrent(deviceId, generation, deviceGeneration)) return false
    if (this.hasUnauthenticatedHandshake(deviceId) || this.links.size >= MAX_LINKS) {
      return false
    }
    this.options.onLinkStage?.(deviceId, 'handshaking')

    const state = await this.createState(
      deviceId,
      'initiator',
      createHandshakeId(),
      deviceGeneration,
    )
    if (!this.isCurrent(deviceId, generation, deviceGeneration)) {
      state.session.destroy()
      return false
    }
    this.links.set(deviceId, state)
    const outputs = await state.session.initialOutbound()
    if (
      !this.isCurrent(deviceId, generation, deviceGeneration)
      || this.links.get(deviceId) !== state
    ) {
      state.session.destroy()
      return false
    }
    const sent = await this.sendOutputs(state, outputs, 1)
    if (
      !this.isCurrent(deviceId, generation, deviceGeneration)
      || this.links.get(deviceId) !== state
    ) return false
    if (!sent) {
      log.warn(`Handshake step 1 send failed on ${deviceId.slice(0, 8)}...`)
      this.remove(deviceId)
      this.options.onLinkFailure?.(deviceId, 'handshake', 'handshake_send_failed')
    }
    return sent
  }

  async receive(deviceId: string, raw: Uint8Array): Promise<void> {
    const generation = this.generation
    const deviceGeneration = this.deviceGeneration(deviceId)
    const pendingForDevice = this.pendingReceiveCounts.get(deviceId) ?? 0
    if (
      raw.length === 0
      || raw.length > MAX_LINK_FRAME_BYTES
      || pendingForDevice >= MAX_PENDING_FRAMES_PER_DEVICE
      || this.pendingReceives >= MAX_PENDING_FRAMES
    ) return
    const encoded = raw.slice()
    this.pendingReceiveCounts.set(deviceId, pendingForDevice + 1)
    this.pendingReceives += 1
    const previous = this.stateQueues.get(deviceId) ?? Promise.resolve()
    const operation = previous
      .catch(() => {})
      .then(() => {
        if (!this.isCurrent(deviceId, generation, deviceGeneration)) return
        return this.receiveOrdered(
          deviceId,
          encoded,
          generation,
          deviceGeneration,
        )
      })
    this.stateQueues.set(deviceId, operation)
    try {
      await operation
    } finally {
      if (this.stateQueues.get(deviceId) === operation) {
        this.stateQueues.delete(deviceId)
      }
      if (generation === this.generation) {
        const remaining = (this.pendingReceiveCounts.get(deviceId) ?? 1) - 1
        if (remaining > 0) this.pendingReceiveCounts.set(deviceId, remaining)
        else this.pendingReceiveCounts.delete(deviceId)
        this.pendingReceives = Math.max(0, this.pendingReceives - 1)
      }
    }
  }

  private async receiveOrdered(
    deviceId: string,
    raw: Uint8Array,
    generation: number,
    deviceGeneration: number,
  ): Promise<void> {
    if (
      raw.length === 0
      || raw.length > MAX_LINK_FRAME_BYTES
      || !this.acceptRate(deviceId)
    ) return
    if (isRejectedProtocolVersion(raw)) {
      this.remove(deviceId)
      return
    }

    let processingState: LinkState | undefined
    try {
      if (isTransportFrame(raw)) {
        const state = this.links.get(deviceId)
        if (!state) return
        processingState = state
        if (!state.session.canReceiveTransport()) {
          throw new Error('BLE transport data arrived before Noise handshake completion')
        }
        const message = this.transportAssembler.accept(deviceId, raw)
        if (!message) return
        const outputs = await state.session.receiveWire(message)
        if (
          !this.isCurrent(deviceId, generation, deviceGeneration)
          || this.links.get(deviceId) !== state
        ) return
        this.notifySecure(state)
        const sent = await this.sendOutputs(state, outputs, 0)
        if (
          !this.isCurrent(deviceId, generation, deviceGeneration)
          || this.links.get(deviceId) !== state
        ) return
        if (!sent) {
          throw new Error('BLE transport response failed')
        }
        this.notifyAuthenticated(state)
        return
      }

      const live = this.links.get(deviceId)
      if (
        live
        && (
          live.authenticationNotified
          || live.session.hasAuthenticated()
          || live.session.canReceiveTransport()
          || live.session.isActive()
        )
      ) {
        return
      }

      if (raw.length <= BLE_HANDSHAKE_HEADER_BYTES) return
      const frame = decodeHandshakeFrame(raw)
      const message = this.assembler.accept(deviceId, raw)
      if (!message) return

      let state = this.links.get(deviceId)
      let replacedState: LinkState | null = null
      if (state && !sameHandshakeId(state.handshakeId, frame.handshakeId)) {
        if (
          frame.step !== 1
          || state.role !== 'initiator'
          || state.authenticationNotified
          || state.session.hasAuthenticated()
          || state.session.canReceiveTransport()
          || state.session.isActive()
          || compareHandshakeIds(state.handshakeId, frame.handshakeId) < 0
        ) return
        replacedState = state
        state = undefined
      } else if (state?.role === 'initiator' && frame.step === 1) {
        return
      }
      if (!state) {
        if (frame.step !== 1) return
        if (!this.acceptIncomingResponder(deviceId, frame.handshakeId)) return
        if (!replacedState && this.links.size >= MAX_LINKS) return
        state = await this.createState(
          deviceId,
          'responder',
          frame.handshakeId,
          deviceGeneration,
        )
        if (
          !this.isCurrent(deviceId, generation, deviceGeneration)
          || (replacedState && this.links.get(deviceId) !== replacedState)
        ) {
          state.session.destroy()
          return
        }
        if (replacedState) {
          replacedState.session.destroy()
          this.assembler.removePeer(deviceId)
          this.transportAssembler.removePeer(deviceId)
        }
        this.links.set(deviceId, state)
        this.options.onLinkStage?.(deviceId, 'handshaking')
      }
      processingState = state
      if (!sameHandshakeId(state.handshakeId, frame.handshakeId)) return
      if (Date.now() - state.startedAt > HANDSHAKE_TIMEOUT_MS) {
        log.warn(`Handshake timed out on ${deviceId.slice(0, 8)}... role=${state.role}`)
        this.remove(deviceId)
        this.options.onLinkFailure?.(deviceId, 'handshake', 'handshake_timeout')
        return
      }

      const outputs = await state.session.receiveWire(message)
      if (
        !this.isCurrent(deviceId, generation, deviceGeneration)
        || this.links.get(deviceId) !== state
      ) return
      this.options.onHandshakeProgress?.(
        deviceId,
        receivedHandshakeProgress(frame.step),
      )
      this.notifySecure(state)
      const sent = await this.sendOutputs(state, outputs, frame.step + 1)
      if (
        !this.isCurrent(deviceId, generation, deviceGeneration)
        || this.links.get(deviceId) !== state
      ) return
      if (!sent) {
        log.warn(`Handshake response send failed on ${deviceId.slice(0, 8)}... step=${frame.step + 1}`)
        throw new Error('BLE handshake response failed')
      }
      this.notifyAuthenticated(state)
    } catch (error) {
      if (
        !this.isCurrent(deviceId, generation, deviceGeneration)
        || (processingState && this.links.get(deviceId) !== processingState)
      ) return
      const state = processingState ?? this.links.get(deviceId)
      if (state) {
        this.failLink(state, error)
        return
      }
      this.remove(deviceId)
      this.options.onLinkFailure?.(
        deviceId,
        'handshake',
        classifyReceiveFailure(error, 'handshake'),
      )
    }
  }

  async send(deviceId: string, data: Uint8Array): Promise<boolean> {
    if (
      data.length === 0
      || data.length > BLE_SECURE_LINK_PAYLOAD_BYTES
      || !this.links.get(deviceId)?.session.isActive()
    ) {
      return false
    }
    const payload = data.slice()
    const deviceGeneration = this.deviceGeneration(deviceId)
    const previous = this.sendQueues.get(deviceId) ?? Promise.resolve(true)
    const operation = previous
      .catch(() => false)
      .then(() => this.sendOrdered(deviceId, payload, deviceGeneration))
    this.sendQueues.set(deviceId, operation)
    try {
      return await operation
    } finally {
      if (this.sendQueues.get(deviceId) === operation) {
        this.sendQueues.delete(deviceId)
      }
    }
  }

  private async sendOrdered(
    deviceId: string,
    data: Uint8Array,
    deviceGeneration: number,
  ): Promise<boolean> {
    const generation = this.generation
    if (!this.isCurrent(deviceId, generation, deviceGeneration)) return false
    const state = this.links.get(deviceId)
    if (!state?.session.isActive() || data.length > BLE_SECURE_LINK_PAYLOAD_BYTES) {
      return false
    }
    try {
      const outputs = await state.session.send(data)
      if (
        !this.isCurrent(deviceId, generation, deviceGeneration)
        || this.links.get(deviceId) !== state
      ) return false
      const sent = await this.sendOutputs(state, outputs, 0)
      if (
        !this.isCurrent(deviceId, generation, deviceGeneration)
        || this.links.get(deviceId) !== state
      ) return false
      if (!sent) {
        this.failLink(state, new Error('BLE transport response failed'))
      }
      return sent
    } catch (error) {
      if (!this.isCurrent(deviceId, generation, deviceGeneration)) return false
      const state = this.links.get(deviceId)
      if (state) this.failLink(state, error)
      else {
        this.remove(deviceId)
        this.options.onLinkFailure?.(deviceId, 'transport', 'transport_failed')
      }
      return false
    }
  }

  isAuthenticated(deviceId: string): boolean {
    return this.links.get(deviceId)?.session.isActive() ?? false
  }

  hasUnauthenticatedHandshake(exceptDeviceId?: string): boolean {
    for (const [deviceId, state] of this.links) {
      if (deviceId === exceptDeviceId) continue
      if (!state.session.isActive()) return true
    }
    return false
  }

  hasUnauthenticatedResponder(exceptDeviceId?: string): boolean {
    for (const [deviceId, state] of this.links) {
      if (deviceId === exceptDeviceId) continue
      if (state.role === 'responder' && !state.session.isActive()) return true
    }
    return false
  }

  getAuthenticatedIdentity(deviceId: string): BleLinkPeerIdentity | null {
    const state = this.links.get(deviceId)
    if (!state?.session.isActive() || !state.remoteIdentityId) return null
    return {
      identityId: state.remoteIdentityId,
      knownContact: state.knownContact,
    }
  }

  getRole(deviceId: string): 'initiator' | 'responder' | null {
    return this.links.get(deviceId)?.role ?? null
  }

  isCurrentAuthenticatedLink(options: {
    deviceId: string
    identityId: string
    role: 'initiator' | 'responder'
    linkGeneration: number
  }): boolean {
    const state = this.links.get(options.deviceId)
    return state?.deviceGeneration === options.linkGeneration
      && state.role === options.role
      && state.remoteIdentityId === options.identityId
      && state.session.isActive()
  }

  getDevicesForIdentity(identityId: string): string[] {
    const deviceIds: string[] = []
    for (const state of this.links.values()) {
      if (state.session.isActive() && state.remoteIdentityId === identityId) {
        deviceIds.push(state.deviceId)
      }
    }
    return deviceIds
  }

  remove(deviceId: string): void {
    this.links.get(deviceId)?.session.destroy()
    this.links.delete(deviceId)
    this.assembler.removePeer(deviceId)
    this.transportAssembler.removePeer(deviceId)
    this.deviceGenerations.set(
      deviceId,
      this.deviceGeneration(deviceId) + 1,
    )
  }

  cleanup(now: number = Date.now()): void {
    this.assembler.cleanup(now)
    this.transportAssembler.cleanup(now)
    for (const [deviceId, rate] of this.preAuthRates) {
      if (
        !this.links.has(deviceId)
        && now - rate.startedAt >= RATE_WINDOW_MS
      ) this.preAuthRates.delete(deviceId)
    }
    for (const [deviceId, state] of this.links) {
      if (!state.session.isActive() && now - state.startedAt > HANDSHAKE_TIMEOUT_MS) {
        log.warn(`Handshake cleanup timeout on ${deviceId.slice(0, 8)}... role=${state.role}`)
        if (state.authenticationNotified || state.session.hasAuthenticated()) {
          this.failLink(state, new Error('BLE Noise link is not active'))
        } else {
          this.remove(deviceId)
          this.options.onLinkFailure?.(deviceId, 'handshake', 'handshake_timeout')
        }
      }
    }
  }

  reset(): void {
    this.generation += 1
    for (const state of this.links.values()) state.session.destroy()
    this.links.clear()
    this.preAuthRates.clear()
    this.assembler.reset()
    this.transportAssembler.reset()
    this.stateQueues.clear()
    this.pendingReceiveCounts.clear()
    this.sendQueues.clear()
    this.deviceGenerations.clear()
    this.pendingReceives = 0
  }

  private acceptIncomingResponder(deviceId: string, handshakeId: Uint8Array): boolean {
    const aborted: string[] = []
    for (const [id, link] of this.links) {
      if (id === deviceId || link.role !== 'initiator' || link.session.isActive()) continue
      if (compareHandshakeIds(link.handshakeId, handshakeId) < 0) return false
      aborted.push(id)
    }
    for (const id of aborted) this.remove(id)
    if (aborted.length > 0) this.options.onAbortCompetingInitiators?.(aborted)
    return true
  }

  private async createState(
    deviceId: string,
    role: 'initiator' | 'responder',
    handshakeId: Uint8Array,
    deviceGeneration: number,
  ): Promise<LinkState> {
    let state!: LinkState
    const session = await BleNoiseLinkSession.create({
      role,
      staticKeyPair: this.options.staticKeyPair,
      credential: this.options.credential,
      verifier: {
        verify: async (credential, remoteStaticKey) => {
          const identity = await this.options.verifyCredential(
            deviceId,
            credential,
            remoteStaticKey,
          )
          if (!identity) return false
          state.remoteIdentityId = identity.identityId
          state.knownContact = identity.knownContact
          return true
        },
      },
      onPlaintext: async (data) => {
        if (!state.remoteIdentityId) {
          throw new Error('BLE Noise remote identity is unavailable')
        }
        await this.options.onSecureData(deviceId, state.remoteIdentityId, data)
      },
      onFailure: (error) => {
        const current = state
        if (!current || this.links.get(deviceId) !== current || current.failureNotified) {
          return
        }
        const previous = this.stateQueues.get(deviceId) ?? Promise.resolve()
        const operation = previous
          .catch(() => {})
          .then(() => {
            if (this.links.get(deviceId) !== current || current.failureNotified) return
            this.failLink(current, error)
          })
        this.stateQueues.set(deviceId, operation)
      },
    })
    state = {
      deviceId,
      deviceGeneration,
      role,
      handshakeId: handshakeId.slice(),
      session,
      startedAt: Date.now(),
      remoteIdentityId: null,
      knownContact: false,
      rateWindowStartedAt: Date.now(),
      rateCount: 0,
      secureNotified: false,
      authenticationNotified: false,
      failureNotified: false,
    }
    return state
  }

  private failLink(state: LinkState, error: unknown): void {
    if (state.failureNotified) return
    state.failureNotified = true
    const authenticated = state.authenticationNotified || state.session.hasAuthenticated()
    const preliminary = authenticated
      ? 'transport'
      : state.session.canReceiveTransport()
        ? 'authentication'
        : 'handshake'
    const cause = classifyReceiveFailure(error, preliminary)
    const stage = authenticated
      ? 'transport'
      : cause === 'credential_rejected'
        ? 'authentication'
        : 'handshake'
    log.warn(
      `Link failed on ${state.deviceId.slice(0, 8)}... stage=${stage} cause=${cause} err=${boundedNoiseErrorTag(error)}`,
    )
    this.remove(state.deviceId)
    this.options.onLinkFailure?.(state.deviceId, stage, cause)
  }

  private async sendOutputs(
    state: LinkState,
    outputs: BleNoiseOutbound[],
    handshakeStep: number,
  ): Promise<boolean> {
    for (const output of outputs) {
      if (this.deviceGeneration(state.deviceId) !== state.deviceGeneration) {
        return false
      }
      const frames = output.kind === 'handshake'
        ? encodeHandshakeFrames({
          handshakeId: state.handshakeId,
          step: handshakeStep,
          message: output.data,
          mtu: this.frameBudget(state.deviceId),
        })
        : encodeTransportFrames({
          message: output.data,
          maxFrameBytes: this.frameBudget(state.deviceId),
        })
      if (!(await this.options.sendRaw(state.deviceId, frames))) return false
      if (
        this.deviceGeneration(state.deviceId) !== state.deviceGeneration
        || this.links.get(state.deviceId) !== state
      ) return false
      if (output.kind === 'handshake') {
        const progress = sentHandshakeProgress(handshakeStep)
        if (progress) {
          this.options.onHandshakeProgress?.(state.deviceId, progress)
        }
      }
    }
    return true
  }

  private notifyAuthenticated(state: LinkState): void {
    if (
      state.authenticationNotified
      || !state.session.isActive()
      || !state.remoteIdentityId
    ) {
      return
    }
    state.authenticationNotified = true
    this.notifySecure(state)
    this.options.onHandshakeProgress?.(
      state.deviceId,
      'credential_authenticated',
    )
    this.options.onLinkStage?.(state.deviceId, 'authenticated')
    this.options.onAuthenticated?.({
      deviceId: state.deviceId,
      identityId: state.remoteIdentityId,
      knownContact: state.knownContact,
      role: state.role,
      linkGeneration: state.deviceGeneration,
    })
  }

  private notifySecure(state: LinkState): void {
    if (state.secureNotified || !state.session.canReceiveTransport()) return
    state.secureNotified = true
    this.options.onHandshakeProgress?.(state.deviceId, 'transport_keys_ready')
    this.options.onLinkStage?.(state.deviceId, 'secure')
  }

  private acceptRate(deviceId: string): boolean {
    const state = this.links.get(deviceId)
    const now = Date.now()
    if (!state) {
      let rate = this.preAuthRates.get(deviceId)
      if (!rate) {
        if (this.preAuthRates.size >= MAX_PRE_AUTH_RATE_PEERS) {
          let oldestId: string | null = null
          let oldestStartedAt = Number.POSITIVE_INFINITY
          for (const [candidateId, candidate] of this.preAuthRates) {
            if (candidate.startedAt < oldestStartedAt) {
              oldestId = candidateId
              oldestStartedAt = candidate.startedAt
            }
          }
          if (oldestId) this.preAuthRates.delete(oldestId)
        }
        rate = { startedAt: now, count: 0 }
      }
      if (now - rate.startedAt >= RATE_WINDOW_MS) {
        rate.startedAt = now
        rate.count = 0
      }
      rate.count += 1
      this.preAuthRates.set(deviceId, rate)
      return rate.count <= PRE_AUTH_RATE_BURST
    }
    if (now - state.rateWindowStartedAt >= RATE_WINDOW_MS) {
      state.rateWindowStartedAt = now
      state.rateCount = 0
    }
    state.rateCount += 1
    return state.rateCount <= AUTHENTICATED_RATE_BURST
  }

  private frameBudget(deviceId: string): number {
    const configured = this.options.maxFrameBytes?.(deviceId)
    if (
      typeof configured !== 'number'
      || !Number.isInteger(configured)
      || configured < 1
      || configured > 512
    ) {
      return BLE_FALLBACK_VALUE_BYTES
    }
    return configured
  }

  private deviceGeneration(deviceId: string): number {
    return this.deviceGenerations.get(deviceId) ?? 0
  }

  private isCurrent(
    deviceId: string,
    generation: number,
    deviceGeneration: number,
  ): boolean {
    return generation === this.generation
      && deviceGeneration === this.deviceGeneration(deviceId)
  }
}

export { BLE_SECURE_LINK_PAYLOAD_BYTES }
