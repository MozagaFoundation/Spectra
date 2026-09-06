/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { File } from 'expo-file-system'
import * as FileSystem from 'expo-file-system/legacy'
import { computeContentHash } from '@spectra/core-crypto'
import type { MediaType } from '@/lib/types'
import { protectSensitiveFilePath } from './transientRenderCache'

export const MEDIA_INGRESS_MAX_BYTES = 50 * 1024 * 1024
export const MEDIA_INGRESS_MAX_DIMENSION = 12_000
export const MEDIA_INGRESS_MAX_PIXELS = 40_000_000
export const MEDIA_INGRESS_MAX_FRAMES = 300
export const MEDIA_INGRESS_MAX_PDF_PAGES = 200
export const MEDIA_INGRESS_MAX_DURATION_MS = 10 * 60 * 1000

const GENERIC_MIME_TYPE = 'application/octet-stream'
const SHA256_PATTERN = /^[a-f0-9]{64}$/
let ingressCounter = 0

type InspectedMedia = {
  mimeType: string
  compatibleMimeTypes: string[]
  mediaType: MediaType
  extension: string
  width?: number
  height?: number
  frameCount?: number
  pageCount?: number
}

export interface MediaIngressSource {
  id: string
  uri: string
  fileName?: string | null
  mimeType?: string | null
  fileSize?: number | null
  mediaType?: MediaType | null
  width?: number | null
  height?: number | null
  durationMs?: number | null
}

export interface MediaIngressOptions {
  maxBytes?: number
  expectedDigest?: string | null
  requireDeclaredSizeMatch?: boolean
}

export interface ValidatedMediaIngress {
  uri: string
  fileSize: number
  mimeType: string
  mediaType: MediaType
  digest: string
  bytes: Uint8Array
  deleteOnRelease: boolean
  width?: number
  height?: number
  frameCount?: number
  pageCount?: number
}

export class MediaIngressError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MediaIngressError'
  }
}

function normalizeMimeType(value: string | null | undefined): string | null {
  const normalized = value?.split(';')[0]?.trim().toLowerCase()
  if (!normalized) return null

  const aliases: Record<string, string> = {
    'audio/m4a': 'audio/mp4',
    'audio/x-m4a': 'audio/mp4',
    'audio/x-wav': 'audio/wav',
    'image/jpg': 'image/jpeg',
  }
  return aliases[normalized] ?? normalized
}

function getIngressDirectory(): string {
  const root = FileSystem.cacheDirectory ?? FileSystem.documentDirectory
  if (!root) {
    throw new MediaIngressError('No protected media staging directory is available')
  }
  return `${root}media_ingress/`
}

async function ensureIngressDirectory(): Promise<string> {
  const directory = getIngressDirectory()
  const info = await FileSystem.getInfoAsync(directory)
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true })
  }
  await protectSensitiveFilePath(directory)
  return directory
}

export function isAppOwnedMediaIngressUri(uri: string): boolean {
  try {
    const directory = getIngressDirectory()
    return uri.startsWith(directory) && !uri.slice(directory.length).includes('/')
  } catch {
    return false
  }
}

function asciiAt(bytes: Uint8Array, offset: number, value: string): boolean {
  if (offset < 0 || bytes.length < offset + value.length) return false
  for (let index = 0; index < value.length; index += 1) {
    if (bytes[offset + index] !== value.charCodeAt(index)) return false
  }
  return true
}

function readUint16BE(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 2 > bytes.length) return null
  return (bytes[offset] << 8) | bytes[offset + 1]
}

function readUint16LE(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 2 > bytes.length) return null
  return bytes[offset] | (bytes[offset + 1] << 8)
}

function readUint24LE(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 3 > bytes.length) return null
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16)
}

function readUint32BE(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 4 > bytes.length) return null
  return (
    (bytes[offset] * 0x1000000)
    + (bytes[offset + 1] << 16)
    + (bytes[offset + 2] << 8)
    + bytes[offset + 3]
  )
}

