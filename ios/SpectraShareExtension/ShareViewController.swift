/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import UIKit
import UniformTypeIdentifiers
import CryptoKit

private enum ShareExtensionError: Error {
  case appGroupUnavailable
  case noSupportedItems
  case payloadTooLarge
  case manifestWriteFailed
}

private struct ManifestItem: Codable {
  let id: String
  let kind: String
  let typeIdentifier: String
  let fileName: String?
  let mimeType: String?
  let fileUri: String?
  let fileSize: Int64?
  let digest: String?
  let text: String?
  let url: String?
}

private struct ShareManifest: Codable {
  let schemaVersion: Int
  let id: String
  let source: String
  let createdAt: Int64
  let items: [ManifestItem]
}

final class ShareViewController: UIViewController {
  private let appGroupIdentifier = "group.org.spectramozaga.exo"
  private let maxItemCount = 10
  private let maxSingleFileBytes: Int64 = 100 * 1024 * 1024
  private let maxTotalFileBytes: Int64 = 250 * 1024 * 1024
  private let maxTextBytes = 100 * 1024

  private var didStart = false
  private let statusLabel = UILabel()
  private let activityIndicator = UIActivityIndicatorView(style: .medium)

  override func loadView() {
    let root = UIView()
    root.backgroundColor = UIColor.systemBackground

    let titleLabel = UILabel()
    titleLabel.text = NSLocalizedString(
      "share_extension.title",
      tableName: "Localizable",
      bundle: Bundle.main,
      value: "Share to Spectra",
      comment: "Title shown at the top of the Spectra share extension."
    )
    titleLabel.font = .preferredFont(forTextStyle: .headline)
    titleLabel.textAlignment = .center

    statusLabel.text = NSLocalizedString(
      "share_extension.preparing_private_handoff",
      tableName: "Localizable",
      bundle: Bundle.main,
      value: "Preparing private handoff...",
      comment: "Status shown while the share extension prepares content for Spectra."
    )
    statusLabel.font = .preferredFont(forTextStyle: .subheadline)
    statusLabel.textColor = UIColor.secondaryLabel
    statusLabel.textAlignment = .center
    statusLabel.numberOfLines = 0

    activityIndicator.startAnimating()

    let stack = UIStackView(arrangedSubviews: [titleLabel, activityIndicator, statusLabel])
    stack.axis = .vertical
    stack.alignment = .center
    stack.spacing = 12
    stack.translatesAutoresizingMaskIntoConstraints = false

    root.addSubview(stack)
    NSLayoutConstraint.activate([
      stack.leadingAnchor.constraint(equalTo: root.leadingAnchor, constant: 24),
      stack.trailingAnchor.constraint(equalTo: root.trailingAnchor, constant: -24),
      stack.centerYAnchor.constraint(equalTo: root.centerYAnchor),
    ])

    view = root
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)

    guard !didStart else { return }
    didStart = true

