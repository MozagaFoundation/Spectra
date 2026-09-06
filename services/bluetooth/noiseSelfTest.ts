/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { generateBleX25519StaticKeyMaterial } from '@spectra/core-crypto'
import { BleLinkManager } from './link/linkManager'

const SELF_TEST_FRAME_BYTES = 64
const SELF_TEST_CREDENTIAL_BYTES = 3_500

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length
    && left.every((byte, index) => byte === right[index])
}

export async function runBLENoiseSelfTest(): Promise<boolean> {
  const aliceKey = generateBleX25519StaticKeyMaterial()
  const bobKey = generateBleX25519StaticKeyMaterial()
  const aliceCredential = new Uint8Array(SELF_TEST_CREDENTIAL_BYTES).fill(0x41)
  const bobCredential = new Uint8Array(SELF_TEST_CREDENTIAL_BYTES).fill(0x42)
  const aliceToBob: Uint8Array[] = []
  const bobToAlice: Uint8Array[] = []
  const payload = new TextEncoder().encode('spectra-ble-noise-self-test')
  const managers: BleLinkManager[] = []
  let received: Uint8Array | null = null
  let alice: BleLinkManager | null = null
  let bob: BleLinkManager | null = null

  const run = async (): Promise<boolean> => {
    alice = new BleLinkManager({
      staticKeyPair: aliceKey,
      credential: aliceCredential,
      verifyCredential: async (_deviceId, credential) =>
        sameBytes(credential, bobCredential)
          ? { identityId: 'self-test-bob', knownContact: true }
          : null,
      sendRaw: async (_deviceId, frames) => {
        aliceToBob.push(...frames)
        return true
      },
      onSecureData: () => {},
      maxFrameBytes: () => SELF_TEST_FRAME_BYTES,
    })
    managers.push(alice)
    bob = new BleLinkManager({
      staticKeyPair: bobKey,
      credential: bobCredential,
      verifyCredential: async (_deviceId, credential) =>
        sameBytes(credential, aliceCredential)
          ? { identityId: 'self-test-alice', knownContact: true }
          : null,
      sendRaw: async (_deviceId, frames) => {
        bobToAlice.push(...frames)
        return true
      },
      onSecureData: (_deviceId, _identityId, data) => {
        received = data.slice()
      },
      maxFrameBytes: () => SELF_TEST_FRAME_BYTES,
    })
    managers.push(bob)

    if (!(await alice.start('self-test-bob'))) return false
    for (let round = 0; round < 20; round += 1) {
      while (aliceToBob.length > 0) {
        await bob.receive('self-test-alice', aliceToBob.shift()!)
      }
      while (bobToAlice.length > 0) {
        await alice.receive('self-test-bob', bobToAlice.shift()!)
      }
      if (
        alice.isAuthenticated('self-test-bob')
        && bob.isAuthenticated('self-test-alice')
        && aliceToBob.length === 0
        && bobToAlice.length === 0
      ) break
    }
    if (
      !alice.isAuthenticated('self-test-bob')
      || !bob.isAuthenticated('self-test-alice')
      || !(await alice.send('self-test-bob', payload))
    ) return false
    while (aliceToBob.length > 0) {
      await bob.receive('self-test-alice', aliceToBob.shift()!)
    }
    return received !== null && sameBytes(received, payload)
  }

  try {
    return await run()
  } catch {
    return false
  } finally {
    for (const manager of managers) manager.reset()
    aliceKey.privateKey.fill(0)
    bobKey.privateKey.fill(0)
    aliceCredential.fill(0)
    bobCredential.fill(0)
  }
}
