/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { sha256 } from '@noble/hashes/sha256'

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const BECH32_ALPHABET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'
const MAX_BASE58_DECODE_LENGTH = 512
const MAX_BECH32_DECODE_LENGTH = 90

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

export function base58Decode(value: string): Uint8Array {
  if (value.length > MAX_BASE58_DECODE_LENGTH) {
    throw new Error('Base58 value is too long')
  }

  let decoded = 0n
  for (const char of value) {
    const index = BASE58_ALPHABET.indexOf(char)
    if (index < 0) {
      throw new Error('Invalid base58 character')
    }
    decoded = decoded * 58n + BigInt(index)
  }

  let hex = decoded.toString(16)
  if (hex.length % 2) hex = `0${hex}`
  const bytes = hex === '00'
    ? new Uint8Array(0)
    : new Uint8Array(hex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || [])

  let leadingZeros = 0
  for (const char of value) {
    if (char !== BASE58_ALPHABET[0]) break
    leadingZeros++
  }

  if (leadingZeros === 0) return bytes
  const result = new Uint8Array(leadingZeros + bytes.length)
  result.set(bytes, leadingZeros)
  return result
}

export function base58CheckDecode(value: string): Uint8Array {
  const decoded = base58Decode(value)
  if (decoded.length < 5) {
    throw new Error('Invalid base58check payload')
  }
  const payload = decoded.slice(0, -4)
  const checksum = decoded.slice(-4)
  const expected = sha256(sha256(payload)).slice(0, 4)
  for (let i = 0; i < 4; i++) {
    if (checksum[i] !== expected[i]) {
      throw new Error('Invalid base58check checksum')
    }
  }
  return payload
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

function bech32Decode(value: string): { hrp: string; data: number[] } {
  if (value.length > MAX_BECH32_DECODE_LENGTH) {
    throw new Error('Invalid bech32 string')
  }

  const normalized = value.toLowerCase()
  if (value !== normalized && value !== value.toUpperCase()) {
    throw new Error('Mixed-case bech32 string')
  }

  const separatorIndex = normalized.lastIndexOf('1')
  if (separatorIndex <= 0 || separatorIndex + 7 > normalized.length) {
    throw new Error('Invalid bech32 string')
  }

  const hrp = normalized.slice(0, separatorIndex)
  const data = normalized
    .slice(separatorIndex + 1)
    .split('')
    .map((char) => {
      const index = BECH32_ALPHABET.indexOf(char)
      if (index < 0) throw new Error('Invalid bech32 character')
      return index
    })

  if (bech32Polymod([...bech32HrpExpand(hrp), ...data]) !== 1) {
    throw new Error('Invalid bech32 checksum')
  }

  return { hrp, data: data.slice(0, -6) }
}

export function decodeSegwitAddress(address: string): {
  hrp: string
  witnessVersion: number
  witnessProgram: Uint8Array
} {
  const { hrp, data } = bech32Decode(address)
  if (data.length === 0) throw new Error('Invalid segwit address')
  const witnessVersion = data[0]
  const program = convertBits(new Uint8Array(data.slice(1)), 5, 8, false)
  return {
    hrp,
    witnessVersion,
    witnessProgram: new Uint8Array(program),
  }
}
