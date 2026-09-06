/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

/**
 * Storage Module Exports
 * 
 * Provides local storage with encryption at rest support.
 * 
 * For React Native:
 * 1. Create a storage adapter implementing the LocalStorage interface
 * 2. Call setStorageInstance(adapter) before using package features.
 */

export {
  localChatStorage,
  createLocalStorage,
  getLocalStorage,
  setStorageInstance,
  isStorageInitialized,
  initStorageEncryption,
  initStorageEncryptionFromPassword,
  disableStorageEncryption,
  isStorageEncryptionEnabled,
  parseRelayMailboxCursor,
  parseRelaySenderBundleAttachState,
} from './local'

export type { LocalStorage } from './local'
