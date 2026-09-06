/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import Foundation

enum SealedPrefetchStore {
  static let appGroupIdentifier = "group.org.spectramozaga.exo"
  private static let directoryName = "sealed-prefetch"
  private static let sessionFileName = "session.json"
  private static let rowsFileName = "rows.json"
  private static let maxRows = 40
  private static let maxRowBytes = 512 * 1024
  private static let maxCacheBytes = 2 * 1024 * 1024
  static let maxResponseBytes = 2 * 1024 * 1024 + 64 * 1024
  private static let messageIdPattern = try! NSRegularExpression(pattern: "^msg_[A-Za-z0-9_-]{16,128}$")
  private static let mailboxPattern = try! NSRegularExpression(pattern: "^smbx[12]\\.[^\\s:]{8,250}$")
  private static let scopePattern = try! NSRegularExpression(pattern: "^nsc1\\.[0-9a-f]{32}$")

  struct Session: Codable {
    let v: Int
    let apiBaseUrl: String
    let accessToken: String
    let afterSequence: Int
    let walletAddress: String
    let notificationScopeId: String?
    let expiresAt: Double
    let appVersion: String
  }

  static func writeSessionJSON(_ json: String) throws {
    guard let data = json.data(using: .utf8) else {
      throw StoreError.invalidSession
    }
    let session = try JSONDecoder().decode(Session.self, from: data)
    guard isValid(session) else {
      throw StoreError.invalidSession
    }
    try writeProtected(data, to: try directoryURL().appendingPathComponent(sessionFileName))
  }

  static func readSession() -> Session? {
    guard let url = try? sessionURL(),
          let data = try? Data(contentsOf: url),
          let session = try? JSONDecoder().decode(Session.self, from: data)
    else {
      return nil
    }
    if !isValid(session) { return nil }
    return session
  }

  private static func isValid(_ session: Session) -> Bool {
    if session.v != 1 || session.accessToken.isEmpty { return false }
    if session.expiresAt <= Date().timeIntervalSince1970 * 1000 { return false }
    if !(session.apiBaseUrl.hasPrefix("https://") || session.apiBaseUrl.hasPrefix("http://localhost")) {
      return false
    }
    if let scope = session.notificationScopeId, !matches(scopePattern, scope) {
      return false
    }
    return true
  }

  static func clearSession() {
    if let url = try? sessionURL() {
      try? FileManager.default.removeItem(at: url)
    }
    if let url = try? rowsURL() {
      try? FileManager.default.removeItem(at: url)
    }
  }

  static func takeRowsJSON(walletAddress: String) -> String? {
    guard let url = try? rowsURL(),
          let data = try? Data(contentsOf: url)
    else {
      return nil
    }
    guard let parsed = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let storedWallet = parsed["walletAddress"] as? String,
          storedWallet == walletAddress
    else {
      return nil
    }
    try? FileManager.default.removeItem(at: url)
    return String(data: data, encoding: .utf8)
  }

  static func mergeRows(_ incoming: [[String: Any]], walletAddress: String) {
    guard let url = try? rowsURL() else { return }
    var existing: [[String: Any]] = []
    if let data = try? Data(contentsOf: url),
       let parsed = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
       let storedWallet = parsed["walletAddress"] as? String,
       storedWallet == walletAddress,
       let storedRows = parsed["rows"] as? [[String: Any]]
    {
      existing = storedRows
    }
    var byId: [String: [String: Any]] = [:]
    for row in existing {
      if let id = row["id"] as? String { byId[id] = row }
    }
    for row in incoming {
      guard let sanitized = sanitizeRow(row) else { continue }
      if let id = sanitized["id"] as? String { byId[id] = sanitized }
    }
    let merged = byId.values.sorted { lhs, rhs in
      intValue(lhs["serverSequence"]) < intValue(rhs["serverSequence"])
    }
    var bounded: [[String: Any]] = []
    var total = 0
    for row in merged.reversed() {
      guard JSONSerialization.isValidJSONObject(row),
            let data = try? JSONSerialization.data(withJSONObject: row)
      else { continue }
      if data.count > maxRowBytes { continue }
      if total + data.count > maxCacheBytes { continue }
      total += data.count
      bounded.insert(row, at: 0)
      if bounded.count >= maxRows { break }
    }
    let payload: [String: Any] = ["walletAddress": walletAddress, "rows": bounded]
    guard JSONSerialization.isValidJSONObject(payload),
          let data = try? JSONSerialization.data(withJSONObject: payload)
    else { return }
    try? writeProtected(data, to: url)
  }

