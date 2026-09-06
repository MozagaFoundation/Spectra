/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { EncryptedMessage, PublicKeyBundle } from '@spectra/core-crypto'
import type {
  BLEOutboundDeliveryEvent,
  TransportDecision,
} from './types'

let bleInitialized = false
let bridgeCleanupRequired = false
let bridgeScopeKey: string | null = null
let bridgeTransition: Promise<void> = Promise.resolve()
const pendingRouteCapabilities: Array<{
  remoteIdentityId: string
  capability: string
}> = []
const MAX_PENDING_ROUTE_CAPABILITIES = 256

export type BLEBridgeConfig = {
  walletScope: string
  identityId: string
  identityPrivateKey: string
  displayName: string
  bundle: PublicKeyBundle | null
  knownIdentities: Array<{
    identityId: string
    displayName: string | null
    bundle: PublicKeyBundle
  }>
  sendControl: (remoteIdentityId: string, content: string) => Promise<boolean>
  decryptMessage: (conversationId: string, encryptedData: EncryptedMessage, senderIdentityId: string) => Promise<unknown>
  receiveBundle?: (fromIdentityId: string, bundle: PublicKeyBundle) => Promise<void>
  onDeliveryEvent?: (
    event: BLEOutboundDeliveryEvent,
  ) => Promise<void> | void
}

function enqueueBridgeTransition<T>(operation: () => Promise<T>): Promise<T> {
  const next = bridgeTransition.catch(() => {}).then(operation)
  bridgeTransition = next.then(() => undefined, () => undefined)
  return next
}

async function shutdownActiveBridge(): Promise<void> {
  if (!bleInitialized && !bridgeCleanupRequired) return
  const { shutdownBLEBridge } = await import('./chatIntegration')
  try {
    await shutdownBLEBridge()
    bridgeCleanupRequired = false
  } catch (error) {
    bridgeCleanupRequired = true
    throw error
  } finally {
    bleInitialized = false
  }
}

export function initBLEEventBridge(config: BLEBridgeConfig): Promise<void> {
  const nextScopeKey = `${config.walletScope}:${config.identityId}`

  return enqueueBridgeTransition(async () => {
    if (bleInitialized && bridgeScopeKey === nextScopeKey) return

    if (bridgeScopeKey && bridgeScopeKey !== nextScopeKey) {
      pendingRouteCapabilities.length = 0
    }
    try {
      await shutdownActiveBridge()
    } catch (error) {
      console.warn('[BLE] Event bridge reinitialization blocked by shutdown failure:', error)
      throw error
    }
    bridgeScopeKey = nextScopeKey

    try {
      const { initializeBLEBridge } = await import('./chatIntegration')
      const initialized = await initializeBLEBridge({
        walletScope: config.walletScope,
        identityId: config.identityId,
        identityPrivateKey: config.identityPrivateKey,
        displayName: config.displayName,
        bundle: config.bundle,
        knownIdentities: config.knownIdentities,
        sendControl: config.sendControl,
        onReceiveMessage: async (conversationId, encryptedData, senderIdentityId) => {
          const received = await config.decryptMessage(
            conversationId,
            encryptedData,
            senderIdentityId,
          )
          if (received == null) throw new Error('BLE message processing unavailable')
        },
        onReceiveBundle: config.receiveBundle,
        onDeliveryEvent: config.onDeliveryEvent,
      })
      if (!initialized) {
        bridgeScopeKey = null
        return
      }

      bleInitialized = true
      bridgeCleanupRequired = false
      const { acceptRouteCapability } = await import('./chatIntegration')
      const pending = pendingRouteCapabilities.splice(0)
      for (const item of pending) {
        await acceptRouteCapability(item.remoteIdentityId, item.capability)
      }
      console.log('[BLE] Event bridge initialized')
    } catch (e) {
      try {
        const { shutdownBLEBridge } = await import('./chatIntegration')
        await shutdownBLEBridge()
      } catch (shutdownError) {
        bleInitialized = false
        bridgeCleanupRequired = true
        console.warn('[BLE] Event bridge cleanup failed after initialization failure:', shutdownError)
        throw shutdownError
      }
      bleInitialized = false
      bridgeCleanupRequired = false
      bridgeScopeKey = null
      console.warn('[BLE] Event bridge initialization failed (non-fatal):', e)
    }
  })
}

export function shutdownBLEEventBridge(): Promise<void> {
  return enqueueBridgeTransition(async () => {
    pendingRouteCapabilities.length = 0
    await shutdownActiveBridge()
    bridgeScopeKey = null
  })
}

export async function handleBLERouteCapability(
  remoteIdentityId: string,
  capability: string,
): Promise<boolean> {
  return enqueueBridgeTransition(async () => {
    if (!bleInitialized) {
      if (pendingRouteCapabilities.length >= MAX_PENDING_ROUTE_CAPABILITIES) {
        pendingRouteCapabilities.shift()
      }
      pendingRouteCapabilities.push({ remoteIdentityId, capability })
      return true
    }
    const { acceptRouteCapability } = await import('./chatIntegration')
    return acceptRouteCapability(remoteIdentityId, capability)
  })
}

export async function trySendViaBLE(
  remoteIdentityId: string,
  encryptedData: EncryptedMessage,
  hooks?: { onBeforeBleSend?: () => void },
): Promise<{ success: boolean; stored?: boolean; error?: string }> {
  try {
    const bleBridge = await import('./chatIntegration')
    const route = bleBridge.getRoute(remoteIdentityId)
    if (!route.bleAvailable) {
      return { success: false, error: 'BLE not available' }
    }
    if (route.route !== 'ble') {
      return { success: false, error: 'BLE not available' }
    }
    hooks?.onBeforeBleSend?.()
    return await bleBridge.sendViaBLE(remoteIdentityId, encryptedData)
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

export async function getBLETransportRoute(remoteIdentityId: string): Promise<TransportDecision | null> {
  try {
    const bleBridge = await import('./chatIntegration')
    return bleBridge.getRoute(remoteIdentityId)
  } catch {
    return null
  }
}
