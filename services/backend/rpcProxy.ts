/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { backendRequest, isSpectraBackendConfigured } from '@/services/backend/client'
import { getValidBackendAccessToken } from './session'

export type RpcProxyJsonChain = 'mozaga' | 'ethereum' | 'bitcoin' | 'solana'

interface JsonRpcProxyResponse<T> {
  result?: T
  error?: { code?: number; message?: string } | string
}

function getProxyErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object') {
    const error = (payload as { error?: unknown }).error
    if (typeof error === 'string' && error.trim()) return error
    if (error && typeof error === 'object') {
      const message = (error as { message?: unknown }).message
      if (typeof message === 'string' && message.trim()) return message
    }
  }
  return fallback
}

async function postRpcProxy<T>(payload: Record<string, unknown>): Promise<T> {
  const accessToken = await getValidBackendAccessToken()
  if (!accessToken) {
    throw new Error('RPC proxy requires backend auth')
  }
  return backendRequest<T>('/v1/rpc-proxy', {
    method: 'POST',
    body: payload,
  }, { accessToken })
}

export async function canUseRpcProxy(): Promise<boolean> {
  if (!isSpectraBackendConfigured()) return false
  try {
    return Boolean(await getValidBackendAccessToken())
  } catch {
    return false
  }
}

export async function rpcProxyCall<T>(
  chain: RpcProxyJsonChain,
  method: string,
  params: unknown[] = [],
): Promise<T> {
  const payload = await postRpcProxy<JsonRpcProxyResponse<T>>({ chain, method, params })
  if (payload.error) {
    throw new Error(getProxyErrorMessage(payload, `${chain} request failed`))
  }
  return payload.result as T
}

export async function tronProxyCall<T>(path: string, body: Record<string, unknown>): Promise<T> {
  return postRpcProxy<T>({
    chain: 'tron',
    path,
    body,
  })
}
