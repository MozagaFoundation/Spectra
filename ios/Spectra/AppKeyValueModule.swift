/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import Foundation
import MMKV

@objc(AppKeyValueModule)
class AppKeyValueModule: NSObject {
  private static let mmapId = "spectra-kv"
  private static let queue = DispatchQueue(label: "com.mozaga.exo.app-kv", qos: .userInitiated)
  private static var mmkv: MMKV?

  private static func store() throws -> MMKV {
    if let mmkv {
      return mmkv
    }
    guard let created = MMKV(mmapID: mmapId) else {
      throw NSError(domain: "AppKeyValueModule", code: 1, userInfo: [
        NSLocalizedDescriptionKey: "Failed to open MMKV",
      ])
    }
    mmkv = created
    return created
  }

  @objc
  static func requiresMainQueueSetup() -> Bool { false }

  @objc
  func getItem(
    _ key: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    Self.queue.async {
      do {
        resolve(try Self.store().string(forKey: key))
      } catch {
        reject("ERR_KV_GET", "KV get failed", error)
      }
    }
  }

  @objc
  func setItem(
    _ key: String,
    value: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    Self.queue.async {
      do {
        if try !Self.store().set(value, forKey: key) {
          reject("ERR_KV_SET", "KV set failed", nil)
          return
        }
        resolve(nil)
      } catch {
        reject("ERR_KV_SET", "KV set failed", error)
      }
    }
  }

  @objc
  func removeItem(
    _ key: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    Self.queue.async {
      do {
        try Self.store().removeValue(forKey: key)
        resolve(nil)
      } catch {
        reject("ERR_KV_REMOVE", "KV remove failed", error)
      }
    }
  }

  @objc
  func getAllKeys(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    Self.queue.async {
      do {
        resolve(try Self.store().allKeys())
      } catch {
        reject("ERR_KV_KEYS", "KV list failed", error)
      }
    }
  }

  @objc
  func multiGet(
    _ keys: [Any],
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    Self.queue.async {
      do {
        let store = try Self.store()
        let pairs: [[Any]] = keys.compactMap { item in
          guard let key = item as? String else { return nil }
          if let value = store.string(forKey: key) {
            return [key, value]
          }
          return [key, NSNull()]
        }
        resolve(pairs)
      } catch {
        reject("ERR_KV_MULTI_GET", "KV multiGet failed", error)
      }
    }
  }

  @objc
  func multiSet(
    _ entries: [Any],
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    Self.queue.async {
      do {
        let store = try Self.store()
        for entry in entries {
          guard
            let pair = entry as? [Any],
            pair.count >= 2,
            let key = pair[0] as? String,
            let value = pair[1] as? String
          else { continue }
          if !store.set(value, forKey: key) {
            reject("ERR_KV_MULTI_SET", "KV multiSet failed", nil)
            return
          }
        }
        resolve(nil)
      } catch {
        reject("ERR_KV_MULTI_SET", "KV multiSet failed", error)
      }
    }
  }

  @objc
  func multiRemove(
    _ keys: [Any],
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    Self.queue.async {
      do {
        let store = try Self.store()
        for item in keys {
          if let key = item as? String {
            store.removeValue(forKey: key)
          }
        }
        resolve(nil)
      } catch {
        reject("ERR_KV_MULTI_REMOVE", "KV multiRemove failed", error)
      }
    }
  }

  @objc
  func clear(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    Self.queue.async {
      do {
        try Self.store().clearAll()
        resolve(nil)
      } catch {
        reject("ERR_KV_CLEAR", "KV clear failed", error)
      }
    }
  }
}
