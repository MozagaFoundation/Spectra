/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { backendRequest, isSpectraBackendConfigured } from '@/services/backend/request'
import { backendData } from '@/services/backend/data'
import type { AppLanguage } from '@/lib/i18n/resources'

export interface NotificationTokenRequestOptions {
  accessToken?: string | null
}

export interface NotificationTokenRegistration {
  walletAddress: string
  notificationScopeId: string
  pushToken?: string | null
  notificationLabel?: string | null
  notificationLocale: AppLanguage
  protocolVersion: 2
  clientPlatform?: 'ios' | 'android' | null
}

export interface DBUserSettings {
  user_id: string
  message_font_size?: 'small' | 'medium' | 'large'
  muted_conversations?: string[]
}

type Result<T> = Promise<{ data: T; error: Error | null }>
type NullableResult<T> = Promise<{ data: T | null; error: Error | null }>

async function accessToken(options?: NotificationTokenRequestOptions): Promise<string | null> {
  if (options?.accessToken) return options.accessToken
  const { getValidBackendAccessToken } = await import('./session')
  return getValidBackendAccessToken()
}

async function requireAccessToken(options?: NotificationTokenRequestOptions): Promise<string> {
  const token = await accessToken(options)
  if (!token) throw new Error('Backend auth token is required')
  return token
}

export async function getBackendAccessToken(): Promise<string | null> {
  return accessToken()
}

export async function getBackendAuthHeaders(
  extraHeaders: Record<string, string> = {},
): Promise<Record<string, string>> {
  const token = await requireAccessToken()
  return {
    Authorization: `Bearer ${token}`,
    ...extraHeaders,
  }
}

export const backend = new Proxy({}, {
  get() {
    throw new Error('Legacy Backend client access is disabled; use Spectra backend adapters.')
  },
}) as any

export function isBackendConfigured(): boolean {
  return isSpectraBackendConfigured()
}

export async function deleteMessage(messageId: string): Promise<{ error: Error | null }> {
  try {
    const { error } = await backendData.table('messages').delete().eq('id', messageId)
    if (error) throw error
    return { error: null }
  } catch (error) {
    return { error: error as Error }
  }
}

export async function getUserSettings(userId: string): NullableResult<DBUserSettings> {
  const { data, error } = await backendData.table('user_settings').select('*').eq('user_id', userId).maybeSingle()
  return { data: data as DBUserSettings | null, error }
}

export async function getChatIdentityBundleExists(
  identityId: string,
): Result<boolean> {
  try {
    const token = await requireAccessToken()
    const result = await backendRequest<{ exists: boolean }>(
      `/v1/chat/bundles/${encodeURIComponent(identityId)}/exists`,
      { method: 'GET' },
      { accessToken: token },
    )
    return { data: result.exists === true, error: null }
  } catch (error) {
    return { data: false, error: error as Error }
  }
}

export async function upsertUserSettings(
  userIdOrSettings: string | DBUserSettings,
  maybeSettings?: Partial<DBUserSettings>,
): Promise<{ data: DBUserSettings | null; error: Error | null }> {
  try {
    const settings = typeof userIdOrSettings === 'string'
      ? { user_id: userIdOrSettings, ...maybeSettings }
      : userIdOrSettings
    const { error } = await backendData.table('user_settings').upsert(settings, { onConflict: 'user_id' })
    if (error) throw error
    return { data: settings, error: null }
  } catch (error) {
    return { data: null, error: error as Error }
  }
}

async function upsertAppDataRows(table: string, rows: unknown[], token: string): Promise<void> {
  await backendRequest('/v1/appdata/table', {
    method: 'POST',
    body: {
      table,
      action: 'upsert',
      payload: { rows },
    },
  }, { accessToken: token })
}

export async function updateNotificationRegistrationsForWallets(
  registrations: NotificationTokenRegistration[],
  options?: NotificationTokenRequestOptions,
): Promise<{ error: Error | null }> {
  try {
    const token = await accessToken(options)
    if (!token) return { error: new Error('Notification registration requires backend auth') }
    await upsertAppDataRows('notification_token_registrations', registrations.map((registration) => ({
      id: registration.notificationScopeId,
      wallet_address: registration.walletAddress,
      notification_scope_id: registration.notificationScopeId,
      push_token: registration.pushToken ?? null,
      notification_label: registration.notificationLabel ?? null,
      notification_locale: registration.notificationLocale,
      notification_protocol_version: registration.protocolVersion,
      client_platform: registration.clientPlatform ?? null,
      updated_at: new Date().toISOString(),
    })), token)
    return { error: null }
  } catch (error) {
    return { error: error as Error }
  }
}

