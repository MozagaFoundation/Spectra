/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

let chatServiceModulePromise: Promise<typeof import('@/services/chat')> | null = null
let backendAuthModulePromise: Promise<typeof import('@/services/backend/session')> | null = null
let quantumChatModulePromise: Promise<typeof import('@/services/quantumChat')> | null = null
let activeDiscoveryModulePromise: Promise<typeof import('@/services/chat/activeDiscoveryCoordinator')> | null = null

export function getChatServiceModule() {
  if (!chatServiceModulePromise) {
    chatServiceModulePromise = import('@/services/chat')
  }

  return chatServiceModulePromise
}

export function getBackendAuthModule() {
  if (!backendAuthModulePromise) {
    backendAuthModulePromise = import('@/services/backend/session')
  }

  return backendAuthModulePromise
}

export function getQuantumChatModule() {
  if (!quantumChatModulePromise) {
    quantumChatModulePromise = import('@/services/quantumChat')
  }

  return quantumChatModulePromise
}

export function getActiveDiscoveryModule() {
  if (!activeDiscoveryModulePromise) {
    activeDiscoveryModulePromise = import('@/services/chat/activeDiscoveryCoordinator')
  }

  return activeDiscoveryModulePromise
}

export function preloadChatRuntimeModules(): void {
  void getChatServiceModule()
  void getBackendAuthModule()
  void getQuantumChatModule()
}
