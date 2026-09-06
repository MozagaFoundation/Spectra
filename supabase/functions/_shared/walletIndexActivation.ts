import { ed25519 } from '@noble/curves/ed25519'
import { secp256k1 } from '@noble/curves/secp256k1'
import { ripemd160 } from '@noble/hashes/ripemd160'
import { sha256 } from '@noble/hashes/sha256'
import { keccak_256 } from '@noble/hashes/sha3'
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import { bytesToHex, hexToBytes, HttpError, isRecord } from './http.ts'

const activationIdPattern = /^wia1\.[0-9a-f]{32}$/
const noncePattern = /^[0-9a-f]{64}$/
const walletPattern = /^EXO00[0-9a-f]{38}$/
const base58Alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const bech32Alphabet = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'
const encoder = new TextEncoder()

export type WalletIndexProofChain = 'mozaga' | 'ethereum' | 'bitcoin' | 'solana' | 'tron'

export interface WalletIndexAddressProof {
  algorithm: 'mldsa65' | 'secp256k1' | 'ed25519'
  publicKeyHex: string
  signatureHex: string
}

export interface WalletIndexActivationRequest {
  activationId: string
  ownerWalletAddress: string
  chain: WalletIndexProofChain
  address: string
  nonceHex: string
  expiresAt: number
}

function normalizeHex(value: unknown, minLength: number, maxLength: number): string {
  if (typeof value !== 'string') throw new HttpError(400, 'invalid_request')
  const normalized = value.trim().toLowerCase().replace(/^0x/, '')
  if (
    normalized.length < minLength ||
    normalized.length > maxLength ||
    normalized.length % 2 !== 0 ||
    !/^[0-9a-f]+$/.test(normalized)
  ) {
    throw new HttpError(400, 'invalid_request')
  }
  return normalized
}

function base58Encode(bytes: Uint8Array): string {
  let value = 0n
  for (const byte of bytes) value = (value << 8n) + BigInt(byte)

  let encoded = ''
  while (value > 0n) {
    const remainder = Number(value % 58n)
    encoded = base58Alphabet[remainder]! + encoded
    value /= 58n
  }
  for (const byte of bytes) {
    if (byte !== 0) break
    encoded = base58Alphabet[0]! + encoded
  }
  return encoded || base58Alphabet[0]!
}

function base58CheckEncode(payload: Uint8Array): string {
  const checksum = sha256(sha256(payload)).slice(0, 4)
  const combined = new Uint8Array(payload.length + checksum.length)
  combined.set(payload)
  combined.set(checksum, payload.length)
  return base58Encode(combined)
}

function bech32Polymod(values: number[]): number {
  const generators = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]
  let checksum = 1
  for (const value of values) {
    const top = checksum >> 25
    checksum = ((checksum & 0x1ffffff) << 5) ^ value
    for (let index = 0; index < generators.length; index += 1) {
      if ((top >> index) & 1) checksum ^= generators[index]!
    }
  }
  return checksum
}

function encodeSegwitAddress(witnessProgram: Uint8Array): string {
  const data = [0]
  let accumulator = 0
  let bits = 0
  for (const byte of witnessProgram) {
    accumulator = (accumulator << 8) | byte
    bits += 8
    while (bits >= 5) {
      bits -= 5
      data.push((accumulator >> bits) & 31)
    }
  }
  if (bits > 0) data.push((accumulator << (5 - bits)) & 31)

  const hrp = 'bc'
  const values = [
    ...Array.from(hrp).map((character) => character.charCodeAt(0) >> 5),
    0,
    ...Array.from(hrp).map((character) => character.charCodeAt(0) & 31),
    ...data,
    0,
    0,
    0,
    0,
    0,
    0,
  ]
  const polymod = bech32Polymod(values) ^ 1
  const checksum = Array.from({ length: 6 }, (_, index) => (polymod >> (5 * (5 - index))) & 31)
  return `${hrp}1${[...data, ...checksum].map((value) => bech32Alphabet[value]!).join('')}`
}

function signingMessage(request: WalletIndexActivationRequest): string {
  return [
    'spectra.wallet-index-activation.v1',
    'version=1',
    `activation_id=${request.activationId}`,
    `owner_wallet_address=${request.ownerWalletAddress}`,
    `chain=${request.chain}`,
    `address=${request.address}`,
    `nonce=${request.nonceHex}`,
    `expires_at=${request.expiresAt}`,
  ].join('\n')
}

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0)
    return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)
  })
}

function validateRequest(request: WalletIndexActivationRequest): void {
  if (
    !activationIdPattern.test(request.activationId) ||
    !walletPattern.test(request.ownerWalletAddress) ||
    !noncePattern.test(request.nonceHex) ||
    !['mozaga', 'ethereum', 'bitcoin', 'solana', 'tron'].includes(request.chain) ||
    !Number.isSafeInteger(request.expiresAt) ||
    request.expiresAt <= 0 ||
    request.address.length < 26 ||
    request.address.length > 96 ||
    hasControlCharacter(request.address)
  ) {
    throw new HttpError(400, 'invalid_request')
  }
}

