/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { createOneTimeContactCardInvite } from '@/lib/contactInvite'
import { isSameAccountStorageScope } from '@/lib/accountScope'
import {
  canReuseReservedContactCardPreKey,
  createOneTimeContactCard,
  isOwnOneTimeContactCardActive,
  publishPublicDiscoveryLease,
} from '@/services/backend/ephemeralDiscovery'
import { SpectraBackendError } from '@/services/backend/request'
import { getQuantumChatClient } from '@/services/quantumChat'
import {
  beginEphemeralDiscoveryActivity,
  clearActiveContactCard,
  resetEphemeralDiscoveryActivity,
  restoreActiveContactCard,
  subscribeToEphemeralDiscoveryActivity,
  type ActiveContactCard,
  type EphemeralDiscoveryFailure,
  type EphemeralDiscoveryOperation,
  type EphemeralDiscoveryScope,
} from '@/services/shared/ephemeralDiscoveryActivity'
import {
  registerAccountRuntimeAbortListener,
  registerAccountRuntimeResetListener,
} from '@/services/shared/accountRuntimeLifecycle'
import { useWalletStore } from '@/store/walletStore'
import { ensureOwnContactProfile } from './contactProfile'
import { discoveryAliasLeaseFields } from './discoveryAliasPublish'
import {
  clearAllPersistedContactCards,
  deletePersistedContactCard,
  readPersistedContactCard,
  writePersistedContactCard,
} from './oneTimeContactCardStorage'

type ChatClient = NonNullable<ReturnType<typeof getQuantumChatClient>>

interface OperationContext {
  activity: ReturnType<typeof beginEphemeralDiscoveryActivity>
  client: ChatClient
  controller: AbortController
  generation: number
  promise?: Promise<void>
  scope: EphemeralDiscoveryScope
}

let generation = 0
let inFlight: OperationContext | null = null
let activeContactCard: ActiveContactCard | null = null
let publicDiscoveryLease: (EphemeralDiscoveryScope & { expiresAt: number }) | null = null

