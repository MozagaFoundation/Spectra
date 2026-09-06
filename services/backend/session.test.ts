/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as { __DEV__?: boolean }).__DEV__ = false

let netInfoState = {
  isConnected: true,
  isInternetReachable: true,
}

let bindingRow: { wallet_address: string; public_key: string; verified_at: string; identity_id: string | null } | null = null
let challengeVerified = false
let invokeCalls: string[] = []
let invokePayloads: Array<{ name: string; body: Record<string, unknown> | undefined }> = []
let rpcCalls: Array<{ name: string; args: Record<string, unknown> | undefined }> = []
let localIdentityId: string | null = 'local-chat-identity'
let publishedBundles = new Map<string, string>()
let challengeResponseMode: 'object' | 'stringified' | 'wrapped' = 'object'
let verifyResponseMode: 'object' | 'stringified' | 'wrapped' = 'object'
const torStoreState = {
  enabled: false,
  status: 'disconnected',
}

const authStoreState = {
  isAuthenticated: true,
  isCloudAuthVerified: false,
  isIdentityBound: false,
  isSessionExpired: false,
  session: null as any,
  clearCloudSession: vi.fn(async () => {
    authStoreState.session = null
  }),
  setCloudAuthVerified: vi.fn((value: boolean) => {
    authStoreState.isCloudAuthVerified = value
  }),
  setIdentityBound: vi.fn((value: boolean) => {
    authStoreState.isIdentityBound = value
  }),
  setSessionExpired: vi.fn((value: boolean) => {
    authStoreState.isSessionExpired = value
  }),
  setSecureAccess: vi.fn(),
  setSession: vi.fn(async (session: any) => {
    authStoreState.session = session
  }),
}

const walletStoreState = {
  wallet: {
    address: 'exo1-wallet',
    publicKey: 'wallet-public-key',
    privateKey: 'wallet-private-key',
  },
  isVaultUnlocked: true,
}
const signMessageMock = vi.fn(async () => 'signed-challenge')

const rawBackendSession = {
  access_token: 'backend-access-token',
  refresh_token: 'backend-refresh-token',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  expires_in: 3600,
  identity_id: 'local-chat-identity',
}

function buildQuery(table: string) {
  const filters = new Map<string, unknown>()

  const query = {
    eq: vi.fn((column: string, value: unknown) => {
      filters.set(column, value)
      return query
    }),
    maybeSingle: vi.fn(async () => {
      if (table === 'wallet_auth_bindings') {
        return {
          data: bindingRow,
          error: null,
        }
      }

      if (table === 'chat_key_bundles') {
        const identityId = filters.get('identity_id')
        const walletAddress = filters.get('wallet_address')
        const publishedWalletAddress = typeof identityId === 'string'
          ? publishedBundles.get(identityId)
          : undefined

        return {
          data: (
            typeof identityId === 'string'
              && typeof walletAddress === 'string'
              && publishedWalletAddress === walletAddress
          ) ? {
            identity_id: identityId,
            wallet_address: walletAddress,
          } : null,
          error: null,
        }
      }

      return {
        data: null,
        error: null,
      }
    }),
  }

  return {
    select: vi.fn(() => query),
  }
}

const createClient = vi.fn(() => ({
  auth: {
    setSession: vi.fn(async () => ({
      data: { session: rawBackendSession },
      error: null,
    })),
    signInAnonymously: vi.fn(async () => ({
      data: { session: rawBackendSession },
      error: null,
    })),
  },
  from: vi.fn((table: string) => buildQuery(table)),
  rpc: vi.fn(async (name: string, args?: Record<string, unknown>) => {
    rpcCalls.push({ name, args })
    if (name === 'mobile_select_wallet_binding') {
      return {
        data: args?.p_wallet_address,
        error: null,
      }
    }

    if (name === 'mobile_current_wallet_binding') {
      return {
        data: bindingRow
          ? {
            wallet_address: bindingRow.wallet_address,
            public_key: bindingRow.public_key,
            identity_id: bindingRow.identity_id,
          }
          : null,
        error: null,
      }
    }

    if (name === 'mobile_verify_chat_identity_wallet_binding') {
      const identityId = args?.p_identity_id
      const walletAddress = args?.p_wallet_address
      return {
        data: (
          typeof identityId === 'string'
            && typeof walletAddress === 'string'
            && publishedBundles.get(identityId) === walletAddress
        ),
        error: null,
      }
    }

    return {
      data: (args?.p_identity_id as string | null | undefined) ?? null,
      error: null,
    }
  }),
  functions: {
    invoke: vi.fn(async (name: string, options?: { body?: Record<string, unknown> }) => {
      invokeCalls.push(name)
      invokePayloads.push({ name, body: options?.body })

      if (name === 'wallet-auth-challenge') {
        const payload = {
          challenge: 'wallet-challenge',
          expiresAt: Date.now() + 60_000,
        }

        return {
          data: challengeResponseMode === 'stringified'
            ? JSON.stringify(payload)
            : challengeResponseMode === 'wrapped'
              ? { data: payload }
              : payload,
          error: null,
        }
      }

      if (name === 'wallet-auth-verify') {
        const payload = { verified: challengeVerified }

        return {
          data: verifyResponseMode === 'stringified'
            ? JSON.stringify(payload)
            : verifyResponseMode === 'wrapped'
              ? { data: payload }
              : payload,
          error: null,
        }
      }

      return { data: null, error: new Error(`Unexpected function invoke: ${name}`) }
    }),
  },
}))

