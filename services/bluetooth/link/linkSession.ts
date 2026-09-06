/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import {
  noise,
  pureJsCrypto,
  type ICryptoInterface,
} from '@chainsafe/libp2p-noise'
import { generateKeyPair } from '@libp2p/crypto/keys'
import { AbstractMessageStream, type SendResult } from '@libp2p/utils'
import type {
  MessageStream,
  SecuredConnection,
} from '@libp2p/interface'
import { Uint8ArrayList } from 'uint8arraylist'
import {
  BLE_NOISE_XX_PROTOCOL_NAME,
  createBleNoiseXXPrologue,
} from '@spectra/core-crypto'
import { BLE_FALLBACK_VALUE_BYTES } from '../types'
import { BLE_TRANSPORT_HEADER_BYTES } from './transportFrames'

const PROGRESS_TIMEOUT_MS = 20_000
const MAX_NOISE_WIRE_BYTES = 8 * 1024
const NOISE_TRANSPORT_OVERHEAD_BYTES = 18
const MAX_PENDING_AUTH_PLAINTEXTS = 8
const MAX_PENDING_AUTH_BYTES = 16 * 1024
const CREDENTIAL_LENGTH_SLOP = 256

function ensurePromiseWithResolvers(): void {
  const promiseConstructor = Promise as unknown as {
    withResolvers?: <T>() => {
      promise: Promise<T>
      resolve: (value: T | PromiseLike<T>) => void
      reject: (reason?: unknown) => void
    }
  }
  if (promiseConstructor.withResolvers) return
  Object.defineProperty(promiseConstructor, 'withResolvers', {
    configurable: true,
    value: <T>() => {
      let resolve!: (value: T | PromiseLike<T>) => void
      let reject!: (reason?: unknown) => void
      const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise
        reject = rejectPromise
      })
      return { promise, resolve, reject }
    },
  })
}

export interface BleLinkStaticKeyPair {
  publicKey: Uint8Array
  privateKey: Uint8Array
}

export interface BleLinkCredentialVerifier {
  verify(credential: Uint8Array, remoteStaticKey: Uint8Array): Promise<boolean>
}

export interface BleNoiseOutbound {
  kind: 'handshake' | 'transport'
  data: Uint8Array
}

type LinkRole = 'initiator' | 'responder'
type SessionState = 'handshaking' | 'authenticating' | 'active' | 'failed'

const NOOP_LOGGER = {
  enabled: false,
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  newScope() {
    return this
  },
}

const COMPONENT_LOGGER = {
  forComponent: () => NOOP_LOGGER,
}

class BleRawMessageStream extends AbstractMessageStream {
  constructor(
    direction: LinkRole,
    private readonly onOutbound: (data: Uint8Array) => void,
  ) {
    super({
      log: NOOP_LOGGER as never,
      direction: direction === 'initiator' ? 'outbound' : 'inbound',
      maxReadBufferLength: MAX_NOISE_WIRE_BYTES,
      maxWriteBufferLength: MAX_NOISE_WIRE_BYTES,
      maxMessageSize: MAX_NOISE_WIRE_BYTES,
    })
  }

  ingest(data: Uint8Array): void {
    if (data.length === 0 || data.length > MAX_NOISE_WIRE_BYTES) {
      throw new Error('BLE Noise wire message length is invalid')
    }
    this.onData(data)
  }

  sendData(data: Uint8ArrayList): SendResult {
    const bytes = data.subarray()
    if (bytes.length === 0 || bytes.length > MAX_NOISE_WIRE_BYTES) {
      throw new Error('BLE Noise wire message length is invalid')
    }
    this.onOutbound(bytes)
    return { sentBytes: bytes.length, canSendMore: true }
  }

  sendReset(): void {}
  sendPause(): void {}
  sendResume(): void {}

  async close(): Promise<void> {
    this.onTransportClosed()
  }
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false
  let diff = 0
  for (let index = 0; index < left.length; index += 1) {
    diff |= left[index] ^ right[index]
  }
  return diff === 0
}

function createObservedCrypto(
  role: LinkRole,
  localStaticPrivateKey: Uint8Array,
  onRemoteStatic: (key: Uint8Array) => void,
): ICryptoInterface {
  let dhCall = 0
  return {
    ...pureJsCrypto,
    generateX25519SharedKey(privateKey, publicKey) {
      dhCall += 1
      const captureAt = role === 'initiator' ? 2 : 3
      if (dhCall === captureAt) {
        onRemoteStatic(
          publicKey instanceof Uint8Array ? publicKey.slice() : publicKey.subarray(),
        )
      }
      return pureJsCrypto.generateX25519SharedKey(privateKey, publicKey)
    },
    generateX25519KeyPairFromSeed(seed) {
      const pair = pureJsCrypto.generateX25519KeyPairFromSeed(seed)
      if (
        bytesEqual(seed, localStaticPrivateKey)
        && !bytesEqual(pair.privateKey, localStaticPrivateKey)
      ) {
        throw new Error('BLE Noise implementation changed the static private key')
      }
      return pair
    },
  }
}

