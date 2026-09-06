/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 */

import type {
  ContactCardProfileCapsule,
  ContactProfilePayload,
  SignedContactProfile,
} from '../types/index'
import { decryptAES, encryptAES } from './aes'
import { canonicalJsonStringify } from './canonicalJson'
import { signWithDilithium, verifyDilithiumSignature } from './dilithium'
import {
  base64ToBytes,
  bytesToBase64,
  deriveKey,
  secureZero,
  stringToBytes,
} from './utils'

const PROFILE_PURPOSE = 'Spectra_Contact_Profile_v1'
const CARD_CAPSULE_PURPOSE = 'Spectra_Contact_Profile_Card_v1'
const MAX_DISPLAY_NAME_CODE_POINTS = 80
const MAX_DISPLAY_NAME_BYTES = 320
const MAX_AVATAR_BYTES = 128 * 1024
const MAX_AVATAR_DIMENSION = 1024
const MAX_AVATAR_PIXELS = MAX_AVATAR_DIMENSION * MAX_AVATAR_DIMENSION
const MAX_PROFILE_BYTES = 192 * 1024
const MAX_CAPSULE_CIPHERTEXT_BYTES = 256 * 1024
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u
const BIDI_CONTROL_PATTERN = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u
const UNPAIRED_SURROGATE_PATTERN =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/u
const AVATAR_DATA_URI_PATTERN =
  /^data:(image\/(?:jpeg|png|webp));base64,((?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?)$/u
const CARD_ID_PATTERN = /^scc1\.[0-9a-f]{32}$/u
const PROFILE_CAPABILITY_PATTERN = /^sccpc1\.([A-Za-z0-9_-]{43})$/u
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u
const PROFILE_FIELDS = new Set(['version', 'identityId', 'revision', 'displayName', 'avatarDataUri'])
const SIGNED_PROFILE_FIELDS = new Set([...PROFILE_FIELDS, 'signature'])

export const MAX_CONTACT_PROFILE_AVATAR_BYTES = MAX_AVATAR_BYTES

function assertExactFields(value: unknown, fields: Set<string>): asserts value is Record<string, unknown> {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.keys(value).some((key) => !fields.has(key))
  ) {
    throw new Error('Invalid contact profile')
  }
}

function normalizeIdentityId(value: unknown): string {
  if (
    typeof value !== 'string'
    || value.trim() !== value
    || value.length < 8
    || value.length > 256
    || /[\s:\0]/u.test(value)
  ) {
    throw new Error('Invalid contact profile identity')
  }
  return value
}

export function normalizeContactProfileDisplayName(value?: string | null): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string' || UNPAIRED_SURROGATE_PATTERN.test(value)) {
    throw new Error('Invalid contact profile name')
  }
  const normalized = value.trim().normalize('NFC')
  if (
    !normalized
    || [...normalized].length > MAX_DISPLAY_NAME_CODE_POINTS
    || new TextEncoder().encode(normalized).byteLength > MAX_DISPLAY_NAME_BYTES
    || CONTROL_CHARACTER_PATTERN.test(normalized)
    || BIDI_CONTROL_PATTERN.test(normalized)
  ) {
    throw new Error('Invalid contact profile name')
  }
  return normalized
}

function normalizeAvatarDataUri(value?: string | null): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string' || value.length > Math.ceil(MAX_AVATAR_BYTES * 4 / 3) + 128) {
    throw new Error('Invalid contact profile avatar')
  }
  const match = AVATAR_DATA_URI_PATTERN.exec(value)
  if (!match) throw new Error('Invalid contact profile avatar')
  const bytes = base64ToBytes(match[2]!)
  if (
    bytes.byteLength === 0
    || bytes.byteLength > MAX_AVATAR_BYTES
    || bytesToBase64(bytes) !== match[2]
    || !isValidAvatarImage(bytes, match[1]!)
  ) {
    throw new Error('Invalid contact profile avatar')
  }
  return value
}

function isValidAvatarImage(bytes: Uint8Array, mediaType: string): boolean {
  if (
    mediaType === 'image/png'
    && bytes.byteLength >= 8
  ) {
    const validSignature = bytes[0] === 0x89
      && bytes[1] === 0x50
      && bytes[2] === 0x4e
      && bytes[3] === 0x47
      && bytes[4] === 0x0d
      && bytes[5] === 0x0a
      && bytes[6] === 0x1a
      && bytes[7] === 0x0a
    if (!validSignature || bytes.byteLength < 24) return false
    if (
      bytes[12] !== 0x49
      || bytes[13] !== 0x48
      || bytes[14] !== 0x44
      || bytes[15] !== 0x52
    ) {
      return false
    }
    return hasSafeAvatarDimensions(
      readUint32BE(bytes, 16),
      readUint32BE(bytes, 20),
    )
  }
  if (mediaType === 'image/jpeg' && bytes.byteLength >= 3) {
    return hasSafeJpegDimensions(bytes)
  }
  return mediaType === 'image/webp' && hasSafeWebpDimensions(bytes)
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! * 0x1000000
    + bytes[offset + 1]! * 0x10000
    + bytes[offset + 2]! * 0x100
    + bytes[offset + 3]!
  )
}

