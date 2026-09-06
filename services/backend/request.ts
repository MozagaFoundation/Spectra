/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { SPECTRA_API_URL } from '@/lib/constants'
import { torAwareFetch } from '@/services/tor/torFetch'
import { useAppUpdateStore } from '@/store/appUpdateStore'
import {
  getAppVersionHeaders,
  parseAppUpdateRequiredPolicy,
  type AppUpdatePolicy,
} from './appVersion'
import { buildBackendUrl } from './url'

const MAX_BACKEND_RESPONSE_BYTES = 1024 * 1024
const IDENTITY_BINDING_REQUIRED = 'identity_binding_required'

export type BackendMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface SpectraBackendOptions {
  accessToken?: string | null
  baseUrl?: string
  signal?: AbortSignal
  disableIdentityRecovery?: boolean
  maxResponseBytes?: number
}

type BackendIdentityRecoveryHandler = () => Promise<string | null>

let identityRecoveryHandler: BackendIdentityRecoveryHandler | null = null

export class SpectraBackendError extends Error {
  readonly status: number
  readonly code: string | null
  readonly retryAfterMs: number | null
  readonly appUpdatePolicy: AppUpdatePolicy | null

  constructor(
    status: number,
    code: string | null,
    retryAfterMs: number | null = null,
    appUpdatePolicy: AppUpdatePolicy | null = null,
  ) {
    super(code ? `Spectra backend ${status}: ${code}` : `Spectra backend HTTP ${status}`)
    this.name = 'SpectraBackendError'
    this.status = status
    this.code = code
    this.retryAfterMs = retryAfterMs
    this.appUpdatePolicy = appUpdatePolicy
  }
}

export function isSpectraBackendConfigured(baseUrl = SPECTRA_API_URL): boolean {
  return Boolean(baseUrl.trim())
}

export function registerBackendIdentityRecovery(
  handler: BackendIdentityRecoveryHandler,
): () => void {
  identityRecoveryHandler = handler
  return () => {
    if (identityRecoveryHandler === handler) identityRecoveryHandler = null
  }
}

export async function recoverBackendIdentityBinding(): Promise<string | null> {
  return identityRecoveryHandler?.() ?? null
}

export async function backendRequest<T>(
  path: string,
  request: { method: BackendMethod; body?: unknown; headers?: Record<string, string> },
  options: SpectraBackendOptions = {},
): Promise<T> {
  try {
    return await performBackendRequest<T>(path, request, options)
  } catch (error) {
    if (
      options.disableIdentityRecovery
      || !(error instanceof SpectraBackendError)
      || error.status !== 403
      || error.code !== IDENTITY_BINDING_REQUIRED
      || !options.accessToken
      || !identityRecoveryHandler
    ) throw error

    const accessToken = await recoverBackendIdentityBinding()
    if (!accessToken) throw error
    return performBackendRequest<T>(path, request, { ...options, accessToken })
  }
}

async function performBackendRequest<T>(
  path: string,
  request: { method: BackendMethod; body?: unknown; headers?: Record<string, string> },
  options: SpectraBackendOptions,
): Promise<T> {
  const baseUrl = options.baseUrl || SPECTRA_API_URL
  if (!baseUrl) {
    throw new SpectraBackendError(0, 'backend_not_configured')
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(request.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    ...request.headers,
    ...getAppVersionHeaders(),
  }
  if (options.accessToken) {
    headers.Authorization = `Bearer ${options.accessToken}`
  }

  const response = await torAwareFetch(buildBackendUrl(baseUrl, path), {
    method: request.method,
    headers,
    ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
    ...(options.signal ? { signal: options.signal } : {}),
  })
  const responseText = await readBoundedResponse(response, options.maxResponseBytes)
  if (!response.ok) {
    const appUpdatePolicy = recordAppUpdateRequiredResponse(response.status, responseText)
    throw new SpectraBackendError(
      response.status,
      parseBackendErrorCode(responseText),
      parseRetryAfterMs(response.headers?.get?.('retry-after') ?? null),
      appUpdatePolicy,
    )
  }
  if (responseText.length === 0) {
    return null as T
  }
  return JSON.parse(responseText) as T
}

async function readBoundedResponse(
  response: Response,
  maxResponseBytes = MAX_BACKEND_RESPONSE_BYTES,
): Promise<string> {
  const text = await response.text()
  const limit = Number.isSafeInteger(maxResponseBytes) && maxResponseBytes > 0
    ? maxResponseBytes
    : MAX_BACKEND_RESPONSE_BYTES
  if (text.length > limit) {
    throw new SpectraBackendError(response.status, 'response_too_large')
  }
  return text
}

function parseBackendErrorCode(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { error?: unknown }
    return typeof parsed.error === 'string' ? parsed.error : null
  } catch {
    return null
  }
}

export function recordAppUpdateRequiredResponse(
  status: number,
  body: string,
): AppUpdatePolicy | null {
  if (status !== 426) return null
  try {
    const policy = parseAppUpdateRequiredPolicy(JSON.parse(body))
    if (policy) {
      useAppUpdateStore.getState().requireUpdate(policy)
    }
    return policy
  } catch {
    return null
  }
}

function parseRetryAfterMs(value: string | null): number | null {
  if (!value || !/^[1-9][0-9]*$/.test(value)) return null
  const seconds = Number(value)
  if (!Number.isSafeInteger(seconds)) return null
  return Math.min(seconds * 1_000, 60_000)
}
