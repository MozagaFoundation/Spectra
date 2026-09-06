import { assertEquals } from '../../tests/assert.ts'
import { collectExpoReceiptChecks, invalidTokensFromExpoReceipts } from './expoPushDelivery.ts'

Deno.test('receipt checks keep only accepted Expo ticket ids', () => {
  assertEquals(
    collectExpoReceiptChecks(
      [
        { status: 'ok', id: 'ticket-ok-1' },
        { status: 'error', id: 'ticket-dead', details: { error: 'DeviceNotRegistered' } },
        { status: 'ok' },
        { status: 'ok', id: 'short' },
      ],
      ['token-1', 'token-2', 'token-3', 'token-4'],
    ),
    [{ ticketId: 'ticket-ok-1', token: 'token-1' }],
  )
})

Deno.test('receipts drop only DeviceNotRegistered tokens', () => {
  assertEquals(
    invalidTokensFromExpoReceipts(
      {
        data: {
          'ticket-ok': { status: 'ok' },
          'ticket-dead': { status: 'error', details: { error: 'DeviceNotRegistered' } },
          'ticket-busy': { status: 'error', details: { error: 'MessageRateExceeded' } },
        },
      },
      new Map([
        ['ticket-ok', 'token-1'],
        ['ticket-dead', 'token-2'],
        ['ticket-busy', 'token-3'],
      ]),
    ),
    ['token-2'],
  )
})
