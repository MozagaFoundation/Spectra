/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import * as SecureStore from 'expo-secure-store'

import { isSameAccountStorageScope, normalizeAccountStorageScope } from '@/lib/accountScope'
import { SECURE_STORE_OPTIONS, STORAGE_KEYS } from '@/lib/constants'
import { parseContactInvite } from '@/lib/contactInvite'
import type { ActiveContactCard } from '@/services/shared/ephemeralDiscoveryActivity'

const MAX_PERSISTED_BYTES = 1800

type PersistedCardMap = Record<string, ActiveContactCard>

let mutation: Promise<unknown> = Promise.resolve()

function mutate<T>(operation: () => Promise<T>): Promise<T> {
  const result = mutation.catch(() => undefined).then(operation)
  mutation = result
  return result
}

function isActiveContactCard(value: unknown): value is ActiveContactCard {
  if (!value || typeof value !== 'object') return false
  const card = value as Partial<ActiveContactCard>
  if (
    typeof card.cardId !== 'string'
    || typeof card.invite !== 'string'
    || typeof card.identityId !== 'string'
    || typeof card.walletAddress !== 'string'
    || !Number.isSafeInteger(card.expiresAt)
  ) {
    return false
  }
  const invite = parseContactInvite(card.invite)
  return Boolean(
    invite
    && invite.kind === 'contact_card'
    && invite.cardId === card.cardId
    && card.identityId.length >= 8
  )
}

function parseMap(raw: string | null, now: number): PersistedCardMap {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const cards: PersistedCardMap = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const scope = normalizeAccountStorageScope(key)
      if (!scope || !isActiveContactCard(value) || value.expiresAt <= now) continue
      if (!isSameAccountStorageScope(value.walletAddress, scope)) continue
      cards[scope] = value
    }
    return cards
  } catch {
    return {}
  }
}

async function readMap(now = Date.now()): Promise<PersistedCardMap> {
  const raw = await SecureStore.getItemAsync(STORAGE_KEYS.ONE_TIME_CONTACT_CARD, SECURE_STORE_OPTIONS)
  return parseMap(raw, now)
}

async function writeMap(cards: PersistedCardMap, preferScope?: string): Promise<void> {
  const now = Date.now()
  const live = Object.fromEntries(
    Object.entries(cards).filter(([, card]) => card.expiresAt > now),
  )
  if (Object.keys(live).length === 0) {
    await SecureStore.deleteItemAsync(STORAGE_KEYS.ONE_TIME_CONTACT_CARD, SECURE_STORE_OPTIONS)
    return
  }
  let payload = JSON.stringify(live)
  if (payload.length > MAX_PERSISTED_BYTES) {
    const preferred = preferScope ? live[preferScope] : null
    const newest = preferred ?? Object.values(live).sort((left, right) => right.expiresAt - left.expiresAt)[0]
    const scope = newest ? normalizeAccountStorageScope(newest.walletAddress) : null
    const trimmed = scope && newest ? { [scope]: newest } : {}
    payload = JSON.stringify(trimmed)
    if (Object.keys(trimmed).length === 0 || payload.length > MAX_PERSISTED_BYTES) {
      await SecureStore.deleteItemAsync(STORAGE_KEYS.ONE_TIME_CONTACT_CARD, SECURE_STORE_OPTIONS)
      return
    }
  }
  await SecureStore.setItemAsync(STORAGE_KEYS.ONE_TIME_CONTACT_CARD, payload, SECURE_STORE_OPTIONS)
}

export async function readPersistedContactCard(
  walletAddress: string,
): Promise<ActiveContactCard | null> {
  const scope = normalizeAccountStorageScope(walletAddress)
  if (!scope) return null
  const cards = await mutate(() => readMap())
  return cards[scope] ?? null
}

export async function writePersistedContactCard(card: ActiveContactCard): Promise<void> {
  const scope = normalizeAccountStorageScope(card.walletAddress)
  if (!scope || !isActiveContactCard(card) || card.expiresAt <= Date.now()) return
  await mutate(async () => {
    const cards = await readMap()
    cards[scope] = card
    await writeMap(cards, scope)
  })
}

export async function deletePersistedContactCard(walletAddress: string): Promise<void> {
  const scope = normalizeAccountStorageScope(walletAddress)
  if (!scope) return
  await mutate(async () => {
    const cards = await readMap()
    if (!cards[scope]) return
    delete cards[scope]
    await writeMap(cards)
  })
}

export async function clearAllPersistedContactCards(): Promise<void> {
  await mutate(() =>
    SecureStore.deleteItemAsync(STORAGE_KEYS.ONE_TIME_CONTACT_CARD, SECURE_STORE_OPTIONS)
  )
}
