import { assert, assertEquals } from '../../tests/assert.ts'
import {
  INVALID_SUBSCRIBER_ID_CLOSE_REASON,
  isValidRealtimeSubscriberId,
  REALTIME_SUBSCRIBER_ID_MAX_LENGTH,
} from './realtime_subscriber_id.ts'

Deno.test('realtime subscriber IDs accept the bounded server-safe contract', () => {
  assert(isValidRealtimeSubscriberId('chat-primary-mk1-1-0000001'))
  assert(isValidRealtimeSubscriberId('x'.repeat(REALTIME_SUBSCRIBER_ID_MAX_LENGTH)))
  assertEquals(INVALID_SUBSCRIBER_ID_CLOSE_REASON, 'invalid subscriber id')
})

Deno.test('realtime subscriber IDs reject delimiters and invalid bounds', () => {
  const invalidValues: unknown[] = [
    '',
    'chat:primary',
    'chat primary',
    'chat\tprimary',
    'chat\0primary',
    'x'.repeat(REALTIME_SUBSCRIBER_ID_MAX_LENGTH + 1),
    null,
    42,
  ]

  for (const value of invalidValues) {
    assert(!isValidRealtimeSubscriberId(value), `unexpected valid subscriber ID: ${String(value)}`)
  }
})
