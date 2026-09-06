/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

export function writeUint8(value: number): Uint8Array {
  return new Uint8Array([value & 0xff])
}

export function writeUint16(value: number): Uint8Array {
  const buf = new Uint8Array(2)
  new DataView(buf.buffer).setUint16(0, value, false)
  return buf
}

export function writeBigInt(value: bigint): Uint8Array {
  let hex = value.toString(16)
  if (hex.length % 2 !== 0) hex = '0' + hex
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16)
  }
  const result = new Uint8Array(32)
  result.set(bytes, 32 - bytes.length)
  return result
}

export function writeUint64(value: bigint): Uint8Array {
  const buf = new Uint8Array(8)
  new DataView(buf.buffer).setBigUint64(0, value, false)
  return buf
}

interface EntityIdNormalizationOptions {
  allowEmpty?: boolean
}

export function normalizeEntityIdHex(
  id: string,
  options: EntityIdNormalizationOptions = {},
): string {
  let hex = id.trim()
  if (hex.startsWith('0x') || hex.startsWith('0X')) {
    hex = hex.slice(2)
  } else if (hex.length >= 3) {
    const prefix = hex.substring(0, 3).toUpperCase()
    if (prefix === 'EXO' || prefix === 'EXI') {
      hex = hex.slice(3)
    }
  }

  if (!hex) {
    if (options.allowEmpty) return ''.padStart(64, '0')
    throw new Error('Entity ID is required')
  }
  if (hex.length > 64) {
    throw new Error('Entity ID must be 32 bytes or less')
  }
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error('Entity ID must be hexadecimal')
  }

  return hex.padStart(64, '0').toLowerCase()
}

export function isValidEntityId(id: string): boolean {
  try {
    normalizeEntityIdHex(id)
    return true
  } catch {
    return false
  }
}

export function writeEntityId(id: string): Uint8Array {
  const hex = normalizeEntityIdHex(id, { allowEmpty: true })

  const buf = new Uint8Array(32)
  for (let i = 0; i < 32; i++) {
    buf[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16)
  }
  return buf
}

export function writeAddress(address: string): Uint8Array {
  return normalizeAddress(address)
}

export function writeString(value: string): Uint8Array {
  const encoded = new TextEncoder().encode(value)
  const lenBuf = new Uint8Array(4)
  new DataView(lenBuf.buffer).setUint32(0, encoded.length, false)
  return concatBytes(lenBuf, encoded)
}

export function writeBool(value: boolean): Uint8Array {
  return new Uint8Array([value ? 1 : 0])
}

export function writeBytes32(value: Uint8Array): Uint8Array {
  const buf = new Uint8Array(32)
  buf.set(value.length > 32 ? value.slice(0, 32) : value, 32 - value.length)
  return buf
}

export function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const arr of arrays) {
    result.set(arr, offset)
    offset += arr.length
  }
  return result
}

export function isNativeAssetId(assetId: string): boolean {
  if (assetId === '0' || assetId === '') return true
  const stripped = assetId.replace(/^(0x|EXO|EXI)/i, '')
  return /^0*$/.test(stripped)
}

export function keccak256(data: Uint8Array): Uint8Array {
  const RC = [
    0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
    0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
    0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
    0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
    0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
    0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
  ]
  const ROTC = [
    [0, 36, 3, 41, 18], [1, 44, 10, 45, 2], [62, 6, 43, 15, 61],
    [28, 55, 25, 21, 56], [27, 20, 39, 8, 14],
  ]
  const rate = 136
  const paddedLen = Math.ceil((data.length + 1) / rate) * rate
  const padded = new Uint8Array(paddedLen)
  padded.set(data)
  padded[data.length] = 0x01
  padded[paddedLen - 1] |= 0x80
  const state: bigint[][] = Array(5).fill(null).map(() => Array(5).fill(0n))
  for (let blockStart = 0; blockStart < paddedLen; blockStart += rate) {
    for (let i = 0; i < rate && blockStart + i < paddedLen; i += 8) {
      const x = Math.floor(i / 8) % 5
      const y = Math.floor(Math.floor(i / 8) / 5)
      if (y < 5) {
        let val = 0n
        for (let j = 0; j < 8 && blockStart + i + j < paddedLen; j++) {
          val |= BigInt(padded[blockStart + i + j]) << BigInt(j * 8)
        }
        state[x][y] ^= val
      }
    }
    for (let round = 0; round < 24; round++) {
      const C: bigint[] = Array(5).fill(0n)
      for (let x = 0; x < 5; x++) C[x] = state[x][0] ^ state[x][1] ^ state[x][2] ^ state[x][3] ^ state[x][4]
      const D: bigint[] = Array(5).fill(0n)
      for (let x = 0; x < 5; x++) {
        const rot1 = ((C[(x + 1) % 5] << 1n) | (C[(x + 1) % 5] >> 63n)) & ((1n << 64n) - 1n)
        D[x] = C[(x + 4) % 5] ^ rot1
      }
      for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) state[x][y] ^= D[x]
      const B: bigint[][] = Array(5).fill(null).map(() => Array(5).fill(0n))
      for (let x = 0; x < 5; x++) {
        for (let y = 0; y < 5; y++) {
          const rot = ROTC[x][y]
          const val = state[x][y]
          B[y][(2 * x + 3 * y) % 5] = rot === 0 ? val : ((val << BigInt(rot)) | (val >> BigInt(64 - rot))) & ((1n << 64n) - 1n)
        }
      }
      for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) state[x][y] = B[x][y] ^ ((~B[(x + 1) % 5][y]) & B[(x + 2) % 5][y])
      state[0][0] ^= RC[round]
    }
  }
  const output = new Uint8Array(32)
  let outIdx = 0
  for (let y = 0; y < 5 && outIdx < 32; y++) {
    for (let x = 0; x < 5 && outIdx < 32; x++) {
      const val = state[x][y]
      for (let j = 0; j < 8 && outIdx < 32; j++) output[outIdx++] = Number((val >> BigInt(j * 8)) & 0xFFn)
    }
  }
  return output
}

function normalizeAddress(address: string): Uint8Array {
  let hexAddr = address
  if (hexAddr.startsWith('EXO') || hexAddr.startsWith('exo') ||
      hexAddr.startsWith('EXI') || hexAddr.startsWith('exi')) {
    hexAddr = '0x' + hexAddr.slice(3)
  } else if (!hexAddr.startsWith('0x') && !hexAddr.startsWith('0X')) {
    hexAddr = '0x' + hexAddr
  }
  const cleanHex = hexAddr.slice(2)
  const bytes = new Uint8Array(cleanHex.length / 2)
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16)
  }
  if (bytes.length === 21 && (bytes[0] === 0x00 || bytes[0] === 0x01)) return bytes.slice(1)
  if (bytes.length > 20) return bytes.slice(-20)
  const result = new Uint8Array(20)
  result.set(bytes, 20 - bytes.length)
  return result
}
