/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import Module from 'node:module'

type Listener = (...args: unknown[]) => void

class MockExpoEventEmitter {
  private readonly listeners = new Map<string, Set<Listener>>()

  addListener(eventName: string, listener: Listener) {
    const listeners = this.listeners.get(eventName) ?? new Set<Listener>()
    listeners.add(listener)
    this.listeners.set(eventName, listeners)
    return { remove: () => this.removeListener(eventName, listener) }
  }

  removeListener(eventName: string, listener: Listener) {
    this.listeners.get(eventName)?.delete(listener)
  }

  removeAllListeners(eventName?: string) {
    if (eventName) {
      this.listeners.delete(eventName)
    } else {
      this.listeners.clear()
    }
  }

  emit(eventName: string, ...args: unknown[]) {
    this.listeners.get(eventName)?.forEach((listener) => listener(...args))
  }

  listenerCount(eventName: string) {
    return this.listeners.get(eventName)?.size ?? 0
  }
}

class MockExpoNativeModule extends MockExpoEventEmitter {}
class MockExpoSharedObject extends MockExpoEventEmitter {
  release() {}
}
class MockExpoSharedRef extends MockExpoEventEmitter {
  nativeRefType = 'test'
  release() {}
}

const secureStoreValues = new Map<string, string>()
const secureStoreModule = {
  AFTER_FIRST_UNLOCK: 0,
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 1,
  ALWAYS: 2,
  WHEN_PASSCODE_SET_THIS_DEVICE_ONLY: 3,
  ALWAYS_THIS_DEVICE_ONLY: 4,
  WHEN_UNLOCKED: 5,
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
  canUseBiometricAuthentication: () => false,
  deleteValueWithKeyAsync: async (key: string) => {
    secureStoreValues.delete(key)
  },
  getValueWithKeyAsync: async (key: string) => secureStoreValues.get(key) ?? null,
  getValueWithKeySync: (key: string) => secureStoreValues.get(key) ?? null,
  setValueWithKeyAsync: async (value: string, key: string) => {
    secureStoreValues.set(key, value)
  },
  setValueWithKeySync: (value: string, key: string) => {
    secureStoreValues.set(key, value)
  },
}

const localAuthenticationModule = {
  authenticateAsync: async () => ({ success: false }),
  cancelAuthenticate: async () => undefined,
  getEnrolledLevelAsync: async () => 0,
  hasHardwareAsync: async () => false,
  isEnrolledAsync: async () => false,
  supportedAuthenticationTypesAsync: async () => [],
}

type TestGlobal = {
  __DEV__?: boolean
  __spectraImageAssetRequirePatched?: boolean
  expo?: {
    modules: Record<string, unknown>
    EventEmitter: unknown
    NativeModule: unknown
    SharedObject: unknown
    SharedRef: unknown
    getViewConfig: () => null
    reloadAppAsync: () => Promise<void>
  }
}

process.env.EXPO_OS ??= 'ios'

const testGlobal = globalThis as unknown as TestGlobal
testGlobal.__DEV__ = true
testGlobal.expo ??= {
  modules: {
    ExpoLocalAuthentication: localAuthenticationModule,
    ExpoSecureStore: secureStoreModule,
  },
  EventEmitter: MockExpoEventEmitter,
  NativeModule: MockExpoNativeModule,
  SharedObject: MockExpoSharedObject,
  SharedRef: MockExpoSharedRef,
  getViewConfig: () => null,
  reloadAppAsync: async () => undefined,
}
testGlobal.expo.modules.ExpoLocalAuthentication ??= localAuthenticationModule
testGlobal.expo.modules.ExpoSecureStore ??= secureStoreModule

if (!testGlobal.__spectraImageAssetRequirePatched) {
  testGlobal.__spectraImageAssetRequirePatched = true
  type ModuleLoad = (
    request: string,
    parent: NodeModule | null,
    isMain: boolean,
  ) => unknown
  const moduleInternals = Module as unknown as { _load: ModuleLoad }
  const originalLoad = moduleInternals._load
  moduleInternals._load = function patchedLoad(
    request: string,
    parent: NodeModule | null,
    isMain: boolean,
  ) {
    if (request.endsWith('.png') || request.endsWith('.jpg') || request.endsWith('.jpeg') || request.endsWith('.webp')) {
      return 'test-image-asset'
    }
    return originalLoad.apply(this, [request, parent, isMain])
  }
}
