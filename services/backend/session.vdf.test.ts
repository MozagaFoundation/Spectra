/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

;(globalThis as typeof globalThis & { __DEV__?: boolean }).__DEV__ = false

const mocks = vi.hoisted(() => {
  const authState = {
    isAuthenticated: true,
    isCloudAuthVerified: false,
    isIdentityBound: false,
    session: null as any,
    secureAccess: {
      phase: 'idle' as string,
      failure: null as string | null,
      retryable: false,
    },
    clearCloudSession: vi.fn(async () => {
      authState.session = null
    }),
    setCloudAuthVerified: vi.fn((verified: boolean) => {
      authState.isCloudAuthVerified = verified
    }),
    setIdentityBound: vi.fn((bound: boolean) => {
      authState.isIdentityBound = bound
    }),
    setSecureAccess: vi.fn((state: {
      phase: string
      failure: string | null
      retryable: boolean
    }) => {
      authState.secureAccess = state
    }),
    setSession: vi.fn(async (session: any) => {
      authState.session = session
    }),
  }

  return {
    authState,
    requestChallenge: vi.fn(),
    verifyChallenge: vi.fn(),
    bindPrivateIdentity: vi.fn(),
    getPublicKeyBundle: vi.fn(),
    storePublicKeyBundle: vi.fn(),
    solve: vi.fn(),
    wait: vi.fn(),
    retry: vi.fn(),
    signWalletAuthorization: vi.fn(() => ({
      payload: { walletAddress: 'exo1vdfwallet' },
      signature: 'wallet-signature',
    })),
    verifyBundle: vi.fn(() => ({ valid: true })),
    verifyWalletAuthorization: vi.fn(() => ({ valid: true })),
  }
})

vi.mock('@react-native-community/netinfo', () => ({
  default: {
    fetch: vi.fn(async () => ({ isConnected: true, isInternetReachable: true })),
  },
}))
vi.mock('@/lib/accountScope', () => ({
  isSameAccountStorageScope: (left?: string | null, right?: string | null) => (
    left?.toLowerCase() === right?.toLowerCase()
  ),
}))
vi.mock('@spectra/core-crypto/client/identity', () => ({
  loadIdentityByAddress: vi.fn(async () => null),
}))
vi.mock('@spectra/core-crypto', () => ({
  deriveRecipientMailboxToken: vi.fn(() => 'smbx1.private-mailbox'),
  signPublicKeyBundleWalletAuthorization: mocks.signWalletAuthorization,
  verifyPublicKeyBundle: mocks.verifyBundle,
  verifyPublicKeyBundleWalletAuthorization: mocks.verifyWalletAuthorization,
}))
vi.mock('@spectra/core-crypto/storage/local', () => ({
  localChatStorage: {
    getPublicKeyBundle: mocks.getPublicKeyBundle,
    storePublicKeyBundle: mocks.storePublicKeyBundle,
  },
}))
vi.mock('@/services/backend/auth', () => ({
  BACKEND_AUTH_SESSION_METADATA_VERSION: 4,
  bindPrivateChatIdentityWithBackend: mocks.bindPrivateIdentity,
  refreshBackendSession: vi.fn(),
  requestWalletAuthChallengeWithBackend: mocks.requestChallenge,
  verifyWalletAuthChallengeWithBackend: mocks.verifyChallenge,
}))
vi.mock('@/services/backend/client', () => ({
  isSpectraBackendConfigured: () => true,
  registerBackendIdentityRecovery: vi.fn(),
  SpectraBackendError: class SpectraBackendError extends Error {
    constructor(
      readonly status: number = 0,
      readonly code: string | null = null,
    ) {
      super(code ?? `backend ${status}`)
    }
  },
}))
vi.mock('@/services/security/nativeVdf', () => ({
  solveVdfOnDevice: mocks.solve,
}))
vi.mock('@/services/tor/torStore', () => ({
  useTorStore: {
    getState: () => ({ enabled: false, status: 'disconnected' }),
  },
}))
vi.mock('@spectra/identity-vault', () => ({
  signMessage: vi.fn(async () => 'signature'),
}))
vi.mock('@/store/authStore', () => ({
  useAuthStore: {
    getState: () => mocks.authState,
  },
}))
vi.mock('@/store/walletStore', () => ({
  useWalletStore: {
    getState: () => ({
      isVaultUnlocked: true,
      wallet: {
        address: 'exo1vdfwallet',
        publicKey: 'public-key',
        privateKey: 'private-key',
      },
    }),
  },
}))
vi.mock('./vdfChallengeTiming', () => ({
  waitForVdfChallengeAge: mocks.wait,
  retryVdfSubmissionAfterServerFloor: mocks.retry,
}))

const {
  ensureBackendSession,
  ensureBoundBackendAccessForIdentity,
  ensureVerifiedBackendAccess,
  ensureVerifiedBackendAccessForIdentity,
  getBackendAdmissionOutcome,
  invalidateAuthCaches,
  repairBackendIdentityBinding,
  resetAuthCooldowns,
} = await import('./session')
const { subscribeToVdfActivity } = await import('../shared/vdfActivity')

