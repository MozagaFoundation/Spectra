import { applyMethodOverride, HttpError, readJson } from './http.ts'

Deno.test('readJson enforces strict fields and byte limits', async () => {
  const parsed = await readJson(
    new Request('https://example.invalid', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"value":"ok"}',
    }),
    ['value'],
    32,
  )
  if (parsed.value !== 'ok') throw new Error('valid JSON was not decoded')

  await expectCode(
    readJson(
      new Request('https://example.invalid', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"value":"ok","unexpected":true}',
      }),
      ['value'],
      64,
    ),
    'invalid_json',
  )
  await expectCode(
    readJson(
      new Request('https://example.invalid', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"value":"this body is too large"}',
      }),
      ['value'],
      16,
    ),
    'request_too_large',
  )
})

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise
  } catch (error) {
    if (error instanceof HttpError && error.code === code) return
    throw error
  }
  throw new Error(`expected ${code}`)
}

Deno.test('POST may tunnel PATCH for Tor transports', async () => {
  const tunneled = applyMethodOverride(
    new Request('https://example.invalid/v1/chat/discovery/lease', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-http-method-override': 'PATCH',
      },
      body: '{"discoveryAlias":"@Peter"}',
    }),
  )
  if (tunneled.method !== 'PATCH') throw new Error('PATCH override was ignored')
  const body = await tunneled.json() as { discoveryAlias?: string }
  if (body.discoveryAlias !== '@Peter') throw new Error('PATCH override dropped the body')

  const blocked = applyMethodOverride(
    new Request('https://example.invalid/v1/chat/discovery/lease', {
      method: 'POST',
      headers: { 'x-http-method-override': 'DELETE' },
    }),
  )
  if (blocked.method !== 'POST') throw new Error('non-PATCH override must be ignored')
})