function inspectJpeg(bytes: Uint8Array): InspectedMedia | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null

  let offset = 2
  while (offset + 4 <= bytes.length) {
    while (bytes[offset] === 0xff) offset += 1
    const marker = bytes[offset]
    offset += 1
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue
    const segmentLength = readUint16BE(bytes, offset)
    if (segmentLength === null || segmentLength < 2 || offset + segmentLength > bytes.length) break

    const isStartOfFrame = (
      marker >= 0xc0
      && marker <= 0xcf
      && marker !== 0xc4
      && marker !== 0xc8
      && marker !== 0xcc
    )
    if (isStartOfFrame && segmentLength >= 7) {
      const height = readUint16BE(bytes, offset + 3)
      const width = readUint16BE(bytes, offset + 5)
      if (width && height) {
        return {
          mimeType: 'image/jpeg',
          compatibleMimeTypes: ['image/jpeg'],
          mediaType: 'image',
          extension: 'jpg',
          width,
          height,
          frameCount: 1,
        }
      }
    }
    offset += segmentLength
  }

  return {
    mimeType: 'image/jpeg',
    compatibleMimeTypes: ['image/jpeg'],
    mediaType: 'image',
    extension: 'jpg',
    frameCount: 1,
  }
}

function inspectPng(bytes: Uint8Array): InspectedMedia | null {
  if (
    bytes[0] !== 0x89
    || !asciiAt(bytes, 1, 'PNG\r\n\u001a\n')
    || !asciiAt(bytes, 12, 'IHDR')
  ) {
    return null
  }

  const width = readUint32BE(bytes, 16) ?? undefined
  const height = readUint32BE(bytes, 20) ?? undefined
  let frameCount = 0
  let offset = 8
  while (offset + 12 <= bytes.length) {
    const chunkLength = readUint32BE(bytes, offset)
    if (chunkLength === null || chunkLength > bytes.length - offset - 12) break
    if (asciiAt(bytes, offset + 4, 'fcTL')) frameCount += 1
    offset += 12 + chunkLength
  }

  return {
    mimeType: 'image/png',
    compatibleMimeTypes: ['image/png'],
    mediaType: 'image',
    extension: 'png',
    width,
    height,
    frameCount: Math.max(1, frameCount),
  }
}

function skipGifSubBlocks(bytes: Uint8Array, initialOffset: number): number | null {
  let offset = initialOffset
  while (offset < bytes.length) {
    const blockLength = bytes[offset]
    offset += 1
    if (blockLength === 0) return offset
    if (offset + blockLength > bytes.length) return null
    offset += blockLength
  }
  return null
}

function inspectGif(bytes: Uint8Array): InspectedMedia | null {
  if (!asciiAt(bytes, 0, 'GIF87a') && !asciiAt(bytes, 0, 'GIF89a')) return null
  const width = readUint16LE(bytes, 6) ?? undefined
  const height = readUint16LE(bytes, 8) ?? undefined
  if (bytes.length < 13) {
    return {
      mimeType: 'image/gif',
      compatibleMimeTypes: ['image/gif'],
      mediaType: 'gif',
      extension: 'gif',
      width,
      height,
    }
  }

  const packed = bytes[10]
  let offset = 13 + ((packed & 0x80) !== 0 ? 3 * (2 ** ((packed & 0x07) + 1)) : 0)
  let frameCount = 0
  while (offset < bytes.length) {
    const marker = bytes[offset]
    offset += 1
    if (marker === 0x3b) break
    if (marker === 0x21) {
      offset += 1
      const next = skipGifSubBlocks(bytes, offset)
      if (next === null) break
      offset = next
      continue
    }
    if (marker !== 0x2c || offset + 9 > bytes.length) break

    frameCount += 1
    const imagePacked = bytes[offset + 8]
    offset += 9
    if ((imagePacked & 0x80) !== 0) {
      offset += 3 * (2 ** ((imagePacked & 0x07) + 1))
    }
    offset += 1
    const next = skipGifSubBlocks(bytes, offset)
    if (next === null) break
    offset = next
  }

  return {
    mimeType: 'image/gif',
    compatibleMimeTypes: ['image/gif'],
    mediaType: 'gif',
    extension: 'gif',
    width,
    height,
    frameCount: Math.max(1, frameCount),
  }
}

