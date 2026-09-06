/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const rootDir = resolve(import.meta.dirname, '..')
const productionBackendUrl =
  'https://zaobpddfzrwbijfzohxs.supabase.co/functions/v1/spectra-api'

const FORBIDDEN_PUBLIC_MARKERS = [
  'manuelaaronfajardogarcia',
  'U45L7EZNX5',
  '6765568873',
  'kxindigbnjqtllyuhgho.supabase.co',
]
const FORBIDDEN_PUBLIC_PATTERNS = [
  /@[a-z0-9.-]*hotmail\.com/iu,
  /(?:projectId|project_id)\s*[:=]\s*['"]?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/iu,
]

const TRACKED_PUBLIC_FILES = [
  'app.json',
  'eas.json',
  '.env.example',
  'supabase/config.toml',
  'supabase/deno.json',
  'supabase/functions/deno.json',
]

function readTrackedFile(relativePath) {
  return readFileSync(resolve(rootDir, relativePath), 'utf8')
}

describe('public config guards', () => {
  it.each(TRACKED_PUBLIC_FILES)('does not expose private markers in %s', (relativePath) => {
    const contents = readTrackedFile(relativePath).toLowerCase()
    for (const marker of FORBIDDEN_PUBLIC_MARKERS) {
      expect(contents.includes(marker.toLowerCase())).toBe(false)
    }
    for (const pattern of FORBIDDEN_PUBLIC_PATTERNS) {
      expect(contents).not.toMatch(pattern)
    }
  })

  it('uses production bundle identifiers in app.json', () => {
    const appJson = JSON.parse(readTrackedFile('app.json'))
    expect(appJson.expo.ios.bundleIdentifier).toBe('org.spectramozaga.exo')
    expect(appJson.expo.android.package).toBe('com.mozaga.exo')
    expect(appJson.expo.extra?.eas?.projectId).toBeUndefined()
  })

  it('documents local override templates for private identifiers', () => {
    expect(readTrackedFile('app.config.local.example.js')).toContain('app.config.local.js')
    expect(readTrackedFile('eas.submit.example.json')).toContain('REPLACE_WITH_APPLE_TEAM_ID')
  })

  it('keeps tracked Supabase config local and secret-free', () => {
    const config = readTrackedFile('supabase/config.toml')
    expect(config).toContain('project_id = "spectra"')
    expect(config).not.toMatch(/project_ref|access_token|service_role_key/i)
  })

  it('uses the direct Supabase Edge route without legacy backend trust entries', () => {
    expect(readTrackedFile('.env.example')).toContain(
      'EXPO_PUBLIC_SPECTRA_API_URL=http://127.0.0.1:54321/functions/v1/spectra-api',
    )
    const trustConfig = [
      readTrackedFile('plugins/withCertificatePinning.js'),
      readTrackedFile('android/app/src/main/res/xml/network_security_config.xml'),
      readTrackedFile('ios/Spectra/Info.plist'),
    ].join('\n')
    expect(trustConfig).toContain(productionBackendUrl)
    expect(trustConfig).not.toMatch(/backend[.]co|api[.]spectraprotocol[.]org/)
  })
})
