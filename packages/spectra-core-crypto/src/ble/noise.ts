/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { x25519 } from '@noble/curves/ed25519'
import {
  constantTimeEqual,
  stringToBytes,
} from '../crypto/utils'
import {
  BLE_NOISE_XX_PROTOCOL_NAME,
  BLE_V2_X25519_KEY_BYTES,
} from './constants'
import { assertByteLength } from './binary'
import { assertBleX25519Credential } from './credential'
import type { BleNoiseXXHandshakeMaterial } from './types'

const BLE_NOISE_XX_PROLOGUE = 'Spectra_BLE_Noise_XX_v2'

export function createBleNoiseXXPrologue(): Uint8Array {
  return stringToBytes(BLE_NOISE_XX_PROLOGUE)
}

export function assertBleNoiseXXHandshakeMaterial(
  material: BleNoiseXXHandshakeMaterial,
): void {
  if (!material
    || material.protocolName !== BLE_NOISE_XX_PROTOCOL_NAME
    || (material.role !== 'initiator' && material.role !== 'responder')) {
    throw new Error('BLE Noise XX handshake material is invalid')
  }
  if (material.localStaticKey.algorithm !== 'X25519') {
    throw new Error('BLE Noise XX static key algorithm is invalid')
  }
  assertByteLength(
    material.localStaticKey.publicKey,
    BLE_V2_X25519_KEY_BYTES,
    'BLE Noise XX public key',
  )
  assertByteLength(
    material.localStaticKey.privateKey,
    BLE_V2_X25519_KEY_BYTES,
    'BLE Noise XX private key',
  )
  if (!constantTimeEqual(
    x25519.getPublicKey(material.localStaticKey.privateKey),
    material.localStaticKey.publicKey,
  )) {
    throw new Error('BLE Noise XX static key pair does not match')
  }
  assertBleX25519Credential(material.localCredential)
  if (!constantTimeEqual(
    material.localCredential.publicKey,
    material.localStaticKey.publicKey,
  )) {
    throw new Error('BLE Noise XX credential does not bind the static key')
  }
  if (!constantTimeEqual(material.prologue, createBleNoiseXXPrologue())) {
    throw new Error('BLE Noise XX prologue is invalid')
  }
}
