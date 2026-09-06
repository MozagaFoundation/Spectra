import { assert, assertEquals, assertMatch, assertRejects } from '../../tests/assert.ts'
import {
  buildRelayExpoPushPayload,
  classifyExpoPushTickets,
  mapConcurrent,
  relayPushDispatchKey,
  relayPushEventId,
} from './relayNotifications.ts'

Deno.test('relay push identifiers match the privacy protocol', async () => {
  const eventId = await relayPushEventId(
    `msg_${'a'.repeat(32)}`,
    `nsc1.${'b'.repeat(32)}`,
  )
  const dispatchKey = await relayPushDispatchKey(eventId, `nsc1.${'b'.repeat(32)}`)

  assertMatch(eventId, /^nev1\.[0-9a-f]{32}$/)
  assertMatch(dispatchKey, /^relay:[0-9a-f]{32}$/)
  assertEquals(
    eventId,
    await relayPushEventId(
      `msg_${'a'.repeat(32)}`,
      `nsc1.${'b'.repeat(32)}`,
    ),
  )
})

Deno.test('relay push identifiers reject unscoped registrations', async () => {
  await assertRejects(
    () => relayPushEventId(`msg_${'a'.repeat(32)}`, 'wallet-address'),
    /invalid relay push identifiers/,
  )
})

Deno.test('relay push tickets retry only transient or unknown failures', () => {
  assertEquals(
    classifyExpoPushTickets(
      [
        { status: 'ok', id: 'ticket-1' },
        { status: 'error', details: { error: 'DeviceNotRegistered' } },
        { status: 'error', details: { error: 'MessageRateExceeded' } },
      ],
      ['token-1', 'token-2', 'token-3'],
    ),
    {
      settledTokens: ['token-1', 'token-2'],
      invalidTokens: ['token-2'],
      retryableFailure: true,
    },
  )
})

Deno.test('relay push payloads localize generic copy and retain opaque routing data', () => {
  assertEquals(
    buildRelayExpoPushPayload(
      'ExpoPushToken[token]',
      `nsc1.${'a'.repeat(32)}`,
      `nev1.${'b'.repeat(32)}`,
      'es',
    ),
    {
      to: 'ExpoPushToken[token]',
      title: 'Spectra',
      body: 'Nuevo mensaje cifrado',
      sound: 'default',
      channelId: 'messages',
      priority: 'high',
      mutableContent: true,
      _mutableContent: true,
      contentAvailable: true,
      _contentAvailable: true,
      data: {
        notificationScopeId: `nsc1.${'a'.repeat(32)}`,
        notificationEventId: `nev1.${'b'.repeat(32)}`,
      },
    },
  )
  assertEquals(
    buildRelayExpoPushPayload(
      'ExpoPushToken[token]',
      `nsc1.${'a'.repeat(32)}`,
      `nev1.${'b'.repeat(32)}`,
      'es',
      'ios',
    ),
    {
      to: 'ExpoPushToken[token]',
      title: 'Spectra',
      body: 'Nuevo mensaje cifrado',
      sound: 'default',
      channelId: 'messages',
      priority: 'high',
      mutableContent: true,
      _mutableContent: true,
      data: {
        notificationScopeId: `nsc1.${'a'.repeat(32)}`,
        notificationEventId: `nev1.${'b'.repeat(32)}`,
      },
    },
  )
  assertEquals(
    buildRelayExpoPushPayload(
      'ExpoPushToken[token]',
      `nsc1.${'a'.repeat(32)}`,
      `nev1.${'b'.repeat(32)}`,
      'es',
      'android',
    ),
    {
      to: 'ExpoPushToken[token]',
      channelId: 'messages',
      priority: 'high',
      data: {
        notificationScopeId: `nsc1.${'a'.repeat(32)}`,
        notificationEventId: `nev1.${'b'.repeat(32)}`,
        title: 'Spectra',
        message: 'Nuevo mensaje cifrado',
      },
    },
  )
  assertEquals(
    buildRelayExpoPushPayload(
      'ExpoPushToken[token]',
      `nsc1.${'a'.repeat(32)}`,
      `nev1.${'b'.repeat(32)}`,
      undefined,
    ).body,
    'New encrypted message',
  )
})

Deno.test('relay concurrency waits for sibling work after a failure', async () => {
  let siblingFinished = false
  await assertRejects(() =>
    mapConcurrent([1, 2], 2, async (value) => {
      if (value === 1) throw new Error('transient failure')
      await new Promise((resolve) => setTimeout(resolve, 10))
      siblingFinished = true
      return value
    })
  )
  assert(siblingFinished)
})
