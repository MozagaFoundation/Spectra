/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import CryptoKit
import Foundation

@objc(MediaCryptoModule)
class MediaCryptoModule: NSObject {
  private static let keyLength = 32
  private static let nonceLength = 12
  private static let tagLength = 16
  private static let maxFileBytes = 50 * 1024 * 1024
  private static let safetyNumberIterations = 5200
  private static let queue = DispatchQueue(label: "com.mozaga.exo.media-crypto", qos: .userInitiated)
  private static let lock = NSLock()
  private static var cancelledJobIds = Set<String>()
  private static var cancelAllGeneration = 0

  @objc
  static func requiresMainQueueSetup() -> Bool { false }

  @objc
  func sha256(
    _ data: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    Self.queue.async {
      guard let bytes = Data(base64Encoded: data) else {
        reject("ERR_HASH", "Invalid SHA-256 input", nil)
        return
      }
      let digest = SHA256.hash(data: bytes)
      resolve(digest.map { String(format: "%02x", $0) }.joined())
    }
  }

  @objc
  func encryptAesGcm(
    _ key: String,
    plaintext: String,
    associatedData: String?,
    jobId: String?,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let generation = Self.currentGeneration()
    Self.queue.async {
      var keyBytes = Data()
      defer { Self.zero(&keyBytes) }
      do {
        try Self.throwIfCancelled(jobId, generation: generation)
        guard let decodedKey = Data(base64Encoded: key), decodedKey.count == Self.keyLength else {
          reject("ERR_KEY", "AES key must be 32 bytes", nil)
          return
        }
        keyBytes = decodedKey
        guard let plaintextBytes = Data(base64Encoded: plaintext) else {
          reject("ERR_ENCRYPT", "Invalid plaintext", nil)
          return
        }
        let aad = associatedData.flatMap { Data(base64Encoded: $0) } ?? Data()
        let nonce = AES.GCM.Nonce()
        let sealed = try AES.GCM.seal(
          plaintextBytes,
          using: SymmetricKey(data: keyBytes),
          nonce: nonce,
          authenticating: aad
        )
        try Self.throwIfCancelled(jobId, generation: generation)
        resolve([
          "ciphertext": sealed.ciphertext.base64EncodedString(),
          "nonce": Data(nonce).base64EncodedString(),
          "tag": sealed.tag.base64EncodedString(),
        ])
      } catch let error as NSError where error.domain == "ERR_CANCELLED" {
        reject("ERR_CANCELLED", "AES-GCM job cancelled", error)
      } catch {
        reject("ERR_ENCRYPT", "AES-GCM encryption failed", error)
      }
    }
  }

  @objc
  func decryptAesGcm(
    _ key: String,
    ciphertext: String,
    nonce: String,
    tag: String,
    associatedData: String?,
    jobId: String?,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let generation = Self.currentGeneration()
    Self.queue.async {
      var keyBytes = Data()
      defer { Self.zero(&keyBytes) }
      do {
        try Self.throwIfCancelled(jobId, generation: generation)
        guard let decodedKey = Data(base64Encoded: key), decodedKey.count == Self.keyLength else {
          reject("ERR_KEY", "AES key must be 32 bytes", nil)
          return
        }
        keyBytes = decodedKey
        guard
          let ciphertextBytes = Data(base64Encoded: ciphertext),
          let nonceBytes = Data(base64Encoded: nonce),
          nonceBytes.count == Self.nonceLength,
          let tagBytes = Data(base64Encoded: tag),
          tagBytes.count == Self.tagLength
        else {
          reject("ERR_DECRYPT", "Invalid AES-GCM payload", nil)
          return
        }
        let aad = associatedData.flatMap { Data(base64Encoded: $0) } ?? Data()
        let box = try AES.GCM.SealedBox(
          nonce: AES.GCM.Nonce(data: nonceBytes),
          ciphertext: ciphertextBytes,
          tag: tagBytes
        )
        let plaintext = try AES.GCM.open(
          box,
          using: SymmetricKey(data: keyBytes),
          authenticating: aad
        )
        try Self.throwIfCancelled(jobId, generation: generation)
        resolve(plaintext.base64EncodedString())
      } catch let error as NSError where error.domain == "ERR_CANCELLED" {
        reject("ERR_CANCELLED", "AES-GCM job cancelled", error)
      } catch {
        reject("ERR_DECRYPT", "AES-GCM decryption failed", error)
      }
    }
  }

