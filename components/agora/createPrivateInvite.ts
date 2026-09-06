/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { createOneTimeContactCardInvite } from '@/lib/contactInvite'
import { createAgoraInvite } from '@/services/agora'
import {
  canReuseReservedContactCardPreKey,
  createOneTimeContactCard,
} from '@/services/backend/ephemeralDiscovery'

export async function createAgoraPrivateInvite(input: {
  roomId: string
  toIdentityId: string
  identityId: string
  walletAddress: string
}): Promise<{ inviteId: string; whisperId: string }> {
  const quantumChat = await import('@/services/quantumChat')
  const { ensureOwnContactProfile } = await import('@/services/chat/contactProfile')
  const reserved = await quantumChat.reserveOneTimeContactCardPreKey()
  if (!reserved) throw new Error('Your private chat identity is not ready yet.')

  try {
    const profile = await ensureOwnContactProfile(input.identityId)
    const card = await createOneTimeContactCard(
      input.identityId,
      input.walletAddress,
      reserved.bundle,
      reserved.cardOpk,
      profile,
    )
    return await createAgoraInvite(
      input.roomId,
      input.toIdentityId,
      createOneTimeContactCardInvite(card),
    )
  } catch (error) {
    if (canReuseReservedContactCardPreKey(error)) {
      await quantumChat.releaseOneTimeContactCardPreKey(reserved.cardOpk).catch(() => undefined)
    }
    throw error
  }
}
