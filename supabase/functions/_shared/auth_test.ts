import { assert, assertEquals } from '../../tests/assert.ts'
import { hasPendingAccountDeletion } from './auth.ts'
import type { Database } from './db.ts'

function databaseReturning(rows: readonly Record<string, unknown>[]) {
  const calls: Array<{ query: string; parameters: unknown[] }> = []
  const sql = ((
    strings: TemplateStringsArray,
    ...parameters: unknown[]
  ) => {
    calls.push({ query: strings.join('?'), parameters })
    return Promise.resolve(rows)
  }) as unknown as Database
  return { calls, sql }
}

Deno.test('wallet admission blocks only active deletion cleanup', async () => {
  const active = databaseReturning([{ matched: true }])
  const completed = databaseReturning([])

  assertEquals(await hasPendingAccountDeletion('wallet:active', active.sql), true)
  assertEquals(await hasPendingAccountDeletion('wallet:completed', completed.sql), false)

  const query = active.calls[0]
  assert(query, 'deletion query was not issued')
  assert(query.query.includes("status in ('pending', 'failed')"))
  assertEquals(query.parameters, ['wallet:active'])
})
