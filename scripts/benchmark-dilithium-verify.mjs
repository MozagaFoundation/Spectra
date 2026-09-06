/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { performance } from 'node:perf_hooks'
import { randomBytes } from 'node:crypto'
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'

const samples = Number.parseInt(process.env.DILITHIUM_VERIFY_SAMPLES || '25', 10)
const seed = randomBytes(32)
const { publicKey, secretKey } = ml_dsa65.keygen(seed)

function bytesToHex(bytes) {
  return `0x${Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

function hexToBytes(hex) {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex
  const bytes = new Uint8Array(cleanHex.length / 2)
  for (let index = 0; index < cleanHex.length; index += 2) {
    bytes[index / 2] = Number.parseInt(cleanHex.slice(index, index + 2), 16)
  }
  return bytes
}

const publicKeyHex = bytesToHex(publicKey)
const messages = Array.from(
  { length: samples },
  (_value, index) => new TextEncoder().encode(`message-${index}`),
)
const signatures = messages.map((message) => bytesToHex(ml_dsa65.sign(message, secretKey)))

const legacyStartedAt = performance.now()
for (let index = 0; index < samples; index += 1) {
  ml_dsa65.verify(hexToBytes(signatures[index]), messages[index], hexToBytes(publicKeyHex))
}
const legacyMs = performance.now() - legacyStartedAt

const publicKeyBytes = hexToBytes(publicKeyHex)
const reusedStartedAt = performance.now()
for (let index = 0; index < samples; index += 1) {
  ml_dsa65.verify(hexToBytes(signatures[index]), messages[index], publicKeyBytes)
}
const reusedMs = performance.now() - reusedStartedAt

console.log(JSON.stringify({
  primitive: 'ml_dsa65_verify',
  samples,
  legacy: {
    totalMs: Number(legacyMs.toFixed(2)),
    avgMs: Number((legacyMs / samples).toFixed(2)),
  },
  reusedPublicKey: {
    totalMs: Number(reusedMs.toFixed(2)),
    avgMs: Number((reusedMs / samples).toFixed(2)),
  },
  savedMs: Number((legacyMs - reusedMs).toFixed(2)),
  speedupPercent: Number((((legacyMs - reusedMs) / legacyMs) * 100).toFixed(2)),
}, null, 2))
