/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { deepMerge } from './expoAppConfig.mjs'

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function readOptionalJson(path) {
  try {
    return readJson(path)
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return {}
    }
    throw error
  }
}

export function loadEasConfig(options = {}) {
  const rootDir = options.rootDir ?? resolve(import.meta.dirname, '..')
  const basePath = options.basePath ?? resolve(rootDir, 'eas.json')
  const localPath = options.localPath ?? resolve(rootDir, 'eas.submit.local.json')

  const base = readJson(basePath)
  const local = readOptionalJson(localPath)
  return deepMerge(base, local)
}