function inspectWebp(bytes: Uint8Array): InspectedMedia | null {
  if (!asciiAt(bytes, 0, 'RIFF') || !asciiAt(bytes, 8, 'WEBP')) return null

  let width: number | undefined
  let height: number | undefined
  let frameCount = 0
  let offset = 12
  while (offset + 8 <= bytes.length) {
    const chunkSize = (
      bytes[offset + 4]
      | (bytes[offset + 5] << 8)
      | (bytes[offset + 6] << 16)
      | (bytes[offset + 7] << 24)
    ) >>> 0
    const dataOffset = offset + 8
    if (chunkSize > bytes.length - dataOffset) break

    if (asciiAt(bytes, offset, 'VP8X') && chunkSize >= 10) {
      const parsedWidth = readUint24LE(bytes, dataOffset + 4)
      const parsedHeight = readUint24LE(bytes, dataOffset + 7)
      width = parsedWidth === null ? undefined : parsedWidth + 1
      height = parsedHeight === null ? undefined : parsedHeight + 1
    } else if (asciiAt(bytes, offset, 'VP8 ') && chunkSize >= 10 && asciiAt(bytes, dataOffset + 3, '\u009d\u0001\u002a')) {
      width = (readUint16LE(bytes, dataOffset + 6) ?? 0) & 0x3fff
      height = (readUint16LE(bytes, dataOffset + 8) ?? 0) & 0x3fff
    } else if (asciiAt(bytes, offset, 'VP8L') && chunkSize >= 5 && bytes[dataOffset] === 0x2f) {
      const b1 = bytes[dataOffset + 1]
      const b2 = bytes[dataOffset + 2]
      const b3 = bytes[dataOffset + 3]
      const b4 = bytes[dataOffset + 4]
      width = 1 + (((b2 & 0x3f) << 8) | b1)
      height = 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6))
    } else if (asciiAt(bytes, offset, 'ANMF')) {
      frameCount += 1
    }

    offset = dataOffset + chunkSize + (chunkSize % 2)
  }

  return {
    mimeType: 'image/webp',
    compatibleMimeTypes: ['image/webp'],
    mediaType: 'image',
    extension: 'webp',
    width,
    height,
    frameCount: Math.max(1, frameCount),
  }
}

function findIsoDimensions(bytes: Uint8Array): { width?: number; height?: number } {
  for (let offset = 4; offset + 12 <= bytes.length; offset += 1) {
    if (!asciiAt(bytes, offset, 'ispe')) continue
    const width = readUint32BE(bytes, offset + 4)
    const height = readUint32BE(bytes, offset + 8)
    if (width && height) return { width, height }
  }
  return {}
}

function findIsoTrackDimensions(bytes: Uint8Array): { width?: number; height?: number } {
  let bestWidth = 0
  let bestHeight = 0
  for (let typeOffset = 4; typeOffset + 8 <= bytes.length; typeOffset += 1) {
    if (!asciiAt(bytes, typeOffset, 'tkhd')) continue
    const boxStart = typeOffset - 4
    const boxSize = readUint32BE(bytes, boxStart)
    if (boxSize === null || boxSize < 8 || boxStart + boxSize > bytes.length) continue

    const payloadOffset = typeOffset + 4
    const version = bytes[payloadOffset]
    const widthOffset = payloadOffset + (version === 1 ? 88 : 76)
    const rawWidth = readUint32BE(bytes, widthOffset)
    const rawHeight = readUint32BE(bytes, widthOffset + 4)
    if (rawWidth === null || rawHeight === null) continue
    const width = Math.floor(rawWidth / 65_536)
    const height = Math.floor(rawHeight / 65_536)
    if (width * height > bestWidth * bestHeight) {
      bestWidth = width
      bestHeight = height
    }
  }
  return bestWidth > 0 && bestHeight > 0
    ? { width: bestWidth, height: bestHeight }
    : {}
}

interface IsoBox {
  type: string
  payloadOffset: number
  endOffset: number
}

function readIsoBoxes(bytes: Uint8Array, startOffset: number, endOffset: number): IsoBox[] | null {
  const boxes: IsoBox[] = []
  let offset = startOffset
  while (offset < endOffset) {
    const size32 = readUint32BE(bytes, offset)
    if (size32 === null || offset + 8 > endOffset) return null

    let headerSize = 8
    let boxSize = size32
    if (size32 === 1) {
      const high = readUint32BE(bytes, offset + 8)
      const low = readUint32BE(bytes, offset + 12)
      if (
        high === null
        || low === null
        || high > Math.floor(Number.MAX_SAFE_INTEGER / 0x1_0000_0000)
      ) {
        return null
      }
      headerSize = 16
      boxSize = (high * 0x1_0000_0000) + low
    } else if (size32 === 0) {
      boxSize = endOffset - offset
    }

    if (boxSize < headerSize || boxSize > endOffset - offset) return null
    const boxEndOffset = offset + boxSize
    boxes.push({
      type: String.fromCharCode(...bytes.slice(offset + 4, offset + 8)),
      payloadOffset: offset + headerSize,
      endOffset: boxEndOffset,
    })
    offset = boxEndOffset
  }
  return boxes
}

