/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AddressBookSnapshot } from '@/lib/types'

const OWNER = 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const ALICE = 'EXO00abcdefabcdefabcdefabcdefabcdefabcdefab'
const STORAGE_KEY = `exo_address_book_local_v1:${OWNER}`

const testState = vi.hoisted(() => ({
  data: new Map<string, string>(),
  encrypted: new Map<string, { plaintext: string; key: string }>(),
  nextCipherId: 0,
  wallet: { address: 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' } as { address: string } | null,
  activeKey: new Uint8Array([1, 2, 3]) as Uint8Array | null,
}))

function keyFingerprint(key: Uint8Array): string {
  return Array.from(key).join(',')
}

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => testState.data.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      testState.data.set(key, value)
    }),
    removeItem: vi.fn(async (key: string) => {
      testState.data.delete(key)
    }),
  },
}))

vi.mock('@spectra/identity-vault', () => ({
  encrypt: vi.fn((plaintext: string, key: Uint8Array) => {
    testState.nextCipherId += 1
    const ciphertext = `cipher-${testState.nextCipherId}`
    const iv = `iv-${testState.nextCipherId}`
    testState.encrypted.set(`${ciphertext}:${iv}`, {
      plaintext,
      key: keyFingerprint(key),
    })
    return { ciphertext, iv }
  }),
  decrypt: vi.fn((ciphertext: string, iv: string, key: Uint8Array) => {
    const record = testState.encrypted.get(`${ciphertext}:${iv}`)
    if (!record || record.key !== keyFingerprint(key)) {
      throw new Error('Address book decrypt failed')
    }
    return record.plaintext
  }),
}))

vi.mock('@/store/walletStore', () => ({
  useWalletStore: {
    getState: () => ({
      wallet: testState.wallet,
      getActiveAddressBookKey: () => testState.activeKey,
    }),
  },
}))

