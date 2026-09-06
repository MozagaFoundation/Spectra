/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function deepMerge(base, override) {
  if (!isPlainObject(base)) {
    return override ?? base
  }
  if (!isPlainObject(override)) {
    return base
  }

  const result = { ...base }
  for (const [key, value] of Object.entries(override)) {
    if (isPlainObject(value) && isPlainObject(result[key])) {
      result[key] = deepMerge(result[key], value)
    } else {
      result[key] = value
    }
  }
  return result
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function loadOptionalModule(path) {
  try {
    const moduleRef = require(path)
    return moduleRef?.default ?? moduleRef ?? {}
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error.code === 'MODULE_NOT_FOUND' || error.code === 'ERR_MODULE_NOT_FOUND')
    ) {
      return {}
    }
    throw error
  }
}

export function loadExpoAppConfig(options = {}) {
  const rootDir = options.rootDir ?? resolve(import.meta.dirname, '..')
  const basePath = options.basePath ?? resolve(rootDir, 'app.json')
  const localPath = options.localPath ?? resolve(rootDir, 'app.config.local.js')

  const base = readJson(basePath).expo
  const local = loadOptionalModule(localPath)
  return deepMerge(base, local)
}