export class BleNoiseLinkSession {
  private readonly role: LinkRole
  private readonly staticKeyPair: BleLinkStaticKeyPair
  private readonly credential: Uint8Array
  private readonly verifier: BleLinkCredentialVerifier
  private readonly onPlaintext: (data: Uint8Array) => Promise<void> | void
  private readonly onFailure: ((error: Error) => void) | null
  private readonly outbound: BleNoiseOutbound[] = []
  private readonly progressWaiters = new Set<() => void>()
  private decryptQueue: Promise<void> = Promise.resolve()
  private readonly pendingAuthPlaintexts: Uint8Array[] = []
  private pendingAuthBytes = 0
  private rawStream: BleRawMessageStream | null = null
  private secured: SecuredConnection | null = null
  private remoteStaticKey: Uint8Array | null = null
  private state: SessionState = 'handshaking'
  private reachedActive = false
  private initializePromise: Promise<void> | null = null
  private failure: unknown = null

  private constructor(options: {
    role: LinkRole
    staticKeyPair: BleLinkStaticKeyPair
    credential: Uint8Array
    verifier: BleLinkCredentialVerifier
    onPlaintext: (data: Uint8Array) => Promise<void> | void
    onFailure?: (error: Error) => void
  }) {
    if (
      options.staticKeyPair.publicKey.length !== 32
      || options.staticKeyPair.privateKey.length !== 32
    ) {
      throw new Error('BLE Noise static key must be 32 bytes')
    }
    this.role = options.role
    this.staticKeyPair = {
      publicKey: options.staticKeyPair.publicKey.slice(),
      privateKey: options.staticKeyPair.privateKey.slice(),
    }
    this.credential = options.credential.slice()
    this.verifier = options.verifier
    this.onPlaintext = options.onPlaintext
    this.onFailure = options.onFailure ?? null
  }

  static async create(options: {
    role: LinkRole
    staticKeyPair: BleLinkStaticKeyPair
    credential: Uint8Array
    verifier: BleLinkCredentialVerifier
    onPlaintext: (data: Uint8Array) => Promise<void> | void
    onFailure?: (error: Error) => void
  }): Promise<BleNoiseLinkSession> {
    const session = new BleNoiseLinkSession(options)
    await session.initialize()
    return session
  }

  async initialOutbound(): Promise<BleNoiseOutbound[]> {
    if (this.role === 'initiator' && this.outbound.length === 0) {
      await this.waitForProgress()
    }
    return this.drainOutbound()
  }

  async receiveWire(data: Uint8Array): Promise<BleNoiseOutbound[]> {
    if (this.state === 'failed' || !this.rawStream) {
      throw this.failure instanceof Error
        ? this.failure
        : new Error('BLE Noise link is not available')
    }
    const previousOutbound = this.outbound.length
    const previousState = this.state
    this.rawStream.ingest(data)
    if (this.outbound.length === previousOutbound && this.state === previousState) {
      await this.waitForProgress()
    }
    await this.decryptQueue.catch(() => {})
    if ((this.state as SessionState) === 'failed') {
      throw this.failure instanceof Error
        ? this.failure
        : new Error('BLE Noise link failed')
    }
    return this.drainOutbound()
  }

  async send(plaintext: Uint8Array): Promise<BleNoiseOutbound[]> {
    if (!this.secured || this.state !== 'active') {
      throw new Error('BLE Noise link is not active')
    }
    if (plaintext.length === 0 || plaintext.length > BLE_SECURE_LINK_PAYLOAD_BYTES) {
      throw new Error('BLE Noise plaintext length is invalid')
    }
    this.secured.connection.send(plaintext)
    return this.drainOutbound()
  }

  isActive(): boolean {
    return this.state === 'active'
  }

  hasAuthenticated(): boolean {
    return this.reachedActive
  }

  canReceiveTransport(): boolean {
    return this.state === 'authenticating' || this.state === 'active'
  }

  destroy(): void {
    this.state = 'failed'
    this.rawStream?.abort(new Error('BLE Noise link closed'))
    this.rawStream = null
    this.secured?.connection.abort(new Error('BLE Noise link closed'))
    this.secured = null
    this.staticKeyPair.privateKey.fill(0)
    this.staticKeyPair.publicKey.fill(0)
    this.credential.fill(0)
    this.remoteStaticKey?.fill(0)
    this.remoteStaticKey = null
    this.outbound.length = 0
    this.pendingAuthPlaintexts.length = 0
    this.pendingAuthBytes = 0
    this.signalProgress()
  }

  private async initialize(): Promise<void> {
    if (this.initializePromise) return this.initializePromise
    this.initializePromise = this.runNoise().catch((error) => {
      this.failure = error
      this.state = 'failed'
      this.signalProgress()
    })
    await Promise.race([
      this.waitForProgress(),
      this.initializePromise,
    ])
    if ((this.state as SessionState) === 'failed') {
      throw this.failure instanceof Error
        ? this.failure
        : new Error('BLE Noise link initialization failed')
    }
  }