  @objc
  func sha256File(
    _ path: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    Self.queue.async {
      do {
        let url = try Self.sandboxedFile(path)
        let size = try Self.fileSize(url)
        try Self.throwIfTooLarge(size)
        var hasher = SHA256()
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        while let chunk = try handle.read(upToCount: 1_048_576), !chunk.isEmpty {
          hasher.update(data: chunk)
        }
        let digest = hasher.finalize()
        resolve(digest.map { String(format: "%02x", $0) }.joined())
      } catch {
        reject("ERR_HASH", "SHA-256 file hash failed", error)
      }
    }
  }

  @objc
  func encryptAesGcmFile(
    _ key: String,
    plaintextPath: String,
    destCiphertextPath: String,
    associatedData: String?,
    jobId: String?,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let generation = Self.currentGeneration()
    Self.queue.async {
      var keyBytes = Data()
      defer { Self.zero(&keyBytes) }
      do {
        try Self.throwIfCancelled(jobId, generation: generation)
        guard let decodedKey = Data(base64Encoded: key), decodedKey.count == Self.keyLength else {
          reject("ERR_KEY", "AES key must be 32 bytes", nil)
          return
        }
        keyBytes = decodedKey
        let source = try Self.sandboxedFile(plaintextPath)
        let dest = try Self.sandboxedFile(destCiphertextPath)
        try Self.throwIfTooLarge(try Self.fileSize(source))
        let plaintext = try Data(contentsOf: source)
        let aad = associatedData.flatMap { Data(base64Encoded: $0) } ?? Data()
        let nonce = AES.GCM.Nonce()
        let sealed = try AES.GCM.seal(
          plaintext,
          using: SymmetricKey(data: keyBytes),
          nonce: nonce,
          authenticating: aad
        )
        try Self.throwIfCancelled(jobId, generation: generation)
        try sealed.ciphertext.write(to: dest, options: .atomic)
        resolve([
          "nonce": Data(nonce).base64EncodedString(),
          "tag": sealed.tag.base64EncodedString(),
          "ciphertextBytes": sealed.ciphertext.count,
        ])
      } catch let error as NSError where error.domain == "ERR_CANCELLED" {
        reject("ERR_CANCELLED", "AES-GCM job cancelled", error)
      } catch {
        reject("ERR_ENCRYPT", "AES-GCM file encryption failed", error)
      }
    }
  }

  @objc
  func decryptAesGcmFile(
    _ key: String,
    ciphertextPath: String,
    destPlaintextPath: String,
    nonce: String,
    tag: String,
    associatedData: String?,
    jobId: String?,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let generation = Self.currentGeneration()
    Self.queue.async {
      var keyBytes = Data()
      defer { Self.zero(&keyBytes) }
      do {
        try Self.throwIfCancelled(jobId, generation: generation)
        guard let decodedKey = Data(base64Encoded: key), decodedKey.count == Self.keyLength else {
          reject("ERR_KEY", "AES key must be 32 bytes", nil)
          return
        }
        keyBytes = decodedKey
        let source = try Self.sandboxedFile(ciphertextPath)
        let dest = try Self.sandboxedFile(destPlaintextPath)
        try Self.throwIfTooLarge(try Self.fileSize(source) + Self.tagLength)
        let ciphertext = try Data(contentsOf: source)
        guard
          let nonceBytes = Data(base64Encoded: nonce),
          nonceBytes.count == Self.nonceLength,
          let tagBytes = Data(base64Encoded: tag),
          tagBytes.count == Self.tagLength
        else {
          reject("ERR_DECRYPT", "Invalid AES-GCM payload", nil)
          return
        }
        let aad = associatedData.flatMap { Data(base64Encoded: $0) } ?? Data()
        let box = try AES.GCM.SealedBox(
          nonce: AES.GCM.Nonce(data: nonceBytes),
          ciphertext: ciphertext,
          tag: tagBytes
        )
        let plaintext = try AES.GCM.open(
          box,
          using: SymmetricKey(data: keyBytes),
          authenticating: aad
        )
        try Self.throwIfCancelled(jobId, generation: generation)
        try plaintext.write(to: dest, options: .atomic)
        resolve(dest.path)
      } catch let error as NSError where error.domain == "ERR_CANCELLED" {
        reject("ERR_CANCELLED", "AES-GCM job cancelled", error)
      } catch {
        reject("ERR_DECRYPT", "AES-GCM file decryption failed", error)
      }
    }
  }

