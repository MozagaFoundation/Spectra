/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import {
  mergeEasSubmitProfile,
  restoreEasConfig,
  runEasWithLocalSubmitProfile,
  writeMergedEasConfig,
} from './runEasBuildWithLocalSubmit.mjs'

const tempDirs = []

function createFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'spectra-eas-submit-run-'))
  tempDirs.push(dir)

  writeFileSync(join(dir, 'eas.json'), JSON.stringify({
    build: {
      production: { autoIncrement: true },
    },
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

  return dir
}

describe('runEasBuildWithLocalSubmit', () => {
  it('merges submit.production from the local override file', () => {
    const dir = createFixture()
    const { merged } = mergeEasSubmitProfile({ rootDir: dir })

    expect(merged.build.production.autoIncrement).toBe(true)
    expect(merged.submit.production.ios).toEqual({
      appleId: 'local@example.com',
      appleTeamId: 'LOCALTEAM',
      ascAppId: '1234567890',
    })
  })

  it('restores tracked eas.json after the EAS command finishes', () => {
    const dir = createFixture()
    const easJsonPath = join(dir, 'eas.json')
    const originalContents = readFileSync(easJsonPath, 'utf8')
    const spawn = vi.fn(() => ({ status: 0 }))

    const result = runEasWithLocalSubmitProfile(
      ['build', '--platform', 'ios', '--profile', 'production', '--auto-submit'],
      { rootDir: dir, spawn },
    )

    expect(result.status).toBe(0)
    expect(spawn).toHaveBeenCalledWith(
      'eas',
      ['build', '--platform', 'ios', '--profile', 'production', '--auto-submit'],
      expect.objectContaining({ cwd: dir }),
    )
    expect(readFileSync(easJsonPath, 'utf8')).toBe(originalContents)
  })

  it('restores tracked eas.json even when the EAS command fails', () => {
    const dir = createFixture()
    const easJsonPath = join(dir, 'eas.json')
    const originalContents = readFileSync(easJsonPath, 'utf8')

    runEasWithLocalSubmitProfile(['build'], {
      rootDir: dir,
      spawn: () => ({ status: 1 }),
    })
    expect(readFileSync(easJsonPath, 'utf8')).toBe(originalContents)
  })

  it('writes and restores merged config atomically for the command window', () => {
    const dir = createFixture()
    const easJsonPath = join(dir, 'eas.json')
    const { merged, originalContents } = mergeEasSubmitProfile({ rootDir: dir })

    writeMergedEasConfig(easJsonPath, merged)
    expect(JSON.parse(readFileSync(easJsonPath, 'utf8')).submit.production.ios.appleId)
      .toBe('local@example.com')

    restoreEasConfig(easJsonPath, originalContents)
    expect(JSON.parse(readFileSync(easJsonPath, 'utf8')).submit).toBeUndefined()
  })

  it('requires submit.production in the local override file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'spectra-eas-submit-run-'))
    writeFileSync(join(dir, 'eas.json'), JSON.stringify({ build: {} }, null, 2))
    writeFileSync(join(dir, 'eas.submit.local.json'), JSON.stringify({ submit: {} }, null, 2))

    expect(() => mergeEasSubmitProfile({ rootDir: dir }))
      .toThrow('eas.submit.local.json must define submit.production')
  })
})
