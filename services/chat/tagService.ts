/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import {
  addWalletToLocalTag,
  createLocalTag,
  removeLocalTag,
  removeWalletFromLocalTag,
  upsertLocalTag,
} from '../../lib/addressBook/addressBookState'
import { looksLikeWalletAddress, normalizeAddressBookWalletAddress } from '../../lib/addressBook/contactKeys'
import { useChatStore } from '@/store/chatStore'
import { useSpectreStore } from '@/store/spectreStore'
import { useWalletStore } from '@/store/walletStore'
import type { UserTag } from '@/lib/types'
import {
  loadActiveAddressBookSnapshot,
  updateActiveAddressBookSnapshot,
} from '@/services/storage/addressBookStorage'
import { canUseTagsInSpectre, SPECTRE_TAG_MESSAGE } from '@/lib/spectrePolicy'

function getCurrentSpectrePolicyState() {
  const spectreState = useSpectreStore.getState()
  const wallet = useWalletStore.getState().wallet
  return {
    enabled: spectreState.enabled,
    accountMode: spectreState.spectreAccountMode,
    walletIsSpectre: wallet?.spectreMode === true,
  }
}

function getTagRestrictionError(): Error | null {
  return canUseTagsInSpectre(getCurrentSpectrePolicyState())
    ? null
    : new Error(SPECTRE_TAG_MESSAGE)
}

function resolveContactWalletAddressFromStore(contactRef: string): string | null {
  const normalizedRef = normalizeAddressBookWalletAddress(contactRef)
  if (looksLikeWalletAddress(contactRef)) {
    return normalizedRef ?? null
  }

  const { contacts } = useChatStore.getState()
  const contact = contacts.find(
    (entry) => entry.identityId === contactRef
      || normalizeAddressBookWalletAddress(entry.walletAddress) === normalizedRef
  )
  return normalizeAddressBookWalletAddress(contact?.walletAddress) || null
}

async function resolveContactWalletAddress(contactRef: string): Promise<string | null> {
  const fromStore = resolveContactWalletAddressFromStore(contactRef)
  if (fromStore) {
    return fromStore
  }
  return null
}

export async function loadUserTags(ownerWalletAddress: string): Promise<void> {
  try {
    const snapshot = await loadActiveAddressBookSnapshot()
    const normalizedOwnerWalletAddress = normalizeAddressBookWalletAddress(ownerWalletAddress) || ownerWalletAddress
    const userTags = snapshot.tags.filter(
      (tag) => (normalizeAddressBookWalletAddress(tag.ownerWalletAddress) || tag.ownerWalletAddress) === normalizedOwnerWalletAddress,
    )
    useChatStore.getState().setTags(userTags)
  } catch (error) {
    console.error('Failed to load user tags:', error)
  }
}

export async function createTag(
  ownerWalletAddress: string,
  tagName: string
): Promise<{ tag: UserTag | null; error: Error | null }> {
  const spectreRestriction = getTagRestrictionError()
  if (spectreRestriction) {
    return { tag: null, error: spectreRestriction }
  }

  try {
    const normalized = tagName.replace(/^#/, '').trim().toLowerCase()
    if (!normalized) {
      return { tag: null, error: new Error('Tag name cannot be empty') }
    }
    const normalizedOwnerWalletAddress = normalizeAddressBookWalletAddress(ownerWalletAddress) || ownerWalletAddress

    const existing = useChatStore.getState().tags.find(
      (tag) => (normalizeAddressBookWalletAddress(tag.ownerWalletAddress) || tag.ownerWalletAddress) === normalizedOwnerWalletAddress
        && tag.tagName === normalized,
    )
    if (existing) {
      return { tag: null, error: new Error('Tag already exists') }
    }

    const newTag = createLocalTag(normalizedOwnerWalletAddress, normalized)
    const snapshot = await updateActiveAddressBookSnapshot((current) => upsertLocalTag(current, newTag))
    useChatStore.getState().setTags(snapshot.tags.filter(
      (tag) => (normalizeAddressBookWalletAddress(tag.ownerWalletAddress) || tag.ownerWalletAddress) === normalizedOwnerWalletAddress,
    ))
    return { tag: newTag, error: null }
  } catch (error) {
    return { tag: null, error: error as Error }
  }
}

export async function deleteTag(tagId: string): Promise<{ error: Error | null }> {
  const spectreRestriction = getTagRestrictionError()
  if (spectreRestriction) {
    return { error: spectreRestriction }
  }

  try {
    const snapshot = await updateActiveAddressBookSnapshot((current) => removeLocalTag(current, tagId))
    useChatStore.getState().setTags(snapshot.tags)
    return { error: null }
  } catch (error) {
    return { error: error as Error }
  }
}

export async function addContactToTag(
  tagId: string,
  contactRef: string
): Promise<{ error: Error | null }> {
  const spectreRestriction = getTagRestrictionError()
  if (spectreRestriction) {
    return { error: spectreRestriction }
  }

  try {
    const walletAddress = await resolveContactWalletAddress(contactRef)
    if (!walletAddress) {
      throw new Error('Contact wallet address is required to tag a canonical contact')
    }

    const snapshot = await updateActiveAddressBookSnapshot((current) => addWalletToLocalTag(current, tagId, walletAddress))
    useChatStore.getState().setTags(snapshot.tags)
    return { error: null }
  } catch (error) {
    return { error: error as Error }
  }
}

export async function removeContactFromTag(
  tagId: string,
  contactRef: string
): Promise<{ error: Error | null }> {
  const spectreRestriction = getTagRestrictionError()
  if (spectreRestriction) {
    return { error: spectreRestriction }
  }

  try {
    const walletAddress = await resolveContactWalletAddress(contactRef)
    if (!walletAddress) {
      throw new Error('Contact wallet address is required to untag a canonical contact')
    }

    const snapshot = await updateActiveAddressBookSnapshot((current) => removeWalletFromLocalTag(current, tagId, walletAddress))
    useChatStore.getState().setTags(snapshot.tags)
    return { error: null }
  } catch (error) {
    return { error: error as Error }
  }
}
