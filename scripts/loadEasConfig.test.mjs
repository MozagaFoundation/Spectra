/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { loadEasConfig } from './loadEasConfig.mjs'

describe('loadEasConfig', () => {
  it('returns base eas.json when no submit override exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'spectra-eas-config-'))
    writeFileSync(join(dir, 'eas.json'), JSON.stringify({
      cli: { version: '>= 18.0.5' },
      build: { production: { autoIncrement: true } },
    }, null, 2))

    expect(loadEasConfig({ rootDir: dir })).toEqual({
      cli: { version: '>= 18.0.5' },
      build: { production: { autoIncrement: true } },
    })
  })

  it('merges eas.submit.local.json into the base config', () => {
    const dir = mkdtempSync(join(tmpdir(), 'spectra-eas-config-'))
    writeFileSync(join(dir, 'eas.json'), JSON.stringify({
      build: { production: { autoIncrement: true } },
    }, null, 2))
    writeFileSync(join(dir, 'eas.submit.local.json'), JSON.stringify({
      submit: {
        production: {
          ios: {
            appleId: 'local@example.com',
            appleTeamId: 'LOCALTEAM',
            ascAppId: '1234567890',
          },
        },
      },
    }, null, 2))

    expect(loadEasConfig({ rootDir: dir })).toEqual({
      build: { production: { autoIncrement: true } },
      submit: {
        production: {
          ios: {
            appleId: 'local@example.com',
            appleTeamId: 'LOCALTEAM',
            ascAppId: '1234567890',
          },
        },
      },
    })
  })

  it('keeps committed eas.json free of submit credentials', () => {
    const config = JSON.parse(readFileSync(join(process.cwd(), 'eas.json'), 'utf8'))
    expect(config.submit).toBeUndefined()
  })

  it('merges local submit overrides for operator workflows', () => {
    try {
      readFileSync(join(process.cwd(), 'eas.submit.local.json'), 'utf8')
    } catch {
      return
    }

    const config = loadEasConfig()
    expect(config.submit?.production?.ios?.appleTeamId).toBeTruthy()
  })
})