describe('wallet admission VDF activity', () => {
  let unsubscribe: (() => void) | null = null

  afterEach(() => {
    vi.useRealTimers()
    unsubscribe?.()
    unsubscribe = null
    invalidateAuthCaches()
    mocks.authState.session = null
    mocks.authState.isCloudAuthVerified = false
    mocks.authState.isIdentityBound = false
    mocks.requestChallenge.mockReset()
    mocks.verifyChallenge.mockReset()
    mocks.bindPrivateIdentity.mockReset()
    mocks.getPublicKeyBundle.mockReset()
    mocks.storePublicKeyBundle.mockReset()
    mocks.solve.mockReset()
    mocks.wait.mockReset()
    mocks.retry.mockReset()
    mocks.signWalletAuthorization.mockClear()
    mocks.verifyBundle.mockClear()
    mocks.verifyWalletAuthorization.mockClear()
  })

  it('reports the complete admission lifecycle while preserving the proof boundary', async () => {
    mocks.requestChallenge.mockResolvedValue({
      challenge: 'wallet-challenge',
      vdfChallenge: {
        challengeId: 'vdfc1.challenge',
        nonceHex: 'ab'.repeat(32),
        bindingHash: 'cd'.repeat(32),
        expiresAt: Date.now() + 60_000,
        notBeforeAt: Date.now() + 15_000,
        params: {
          algorithm: 'wesolowski-rsa-v1',
          domain: 'spectra.discovery.vdf.v1',
          parameterId: 'test-v1',
          modulusHex: 'a'.repeat(512),
          iterations: 200_000,
        },
      },
    })
    mocks.solve.mockImplementation(async (_params: unknown, _input: unknown, options: {
      onProgress?: (progress: { phase: 'evaluate' | 'prove'; completedIterations: number; totalIterations: number }) => void
    }) => {
      options.onProgress?.({
        phase: 'evaluate',
        completedIterations: 100,
        totalIterations: 400_000,
      })
      options.onProgress?.({
        phase: 'prove',
        completedIterations: 400_000,
        totalIterations: 400_000,
      })
      return { outputHex: '01', proofHex: '02' }
    })
    mocks.wait.mockImplementation(async (
      notBeforeAt: number,
      _signal: AbortSignal | undefined,
      onWaiting?: (at: number, retrying: boolean) => void,
    ) => {
      onWaiting?.(notBeforeAt, false)
    })
    mocks.retry.mockImplementation(async (submit: () => Promise<unknown>) => await submit())
    mocks.verifyChallenge.mockResolvedValue({
      verified: true,
      session: {
        exoAddress: 'exo1vdfwallet',
        identityId: null,
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: Date.now() + 3_600_000,
        metadataVersion: 4,
      },
    })

    const eventTypes: string[] = []
    unsubscribe = subscribeToVdfActivity((event) => eventTypes.push(event.type))

    await expect(ensureBackendSession()).resolves.toMatchObject({
      exoAddress: 'exo1vdfwallet',
      accessToken: 'access-token',
    })

    expect(eventTypes).toEqual([
      'started',
      'progress',
      'progress',
      'waiting_for_server',
      'waiting_for_server',
      'submitting',
      'completed',
    ])
    expect(mocks.verifyChallenge).toHaveBeenCalledWith(expect.objectContaining({
      vdfChallengeId: 'vdfc1.challenge',
    }))
  })

  it('binds the local identity before issuing exact chat access', async () => {
    mocks.authState.session = {
      exoAddress: 'exo1vdfwallet',
      identityId: null,
      accessToken: 'wallet-access-token',
      refreshToken: 'wallet-refresh-token',
      expiresAt: Date.now() + 3_600_000,
      metadataVersion: 4,
    }
    mocks.authState.isCloudAuthVerified = true
    mocks.getPublicKeyBundle.mockResolvedValue({
      identityId: 'local-chat-identity',
      identityKey: 'identity-key',
      mlkemIdentityKey: 'mlkem-key',
      dilithiumKey: 'dilithium-key',
      signedPreKey: { id: 1 },
      oneTimePreKeys: [{ id: 2 }],
      version: 1,
      timestamp: 1,
      metadataCapabilities: {
        version: 1,
        mailboxTokens: ['legacy_v1'],
        sealedControl: [],
        publishedAt: 1,
      },
      capabilitiesSignature: 'capabilities-signature',
      walletAuthorization: {
        payload: { walletAddress: 'exo1vdfwallet' },
      },
    })
    mocks.bindPrivateIdentity.mockResolvedValue(true)
    mocks.requestChallenge.mockResolvedValue({ challenge: 'identity-bind-challenge' })
    mocks.verifyChallenge.mockResolvedValue({
      verified: true,
      session: {
        exoAddress: 'exo1vdfwallet',
        identityId: 'local-chat-identity',
        accessToken: 'identity-access-token',
        refreshToken: 'identity-refresh-token',
        expiresAt: Date.now() + 3_600_000,
        metadataVersion: 4,
      },
    })

    await expect(
      ensureBoundBackendAccessForIdentity('local-chat-identity'),
    ).resolves.toMatchObject({
      identityId: 'local-chat-identity',
      accessToken: 'identity-access-token',
    })

    expect(mocks.bindPrivateIdentity).toHaveBeenCalledWith(
      expect.objectContaining({
        identityId: 'local-chat-identity',
        recipientMailboxToken: 'smbx1.private-mailbox',
        bundle: expect.objectContaining({
          oneTimePreKeys: [],
          metadataCapabilities: {
            version: 1,
            mailboxTokens: ['legacy_v1'],
            sealedControl: [],
            publishedAt: 1,
          },
          capabilitiesSignature: 'capabilities-signature',
        }),
      }),
      { accessToken: 'wallet-access-token' },
    )
    expect(mocks.verifyChallenge).toHaveBeenCalledWith(expect.objectContaining({
      identityId: 'local-chat-identity',
    }))

    mocks.authState.setIdentityBound.mockClear()
    await expect(ensureVerifiedBackendAccess()).resolves.toMatchObject({
      identityId: 'local-chat-identity',
    })

    expect(mocks.authState.isIdentityBound).toBe(true)
    expect(mocks.authState.setIdentityBound).toHaveBeenLastCalledWith(true)
  })

  it('repairs a valid local bundle with missing wallet authorization', async () => {
    mocks.authState.session = {
      exoAddress: 'exo1vdfwallet',
      identityId: null,
      accessToken: 'wallet-access-token',
      refreshToken: 'wallet-refresh-token',
      expiresAt: Date.now() + 3_600_000,
      metadataVersion: 4,
    }
    mocks.authState.isCloudAuthVerified = true
    mocks.getPublicKeyBundle.mockResolvedValue({
      identityId: 'local-chat-identity',
      identityKey: 'identity-key',
      mlkemIdentityKey: 'mlkem-key',
      dilithiumKey: 'dilithium-key',
      signedPreKey: { id: 1 },
      oneTimePreKeys: [{ id: 2 }],
      version: 1,
      timestamp: 1,
    })
    mocks.bindPrivateIdentity.mockResolvedValue(true)
    mocks.requestChallenge.mockResolvedValue({
      challenge: 'reauthorize-identity-challenge',
    })
    mocks.verifyChallenge.mockResolvedValue({
      verified: true,
      session: {
        exoAddress: 'exo1vdfwallet',
        identityId: 'local-chat-identity',
        accessToken: 'identity-access-token',
        refreshToken: 'identity-refresh-token',
        expiresAt: Date.now() + 3_600_000,
        metadataVersion: 4,
      },
    })

    await expect(
      ensureBoundBackendAccessForIdentity('local-chat-identity'),
    ).resolves.toMatchObject({
      identityId: 'local-chat-identity',
    })

    expect(mocks.signWalletAuthorization).toHaveBeenCalled()
    expect(mocks.storePublicKeyBundle).toHaveBeenCalledWith(
      'local-chat-identity',
      expect.objectContaining({
        walletAuthorization: expect.objectContaining({
          payload: { walletAddress: 'exo1vdfwallet' },
        }),
      }),
    )
    expect(mocks.bindPrivateIdentity).toHaveBeenCalled()
  })

  it('fails closed for a wallet authorization tied to another wallet', async () => {
    mocks.authState.session = {
      exoAddress: 'exo1vdfwallet',
      identityId: null,
      accessToken: 'wallet-access-token',
      refreshToken: 'wallet-refresh-token',
      expiresAt: Date.now() + 3_600_000,
      metadataVersion: 4,
    }
    mocks.authState.isCloudAuthVerified = true
    mocks.getPublicKeyBundle.mockResolvedValue({
      identityId: 'local-chat-identity',
      identityKey: 'identity-key',
      mlkemIdentityKey: 'mlkem-key',
      dilithiumKey: 'dilithium-key',
      signedPreKey: { id: 1 },
      oneTimePreKeys: [{ id: 2 }],
      version: 1,
      timestamp: 1,
      walletAuthorization: {
        payload: { walletAddress: 'exo1otherwallet' },
      },
    })

    await expect(
      ensureBoundBackendAccessForIdentity('local-chat-identity'),
    ).resolves.toBeNull()

    expect(mocks.signWalletAuthorization).not.toHaveBeenCalled()
    expect(mocks.storePublicKeyBundle).not.toHaveBeenCalled()
    expect(mocks.bindPrivateIdentity).not.toHaveBeenCalled()
  })

  it('fails closed for a corrupt wallet authorization', async () => {
    mocks.authState.session = {
      exoAddress: 'exo1vdfwallet',
      identityId: null,
      accessToken: 'wallet-access-token',
      refreshToken: 'wallet-refresh-token',
      expiresAt: Date.now() + 3_600_000,
      metadataVersion: 4,
    }
    mocks.authState.isCloudAuthVerified = true
    mocks.getPublicKeyBundle.mockResolvedValue({
      identityId: 'local-chat-identity',
      identityKey: 'identity-key',
      mlkemIdentityKey: 'mlkem-key',
      dilithiumKey: 'dilithium-key',
      signedPreKey: { id: 1 },
      oneTimePreKeys: [{ id: 2 }],
      version: 1,
      timestamp: 1,
      walletAuthorization: {
        payload: { walletAddress: 'exo1vdfwallet' },
      },
    })
    mocks.verifyWalletAuthorization.mockReturnValueOnce({ valid: false })

    await expect(
      ensureBoundBackendAccessForIdentity('local-chat-identity'),
    ).resolves.toBeNull()

    expect(mocks.signWalletAuthorization).not.toHaveBeenCalled()
    expect(mocks.storePublicKeyBundle).not.toHaveBeenCalled()
    expect(mocks.bindPrivateIdentity).not.toHaveBeenCalled()
  })

  it('fails closed when the local bundle belongs to another identity', async () => {
    mocks.authState.session = {
      exoAddress: 'exo1vdfwallet',
      identityId: null,
      accessToken: 'wallet-access-token',
      refreshToken: 'wallet-refresh-token',
      expiresAt: Date.now() + 3_600_000,
      metadataVersion: 4,
    }
    mocks.authState.isCloudAuthVerified = true
    mocks.getPublicKeyBundle.mockResolvedValue({
      identityId: 'other-chat-identity',
      identityKey: 'identity-key',
      mlkemIdentityKey: 'mlkem-key',
      dilithiumKey: 'dilithium-key',
      signedPreKey: { id: 1 },
      oneTimePreKeys: [{ id: 2 }],
      version: 1,
      timestamp: 1,
    })

    await expect(
      ensureBoundBackendAccessForIdentity('local-chat-identity'),
    ).resolves.toBeNull()

    expect(mocks.signWalletAuthorization).not.toHaveBeenCalled()
    expect(mocks.storePublicKeyBundle).not.toHaveBeenCalled()
    expect(mocks.bindPrivateIdentity).not.toHaveBeenCalled()
  })

  it('fails closed when the local bundle is invalid', async () => {
    mocks.authState.session = {
      exoAddress: 'exo1vdfwallet',
      identityId: null,
      accessToken: 'wallet-access-token',
      refreshToken: 'wallet-refresh-token',
      expiresAt: Date.now() + 3_600_000,
      metadataVersion: 4,
    }
    mocks.authState.isCloudAuthVerified = true
    mocks.getPublicKeyBundle.mockResolvedValue({
      identityId: 'local-chat-identity',
      identityKey: 'identity-key',
      mlkemIdentityKey: 'mlkem-key',
      dilithiumKey: 'dilithium-key',
      signedPreKey: { id: 1 },
      oneTimePreKeys: [{ id: 2 }],
      version: 1,
      timestamp: 1,
    })
    mocks.verifyBundle.mockReturnValueOnce({
      valid: false,
    })

    await expect(
      ensureBoundBackendAccessForIdentity('local-chat-identity'),
    ).resolves.toBeNull()

    expect(mocks.signWalletAuthorization).not.toHaveBeenCalled()
    expect(mocks.storePublicKeyBundle).not.toHaveBeenCalled()
    expect(mocks.bindPrivateIdentity).not.toHaveBeenCalled()
    expect(getBackendAdmissionOutcome()).toEqual({
      phase: 'failed',
      failure: 'identity_binding',
      retryable: false,
    })
  })

  it('does not poison future binding after cancellation', async () => {
    mocks.authState.setIdentityBound.mockClear()
    mocks.authState.session = {
      exoAddress: 'exo1vdfwallet',
      identityId: null,
      accessToken: 'wallet-access-token',
      refreshToken: 'wallet-refresh-token',
      expiresAt: Date.now() + 3_600_000,
      metadataVersion: 4,
    }
    mocks.authState.isCloudAuthVerified = true
    mocks.getPublicKeyBundle.mockResolvedValue({
      identityId: 'local-chat-identity',
      identityKey: 'identity-key',
      mlkemIdentityKey: 'mlkem-key',
      dilithiumKey: 'dilithium-key',
      signedPreKey: { id: 1 },
      oneTimePreKeys: [{ id: 2 }],
      version: 1,
      timestamp: 1,
      walletAuthorization: {
        payload: { walletAddress: 'exo1vdfwallet' },
      },
    })
    mocks.bindPrivateIdentity.mockResolvedValue(true)
    mocks.requestChallenge.mockResolvedValueOnce({
      challenge: 'cancelled-identity-challenge',
      vdfChallenge: {
        challengeId: 'vdfc1.cancelled',
        nonceHex: 'ab'.repeat(32),
        bindingHash: 'cd'.repeat(32),
        expiresAt: Date.now() + 60_000,
        notBeforeAt: Date.now(),
        params: {
          algorithm: 'wesolowski-rsa-v1',
          domain: 'spectra.discovery.vdf.v1',
          parameterId: 'test-v1',
          modulusHex: 'a'.repeat(512),
          iterations: 200_000,
        },
      },
    })
    let markSolveStarted!: () => void
    const solveStarted = new Promise<void>((resolve) => {
      markSolveStarted = resolve
    })
    mocks.solve.mockImplementation(async (
      _params: unknown,
      _input: unknown,
      options: { signal?: AbortSignal },
    ) => {
      markSolveStarted()
      return await new Promise((_, reject) => {
      options.signal?.addEventListener('abort', () => {
        reject(Object.assign(new Error('cancelled'), { name: 'AbortError' }))
      }, { once: true })
      })
    })

    const controller = new AbortController()
    const cancelled = ensureVerifiedBackendAccessForIdentity('local-chat-identity', {
      signal: controller.signal,
    })
    await solveStarted
    controller.abort()

    await expect(cancelled).resolves.toBeNull()
    expect(mocks.authState.setIdentityBound).not.toHaveBeenCalled()

    mocks.requestChallenge.mockResolvedValueOnce({ challenge: 'retry-identity-challenge' })
    mocks.verifyChallenge.mockResolvedValueOnce({
      verified: true,
      session: {
        exoAddress: 'exo1vdfwallet',
        identityId: 'local-chat-identity',
        accessToken: 'identity-access-token',
        refreshToken: 'identity-refresh-token',
        expiresAt: Date.now() + 3_600_000,
        metadataVersion: 4,
      },
    })

    await expect(
      ensureVerifiedBackendAccessForIdentity('local-chat-identity'),
    ).resolves.toMatchObject({
      identityId: 'local-chat-identity',
    })
    expect(mocks.bindPrivateIdentity).toHaveBeenCalledTimes(2)
  })

  it('does not let a reset transport attempt overwrite newer admission', async () => {
    mocks.requestChallenge
      .mockResolvedValueOnce({
        challenge: 'stale-challenge',
        vdfChallenge: {
          challengeId: 'vdfc1.stale',
          nonceHex: 'ab'.repeat(32),
          bindingHash: 'cd'.repeat(32),
          expiresAt: Date.now() + 60_000,
          notBeforeAt: Date.now(),
          params: {
            algorithm: 'wesolowski-rsa-v1',
            domain: 'spectra.discovery.vdf.v1',
            parameterId: 'test-v1',
            modulusHex: 'a'.repeat(512),
            iterations: 200_000,
          },
        },
      })
      .mockResolvedValueOnce({ challenge: 'fresh-challenge' })
    let markSolveStarted!: () => void
    const solveStarted = new Promise<void>((resolve) => {
      markSolveStarted = resolve
    })
    let releaseSolve!: () => void
    mocks.solve.mockImplementationOnce(() => new Promise((resolve) => {
      markSolveStarted()
      releaseSolve = () => resolve({ outputHex: '01', proofHex: '02' })
    }))
    mocks.wait.mockResolvedValue(undefined)
    mocks.retry.mockImplementation(async (submit: () => Promise<unknown>) => await submit())
    mocks.verifyChallenge.mockImplementation(async (request) => ({
      verified: true,
      session: {
        exoAddress: 'exo1vdfwallet',
        identityId: null,
        accessToken: request.challenge === 'stale-challenge' ? 'stale-token' : 'fresh-token',
        refreshToken: 'refresh-token',
        expiresAt: Date.now() + 3_600_000,
        metadataVersion: 4,
      },
    }))

    const staleAttempt = ensureBackendSession()
    await solveStarted
    resetAuthCooldowns()

    await expect(ensureBackendSession()).resolves.toMatchObject({
      accessToken: 'fresh-token',
    })
    releaseSolve()
    await expect(staleAttempt).resolves.toBeNull()
    expect(mocks.authState.session?.accessToken).toBe('fresh-token')
  })

  it('coalesces automatic and forced identity repair', async () => {
    mocks.authState.session = {
      exoAddress: 'exo1vdfwallet',
      identityId: null,
      accessToken: 'wallet-access-token',
      refreshToken: 'wallet-refresh-token',
      expiresAt: Date.now() + 3_600_000,
      metadataVersion: 4,
    }
    mocks.authState.isCloudAuthVerified = true
    mocks.getPublicKeyBundle.mockResolvedValue({
      identityId: 'local-chat-identity',
      identityKey: 'identity-key',
      mlkemIdentityKey: 'mlkem-key',
      dilithiumKey: 'dilithium-key',
      signedPreKey: { id: 1 },
      oneTimePreKeys: [{ id: 2 }],
      version: 1,
      timestamp: 1,
      walletAuthorization: {
        payload: { walletAddress: 'exo1vdfwallet' },
      },
    })
    let markPrivateBindingStarted!: () => void
    const privateBindingStarted = new Promise<void>((resolve) => {
      markPrivateBindingStarted = resolve
    })
    let releasePrivateBinding!: () => void
    mocks.bindPrivateIdentity.mockImplementationOnce(() => new Promise((done) => {
      markPrivateBindingStarted()
      releasePrivateBinding = () => done(true)
    }))
    mocks.requestChallenge.mockResolvedValue({
      challenge: 'coalesced-identity-challenge',
    })
    mocks.verifyChallenge.mockResolvedValue({
      verified: true,
      session: {
        exoAddress: 'exo1vdfwallet',
        identityId: 'local-chat-identity',
        accessToken: 'identity-access-token',
        refreshToken: 'identity-refresh-token',
        expiresAt: Date.now() + 3_600_000,
        metadataVersion: 4,
      },
    })

    const automatic = ensureVerifiedBackendAccessForIdentity('local-chat-identity')
    await privateBindingStarted
    const forced = repairBackendIdentityBinding('local-chat-identity')
    releasePrivateBinding()

    await expect(automatic).resolves.toMatchObject({
      identityId: 'local-chat-identity',
    })
    await expect(forced).resolves.toMatchObject({
      identityId: 'local-chat-identity',
    })
    expect(mocks.bindPrivateIdentity).toHaveBeenCalledTimes(1)
    expect(mocks.verifyChallenge).toHaveBeenCalledTimes(1)
  })

  it('admits a first-time imported wallet before issuing identity-scoped access', async () => {
    mocks.requestChallenge
      .mockResolvedValueOnce({
        challenge: 'wallet-challenge',
        vdfChallenge: {
          challengeId: 'vdfc1.challenge',
          nonceHex: 'ab'.repeat(32),
          bindingHash: 'cd'.repeat(32),
          expiresAt: Date.now() + 60_000,
          notBeforeAt: Date.now(),
          params: {
            algorithm: 'wesolowski-rsa-v1',
            domain: 'spectra.discovery.vdf.v1',
            parameterId: 'test-v1',
            modulusHex: 'a'.repeat(512),
            iterations: 200_000,
          },
        },
      })
      .mockResolvedValueOnce({ challenge: 'identity-challenge' })
    mocks.solve.mockResolvedValue({ outputHex: '01', proofHex: '02' })
    mocks.wait.mockResolvedValue(undefined)
    mocks.retry.mockImplementation(async (submit: () => Promise<unknown>) => await submit())
    mocks.getPublicKeyBundle.mockResolvedValue({
      identityId: 'imported-local-identity',
      identityKey: 'identity-key',
      mlkemIdentityKey: 'mlkem-key',
      dilithiumKey: 'dilithium-key',
      signedPreKey: { id: 1 },
      oneTimePreKeys: [{ id: 2 }],
      version: 1,
      timestamp: 1,
      walletAuthorization: {
        payload: { walletAddress: 'exo1vdfwallet' },
      },
    })
    mocks.bindPrivateIdentity.mockResolvedValue(true)
    mocks.verifyChallenge
      .mockResolvedValueOnce({
        verified: true,
        session: {
          exoAddress: 'exo1vdfwallet',
          identityId: null,
          accessToken: 'wallet-access-token',
          refreshToken: 'wallet-refresh-token',
          expiresAt: Date.now() + 3_600_000,
          metadataVersion: 4,
        },
      })
      .mockResolvedValueOnce({
        verified: true,
        session: {
          exoAddress: 'exo1vdfwallet',
          identityId: 'imported-local-identity',
          accessToken: 'identity-access-token',
          refreshToken: 'identity-refresh-token',
          expiresAt: Date.now() + 3_600_000,
          metadataVersion: 4,
        },
      })

    await expect(
      ensureVerifiedBackendAccessForIdentity('imported-local-identity'),
    ).resolves.toMatchObject({
      identityId: 'imported-local-identity',
      accessToken: 'identity-access-token',
    })

    expect(mocks.requestChallenge).toHaveBeenCalledTimes(2)
    expect(mocks.solve).toHaveBeenCalledTimes(1)
    expect(mocks.bindPrivateIdentity).toHaveBeenCalledTimes(1)
    expect(mocks.verifyChallenge).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        identityId: null,
        vdfChallengeId: 'vdfc1.challenge',
      }),
    )
    expect(mocks.verifyChallenge).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        identityId: 'imported-local-identity',
      }),
    )
    expect(mocks.authState.isIdentityBound).toBe(true)
  })

  it('reports a redacted native solver outcome without submitting a proof', async () => {
    mocks.requestChallenge.mockResolvedValue({
      challenge: 'wallet-challenge',
      vdfChallenge: {
        challengeId: 'vdfc1.challenge',
        nonceHex: 'ab'.repeat(32),
        bindingHash: 'cd'.repeat(32),
        expiresAt: Date.now() + 60_000,
        notBeforeAt: Date.now(),
        params: {
          algorithm: 'wesolowski-rsa-v1',
          domain: 'spectra.discovery.vdf.v1',
          parameterId: 'test-v1',
          modulusHex: 'a'.repeat(512),
          iterations: 200_000,
        },
      },
    })
    const nativeError = Object.assign(
      new Error('Native VDF solver is unavailable in this app build'),
      { code: 'ERR_VDF_UNAVAILABLE' },
    )
    mocks.solve.mockRejectedValue(nativeError)

    await expect(ensureBackendSession()).resolves.toBeNull()

    expect(getBackendAdmissionOutcome()).toEqual({
      phase: 'failed',
      failure: 'native_unavailable',
      retryable: false,
    })
    expect(mocks.verifyChallenge).not.toHaveBeenCalled()
  })

  it('retries one transient admission failure with a fresh challenge', async () => {
    vi.useFakeTimers()
    mocks.requestChallenge
      .mockResolvedValueOnce({
        challenge: 'wallet-challenge-one',
        vdfChallenge: {
          challengeId: 'vdfc1.one',
          nonceHex: 'ab'.repeat(32),
          bindingHash: 'cd'.repeat(32),
          expiresAt: Date.now() + 60_000,
          notBeforeAt: Date.now(),
          params: {
            algorithm: 'wesolowski-rsa-v1',
            domain: 'spectra.discovery.vdf.v1',
            parameterId: 'test-v1',
            modulusHex: 'a'.repeat(512),
            iterations: 200_000,
          },
        },
      })
      .mockResolvedValueOnce({
        challenge: 'wallet-challenge-two',
        vdfChallenge: {
          challengeId: 'vdfc1.two',
          nonceHex: 'ef'.repeat(32),
          bindingHash: '01'.repeat(32),
          expiresAt: Date.now() + 60_000,
          notBeforeAt: Date.now(),
          params: {
            algorithm: 'wesolowski-rsa-v1',
            domain: 'spectra.discovery.vdf.v1',
            parameterId: 'test-v1',
            modulusHex: 'a'.repeat(512),
            iterations: 200_000,
          },
        },
      })
    mocks.solve.mockResolvedValue({ outputHex: '01', proofHex: '02' })
    mocks.wait.mockResolvedValue(undefined)
    mocks.retry.mockImplementation(async (submit: () => Promise<unknown>) => await submit())
    mocks.verifyChallenge
      .mockRejectedValueOnce(new (await import('@/services/backend/client')).SpectraBackendError(
        503,
        'database_unavailable',
      ))
      .mockResolvedValueOnce({
        verified: true,
        session: {
          exoAddress: 'exo1vdfwallet',
          identityId: null,
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresAt: Date.now() + 3_600_000,
          metadataVersion: 4,
        },
      })

    const sessionPromise = ensureBackendSession()
    await vi.runAllTimersAsync()

    await expect(sessionPromise).resolves.toMatchObject({
      accessToken: 'access-token',
    })
    expect(mocks.requestChallenge).toHaveBeenCalledTimes(2)
    expect(mocks.verifyChallenge).toHaveBeenCalledTimes(2)
    expect(getBackendAdmissionOutcome()).toEqual({
      phase: 'ready',
      failure: null,
      retryable: false,
    })
  })

  it('reissues an expired VDF challenge once with a new proof', async () => {
    const createChallenge = (suffix: string) => ({
      challenge: `wallet-challenge-${suffix}`,
      vdfChallenge: {
        challengeId: `vdfc1.${suffix}`,
        nonceHex: suffix === 'one' ? 'ab'.repeat(32) : 'ef'.repeat(32),
        bindingHash: suffix === 'one' ? 'cd'.repeat(32) : '01'.repeat(32),
        expiresAt: Date.now() + 60_000,
        notBeforeAt: Date.now(),
        params: {
          algorithm: 'wesolowski-rsa-v1' as const,
          domain: 'spectra.discovery.vdf.v1' as const,
          parameterId: 'test-v1',
          modulusHex: 'a'.repeat(512),
          iterations: 200_000,
        },
      },
    })
    mocks.requestChallenge
      .mockResolvedValueOnce(createChallenge('one'))
      .mockResolvedValueOnce(createChallenge('two'))
    mocks.solve.mockResolvedValue({ outputHex: '01', proofHex: '02' })
    mocks.wait.mockResolvedValue(undefined)
    mocks.retry.mockImplementation(async (submit: () => Promise<unknown>) => await submit())
    mocks.verifyChallenge
      .mockRejectedValueOnce(new (await import('@/services/backend/client')).SpectraBackendError(
        409,
        'vdf_challenge_expired',
      ))
      .mockResolvedValueOnce({
        verified: true,
        session: {
          exoAddress: 'exo1vdfwallet',
          identityId: null,
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresAt: Date.now() + 3_600_000,
          metadataVersion: 4,
        },
      })

    await expect(ensureBackendSession()).resolves.toMatchObject({
      accessToken: 'access-token',
    })

    expect(mocks.requestChallenge).toHaveBeenCalledTimes(2)
    expect(mocks.solve).toHaveBeenCalledTimes(2)
    expect(mocks.verifyChallenge).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ vdfChallengeId: 'vdfc1.one' }),
    )
    expect(mocks.verifyChallenge).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ vdfChallengeId: 'vdfc1.two' }),
    )
  })

  it('does not loop after a second expired VDF challenge', async () => {
    const createChallenge = (suffix: string) => ({
      challenge: `wallet-challenge-${suffix}`,
      vdfChallenge: {
        challengeId: `vdfc1.${suffix}`,
        nonceHex: 'ab'.repeat(32),
        bindingHash: 'cd'.repeat(32),
        expiresAt: Date.now() + 60_000,
        notBeforeAt: Date.now(),
        params: {
          algorithm: 'wesolowski-rsa-v1' as const,
          domain: 'spectra.discovery.vdf.v1' as const,
          parameterId: 'test-v1',
          modulusHex: 'a'.repeat(512),
          iterations: 200_000,
        },
      },
    })
    const expired = new (await import('@/services/backend/client')).SpectraBackendError(
      409,
      'vdf_challenge_expired',
    )
    mocks.requestChallenge
      .mockResolvedValueOnce(createChallenge('one'))
      .mockResolvedValueOnce(createChallenge('two'))
    mocks.solve.mockResolvedValue({ outputHex: '01', proofHex: '02' })
    mocks.wait.mockResolvedValue(undefined)
    mocks.retry.mockImplementation(async (submit: () => Promise<unknown>) => await submit())
    mocks.verifyChallenge
      .mockRejectedValueOnce(expired)
      .mockRejectedValueOnce(expired)

    await expect(ensureBackendSession()).resolves.toBeNull()

    expect(mocks.requestChallenge).toHaveBeenCalledTimes(2)
    expect(mocks.solve).toHaveBeenCalledTimes(2)
    expect(mocks.verifyChallenge).toHaveBeenCalledTimes(2)
    expect(getBackendAdmissionOutcome()).toEqual({
      phase: 'failed',
      failure: 'challenge_expired',
      retryable: true,
    })
  })

  it('does not retry a replayed challenge', async () => {
    mocks.requestChallenge.mockResolvedValue({
      challenge: 'wallet-challenge',
      vdfChallenge: {
        challengeId: 'vdfc1.challenge',
        nonceHex: 'ab'.repeat(32),
        bindingHash: 'cd'.repeat(32),
        expiresAt: Date.now() + 60_000,
        notBeforeAt: Date.now(),
        params: {
          algorithm: 'wesolowski-rsa-v1',
          domain: 'spectra.discovery.vdf.v1',
          parameterId: 'test-v1',
          modulusHex: 'a'.repeat(512),
          iterations: 200_000,
        },
      },
    })
    mocks.solve.mockResolvedValue({ outputHex: '01', proofHex: '02' })
    mocks.wait.mockResolvedValue(undefined)
    mocks.retry.mockImplementation(async (submit: () => Promise<unknown>) => await submit())
    mocks.verifyChallenge.mockRejectedValue(new (await import('@/services/backend/client')).SpectraBackendError(
      409,
      'challenge_replay',
    ))

    await expect(ensureBackendSession()).resolves.toBeNull()

    expect(mocks.requestChallenge).toHaveBeenCalledTimes(1)
    expect(getBackendAdmissionOutcome()).toEqual({
      phase: 'failed',
      failure: 'proof_rejected',
      retryable: false,
    })
  })

  it('reuses a persisted identity-bound session without another VDF', async () => {
    mocks.authState.session = {
      exoAddress: 'exo1vdfwallet',
      identityId: 'local-chat-identity',
      accessToken: 'identity-access-token',
      refreshToken: 'identity-refresh-token',
      expiresAt: Date.now() + 3_600_000,
      metadataVersion: 4,
    }

    await expect(
      ensureVerifiedBackendAccessForIdentity('local-chat-identity'),
    ).resolves.toMatchObject({
      identityId: 'local-chat-identity',
    })

    expect(mocks.requestChallenge).not.toHaveBeenCalled()
    expect(mocks.solve).not.toHaveBeenCalled()
    expect(mocks.bindPrivateIdentity).not.toHaveBeenCalled()
  })

  it('does not fall back to anonymous VDF when session refresh fails transiently', async () => {
    const { SpectraBackendError } = await import('@/services/backend/client')
    const { refreshBackendSession } = await import('@/services/backend/auth')
    mocks.authState.session = {
      exoAddress: 'exo1vdfwallet',
      identityId: 'local-chat-identity',
      accessToken: 'stale-access-token',
      refreshToken: 'refresh-token',
      expiresAt: Date.now() - 1,
      metadataVersion: 4,
    }
    vi.mocked(refreshBackendSession).mockRejectedValueOnce(
      new SpectraBackendError(0, 'network'),
    )

    await expect(ensureBackendSession()).resolves.toBeNull()

    expect(mocks.requestChallenge).not.toHaveBeenCalled()
    expect(mocks.authState.clearCloudSession).not.toHaveBeenCalled()
    expect(mocks.authState.session?.refreshToken).toBe('refresh-token')
  })

  it('does not wipe the refresh token when rotation reports a replay', async () => {
    const { SpectraBackendError } = await import('@/services/backend/client')
    const { refreshBackendSession } = await import('@/services/backend/auth')
    mocks.authState.session = {
      exoAddress: 'exo1vdfwallet',
      identityId: 'local-chat-identity',
      accessToken: 'stale-access-token',
      refreshToken: 'refresh-token',
      expiresAt: Date.now() - 1,
      metadataVersion: 4,
    }
    vi.mocked(refreshBackendSession).mockRejectedValueOnce(
      new SpectraBackendError(401, 'refresh_token_replay'),
    )
    mocks.requestChallenge.mockResolvedValue(null)

    await expect(ensureBackendSession()).resolves.toBeNull()

    expect(mocks.authState.clearCloudSession).not.toHaveBeenCalled()
    expect(mocks.authState.session?.refreshToken).toBe('refresh-token')
  })
})
