/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { requireNativeModule, type EventSubscription } from 'expo-modules-core'
import type { PeripheralEventPayload } from './ExpoBlePeripheral.types'

type ExpoBlePeripheralEvents = {
  onPeripheralEvent: (event: PeripheralEventPayload) => void
}

type ExpoBlePeripheralNativeModule = {
  startAdvertising(
    serviceUUID: string,
    writeCharUUID: string,
    notifyCharUUID: string,
    linkOfferBase64: string,
  ): Promise<boolean>
  stopAdvertising(): Promise<void>
  isAdvertising(): boolean
  sendNotification(data: string, centralId: string | null): Promise<boolean>
  cancelNotifications(centralId: string): Promise<number>
  addListener<EventName extends keyof ExpoBlePeripheralEvents>(
    eventName: EventName,
    listener: ExpoBlePeripheralEvents[EventName],
  ): EventSubscription
}

const nativeModule = requireNativeModule<ExpoBlePeripheralNativeModule>('ExpoBlePeripheral')

export function startAdvertising(
  serviceUUID: string,
  writeCharUUID: string,
  notifyCharUUID: string,
  linkOfferBase64 = '',
): Promise<boolean> {
  return nativeModule.startAdvertising(
    serviceUUID,
    writeCharUUID,
    notifyCharUUID,
    linkOfferBase64,
  )
}

export function stopAdvertising(): Promise<void> {
  return nativeModule.stopAdvertising()
}

export function isAdvertising(): boolean {
  return nativeModule.isAdvertising()
}

export function sendNotification(data: string, centralId?: string): Promise<boolean> {
  return nativeModule.sendNotification(data, centralId ?? null)
}

export function cancelNotifications(centralId: string): Promise<number> {
  return nativeModule.cancelNotifications(centralId)
}

export function addPeripheralListener(
  listener: (event: PeripheralEventPayload) => void,
): EventSubscription {
  return nativeModule.addListener('onPeripheralEvent', listener)
}
