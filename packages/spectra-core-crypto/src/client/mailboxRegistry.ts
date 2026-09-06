/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { ChatIdentity, MailboxScopeState } from '../types'
import type { LocalStorage } from '../storage/local'
import type { BundleServer } from '../server'
import {
  deriveScopedRecipientMailboxToken,
} from '../crypto/sealedEnvelope'

export interface RealtimeMailboxToken {
  token: string
  source: 'local_scope' | 'server_registry'
}

type LocalScopeMode = 'preferred' | 'all'
type RegisteredMailboxMode = 'none' | 'all'
export type MailboxScopeRegistrationUrgency = 'all' | 'required' | 'refresh'
export const MAILBOX_SCOPE_REGISTRATION_VERSION = 1
export const MAILBOX_SCOPE_REGISTRATION_REFRESH_MS = 5 * 60 * 1000

function selectPreferredScopesByRemote(scopes: MailboxScopeState[]): MailboxScopeState[] {
  const preferred = new Map<string, MailboxScopeState>()
  for (const scope of scopes) {
    if (!preferred.has(scope.remoteIdentityId)) {
      preferred.set(scope.remoteIdentityId, scope)
    }
  }
  return Array.from(preferred.values())
}

async function listInboundMailboxScopes(
  identityId: string,
  storage: Pick<LocalStorage, 'getMailboxScopes'>,
  mode: LocalScopeMode,
): Promise<MailboxScopeState[]> {
  const inboundScopes = (await storage.getMailboxScopes(identityId))
    .filter((scope) =>
      scope.status === 'active'
      || (scope.status === 'pending' && scope.initiatedByLocal === true)
    )
    .sort((left, right) => {
      const rightReady = right.status === 'active' && right.registeredAt && right.acknowledgedAt ? 1 : 0
      const leftReady = left.status === 'active' && left.registeredAt && left.acknowledgedAt ? 1 : 0
      if (rightReady !== leftReady) return rightReady - leftReady
      const rightTimestamp = right.registeredAt ?? right.acknowledgedAt ?? right.updatedAt ?? right.createdAt
      const leftTimestamp = left.registeredAt ?? left.acknowledgedAt ?? left.updatedAt ?? left.createdAt
      return rightTimestamp - leftTimestamp
    })

  return mode === 'all'
    ? inboundScopes
    : selectPreferredScopesByRemote(inboundScopes)
}

function classifyMailboxScopeRegistration(
  scope: MailboxScopeState,
  nowMs: number,
): 'required' | 'refresh' | 'none' {
  if (!scope.registeredAt) return 'required'
  if (scope.registrationVersion !== MAILBOX_SCOPE_REGISTRATION_VERSION) return 'required'
  if (nowMs - scope.registeredAt > MAILBOX_SCOPE_REGISTRATION_REFRESH_MS) return 'refresh'
  return 'none'
}

function shouldRegisterMailboxScope(
  classification: 'required' | 'refresh' | 'none',
  urgency: MailboxScopeRegistrationUrgency,
): boolean {
  if (classification === 'none') return false
  return urgency === 'all' || classification === urgency
}

export async function ensureInboundMailboxScopes(params: {
  identity: ChatIdentity
  storage: Pick<LocalStorage, 'getMailboxScopes'>
  localScopeMode?: LocalScopeMode
  registerScope?: (scope: MailboxScopeState) => Promise<MailboxScopeState>
  registrationUrgency?: MailboxScopeRegistrationUrgency
  nowMs?: () => number
}): Promise<MailboxScopeState[]> {
  const localScopeMode = params.localScopeMode ?? 'preferred'
  const registrationUrgency = params.registrationUrgency ?? 'all'
  const nowMs = params.nowMs ?? Date.now
  const activeScopes = await listInboundMailboxScopes(params.identity.id, params.storage, localScopeMode)
  const registeredScopes: MailboxScopeState[] = []

  for (const scope of activeScopes) {
    const classification = classifyMailboxScopeRegistration(scope, nowMs())
    let activeScope = scope
    if (shouldRegisterMailboxScope(classification, registrationUrgency) && params.registerScope) {
      try {
        activeScope = await params.registerScope({
          ...scope,
          acknowledgedAt: scope.acknowledgedAt ?? nowMs(),
        })
      } catch (error) {
        if (!scope.registeredAt) throw error
      }
    }
    registeredScopes.push(activeScope)
  }

  return registeredScopes
}

export async function listRealtimeMailboxTokens(params: {
  identity: ChatIdentity
  storage: Pick<LocalStorage, 'getMailboxScopes'>
  bundleServer?: (BundleServer & {
    listRegisteredMailboxTokens?: (identityId: string) => Promise<string[]>
  }) | null
  registerScope?: (scope: MailboxScopeState) => Promise<MailboxScopeState>
  localScopeMode?: LocalScopeMode
  registeredMailboxMode?: RegisteredMailboxMode
  registrationUrgency?: MailboxScopeRegistrationUrgency
  onRegisteredTokens?: (tokenCount: number, fetchCount: number) => void
  onRegistryError?: (error: unknown) => void
  nowMs?: () => number
}): Promise<RealtimeMailboxToken[]> {
  const localScopeMode = params.localScopeMode ?? 'preferred'
  const registeredMailboxMode = params.registeredMailboxMode ?? 'none'
  const tokens: RealtimeMailboxToken[] = []
  const seenTokens = new Set<string>()

  const addToken = (token: RealtimeMailboxToken): void => {
    if (seenTokens.has(token.token)) return
    seenTokens.add(token.token)
    tokens.push(token)
  }

  const localScopes = await ensureInboundMailboxScopes({
    identity: params.identity,
    storage: params.storage,
    localScopeMode,
    registerScope: params.registerScope,
    registrationUrgency: params.registrationUrgency ?? 'required',
    nowMs: params.nowMs,
  })

  for (const scope of localScopes) {
    addToken({
      token: deriveScopedRecipientMailboxToken({
        recipient: params.identity,
        scopeSecret: scope.scopeSecret,
        scopeId: scope.scopeId,
        epoch: scope.epoch,
      }),
      source: 'local_scope',
    })
  }

  const listRegisteredMailboxTokens = registeredMailboxMode === 'none'
    ? undefined
    : params.bundleServer?.listRegisteredMailboxTokens
  if (listRegisteredMailboxTokens) {
    try {
      const registeredTokens = await listRegisteredMailboxTokens.call(params.bundleServer, params.identity.id)
      for (const token of registeredTokens) {
        addToken({
          token,
          source: 'server_registry',
        })
      }
      params.onRegisteredTokens?.(registeredTokens.length, tokens.length)
    } catch (error) {
      params.onRegistryError?.(error)
    }
  }

  return tokens
}