function createSnapshot(): AddressBookSnapshot {
  return {
    version: 1,
    ownerWalletAddress: OWNER,
    entries: [
      {
        key: `wallet:${ALICE.toUpperCase()}`,
        walletAddress: ALICE.toUpperCase(),
        lastKnownIdentityId: 'identity-alice',
        displayName: ' Alice ',
        isSaved: true,
        isHidden: false,
        trustState: 'trusted',
        createdAt: 1,
        updatedAt: 2,
      },
    ],
    tags: [],
  }
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

describe('addressBookStorage', () => {
  beforeEach(() => {
    testState.data.clear()
    testState.encrypted.clear()
    testState.nextCipherId = 0
    testState.wallet = { address: OWNER }
    testState.activeKey = new Uint8Array([1, 2, 3])
  })

  it('returns an empty snapshot when no encrypted address book exists', async () => {
    const { loadAddressBookSnapshot } = await import('./addressBookStorage')

    await expect(loadAddressBookSnapshot(OWNER, testState.activeKey!)).resolves.toEqual({
      version: 1,
      ownerWalletAddress: OWNER,
      entries: [],
      tags: [],
    })
  })

  it('encrypts normalized snapshots and round-trips through storage', async () => {
    const {
      loadAddressBookSnapshot,
      saveAddressBookSnapshot,
    } = await import('./addressBookStorage')

    const saved = await saveAddressBookSnapshot(OWNER, testState.activeKey!, createSnapshot())
    const stored = testState.data.get(STORAGE_KEY)

    expect(saved.entries[0]).toEqual(expect.objectContaining({
      key: `wallet:${ALICE}`,
      walletAddress: ALICE,
      displayName: 'Alice',
    }))
    expect(stored).toBeDefined()
    expect(stored).not.toContain('Alice')

    await expect(loadAddressBookSnapshot(OWNER, testState.activeKey!)).resolves.toEqual(saved)
  })

  it('updates from the current decrypted snapshot and persists the updater result', async () => {
    const {
      loadAddressBookSnapshot,
      saveAddressBookSnapshot,
      updateAddressBookSnapshot,
    } = await import('./addressBookStorage')

    await saveAddressBookSnapshot(OWNER, testState.activeKey!, createSnapshot())
    const updated = await updateAddressBookSnapshot(OWNER, testState.activeKey!, (current) => ({
      ...current,
      entries: current.entries.map((entry) => ({
        ...entry,
        isHidden: true,
        updatedAt: 5,
      })),
    }))

    expect(updated.entries[0]).toEqual(expect.objectContaining({
      isHidden: true,
      updatedAt: 5,
    }))
    await expect(loadAddressBookSnapshot(OWNER, testState.activeKey!)).resolves.toEqual(updated)
  })

  it('serializes overlapping updates for the same owner', async () => {
    const {
      loadAddressBookSnapshot,
      saveAddressBookSnapshot,
      updateAddressBookSnapshot,
    } = await import('./addressBookStorage')
    const firstUpdaterStarted = deferred()
    const allowFirstUpdaterToFinish = deferred()

    await saveAddressBookSnapshot(OWNER, testState.activeKey!, {
      ...createSnapshot(),
      tags: [],
    })

    const firstUpdate = updateAddressBookSnapshot(OWNER, testState.activeKey!, async (current) => {
      firstUpdaterStarted.resolve()
      await allowFirstUpdaterToFinish.promise
      return {
        ...current,
        tags: [
          ...current.tags,
          {
            id: 'tag-1',
            ownerWalletAddress: OWNER,
            tagName: 'first',
            createdAt: 1,
            contactWalletAddresses: [],
          },
        ],
      }
    })

    await firstUpdaterStarted.promise
    const secondUpdate = updateAddressBookSnapshot(OWNER, testState.activeKey!, (current) => ({
      ...current,
      tags: [
        ...current.tags,
        {
          id: 'tag-2',
          ownerWalletAddress: OWNER,
          tagName: 'second',
          createdAt: 2,
          contactWalletAddresses: [],
        },
      ],
    }))

    allowFirstUpdaterToFinish.resolve()
    await Promise.all([firstUpdate, secondUpdate])

    await expect(loadAddressBookSnapshot(OWNER, testState.activeKey!)).resolves.toEqual(
      expect.objectContaining({
        tags: [
          expect.objectContaining({ id: 'tag-1' }),
          expect.objectContaining({ id: 'tag-2' }),
        ],
      }),
    )
  })

  it('rejects corrupted payloads or mismatched encryption keys', async () => {
    const {
      loadAddressBookSnapshot,
      saveAddressBookSnapshot,
    } = await import('./addressBookStorage')

    await saveAddressBookSnapshot(OWNER, testState.activeKey!, createSnapshot())
    await expect(loadAddressBookSnapshot(OWNER, new Uint8Array([9, 9, 9]))).rejects.toThrow('decrypt failed')

    testState.data.set(STORAGE_KEY, '{not json')
    await expect(loadAddressBookSnapshot(OWNER, testState.activeKey!)).rejects.toThrow()
  })

  it('uses active wallet context and clears scoped snapshots', async () => {
    const {
      clearAddressBookSnapshot,
      loadActiveAddressBookSnapshot,
      saveAddressBookSnapshot,
      updateActiveAddressBookSnapshot,
    } = await import('./addressBookStorage')

    await saveAddressBookSnapshot(OWNER, testState.activeKey!, createSnapshot())
    await expect(loadActiveAddressBookSnapshot()).resolves.toEqual(expect.objectContaining({
      ownerWalletAddress: OWNER,
    }))

    await updateActiveAddressBookSnapshot((current) => ({
      ...current,
      tags: [{
        id: 'tag-1',
        ownerWalletAddress: OWNER,
        tagName: 'friends',
        createdAt: 1,
        contactWalletAddresses: [ALICE],
      }],
    }))
    await expect(loadActiveAddressBookSnapshot()).resolves.toEqual(expect.objectContaining({
      tags: [expect.objectContaining({ id: 'tag-1' })],
    }))

    await clearAddressBookSnapshot(OWNER)
    expect(testState.data.has(STORAGE_KEY)).toBe(false)
  })

  it('restores backed-up contacts as visible over locally hidden contacts', async () => {
    const {
      importActiveAddressBookBackupSnapshot,
      loadActiveAddressBookSnapshot,
      saveAddressBookSnapshot,
    } = await import('./addressBookStorage')
    const backup = createSnapshot()

    await saveAddressBookSnapshot(OWNER, testState.activeKey!, {
      ...backup,
      entries: backup.entries.map((entry) => ({
        ...entry,
        isHidden: true,
        updatedAt: 10,
      })),
    })

    await importActiveAddressBookBackupSnapshot(backup)

    await expect(loadActiveAddressBookSnapshot()).resolves.toEqual(expect.objectContaining({
      entries: [
        expect.objectContaining({
          walletAddress: ALICE,
          displayName: 'Alice',
          isSaved: true,
          isHidden: false,
        }),
      ],
    }))
  })

  it('rejects active-wallet helpers when wallet context is unavailable', async () => {
    const { loadActiveAddressBookSnapshot } = await import('./addressBookStorage')

    testState.wallet = null
    await expect(loadActiveAddressBookSnapshot()).rejects.toThrow('Wallet not connected')

    testState.wallet = { address: OWNER }
    testState.activeKey = null
    await expect(loadActiveAddressBookSnapshot()).rejects.toThrow('Address book key unavailable')
  })
})