vi.mock('@react-native-community/netinfo', () => ({
  default: {
    fetch: vi.fn(async () => netInfoState),
  },
}))

vi.mock('@backend/backend-js', () => ({
  createClient,
}))

vi.mock('@/lib/constants', () => ({
  SPECTRA_API_URL: 'https://api.spectra.test',
  STORAGE_KEYS: {
    SESSION: 'exo_session',
  },
}))
vi.mock('@/services/backend/appVersion', () => ({
  getAppVersionHeaders: () => ({}),
  parseAppUpdateRequiredPolicy: () => null,
}))

vi.mock('@/services/tor/torFetch', () => ({
  torAwareFetch: vi.fn(),
}))

vi.mock('@/services/tor/torStore', () => ({
  useTorStore: {
    getState: () => torStoreState,
  },
}))

vi.mock('@spectra/identity-vault', () => ({
  signMessage: signMessageMock,
}))

vi.mock('@spectra/core-crypto/client/identity', () => ({
  loadIdentityByAddress: vi.fn(async () => (
    localIdentityId
      ? { identity: { id: localIdentityId } }
      : null
  )),
}))
vi.mock('@spectra/core-crypto', () => ({
  deriveRecipientMailboxToken: () => 'smbx1.local-chat-mailbox',
  verifyPublicKeyBundle: () => ({ valid: true }),
  verifyPublicKeyBundleWalletAuthorization: () => ({ valid: true }),
}))
vi.mock('@spectra/core-crypto/storage/local', () => ({
  localChatStorage: {
    getPublicKeyBundle: vi.fn(async (identityId: string) => (
      identityId === localIdentityId
        ? {
          identityId,
          identityKey: 'identity-key',
          mlkemIdentityKey: 'mlkem-key',
          dilithiumKey: 'dilithium-key',
          signedPreKey: { id: 1 },
          oneTimePreKeys: [{ id: 2 }],
          version: 1,
          timestamp: 1,
          walletAuthorization: {
            payload: { walletAddress: walletStoreState.wallet?.address },
          },
        }
        : null
    )),
  },
}))

vi.mock('@/store/authStore', () => ({
  useAuthStore: {
    getState: () => authStoreState,
  },
}))

vi.mock('@/store/walletStore', () => ({
  useWalletStore: {
    getState: () => walletStoreState,
  },
}))

