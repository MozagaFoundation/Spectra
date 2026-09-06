/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const appDirectory = join(dirname(fileURLToPath(import.meta.url)), '..', 'app')
const testFilePattern = /\.(?:test|spec)\.[jt]sx?$/

function findTestFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return findTestFiles(path)
    return testFilePattern.test(entry.name) ? [relative(appDirectory, path)] : []
  })
}

describe('Expo Router app tree', () => {
  it('contains only routes and layouts', () => {
    expect(findTestFiles(appDirectory)).toEqual([])
  })
})