export function parseWalletIndexAddressProof(value: unknown): WalletIndexAddressProof {
  if (!isRecord(value)) throw new HttpError(400, 'invalid_request')
  const keys = Object.keys(value).sort()
  if (keys.length !== 3 || keys.join(',') !== 'algorithm,publicKeyHex,signatureHex') {
    throw new HttpError(400, 'invalid_request')
  }
  const algorithm = value.algorithm
  if (algorithm !== 'mldsa65' && algorithm !== 'secp256k1' && algorithm !== 'ed25519') {
    throw new HttpError(400, 'invalid_request')
  }
  const publicKeyHex = normalizeHex(value.publicKeyHex, 64, 8_000)
  const signatureHex = normalizeHex(value.signatureHex, 128, 8_000)
  if (
    (algorithm === 'mldsa65' &&
      (publicKeyHex.length !== 3_904 || signatureHex.length !== 6_618)) ||
    (algorithm === 'secp256k1' &&
      (![66, 130].includes(publicKeyHex.length) || signatureHex.length !== 128)) ||
    (algorithm === 'ed25519' &&
      (publicKeyHex.length !== 64 || signatureHex.length !== 128))
  ) {
    throw new HttpError(400, 'invalid_request')
  }
  return { algorithm, publicKeyHex, signatureHex }
}

function derivedMozagaAddress(publicKey: Uint8Array): string {
  const digest = keccak_256(publicKey)
  return `EXO${bytesToHex(Uint8Array.from([0, ...digest.slice(-19)]))}`
}

function assertAddressForProof(
  request: WalletIndexActivationRequest,
  proof: WalletIndexAddressProof,
): Uint8Array {
  const publicKey = hexToBytes(proof.publicKeyHex)
  let expectedAddress: string
  switch (request.chain) {
    case 'mozaga':
      if (proof.algorithm !== 'mldsa65') throw new HttpError(400, 'invalid_address_proof')
      expectedAddress = derivedMozagaAddress(publicKey)
      if (expectedAddress !== request.ownerWalletAddress || expectedAddress !== request.address) {
        throw new HttpError(400, 'invalid_address_proof')
      }
      return publicKey
    case 'ethereum':
      if (proof.algorithm !== 'secp256k1' || publicKey.length !== 65 || publicKey[0] !== 4) {
        throw new HttpError(400, 'invalid_address_proof')
      }
      expectedAddress = `0x${bytesToHex(keccak_256(publicKey.slice(1)).slice(-20))}`
      if (expectedAddress !== request.address.toLowerCase()) {
        throw new HttpError(400, 'invalid_address_proof')
      }
      return publicKey
    case 'bitcoin':
      if (proof.algorithm !== 'secp256k1' || publicKey.length !== 33) {
        throw new HttpError(400, 'invalid_address_proof')
      }
      expectedAddress = encodeSegwitAddress(ripemd160(sha256(publicKey)))
      if (expectedAddress !== request.address.toLowerCase()) {
        throw new HttpError(400, 'invalid_address_proof')
      }
      return publicKey
    case 'solana':
      if (proof.algorithm !== 'ed25519' || publicKey.length !== 32) {
        throw new HttpError(400, 'invalid_address_proof')
      }
      expectedAddress = base58Encode(publicKey)
      if (expectedAddress !== request.address) throw new HttpError(400, 'invalid_address_proof')
      return publicKey
    case 'tron': {
      if (proof.algorithm !== 'secp256k1' || publicKey.length !== 65 || publicKey[0] !== 4) {
        throw new HttpError(400, 'invalid_address_proof')
      }
      const payload = new Uint8Array(21)
      payload[0] = 0x41
      payload.set(keccak_256(publicKey.slice(1)).slice(-20), 1)
      expectedAddress = base58CheckEncode(payload)
      if (expectedAddress !== request.address) throw new HttpError(400, 'invalid_address_proof')
      return publicKey
    }
  }
}

export function walletIndexActivationBindingHash(
  request: WalletIndexActivationRequest,
  proof: WalletIndexAddressProof,
): string {
  validateRequest(request)
  const binding = [
    'spectra.wallet-index-vdf-binding.v1',
    signingMessage(request),
    `algorithm=${proof.algorithm}`,
    `public_key=${proof.publicKeyHex}`,
    `signature=${proof.signatureHex}`,
  ].join('\n')
  return bytesToHex(sha256(encoder.encode(binding)))
}

export function verifyWalletIndexAddressProof(
  request: WalletIndexActivationRequest,
  proof: WalletIndexAddressProof,
): void {
  validateRequest(request)
  const publicKey = assertAddressForProof(request, proof)
  const signature = hexToBytes(proof.signatureHex)
  const message = encoder.encode(signingMessage(request))
  let verified = false
  if (proof.algorithm === 'mldsa65') {
    verified = ml_dsa65.verify(
      signature,
      encoder.encode(`spectra.wallet-index-activation.v1\u0000${signingMessage(request)}`),
      publicKey,
    )
  } else if (proof.algorithm === 'ed25519') {
    verified = ed25519.verify(signature, message, publicKey)
  } else {
    const parsedSignature = secp256k1.Signature.fromCompact(signature)
    if (parsedSignature.hasHighS()) throw new HttpError(400, 'invalid_address_proof')
    verified = secp256k1.verify(parsedSignature, sha256(message), publicKey, { lowS: false })
  }
  if (!verified) throw new HttpError(400, 'invalid_address_proof')
}
