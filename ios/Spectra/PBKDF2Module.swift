/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import Foundation
import CommonCrypto

@objc(PBKDF2Module)
class PBKDF2Module: NSObject {
  @objc
  func deriveKey(
    _ pin: String,
    salt: String,
    iterations: NSNumber,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.global(qos: .userInitiated).async {
      guard let saltData = Data(base64Encoded: salt) else {
        reject("ERR_SALT", "Invalid PBKDF2 salt", nil)
        return
      }

      let iterationCount = iterations.intValue
      guard iterationCount > 0 else {
        reject("ERR_ITERATIONS", "PBKDF2 iterations must be greater than zero", nil)
        return
      }

      guard let pinData = pin.data(using: .utf8), !pinData.isEmpty else {
        reject("ERR_PIN", "PIN must not be empty", nil)
        return
      }

      let derivedKeyLength = 32
      var derivedKey = Data(count: derivedKeyLength)
      let status = derivedKey.withUnsafeMutableBytes { derivedBytes in
        saltData.withUnsafeBytes { saltBytes in
          pinData.withUnsafeBytes { pinBytes in
            CCKeyDerivationPBKDF(
              CCPBKDFAlgorithm(kCCPBKDF2),
              pinBytes.bindMemory(to: Int8.self).baseAddress,
              pinData.count,
              saltBytes.bindMemory(to: UInt8.self).baseAddress,
              saltData.count,
              CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA256),
              UInt32(iterationCount),
              derivedBytes.bindMemory(to: UInt8.self).baseAddress,
              derivedKeyLength
            )
          }
        }
      }

      guard status == kCCSuccess else {
        reject("ERR_DERIVE", "PBKDF2 failed with status \(status)", nil)
        return
      }

      resolve(derivedKey.base64EncodedString())
    }
  }

  @objc
  static func requiresMainQueueSetup() -> Bool { false }
}
