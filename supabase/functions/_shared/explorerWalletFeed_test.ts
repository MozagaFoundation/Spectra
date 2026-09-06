import { assertEquals, assertThrows } from '../../tests/assert.ts'
import {
  decodeExplorerFeedCursor,
  encodeExplorerFeedCursor,
  fetchExplorerWalletFeed,
} from './explorerWalletFeed.ts'

Deno.test('Explorer feed cursors round trip without exposing address data', () => {
  const cursor = {
    height: 12_345,
    txHash: `EXO${'a'.repeat(64)}`,
  }
  const encoded = encodeExplorerFeedCursor(cursor)

  assertEquals(decodeExplorerFeedCursor(encoded), cursor)
  assertEquals(encoded.includes(cursor.txHash), false)
})

Deno.test('Explorer feed rejects malformed persisted cursors', () => {
  assertThrows(
    () => decodeExplorerFeedCursor('not-a-valid-cursor'),
    /wallet_index_external_cursor_invalid/,
  )
})

Deno.test('Explorer feed keeps syncing while the source history replays', async () => {
  const names = ['MOZAGA_EXPLORER_FEED_URL', 'MOZAGA_EXPLORER_FEED_SECRET']
  const original = new Map(names.map((name) => [name, Deno.env.get(name)]))
  const originalFetch = globalThis.fetch
  try {
    Deno.env.set('MOZAGA_EXPLORER_FEED_URL', 'https://explorer.example.test/spectra-wallet-feed')
    Deno.env.set('MOZAGA_EXPLORER_FEED_SECRET', 's'.repeat(32))
    globalThis.fetch = () =>
      Promise.resolve(Response.json({
        records: [],
        nextCursor: null,
        syncComplete: false,
      }))

    const response = await fetchExplorerWalletFeed({
      addresses: [`EXO${'a'.repeat(40)}`],
      cursor: { height: -1, txHash: '' },
    })

    assertEquals(response, {
      records: [],
      nextCursor: null,
      syncComplete: false,
    })
  } finally {
    globalThis.fetch = originalFetch
    for (const name of names) {
      const value = original.get(name)
      if (value === undefined) Deno.env.delete(name)
      else Deno.env.set(name, value)
    }
  }
})