function findIsoTrackKinds(bytes: Uint8Array): { hasAudio: boolean; hasVideo: boolean } {
  let hasAudio = false
  let hasVideo = false
  const rootBoxes = readIsoBoxes(bytes, 0, bytes.length)
  if (!rootBoxes) return { hasAudio, hasVideo }

  for (const moovBox of rootBoxes) {
    if (moovBox.type !== 'moov') continue
    const moovChildren = readIsoBoxes(bytes, moovBox.payloadOffset, moovBox.endOffset)
    if (!moovChildren) continue

    for (const trackBox of moovChildren) {
      if (trackBox.type !== 'trak') continue
      const trackChildren = readIsoBoxes(bytes, trackBox.payloadOffset, trackBox.endOffset)
      if (!trackChildren) continue
      const mediaBox = trackChildren.find((box) => box.type === 'mdia')
      if (!mediaBox) continue

      const mediaChildren = readIsoBoxes(bytes, mediaBox.payloadOffset, mediaBox.endOffset)
      if (!mediaChildren) continue
      const handlerBox = mediaChildren.find((box) => box.type === 'hdlr')
      if (!handlerBox || handlerBox.payloadOffset + 12 > handlerBox.endOffset) continue

      const handlerTypeOffset = handlerBox.payloadOffset + 8
      if (asciiAt(bytes, handlerTypeOffset, 'soun')) hasAudio = true
      if (asciiAt(bytes, handlerTypeOffset, 'vide')) hasVideo = true
    }
  }

  return { hasAudio, hasVideo }
}

function inspectIsoBaseMedia(bytes: Uint8Array): InspectedMedia | null {
  if (!asciiAt(bytes, 4, 'ftyp') || bytes.length < 12) return null
  const brand = String.fromCharCode(...bytes.slice(8, 12)).toLowerCase()
  const heifBrands = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'])
  if (heifBrands.has(brand)) {
    const dimensions = findIsoDimensions(bytes)
    return {
      mimeType: 'image/heic',
      compatibleMimeTypes: ['image/heic', 'image/heif'],
      mediaType: 'image',
      extension: 'heic',
      ...dimensions,
      frameCount: 1,
    }
  }
  if (brand === 'avif' || brand === 'avis') {
    const dimensions = findIsoDimensions(bytes)
    return {
      mimeType: 'image/avif',
      compatibleMimeTypes: ['image/avif'],
      mediaType: 'image',
      extension: 'avif',
      ...dimensions,
      frameCount: 1,
    }
  }
  const trackKinds = findIsoTrackKinds(bytes)
  if (trackKinds.hasAudio && !trackKinds.hasVideo) {
    return {
      mimeType: 'audio/mp4',
      compatibleMimeTypes: ['audio/mp4'],
      mediaType: 'audio',
      extension: 'm4a',
    }
  }
  if (brand === 'qt  ') {
    const dimensions = findIsoTrackDimensions(bytes)
    return {
      mimeType: 'video/quicktime',
      compatibleMimeTypes: ['video/quicktime'],
      mediaType: 'video',
      extension: 'mov',
      ...dimensions,
    }
  }
  const dimensions = findIsoTrackDimensions(bytes)
  return {
    mimeType: 'video/mp4',
    compatibleMimeTypes: ['video/mp4'],
    mediaType: 'video',
    extension: 'mp4',
    ...dimensions,
  }
}

function bytesToLatin1(bytes: Uint8Array): string {
  let value = ''
  const chunkSize = 32_768
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    value += String.fromCharCode(...bytes.slice(offset, offset + chunkSize))
  }
  return value
}

function inspectPdf(bytes: Uint8Array): InspectedMedia | null {
  if (!asciiAt(bytes, 0, '%PDF-')) return null
  const pageCount = bytesToLatin1(bytes).match(/\/Type\s*\/Page\b/g)?.length ?? 0
  return {
    mimeType: 'application/pdf',
    compatibleMimeTypes: ['application/pdf'],
    mediaType: 'document',
    extension: 'pdf',
    pageCount,
  }
}

function inspectAudio(bytes: Uint8Array): InspectedMedia | null {
  if (asciiAt(bytes, 0, 'RIFF') && asciiAt(bytes, 8, 'WAVE')) {
    return {
      mimeType: 'audio/wav',
      compatibleMimeTypes: ['audio/wav'],
      mediaType: 'audio',
      extension: 'wav',
    }
  }
  if (
    asciiAt(bytes, 0, 'ID3')
    || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
  ) {
    return {
      mimeType: 'audio/mpeg',
      compatibleMimeTypes: ['audio/mpeg'],
      mediaType: 'audio',
      extension: 'mp3',
    }
  }
  return null
}

