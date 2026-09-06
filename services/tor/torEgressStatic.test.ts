/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '../..')
const SOURCE_DIRECTORIES = ['app', 'components', 'contexts', 'hooks', 'lib', 'services', 'store']
const NETWORK_PRIMITIVES = [
  { name: 'bare fetch', pattern: /(?<![\w.])fetch\s*\(/ },
  { name: 'global fetch', pattern: /globalThis\.fetch/ },
  { name: 'XMLHttpRequest', pattern: /new\s+XMLHttpRequest\s*\(/ },
  { name: 'native download', pattern: /\.downloadAsync\s*\(/ },
  { name: 'native upload', pattern: /\.createUploadTask\s*\(/ },
  { name: 'push token request', pattern: /\.getExpoPushTokenAsync\s*\(/ },
  { name: 'server-sent events', pattern: /from\s+['"]react-native-sse['"]/ },
  { name: 'websocket', pattern: /new\s+\w*WebSocket\s*\(/ },
  { name: 'HTTP client import', pattern: /from\s+['"](?:axios|got|ky|superagent)['"]/ },
]
const ALLOWED_FILES = new Set([
  'services/backend/realtime.ts',
  'services/notifications/pushService.ts',
  'services/tor/torBridgeService.ts',
  'services/tor/torFetch.ts',
  'services/tor/torUpload.ts',
])
const EXTERNAL_HANDOFF_ALLOWED_FILES = new Set([
  'services/media/exportService.ts',
  'services/tor/externalLinkPolicy.ts',
])

function sourceFiles(directory: string): string[] {
  const entries = readdirSync(directory, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    if (!['.ts', '.tsx'].includes(extname(entry.name)) || /\.test\.[^.]+$/.test(entry.name)) {
      return []
    }
    return [path]
  })
}

describe('Tor egress static boundary', () => {
  it('keeps raw network primitives inside reviewed transport adapters', () => {
    const violations: string[] = []
    for (const directory of SOURCE_DIRECTORIES) {
      for (const path of sourceFiles(join(ROOT, directory))) {
        const sourcePath = relative(ROOT, path)
        if (ALLOWED_FILES.has(sourcePath)) continue
        const source = readFileSync(path, 'utf8')
        for (const primitive of NETWORK_PRIMITIVES) {
          if (primitive.pattern.test(source)) {
            violations.push(`${sourcePath}: ${primitive.name}`)
          }
        }
      }
    }

    expect(violations).toEqual([])
  })

  it('routes system browser handoffs through the privacy policy', () => {
    const violations: string[] = []
    for (const directory of SOURCE_DIRECTORIES) {
      for (const path of sourceFiles(join(ROOT, directory))) {
        const sourcePath = relative(ROOT, path)
        if (EXTERNAL_HANDOFF_ALLOWED_FILES.has(sourcePath)) continue
        if (/Linking\.openURL\s*\(/.test(readFileSync(path, 'utf8'))) {
          violations.push(sourcePath)
        }
      }
    }

    expect(violations).toEqual([])
  })

  it('requires an explicit backend transport', () => {
    const backend = readFileSync(
      join(ROOT, 'packages/spectra-core-crypto/src/server/backend.ts'),
      'utf8',
    )
    const factory = readFileSync(
      join(ROOT, 'packages/spectra-core-crypto/src/server/index.ts'),
      'utf8',
    )

    expect(backend).not.toContain('globalThis.fetch.bind(globalThis)')
    expect(factory).toContain('Backend bundle server requires an explicit transport')
  })
})
