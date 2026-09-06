/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { randomBytes } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { pbkdf2 } from '@noble/hashes/pbkdf2'
import { sha256 } from '@noble/hashes/sha256'

const iterations = Number.parseInt(process.env.PBKDF2_ITERATIONS || '100000', 10)
const samples = Number.parseInt(process.env.PBKDF2_SAMPLES || '8', 10)
const pin = process.env.PBKDF2_PIN || '123456'
const salt = randomBytes(16)
const timings = []

for (let index = 0; index < samples; index += 1) {
  const startedAt = performance.now()
  pbkdf2(sha256, pin, salt, { c: iterations, dkLen: 32 })
  timings.push(performance.now() - startedAt)
}

const average = timings.reduce((total, value) => total + value, 0) / timings.length

console.log(JSON.stringify({
  primitive: 'pbkdf2_sha256_js',
  iterations,
  samples,
  samplesMs: timings.map((value) => Number(value.toFixed(2))),
  avgMs: Number(average.toFixed(2)),
  minMs: Number(Math.min(...timings).toFixed(2)),
  maxMs: Number(Math.max(...timings).toFixed(2)),
}, null, 2))