  @objc
  func writeMediaBlob(
    _ headerJson: String,
    ciphertextPath: String,
    nonce: String,
    tag: String,
    destPath: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    Self.queue.async {
      do {
        let source = try Self.sandboxedFile(ciphertextPath)
        let dest = try Self.sandboxedFile(destPath)
        try Self.throwIfTooLarge(try Self.fileSize(source))
        let ciphertext = try Data(contentsOf: source)
        let ciphertextB64 = ciphertext.base64EncodedString()
        var content = Data()
        content.append(contentsOf: [UInt8]("{\"ciphertext\":\"".utf8))
        content.append(contentsOf: [UInt8](ciphertextB64.utf8))
        content.append(contentsOf: [UInt8]("\",\"nonce\":\"\(nonce)\",\"tag\":\"\(tag)\"}".utf8))
        let header = Data(headerJson.utf8)
        if header.isEmpty || header.count > 64 * 1024 {
          reject("ERR_BLOB", "Invalid media blob header", nil)
          return
        }
        var length = UInt32(header.count).littleEndian
        var blob = Data()
        blob.append(Data(bytes: &length, count: 4))
        blob.append(header)
        blob.append(content)
        try blob.write(to: dest, options: .atomic)
        resolve(["bytes": blob.count])
      } catch {
        reject("ERR_BLOB", "Media blob write failed", error)
      }
    }
  }

  @objc
  func decryptMediaBlobFile(
    _ key: String,
    blobPath: String,
    destPlaintextPath: String,
    associatedData: String?,
    jobId: String?,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let generation = Self.currentGeneration()
    Self.queue.async {
      var keyBytes = Data()
      defer { Self.zero(&keyBytes) }
      do {
        try Self.throwIfCancelled(jobId, generation: generation)
        guard let decodedKey = Data(base64Encoded: key), decodedKey.count == Self.keyLength else {
          reject("ERR_KEY", "AES key must be 32 bytes", nil)
          return
        }
        keyBytes = decodedKey
        let source = try Self.sandboxedFile(blobPath)
        let dest = try Self.sandboxedFile(destPlaintextPath)
        try Self.throwIfTooLarge(try Self.fileSize(source))
        let blob = try Data(contentsOf: source)
        let parsed = try Self.parseMediaBlob(blob)
        let aad = associatedData.flatMap { Data(base64Encoded: $0) } ?? Data()
        let plaintext: Data
        if parsed.isChunked {
          plaintext = try Self.decryptChunks(
            keyBytes: keyBytes,
            chunks: parsed.chunks,
            associatedData: aad
          )
        } else {
          plaintext = try Self.openAes(
            keyBytes: keyBytes,
            ciphertext: parsed.ciphertext,
            nonce: parsed.nonce,
            tag: parsed.tag,
            associatedData: aad
          )
        }
        try Self.throwIfCancelled(jobId, generation: generation)
        try plaintext.write(to: dest, options: .atomic)
        resolve(["headerJson": parsed.headerJson, "plaintextBytes": plaintext.count])
      } catch let error as NSError where error.domain == "ERR_CANCELLED" {
        reject("ERR_CANCELLED", "AES-GCM job cancelled", error)
      } catch {
        reject("ERR_DECRYPT", "Media blob decryption failed", error)
      }
    }
  }

