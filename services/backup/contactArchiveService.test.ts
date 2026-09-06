/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const rootWallet = `EXO00${'a'.repeat(38)}`
const contactWallet = `EXO00${'b'.repeat(38)}`
const passphrase = 'Archive passphrase 123!'

const addressBookSnapshot = {
  version: 1,
  ownerWalletAddress: rootWallet,
  entries: [{
    key: `wallet:${contactWallet}`,
    walletAddress: contactWallet,
    displayName: 'Alice',
    isSaved: true,
    isHidden: false,
    createdAt: 1,
    updatedAt: 2,
  }],
  tags: [],
}

const mockState = vi.hoisted(() => ({
  deleteAsync: vi.fn(async () => undefined),
  exportActiveAddressBookBackupSnapshot: vi.fn(),
  getInfoAsync: vi.fn(),
  importActiveAddressBookBackupSnapshot: vi.fn(),
  makeDirectoryAsync: vi.fn(async () => undefined),
  protectSensitiveFilePath: vi.fn(async () => undefined),
  readAsStringAsync: vi.fn(),
  spectreEnabled: false,
  writeAsStringAsync: vi.fn(async () => undefined),
}))

function base64(value: Uint8Array | string): string {
  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString('base64')
  }
  return Buffer.from(value, 'utf8').toString('base64')
}

vi.mock('expo-crypto', () => ({
  getRandomBytesAsync: vi.fn(async () => new Uint8Array(12).fill(7)),
}))

vi.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  EncodingType: { UTF8: 'utf8' },
  deleteAsync: mockState.deleteAsync,
  getInfoAsync: mockState.getInfoAsync,
  makeDirectoryAsync: mockState.makeDirectoryAsync,
  readAsStringAsync: mockState.readAsStringAsync,
  writeAsStringAsync: mockState.writeAsStringAsync,
}))

vi.mock('@spectra/identity-vault', () => ({
  base64ToBytes: (value: string) => new Uint8Array(Buffer.from(value, 'base64')),
  bytesToBase64: base64,
  decrypt: (ciphertext: string) => Buffer.from(ciphertext, 'base64').toString('utf8'),
  deriveKeyAndHashAsync: vi.fn(async (_value: string, salt?: string, iterations?: number) => ({
    iterations: iterations ?? 600000,
    key: 'derived-key',
    salt: salt ?? 'archive-salt',
  })),
  encrypt: (plaintext: string) => ({
    ciphertext: Buffer.from(plaintext, 'utf8').toString('base64'),
    iv: 'archive-iv',
  }),
}))

vi.mock('@/services/storage/addressBookStorage', () => ({
  exportActiveAddressBookBackupSnapshot: mockState.exportActiveAddressBookBackupSnapshot,
  importActiveAddressBookBackupSnapshot: mockState.importActiveAddressBookBackupSnapshot,
}))

vi.mock('@/services/storage/sensitiveFileProtection', () => ({
  protectSensitiveFilePath: mockState.protectSensitiveFilePath,
}))

vi.mock('@/store/spectreStore', () => ({
  useSpectreStore: {
    getState: () => ({ enabled: mockState.spectreEnabled }),
  },
}))

vi.mock('@/store/walletStore', () => ({
  useWalletStore: {
    getState: () => ({
      getActiveWallet: () => ({
        address: rootWallet,
        id: 'root-wallet',
        spectreMode: false,
      }),
      isVaultUnlocked: true,
    }),
  },
}))

describe('contactArchiveService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.exportActiveAddressBookBackupSnapshot.mockResolvedValue(addressBookSnapshot)
    mockState.getInfoAsync.mockResolvedValue({ exists: true, size: 1024 })
    mockState.importActiveAddressBookBackupSnapshot.mockResolvedValue(addressBookSnapshot)
    mockState.spectreEnabled = false
  })

  it('creates a contacts-only encrypted archive', async () => {
    const { createContactArchive } = await import('./contactArchiveService')

    const archive = await createContactArchive(passphrase)
    const capsule = JSON.parse(archive.capsuleJson) as {
      ciphertext: string
      encryption: { algorithm: string; iterations: number }
      ownerWalletAddress: string
    }

    expect(archive.summary).toEqual({ contacts: 1 })
    expect(capsule.ownerWalletAddress).toBe(rootWallet)
    expect(capsule.encryption).toEqual(expect.objectContaining({
      algorithm: 'AES-256-GCM',
      iterations: 600000,
    }))
    expect(capsule.ciphertext).not.toContain('Alice')
  })

  it('writes a protected temporary archive file', async () => {
    const { writeContactArchiveFile } = await import('./contactArchiveService')

    const uri = await writeContactArchiveFile('{"encrypted":true}')

    expect(uri).toMatch(/^file:\/\/\/cache\/spectra-contact-archives\/spectra-contacts-/)
    expect(mockState.makeDirectoryAsync).toHaveBeenCalledTimes(1)
    expect(mockState.protectSensitiveFilePath).toHaveBeenCalledWith(
      'file:///cache/spectra-contact-archives/',
    )
    expect(mockState.protectSensitiveFilePath).toHaveBeenCalledWith(uri)
  })

  it('validates and imports an archive only for its owner wallet', async () => {
    const { createContactArchive, restoreContactArchive } = await import('./contactArchiveService')
    const archive = await createContactArchive(passphrase)
    mockState.readAsStringAsync.mockResolvedValue(archive.capsuleJson)

    const summary = await restoreContactArchive('file:///cache/import.spectra-contacts', passphrase)

    expect(summary).toEqual({ contacts: 1 })
    expect(mockState.importActiveAddressBookBackupSnapshot).toHaveBeenCalledWith(
      addressBookSnapshot,
      {},
    )
  })

  it('rejects an archive without a verified file size before reading it', async () => {
    const { restoreContactArchive } = await import('./contactArchiveService')
    mockState.getInfoAsync.mockResolvedValue({ exists: true })

    await expect(
      restoreContactArchive('file:///cache/import.spectra-contacts', passphrase),
    ).rejects.toThrow('Contact archive is unavailable or too large')
    expect(mockState.readAsStringAsync).not.toHaveBeenCalled()
  })

  it('restores the prior address book if import fails', async () => {
    const { createContactArchive, restoreContactArchive } = await import('./contactArchiveService')
    const archive = await createContactArchive(passphrase)
    mockState.readAsStringAsync.mockResolvedValue(archive.capsuleJson)
    mockState.importActiveAddressBookBackupSnapshot
      .mockRejectedValueOnce(new Error('storage failed'))
      .mockResolvedValueOnce(addressBookSnapshot)

    await expect(
      restoreContactArchive('file:///cache/import.spectra-contacts', passphrase),
    ).rejects.toThrow('storage failed')
    expect(mockState.importActiveAddressBookBackupSnapshot).toHaveBeenLastCalledWith(
      addressBookSnapshot,
      { replaceExisting: true },
    )
  })
})
