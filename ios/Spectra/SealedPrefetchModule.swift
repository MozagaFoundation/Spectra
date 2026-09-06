/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import Foundation

@objc(SealedPrefetchModule)
class SealedPrefetchModule: NSObject {
  @objc
  static func requiresMainQueueSetup() -> Bool { false }

  @objc
  func writeSession(
    _ json: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    do {
      try SealedPrefetchStore.writeSessionJSON(json)
      resolve(nil)
    } catch {
      reject("ERR_PREFETCH_SESSION", "Failed to write prefetch session", error)
    }
  }

  @objc
  func clearSession(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    SealedPrefetchStore.clearSession()
    resolve(nil)
  }

  @objc
  func takeRows(
    _ walletAddress: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    resolve(SealedPrefetchStore.takeRowsJSON(walletAddress: walletAddress))
  }
}