  @objc
  func deriveSafetyNumberFingerprint(
    _ keyMaterial: String,
    identityId: String,
    version: Int,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    Self.queue.async {
      guard version >= 0, version <= 255, let material = Data(base64Encoded: keyMaterial) else {
        reject("ERR_HASH", "Invalid safety-number material", nil)
        return
      }
      let identityBytes = Data(identityId.utf8)
      var hash = Data([UInt8(version & 0xff)])
      hash.append(material)
      hash.append(identityBytes)
      for _ in 0..<Self.safetyNumberIterations {
        var input = hash
        input.append(material)
        hash = Data(SHA256.hash(data: input))
      }
      resolve(hash.map { String(format: "%02x", $0) }.joined())
    }
  }

  @objc
  func cancel(_ jobId: String) {
    Self.lock.lock()
    Self.cancelledJobIds.insert(jobId)
    Self.lock.unlock()
  }

  @objc
  func cancelAll() {
    Self.lock.lock()
    Self.cancelAllGeneration += 1
    Self.cancelledJobIds.removeAll()
    Self.lock.unlock()
  }

  private static func currentGeneration() -> Int {
    lock.lock()
    defer { lock.unlock() }
    return cancelAllGeneration
  }

  private static func throwIfCancelled(_ jobId: String?, generation: Int) throws {
    lock.lock()
    let cancelled = generation != cancelAllGeneration
      || (!(jobId ?? "").isEmpty && cancelledJobIds.contains(jobId ?? ""))
    lock.unlock()
    if cancelled {
      throw NSError(domain: "ERR_CANCELLED", code: 0)
    }
  }

  private static func zero(_ data: inout Data) {
    if data.isEmpty { return }
    data.resetBytes(in: 0..<data.count)
  }

  private static func sandboxedFile(_ path: String) throws -> URL {
    let stripped: String
    if path.hasPrefix("file://"), let url = URL(string: path) {
      stripped = url.path
    } else {
      stripped = path
    }
    let url = URL(fileURLWithPath: stripped).standardizedFileURL
    let roots = [
      FileManager.default.temporaryDirectory.standardizedFileURL,
      FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first?.standardizedFileURL,
      FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first?.standardizedFileURL,
      FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?.standardizedFileURL,
    ].compactMap { $0 }
    let filePath = url.path
    guard roots.contains(where: { filePath == $0.path || filePath.hasPrefix($0.path + "/") }) else {
      throw NSError(domain: "ERR_PATH", code: 0, userInfo: [NSLocalizedDescriptionKey: "Path is outside the app sandbox"])
    }
    return url
  }

  private static func fileSize(_ url: URL) throws -> Int {
    let values = try url.resourceValues(forKeys: [.fileSizeKey])
    return values.fileSize ?? 0
  }

  private static func throwIfTooLarge(_ size: Int) throws {
    if size < 0 || size > maxFileBytes {
      throw NSError(domain: "ERR_SIZE", code: 0, userInfo: [NSLocalizedDescriptionKey: "Media exceeds 50 MiB"])
    }
  }

  private struct ParsedMediaBlob {
    let headerJson: String
    let isChunked: Bool
    let ciphertext: Data
    let nonce: Data
    let tag: Data
    let chunks: [[String: Any]]
  }

