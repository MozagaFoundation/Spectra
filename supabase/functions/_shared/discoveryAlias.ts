const MAX_ALIAS_CODE_POINTS = 80
const MAX_ALIAS_BYTES = 320
const MIN_ALIAS_BODY_CODE_POINTS = 2
// deno-lint-ignore no-control-regex -- aliases must reject C0/C1 controls and line/paragraph separators
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u
const BIDI_CONTROL_PATTERN = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u
const UNPAIRED_SURROGATE_PATTERN =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/u
const ALIAS_BODY_PATTERN =
  /^(?:[\p{L}\p{N}_.\-]|[\p{Extended_Pictographic}\uFE0F\u200D\u{1F3FB}-\u{1F3FF}])+$/u

export const DISCOVERY_ALIAS_SEARCH_LIMIT = 8
export const MAX_DISCOVERY_ALIAS_BYTES = 320

export function canonicalDiscoveryAliasKey(value: string): string {
  return [...value.normalize('NFC')].map((character) => (
    character >= 'A' && character <= 'Z' ? character.toLowerCase() : character
  )).join('')
}

export function normalizeDiscoveryAlias(value?: string | null): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string' || UNPAIRED_SURROGATE_PATTERN.test(value)) {
    throw new Error('Invalid discovery alias')
  }
  const trimmed = value.trim().normalize('NFC')
  if (!trimmed) return undefined
  const withPrefix = trimmed.startsWith('@') ? trimmed : `@${trimmed}`
  const body = withPrefix.slice(1)
  const codePoints = [...withPrefix]
  if (
    !body ||
    [...body].length < MIN_ALIAS_BODY_CODE_POINTS ||
    codePoints.length > MAX_ALIAS_CODE_POINTS ||
    new TextEncoder().encode(withPrefix).byteLength > MAX_ALIAS_BYTES ||
    body.includes('@') ||
    /\s/u.test(withPrefix) ||
    CONTROL_CHARACTER_PATTERN.test(withPrefix) ||
    BIDI_CONTROL_PATTERN.test(withPrefix) ||
    !ALIAS_BODY_PATTERN.test(body)
  ) {
    throw new Error('Invalid discovery alias')
  }
  return withPrefix
}

export function parseDiscoveryAliasPrefix(value: string): string | null {
  if (typeof value !== 'string' || UNPAIRED_SURROGATE_PATTERN.test(value)) return null
  const trimmed = value.trim().normalize('NFC')
  if (!trimmed.startsWith('@')) return null
  const body = trimmed.slice(1)
  if (
    [...body].length < MIN_ALIAS_BODY_CODE_POINTS ||
    [...trimmed].length > MAX_ALIAS_CODE_POINTS ||
    new TextEncoder().encode(trimmed).byteLength > MAX_ALIAS_BYTES ||
    body.includes('@') ||
    /\s/u.test(trimmed) ||
    CONTROL_CHARACTER_PATTERN.test(trimmed) ||
    BIDI_CONTROL_PATTERN.test(trimmed) ||
    !ALIAS_BODY_PATTERN.test(body)
  ) {
    return null
  }
  return canonicalDiscoveryAliasKey(trimmed)
}

export function escapeIlikePattern(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')
}