describe.skip('legacy Backend auth bootstrap', () => {
  beforeEach(() => {
    vi.resetModules()
    invokeCalls = []
    invokePayloads = []
    rpcCalls = []
    bindingRow = null
    challengeVerified = false
    localIdentityId = 'local-chat-identity'
    publishedBundles = new Map()
    challengeResponseMode = 'object'
    verifyResponseMode = 'object'
    signMessageMock.mockClear()
    walletStoreState.wallet = {
      address: 'EXO00abcdefabcdefabcdefabcdefabcdefabcdefab',
      publicKey: 'wallet-public-key',
      privateKey: 'wallet-private-key',
    }
    walletStoreState.isVaultUnlocked = true
    authStoreState.isAuthenticated = true
    authStoreState.isCloudAuthVerified = false
    authStoreState.isIdentityBound = false
    authStoreState.session = {
      exoAddress: walletStoreState.wallet.address,
      identityId: localIdentityId,
      publicKey: walletStoreState.wallet.publicKey,
      accessToken: 'cached-access-token',
      refreshToken: 'cached-refresh-token',
      expiresAt: Date.now() + 120_000,
      metadataVersion: 4,
    }
    authStoreState.clearCloudSession.mockClear()
    authStoreState.setCloudAuthVerified.mockClear()
    authStoreState.setIdentityBound.mockClear()
    authStoreState.setSecureAccess.mockClear()
    authStoreState.setSession.mockClear()
    createClient.mockClear()
    netInfoState = {
      isConnected: true,
      isInternetReachable: true,
    }
    torStoreState.enabled = false
    torStoreState.status = 'disconnected'
  })

  it('re-checks wallet binding instead of trusting cached verified state', async () => {
    authStoreState.isCloudAuthVerified = true
    bindingRow = {
      wallet_address: walletStoreState.wallet.address,
      public_key: 'stale-public-key',
      identity_id: 'stale-chat-identity',
      verified_at: new Date().toISOString(),
    }
    challengeVerified = false

    const { ensureVerifiedBackendAccess } = await import('./session')
    const result = await ensureVerifiedBackendAccess()

    expect(result).toBeNull()
    expect(invokeCalls).toEqual(['wallet-auth-challenge', 'wallet-auth-verify'])
    expect(authStoreState.setCloudAuthVerified).toHaveBeenLastCalledWith(false)
  })

  it('accepts a session when the backend binding still matches the unlocked wallet', async () => {
    bindingRow = {
      wallet_address: walletStoreState.wallet.address,
      public_key: walletStoreState.wallet.publicKey,
      identity_id: localIdentityId,
      verified_at: new Date().toISOString(),
    }

    const { ensureVerifiedBackendAccess } = await import('./session')
    const result = await ensureVerifiedBackendAccess()

    expect(result).toEqual(authStoreState.session)
    expect(invokeCalls).toEqual([])
    expect(rpcCalls).toEqual([
      { name: 'mobile_current_wallet_binding', args: undefined },
      {
        name: 'mobile_verify_chat_identity_wallet_binding',
        args: {
          p_identity_id: localIdentityId,
          p_wallet_address: walletStoreState.wallet.address,
        },
      },
      {
        name: 'mobile_select_wallet_binding',
        args: { p_wallet_address: walletStoreState.wallet.address },
      },
    ])
    expect(authStoreState.setCloudAuthVerified).toHaveBeenLastCalledWith(true)
  })

  it('rebinds the verified session to the exact local chat identity', async () => {
    bindingRow = {
      wallet_address: walletStoreState.wallet.address,
      public_key: walletStoreState.wallet.publicKey,
      identity_id: 'old-chat-identity',
      verified_at: new Date().toISOString(),
    }
    publishedBundles.set(localIdentityId!, walletStoreState.wallet.address)

    const { ensureVerifiedBackendAccess } = await import('./session')
    const result = await ensureVerifiedBackendAccess()

    expect(result).toEqual(authStoreState.session)
    expect(invokeCalls).toEqual([])
    expect(rpcCalls).toEqual([
      { name: 'mobile_current_wallet_binding', args: undefined },
      {
        name: 'mobile_verify_chat_identity_wallet_binding',
        args: {
          p_identity_id: localIdentityId,
          p_wallet_address: walletStoreState.wallet.address,
        },
      },
      {
        name: 'mobile_bind_current_identity',
        args: { p_identity_id: localIdentityId },
      },
    ])
    expect(authStoreState.setCloudAuthVerified).toHaveBeenLastCalledWith(true)
    expect(authStoreState.setIdentityBound).toHaveBeenLastCalledWith(true)
  })

  it('passes the local chat identity during challenge verification when rebinding is needed', async () => {
    challengeVerified = true
    publishedBundles.set(localIdentityId!, walletStoreState.wallet.address)

    const { ensureVerifiedBackendAccess } = await import('./session')
    const result = await ensureVerifiedBackendAccess()

    expect(result).toEqual(authStoreState.session)
    expect(invokeCalls).toEqual(['wallet-auth-challenge', 'wallet-auth-verify'])
    expect(signMessageMock).toHaveBeenCalledWith(
      'wallet-challenge',
      walletStoreState.wallet.privateKey,
      { domain: 'Spectra.WalletAuthChallenge.v1' },
    )
    expect(invokePayloads.at(-1)).toEqual({
      name: 'wallet-auth-verify',
      body: {
        challenge: 'wallet-challenge',
        walletAddress: walletStoreState.wallet.address,
        publicKey: walletStoreState.wallet.publicKey,
        identityId: localIdentityId,
        signature: 'signed-challenge',
      },
    })
  })

  it('accepts normalized edge function payloads during wallet verification', async () => {
    challengeVerified = true
    challengeResponseMode = 'stringified'
    verifyResponseMode = 'wrapped'
    publishedBundles.set(localIdentityId!, walletStoreState.wallet.address)

    const { ensureVerifiedBackendAccess } = await import('./session')
    const result = await ensureVerifiedBackendAccess()

    expect(result).toEqual(authStoreState.session)
    expect(invokeCalls).toEqual(['wallet-auth-challenge', 'wallet-auth-verify'])
    expect(invokePayloads.at(-1)).toEqual({
      name: 'wallet-auth-verify',
      body: {
        challenge: 'wallet-challenge',
        walletAddress: walletStoreState.wallet.address,
        publicKey: walletStoreState.wallet.publicKey,
        identityId: localIdentityId,
        signature: 'signed-challenge',
      },
    })
    expect(authStoreState.setCloudAuthVerified).toHaveBeenLastCalledWith(true)
  })

  it('defers identity binding until the local chat identity has been published', async () => {
    challengeVerified = true

    const { ensureVerifiedBackendAccess } = await import('./session')
    const result = await ensureVerifiedBackendAccess()

    expect(result).toEqual(authStoreState.session)
    expect(invokeCalls).toEqual(['wallet-auth-challenge', 'wallet-auth-verify'])
    expect(invokePayloads.at(-1)).toEqual({
      name: 'wallet-auth-verify',
      body: {
        challenge: 'wallet-challenge',
        walletAddress: walletStoreState.wallet.address,
        publicKey: walletStoreState.wallet.publicKey,
        identityId: null,
        signature: 'signed-challenge',
      },
    })
    expect(authStoreState.setCloudAuthVerified).toHaveBeenLastCalledWith(true)
    expect(authStoreState.setIdentityBound).toHaveBeenLastCalledWith(false)
  })

  it('keeps wallet-level verification active while a replacement identity is still unpublished', async () => {
    bindingRow = {
      wallet_address: walletStoreState.wallet.address,
      public_key: walletStoreState.wallet.publicKey,
      identity_id: null,
      verified_at: new Date().toISOString(),
    }

    const { ensureVerifiedBackendAccess } = await import('./session')
    const result = await ensureVerifiedBackendAccess()

    expect(result).toEqual(authStoreState.session)
    expect(invokeCalls).toEqual([])
    expect(rpcCalls).toEqual([
      { name: 'mobile_current_wallet_binding', args: undefined },
      {
        name: 'mobile_verify_chat_identity_wallet_binding',
        args: {
          p_identity_id: localIdentityId,
          p_wallet_address: walletStoreState.wallet.address,
        },
      },
      {
        name: 'mobile_select_wallet_binding',
        args: { p_wallet_address: walletStoreState.wallet.address },
      },
    ])
    expect(authStoreState.setCloudAuthVerified).toHaveBeenLastCalledWith(true)
    expect(authStoreState.setIdentityBound).toHaveBeenLastCalledWith(false)
  })

  it('reports verified access as unavailable while Tor is enabled but errored', async () => {
    authStoreState.isCloudAuthVerified = true
    torStoreState.enabled = true
    torStoreState.status = 'error'

    const { hasVerifiedBackendAccess } = await import('./session')

    expect(hasVerifiedBackendAccess()).toBe(false)
  })

  it('reports verified access as available while Tor is connecting and session is valid', async () => {
    authStoreState.isCloudAuthVerified = true
    torStoreState.enabled = true
    torStoreState.status = 'connecting'

    const { hasVerifiedBackendAccess } = await import('./session')

    expect(hasVerifiedBackendAccess()).toBe(true)
  })

  it('preserves verified access when binding cannot be rechecked offline', async () => {
    authStoreState.isCloudAuthVerified = true
    netInfoState = {
      isConnected: false,
      isInternetReachable: false,
    }

    const { ensureVerifiedBackendAccess } = await import('./session')
    const result = await ensureVerifiedBackendAccess()

    expect(result).toEqual(authStoreState.session)
    expect(authStoreState.setCloudAuthVerified).not.toHaveBeenCalledWith(false)
    expect(invokeCalls).toEqual([])
  })

  it('returns the cached verified access token without re-running verification', async () => {
    authStoreState.isCloudAuthVerified = true

    const { getValidBackendAccessToken } = await import('./session')
    const token = await getValidBackendAccessToken()

    expect(token).toBe('cached-access-token')
    expect(createClient).not.toHaveBeenCalled()
    expect(invokeCalls).toEqual([])
    expect(rpcCalls).toEqual([])
  })

  it('does not return a verified token after the active wallet changes', async () => {
    authStoreState.isCloudAuthVerified = true
    walletStoreState.wallet = {
      address: 'exo2-wallet',
      publicKey: 'second-public-key',
      privateKey: 'second-private-key',
    }

    const {
      getCachedBackendAccessToken,
      hasVerifiedBackendAccess,
    } = await import('./session')

    expect(getCachedBackendAccessToken()).toBeNull()
    expect(hasVerifiedBackendAccess()).toBe(false)
  })

  it('bootstraps verified access when an auth token is requested before verification is cached', async () => {
    bindingRow = {
      wallet_address: walletStoreState.wallet.address,
      public_key: walletStoreState.wallet.publicKey,
      identity_id: localIdentityId,
      verified_at: new Date().toISOString(),
    }

    const { getValidBackendAccessToken } = await import('./session')
    const token = await getValidBackendAccessToken()

    expect(token).toBe('backend-access-token')
    expect(invokeCalls).toEqual([])
    expect(rpcCalls).toEqual([
      { name: 'mobile_current_wallet_binding', args: undefined },
      {
        name: 'mobile_verify_chat_identity_wallet_binding',
        args: {
          p_identity_id: localIdentityId,
          p_wallet_address: walletStoreState.wallet.address,
        },
      },
      {
        name: 'mobile_select_wallet_binding',
        args: { p_wallet_address: walletStoreState.wallet.address },
      },
    ])
    expect(authStoreState.setCloudAuthVerified).toHaveBeenLastCalledWith(true)
  })

  it('does not reuse the exact-binding cache when the local chat identity changes', async () => {
    bindingRow = {
      wallet_address: walletStoreState.wallet.address,
      public_key: walletStoreState.wallet.publicKey,
      identity_id: localIdentityId,
      verified_at: new Date().toISOString(),
    }
    publishedBundles.set(localIdentityId!, walletStoreState.wallet.address)

    const { ensureVerifiedBackendAccess } = await import('./session')

    await ensureVerifiedBackendAccess()

    rpcCalls = []
    authStoreState.setCloudAuthVerified.mockClear()
    authStoreState.setIdentityBound.mockClear()

    localIdentityId = 'replacement-chat-identity'
    bindingRow = {
      wallet_address: walletStoreState.wallet.address,
      public_key: walletStoreState.wallet.publicKey,
      identity_id: 'local-chat-identity',
      verified_at: new Date().toISOString(),
    }
    publishedBundles.set(localIdentityId, walletStoreState.wallet.address)

    const result = await ensureVerifiedBackendAccess()

    expect(result).toEqual(authStoreState.session)
    expect(rpcCalls).toEqual([
      { name: 'mobile_current_wallet_binding', args: undefined },
      {
        name: 'mobile_verify_chat_identity_wallet_binding',
        args: {
          p_identity_id: localIdentityId,
          p_wallet_address: walletStoreState.wallet.address,
        },
      },
      {
        name: 'mobile_bind_current_identity',
        args: { p_identity_id: localIdentityId },
      },
    ])
    expect(authStoreState.setIdentityBound).toHaveBeenLastCalledWith(true)
  })

  it('reports identity binding as unavailable until the replacement identity is published', async () => {
    challengeVerified = true

    const {
      bindVerifiedBackendIdentity,
      hasBoundBackendAccessForIdentity,
    } = await import('./session')

    const result = await bindVerifiedBackendIdentity(localIdentityId)

    expect(result).toBe(false)
    expect(hasBoundBackendAccessForIdentity(localIdentityId)).toBe(false)
    expect(invokeCalls).toEqual(['wallet-auth-challenge', 'wallet-auth-verify'])
    expect(authStoreState.setCloudAuthVerified).toHaveBeenLastCalledWith(true)
    expect(authStoreState.setIdentityBound).toHaveBeenLastCalledWith(false)
  })
})

