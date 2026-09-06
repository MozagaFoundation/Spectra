/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createSanitizedConsole,
  mobileLogDebug,
  sanitizeMobileLogFields,
} from './mobileLogger'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('mobileLogger', () => {
  it('redacts every production-sensitive mobile value recursively', () => {
    const sensitiveValues = {
      accessToken: 'token-value-that-must-not-survive',
      walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
      recipientIdentityId: 'identity-private-123',
      messageContent: 'the private message body',
      fileName: 'medical-results.pdf',
      url: 'https://example.test/private?token=abc',
      bleRouteId: 'ble-route-peer-123',
      encryptionKey: 'base64-private-key-material',
      nested: {
        objectRef: 'spectra://objects/chat-media/private',
        privateKey: 'deadbeef'.repeat(8),
      },
      error: 'failed medical-results.pdf for identity-private-123',
    }

    const serialized = JSON.stringify(sanitizeMobileLogFields(sensitiveValues))
    for (const secret of [
      'token-value-that-must-not-survive',
      '0x1234567890abcdef1234567890abcdef12345678',
      'identity-private-123',
      'the private message body',
      'medical-results.pdf',
      'https://example.test/private',
      'ble-route-peer-123',
      'base64-private-key-material',
      'spectra://objects/',
      'deadbeef',
      'failed medical-results.pdf',
    ]) {
      expect(serialized).not.toContain(secret)
    }
  })

  it('suppresses verbose logging outside development builds', () => {
    vi.stubGlobal('__DEV__', false)
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    mobileLogDebug('Media', 'validated', { fileName: 'private.png' })

    expect(log).not.toHaveBeenCalled()
  })

  it('emits only sanitized structured fields in development', () => {
    vi.stubGlobal('__DEV__', true)
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    mobileLogDebug('Media', 'validated', {
      fileName: 'private.png',
      fileSize: 42,
    })

    expect(log).toHaveBeenCalledWith('[Media] validated', {
      fileName: '[redacted]',
      fileSize: 42,
    })
  })

  it('redacts compatibility console arguments', () => {
    vi.stubGlobal('__DEV__', true)
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    createSanitizedConsole('Tor').log(
      'request',
      'https://example.test/private?token=abc',
      { walletAddress: 'EXO00123456789012345678901234567890123456' },
    )

    expect(log).toHaveBeenCalledWith('[Tor] diagnostic', {
      values: [
        'request',
        '[redacted]',
        { walletAddress: '[redacted]' },
      ],
    })
  })
})
