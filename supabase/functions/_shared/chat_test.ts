import { assert, assertEquals } from '../../tests/assert.ts'
import { isValidBundleRevision } from './chat.ts'

Deno.test('private identity binding accepts rotated bundle revisions', () => {
  assert(isValidBundleRevision(1))
  assert(isValidBundleRevision(2))
  assert(isValidBundleRevision(Number.MAX_SAFE_INTEGER))
  assertEquals(isValidBundleRevision(0), false)
  assertEquals(isValidBundleRevision(-1), false)
  assertEquals(isValidBundleRevision(1.5), false)
  assertEquals(isValidBundleRevision('2'), false)
})