export async function deleteNotificationRegistrationsByScopeIds(
  notificationScopeIds: string[],
  options?: NotificationTokenRequestOptions,
): Promise<{ error: Error | null }> {
  try {
    const scopeIds = [...new Set(
      notificationScopeIds.map((scopeId) => scopeId.trim()).filter(Boolean),
    )]
    if (scopeIds.length === 0) return { error: null }
    const token = await accessToken(options)
    if (!token) return { error: null }
    await backendRequest('/v1/appdata/table', {
      method: 'POST',
      body: {
        table: 'notification_token_registrations',
        action: 'delete',
        filters: [{
          op: 'in',
          column: 'notification_scope_id',
          value: scopeIds,
        }],
      },
    }, { accessToken: token })
    return { error: null }
  } catch (error) {
    return { error: error as Error }
  }
}

export async function deleteNotificationRegistrationsByPushTokens(
  pushTokens: string[],
  options?: NotificationTokenRequestOptions,
): Promise<{ error: Error | null }> {
  try {
    const tokens = [...new Set(
      pushTokens.map((pushToken) => pushToken.trim()).filter(Boolean),
    )]
    if (tokens.length === 0) return { error: null }
    const token = await accessToken(options)
    if (!token) return { error: new Error('Notification cleanup requires backend auth') }
    await Promise.all([
      'notification_token_registrations',
      'notification_tokens',
    ].map((table) => backendRequest('/v1/appdata/table', {
      method: 'POST',
      body: {
        table,
        action: 'delete',
        filters: [{
          op: 'in',
          column: 'push_token',
          value: tokens,
        }],
      },
    }, { accessToken: token })))
    return { error: null }
  } catch (error) {
    return { error: error as Error }
  }
}

export async function deleteSupersededLegacyNotificationRegistrations(
  walletAddresses: string[],
  pushToken: string | null,
  options?: NotificationTokenRequestOptions,
): Promise<{ error: Error | null }> {
  try {
    const addresses = [...new Set(
      walletAddresses.map((address) => address.trim()).filter(Boolean),
    )]
    const normalizedPushToken = pushToken?.trim()
    if (addresses.length === 0 || !normalizedPushToken) return { error: null }
    const token = await accessToken(options)
    if (!token) return { error: null }
    await backendRequest('/v1/appdata/table', {
      method: 'POST',
      body: {
        table: 'notification_token_registrations',
        action: 'delete',
        filters: [
          {
            op: 'in',
            column: 'wallet_address',
            value: addresses,
          },
          {
            op: 'eq',
            column: 'push_token',
            value: normalizedPushToken,
          },
          {
            op: 'is',
            column: 'notification_scope_id',
            value: null,
          },
        ],
      },
    }, { accessToken: token })
    return { error: null }
  } catch (error) {
    return { error: error as Error }
  }
}

export async function deleteSupersededScopedNotificationRegistrations(
  registrations: NotificationTokenRegistration[],
  options?: NotificationTokenRequestOptions,
): Promise<{ error: Error | null }> {
  try {
    const current = registrations.flatMap((registration) => {
      const notificationScopeId = registration.notificationScopeId.trim()
      const pushToken = registration.pushToken?.trim()
      return notificationScopeId && pushToken
        ? [{ ...registration, notificationScopeId, pushToken }]
        : []
    })
    if (current.length === 0) return { error: null }
    const token = await accessToken(options)
    if (!token) return { error: null }

    await Promise.all(current.map((registration) => backendRequest('/v1/appdata/table', {
      method: 'POST',
      body: {
        table: 'notification_token_registrations',
        action: 'delete',
        filters: [
          {
            op: 'eq',
            column: 'wallet_address',
            value: registration.walletAddress,
          },
          {
            op: 'eq',
            column: 'push_token',
            value: registration.pushToken,
          },
          {
            op: 'neq',
            column: 'notification_scope_id',
            value: registration.notificationScopeId,
          },
        ],
      },
    }, { accessToken: token })))
    return { error: null }
  } catch (error) {
    return { error: error as Error }
  }
}

export async function deleteLegacyNotificationTokensForWallets(
  walletAddresses: string[],
  options?: NotificationTokenRequestOptions,
): Promise<{ error: Error | null }> {
  try {
    const addresses = [...new Set(
      walletAddresses.map((address) => address.trim()).filter(Boolean),
    )]
    if (addresses.length === 0) return { error: null }
    const token = await accessToken(options)
    if (!token) return { error: null }
    await backendRequest('/v1/appdata/table', {
      method: 'POST',
      body: {
        table: 'notification_tokens',
        action: 'delete',
        filters: [{
          op: 'in',
          column: 'wallet_address',
          value: addresses,
        }],
      },
    }, { accessToken: token })
    return { error: null }
  } catch (error) {
    return { error: error as Error }
  }
}

export async function updateMutedConversations(
  userId: string,
  mutedConversations: string[],
): Promise<{ data: DBUserSettings | null; error: Error | null }> {
  const result = await upsertUserSettings({ user_id: userId, muted_conversations: mutedConversations })
  return { data: result.error ? null : { user_id: userId, muted_conversations: mutedConversations }, error: result.error }
}

export async function deleteConversationMessages(conversationId: string): Promise<{ error: Error | null }> {
  try {
    const { error } = await backendData.table('messages').delete().eq('conversation_id', conversationId)
    if (error) throw error
    return { error: null }
  } catch (error) {
    return { error: error as Error }
  }
}
