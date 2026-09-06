/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

export type UnreadBadgeDomains = {
  direct: number
  group: number
  walletTransfer: number
}

export type TabBadgeCounts = {
  chats: number
  wallets: number
}

function normalizeUnreadCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0
}

export function deriveTabBadgeCounts(domains: UnreadBadgeDomains): TabBadgeCounts {
  return {
    chats: normalizeUnreadCount(domains.direct)
      + normalizeUnreadCount(domains.group),
    wallets: normalizeUnreadCount(domains.walletTransfer),
  }
}

export function deriveApplicationBadgeCount(domains: UnreadBadgeDomains): number {
  const tabs = deriveTabBadgeCounts(domains)
  return tabs.chats + tabs.wallets
}