  private static func parseMediaBlob(_ blob: Data) throws -> ParsedMediaBlob {
    if blob.count < 4 {
      throw NSError(domain: "ERR_BLOB", code: 0)
    }
    let headerLength = blob.prefix(4).withUnsafeBytes { ptr in
      ptr.load(as: UInt32.self).littleEndian
    }
    if headerLength == 0 || headerLength > 64 * 1024 || 4 + Int(headerLength) > blob.count {
      throw NSError(domain: "ERR_BLOB", code: 0)
    }
    let header = blob.subdata(in: 4..<(4 + Int(headerLength)))
    let content = blob.subdata(in: (4 + Int(headerLength))..<blob.count)
    guard !content.isEmpty,
          let headerJson = String(data: header, encoding: .utf8),
          let headerObj = try JSONSerialization.jsonObject(with: header) as? [String: Any]
    else {
      throw NSError(domain: "ERR_BLOB", code: 0)
    }
    let contentObj = try JSONSerialization.jsonObject(with: content)
    let isChunked = headerObj["isChunked"] as? Bool ?? false
    if isChunked {
      guard let chunks = contentObj as? [[String: Any]] else {
        throw NSError(domain: "ERR_BLOB", code: 0)
      }
      return ParsedMediaBlob(
        headerJson: headerJson,
        isChunked: true,
        ciphertext: Data(),
        nonce: Data(),
        tag: Data(),
        chunks: chunks
      )
    }
    guard
      let payload = contentObj as? [String: Any],
      let ciphertextB64 = payload["ciphertext"] as? String,
      let nonceB64 = payload["nonce"] as? String,
      let tagB64 = payload["tag"] as? String,
      let ciphertext = Data(base64Encoded: ciphertextB64),
      let nonce = Data(base64Encoded: nonceB64),
      let tag = Data(base64Encoded: tagB64)
    else {
      throw NSError(domain: "ERR_BLOB", code: 0)
    }
    return ParsedMediaBlob(
      headerJson: headerJson,
      isChunked: false,
      ciphertext: ciphertext,
      nonce: nonce,
      tag: tag,
      chunks: []
    )
  }

  private static func openAes(
    keyBytes: Data,
    ciphertext: Data,
    nonce: Data,
    tag: Data,
    associatedData: Data
  ) throws -> Data {
    let box = try AES.GCM.SealedBox(
      nonce: AES.GCM.Nonce(data: nonce),
      ciphertext: ciphertext,
      tag: tag
    )
    return try AES.GCM.open(
      box,
      using: SymmetricKey(data: keyBytes),
      authenticating: associatedData
    )
  }

  private static func decryptChunks(
    keyBytes: Data,
    chunks: [[String: Any]],
    associatedData: Data
  ) throws -> Data {
    let sorted = chunks.sorted { lhs, rhs in
      (lhs["index"] as? Int ?? 0) < (rhs["index"] as? Int ?? 0)
    }
    var plaintext = Data()
    for (expected, chunk) in sorted.enumerated() {
      guard
        (chunk["index"] as? Int) == expected,
        let originalSize = chunk["originalSize"] as? Int,
        let ciphertextB64 = chunk["ciphertext"] as? String,
        let nonceB64 = chunk["nonce"] as? String,
        let tagB64 = chunk["tag"] as? String,
        let ciphertext = Data(base64Encoded: ciphertextB64),
        let nonce = Data(base64Encoded: nonceB64),
        let tag = Data(base64Encoded: tagB64),
        let nonceCount = Optional(nonce.count), nonceCount == nonceLength,
        tag.count == tagLength
      else {
        throw NSError(domain: "ERR_DECRYPT", code: 0)
      }
      let isFinal = chunk["isFinal"] as? Bool ?? false
      var chunkAad = associatedData
      var indexLE = UInt32(expected).littleEndian
      var sizeLE = UInt32(originalSize).littleEndian
      chunkAad.append(Data(bytes: &indexLE, count: 4))
      chunkAad.append(Data(bytes: &sizeLE, count: 4))
      chunkAad.append(contentsOf: [isFinal ? UInt8(1) : 0])
      let piece = try openAes(
        keyBytes: keyBytes,
        ciphertext: ciphertext,
        nonce: nonce,
        tag: tag,
        associatedData: chunkAad
      )
      if piece.count != originalSize {
        throw NSError(domain: "ERR_DECRYPT", code: 0)
      }
      plaintext.append(piece)
    }
    return plaintext
  }
}
