/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { randomBytes } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { gcm } from '@noble/ciphers/aes'
import { sha256 } from '@noble/hashes/sha256'

const sizeMb = Number.parseFloat(process.env.MEDIA_BENCH_SIZE_MB || '8')
const samples = Number.parseInt(process.env.MEDIA_BENCH_SAMPLES || '5', 10)
const sizeBytes = Math.max(1, Math.floor(sizeMb * 1024 * 1024))
const content = randomBytes(sizeBytes)
const key = randomBytes(32)

function encryptOnce() {
  const nonce = randomBytes(12)
  gcm(key, nonce).encrypt(content)
}

function measure(fn) {
  const startedAt = performance.now()
  fn()
  return performance.now() - startedAt
}

const legacy = []
const optimized = []

for (let index = 0; index < samples; index += 1) {
  legacy.push(measure(() => {
    sha256(content)
    sha256(content)
    encryptOnce()
  }))

  optimized.push(measure(() => {
    sha256(content)
    encryptOnce()
  }))
}

function summarize(values) {
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length
  return {
    samplesMs: values.map((value) => Number(value.toFixed(2))),
    avgMs: Number(avg.toFixed(2)),
    minMs: Number(Math.min(...values).toFixed(2)),
    maxMs: Number(Math.max(...values).toFixed(2)),
  }
}

const legacySummary = summarize(legacy)
const optimizedSummary = summarize(optimized)
const savedMs = legacySummary.avgMs - optimizedSummary.avgMs

console.log(JSON.stringify({
  primitive: 'media_hash_encrypt_js',
  sizeBytes,
  samples,
  legacyDoubleHash: legacySummary,
  optimizedSingleHash: optimizedSummary,
  savedAvgMs: Number(savedMs.toFixed(2)),
  speedupPercent: Number(((savedMs / legacySummary.avgMs) * 100).toFixed(2)),
}, null, 2))
