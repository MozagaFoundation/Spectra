/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

declare const __DEV__: boolean | undefined

export type MobileLogPrimitive = string | number | boolean | null | undefined
export type MobileLogFields = Record<string, unknown>

const REDACTED = '[redacted]'
const MAX_STRING_LENGTH = 240
const SECRET_KEY_PATTERN = /(?:api_?key|auth|bearer|candidate|capabilit|cipher|credential|digest|encrypted|encryption|fingerprint|hash|hex|key|mnemonic|nonce|password|sdp|seed|secret|signature|token)/
const CONTENT_KEY_PATTERN = /(?:^|_)(?:body|content|file_name|filename|message|path|payload|preview|stack|text|uri|url)(?:$|_)/
const IDENTITY_KEY_PATTERN = /(?:^|_)(?:address|id|identity|object_ref|route|wallet)(?:$|_)/
const RAW_SECRET_PATTERN = /(?:bearer\s+[a-z0-9._~+/-]+=*|spectra:\/\/objects\/|(?:access|api|private|secret)[_-]?(?:key|token)\s*[:=])/i
const RAW_URL_OR_PATH_PATTERN = /(?:https?:\/\/|file:\/\/|content:\/\/|ph:\/\/|\/private\/var\/|\/data\/user\/)/i
const WALLET_OR_KEY_MATERIAL_PATTERN = /(?:\b0x[a-f0-9]{40,}\b|\bexo[a-z0-9]{20,}\b|\b[a-f0-9]{64,}\b|[a-z0-9+/]{48,}={0,2})/i
const RAW_IDENTIFIER_PATTERN = /\b(?:identity|peer|route|wallet)[_-][a-z0-9_-]{6,}\b/i
const RAW_FILENAME_PATTERN = /\b[^\s/\\]{1,100}\.(?:avif|csv|gif|heic|heif|jpeg|jpg|json|m4a|mov|mp3|mp4|pdf|png|txt|wav|webp)\b/i

function normalizeFieldKey(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
}

function sanitizeUnknownString(value: string): string {
  if (
    RAW_SECRET_PATTERN.test(value)
    || RAW_URL_OR_PATH_PATTERN.test(value)
    || WALLET_OR_KEY_MATERIAL_PATTERN.test(value)
    || RAW_IDENTIFIER_PATTERN.test(value)
    || RAW_FILENAME_PATTERN.test(value)
  ) {
    return REDACTED
  }
  if (value.length <= MAX_STRING_LENGTH) return value
  return `${value.slice(0, MAX_STRING_LENGTH - 3)}...`
}

function sanitizeValue(key: string, value: unknown, depth: number): unknown {
  const normalizedKey = normalizeFieldKey(key)
  if (
    SECRET_KEY_PATTERN.test(normalizedKey)
    || CONTENT_KEY_PATTERN.test(normalizedKey)
    || IDENTITY_KEY_PATTERN.test(normalizedKey)
  ) {
    return value === undefined ? undefined : REDACTED
  }

  if (
    value === null
    || value === undefined
    || typeof value === 'number'
    || typeof value === 'boolean'
  ) {
    return value
  }
  if (typeof value === 'string') {
    return sanitizeUnknownString(value)
  }
  if (depth >= 4) return REDACTED
  if (value instanceof Error) {
    return {
      name: sanitizeUnknownString(value.name),
      error: sanitizeUnknownString(value.message),
    }
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((entry) => sanitizeValue('entry', entry, depth + 1))
  }
  if (typeof value === 'object') {
    return sanitizeMobileLogFields(value as MobileLogFields, depth + 1)
  }
  return sanitizeUnknownString(String(value))
}

export function sanitizeMobileLogFields(
  fields: MobileLogFields,
  depth: number = 0,
): MobileLogFields {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, sanitizeValue(key, value, depth)]),
  )
}

export function sanitizeMobileLogPrimitiveFields<T extends MobileLogPrimitive>(
  fields: Record<string, T>,
): Record<string, T> {
  return sanitizeMobileLogFields(fields) as Record<string, T>
}

export function describeMobileLogError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return sanitizeUnknownString(message)
}

function safeLabel(value: string): string {
  return /^[a-z0-9_.-]{1,80}$/i.test(value) ? value : 'invalid_event'
}

function emit(
  level: 'debug' | 'warn' | 'error',
  scope: string,
  event: string,
  fields: MobileLogFields,
): void {
  const label = `[${safeLabel(scope)}] ${safeLabel(event)}`
  const safeFields = sanitizeMobileLogFields(fields)
  if (level === 'debug') {
    if (typeof __DEV__ !== 'undefined' && __DEV__ === true) {
      console.log(label, safeFields)
    }
    return
  }
  if (level === 'warn') {
    console.warn(label, safeFields)
    return
  }
  console.error(label, safeFields)
}

export function mobileLogDebug(
  scope: string,
  event: string,
  fields: MobileLogFields = {},
): void {
  emit('debug', scope, event, fields)
}

export function mobileLogWarn(
  scope: string,
  event: string,
  fields: MobileLogFields = {},
): void {
  emit('warn', scope, event, fields)
}

export function mobileLogError(
  scope: string,
  event: string,
  fields: MobileLogFields = {},
): void {
  emit('error', scope, event, fields)
}

export function createSanitizedConsole(scope: string): Pick<Console, 'error' | 'log' | 'warn'> {
  return {
    log: (...values: unknown[]) => mobileLogDebug(scope, 'diagnostic', { values }),
    warn: (...values: unknown[]) => mobileLogWarn(scope, 'diagnostic', { values }),
    error: (...values: unknown[]) => mobileLogError(scope, 'diagnostic', { values }),
  }
}
