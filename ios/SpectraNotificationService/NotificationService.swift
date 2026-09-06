/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import UserNotifications

final class NotificationService: UNNotificationServiceExtension {
  private var contentHandler: ((UNNotificationContent) -> Void)?
  private var bestAttemptContent: UNMutableNotificationContent?
  private var dataTask: URLSessionDataTask?

  override func didReceive(
    _ request: UNNotificationRequest,
    withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
  ) {
    self.contentHandler = contentHandler
    bestAttemptContent = request.content.mutableCopy() as? UNMutableNotificationContent
    prefetch(userInfo: request.content.userInfo) {
      contentHandler(self.bestAttemptContent ?? request.content)
    }
  }

  override func serviceExtensionTimeWillExpire() {
    dataTask?.cancel()
    if let contentHandler, let bestAttemptContent {
      contentHandler(bestAttemptContent)
    }
  }

  private func prefetch(userInfo: [AnyHashable: Any], completion: @escaping () -> Void) {
    guard let session = SealedPrefetchStore.readSession(),
          SealedPrefetchStore.matchesScope(session, userInfo: userInfo)
    else {
      completion()
      return
    }

    guard let url = SealedPrefetchStore.messagesURL(session: session) else {
      completion()
      return
    }
    var request = URLRequest(url: url)
    request.httpMethod = "GET"
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
    request.setValue("ios", forHTTPHeaderField: "X-Spectra-Client-Platform")
    if session.appVersion.range(of: #"^\d+\.\d+\.\d+$"#, options: .regularExpression) != nil {
      request.setValue(session.appVersion, forHTTPHeaderField: "X-Spectra-App-Version")
    }
    request.timeoutInterval = 12

    let config = URLSessionConfiguration.ephemeral
    config.timeoutIntervalForRequest = 12
    config.timeoutIntervalForResource = 12
    config.waitsForConnectivity = false
    let urlSession = URLSession(configuration: config)
    dataTask = urlSession.dataTask(with: request) { data, response, _ in
      defer { completion() }
      guard let data,
            data.count <= SealedPrefetchStore.maxResponseBytes,
            let http = response as? HTTPURLResponse,
            (200...299).contains(http.statusCode),
            let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let messages = payload["messages"] as? [[String: Any]]
      else {
        return
      }
      SealedPrefetchStore.mergeRows(messages, walletAddress: session.walletAddress)
    }
    dataTask?.resume()
  }
}
