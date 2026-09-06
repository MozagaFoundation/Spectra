import { ed25519 } from '@noble/curves/ed25519'
import { assert, assertEquals, assertRejects, assertThrows } from '../../tests/assert.ts'
import { contributionRecipients, rpcProxy } from './external.ts'

const payload = JSON.stringify({
  version: 1,
  issuedAt: '2026-07-28T00:00:00Z',
  recipients: {
    mozaga: { address: 'EXO001f0b8f96b8e4eb0353ad7bca990db9a9c4d595' },
    ethereum: { address: '0x48163bE0B78AE2136769A5fc9D74633A235Dc3c5' },
    bitcoin: { address: 'bc1qqc2gweah9evm47wwjlrfh67rl4n8yw2vdl464t' },
    solana: { address: '9TB7AebYvqg2VbK5SRkeeVbgu4bBpu6RYVGHwFar5kDK' },
    tron: { address: 'TFbU9ScJqLYYCKCEVyjTkwHc81m46Sh2Rx' },
  },
})

Deno.test('contribution recipients are signed by the backend-held key', () => {
  const names = [
    'SPECTRA_CONTRIBUTION_RECIPIENTS_KEY_ID',
    'SPECTRA_CONTRIBUTION_RECIPIENTS_PAYLOAD_JSON',
    'SPECTRA_CONTRIBUTION_RECIPIENTS_SIGNING_PRIVATE_KEY_BASE64',
  ]
  const original = new Map(names.map((name) => [name, Deno.env.get(name)]))
  const privateKey = Uint8Array.from({ length: 32 }, (_, index) => index + 1)
  try {
    Deno.env.set('SPECTRA_CONTRIBUTION_RECIPIENTS_KEY_ID', 'contrib-test')
    Deno.env.set('SPECTRA_CONTRIBUTION_RECIPIENTS_PAYLOAD_JSON', payload)
    Deno.env.set(
      'SPECTRA_CONTRIBUTION_RECIPIENTS_SIGNING_PRIVATE_KEY_BASE64',
      base64Bytes(privateKey),
    )

    const response = contributionRecipients() as {
      keyId: string
      payloadBase64: string
      signature: string
    }

    assertEquals(response.keyId, 'contrib-test')
    assertEquals(response.payloadBase64, base64Bytes(new TextEncoder().encode(payload)))
    assert(
      ed25519.verify(
        decodeBase64(response.signature),
        decodeBase64(response.payloadBase64),
        ed25519.getPublicKey(privateKey),
      ),
    )
    assert(!JSON.stringify(response).includes(base64Bytes(privateKey)))
  } finally {
    for (const name of names) restoreEnv(name, original.get(name))
  }
})

Deno.test('contribution recipients fail closed without a signing key', () => {
  const original = Deno.env.get('SPECTRA_CONTRIBUTION_RECIPIENTS_SIGNING_PRIVATE_KEY_BASE64')
  try {
    Deno.env.delete('SPECTRA_CONTRIBUTION_RECIPIENTS_SIGNING_PRIVATE_KEY_BASE64')
    assertThrows(
      () => contributionRecipients(),
      /contribution_recipients_not_configured/,
    )
  } finally {
    restoreEnv('SPECTRA_CONTRIBUTION_RECIPIENTS_SIGNING_PRIVATE_KEY_BASE64', original)
  }
})

Deno.test('rpc proxy reports an upstream HTTP rejection without exposing its body', async () => {
  const names = ['ETH_RPC_URL', 'SPECTRA_RPC_PROXY_TRUSTED_RPC']
  const original = new Map(names.map((name) => [name, Deno.env.get(name)]))
  const originalFetch = globalThis.fetch
  try {
    Deno.env.set('ETH_RPC_URL', 'https://rpc.example.test')
    Deno.env.set('SPECTRA_RPC_PROXY_TRUSTED_RPC', 'true')
    globalThis.fetch = () => Promise.resolve(new Response('provider detail', { status: 403 }))

    const error = await assertRejects(
      () => rpcProxy({ chain: 'ethereum', method: 'eth_sendRawTransaction', params: ['0x01'] }),
      /rpc_upstream_unauthorized/,
    )

    assertEquals(error.message, 'rpc_upstream_unauthorized')
  } finally {
    globalThis.fetch = originalFetch
    for (const name of names) restoreEnv(name, original.get(name))
  }
})

Deno.test('Tron RPC proxy normalizes a configured API path', async () => {
  const names = ['TRON_RPC_URL', 'SPECTRA_RPC_PROXY_TRUSTED_RPC']
  const original = new Map(names.map((name) => [name, Deno.env.get(name)]))
  const originalFetch = globalThis.fetch
  try {
    Deno.env.set('TRON_RPC_URL', 'https://tron.example.test/wallet/')
    Deno.env.set('SPECTRA_RPC_PROXY_TRUSTED_RPC', 'true')
    globalThis.fetch = (input) => {
      assertEquals(new URL(input.toString()).pathname, '/wallet/getaccount')
      return Promise.resolve(new Response(JSON.stringify({ balance: 8_000_000 }), { status: 200 }))
    }

    const response = await rpcProxy({
      chain: 'tron',
      path: '/wallet/getaccount',
      body: { address: '41'.padEnd(42, '0'), visible: false },
    })

    assertEquals(response, { balance: 8_000_000 })
  } finally {
    globalThis.fetch = originalFetch
    for (const name of names) restoreEnv(name, original.get(name))
  }
})

function base64Bytes(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function decodeBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0))
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) Deno.env.delete(name)
  else Deno.env.set(name, value)
}