    collectSharedItems { [weak self] result in
      DispatchQueue.main.async {
        switch result {
        case .success(let manifestURL):
          self?.openHostApp(manifestURL: manifestURL)
        case .failure:
          self?.statusLabel.text = NSLocalizedString(
            "share_extension.import_failed",
            tableName: "Localizable",
            bundle: Bundle.main,
            value: "Spectra could not import this item.",
            comment: "Error shown when Spectra cannot import shared content."
          )
          self?.activityIndicator.stopAnimating()
          self?.extensionContext?.cancelRequest(withError: ShareExtensionError.noSupportedItems)
        }
      }
    }
  }

  private func collectSharedItems(completion: @escaping (Result<URL, Error>) -> Void) {
    guard let containerURL = FileManager.default.containerURL(
      forSecurityApplicationGroupIdentifier: appGroupIdentifier
    ) else {
      completion(.failure(ShareExtensionError.appGroupUnavailable))
      return
    }

    let manifestId = UUID().uuidString.lowercased()
    let payloadDirectory = containerURL
      .appendingPathComponent("SpectraShare", isDirectory: true)
      .appendingPathComponent(manifestId, isDirectory: true)

    do {
      try FileManager.default.createDirectory(
        at: payloadDirectory,
        withIntermediateDirectories: true,
        attributes: [.protectionKey: FileProtectionType.complete]
      )
    } catch {
      completion(.failure(error))
      return
    }

    let providers = inputProviders().prefix(maxItemCount)
    guard !providers.isEmpty else {
      completion(.failure(ShareExtensionError.noSupportedItems))
      return
    }

    let providerList = Array(providers)
    func finish(_ manifestItems: [ManifestItem]) {
      guard !manifestItems.isEmpty else {
        try? FileManager.default.removeItem(at: payloadDirectory)
        completion(.failure(ShareExtensionError.noSupportedItems))
        return
      }
      let manifest = ShareManifest(
        schemaVersion: 2,
        id: manifestId,
        source: "ios-share-extension",
        createdAt: Int64(Date().timeIntervalSince1970 * 1000),
        items: manifestItems.sorted { $0.id < $1.id }
      )
      let manifestURL = payloadDirectory.appendingPathComponent("manifest.json")

      do {
        let data = try JSONEncoder().encode(manifest)
        try data.write(to: manifestURL, options: [.atomic, .completeFileProtection])
        completion(.success(manifestURL))
      } catch {
        try? FileManager.default.removeItem(at: payloadDirectory)
        completion(.failure(ShareExtensionError.manifestWriteFailed))
      }
    }

    func processProvider(_ index: Int, items: [ManifestItem], totalFileBytes: Int64) {
      guard index < providerList.count else {
        finish(items)
        return
      }

      loadSupportedItem(
        from: providerList[index],
        index: index,
        payloadDirectory: payloadDirectory,
        remainingFileBytes: maxTotalFileBytes - totalFileBytes
      ) { result in
        switch result {
        case .success(let item):
          processProvider(
            index + 1,
            items: items + [item],
            totalFileBytes: totalFileBytes + (item.fileSize ?? 0)
          )
        case .failure(let error):
          if let shareError = error as? ShareExtensionError,
             case .payloadTooLarge = shareError {
            try? FileManager.default.removeItem(at: payloadDirectory)
            completion(.failure(error))
          } else {
            processProvider(index + 1, items: items, totalFileBytes: totalFileBytes)
          }
        }
      }
    }

    processProvider(0, items: [], totalFileBytes: 0)
  }

  private func inputProviders() -> [NSItemProvider] {
    let extensionItems = extensionContext?.inputItems.compactMap { $0 as? NSExtensionItem } ?? []
    return extensionItems.flatMap { $0.attachments ?? [] }
  }

  private func loadSupportedItem(
    from provider: NSItemProvider,
    index: Int,
    payloadDirectory: URL,
    remainingFileBytes: Int64,
    completion: @escaping (Result<ManifestItem, Error>) -> Void
  ) {
    if provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) {
      loadFileURLItem(
        from: provider,
        index: index,
        payloadDirectory: payloadDirectory,
        remainingFileBytes: remainingFileBytes,
        completion: completion
      )
      return
    }

    let fileTypes: [(UTType, String)] = [
      (.image, "image"),
      (.movie, "video"),
      (.audio, "audio"),
      (.pdf, "document"),
      (.data, "document"),
    ]

    if let match = fileTypes.first(where: { provider.hasItemConformingToTypeIdentifier($0.0.identifier) }) {
      loadFileRepresentation(
        from: provider,
        typeIdentifier: match.0.identifier,
        kind: match.1,
        index: index,
        payloadDirectory: payloadDirectory,
        remainingFileBytes: remainingFileBytes,
        completion: completion
      )
      return
    }

    if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
      loadTextLikeItem(from: provider, typeIdentifier: UTType.url.identifier, kind: "url", index: index, completion: completion)
      return
    }

    if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
      loadTextLikeItem(from: provider, typeIdentifier: UTType.plainText.identifier, kind: "text", index: index, completion: completion)
      return
    }

    completion(.failure(ShareExtensionError.noSupportedItems))
  }

  private func loadFileURLItem(
    from provider: NSItemProvider,
    index: Int,
    payloadDirectory: URL,
    remainingFileBytes: Int64,
    completion: @escaping (Result<ManifestItem, Error>) -> Void
  ) {
    provider.loadItem(forTypeIdentifier: UTType.fileURL.identifier, options: nil) { [weak self] item, error in
      if let error = error {
        completion(.failure(error))
        return
      }

      guard let self, let sourceURL = item as? URL else {
        completion(.failure(ShareExtensionError.noSupportedItems))
        return
      }

      completion(self.copySharedFile(
        sourceURL,
        kind: self.kindForFile(sourceURL),
        typeIdentifier: UTType.fileURL.identifier,
        index: index,
        payloadDirectory: payloadDirectory,
        maxAllowedBytes: remainingFileBytes
      ))
    }
  }

  private func loadFileRepresentation(
    from provider: NSItemProvider,
    typeIdentifier: String,
    kind: String,
    index: Int,
    payloadDirectory: URL,
    remainingFileBytes: Int64,
    completion: @escaping (Result<ManifestItem, Error>) -> Void
  ) {
    provider.loadFileRepresentation(forTypeIdentifier: typeIdentifier) { [weak self] sourceURL, error in
      if let error = error {
        completion(.failure(error))
        return
      }

      guard let self, let sourceURL else {
        completion(.failure(ShareExtensionError.noSupportedItems))
        return
      }

      completion(self.copySharedFile(
        sourceURL,
        kind: kind,
        typeIdentifier: typeIdentifier,
        index: index,
        payloadDirectory: payloadDirectory,
        maxAllowedBytes: remainingFileBytes
      ))
    }
  }

  private func loadTextLikeItem(
    from provider: NSItemProvider,
    typeIdentifier: String,
    kind: String,
    index: Int,
    completion: @escaping (Result<ManifestItem, Error>) -> Void
  ) {
    provider.loadItem(forTypeIdentifier: typeIdentifier, options: nil) { [weak self] item, error in
      if let error = error {
        completion(.failure(error))
        return
      }

      let value: String?
      if let url = item as? URL {
        value = url.absoluteString
      } else if let string = item as? String {
        value = string
      } else if let data = item as? Data {
        value = String(data: data, encoding: .utf8)
      } else {
        value = nil
      }

      guard let self, let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else {
        completion(.failure(ShareExtensionError.noSupportedItems))
        return
      }

      let textDataLength = trimmed.data(using: .utf8)?.count ?? 0
      guard textDataLength <= self.maxTextBytes else {
        completion(.failure(ShareExtensionError.payloadTooLarge))
        return
      }

      completion(.success(ManifestItem(
        id: "item-\(index)",
        kind: kind,
        typeIdentifier: typeIdentifier,
        fileName: nil,
        mimeType: kind == "url" ? "text/uri-list" : "text/plain",
        fileUri: nil,
        fileSize: nil,
        digest: nil,
        text: kind == "text" ? trimmed : nil,
        url: kind == "url" ? trimmed : nil
      )))
    }
  }

  private func copySharedFile(
    _ sourceURL: URL,
    kind: String,
    typeIdentifier: String,
    index: Int,
    payloadDirectory: URL,
    maxAllowedBytes: Int64
  ) -> Result<ManifestItem, Error> {
    do {
      let didAccess = sourceURL.startAccessingSecurityScopedResource()
      defer {
        if didAccess {
          sourceURL.stopAccessingSecurityScopedResource()
        }
      }

      let sourceValues = try sourceURL.resourceValues(forKeys: [
        .fileSizeKey,
        .isRegularFileKey,
      ])
      guard sourceValues.isRegularFile == true, let sourceSize = sourceValues.fileSize else {
        return .failure(ShareExtensionError.noSupportedItems)
      }
      let checkedSourceSize = Int64(sourceSize)
      guard checkedSourceSize > 0,
            checkedSourceSize <= maxSingleFileBytes,
            checkedSourceSize <= maxAllowedBytes else {
        return .failure(ShareExtensionError.payloadTooLarge)
      }

      let originalName = sourceURL.lastPathComponent.isEmpty ? "shared-\(index)" : sourceURL.lastPathComponent
      let fileName = sanitizedFileName(originalName, fallback: "shared-\(index)")
      let destinationURL = payloadDirectory.appendingPathComponent("\(index)-\(fileName)")
      let stagingURL = payloadDirectory.appendingPathComponent(".\(UUID().uuidString).partial")
      defer {
        try? FileManager.default.removeItem(at: stagingURL)
      }

      if FileManager.default.fileExists(atPath: destinationURL.path) {
        try FileManager.default.removeItem(at: destinationURL)
      }
      try FileManager.default.copyItem(at: sourceURL, to: stagingURL)
      try FileManager.default.setAttributes(
        [.protectionKey: FileProtectionType.complete],
        ofItemAtPath: stagingURL.path
      )

      let attributes = try FileManager.default.attributesOfItem(atPath: stagingURL.path)
      let fileSize = (attributes[.size] as? NSNumber)?.int64Value ?? 0
      guard fileSize == checkedSourceSize else {
        return .failure(ShareExtensionError.manifestWriteFailed)
      }
      let digest = try sha256Hex(of: stagingURL)
      try FileManager.default.moveItem(at: stagingURL, to: destinationURL)

      let contentType = try? destinationURL.resourceValues(forKeys: [.contentTypeKey]).contentType
      let mimeType = contentType?.preferredMIMEType ?? UTType(filenameExtension: destinationURL.pathExtension)?.preferredMIMEType

      return .success(ManifestItem(
        id: "item-\(index)",
        kind: kind,
        typeIdentifier: contentType?.identifier ?? typeIdentifier,
        fileName: fileName,
        mimeType: mimeType ?? "application/octet-stream",
        fileUri: destinationURL.absoluteString,
        fileSize: fileSize,
        digest: digest,
        text: nil,
        url: nil
      ))
    } catch {
      return .failure(error)
    }
  }

  private func sha256Hex(of url: URL) throws -> String {
    let handle = try FileHandle(forReadingFrom: url)
    defer { try? handle.close() }

    var hasher = SHA256()
    while true {
      let chunk = try handle.read(upToCount: 1024 * 1024) ?? Data()
      if chunk.isEmpty { break }
      hasher.update(data: chunk)
    }
    return hasher.finalize().map { String(format: "%02x", $0) }.joined()
  }

  private func kindForFile(_ url: URL) -> String {
    guard let type = UTType(filenameExtension: url.pathExtension) else {
      return "document"
    }

    if type.conforms(to: .image) { return "image" }
    if type.conforms(to: .movie) { return "video" }
    if type.conforms(to: .audio) { return "audio" }
    return "document"
  }

  private func sanitizedFileName(_ value: String, fallback: String) -> String {
    let invalid = CharacterSet(charactersIn: "/\\?%*|\"<>:")
      .union(.newlines)
      .union(.controlCharacters)
    let parts = value.components(separatedBy: invalid).filter { !$0.isEmpty }
    let sanitized = parts.joined(separator: "_").trimmingCharacters(in: .whitespacesAndNewlines)
    return sanitized.isEmpty ? fallback : String(sanitized.prefix(120))
  }

  private func openHostApp(manifestURL: URL) {
    var components = URLComponents()
    components.scheme = "spectra"
    components.host = "share"
    components.path = "/import"
    components.queryItems = [
      URLQueryItem(name: "manifest", value: manifestURL.absoluteString),
    ]

    guard let url = components.url else {
      extensionContext?.cancelRequest(withError: ShareExtensionError.manifestWriteFailed)
      return
    }

    extensionContext?.open(url) { [weak self] _ in
      self?.extensionContext?.completeRequest(returningItems: nil)
    }
  }
}
