import { optionalEnv } from './config.ts'
import { HttpError } from './http.ts'

const mozagaMethods: Record<string, string> = {
  eth_getBalance: 'chain_getBalance',
  eth_getTransactionCount: 'chain_getTransactionCount',
  eth_blockNumber: 'chain_blockNumber',
  eth_chainId: 'chain_id',
  eth_sendRawTransaction: 'chain_sendRawTransaction',
  eth_getTransactionReceipt: 'chain_getTransactionReceipt',
  eth_getBlockByNumber: 'chain_getBlockByNumber',
}

export function rpcHeaders(chain: string): Record<string, string> {
  const headers: Record<string, string> = {
    accept: 'application/json',
    'content-type': 'application/json',
  }
  if (chain === 'mozaga') {
    const token = optionalEnv('MOZAGA_RPC_BEARER_TOKEN')
    if (token) headers.authorization = `Bearer ${validHeaderSecret(token)}`
  }
  if (chain === 'bitcoin') {
    const username = optionalEnv('BITCOIN_RPC_USERNAME')
    const password = optionalEnv('BITCOIN_RPC_PASSWORD')
    if (Boolean(username) !== Boolean(password)) {
      throw new HttpError(503, 'invalid_configuration')
    }
    if (username && password) {
      headers.authorization = `Basic ${
        btoa(
          `${validBasicUsername(username)}:${validBasicPassword(password)}`,
        )
      }`
    }
  }
  if (chain === 'tron') {
    const apiKey = optionalEnv('TRON_RPC_API_KEY')
    if (apiKey) headers['tron-pro-api-key'] = validHeaderSecret(apiKey)
  }
  return headers
}

export function upstreamRPCMethod(chain: string, method: string): string {
  return chain === 'mozaga' ? mozagaMethods[method] ?? method : method
}

function validHeaderSecret(value: string): string {
  if (
    value.length < 16 ||
    value.length > 512 ||
    [...value].some((character) => {
      const codePoint = character.codePointAt(0)!
      return codePoint < 0x21 || codePoint > 0x7e
    })
  ) throw new HttpError(503, 'invalid_configuration')
  return value
}

function validBasicUsername(value: string): string {
  if (value.includes(':')) throw new HttpError(503, 'invalid_configuration')
  return validBasicCredential(value, 128)
}

function validBasicPassword(value: string): string {
  return validBasicCredential(value, 512)
}

function validBasicCredential(value: string, maxLength: number): string {
  if (
    value.length < 1 ||
    value.length > maxLength ||
    [...value].some((character) => {
      const codePoint = character.codePointAt(0)!
      return codePoint < 0x21 || codePoint > 0x7e
    })
  ) throw new HttpError(503, 'invalid_configuration')
  return value
}
