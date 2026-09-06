/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const rootDir = resolve(import.meta.dirname, '..')
const read = (path) => readFileSync(resolve(rootDir, path), 'utf8')

describe('mobile security release guards', () => {
  it('keeps untrusted media behind the app-owned ingress validator', () => {
    const ingress = read('services/media/mediaIngress.ts')
    const outgoing = read('services/media/outgoingAttachment.ts')
    const shareImport = read('services/media/shareImport.ts')

    expect(ingress).toContain('copyIntoAppOwnedIngress')
    expect(ingress).toContain('inspectMediaIngressBytes')
    expect(ingress).toContain('computeContentHash(bytes)')
    expect(outgoing).toContain('stageAndValidateMediaIngress')
    expect(shareImport).toContain('expectedDigest: digest')
    expect(shareImport).toContain('requireDeclaredSizeMatch: true')
  })

  it('blocks direct console bypasses at hardened mobile boundaries', () => {
    for (const path of [
      'services/call/callDiagnostics.ts',
      'services/chat/chatDiagnostics.ts',
      'services/media/attachmentHydration.ts',
      'services/media/exportService.ts',
      'services/media/mediaService.ts',
      'services/media/outgoingAttachment.ts',
      'services/notifications/callNotificationTask.ts',
      'services/tor/torDiagnostics.ts',
    ]) {
      expect(read(path), path).not.toMatch(/console\.(?:debug|error|info|log|warn)\s*\(/)
    }
  })

  it('keeps sensitive log categories covered by regression tests', () => {
    const loggerTest = read('services/logging/mobileLogger.test.ts')
    for (const marker of [
      'accessToken',
      'walletAddress',
      'recipientIdentityId',
      'messageContent',
      'fileName',
      'url',
      'bleRouteId',
      'encryptionKey',
      'objectRef',
      'privateKey',
    ]) {
      expect(loggerTest).toContain(marker)
    }
  })
})
