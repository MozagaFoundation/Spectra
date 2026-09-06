/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadEasConfig } from './loadEasConfig.mjs'

function printUsage() {
  console.error('Usage: node ./scripts/runEasBuildWithLocalSubmit.mjs -- <eas args...>')
  console.error('Example: EXPO_APPLE_ID=you@example.com npm run eas:build:ios:production:submit')
}

export function mergeEasSubmitProfile(options = {}) {
  const rootDir = options.rootDir ?? resolve(import.meta.dirname, '..')
  const easJsonPath = options.easJsonPath ?? resolve(rootDir, 'eas.json')
  const localPath = options.localPath ?? resolve(rootDir, 'eas.submit.local.json')

  if (!existsSync(localPath)) {
    throw new Error(
      'Missing eas.submit.local.json. Copy eas.submit.example.json and fill in your Apple submit values.',
    )
  }

  const merged = loadEasConfig({ rootDir, basePath: easJsonPath, localPath })
  if (!merged.submit?.production) {
    throw new Error('eas.submit.local.json must define submit.production for --auto-submit.')
  }

  return {
    easJsonPath,
    merged,
    originalContents: readFileSync(easJsonPath, 'utf8'),
  }
}

export function writeMergedEasConfig(easJsonPath, merged) {
  writeFileSync(easJsonPath, `${JSON.stringify(merged, null, 2)}\n`)
}

export function restoreEasConfig(easJsonPath, originalContents) {
  writeFileSync(easJsonPath, originalContents)
}

export function runEasWithLocalSubmitProfile(easArgs, options = {}) {
  const { easJsonPath, merged, originalContents } = mergeEasSubmitProfile(options)
  const spawn = options.spawn ?? ((command, args, spawnOptions) => spawnSync(command, args, spawnOptions))
  const cwd = options.rootDir ?? resolve(import.meta.dirname, '..')

  writeMergedEasConfig(easJsonPath, merged)
  try {
    return spawn('eas', easArgs, {
      stdio: 'inherit',
      cwd,
      env: process.env,
    })
  } finally {
    restoreEasConfig(easJsonPath, originalContents)
  }
}

function main() {
  const separatorIndex = process.argv.indexOf('--')
  const easArgs = separatorIndex >= 0
    ? process.argv.slice(separatorIndex + 1)
    : ['build', '--platform', 'ios', '--profile', 'production', '--auto-submit']

  if (easArgs.length === 0) {
    printUsage()
    process.exit(1)
  }

  let result
  try {
    result = runEasWithLocalSubmitProfile(easArgs)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    process.exit(1)
  }

  process.exit(result.status ?? 1)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
