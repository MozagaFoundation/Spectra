/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { sha256 } from '@noble/hashes/sha256'

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const BECH32_ALPHABET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'

export function base58Encode(bytes: Uint8Array): string {
  let value = 0n
  for (const byte of bytes) {
    value = (value << 8n) + BigInt(byte)
  }

  let encoded = ''
  while (value > 0n) {
    const mod = Number(value % 58n)
    encoded = BASE58_ALPHABET[mod] + encoded
    value /= 58n
  }

  for (const byte of bytes) {
    if (byte !== 0) break
    encoded = BASE58_ALPHABET[0] + encoded
  }

  return encoded || BASE58_ALPHABET[0]
}

export function base58CheckEncode(payload: Uint8Array): string {
  const checksum = sha256(sha256(payload)).slice(0, 4)
  const data = new Uint8Array(payload.length + checksum.length)
  data.set(payload)
  data.set(checksum, payload.length)
  return base58Encode(data)
}

function bech32Polymod(values: number[]): number {
  const generators = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]
  let chk = 1

  for (const value of values) {
    const top = chk >> 25
    chk = ((chk & 0x1ffffff) << 5) ^ value
    for (let i = 0; i < 5; i++) {
      if ((top >> i) & 1) {
        chk ^= generators[i]
      }
    }
  }

  return chk
}

function bech32HrpExpand(hrp: string): number[] {
  const values: number[] = []
  for (let i = 0; i < hrp.length; i++) values.push(hrp.charCodeAt(i) >> 5)
  values.push(0)
  for (let i = 0; i < hrp.length; i++) values.push(hrp.charCodeAt(i) & 31)
  return values
}

function bech32CreateChecksum(hrp: string, data: number[]): number[] {
  const values = [...bech32HrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0]
  const polymod = bech32Polymod(values) ^ 1
  const checksum: number[] = []
  for (let i = 0; i < 6; i++) {
    checksum.push((polymod >> (5 * (5 - i))) & 31)
  }
  return checksum
}

function convertBits(data: Uint8Array, fromBits: number, toBits: number, pad: boolean): number[] {
  let acc = 0
  let bits = 0
  const ret: number[] = []
  const maxv = (1 << toBits) - 1
  const maxAcc = (1 << (fromBits + toBits - 1)) - 1

  for (const value of data) {
    if (value < 0 || value >> fromBits !== 0) throw new Error('Invalid bech32 data')
    acc = ((acc << fromBits) | value) & maxAcc
    bits += fromBits
    while (bits >= toBits) {
      bits -= toBits
      ret.push((acc >> bits) & maxv)
    }
  }

  if (pad) {
    if (bits > 0) ret.push((acc << (toBits - bits)) & maxv)
  } else if (bits >= fromBits || ((acc << (toBits - bits)) & maxv)) {
    throw new Error('Invalid bech32 padding')
  }

  return ret
}

export function bech32Encode(hrp: string, data: number[]): string {
  const combined = [...data, ...bech32CreateChecksum(hrp, data)]
  return `${hrp}1${combined.map((value) => BECH32_ALPHABET[value]).join('')}`
}

export function encodeSegwitAddress(hrp: string, witnessVersion: number, witnessProgram: Uint8Array): string {
  if (witnessVersion < 0 || witnessVersion > 16) {
    throw new Error('Invalid witness version')
  }
  return bech32Encode(hrp, [witnessVersion, ...convertBits(witnessProgram, 8, 5, true)])
}
