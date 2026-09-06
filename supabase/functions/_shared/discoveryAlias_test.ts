import { assertEquals } from '../../tests/assert.ts'
import {
  canonicalDiscoveryAliasKey,
  escapeIlikePattern,
  normalizeDiscoveryAlias,
  parseDiscoveryAliasPrefix,
} from './discoveryAlias.ts'

Deno.test('discovery aliases accept unicode and emoji', () => {
  assertEquals(normalizeDiscoveryAlias('@alice'), '@alice')
  assertEquals(normalizeDiscoveryAlias('@alice🌟'), '@alice🌟')
  assertEquals(normalizeDiscoveryAlias('@曼努埃尔'), '@曼努埃尔')
  assertEquals(canonicalDiscoveryAliasKey('@Alice🌟'), '@alice🌟')
  assertEquals(parseDiscoveryAliasPrefix('@Al'), '@al')
  assertEquals(escapeIlikePattern('a%b_c\\d'), 'a\\%b\\_c\\\\d')
})
