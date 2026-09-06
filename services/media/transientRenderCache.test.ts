/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  directories: new Set<string>(),
  files: new Map<string, Uint8Array>(),
  protectPath: vi.fn(async (_path: string) => {}),
  moduleAvailable: true,
}))

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  NativeModules: {
    get AttachmentFileProtection() {
      return mockState.moduleAvailable
        ? { protectPath: mockState.protectPath }
        : undefined
    },
  },
}))

vi.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  deleteAsync: vi.fn(async (uri: string) => {
    mockState.files.forEach((_value, path) => {
      if (path.startsWith(uri)) mockState.files.delete(path)
    })
    mockState.directories.delete(uri)
  }),
  getInfoAsync: vi.fn(async (uri: string) => ({
    exists: mockState.directories.has(uri) || mockState.files.has(uri),
  })),
  makeDirectoryAsync: vi.fn(async (uri: string) => {
    mockState.directories.add(uri)
  }),
}))

vi.mock('expo-file-system', () => ({
  File: class MockFile {
    constructor(public readonly uri: string) {}

    create() {
      mockState.files.set(this.uri, new Uint8Array())
    }

    open() {
      const uri = this.uri
      return {
        writeBytes(bytes: Uint8Array) {
          const existing = mockState.files.get(uri) ?? new Uint8Array()
          const next = new Uint8Array(existing.length + bytes.length)
          next.set(existing)
          next.set(bytes, existing.length)
          mockState.files.set(uri, next)
        },
        close() {},
      }
    }
  },
}))

describe('transientRenderCache', () => {
  beforeEach(() => {
    vi.resetModules()
    mockState.directories.clear()
    mockState.files.clear()
    mockState.protectPath.mockClear()
    mockState.moduleAvailable = true
  })

  it('protects the directory before writing and protects the completed file', async () => {
    const {
      getTransientRenderPath,
      writeTransientRenderFile,
    } = await import('./transientRenderCache')
    const uri = getTransientRenderPath('media-1', 'jpg')

    await writeTransientRenderFile(uri, [
      new Uint8Array([1, 2]),
      new Uint8Array([3]),
    ])

    expect(mockState.protectPath.mock.calls[0]?.[0]).toBe(
      'file:///cache/spectra-transient-render-v1/',
    )
    expect(mockState.protectPath).toHaveBeenLastCalledWith(uri)
    expect([...mockState.files.get(uri) ?? []]).toEqual([1, 2, 3])
  })

  it('isolates transient render paths by wallet scope', async () => {
    const { getTransientRenderPath } = await import('./transientRenderCache')

    expect(getTransientRenderPath('media-1', 'jpg', 'wallet-a')).not.toBe(
      getTransientRenderPath('media-1', 'jpg', 'wallet-b'),
    )
    expect(() => getTransientRenderPath('media-1', 'jpg', '../wallet')).toThrow(
      'Invalid transient render scope',
    )
  })

  it('fails closed on iOS when the native protection bridge is unavailable', async () => {
    mockState.moduleAvailable = false
    const { initializeTransientRenderCache } = await import('./transientRenderCache')

    await expect(initializeTransientRenderCache()).rejects.toThrow(
      'iOS file protection is unavailable',
    )
  })
})
