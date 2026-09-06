/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { rememberPendingContactShareAddress } from '@/lib/pendingContactShare'

const DEV_CLIENT_PATH_PREFIXES = ['/expo-development-client']
const TRUSTED_HTTPS_HOSTS = new Set([
  'spectraprotocol.org',
  'www.spectraprotocol.org',
])
const NO_PARAM_ROUTES = new Set(['/', '/select-language', '/unlock'])
const SHARE_MANIFEST_PATH = /\/SpectraShare\/[a-f0-9-]{36}\/manifest\.json$/
const CONTACT_SHARE_PATH = /^\/u\/(EXO00[0-9a-fA-F]{38})$/
const SENSITIVE_PARAM_NAME = /(?:auth|bearer|capabilit|credential|key|mnemonic|nonce|object|password|secret|seed|signature|token|wallet)/i
const SENSITIVE_PARAM_VALUE = /(?:bearer\s+|spectra:\/\/objects\/|capability|private[_-]?key)/i

type IncomingLocation = {
  pathname: string
  params: URLSearchParams
  source: 'custom' | 'https' | 'internal'
}

function normalizePathname(pathname: string): string {
  if (/%2f|%5c/i.test(pathname)) {
    throw new Error('Encoded path separators are not allowed')
  }
  const decoded = decodeURIComponent(pathname)
  const normalizedPath = decoded.replace(/\/+/g, '/')
  return normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`
}

function parseIncomingLocation(path: string): IncomingLocation {
  const trimmed = path.trim()
  if (!trimmed || trimmed.includes('\0')) {
    throw new Error('Incoming path is empty')
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    const url = new URL(trimmed)
    if (url.username || url.password || url.hash) {
      throw new Error('Credentials and fragments are not allowed')
    }

    if (url.protocol === 'https:') {
      if (!TRUSTED_HTTPS_HOSTS.has(url.hostname.toLowerCase()) || url.port) {
        throw new Error('HTTPS link host is not trusted')
      }
      return {
        pathname: normalizePathname(url.pathname || '/'),
        params: url.searchParams,
        source: 'https',
      }
    }

    if (url.protocol !== 'spectra:') {
      throw new Error('Custom URL scheme is not allowed')
    }
    const combinedPath = url.host ? `/${url.host}${url.pathname}` : url.pathname
    return {
      pathname: normalizePathname(combinedPath || '/'),
      params: url.searchParams,
      source: 'custom',
    }
  }

  const fragmentIndex = trimmed.indexOf('#')
  if (fragmentIndex >= 0) {
    throw new Error('Fragments are not allowed')
  }
  const queryIndex = trimmed.indexOf('?')
  return {
    pathname: normalizePathname(queryIndex >= 0 ? trimmed.slice(0, queryIndex) : trimmed),
    params: new URLSearchParams(queryIndex >= 0 ? trimmed.slice(queryIndex + 1) : ''),
    source: 'internal',
  }
}

function stripRouteGroups(path: string): string {
  return path.replace(/^(?:\/\((auth|main)\))+/, '') || '/'
}

function assertUniqueSafeParams(params: URLSearchParams): string[] {
  const names: string[] = []
  const seen = new Set<string>()
  for (const [name, value] of params.entries()) {
    const normalizedName = name.toLowerCase()
    if (
      !name
      || seen.has(normalizedName)
      || SENSITIVE_PARAM_NAME.test(name)
      || SENSITIVE_PARAM_VALUE.test(value)
    ) {
      throw new Error('Unsafe or duplicate URL parameter')
    }
    seen.add(normalizedName)
    names.push(name)
  }
  return names
}

function validateShareManifest(value: string): string {
  const manifest = new URL(value)
  if (
    manifest.protocol !== 'file:'
    || manifest.username
    || manifest.password
    || manifest.search
    || manifest.hash
    || manifest.pathname.includes('..')
    || !SHARE_MANIFEST_PATH.test(manifest.pathname)
  ) {
    throw new Error('Share manifest location is invalid')
  }
  return manifest.toString()
}

function contactShareRedirect(pathname: string): string | null {
  const match = CONTACT_SHARE_PATH.exec(pathname)
  if (!match) return null
  const address = `EXO00${match[1]!.slice(5).toLowerCase()}`
  rememberPendingContactShareAddress(address)
  return `/contact/add?scannedInvite=${encodeURIComponent(address)}`
}

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const incoming = parseIncomingLocation(path)
    const normalizedPath = stripRouteGroups(incoming.pathname)

    if (DEV_CLIENT_PATH_PREFIXES.some((prefix) => normalizedPath.startsWith(prefix))) {
      return '/'
    }

    const paramNames = assertUniqueSafeParams(incoming.params)
    if (NO_PARAM_ROUTES.has(normalizedPath)) {
      return paramNames.length === 0 ? normalizedPath : '/'
    }
    if (normalizedPath === '/share/import' && incoming.source !== 'https') {
      if (paramNames.length !== 1 || paramNames[0] !== 'manifest') return '/'
      const manifest = validateShareManifest(incoming.params.get('manifest') ?? '')
      return `/share/import?manifest=${encodeURIComponent(manifest)}`
    }

    if (paramNames.length === 0) {
      const contactShare = contactShareRedirect(normalizedPath)
      if (contactShare) return contactShare
    }

    return '/'
  } catch {
    return '/'
  }
}