function hasSafeAvatarDimensions(width: number, height: number): boolean {
  return Number.isSafeInteger(width)
    && Number.isSafeInteger(height)
    && width > 0
    && height > 0
    && width <= MAX_AVATAR_DIMENSION
    && height <= MAX_AVATAR_DIMENSION
    && width * height <= MAX_AVATAR_PIXELS
}

function hasSafeJpegDimensions(bytes: Uint8Array): boolean {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return false
  let offset = 2
  while (offset + 4 <= bytes.byteLength) {
    while (offset < bytes.byteLength && bytes[offset] === 0xff) offset += 1
    const marker = bytes[offset++]
    if (marker === undefined || marker === 0xd9 || marker === 0xda) return false
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
    if (offset + 2 > bytes.byteLength) return false
    const segmentLength = (bytes[offset]! << 8) | bytes[offset + 1]!
    if (segmentLength < 2 || offset + segmentLength > bytes.byteLength) return false
    if (
      [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]
        .includes(marker)
    ) {
      if (segmentLength < 7) return false
      const height = (bytes[offset + 3]! << 8) | bytes[offset + 4]!
      const width = (bytes[offset + 5]! << 8) | bytes[offset + 6]!
      return hasSafeAvatarDimensions(width, height)
    }
    offset += segmentLength
  }
  return false
}

function hasSafeWebpDimensions(bytes: Uint8Array): boolean {
  if (
    bytes.byteLength < 20
    || String.fromCharCode(...bytes.slice(0, 4)) !== 'RIFF'
    || String.fromCharCode(...bytes.slice(8, 12)) !== 'WEBP'
  ) {
    return false
  }
  let offset = 12
  while (offset + 8 <= bytes.byteLength) {
    const chunkType = String.fromCharCode(...bytes.slice(offset, offset + 4))
    const chunkLength = bytes[offset + 4]!
      | (bytes[offset + 5]! << 8)
      | (bytes[offset + 6]! << 16)
      | (bytes[offset + 7]! << 24)
    const dataOffset = offset + 8
    if (chunkLength < 0 || dataOffset + chunkLength > bytes.byteLength) return false
    if (chunkType === 'VP8X' && chunkLength >= 10) {
      const width = 1 + bytes[dataOffset + 4]! + (bytes[dataOffset + 5]! << 8)
        + (bytes[dataOffset + 6]! << 16)
      const height = 1 + bytes[dataOffset + 7]! + (bytes[dataOffset + 8]! << 8)
        + (bytes[dataOffset + 9]! << 16)
      return hasSafeAvatarDimensions(width, height)
    }
    if (chunkType === 'VP8 ' && chunkLength >= 10) {
      const width = (bytes[dataOffset + 6]! | (bytes[dataOffset + 7]! << 8)) & 0x3fff
      const height = (bytes[dataOffset + 8]! | (bytes[dataOffset + 9]! << 8)) & 0x3fff
      return hasSafeAvatarDimensions(width, height)
    }
    if (chunkType === 'VP8L' && chunkLength >= 5 && bytes[dataOffset] === 0x2f) {
      const width = 1 + bytes[dataOffset + 1]! + ((bytes[dataOffset + 2]! & 0x3f) << 8)
      const height = 1
        + (bytes[dataOffset + 2]! >> 6)
        + (bytes[dataOffset + 3]! << 2)
        + ((bytes[dataOffset + 4]! & 0x0f) << 10)
      return hasSafeAvatarDimensions(width, height)
    }
    offset = dataOffset + chunkLength + (chunkLength % 2)
  }
  return false
}

function normalizeProfilePayload(value: ContactProfilePayload): ContactProfilePayload {
  assertExactFields(value, PROFILE_FIELDS)
  if (
    !value
    || value.version !== 1
    || !Number.isSafeInteger(value.revision)
    || value.revision < 1
  ) {
    throw new Error('Invalid contact profile')
  }
  const displayName = normalizeContactProfileDisplayName(value.displayName)
  if (value.displayName !== undefined && displayName !== value.displayName) {
    throw new Error('Contact profile name is not canonical')
  }
  const avatarDataUri = normalizeAvatarDataUri(value.avatarDataUri)
  const normalized: ContactProfilePayload = {
    version: 1,
    identityId: normalizeIdentityId(value.identityId),
    revision: value.revision,
    ...(displayName ? { displayName } : {}),
    ...(avatarDataUri ? { avatarDataUri } : {}),
  }
  if (new TextEncoder().encode(canonicalJsonStringify(normalized)).byteLength > MAX_PROFILE_BYTES) {
    throw new Error('Contact profile is too large')
  }
  return normalized
}

function profileSignaturePayload(profile: ContactProfilePayload): Uint8Array {
  return stringToBytes(canonicalJsonStringify({
    purpose: PROFILE_PURPOSE,
    profile,
  }))
}

export function createSignedContactProfile(
  profile: ContactProfilePayload,
  dilithiumPrivateKey: string,
): SignedContactProfile {
  const normalized = normalizeProfilePayload(profile)
  return {
    ...normalized,
    signature: signWithDilithium(profileSignaturePayload(normalized), dilithiumPrivateKey),
  }
}

