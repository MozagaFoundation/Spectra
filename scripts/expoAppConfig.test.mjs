/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { deepMerge, loadExpoAppConfig } from './expoAppConfig.mjs'

const tempDirs = []

function createFixture(baseExpo, localModuleSource = null) {
  const dir = mkdtempSync(join(tmpdir(), 'spectra-expo-config-'))
  tempDirs.push(dir)

  writeFileSync(
    join(dir, 'app.json'),
    JSON.stringify({ expo: baseExpo }, null, 2),
  )

  if (localModuleSource) {
    writeFileSync(join(dir, 'app.config.local.js'), localModuleSource)
  }

  return dir
}

afterEach(() => {
  tempDirs.length = 0
})

describe('deepMerge', () => {
  it('merges nested ios and extra fields without dropping base keys', () => {
    const merged = deepMerge(
      {
        name: 'Spectra',
        ios: {
          bundleIdentifier: 'org.spectramozaga.exo',
          infoPlist: {
            NSAllowsLocalNetworking: true,
          },
        },
        extra: {
          router: {},
        },
      },
      {
        ios: {
          appleTeamId: 'TEAM123',
          infoPlist: {
            NSFaceIDUsageDescription: 'Unlock',
          },
        },
        extra: {
          eas: { projectId: 'project-id' },
        },
      },
    )

    expect(merged.name).toBe('Spectra')
    expect(merged.ios.bundleIdentifier).toBe('org.spectramozaga.exo')
    expect(merged.ios.appleTeamId).toBe('TEAM123')
    expect(merged.ios.infoPlist).toEqual({
      NSAllowsLocalNetworking: true,
      NSFaceIDUsageDescription: 'Unlock',
    })
    expect(merged.extra).toEqual({
      router: {},
      eas: { projectId: 'project-id' },
    })
  })

  it('returns override values for non-object replacements', () => {
    expect(deepMerge({ ios: { bundleIdentifier: 'base' } }, { ios: { bundleIdentifier: 'override' } }))
      .toEqual({ ios: { bundleIdentifier: 'override' } })
  })
})

describe('loadExpoAppConfig', () => {
  it('returns the base app.json config when no local override exists', () => {
    const dir = createFixture({
      name: 'Spectra',
      slug: 'spectra',
      ios: { bundleIdentifier: 'org.spectramozaga.exo' },
    })

    expect(loadExpoAppConfig({ rootDir: dir })).toEqual({
      name: 'Spectra',
      slug: 'spectra',
      ios: { bundleIdentifier: 'org.spectramozaga.exo' },
    })
  })

  it('applies local overrides from app.config.local.js', () => {
    const dir = createFixture(
      {
        name: 'Spectra',
        ios: {
          bundleIdentifier: 'org.spectramozaga.exo',
          infoPlist: {
            NSAppTransportSecurity: {
              NSAllowsLocalNetworking: true,
            },
          },
        },
        extra: { router: {} },
      },
      `module.exports = {
        ios: {
          bundleIdentifier: 'com.example.local',
          appleTeamId: 'LOCALTEAM',
          infoPlist: {
            NSAppTransportSecurity: {
              NSAllowsArbitraryLoads: false,
            },
          },
        },
        extra: {
          eas: { projectId: 'local-project-id' },
        },
      };`,
    )

    const config = loadExpoAppConfig({ rootDir: dir })
    expect(config.ios.bundleIdentifier).toBe('com.example.local')
    expect(config.ios.appleTeamId).toBe('LOCALTEAM')
    expect(config.ios.infoPlist.NSAppTransportSecurity).toEqual({
      NSAllowsArbitraryLoads: false,
      NSAllowsLocalNetworking: true,
    })
    expect(config.extra).toEqual({
      router: {},
      eas: { projectId: 'local-project-id' },
    })
  })

  it('loads the repository merged config without throwing', () => {
    const config = loadExpoAppConfig()
    expect(config.name).toBe('Spectra')
    expect(config.slug).toBe('spectra')
  })

  it('keeps generic identifiers in tracked app.json', () => {
    const base = JSON.parse(readFileSync(join(process.cwd(), 'app.json'), 'utf8')).expo
    expect(base.ios.bundleIdentifier).toBe('org.spectramozaga.exo')
    expect(base.android.package).toBe('com.mozaga.exo')
    expect(base.extra?.eas?.projectId).toBeUndefined()
  })

  it('loads the repository local override when present', () => {
    const localPath = join(process.cwd(), 'app.config.local.js')
    try {
      readFileSync(localPath, 'utf8')
    } catch {
      return
    }

    const config = loadExpoAppConfig()
    expect(config.ios.bundleIdentifier).toBe('org.spectramozaga.exo')
    expect(config.extra.eas.projectId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu,
    )
  })
})
