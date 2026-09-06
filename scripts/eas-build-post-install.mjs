/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { spawnSync } from 'node:child_process'

const platform = process.env.EAS_BUILD_PLATFORM

if (platform === 'android') {
  console.log('Skipping iOS privacy verification for Android EAS build.')
  process.exit(0)
}

const result = spawnSync('npm', ['run', 'verify:ios-privacy'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

process.exit(result.status ?? 1)
