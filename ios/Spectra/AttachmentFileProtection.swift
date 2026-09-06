/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import Foundation

@objc(AttachmentFileProtection)
final class AttachmentFileProtection: NSObject {
  @objc
  static func requiresMainQueueSetup() -> Bool {
    false
  }

  @objc(protectPath:withResolver:withRejecter:)
  func protectPath(
    _ path: String,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    do {
      let url: URL
      if let parsed = URL(string: path), parsed.isFileURL {
        url = parsed
      } else {
        url = URL(fileURLWithPath: path)
      }
      try FileManager.default.setAttributes(
        [.protectionKey: FileProtectionType.complete],
        ofItemAtPath: url.path
      )
      resolve(nil)
    } catch {
      reject("file_protection_failed", "Could not apply complete file protection", error)
    }
  }
}