describe('backend-backed auth compatibility exports', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    authStoreState.isAuthenticated = true
    authStoreState.isCloudAuthVerified = false
    authStoreState.isIdentityBound = false
    authStoreState.isSessionExpired = false
    authStoreState.session = null
    walletStoreState.wallet = {
      address: 'exo1-wallet',
      publicKey: 'wallet-public-key',
      privateKey: 'wallet-private-key',
    }
    walletStoreState.isVaultUnlocked = true
    netInfoState = {
      isConnected: true,
      isInternetReachable: true,
    }
    torStoreState.enabled = false
    torStoreState.status = 'disconnected'
  })

  it('automatically upgrades a wallet-only session to the active identity', async () => {
    const { torAwareFetch } = await import('@/services/tor/torFetch')
    vi.mocked(torAwareFetch)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: vi.fn(async () => JSON.stringify({
          challenge: 'wallet-challenge',
          expiresAt: Date.now() + 60_000,
        })),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: vi.fn(async () => JSON.stringify({
          verified: true,
          walletAddress: walletStoreState.wallet.address,
          identityId: null,
          verifiedAt: new Date().toISOString(),
          session: {
            accessToken: 'backend-access-token',
            refreshToken: 'backend-refresh-token',
            accessExpiresAt: Date.now() + 900_000,
            refreshExpiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
            sessionId: 'session-1',
            identityId: null,
          },
        })),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: vi.fn(async () => JSON.stringify({
          identityId: localIdentityId,
        })),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: vi.fn(async () => JSON.stringify({
          challenge: 'wallet-challenge-2',
          expiresAt: Date.now() + 60_000,
        })),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: vi.fn(async () => JSON.stringify({
          verified: true,
          walletAddress: walletStoreState.wallet.address,
          identityId: localIdentityId,
          verifiedAt: new Date().toISOString(),
          session: {
            accessToken: 'backend-access-token',
            refreshToken: 'backend-refresh-token',
            accessExpiresAt: Date.now() + 900_000,
            refreshExpiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
            sessionId: 'session-1',
            identityId: localIdentityId,
          },
        })),
      } as unknown as Response)

    const {
      ensureBoundBackendAccessForIdentity,
      ensureVerifiedBackendAccess,
    } = await import('./session')
    const walletSession = await ensureVerifiedBackendAccess()
    const session = await ensureBoundBackendAccessForIdentity(localIdentityId)

    expect(walletSession?.identityId).toBeNull()
    expect(session?.accessToken).toBe('backend-access-token')
    expect(session?.identityId).toBe(localIdentityId)
    expect(signMessageMock).toHaveBeenCalledWith('wallet-challenge', 'wallet-private-key', {
      domain: 'Spectra.WalletAuthChallenge.v1',
    })
    expect(signMessageMock).toHaveBeenCalledTimes(2)
    expect(vi.mocked(torAwareFetch)).toHaveBeenCalledTimes(5)
    expect(JSON.parse(String(vi.mocked(torAwareFetch).mock.calls[1]?.[1]?.body))).toEqual(
      expect.objectContaining({ identityId: null }),
    )
    expect(JSON.parse(String(vi.mocked(torAwareFetch).mock.calls[2]?.[1]?.body))).toEqual(
      expect.objectContaining({
        identityId: localIdentityId,
        recipientMailboxToken: 'smbx1.local-chat-mailbox',
        bundle: expect.objectContaining({ oneTimePreKeys: [] }),
      }),
    )
    expect(JSON.parse(String(vi.mocked(torAwareFetch).mock.calls[4]?.[1]?.body))).toEqual(
      expect.objectContaining({ identityId: localIdentityId }),
    )
    expect(authStoreState.setCloudAuthVerified).toHaveBeenCalledWith(true)
    expect(authStoreState.setIdentityBound).toHaveBeenLastCalledWith(true)
  })

  it('keeps imported-account identity sessions fresh after wallet verification', async () => {
    const { torAwareFetch } = await import('@/services/tor/torFetch')
    vi.mocked(torAwareFetch).mockReset()
    walletStoreState.wallet = {
      address: 'EXO0033333333333333333333333333333333333333',
      publicKey: 'imported-public-key',
      privateKey: 'imported-private-key',
    }
    vi.mocked(torAwareFetch)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: vi.fn(async () => JSON.stringify({
          challenge: 'imported-wallet-challenge',
          expiresAt: Date.now() + 60_000,
        })),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: vi.fn(async () => JSON.stringify({
          verified: true,
          walletAddress: walletStoreState.wallet.address,
          identityId: null,
          verifiedAt: new Date().toISOString(),
          session: {
            accessToken: 'imported-backend-access-token',
            refreshToken: 'imported-backend-refresh-token',
            accessExpiresAt: Date.now() + 900_000,
            refreshExpiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
            sessionId: 'imported-session-1',
            identityId: null,
          },
        })),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: vi.fn(async () => JSON.stringify({
          identityId: localIdentityId,
        })),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: vi.fn(async () => JSON.stringify({
          challenge: 'imported-wallet-challenge-2',
          expiresAt: Date.now() + 60_000,
        })),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: vi.fn(async () => JSON.stringify({
          verified: true,
          walletAddress: walletStoreState.wallet.address,
          identityId: localIdentityId,
          verifiedAt: new Date().toISOString(),
          session: {
            accessToken: 'imported-backend-access-token',
            refreshToken: 'imported-backend-refresh-token',
            accessExpiresAt: Date.now() + 900_000,
            refreshExpiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
            sessionId: 'imported-session-1',
            identityId: localIdentityId,
          },
        })),
      } as unknown as Response)

    const {
      ensureBoundBackendAccessForIdentity,
      ensureVerifiedBackendAccess,
      getCachedBackendAccessToken,
      hasVerifiedBackendAccess,
    } = await import('./session')
    await ensureVerifiedBackendAccess()
    const session = await ensureBoundBackendAccessForIdentity(localIdentityId)

    expect(session).toEqual(expect.objectContaining({
      accessToken: 'imported-backend-access-token',
      exoAddress: 'EXO0033333333333333333333333333333333333333',
      identityId: localIdentityId,
      metadataVersion: 4,
    }))
    expect(hasVerifiedBackendAccess()).toBe(true)
    expect(getCachedBackendAccessToken()).toBe('imported-backend-access-token')
    expect(authStoreState.setCloudAuthVerified).toHaveBeenLastCalledWith(true)
    expect(vi.mocked(torAwareFetch)).toHaveBeenCalledTimes(5)
  })

  it('surfaces active deletion cleanup without creating a session', async () => {
    const { torAwareFetch } = await import('@/services/tor/torFetch')
    vi.mocked(torAwareFetch).mockReset()
    vi.mocked(torAwareFetch)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: vi.fn(async () => JSON.stringify({
          challenge: 'pending-deletion-challenge',
          expiresAt: Date.now() + 60_000,
        })),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        text: vi.fn(async () => JSON.stringify({
          error: 'account_deletion_pending',
        })),
      } as unknown as Response)

    const { ensureBackendSession, getBackendAdmissionOutcome } = await import('./session')
    await expect(ensureBackendSession()).resolves.toBeNull()

    expect(signMessageMock).toHaveBeenCalledWith(
      'pending-deletion-challenge',
      'wallet-private-key',
      { domain: 'Spectra.WalletAuthChallenge.v1' },
    )
    expect(getBackendAdmissionOutcome()).toEqual({
      phase: 'failed',
      failure: 'deletion_cleanup_pending',
      retryable: true,
    })
    expect(authStoreState.session).toBeNull()
  })

  it('rehydrates the in-memory bound-identity cache from a persisted session', async () => {
    authStoreState.isAuthenticated = true
    authStoreState.isCloudAuthVerified = false
    authStoreState.isIdentityBound = false
    authStoreState.session = {
      exoAddress: walletStoreState.wallet.address,
      identityId: localIdentityId,
      accessToken: 'cached-backend-token',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 120_000,
      metadataVersion: 4,
    }

    const {
      hasBoundBackendAccessForIdentity,
      rehydratePersistedBoundIdentityCache,
    } = await import('./session')

    expect(hasBoundBackendAccessForIdentity(localIdentityId)).toBe(false)
    expect(rehydratePersistedBoundIdentityCache(localIdentityId)).toBe(true)
    expect(hasBoundBackendAccessForIdentity(localIdentityId)).toBe(true)
    expect(authStoreState.setIdentityBound).toHaveBeenCalledWith(true)
  })

  it('recovers a fresh persisted binding on foreground without a network refresh', async () => {
    authStoreState.isAuthenticated = true
    authStoreState.isCloudAuthVerified = false
    authStoreState.isIdentityBound = false
    authStoreState.isSessionExpired = true
    authStoreState.session = {
      exoAddress: walletStoreState.wallet.address,
      identityId: localIdentityId,
      accessToken: 'cached-backend-token',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 120_000,
      metadataVersion: 4,
    }
    torStoreState.enabled = true
    torStoreState.status = 'disconnected'

    const { recoverBoundSessionOnForeground, hasBoundBackendAccessForIdentity } = await import('./session')
    const session = await recoverBoundSessionOnForeground(localIdentityId)

    expect(session).toEqual(expect.objectContaining({
      accessToken: 'cached-backend-token',
      identityId: localIdentityId,
    }))
    expect(authStoreState.setCloudAuthVerified).toHaveBeenCalledWith(true)
    expect(authStoreState.setIdentityBound).toHaveBeenCalledWith(true)
    expect(authStoreState.setSessionExpired).toHaveBeenCalledWith(false)
    expect(hasBoundBackendAccessForIdentity(localIdentityId)).toBe(false)
  })

  it('does not unbind identity when a stale session cannot refresh over a dead network', async () => {
    authStoreState.isAuthenticated = true
    authStoreState.isCloudAuthVerified = true
    authStoreState.isIdentityBound = true
    authStoreState.session = {
      exoAddress: walletStoreState.wallet.address,
      identityId: localIdentityId,
      accessToken: 'cached-backend-token',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 10_000,
      metadataVersion: 4,
    }
    netInfoState = {
      isConnected: false,
      isInternetReachable: false,
    }

    const { ensureVerifiedBackendAccessForIdentity } = await import('./session')
    await expect(ensureVerifiedBackendAccessForIdentity(localIdentityId)).resolves.toBeNull()

    expect(authStoreState.setIdentityBound).not.toHaveBeenCalledWith(false)
    expect(authStoreState.setCloudAuthVerified).not.toHaveBeenCalledWith(false)
    expect(authStoreState.isIdentityBound).toBe(true)
    expect(authStoreState.isCloudAuthVerified).toBe(true)
  })

  it('rehydrates a persisted binding while the access token is inside the refresh buffer', async () => {
    authStoreState.isAuthenticated = true
    authStoreState.isCloudAuthVerified = false
    authStoreState.isIdentityBound = false
    authStoreState.session = {
      exoAddress: walletStoreState.wallet.address,
      identityId: localIdentityId,
      accessToken: 'cached-backend-token',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 30_000,
      metadataVersion: 4,
    }

    const { rehydratePersistedBoundIdentityCache } = await import('./session')

    expect(rehydratePersistedBoundIdentityCache(localIdentityId)).toBe(true)
    expect(authStoreState.setIdentityBound).toHaveBeenCalledWith(true)
    expect(authStoreState.setCloudAuthVerified).toHaveBeenCalledWith(true)
  })

  it('rehydrates a persisted binding after the access token expires', async () => {
    authStoreState.isAuthenticated = true
    authStoreState.isCloudAuthVerified = false
    authStoreState.isIdentityBound = false
    authStoreState.session = {
      exoAddress: walletStoreState.wallet.address,
      identityId: localIdentityId,
      accessToken: 'expired-backend-token',
      refreshToken: 'refresh',
      expiresAt: Date.now() - 1_000,
      metadataVersion: 4,
    }

    const { rehydratePersistedBoundIdentityCache } = await import('./session')

    expect(rehydratePersistedBoundIdentityCache(localIdentityId)).toBe(true)
    expect(authStoreState.setIdentityBound).toHaveBeenCalledWith(true)
    expect(authStoreState.setCloudAuthVerified).toHaveBeenCalledWith(true)
  })

  it('keeps identity bound on foreground when Tor is down and the token is inside the refresh buffer', async () => {
    authStoreState.isAuthenticated = true
    authStoreState.isCloudAuthVerified = false
    authStoreState.isIdentityBound = false
    authStoreState.session = {
      exoAddress: walletStoreState.wallet.address,
      identityId: localIdentityId,
      accessToken: 'cached-backend-token',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 30_000,
      metadataVersion: 4,
    }
    torStoreState.enabled = true
    torStoreState.status = 'disconnected'

    const { recoverBoundSessionOnForeground } = await import('./session')
    const session = await recoverBoundSessionOnForeground(localIdentityId)

    expect(session).toBeNull()
    expect(authStoreState.setIdentityBound).toHaveBeenCalledWith(true)
    expect(authStoreState.setCloudAuthVerified).toHaveBeenCalledWith(true)
  })

  it('refreshes a buffer-window token on foreground when Tor is off without unbinding', async () => {
    authStoreState.isAuthenticated = true
    authStoreState.isCloudAuthVerified = true
    authStoreState.isIdentityBound = true
    authStoreState.session = {
      exoAddress: walletStoreState.wallet.address,
      identityId: localIdentityId,
      accessToken: 'cached-backend-token',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 30_000,
      metadataVersion: 4,
    }
    netInfoState = {
      isConnected: false,
      isInternetReachable: false,
    }

    const { recoverBoundSessionOnForeground, getBackendAdmissionOutcome } = await import('./session')
    const session = await recoverBoundSessionOnForeground(localIdentityId)

    expect(session).toBeNull()
    expect(getBackendAdmissionOutcome()).toEqual(expect.objectContaining({
      failure: 'connectivity',
      retryable: true,
    }))
    expect(authStoreState.setIdentityBound).not.toHaveBeenCalledWith(false)
    expect(authStoreState.setCloudAuthVerified).not.toHaveBeenCalledWith(false)
    expect(authStoreState.isIdentityBound).toBe(true)
    expect(authStoreState.isCloudAuthVerified).toBe(true)
  })

  it('does not unbind identity when forced repair cannot reach the network', async () => {
    authStoreState.isAuthenticated = true
    authStoreState.isCloudAuthVerified = true
    authStoreState.isIdentityBound = true
    authStoreState.session = {
      exoAddress: walletStoreState.wallet.address,
      identityId: localIdentityId,
      accessToken: 'cached-backend-token',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 120_000,
      metadataVersion: 4,
    }
    netInfoState = {
      isConnected: false,
      isInternetReachable: false,
    }

    const { repairBackendIdentityBinding } = await import('./session')
    await expect(repairBackendIdentityBinding(localIdentityId)).resolves.toBeNull()

    expect(authStoreState.setIdentityBound).not.toHaveBeenCalledWith(false)
    expect(authStoreState.isIdentityBound).toBe(true)
  })

  it('keeps the persisted identity claim when a token refresh omits it', async () => {
    authStoreState.isAuthenticated = true
    authStoreState.isCloudAuthVerified = true
    authStoreState.isIdentityBound = true
    authStoreState.session = {
      exoAddress: walletStoreState.wallet.address,
      identityId: localIdentityId,
      accessToken: 'cached-backend-token',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 10_000,
      metadataVersion: 4,
    }
    const { torAwareFetch } = await import('@/services/tor/torFetch')
    vi.mocked(torAwareFetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: vi.fn(async () => JSON.stringify({
        accessToken: 'rotated-access-token',
        refreshToken: 'rotated-refresh-token',
        accessExpiresAt: Date.now() + 900_000,
        refreshExpiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
        sessionId: 'rotated-session',
      })),
    } as unknown as Response)

    const { ensureVerifiedBackendAccessForIdentity } = await import('./session')
    const session = await ensureVerifiedBackendAccessForIdentity(localIdentityId)

    expect(session).toEqual(expect.objectContaining({
      accessToken: 'rotated-access-token',
      identityId: localIdentityId,
    }))
    expect(authStoreState.setIdentityBound).not.toHaveBeenCalledWith(false)
    expect(authStoreState.setSession).toHaveBeenCalledWith(expect.objectContaining({
      identityId: localIdentityId,
      accessToken: 'rotated-access-token',
    }))
  })

  it('persists a rotated session if the vault locks during refresh', async () => {
    authStoreState.isAuthenticated = true
    authStoreState.isCloudAuthVerified = true
    authStoreState.isIdentityBound = true
    authStoreState.session = {
      exoAddress: walletStoreState.wallet.address,
      identityId: localIdentityId,
      accessToken: 'cached-backend-token',
      refreshToken: 'old-refresh-token',
      expiresAt: Date.now() + 10_000,
      metadataVersion: 4,
    }
    const { torAwareFetch } = await import('@/services/tor/torFetch')
    vi.mocked(torAwareFetch).mockImplementationOnce(async () => {
      ;(walletStoreState as { wallet: null }).wallet = null
      walletStoreState.isVaultUnlocked = false
      authStoreState.isAuthenticated = false
      return {
        ok: true,
        status: 200,
        text: vi.fn(async () => JSON.stringify({
          accessToken: 'rotated-access-token',
          refreshToken: 'rotated-refresh-token',
          accessExpiresAt: Date.now() + 900_000,
          refreshExpiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
          sessionId: 'rotated-session',
          identityId: localIdentityId,
        })),
      } as unknown as Response
    })

    const { ensureVerifiedBackendAccessForIdentity } = await import('./session')
    const session = await ensureVerifiedBackendAccessForIdentity(localIdentityId)

    expect(session).toBeNull()
    expect(authStoreState.session).toEqual(expect.objectContaining({
      accessToken: 'rotated-access-token',
      refreshToken: 'rotated-refresh-token',
      identityId: localIdentityId,
    }))
    expect(authStoreState.clearCloudSession).not.toHaveBeenCalled()
    expect(authStoreState.isCloudAuthVerified).toBe(true)
  })

  it('does not refresh on foreground while the vault is locked', async () => {
    authStoreState.isAuthenticated = false
    walletStoreState.isVaultUnlocked = false
    authStoreState.session = {
      exoAddress: walletStoreState.wallet.address,
      identityId: localIdentityId,
      accessToken: 'cached-backend-token',
      refreshToken: 'refresh',
      expiresAt: Date.now() - 1_000,
      metadataVersion: 4,
    }
    const { torAwareFetch } = await import('@/services/tor/torFetch')
    const { recoverBoundSessionOnForeground } = await import('./session')

    await expect(recoverBoundSessionOnForeground(localIdentityId)).resolves.toBeNull()
    expect(torAwareFetch).not.toHaveBeenCalled()
  })

  it('refreshes a persisted session even when NetInfo reports offline', async () => {
    authStoreState.isAuthenticated = true
    authStoreState.isCloudAuthVerified = true
    authStoreState.isIdentityBound = true
    authStoreState.session = {
      exoAddress: walletStoreState.wallet.address,
      identityId: localIdentityId,
      accessToken: 'expired-backend-token',
      refreshToken: 'refresh-token',
      expiresAt: Date.now() - 1_000,
      metadataVersion: 4,
    }
    netInfoState = {
      isConnected: false,
      isInternetReachable: false,
    }
    const { torAwareFetch } = await import('@/services/tor/torFetch')
    vi.mocked(torAwareFetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: vi.fn(async () => JSON.stringify({
        accessToken: 'rotated-access-token',
        refreshToken: 'rotated-refresh-token',
        accessExpiresAt: Date.now() + 900_000,
        refreshExpiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
        sessionId: 'rotated-session',
        identityId: localIdentityId,
      })),
    } as unknown as Response)

    const { ensureVerifiedBackendAccessForIdentity } = await import('./session')
    await expect(ensureVerifiedBackendAccessForIdentity(localIdentityId)).resolves.toEqual(
      expect.objectContaining({
        accessToken: 'rotated-access-token',
        refreshToken: 'rotated-refresh-token',
      }),
    )
    expect(authStoreState.session?.refreshToken).toBe('rotated-refresh-token')
  })

  it('does not apply bootstrap cooldown after a NetInfo-only miss', async () => {
    authStoreState.isAuthenticated = true
    authStoreState.isCloudAuthVerified = true
    authStoreState.isIdentityBound = true
    authStoreState.session = {
      exoAddress: walletStoreState.wallet.address,
      identityId: localIdentityId,
      accessToken: 'expired-backend-token',
      refreshToken: 'refresh-token',
      expiresAt: Date.now() - 1_000,
      metadataVersion: 4,
    }
    netInfoState = {
      isConnected: false,
      isInternetReachable: false,
    }
    const { torAwareFetch } = await import('@/services/tor/torFetch')
    vi.mocked(torAwareFetch).mockRejectedValueOnce(new Error('network'))

    const { ensureVerifiedBackendAccessForIdentity } = await import('./session')
    await expect(ensureVerifiedBackendAccessForIdentity(localIdentityId)).resolves.toBeNull()

    netInfoState = {
      isConnected: true,
      isInternetReachable: true,
    }
    vi.mocked(torAwareFetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: vi.fn(async () => JSON.stringify({
        accessToken: 'rotated-access-token',
        refreshToken: 'rotated-refresh-token',
        accessExpiresAt: Date.now() + 900_000,
        refreshExpiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
        sessionId: 'rotated-session',
        identityId: localIdentityId,
      })),
    } as unknown as Response)

    await expect(ensureVerifiedBackendAccessForIdentity(localIdentityId)).resolves.toEqual(
      expect.objectContaining({ accessToken: 'rotated-access-token' }),
    )
  })

  it('returns cached backend access tokens only for the active wallet', async () => {
    authStoreState.isCloudAuthVerified = true
    authStoreState.session = {
      exoAddress: walletStoreState.wallet.address,
      identityId: localIdentityId,
      accessToken: 'cached-backend-token',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 120_000,
      metadataVersion: 4,
    }

    const { getValidBackendAccessToken } = await import('./session')

    await expect(getValidBackendAccessToken()).resolves.toBe('cached-backend-token')
  })
})
