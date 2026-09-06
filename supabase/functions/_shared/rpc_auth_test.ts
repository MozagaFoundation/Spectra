import { assertEquals, assertThrows } from '../../tests/assert.ts'
import { rpcHeaders, upstreamRPCMethod } from './rpc_auth.ts'

Deno.test('RPC headers keep provider credentials server-side', () => {
  const originalMozaga = Deno.env.get('MOZAGA_RPC_BEARER_TOKEN')
  const originalBitcoinUsername = Deno.env.get('BITCOIN_RPC_USERNAME')
  const originalBitcoinPassword = Deno.env.get('BITCOIN_RPC_PASSWORD')
  const originalTron = Deno.env.get('TRON_RPC_API_KEY')
  try {
    Deno.env.set('MOZAGA_RPC_BEARER_TOKEN', 'm'.repeat(32))
    Deno.env.set('BITCOIN_RPC_USERNAME', 'spectra')
    Deno.env.set('BITCOIN_RPC_PASSWORD', 'b'.repeat(32))
    Deno.env.set('TRON_RPC_API_KEY', 't'.repeat(32))
    assertEquals(rpcHeaders('mozaga').authorization, `Bearer ${'m'.repeat(32)}`)
    assertEquals(rpcHeaders('bitcoin').authorization, `Basic ${btoa(`spectra:${'b'.repeat(32)}`)}`)
    assertEquals(rpcHeaders('tron')['tron-pro-api-key'], 't'.repeat(32))
    assertEquals(upstreamRPCMethod('mozaga', 'eth_getBalance'), 'chain_getBalance')
    assertEquals(upstreamRPCMethod('ethereum', 'eth_getBalance'), 'eth_getBalance')
    assertEquals(upstreamRPCMethod('mozaga', 'asset_balanceOf'), 'asset_balanceOf')

    Deno.env.set('MOZAGA_RPC_BEARER_TOKEN', `${'m'.repeat(32)}\ninvalid`)
    assertThrows(() => rpcHeaders('mozaga'), /invalid_configuration/)
    Deno.env.delete('BITCOIN_RPC_PASSWORD')
    assertThrows(() => rpcHeaders('bitcoin'), /invalid_configuration/)
  } finally {
    restoreEnv('MOZAGA_RPC_BEARER_TOKEN', originalMozaga)
    restoreEnv('BITCOIN_RPC_USERNAME', originalBitcoinUsername)
    restoreEnv('BITCOIN_RPC_PASSWORD', originalBitcoinPassword)
    restoreEnv('TRON_RPC_API_KEY', originalTron)
  }
})

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) Deno.env.delete(name)
  else Deno.env.set(name, value)
}
