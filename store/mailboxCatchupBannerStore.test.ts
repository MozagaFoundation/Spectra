/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useMailboxCatchupBannerStore } from './mailboxCatchupBannerStore'

describe('mailbox catch-up banner store', () => {
  beforeEach(() => {
    useMailboxCatchupBannerStore.getState().reset()
  })

  afterEach(() => {
    useMailboxCatchupBannerStore.getState().reset()
  })

  it('starts a cold-start session at preparing', () => {
    useMailboxCatchupBannerStore.getState().begin()

    expect(useMailboxCatchupBannerStore.getState()).toMatchObject({
      phase: 'preparing',
      sessionId: 1,
    })
    expect(useMailboxCatchupBannerStore.getState().startedAt).toEqual(expect.any(Number))
  })

  it('ignores a second begin while a session is active', () => {
    const store = useMailboxCatchupBannerStore.getState()
    store.begin()
    store.advance('checking_mailbox')
    const first = useMailboxCatchupBannerStore.getState()

    useMailboxCatchupBannerStore.getState().begin()

    expect(useMailboxCatchupBannerStore.getState()).toMatchObject({
      phase: 'checking_mailbox',
      sessionId: first.sessionId,
      startedAt: first.startedAt,
    })
  })

  it('advances phases monotonically and never backwards', () => {
    const store = useMailboxCatchupBannerStore.getState()
    store.begin()
    store.advance('decrypting')
    store.advance('loading_local')
    store.advance('checking_mailbox')

    expect(useMailboxCatchupBannerStore.getState().phase).toBe('decrypting')
  })

  it('hides immediately when a visible message arrives', () => {
    const store = useMailboxCatchupBannerStore.getState()
    store.begin()
    store.advance('decrypting')
    store.complete('messages')

    expect(useMailboxCatchupBannerStore.getState().phase).toBeNull()
  })

  it('does not complete just because control envelopes were decrypted', () => {
    const store = useMailboxCatchupBannerStore.getState()
    store.begin()
    store.advance('decrypting')

    expect(useMailboxCatchupBannerStore.getState().phase).toBe('decrypting')
  })

  it('shows caught-up on an empty mailbox and ignores a second empty complete', () => {
    const store = useMailboxCatchupBannerStore.getState()
    store.begin()
    store.complete('empty')
    store.complete('empty')

    expect(useMailboxCatchupBannerStore.getState().phase).toBe('caught_up')
  })

  it('lets a visible message hide the empty-complete state', () => {
    const store = useMailboxCatchupBannerStore.getState()
    store.begin()
    store.complete('empty')
    store.complete('messages')

    expect(useMailboxCatchupBannerStore.getState().phase).toBeNull()
  })

  it('resets leftover session state', () => {
    const store = useMailboxCatchupBannerStore.getState()
    store.begin()
    store.advance('connecting')
    store.reset()

    expect(useMailboxCatchupBannerStore.getState()).toMatchObject({
      sessionId: null,
      phase: null,
      startedAt: null,
    })
  })
})