function abortError(): Error {
  const error = new Error('Secure sharing was cancelled')
  error.name = 'AbortError'
  return error
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function sameScope(left: EphemeralDiscoveryScope, right: EphemeralDiscoveryScope): boolean {
  return left.identityId === right.identityId
    && isSameAccountStorageScope(left.walletAddress, right.walletAddress)
}

function currentContext(): { client: ChatClient; scope: EphemeralDiscoveryScope } | null {
  const client = getQuantumChatClient()
  const identity = client?.getIdentity()
  const walletAddress = useWalletStore.getState().wallet?.address
  if (!client || !identity?.id || !walletAddress) return null
  return {
    client,
    scope: {
      walletAddress,
      identityId: identity.id,
    },
  }
}

function isCurrent(context: OperationContext): boolean {
  const current = currentContext()
  return inFlight === context
    && context.generation === generation
    && !context.controller.signal.aborted
    && Boolean(current)
    && sameScope(context.scope, current!.scope)
    && current!.client === context.client
}

function wasReset(context: OperationContext): boolean {
  return context.generation !== generation
}

function discoveryFailure(error: unknown): EphemeralDiscoveryFailure {
  if (!(error instanceof SpectraBackendError)) return 'request_failed'
  if (error.code === 'contact_card_active') return 'active_contact_card'
  if (error.code === 'public_discovery_active') return 'active_public_discovery'
  return 'request_failed'
}

function getActiveContactCard(scope: EphemeralDiscoveryScope): ActiveContactCard | null {
  if (!activeContactCard) return null
  if (activeContactCard.expiresAt <= Date.now()) {
    clearActiveContactCard(activeContactCard)
    activeContactCard = null
    return null
  }
  if (!sameScope(activeContactCard, scope)) return null
  return activeContactCard
}

function getActivePublicDiscoveryLease(
  scope: EphemeralDiscoveryScope,
): (EphemeralDiscoveryScope & { expiresAt: number }) | null {
  if (!publicDiscoveryLease) return null
  if (publicDiscoveryLease.expiresAt <= Date.now()) {
    publicDiscoveryLease = null
    return null
  }
  if (!sameScope(publicDiscoveryLease, scope)) return null
  return publicDiscoveryLease
}

function rememberContactCard(card: ActiveContactCard): void {
  activeContactCard = card
  restoreActiveContactCard(card)
}

async function loadPersistedContactCard(
  scope: EphemeralDiscoveryScope,
): Promise<ActiveContactCard | null> {
  const memory = getActiveContactCard(scope)
  if (memory) return memory
  const persisted = await readPersistedContactCard(scope.walletAddress)
  if (!persisted || persisted.expiresAt <= Date.now() || !sameScope(persisted, scope)) {
    if (persisted) void Promise.resolve(deletePersistedContactCard(scope.walletAddress)).catch(() => undefined)
    return null
  }
  rememberContactCard(persisted)
  return persisted
}

function verifyPersistedContactCard(card: ActiveContactCard): void {
  void isOwnOneTimeContactCardActive(card.cardId).then((active) => {
    if (active) return
    if (activeContactCard?.cardId !== card.cardId) return
    activeContactCard = null
    clearActiveContactCard(card)
    void Promise.resolve(deletePersistedContactCard(card.walletAddress)).catch(() => undefined)
  }).catch(() => undefined)
}

function beginOperation(
  operation: EphemeralDiscoveryOperation,
): OperationContext | null {
  const current = currentContext()
  if (!current) return null
  if (inFlight) return null

  const controller = new AbortController()
  const context = {
    activity: beginEphemeralDiscoveryActivity(operation, current.scope),
    client: current.client,
    controller,
    generation,
    scope: current.scope,
  }
  inFlight = context
  return context
}

function finishOperation(context: OperationContext): void {
  if (inFlight === context) inFlight = null
}

function runContactCardOperation(context: OperationContext): Promise<void> {
  const promise = Promise.resolve().then(async () => {
    let reserved: Awaited<ReturnType<ChatClient['reserveOneTimeContactCardPreKey']>> = null
    try {
      const existingCard = await loadPersistedContactCard(context.scope)
      if (existingCard) {
        const active = await isOwnOneTimeContactCardActive(existingCard.cardId, {
          signal: context.controller.signal,
          onCancel: () => context.controller.abort(),
        })
        if (!isCurrent(context)) throw abortError()
        if (active) {
          context.activity.fail('active_contact_card')
          return
        }
        activeContactCard = null
        clearActiveContactCard(context.scope)
        await deletePersistedContactCard(context.scope.walletAddress).catch(() => undefined)
      }

      if (!isCurrent(context)) throw abortError()
      reserved = await context.client.reserveOneTimeContactCardPreKey()
      if (!reserved) throw new Error('No one-time pre-key is available. Please try again.')
      if (!isCurrent(context)) throw abortError()

      const profile = await ensureOwnContactProfile(context.scope.identityId)
      if (!isCurrent(context)) throw abortError()

      const card = await createOneTimeContactCard(
        context.scope.identityId,
        context.scope.walletAddress,
        reserved.bundle,
        reserved.cardOpk,
        profile,
        {
          signal: context.controller.signal,
          onCancel: () => context.controller.abort(),
        },
      )
      if (wasReset(context)) return

      const activeCard = {
        cardId: card.cardId,
        invite: createOneTimeContactCardInvite(card),
        expiresAt: card.expiresAt,
        ...context.scope,
      }
      activeContactCard = activeCard
      context.activity.contactCardReady(activeCard)
      await writePersistedContactCard(activeCard).catch(() => undefined)
    } catch (error) {
      if (reserved && canReuseReservedContactCardPreKey(error)) {
        await context.client.releaseOneTimeContactCardPreKey(reserved.cardOpk).catch(() => undefined)
      }
      if (isAbortError(error)) {
        context.activity.cancel()
      } else if (isCurrent(context)) {
        context.activity.fail(discoveryFailure(error))
      }
    } finally {
      finishOperation(context)
    }
  })

  context.promise = promise
  return promise
}

function runPublicDiscoveryOperation(context: OperationContext): Promise<void> {
  const promise = Promise.resolve().then(async () => {
    try {
      if (getActivePublicDiscoveryLease(context.scope)) {
        context.activity.fail('active_public_discovery')
        return
      }

      const [bundle, aliasFields] = await Promise.all([
        context.client.getPublicKeyBundle(),
        discoveryAliasLeaseFields(),
      ])
      if (!bundle || bundle.identityId !== context.scope.identityId) {
        throw new Error('Chat identity is not ready yet.')
      }
      if (!isCurrent(context)) throw abortError()

      const result = await publishPublicDiscoveryLease(
        context.scope.identityId,
        context.scope.walletAddress,
        bundle,
        {
          signal: context.controller.signal,
          onCancel: () => context.controller.abort(),
        },
        aliasFields,
      )
      if (wasReset(context)) return
      publicDiscoveryLease = {
        expiresAt: result.expiresAt,
        ...context.scope,
      }
      context.activity.publicDiscoveryReady(result.expiresAt)
    } catch (error) {
      if (isAbortError(error)) {
        context.activity.cancel()
      } else if (isCurrent(context)) {
        context.activity.fail(discoveryFailure(error))
      }
    } finally {
      finishOperation(context)
    }
  })

  context.promise = promise
  return promise
}

function existingOperationOrUnavailable(): Promise<void> {
  if (inFlight) return inFlight.promise ?? Promise.resolve()
  return Promise.reject(new Error('Chat identity is not ready yet.'))
}

export function startOneTimeContactCardCreation(): Promise<void> {
  const context = beginOperation('contact_card')
  if (!context) return existingOperationOrUnavailable()
  return runContactCardOperation(context)
}

export function startPublicDiscoveryPublication(): Promise<void> {
  const context = beginOperation('public_discovery')
  if (!context) return existingOperationOrUnavailable()
  return runPublicDiscoveryOperation(context)
}

export async function restorePersistedOneTimeContactCard(): Promise<void> {
  const current = currentContext()
  if (!current) return
  await loadPersistedContactCard(current.scope)
}

export async function verifyRestoredOneTimeContactCard(): Promise<void> {
  const current = currentContext()
  if (!current) return
  const card = await loadPersistedContactCard(current.scope)
  if (!card) return
  verifyPersistedContactCard(card)
}

export function abortEphemeralDiscoveryOperations(): void {
  inFlight?.controller.abort()
}

export function invalidateEphemeralDiscoveryOperations(): void {
  generation += 1
  abortEphemeralDiscoveryOperations()
  inFlight = null
  activeContactCard = null
  publicDiscoveryLease = null
  resetEphemeralDiscoveryActivity()
  void Promise.resolve(clearAllPersistedContactCards()).catch(() => undefined)
}

registerAccountRuntimeAbortListener(abortEphemeralDiscoveryOperations)
registerAccountRuntimeResetListener(invalidateEphemeralDiscoveryOperations)

subscribeToEphemeralDiscoveryActivity((event) => {
  if (event.type !== 'active_card_cleared' || !activeContactCard) return
  if (!sameScope(activeContactCard, event.scope)) return
  activeContactCard = null
  void Promise.resolve(deletePersistedContactCard(event.scope.walletAddress)).catch(() => undefined)
})