export function verifySignedContactProfile(
  profile: unknown,
  dilithiumPublicKey: string,
  expectedIdentityId?: string,
): profile is SignedContactProfile {
  if (
    !profile
    || typeof profile !== 'object'
    || typeof (profile as SignedContactProfile).signature !== 'string'
  ) {
    return false
  }
  try {
    const value = profile as SignedContactProfile
    assertExactFields(value, SIGNED_PROFILE_FIELDS)
    const { signature, ...payload } = value
    const normalized = normalizeProfilePayload(payload)
    if (expectedIdentityId && normalized.identityId !== expectedIdentityId) return false
    if (canonicalJsonStringify(normalized) !== canonicalJsonStringify(payload)) {
      return false
    }
    return verifyDilithiumSignature(
      profileSignaturePayload(normalized),
      signature,
      dilithiumPublicKey,
    )
  } catch {
    return false
  }
}

function decodeProfileCapability(value: string): Uint8Array {
  const match = PROFILE_CAPABILITY_PATTERN.exec(value)
  if (!match) throw new Error('Invalid contact card profile capability')
  const encoded = match[1]!.replaceAll('-', '+').replaceAll('_', '/')
  return base64ToBytes(`${encoded}=`)
}

function cardCipherKey(cardId: string, profileCapability: string): Uint8Array {
  if (!CARD_ID_PATTERN.test(cardId)) throw new Error('Invalid contact card ID')
  const capability = decodeProfileCapability(profileCapability)
  try {
    return deriveKey(
      capability,
      stringToBytes(`${CARD_CAPSULE_PURPOSE}\0${cardId}`),
      stringToBytes(`${CARD_CAPSULE_PURPOSE}.key`),
      32,
    )
  } finally {
    secureZero(capability)
  }
}

function cardAssociatedData(cardId: string, identityId: string): Uint8Array {
  return stringToBytes(canonicalJsonStringify({
    purpose: CARD_CAPSULE_PURPOSE,
    cardId,
    identityId,
    version: 1,
  }))
}

function validateCapsule(value: unknown): ContactCardProfileCapsule {
  if (
    !value
    || typeof value !== 'object'
    || (value as ContactCardProfileCapsule).version !== 1
    || typeof (value as ContactCardProfileCapsule).ciphertext !== 'string'
    || typeof (value as ContactCardProfileCapsule).nonce !== 'string'
    || typeof (value as ContactCardProfileCapsule).tag !== 'string'
  ) {
    throw new Error('Invalid contact card profile')
  }
  const capsule = value as ContactCardProfileCapsule
  if (
    !BASE64_PATTERN.test(capsule.ciphertext)
    || !BASE64_PATTERN.test(capsule.nonce)
    || !BASE64_PATTERN.test(capsule.tag)
    || base64ToBytes(capsule.ciphertext).byteLength > MAX_CAPSULE_CIPHERTEXT_BYTES
    || base64ToBytes(capsule.nonce).byteLength !== 12
    || base64ToBytes(capsule.tag).byteLength !== 16
  ) {
    throw new Error('Invalid contact card profile')
  }
  return capsule
}

export function sealContactCardProfile(
  profile: SignedContactProfile,
  cardId: string,
  profileCapability: string,
): ContactCardProfileCapsule {
  if (typeof profile.signature !== 'string' || !profile.signature) {
    throw new Error('Invalid contact profile signature')
  }
  assertExactFields(profile, SIGNED_PROFILE_FIELDS)
  const { signature, ...payload } = profile
  const normalized = normalizeProfilePayload(payload)
  const key = cardCipherKey(cardId, profileCapability)
  try {
    const encrypted = encryptAES(
      key,
      stringToBytes(canonicalJsonStringify({
        ...normalized,
        signature,
      })),
      cardAssociatedData(cardId, normalized.identityId),
    )
    return { version: 1, ...encrypted }
  } finally {
    secureZero(key)
  }
}

export function openContactCardProfile(
  capsule: unknown,
  cardId: string,
  profileCapability: string,
  expectedIdentityId: string,
): SignedContactProfile {
  const normalizedCapsule = validateCapsule(capsule)
  const key = cardCipherKey(cardId, profileCapability)
  try {
    const plaintext = decryptAES(
      key,
      normalizedCapsule.ciphertext,
      normalizedCapsule.nonce,
      normalizedCapsule.tag,
      cardAssociatedData(cardId, expectedIdentityId),
    )
    const parsed = JSON.parse(new TextDecoder().decode(plaintext)) as SignedContactProfile
    assertExactFields(parsed, SIGNED_PROFILE_FIELDS)
    const { signature, ...payload } = parsed
    const profile = normalizeProfilePayload(payload)
    if (
      profile.identityId !== expectedIdentityId
      || typeof signature !== 'string'
      || !signature
    ) {
      throw new Error('Invalid contact card profile')
    }
    return { ...profile, signature }
  } catch {
    throw new Error('Invalid contact card profile')
  } finally {
    secureZero(key)
  }
}