  private async runNoise(): Promise<void> {
    ensurePromiseWithResolvers()
    const identityKey = await generateKeyPair('Ed25519')
    const crypto = createObservedCrypto(
      this.role,
      this.staticKeyPair.privateKey,
      (key) => {
        this.remoteStaticKey = key
      },
    )
    this.rawStream = new BleRawMessageStream(this.role, (data) => {
      this.outbound.push({
        kind: this.secured ? 'transport' : 'handshake',
        data: data.slice(),
      })
      this.signalProgress()
    })
    this.signalProgress()
    const encrypter = noise({
      staticNoiseKey: this.staticKeyPair.privateKey,
      prologueBytes: createBleNoiseXXPrologue(),
      crypto,
    })({
      peerId: null as never,
      privateKey: identityKey,
      logger: COMPONENT_LOGGER as never,
      upgrader: { getStreamMuxers: () => new Map() } as never,
    })
    if (BLE_NOISE_XX_PROTOCOL_NAME !== 'Noise_XX_25519_ChaChaPoly_SHA256') {
      throw new Error('BLE Noise protocol suite is invalid')
    }

    this.secured = this.role === 'initiator'
      ? await encrypter.secureOutbound(this.rawStream as MessageStream, {
        skipStreamMuxerNegotiation: true,
      })
      : await encrypter.secureInbound(this.rawStream as MessageStream, {
        skipStreamMuxerNegotiation: true,
      })
    if (!this.remoteStaticKey) {
      throw new Error('BLE Noise remote static key is unavailable')
    }
    this.state = 'authenticating'
    this.secured.connection.addEventListener('message', (event) => {
      this.enqueueDecrypted(event.data.subarray())
    })
    this.secured.connection.send(this.credential)
    this.signalProgress()
  }

  private enqueueDecrypted(data: Uint8Array): void {
    this.decryptQueue = this.decryptQueue
      .catch(() => {})
      .then(() => this.handleDecryptedMessage(data))
    void this.decryptQueue
  }

  private async handleDecryptedMessage(data: Uint8Array): Promise<void> {
    try {
      if (this.state === 'authenticating') {
        if (
          this.remoteStaticKey
          && await this.verifier.verify(data, this.remoteStaticKey)
        ) {
          if (this.state !== 'authenticating') return
          this.state = 'active'
          this.reachedActive = true
          this.signalProgress()
          await this.flushPendingAuthPlaintexts()
          return
        }
        if (this.state !== 'authenticating') return
        if (this.looksLikeCredential(data)) {
          throw new Error('BLE Noise identity credential verification failed')
        }
        this.bufferPendingAuthPlaintext(data)
        return
      }
      if (this.state !== 'active') {
        throw new Error('BLE Noise received data before authentication')
      }
      await this.onPlaintext(data)
      this.signalProgress()
    } catch (error) {
      if (this.state === 'failed') return
      this.failure = error instanceof Error ? error : new Error('BLE Noise link failed')
      this.destroy()
      this.onFailure?.(
        this.failure instanceof Error ? this.failure : new Error('BLE Noise link failed'),
      )
    }
  }

  private looksLikeCredential(data: Uint8Array): boolean {
    return Math.abs(data.length - this.credential.length) <= CREDENTIAL_LENGTH_SLOP
  }

  private bufferPendingAuthPlaintext(data: Uint8Array): void {
    if (
      this.pendingAuthPlaintexts.length >= MAX_PENDING_AUTH_PLAINTEXTS
      || this.pendingAuthBytes + data.length > MAX_PENDING_AUTH_BYTES
    ) {
      throw new Error('BLE Noise received data before authentication')
    }
    this.pendingAuthPlaintexts.push(data.slice())
    this.pendingAuthBytes += data.length
  }

  private async flushPendingAuthPlaintexts(): Promise<void> {
    const pending = this.pendingAuthPlaintexts.splice(0)
    this.pendingAuthBytes = 0
    for (const data of pending) {
      if (this.state !== 'active') return
      await this.onPlaintext(data)
    }
  }

  private drainOutbound(): BleNoiseOutbound[] {
    return this.outbound.splice(0, this.outbound.length)
  }

  private signalProgress(): void {
    for (const resolve of this.progressWaiters) resolve()
    this.progressWaiters.clear()
  }

  private waitForProgress(): Promise<void> {
    if (this.state === 'failed') {
      return Promise.reject(
        this.failure instanceof Error ? this.failure : new Error('BLE Noise link failed'),
      )
    }
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.progressWaiters.delete(onProgress)
        reject(new Error('BLE Noise link progress timed out'))
      }, PROGRESS_TIMEOUT_MS)
      const onProgress = () => {
        clearTimeout(timeout)
        resolve()
      }
      this.progressWaiters.add(onProgress)
    })
  }
}

export const BLE_NOISE_SUITE = BLE_NOISE_XX_PROTOCOL_NAME
export const BLE_SECURE_LINK_PAYLOAD_BYTES =
  BLE_FALLBACK_VALUE_BYTES - BLE_TRANSPORT_HEADER_BYTES - NOISE_TRANSPORT_OVERHEAD_BYTES