function inspectText(bytes: Uint8Array, declaredMimeType: string | null): InspectedMedia | null {
  const textMimeTypes = new Set(['application/json', 'text/csv', 'text/plain'])
  if (!declaredMimeType || !textMimeTypes.has(declaredMimeType) || bytes.includes(0)) return null
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    if (declaredMimeType === 'application/json') JSON.parse(text)
    return {
      mimeType: declaredMimeType,
      compatibleMimeTypes: [declaredMimeType],
      mediaType: 'document',
      extension: declaredMimeType === 'application/json'
        ? 'json'
        : declaredMimeType === 'text/csv'
          ? 'csv'
          : 'txt',
    }
  } catch {
    return null
  }
}

export function inspectMediaIngressBytes(
  bytes: Uint8Array,
  declaredMimeType?: string | null,
): InspectedMedia {
  if (bytes.length === 0) {
    throw new MediaIngressError('Selected file is empty')
  }

  const normalizedDeclaredMime = normalizeMimeType(declaredMimeType)
  const inspected = (
    inspectJpeg(bytes)
    ?? inspectPng(bytes)
    ?? inspectGif(bytes)
    ?? inspectWebp(bytes)
    ?? inspectPdf(bytes)
    ?? inspectAudio(bytes)
    ?? inspectIsoBaseMedia(bytes)
    ?? inspectText(bytes, normalizedDeclaredMime)
  )
  if (!inspected) {
    throw new MediaIngressError('Selected file type is unsupported')
  }

  if (
    normalizedDeclaredMime
    && normalizedDeclaredMime !== GENERIC_MIME_TYPE
    && !inspected.compatibleMimeTypes.includes(normalizedDeclaredMime)
  ) {
    throw new MediaIngressError('Selected file content does not match its declared type')
  }

  const width = inspected.width
  const height = inspected.height
  if (
    (width !== undefined && width > MEDIA_INGRESS_MAX_DIMENSION)
    || (height !== undefined && height > MEDIA_INGRESS_MAX_DIMENSION)
    || (
      width !== undefined
      && height !== undefined
      && width * height > MEDIA_INGRESS_MAX_PIXELS
    )
  ) {
    throw new MediaIngressError('Selected media dimensions are too large')
  }
  if ((inspected.frameCount ?? 0) > MEDIA_INGRESS_MAX_FRAMES) {
    throw new MediaIngressError('Selected animation has too many frames')
  }
  if ((inspected.pageCount ?? 0) > MEDIA_INGRESS_MAX_PDF_PAGES) {
    throw new MediaIngressError('Selected document has too many pages')
  }

  return inspected
}

function mediaTypesAreCompatible(expected: MediaType, actual: MediaType): boolean {
  if (expected === actual) return true
  if ((expected === 'image' || expected === 'sticker') && actual === 'gif') return true
  if (expected === 'gif' && actual === 'image') return true
  if (expected === 'voice_note' && actual === 'audio') return true
  return false
}

function assertOptionalLimit(value: number | null | undefined, limit: number, message: string): void {
  if (value === null || value === undefined) return
  if (!Number.isFinite(value) || value < 0 || value > limit) {
    throw new MediaIngressError(message)
  }
}

function extensionForDeclaredMimeType(value: string | null): string {
  const extensions: Record<string, string> = {
    'application/json': 'json',
    'application/pdf': 'pdf',
    'audio/mp4': 'm4a',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'image/avif': 'avif',
    'image/gif': 'gif',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'text/csv': 'csv',
    'text/plain': 'txt',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
  }
  return value ? extensions[value] ?? 'bin' : 'bin'
}

function safeIngressId(value: string): string {
  const safe = value.replace(/[^a-z0-9_-]/gi, '_').slice(0, 48)
  return safe || 'media'
}

async function copyIntoAppOwnedIngress(source: MediaIngressSource): Promise<string> {
  const directory = await ensureIngressDirectory()
  ingressCounter += 1
  const extension = extensionForDeclaredMimeType(normalizeMimeType(source.mimeType))
  const baseName = `${safeIngressId(source.id)}_${Date.now()}_${ingressCounter}`
  const partialUri = `${directory}.${baseName}.partial`
  const destinationUri = `${directory}${baseName}.${extension}`

  try {
    await FileSystem.copyAsync({ from: source.uri, to: partialUri })
    await FileSystem.moveAsync({ from: partialUri, to: destinationUri })
    await protectSensitiveFilePath(destinationUri)
    return destinationUri
  } catch (error) {
    await FileSystem.deleteAsync(partialUri, { idempotent: true }).catch(() => undefined)
    await FileSystem.deleteAsync(destinationUri, { idempotent: true }).catch(() => undefined)
    throw error
  }
}

function digestsEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  let mismatch = 0
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return mismatch === 0
}

export async function stageAndValidateMediaIngress(
  source: MediaIngressSource,
  options: MediaIngressOptions = {},
): Promise<ValidatedMediaIngress> {
  const maxBytes = options.maxBytes ?? MEDIA_INGRESS_MAX_BYTES
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > MEDIA_INGRESS_MAX_BYTES) {
    throw new MediaIngressError('Invalid media size limit')
  }
  assertOptionalLimit(source.fileSize, maxBytes, 'Selected file is too large')
  assertOptionalLimit(source.width, MEDIA_INGRESS_MAX_DIMENSION, 'Selected media dimensions are too large')
  assertOptionalLimit(source.height, MEDIA_INGRESS_MAX_DIMENSION, 'Selected media dimensions are too large')
  assertOptionalLimit(source.durationMs, MEDIA_INGRESS_MAX_DURATION_MS, 'Selected media duration is too long')
  if (
    source.width
    && source.height
    && source.width * source.height > MEDIA_INGRESS_MAX_PIXELS
  ) {
    throw new MediaIngressError('Selected media dimensions are too large')
  }

  const sourceInfo = await FileSystem.getInfoAsync(source.uri)
  if (!sourceInfo.exists) {
    throw new MediaIngressError('Selected file is unavailable')
  }
  if (typeof sourceInfo.size === 'number' && sourceInfo.size > maxBytes) {
    throw new MediaIngressError('Selected file is too large')
  }

  const copied = !isAppOwnedMediaIngressUri(source.uri)
  const ownedUri = copied ? await copyIntoAppOwnedIngress(source) : source.uri
  try {
    const ownedInfo = await FileSystem.getInfoAsync(ownedUri)
    if (!ownedInfo.exists || typeof ownedInfo.size !== 'number' || ownedInfo.size <= 0) {
      throw new MediaIngressError('Selected file is unavailable')
    }
    if (ownedInfo.size > maxBytes) {
      throw new MediaIngressError('Selected file is too large')
    }
    if (
      options.requireDeclaredSizeMatch
      && typeof source.fileSize === 'number'
      && ownedInfo.size !== source.fileSize
    ) {
      throw new MediaIngressError('Selected file size changed during handoff')
    }

    const bytes = await new File(ownedUri).bytes()
    if (bytes.length !== ownedInfo.size || bytes.length > maxBytes) {
      throw new MediaIngressError('Selected file size changed during validation')
    }
    const inspection = inspectMediaIngressBytes(bytes, source.mimeType)
    if (source.mediaType && !mediaTypesAreCompatible(source.mediaType, inspection.mediaType)) {
      throw new MediaIngressError('Selected file content does not match its media type')
    }

    const digest = computeContentHash(bytes).toLowerCase()
    const expectedDigest = options.expectedDigest?.trim().toLowerCase()
    if (expectedDigest) {
      if (!SHA256_PATTERN.test(expectedDigest) || !digestsEqual(digest, expectedDigest)) {
        throw new MediaIngressError('Selected file digest changed during handoff')
      }
    }

    const mediaType = source.mediaType && mediaTypesAreCompatible(source.mediaType, inspection.mediaType)
      ? source.mediaType
      : inspection.mediaType
    return {
      uri: ownedUri,
      fileSize: bytes.length,
      mimeType: inspection.mimeType,
      mediaType,
      digest,
      bytes,
      deleteOnRelease: true,
      width: inspection.width ?? source.width ?? undefined,
      height: inspection.height ?? source.height ?? undefined,
      frameCount: inspection.frameCount,
      pageCount: inspection.pageCount,
    }
  } catch (error) {
    if (copied) {
      await FileSystem.deleteAsync(ownedUri, { idempotent: true }).catch(() => undefined)
    }
    throw error
  }
}

export async function deleteAppOwnedMediaIngress(uri: string): Promise<void> {
  if (!isAppOwnedMediaIngressUri(uri)) return
  await FileSystem.deleteAsync(uri, { idempotent: true })
}
