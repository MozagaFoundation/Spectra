/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

const fileState = vi.hoisted(() => ({
  exists: false,
  size: 0,
  chunks: [] as string[],
}))

vi.mock('expo-file-system', () => {
  class FileHandle {
    offset: number | null = 0
    size: number | null = fileState.size
    writeBytes(bytes: Uint8Array) {
      fileState.chunks.push(String.fromCharCode(...bytes))
      fileState.size += bytes.length
      fileState.exists = true
    }
    close() {}
  }

  class File {
    exists = fileState.exists
    size = fileState.size
    constructor(_directory: unknown, _name: string) {
      this.exists = fileState.exists
      this.size = fileState.size
    }
    create() {
      fileState.exists = true
      this.exists = true
    }
    delete() {
      fileState.exists = false
      fileState.size = 0
      fileState.chunks = []
      this.exists = false
      this.size = 0
    }
    open() {
      return new FileHandle()
    }
  }

  return {
    File,
    Paths: { document: { uri: 'file:///documents/' } },
  }
})

describe('devSessionLog', () => {
  afterEach(() => {
    fileState.exists = false
    fileState.size = 0
    fileState.chunks = []
    vi.unstubAllGlobals()
  })

  it('does not write outside development builds', async () => {
    ;(globalThis as { __DEV__?: boolean }).__DEV__ = false
    const { persistDevSessionLog } = await import('./devSessionLog')
    persistDevSessionLog('ChatCatchup', 'init_begin', { elapsedMs: 12 })
    await Promise.resolve()
    expect(fileState.chunks).toEqual([])
  })

  it('appends sanitized catch-up lines in development', async () => {
    ;(globalThis as { __DEV__?: boolean }).__DEV__ = true
    vi.resetModules()
    const { persistDevSessionLog } = await import('./devSessionLog')
    persistDevSessionLog('ChatCatchup', 'init_begin', {
      elapsedMs: 12,
      identityId: 'identity-private-123',
    })
    await vi.waitFor(() => {
      expect(fileState.chunks.length).toBeGreaterThan(0)
    })
    expect(fileState.chunks.join('')).toContain('"event":"init_begin"')
    expect(fileState.chunks.join('')).not.toContain('identity-private-123')
    expect(fileState.chunks.join('')).toContain('[redacted]')
  })
})