  static func matchesScope(_ session: Session, userInfo: [AnyHashable: Any]) -> Bool {
    guard let expected = session.notificationScopeId, matches(scopePattern, expected) else {
      return true
    }
    let incoming = extractScopeId(userInfo)
    return incoming == nil || incoming == expected
  }

  static func messagesURL(session: Session) -> URL? {
    let base = session.apiBaseUrl.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    guard let url = URL(string: "\(base)/v1/chat/sealed/messages"),
          url.scheme == "https" || url.host == "localhost"
    else {
      return nil
    }
    var components = URLComponents(url: url, resolvingAgainstBaseURL: false)
    components?.queryItems = [
      URLQueryItem(name: "deliveryClass", value: "message"),
      URLQueryItem(name: "afterSequence", value: String(max(session.afterSequence, 0))),
      URLQueryItem(name: "limit", value: "10"),
    ]
    return components?.url
  }

  private static func extractScopeId(_ userInfo: [AnyHashable: Any]) -> String? {
    if let scope = userInfo["notificationScopeId"] as? String, matches(scopePattern, scope) {
      return scope
    }
    if let body = userInfo["body"] as? [String: Any],
       let scope = body["notificationScopeId"] as? String,
       matches(scopePattern, scope)
    {
      return scope
    }
    return nil
  }

  private static func sanitizeRow(_ row: [String: Any]) -> [String: Any]? {
    guard let id = row["id"] as? String, matches(messageIdPattern, id) else { return nil }
    guard let mailbox = row["recipientMailboxToken"] as? String, matches(mailboxPattern, mailbox) else {
      return nil
    }
    guard row["deliveryClass"] as? String == "message" else { return nil }
    guard let envelope = row["sealedEnvelope"] as? [String: Any],
          envelope["version"] != nil,
          envelope["type"] != nil,
          let ciphertext = envelope["ciphertext"] as? String,
          !ciphertext.isEmpty
    else {
      return nil
    }
    let sequence = intValue(row["serverSequence"])
    guard sequence > 0 else { return nil }
    let status = row["status"] as? String
    guard status == "pending" || status == "delivered" || status == "read" else { return nil }
    var sanitized: [String: Any] = [
      "id": id,
      "recipientMailboxToken": mailbox,
      "deliveryClass": "message",
      "sealedEnvelope": [
        "version": envelope["version"] as Any,
        "type": envelope["type"] as Any,
        "ciphertext": ciphertext,
      ],
      "status": status as Any,
      "serverSequence": sequence,
      "createdAt": intValue(row["createdAt"]),
      "expiresAt": intValue(row["expiresAt"]),
    ]
    if let deliveryToken = row["deliveryToken"] as? String, !deliveryToken.isEmpty {
      sanitized["deliveryToken"] = deliveryToken
    }
    if let deliveredAt = row["deliveredAt"], intValue(deliveredAt) > 0 {
      sanitized["deliveredAt"] = intValue(deliveredAt)
    }
    return sanitized
  }

  private static func intValue(_ value: Any?) -> Int {
    if let number = value as? Int { return number }
    if let number = value as? NSNumber { return number.intValue }
    return 0
  }

  private static func matches(_ regex: NSRegularExpression, _ value: String) -> Bool {
    let range = NSRange(value.startIndex..<value.endIndex, in: value)
    return regex.firstMatch(in: value, options: [], range: range) != nil
  }

  private static func directoryURL() throws -> URL {
    guard let container = FileManager.default.containerURL(
      forSecurityApplicationGroupIdentifier: appGroupIdentifier
    ) else {
      throw StoreError.appGroupUnavailable
    }
    let directory = container.appendingPathComponent(directoryName, isDirectory: true)
    if !FileManager.default.fileExists(atPath: directory.path) {
      try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }
    return directory
  }

  private static func sessionURL() throws -> URL {
    try directoryURL().appendingPathComponent(sessionFileName)
  }

  private static func rowsURL() throws -> URL {
    try directoryURL().appendingPathComponent(rowsFileName)
  }

  private static func writeProtected(_ data: Data, to url: URL) throws {
    try data.write(to: url, options: [.atomic, .completeFileProtection])
  }

  enum StoreError: Error {
    case appGroupUnavailable
    case invalidSession
  }
}
